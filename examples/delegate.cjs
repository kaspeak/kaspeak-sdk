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
	await server_sdk.connectNode();
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
	const rawPayload = await client_sdk.createPayload(outpointIds, SecretNote, identifier, encoded);

	await server_sdk.sendTransaction(transaction, rawPayload);
}

main();
