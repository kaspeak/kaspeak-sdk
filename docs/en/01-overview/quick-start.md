# Quick Start

By default, Kaspeak SDK operates on the `TESTNET-10` network, but you can also use `MAINNET` for your application.

You can get some TKAS on `TESTNET-10` from the [faucet](https://faucet-tn10.kaspanet.io/).

### Installation

```bash
npm i kaspeak-sdk
```

### Initialization

```js
const { Kaspeak } = require("kaspeak-sdk");

const PREFIX = "TEST";
const PRIV_KEY = 6;

const sdk = await Kaspeak.create(PRIV_KEY, PREFIX, "testnet-10");
await sdk.connectNode();
```

> `PREFIX` is your application's unique name, limited to 4 ASCII characters.
> This prevents your messages from conflicting with other SDK users.

### Running examples

To see the list of available examples, run:

```bash
npx kaspeak-example
```

To immediately run a specific example, use one of these commands:

```bash
npx kaspeak-example quick-start
npx kaspeak-example delegate
npx kaspeak-example secret-message
```

You can also run main examples using:

```bash
npm run example:quick-start
npm run example:secret-message
npm run example:delegate
```

### Creating, sending, and receiving a simple unencrypted message

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
	sdk = await Kaspeak.create(PRIV_KEY, PREFIX, NETWORK_ID);
	await sdk.connectNode();
	console.log("Public key:", sdk.publicKey);
	console.log("Address:", sdk.address);

	sdk.registerMessage(ExampleMessage, exampleHandler);

	const msg = new ExampleMessage("hello", "world");
	const encoded = await sdk.encode(msg);
	const identifier = SecretIdentifier.random();
	const tx = await sdk.createTransaction(encoded.length);
	const opIds = sdk.getOutpointIds(tx);
	const payload = await sdk.createPayload(opIds, ExampleMessage, identifier, encoded);
	await sdk.sendTransaction(tx, payload);
}

main();
```

> To run this example on mainnet, use `NETWORK_ID = "mainnet"`

> This example **DOES NOT** use message encryption.
> If you want to send encrypted messages, see [Message Encryption](../03-advanced/encryption.md).