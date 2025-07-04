# Data Models

This page describes key data structures used in **Kaspeak SDK** for forming, sending, and receiving messages.

---

## Payload Structure

`Payload` is a data structure embedded in a Kaspa transaction. Each payload contains the actual data and necessary metadata.

Payload always starts with a unique `KSPK` marker (0x4B53454B).

### Payload Format

| Offset | Field      | Size | Description                            |
|--------|------------|------|----------------------------------------|
| 0      | marker     | 4    | Marker `KSPK` (SDK identifier)         |
| 4      | version    | 1    | Protocol version (currently = 1)       |
| 5      | prefix     | 4    | Application prefix (ASCII)             |
| 9      | type       | 2    | Message type (`messageType`)           |
| 11     | id         | 33   | Message identifier (`Identifier`)      |
| 44     | publicKey  | 33   | Sender's public key                    |
| 77     | signature  | 64   | Payload's Schnorr signature            |
| 141    | dataLen    | 2    | Data length (bytes)                    |
| 143    | data       | N    | Data (CBOR, compressed, possibly encrypted) |

---

## Peer Object

`Peer` describes the message sender and stores the public key and shared secret for encrypted messages.

### `Peer` fields:

| Field           | Type           | Description                              |
|-----------------|----------------|------------------------------------------|
| `address`       | `string`       | Sender's Kaspa address                   |
| `publicKey`     | `Uint8Array`   | Sender's public key                      |
| `signature`     | `Uint8Array`   | Schnorr signature of payload             |
| `isOwn`         | `boolean`      | `true` if the message sent by SDK itself |
| `sharedSecret`  | `Uint8Array`   | Shared secret (encryption key)           |
| `chainKey`      | `bigint`       | Scalar for generating message ID chains  |

---

## Identifier and SecretIdentifier

Cryptographic message identifiers ensure privacy and message linkage within conversations.

### Identifier

A compressed secp256k1 curve point uniquely identifying a message without revealing order externally.

| Field   | Type         | Description                                                      |
|---------|--------------|------------------------------------------------------------------|
| `hex`   | `string`     | Hex representation of a point (66 characters, compressed format) |
| `bytes` | `Uint8Array` | Binary representation of an identifier (33 bytes)                |

Methods:

- `fromHex(hex)` / `fromBytes(buf)`
- `fromChainKey(chainKey, i, PK)`
- `next(chainKey, n)` / `prev(chainKey, n)`
- `verify(sig, msg)`

---

### SecretIdentifier

Extends `Identifier` by adding a private key (scalar) for creating signatures.

| Field    | Type     | Description                         |
|----------|----------|-------------------------------------|
| `secret` | `bigint` | Private scalar for signing messages |


Optional methods:

- `sign(msg)` - creating a Schnorr signature of a message using a secret key.

> **Important:** `SecretIdentifier` cannot be created from public data. Use factories:
> 
> - `SecretIdentifier.fromSecret(secret)`
> - `SecretIdentifier.random()`

---

## MessageHeader Object

`MessageHeader` contains all necessary message information.

### `MessageHeader` fields:

| Field                 | Type         | Description                                              |
|-----------------------|--------------|----------------------------------------------------------|
| `txid`                | `string`     | Kaspa transaction ID                                     |
| `peer`                | `Peer`       | Sender information                                       |
| `prefix`              | `string`     | Application prefix                                       |
| `type`                | `number`     | Message type                                             |
| `identifier`          | `Identifier` | Message identifier                                       |
| `blockMeta.hash`      | `string`     | Hash of the block in which the transaction was confirmed |
| `blockMeta.timestamp` | `bigint`     | Confirmation time (Unix-time)                            |
| `blockMeta.daaScore`  | `bigint`     | Kaspa network complexity index (DAA)                     |
| `consensusHash`       | `string`     | Consensus hash (signed data)                             |
