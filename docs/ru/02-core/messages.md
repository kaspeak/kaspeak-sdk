### Создание собственного сообщения

1. Создайте класс, расширяющий `BaseMessage`.
2. Объявите **два** статических свойства:  
    * `messageType` — целое `0…65535`, уникальное для каждого типа сообщения.
    * `requiresEncryption` — `true`, если данные должны шифроваться.
3. Реализуйте методы `toPlainObject()` и `fromPlainObject(obj)`, которые конвертируют экземпляр в обычный объект и обратно.
4. (Опционально) добавьте собственное поле-конструктор и другую логику.
5. Подключите тип к рантайму методом `sdk.registerMessage()`; туда же можно передать коллбек-функцию, которая будет вызываться при получении данных.

---

#### Пример незашифрованного сообщения

```js
const { Kaspeak, BaseMessage, SecretIdentifier } = require("kaspeak-sdk");

class MyMessage extends BaseMessage {
    static requiresEncryption = false;
    static messageType = 100;

    constructor(foo = "", bar = "", header) {
        super(header);
        this.foo = foo;
        this.bar = bar;
    }

    toPlainObject() {
        return { f: this.foo, b: this.bar };
    }

    fromPlainObject(obj) {
        this.foo = obj.f ?? "";
        this.bar = obj.b ?? "";
    }
}

(async () => {
    const sdk = await Kaspeak.create(6, "TEST");
    await sdk.connect();

    sdk.registerMessage(MyMessage, async (h, raw) => {
        const msg = await sdk.decode(h, raw);
        console.log(msg.foo, msg.bar);
    });

    const msg = new MyMessage("hello", "world");
    const body = await sdk.encode(msg);
    const id = SecretIdentifier.random();
    const tx = await sdk.createTransaction(body.length);
    const ids = sdk.getOutpointIds(tx);
    const plHex = await sdk.createPayload(ids, MyMessage.messageType, id, body);
    await sdk.sendTransaction(tx, plHex);
})();
```

---

#### Пример зашифрованного сообщения

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
---

### Рекомендации
* Сокращайте ключи в `toPlainObject` и `fromPlainObject`, чтобы уменьшить CBOR-пакет.
* При `requiresEncryption = true` передавайте ключ и в `encode`, и в `decode`.
