# Kaspeak SDK

This page provides a concise guide to the main methods and features of **Kaspeak SDK**. Detailed data formats and cryptography schemes are described in corresponding documentation sections.

This is a **practical guide to using the SDK**.

---

## Quick Start

Initialize the SDK:

```js
import { Kaspeak, randomBytes } from "kaspeak-sdk";

const sdk = await Kaspeak.create(randomBytes(32), "CHAT", "testnet-10");
await sdk.connectNode();
```

### `create(privateKey, prefix, networkId?)` Method Parameters

* **`privateKey`** — private key for the address, represented as `bigint`, `number`, `Uint8Array`, or hex-string.
* **`prefix`** — unique ASCII prefix for your application, up to 4 characters. This prevents messages from different apps from overlapping.
* **`networkId`** *(optional)* — `"mainnet"`, `"testnet-10"` (default).

After calling `create()`, the SDK is fully initialized and ready to connect.

### `connectNode(url?)` Method Parameters

* **`url`** *(optional)* — URL to connect to a specific Kaspa node. If not specified, the SDK will automatically select a node.

---

## Event Subscription and Error Handling

```js
sdk.on("message", async ({ header, data }) => {
    /* handle incoming messages */
});

sdk.on("error", console.error);
```

| Event        | Data                     |
| ------------ | ------------------------ |
| `message`    | `{ header, data }`       |
| `balance`    | `{ balance, utxoCount }` |
| `node-connect`    | `void`                   |
| `node-disconnect` | `void`                   |
| `error`      | `string`                 |

* **`message`** fires for every incoming payload, even if its type is not registered.
* **`balance`** is triggered on any balance change for the SDK address.
* **`node-connect`** is called immediately after successfully establishing an RPC connection to the Kaspa network.
* **`node-disconnect`** is triggered when the current RPC connection is closed.
* **`error`** is a stub for future functionality.

---

## Working with Custom Message Types

To create your own message types:

```js
class ChatMessage extends BaseMessage {
    static messageType = 1337; // unique message type code
    static requiresEncryption = true; // whether encryption is required

    constructor(text = "", header) {
        super(header);
        this.text = text;
    }

    toPlainObject() {
        return { t: this.text };
    }

    fromPlainObject({ t }) {
        this.text = t;
    }
}

sdk.registerMessage(ChatMessage, async (header, rawData) => {
    const secret = header.peer.sharedSecret; // retrieve shared secret
    const chat = await sdk.decode(header, rawData, secret);
    console.log(chat.text);
});
```

The `registerMessage(ctor, worker?)` method:

* **`ctor`** — class that extends `BaseMessage`.
* **`worker`** — handler function for incoming messages of this type.

---

## Core SDK Methods for Messaging

Encoding and sending a message:

```js
const encoded = await sdk.encode(messageInstance, secret);
const tx = await sdk.createTransaction(encoded.length);
const opIds = sdk.getOutpointIds(tx);
const payload = await sdk.createPayload(opIds, ChatMessage, SecretIdentifier.random(), encoded);
await sdk.sendTransaction(tx, payload);
```

Decoding and handling a message:

```js
const message = await sdk.decode(header, rawData, secret);
```

Getting conversation keys (for encryption and identifiers):

```js
const { secret, chainKey } = sdk.deriveConversationKeys(remotePublicKey);
```

Checking balance:

```js
const { balance, utxoCount } = await sdk.getBalance();
```

---

## SDK Settings and Parameters

Kaspeak SDK has flexible configuration:

```js
sdk.setPrefixFilterEnabled(false); // Accept messages from any prefix
sdk.setSignatureVerificationEnabled(false); // Disable Schnorr signature verification (unsafe!)
sdk.setWaitForConnectionEnabled(true); // If true, all network methods wait for connection instead of instantly throwing "Node is not connected" error
sdk.setPriorityFee(0.1); // Set extra fee for sending a transaction (in KAS)
sdk.setFeeLevel(FeeLevel); // Set dynamic fee calculation ("low" | "normal" | "priority" (default))
```

---

## Additional SDK Methods and Properties

* **sdk.address** — The Kaspa address used, derived from the private key.
* **sdk.publicKey** — Public key (hex, 33 bytes in compressed format).
* **sdk.balance** — Actual balance of the address in use.
* **sdk.utxoCount** — Current number of UTXOs for the address.
* **sdk.isConnected** — Status of the current connection to the Kaspa network.
* **sdk.getAddressFromPublicKey()** — Get Kaspa address from public key.
* **sdk.transferFunds()** — Send KAS to one or more addresses.