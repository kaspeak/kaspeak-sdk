const { Kaspeak, BaseMessage, SecretIdentifier, setLogLevel } = require("kaspeak-sdk");

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
