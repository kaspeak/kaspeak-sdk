# Kaspeak SDK

This page provides an overview of key methods and features of **Kaspeak SDK**. Detailed cryptographic and data-format schemes are covered separately.

Below is a **practical guide to using the SDK**.

---

## Quick Start

Initialize the SDK:

```js
import { Kaspeak, randomBytes } from "kaspeak-sdk";

const sdk = await Kaspeak.create(randomBytes(32), "CHAT");
await sdk.connect();
```

### Method `create(privateKey, prefix)` Parameters

- **`privateKey`** – can be a `bigint`, `number`, `Uint8Array`, or hex-string.
- **`prefix`** – unique 4-character ASCII prefix per application, avoiding message conflicts.

After `create()` call, SDK is ready to connect.

### Method `connect(networkId?, url?)` Parameters

| Parameter    | Default          | Description                               |
|--------------|------------------|-------------------------------------------|
| `networkId`  | `"testnet-10"`   | Kaspa network (`"mainnet"` or testnets)   |
| `url`        | *(automatic)*    | Specific Kaspa node URL (optional)        |

---

## Event Handling & Error Management

Kaspeak SDK uses event-driven design:

```js
sdk.on("KaspeakMessageReceived", async ({ header, data }) => {
	// incoming messages handling
});

sdk.on("error", console.error);
```

- **`KaspeakMessageReceived`** triggers on every incoming payload.
- **`error`** captures network issues, serialization errors, and other SDK issues.

---

## Creating Custom Message Types

Custom messages can be created by subclassing `BaseMessage`:

```js
class ChatMsg extends BaseMessage {
	static messageType = 1337; // Unique message type code
	static requiresEncryption = true; // Wether message requiries encryption 

	constructor(text = "", header) {
		super(header);
		this.text = text;
	}

	toPlainObject() { return { t: this.text }; }
	fromPlainObject({ t }) { this.text = t; }
}

sdk.registerMessage(ChatMsg, async (header, rawData) => {
	const secret = header.peer.sharedSecret; // retrieve shared secret
	const chat = await sdk.decode(header, rawData, secret);
	console.log(chat.text);
});
```

Method `registerMessage(ctor, worker?)`:

- **`ctor`** – `BaseMessage` subclass.
- **`worker`** – optional handler for incoming messages of that type.

---

## Core Message Operations

Encoding and sending a message:

```js
const encoded = await sdk.encode(messageInstance, secret);
const tx = await sdk.createTransaction(encoded.length);
const opIds = sdk.getOutpointIds(tx);
const payload = await sdk.createPayload(
	opIds,
	messageInstance.messageType,
	Identifier.random(),
	encoded
);
await sdk.sendTransaction(tx, payload);
```

Decoding received messages:

```js
const message = await sdk.decode(header, rawData, secret);
```

Obtaining conversation keys:

```js
const { secret, chainKey } = sdk.deriveConversationKeys(remotePublicKey);
```

Checking wallet balance:

```js
const kasBalance = await sdk.getBalance();
```

---

## SDK Configuration Options

```js
sdk.setPrefixFilterEnabled(false); // Allow messages from any prefix
sdk.setSignatureVerificationEnabled(false); // Disable signature verification (unsafe!)
sdk.setPriorityFee(0.1); // Transaction fee adjustment (KAS)
```

---

## Additional Methods & Properties

| Method/Property               | Description                                    |
|-------------------------------|------------------------------------------------|
| `sdk.address`                 | SDK-generated Kaspa address                    |
| `sdk.publicKey`               | Hex representation of public key               |
| `sdk.balance`                 | Last retrieved wallet balance                  |
| `sdk.utxoCount`               | Count of UTXOs in wallet                       |
| `sdk.isConnected`             | Current network connection status              |
| `sdk.getAddressFromPublicKey()` | Derives Kaspa address from public key        |
