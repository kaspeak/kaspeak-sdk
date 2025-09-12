import { MessageHeader } from "../models";
import { IBlock, TransactionRecord } from "kaspa-wasm";

export type QueryField =
	| "txid"
	| "type"
	| "prefix"
	| "identifier"
	| "publicKey"
	| "address"
	| "signatureType"
	| "blockHash"
	| "daaScore"
	| "timestamp";

export type NetworkId = "mainnet" | "testnet-10";
export type FeeLevel = "low" | "normal" | "priority";
export type SignatureType = "single" | "multi";
export type SortOrder = "asc" | "desc";

export interface MessageRecord {
	txid: string;
	type: number;
	isPayment: boolean;
	prefix: string;
	identifier: string;
	publicKey: string;
	address: string;
	signatureType: SignatureType;
	signature: string;
	consensusHash: string;
	blockHash: string;
	daaScore: bigint;
	timestamp: bigint;
	data: string;
	txOutputs: TransactionOutput[];
}

export interface IndexerFilter {
	txid?: string;
	type?: number;
	prefix?: string;
	identifier?: string;
	publicKey?: string;
	address?: string;
	blockHash?: string;
	daaScore?: bigint;
	timestamp?: bigint;
	signatureType?: SignatureType;
}

export interface QueryRequest {
	count_only?: boolean;
	id?: string;
	filter?: IndexerFilter;
	facets?: QueryField[];
	group_by?: QueryField[];
	limit?: number;
	offset?: number;
	order?: SortOrder;
}

export interface QuerySuccess {
	count: bigint;
	id?: string;
	ok: true;
	facets?: null | Record<string, Record<string, bigint>>;
	data: MessageRecord[];
}

export interface QueryFailure {
	id?: string;
	ok: false;
	err: string;
}

export type QueryResponse = QuerySuccess | QueryFailure;

export interface MessageEvent {
	data: Uint8Array;
	header: MessageHeader;
}

export interface Balance {
	balance: number;
	utxoCount: number;
}

export interface MatureIncomingTx {
	txid: string;
	data: TransactionRecord;
}

export interface TxReorg {
	txid: string;
	data: TransactionRecord;
}

export interface BlockMeta {
	hash: string;
	timestamp: bigint;
	daaScore: bigint;
}

export interface KaspeakEvents {
	message: MessageEvent;
	balance: Balance;
	"mature-incoming-tx": MatureIncomingTx;
	"tx-reorg": TxReorg;
	/** @deprecated Use "node-connect" instead. */
	connect: void;
	/** @deprecated Use "node-disconnect" instead. */
	disconnect: void;
	"node-connect": void;
	"node-disconnect": void;
	error: string;
	"indexer-connect": void;
	"indexer-disconnect": void;
}

export interface IndexerEvents {
	message: QueryResponse;
	connect: void;
	disconnect: void;
}

export interface KaspaWasmEvents {
	"block-added": IBlock;
	balance: Balance;
	"mature-incoming-tx": MatureIncomingTx;
	"tx-reorg": TxReorg;
	connect: void;
	disconnect: void;
}

export interface ConversationKeys {
	secret: Uint8Array;
	chainKey: bigint;
}

export interface PaymentOutput {
	address: string;
	amountKas: string | number;
}

export interface TransactionOutput {
	address: string;
	pubKey: string;
	amount: {
		kas: string;
		sompi: bigint;
	};
}
