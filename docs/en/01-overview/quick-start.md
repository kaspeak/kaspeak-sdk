# Quick Start

By default, Kaspeak SDK operates on the `TESTNET-10` network, but nothing prevents you from using `MAINNET` for your application.

You can get some TKAS on `TESTNET-10` using the [faucet](https://faucet-tn10.kaspanet.io/).

### Installation

```bash
pnpm add kaspeak-sdk
```

### Initialization

```js
const { Kaspeak } = require("kaspeak-sdk");

const PREFIX = "TEST";
const PRIV_KEY = 6;

const sdk = await Kaspeak.create(PRIV_KEY, PREFIX);
await sdk.connect();
```

> `PREFIX` is your application's unique name, limited to 4 bytes.
> It prevents interference from other SDK users' messages.

### Creating, sending, and receiving an unencrypted message

```js
const { Kaspeak, BaseMessage, SecretIdentifier } = require("kaspeak-sdk");

class ExampleMessage extends BaseMessage {
	static requiresEncryption = false;
	static messageType = 1;

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

const PREFIX = "TEST";
const PRIV_KEY = 6;
const NETWORK_ID = "testnet-10";

let sdk;

async function exampleHandler(header, raw) {
	const msg = await sdk.decode(header, raw);
	console.log("Foo:", msg.foo, "Bar:", msg.bar);
}

async function main() {
	sdk = await Kaspeak.create(PRIV_KEY, PREFIX);
	await sdk.connect(NETWORK_ID);
	console.log("Public key:", sdk.publicKey);
	console.log("Address:", sdk.address);

	sdk.registerMessage(ExampleMessage, exampleHandler);

	const msg = new ExampleMessage("hello", "world");
	const encoded = await sdk.encode(msg);
	const identifier = SecretIdentifier.random();
	const tx = await sdk.createTransaction(encoded.length);
	const opIds = sdk.getOutpointIds(tx);
	const payload = await sdk.createPayload(opIds, ExampleMessage.messageType, identifier, encoded);
	await sdk.sendTransaction(tx, payload);
}

main();
```

> To run this example on the main network, use `NETWORK_ID = "mainnet"`.

> This example **DOES NOT** use message encryption. If you wish to send encrypted messages, see [Message Encryption](../03-advanced/encryption.md).
