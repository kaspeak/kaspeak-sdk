# Шифрование сообщений

Kaspeak SDK использует совокупность хорошо-изученных криптографических примитивов, обеспечивая конфиденциальность, целостность и компактность передаваемых данных.

```
ECDH > SHA-256 > SHA-256 > XChaCha20-Poly1305
```

* **ECDH** — получение общего секрета между двумя участниками без передачи приватных данных.  
* **2 x SHA-256** — приведение точки ECDH к фиксированному 256-битному ключу.  
* **XChaCha20-Poly1305** — симметричное шифрование и аутентификация.  
* **CBOR + Zstandard** — сериализация объекта и последующая компрессия.

---

## Как использовать шифрование в приложении?

Kaspeak SDK автоматически управляет шифрованием и дешифрованием сообщений, если Ваш класс сообщения установлен с параметром `requiresEncryption = true`. Вам нужно лишь указать общий секретный ключ (общий секрет), который вычисляется с помощью публичного ключа получателя.

Типичный процесс включает:

* создание класса зашифрованного сообщения;
* получение общего секрета (ключа) через `sdk.deriveConversationKeys`;
* передачу этого ключа в методы `sdk.encode` и `sdk.decode`.

Ниже приведён полный пример.

### Полный пример

Создадим тип сообщения, который требует шифрования:

```js
const { Kaspeak, BaseMessage, SecretIdentifier } = require("kaspeak-sdk");

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

(async () => {
    const sdk = await Kaspeak.create(6, "TEST");
    await sdk.connect();

    sdk.registerMessage(SecretNote, async (h, raw) => {
        const secret = h.peer.sharedSecret;
        const note = await sdk.decode(h, raw, secret);
        console.log(note.text);
    });

    const conversationKeys = sdk.deriveConversationKeys(sdk.publicKey);
    const note = new SecretNote("I love Kaspa!");
    const body = await sdk.encode(note, conversationKeys.secret);
    const id = SecretIdentifier.random();
    const tx = await sdk.createTransaction(body.length);
    const ids = sdk.getOutpointIds(tx);
    const plHex = await sdk.createPayload(ids, SecretNote.messageType, id, body);
    await sdk.sendTransaction(tx, plHex);
})();
```
> Данный пример демонстрирует отправку зашифрованного сообщения самому себе.
> Если сообщение предназначается для кого-то другого, вставьте в `deriveConversationKeys` публичный ключ получателя.

### Как извлечь общий секрет для декодирования?

Общий секретный ключ формируется методом SDK `deriveConversationKeys`, принимающим публичный ключ другого участника:

```js
const { secret, chainKey } = sdk.deriveConversationKeys(peerPublicKey);
```

* `secret` — ключ шифрования, используемый для кодирования и декодирования сообщений.
* `chainKey` — дополнительный идентификатор, используемый для генерации уникальных точек сообщений.

### Дополнительный параметр в методах `encode` и `decode`

Методы `encode` и `decode` принимают второй необязательный аргумент — ключ шифрования:

```js
// Шифрование
const encryptedData = await sdk.encode(messageInstance, secret);

// Дешифрование
const messageInstance = await sdk.decode(header, encryptedData, secret);
```

Если ваш тип сообщения помечен флагом `requiresEncryption`, ключ шифрования **обязателен**. Если флаг не установлен, передача ключа не имеет эффекта и будет проигнорирована.

Таким образом, SDK автоматически обеспечивает корректное шифрование и расшифровку ваших сообщений.

---

## Как это работает внутри SDK?

### 1. Формирование симметричного ключа

```js
const sharedPoint = ecdh(privA, pubB) // Uint8Array (33 байта)
const secret = sha256(sha256(sharedPoint)) // 32-байтовый ключ
```

Ключ, вычисленный обеими сторонами, полностью идентичен.

---

### 2. Сериализация и сжатие

```js
const plain = message.toPlainObject()
const cbor = encode(plain) // CBOR
const packed = await compressZstd(cbor, 16) // уровень 16
```

*CBOR* даёт компактное бинарное представление;  
*Zstandard* дополнительно уменьшает размер полезной нагрузки.

---

### 3. Шифрование

```js
const nonce = randomBytes(24)
const box = new XChaCha20Poly1305(secret).seal(nonce, packed)
const payload = concatenate(nonce, box) // nonce ∥ ciphertext
```

При расшифровке неверный ключ или искажённые данные приводят к ошибке, что позволяет надёжно отбраковать чужой или повреждённый трафик.

---

### 4. Расшифровка

```js
const nonce = payload.slice(0, 24)
const box = payload.slice(24)
const clear = new XChaCha20Poly1305(secret).open(nonce, box)

const cbor = await decompressZstd(clear)
const obj = decode(cbor)
```

---

### 5. Подтверждение подлинности

Перед отправкой весь payload подписывается **Schnorr-подписью** автора на уровне SDK.   
Не отключая флаг `setSignatureVerificationEnabled`, Вы можете быть уверены в том, что сообщение действительно принадлежит отправителю.  
Любое изменение байтов приводит к отрицательному результату проверки на стороне SDK.