import { Payload } from "../models";
import { Identifier, Peer } from "../crypto";

export interface BlockMeta {
	hash: string;
	timestamp: bigint;
	daaScore: bigint;
}

export class MessageHeader {
	txid: string;
	peer: Peer;
	prefix: string;
	type: number;
	identifier: Identifier;
	blockMeta: BlockMeta;
	consensusHash: string;

	private constructor(
		txid: string,
		peer: Peer,
		prefix: string,
		type: number,
		identifier: Identifier,
		blockMeta: BlockMeta,
		consensusHash: string
	) {
		this.txid = txid;
		this.peer = peer;
		this.prefix = prefix;
		this.type = type;
		this.identifier = identifier;
		this.blockMeta = blockMeta;
		this.consensusHash = consensusHash;
	}

	static fromTransaction(
		myAddress: string,
		prefix: string,
		txid: string,
		address: string,
		payload: Payload,
		blockMeta: BlockMeta,
		consensusHash: string,
		privateKey: bigint
	): MessageHeader {
		const isOwn = myAddress === address;
		const peer = new Peer(address, payload.publicKey, payload.signature, isOwn, privateKey);
		const identifier = Identifier.fromBytes(payload.id);
		return new this(txid, peer, prefix, payload.type, identifier, blockMeta, consensusHash);
	}
}
