import { Payload } from "../models";
import { Identifier, Peer } from "../crypto";
import type { BlockMeta, MessageRecord, SignatureType, TransactionOutput } from "../sdk/types";

function byteToSigType(b: number): SignatureType {
	if (b === 1) return "single";
	if (b === 2) return "multi";
	throw new Error("Bad signature type");
}

export class MessageHeader {
	txid: string;
	peer: Peer;
	prefix: string;
	type: number;
	identifier: Identifier;
	blockMeta: BlockMeta;
	consensusHash: string;
	live: boolean;
	isPayment: boolean;
	signatureType: SignatureType;
	requestId?: string;
	txOutputs: TransactionOutput[];

	private constructor(
		txid: string,
		txOutputs: TransactionOutput[],
		payload: Payload,
		peer: Peer,
		prefix: string,
		blockMeta: BlockMeta,
		consensusHash: string,
		live: boolean,
		isPayment: boolean,
		requestId?: string
	) {
		this.txid = txid;
		this.peer = peer;
		this.prefix = prefix;
		this.type = payload.type;
		this.identifier = Identifier.fromBytes(payload.id);
		this.blockMeta = blockMeta;
		this.consensusHash = consensusHash;
		this.live = live;
		this.signatureType = byteToSigType(payload.signatureType);
		this.requestId = requestId;
		this.isPayment = isPayment;
		this.txOutputs = txOutputs;
	}

	static fromTransaction(
		prefix: string,
		txid: string,
		address: string,
		txOutputs: TransactionOutput[],
		payload: Payload,
		isOwn: boolean,
		isPayment: boolean,
		blockMeta: BlockMeta,
		consensusHash: string,
		privateKey: bigint
	): MessageHeader {
		const peer = new Peer(address, payload, isOwn, privateKey);
		return new this(txid, txOutputs, payload, peer, prefix, blockMeta, consensusHash, true, isPayment);
	}

	static fromIndexerRecord(
		rec: MessageRecord,
		prefix: string,
		payload: Payload,
		isOwn: boolean,
		privateKey: bigint,
		requestId?: string
	): MessageHeader {
		const peer = new Peer(rec.address, payload, isOwn, privateKey);
		const blockMeta: BlockMeta = {
			hash: rec.blockHash,
			daaScore: rec.daaScore,
			timestamp: rec.timestamp
		};
		return new this(rec.txid, rec.txOutputs, payload, peer, prefix, blockMeta, rec.consensusHash, false, rec.isPayment, requestId);
	}
}
