# Делегация транзакций

> **Схема «клиент > сервер»** позволяет отправлять сообщения Kaspeak без пополнения
> KAS-кошелька конечного пользователя.  
> Клиент шифрует и подписывает полезную нагрузку, а сервер формирует, оплачивает
> и рассылает транзакцию в сеть.

---

## Двухсторонний конвейер

1. **Клиент** шифрует сообщение и передаёт **его длину** серверу.
2. **Сервер** собирает транзакцию подходящего размера и отдаёт клиенту строку `outpointIds`.
3. **Клиент** формирует Payload (зашифрованное сообщение + Schnorr-подпись) и отправляет его серверу.
4. **Сервер** вставляет Payload в транзакцию, подписывает входы своим ключом, оплачивает комиссию и публикует транзакцию в сеть Kaspa.

---

- **Шифрование и подпись** выполняет клиент; приватный ключ *не* покидает устройство.  
- **Формирование транзакции** и оплата комиссии лежит на сервере.  
- **Безопасность данных** не страдает: тело сообщения уже зашифровано XChaCha20-Poly1305.  
- **Метаданные** (адрес отправителя, идентификатор) становятся видимыми серверу.

---

## Полный пример

> В данной схеме, клиент формирует свой собственный зашифрованный пейлоад и подписывает его своим собственным приватным ключом, а сервер в это время занимается трансляцией пейлоада в сеть. Чтобы это сделать, клиенту даже не нужно устанавливать соединение с нодой. Зашифрованное сообщение адресовано самому серверу по его публичному ключу, чтобы он мог наглядно прочитать его из блокдага в своем воркере. В реальном приложении, Вы, конечно же, не должны шифровать свое сообщение публичным ключом сервера.  
> Данный пример не использует реальный обмен данными между клиентом и сервером, но дает полное представление о том, кто и какие роли в данной схеме выполняет. В реальном приложении Вам придется построить полноценное клиент-серверное взаимодействие.

```js
const { Kaspeak, BaseMessage, SecretIdentifier, bytesToHex } = require("kaspeak-sdk");

const SERVER_PRIV_KEY = 6;
const CLIENT_PRIV_KEY = 1337;
const PREFIX = "TEST";

class SecretNote extends BaseMessage {
    static requiresEncryption = true;
    static messageType = 101;

    constructor(text = "", header) {
        super(header);
        this.text = text;
    }

    toPlainObject() {
        return { t: this.text };
    }

    fromPlainObject(obj) {
        this.text = obj.t ?? "";
    }
}

async function main() {
    const server_sdk = await Kaspeak.create(SERVER_PRIV_KEY, PREFIX);
    await server_sdk.connect()
    console.log("Server pubkey", server_sdk.publicKey);

    server_sdk.registerMessage(SecretNote, async (header, rawData) => {
        console.log("Peer public key:", bytesToHex(header.peer.publicKey));
        const sharedSecret = header.peer.sharedSecret;
        const decoded = await server_sdk.decode(header, rawData, sharedSecret);
        console.log("Result =>", decoded);
    });

    const client_sdk = await Kaspeak.create(CLIENT_PRIV_KEY, PREFIX);
    console.log("Client pubkey", client_sdk.publicKey);
    const msg = new SecretNote("Hello, SecretNote!");
    const conversationKey = client_sdk.deriveConversationKeys(server_sdk.publicKey);
    const encoded = await client_sdk.encode(msg, conversationKey.secret);

    const transaction = await server_sdk.createTransaction(encoded.length);
    const outpointIds = server_sdk.getOutpointIds(transaction);

    const identifier = SecretIdentifier.random();
    const rawPayload = await client_sdk.createPayload(
        outpointIds,
        SecretNote.messageType,
        identifier,
        encoded
    );

    await server_sdk.sendTransaction(transaction, rawPayload);
}

main();
```

---

## Почему это не ломает целостность данных?

* **Публичный ключ** (33 байта) хранится открыто в `Payload`, но
  *дополнительно* входит в Schnorr-подпись.
  Это защищает от подмены отправителя даже при делегировании.

* **Приватный ключ** никуда не передаётся; им подписывается только
  хеш-сообщение (`marker ∥ prefix ∥ … ∥ outIds`).
  Сервер видит лишь готовую подпись и не может ей злоупотребить.

Таким образом, делегирование сохраняет криптографические гарантии целостности, при этом снимая финансовую нагрузку с клиента.

---

## Компромиссы конфиденциальности

* Сервер **знает**, кого и когда вы обслуживаете — IP, адрес и идентификатор открываются ему в чистом виде.
* **Анонимность диалога** пропадает: сервер может коррелировать вашу активность по IP, сессии, времени.

> Используйте схему **только в обоснованных случаях**, когда важнее снизить барьер входа, чем сохранить полную приватность.