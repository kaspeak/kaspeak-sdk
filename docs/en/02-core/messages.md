# Creating Custom Messages

1. Create a class extending `BaseMessage`.
2. Declare **two** static properties:
    * `messageType` — integer `0…65535`, unique for each message type.
    * `requiresEncryption` — `true` if data should be encrypted.
3. Implement methods `toPlainObject()` and `fromPlainObject(obj)` to convert instances to plain objects and back.
4. (Optional) Add custom constructor fields and logic.
5. Connect the type to runtime via `sdk.registerMessage()`; a callback function can also be provided for incoming messages.

---

## Example of an Unencrypted Message

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

## Example of an Encrypted Message

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

> This example demonstrates sending an encrypted message to oneself.
> If the message is intended for another user, provide their public key to `deriveConversationKeys`.

---

## Recommendations
* Shorten keys in `toPlainObject` and `fromPlainObject` to reduce the CBOR payload size.
* When `requiresEncryption = true`, always provide the encryption key to `encode` and `decode`.
