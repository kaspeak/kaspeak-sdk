import { MessageHeader } from "../models";
import type { IBlock } from "kaspa-wasm";

export type NetworkId = "mainnet" | "testnet-10";
export type FeeLevel = "low" | "normal" | "priority";

export interface MessageEvent {
	data: Uint8Array;
	header: MessageHeader;
}

export interface Balance {
	balance: number;
	utxoCount: number;
}

export interface BlockMeta {
	hash: string;
	timestamp: bigint;
	daaScore: bigint;
}

export interface KaspeakEvents {
	message: MessageEvent;
	balance: Balance;
	connect: void;
	disconnect: void;
	error: string;
}

export interface KaspaWasmEvents {
	"block-added": IBlock;
	balance: Balance;
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
