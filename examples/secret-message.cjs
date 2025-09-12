const { Kaspeak, BaseMessage, SecretIdentifier } = require("kaspeak-sdk");

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

(async () => {
	const sdk = await Kaspeak.create(6, "TEST");
	await sdk.connectNode();

	sdk.registerMessage(SecretNote, async (h, raw) => {
		const secret = h.peer.sharedSecret;
		const note = await sdk.decode(h, raw, secret);
		console.log(note.text);
	});

	const conversationKeys = sdk.deriveConversationKeys(sdk.publicKey);
	const note = new SecretNote("I love Kaspa!");
	const body = await sdk.encode(note, conversationKeys.secret);
	const id = SecretIdentifier.random();
	const tx = await sdk.createTransaction(body.length);
	const ids = sdk.getOutpointIds(tx);
	const plHex = await sdk.createPayload(ids, SecretNote, id, body);
	await sdk.sendTransaction(tx, plHex);
})();
