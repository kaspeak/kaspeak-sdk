# Cryptography (Overview)

Kaspeak SDK uses only verified implementations.

| Algorithm           | Library                               | Purpose                     |
|---------------------|---------------------------------------|-----------------------------|
| secp256k1           | @noble/secp256k1 + custom wrapper     | Key generation, ECDH        |
| Schnorr             | kaspa-wasm                            | Transaction and payload signing |
| XChaCha20-Poly1305  | @stablelib/xchacha20poly1305          | Symmetric encryption        |
| SHA-256             | @noble/hashes                         | Hashing                     |
| Zstandard           | @bokuweb/zstd-wasm                    | Payload compression         |
| CBOR                | cborg                                 | Compact deterministic binary object representation |

Detailed schemes and algorithms are presented in "Advanced Topics":

* [Identifiers](../03-advanced/identifiers.md) — point chains, signatures, movements.  
* [Message Encryption](../03-advanced/encryption.md) — step-by-step pipeline: "object → CBOR → Zstd → XChaCha20".
