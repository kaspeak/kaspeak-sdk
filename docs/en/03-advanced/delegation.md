# Transaction Delegation

> **Client-Server scheme** allows sending Kaspeak messages without funding the client's wallet with KAS.  
> The client encrypts and signs the payload, and the server creates, funds, and broadcasts the transaction.

---

## Two-way pipeline

1. **Client** encrypts the message and sends **its length** to the server.
2. **Server** creates a suitably sized transaction and returns an `outpointIds` string to the client.
3. **Client** forms the payload (encrypted message + Schnorr signature) and sends it back to the server.
4. **Server** embeds the payload into the transaction, signs inputs with its key, pays the fee, and publishes the transaction on Kaspa.

---

- **Encryption and signing** are handled by the client; the private key *never* leaves the device.  
- **Transaction creation** and fee payments are handled by the server.  
- **Data security** remains intact: the payload is already encrypted with XChaCha20-Poly1305.  
- **Metadata** (sender's address, identifier) become visible to the server.

---

## Complete Example

> This scheme lets the client form its encrypted payload and sign it using its own private key, while the server publishes the payload to the network. The client doesn't even need to connect directly to the node. The encrypted message is addressed to the server's public key, enabling the server to easily read it from the blockdag via its worker.  
> This example doesn't implement actual client-server data exchange, but clearly illustrates the roles. Real-world apps require a full client-server interaction.

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
    await server_sdk.connect();
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

## Why this doesn't compromise data integrity?

- **Public key** (33 bytes) is stored openly in `Payload`, but also included in the Schnorr signature.
  This prevents sender substitution even with delegation.

- **Private key** is never transmitted; only the payload hash (`marker ∥ prefix ∥ … ∥ outIds`) is signed.
  The server sees only the final signature and can't misuse it.

Thus, delegation preserves cryptographic data integrity guarantees while offloading financial costs from the client.

---

## Privacy trade-offs

- Server **knows** whom you serve and when—IP, address, and identifier become openly visible.
- **Conversation anonymity** is compromised: the server can correlate your activity by IP, session, and timing.

> Only use delegation if lowering entry barriers is more critical than maintaining complete privacy.
