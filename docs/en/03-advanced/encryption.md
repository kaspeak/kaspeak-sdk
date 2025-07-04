# Message Encryption

Kaspeak SDK uses a set of well-studied cryptographic primitives to provide confidentiality, integrity, and compactness for transmitted data.

```
ECDH > SHA-256 > SHA-256 > XChaCha20-Poly1305
```

* **ECDH** — obtaining a shared secret between two parties without transmitting any private data.
* **2 x SHA-256** — deriving a fixed 256-bit key from the ECDH point.
* **XChaCha20-Poly1305** — symmetric encryption and authentication.
* **CBOR + Zstandard** — object serialization and further compression.

---

## How to Use Encryption in Your Application?

Kaspeak SDK automatically handles encryption and decryption of messages if your message class has the parameter `requiresEncryption = true`.  
You only need to provide the shared secret key, which is calculated using the recipient’s public key.

A typical workflow includes:

* Creating a message class that requires encryption;
* Obtaining a shared secret (key) via `sdk.deriveConversationKeys`;
* Passing this key to the `sdk.encode` and `sdk.decode` methods.

Below is a full example.

### Full Example

Let’s create a message type that requires encryption:

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
> This example demonstrates sending an encrypted message to yourself.  
> If the message is intended for someone else, pass the recipient's public key to `deriveConversationKeys`.

### How to Derive the Shared Secret for Decoding?

The shared secret key is formed using the SDK method `deriveConversationKeys`, which takes the other party's public key:

```js
const { secret, chainKey } = sdk.deriveConversationKeys(peerPublicKey);
```

* `secret` — the encryption key used for encoding and decoding messages.
* `chainKey` — an additional identifier used for generating unique message points.

### Extra Argument for `encode` and `decode` Methods

The `encode` and `decode` methods take an optional second argument — the encryption key:

```js
// Encryption
const encryptedData = await sdk.encode(messageInstance, secret);

// Decryption
const messageInstance = await sdk.decode(header, encryptedData, secret);
```

If your message type is marked with the `requiresEncryption` flag, the encryption key is **required**.  
If the flag is not set, passing the key has no effect and will be ignored.

Thus, the SDK automatically ensures correct encryption and decryption of your messages.

---

## How Does It Work Inside the SDK?

### 1. Forming the Symmetric Key

```js
const sharedPoint = ecdh(privA, pubB) // Uint8Array (33 bytes)
const secret = sha256(sha256(sharedPoint)) // 32-byte key
```

The key computed by both parties will be completely identical.

---

### 2. Serialization and Compression

```js
const plain = message.toPlainObject()
const cbor = encode(plain) // CBOR
const packed = await compressZstd(cbor, 16) // level 16
```

*CBOR* provides a compact binary representation;  
*Zstandard* further reduces the payload size.

---

### 3. Encryption

```js
const nonce = randomBytes(24)
const box = new XChaCha20Poly1305(secret).seal(nonce, packed)
const payload = concatenate(nonce, box) // nonce ∥ ciphertext
```

If the wrong key is used or the data is corrupted, decryption will fail, which reliably filters out foreign or damaged traffic.

---

### 4. Decryption

```js
const nonce = payload.slice(0, 24)
const box = payload.slice(24)
const clear = new XChaCha20Poly1305(secret).open(nonce, box)

const cbor = await decompressZstd(clear)
const obj = decode(cbor)
```

---

### 5. Authenticity Verification

Before sending, the entire payload is signed with the author's **Schnorr signature** at the SDK level.  
As long as you do not disable the `setSignatureVerificationEnabled` flag, you can be sure that the message truly belongs to the sender.  
Any change in the bytes will result in a negative verification result on the SDK side.
