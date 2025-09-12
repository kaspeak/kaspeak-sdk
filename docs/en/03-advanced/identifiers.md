# Identifiers

> **Any entity can be expressed as a point on the secp256k1 curve.**  
> A chat, a user, a group, or a specific message—everything can become a public point if it’s convenient for us.

Using a point as an identifier provides several valuable capabilities:

* Any group, channel, or user can be represented as a unique point on the curve, allowing us to aggregate messages around the entity they belong to.  
* Anyone who created an entity can prove authorship, which at the cryptographic level enables a primitive form of management.  
  For example, a channel creator can publish messages by adding a signature using their scalar.  
  This way, any channel participant can be sure that what they read was indeed written by the true owner, not by an impersonator.

## Signing and Verification

### Identifier as an entity and ownership rights

`Identifier` — an abstract entity: a channel, a group, a topic, etc.  
Owning a `SecretIdentifier` means owning the rights to that entity: you can publish on its behalf and prove authorship.

---

### Signing arbitrary data

Any message can be signed with a `SecretIdentifier`, and verified using **either** a public `Identifier` **or** a `SecretIdentifier`.

```js
const { SecretIdentifier } = require("kaspeak-sdk");

const sid = SecretIdentifier.random();
const sig = await sid.sign("hello");
const ok1 = await sid.verify(sig, "hello");
```

```js
const { Identifier, SecretIdentifier } = require("kaspeak-sdk");

const sid = SecretIdentifier.random();
const id = Identifier.fromHex(sid.hex);
const sig = await sid.sign("hello");
const ok2 = await id.verify(sig, "hello");
```

---

### Signature Types

Kaspeak SDK supports two modes of message signing:

* `single` — signature using only the sender’s private key (default).
* `multi` — an aggregated signature from both the sender’s private key and a **secret identifier** (`SecretIdentifier`).

The signature mode is defined as a static field of the message class.

#### Selecting the signature mode for a message

```ts
import { BaseMessage, type SignatureType } from "kaspeak-sdk";

export class ChannelMessage extends BaseMessage {
	static messageType = 3;
	static signatureType: SignatureType = "multi";
}
```

#### Sending a message in multi-signature mode

> **SENDING** a message with a multi-signature is possible **only when passing a `SecretIdentifier`** into `sdk.createPayload` — its secret participates in the aggregated signature.
> For sending a message in `single` mode, you can pass either a regular `Identifier` or a `SecretIdentifier`.
> Never expose the secret identifier in plaintext.

```js
const { Kaspeak, SecretIdentifier } = require("kaspeak-sdk");

const sdk = await Kaspeak.create(6, "TEST");
await sdk.connectNode();

const msg = new ChannelMessage();
const body = await sdk.encode(msg);

const channel = SecretIdentifier.random();
const tx = await sdk.createTransaction(body.length);
const outIds = sdk.getOutpointIds(tx);

const plHex = await sdk.createPayload(outIds, ChannelMessage, channel, body);
const txid = await sdk.sendTransaction(tx, plHex);
```

#### Receiving

The SDK automatically detects the `signatureType` and verifies the aggregated signature.
The receiver does not need the secret identifier to verify it.
The SDK also enforces the required signature type for each registered message type.
You will not receive a message if its signature type doesn’t match the expected one.

```js
sdk.registerMessage(ChannelMessage, async (header, raw) => {
	const decoded = await sdk.decode(header, raw);
	console.log(header.signatureType);
});
```

---

You can use `Identifier` and `SecretIdentifier` as simple recurring identifiers, without engaging the more advanced cryptography described below. However, if you want to unlock the full potential of Kaspeak SDK, it is recommended to study the following section, which introduces a privacy-preserving element into the transparent blockdag.

## The Essence

Let’s assume we have some arbitrary “base point” `BasePoint`.  
Any subsequent object of the same nature is just `BasePoint · t`, where `t` is a **scalar multiplier** known to both parties.

* This yields a **tree** or **chain** of entities, without storing additional data.  
* An external observer only sees random-looking points, without understanding their semantics.

## Identifier Formula

An Identifier (*Identifier*) is a 33-byte compressed secp256k1 point, computed as:

`ID(i) = PK_A · (chainKey^i mod n), i ≥ 1`

* `PK_A` — author’s public key (can also be any other fixed point).
* `chainKey` — a 32-byte scalar shared between both parties.
* `i` — the sequential message number within the dialogue.
* `n` — the order of the secp256k1 curve.

### Creating the `chainKey`

```js
const { secret, chainKey } = sdk.deriveConversationKeys(peerPublicKey)
```

`secret` — the ECDH result.  
`chainKey = SHA-256(secret)` > `bigint` ( mod `n` ).

## Advancing the Identifier

| Operation       | Formula                        |
| --------------- | ------------------------------ |
| next (`+1`)     | `ID_(i+1) = ID_i · chainKey`   |
| previous (`-1`) | `ID_(i-1) = ID_i · chainKey⁻¹` |
| arbitrary `+k`  | `ID_(i+k) = ID_i · chainKey^k` |

All calculations are ordinary scalar multiplications of points.

```js
const id2 = Identifier.fromChainKey(chainKey, 2, sdk.publicKey) // first ID
const id3 = id1.next(chainKey)  // second (ID₁·k)
const id1 = id1.prev(chainKey)  // previous (ID₁·k⁻¹)
```

The `next/prev` methods use fast exponentiation under the hood.

## Security Properties

1. **Chain confidentiality.**  
   Without the `chainKey`, it’s impossible to distinguish `ID_1` from `ID_999`; all points look random.
2. **One pair — one chain.**  
   The `chainKey` is identically derived only for the pair A and B. A third party cannot “link” chains belonging to different participants.
3. **Untraceability.**  
   The “next / previous” algorithm works only with the secret multiplier, making it impossible to trace the history of messages, even with full archive access.

Thanks to this simple trick, combined with the strong encryption described in the [Message Encryption](../03-advanced/encryption.md) section, we can conduct truly secure and private communication within the Kaspa network.
Now, an attacker not only cannot decrypt our messages, but cannot even be sure whom you are talking to.
