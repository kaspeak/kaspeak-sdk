# Identifiers

> **Any entity can be represented as a point on the secp256k1 curve.**  
>  A chat, a user, a group, a specific message—everything can become a public point if it’s convenient for us.

In the context of using a point as an identifier, we gain several valuable capabilities:

* Any group, channel, or user can be represented as a unique point on the curve, which allows us to aggregate messages
around the entity to which they belong.  
* Anyone who created an entity can prove their authorship, which at the cryptographic level enables a primitive form of management.
For example, the channel creator can publish their messages, adding a signature using the scalar they possess.
This way, any channel participant can be sure that what they are reading was indeed written by the true owner, not by an attacker.

### Signing and Verification

Since every `Identifier` can serve as an x-only public key for a Schnorr signature, Kaspeak SDK by default supports the ability to sign messages and verify signatures directly within the `Identifier` object.

```js
const sid = SecretIdentifier.random()
const sig = await sid.sign("Hello, Kaspa")
const ok  = await sid.verify(sig, "Hello, Kaspa") // true
```

* `SecretIdentifier` stores a **private** scalar and can `sign`.
* A regular `Identifier` stores only the point and can `verify`.

You can use `Identifier` and `SecretIdentifier` as simple recurring identifiers, without involving the more advanced cryptography described below. However, if you want to unlock all the features of Kaspeak SDK, it is recommended to carefully read the following section, which brings a new element of privacy to the transparent blockDAG.

## The Essence

Suppose we have some arbitrary “base point” `BasePoint`.  
Any next object of the same nature is just `BasePoint · t`, where `t` is a **scalar multiplier** known to both parties.

* This gives us a **tree** or **chain** of entities, without storing any extra data.  
* An external observer sees only random-looking points, with no idea of their semantic meaning.

## Identifier Formula

An Identifier (*Identifier*) is a 33-byte compressed secp256k1 point, computed as:

`ID(i) = PK_A · (chainKey^i mod n), i ≥ 1`

* `PK_A` — author’s public key (can be any other fixed point as well).  
* `chainKey` — 32-byte scalar, shared between both parties;
* `i` — sequential message number within the dialogue.
* `n`— the order of the secp256k1 curve.

### Creating the `chainKey`

```js
const { secret, chainKey } = sdk.deriveConversationKeys(peerPublicKey)
```

`secret` — the ECDH result.  
`chainKey = SHA-256(secret)` > `bigint` ( mod `n` ).

## Advancing the Identifier

| Operation         | Formula                          |
|-------------------|----------------------------------|
| next (`+1`)       | `ID_(i+1) = ID_i · chainKey`     |
| previous (`-1`)   | `ID_(i-1) = ID_i · chainKey⁻¹`   |
| arbitrary `+k`    | `ID_(i+k) = ID_i · chainKey^k`   |

All calculations are ordinary scalar multiplications of points.

```js
const id2 = Identifier.fromChainKey(chainKey, 2, sdk.publicKey) // first ID
const id3 = id1.next(chainKey)  // second (ID₁·k)
const id1 = id1.prev(chainKey)  // previous (ID₁·k⁻¹)
```

The `next/prev` methods use fast exponentiation under the hood.

## Security Properties

1. **Chain confidentiality.**  
   Without the `chainKey`, it’s impossible to tell `ID_1` from `ID_999`; all points look random.
2. **One pair — one chain.**  
   The `chainKey` is identically derived only for the pair A and B. A third party cannot “link” chains belonging to different participants.
3. **Untraceability.**  
   The “next / previous” algorithm works only with the secret multiplier, so it’s impossible to track the history of messages, even with access to a full archive.

Thanks to this simple trick, combined with the powerful encryption described in the [Message Encryption](../03-advanced/encryption.md) section, we can conduct truly secure and private communication within the Kaspa network. Now, an attacker not only cannot decrypt our messages, but cannot even be sure whom you are talking to.
