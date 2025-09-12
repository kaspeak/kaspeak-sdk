// @ts-ignore
import wasmUrl from "kaspa-wasm/kaspa_bg.wasm?url";
import * as kaspa from "kaspa-wasm";
import { DEFAULT_NETWORK_ID } from "../sdk/constants";
import { bytesToHex, intToHex } from "../crypto";
import { addressToXPoint } from "../crypto/address";
import { logger } from "../utils/logger";
import { EventBus } from "../sdk/event-bus";
import type { KaspaWasmEvents, Balance, NetworkId, FeeLevel, PaymentOutput } from "../sdk/types";
import { UtxoProcessorEvent } from "kaspa-wasm";

let kaspaInitialized: boolean = false;

export async function ensureKaspaInitialized(): Promise<void> {
	if (!kaspaInitialized) {
		const maybeDefault = (kaspa as unknown as Record<string, any>).default;
		if (typeof maybeDefault === "function") {
			await maybeDefault({ wasmUrl });
		} else {
			logger.debug("Kaspa.default is not a function, perhaps node environment, skipping initialization");
		}
		logger.debug("Kaspa WASM loaded");
		kaspaInitialized = true;
	}
}

export class KaspaWasm {
	private _rpcClient: kaspa.RpcClient | null = null;
	private _utxoProcessor: kaspa.UtxoProcessor | null = null;
	private _utxoContext: kaspa.UtxoContext | null = null;

	private _connected = false;
	private readonly _networkId: kaspa.NetworkId;
	private _url?: string;
	private readonly _eventBus = new EventBus<KaspaWasmEvents>();

	private constructor(networkId: NetworkId = DEFAULT_NETWORK_ID) {
		this._networkId = new kaspa.NetworkId(networkId);
	}

	public static async create(networkId: NetworkId = DEFAULT_NETWORK_ID): Promise<KaspaWasm> {
		await ensureKaspaInitialized();
		return new KaspaWasm(networkId);
	}

	public on<E extends keyof KaspaWasmEvents>(e: E, fn: (d: KaspaWasmEvents[E]) => void) {
		this._eventBus.on(e, fn);
	}

	public off<E extends keyof KaspaWasmEvents>(e: E, fn: (d: KaspaWasmEvents[E]) => void) {
		this._eventBus.off(e, fn);
	}

	private emit<E extends keyof KaspaWasmEvents>(e: E, d: KaspaWasmEvents[E]) {
		this._eventBus.emit(e, d);
	}

	public async connect(publicKeyHex: string, url?: string): Promise<void> {
		if (this._rpcClient) {
			logger.warn("KaspaWasm is already connected.");
			return;
		}
		if (url) this._url = url;
		logger.debug(`Connecting to Kaspa network: ${this._networkId} ...`);
		this._rpcClient = new kaspa.RpcClient({
			resolver: new kaspa.Resolver(),
			url: this._url,
			networkId: this._networkId
		});
		this.setUpRpcEventListeners();
		await this._rpcClient.connect();
		this._url = this._rpcClient.url;
		this._utxoProcessor = new kaspa.UtxoProcessor({
			networkId: this._networkId,
			rpc: this._rpcClient
		});
		this._utxoContext = new kaspa.UtxoContext({ processor: this._utxoProcessor });
		await this._utxoProcessor.start();
		const address = this.getAddressFromPublicKey(publicKeyHex);
		await this._utxoContext.trackAddresses([address]);
		this.setUpProcessorEventListeners();
	}

	public async disconnect(): Promise<void> {
		if (this._utxoProcessor) await this._utxoProcessor.stop();
		this._utxoProcessor = null;
		this._utxoContext = null;
		if (this._rpcClient) {
			await this._rpcClient.disconnect();
		}
		this._rpcClient = null;
		this._connected = false;
		this._url = undefined;
	}

	public setTransactionMaturityDAA(maturityDAA: bigint) {
		kaspa.UtxoProcessor.setUserTransactionMaturityDAA(this._networkId, maturityDAA);
	}

	private setUpRpcEventListeners(): void {
		this.rpcClient.addEventListener("connect", async () => {
			this._connected = true;
			logger.debug("Connect");
			await this.rpcClient.subscribeBlockAdded();
			this.emit("connect", undefined);
		});
		this.rpcClient.addEventListener("disconnect", async () => {
			this._connected = false;
			logger.debug("Disconnect");
			this.emit("disconnect", undefined);
		});
		this.rpcClient.addEventListener("block-added", async (event) => {
			delete event.data.block.header.parentsByLevel;
			this.emit("block-added", event.data.block);
		});
	}

	private setUpProcessorEventListeners(): void {
		this.utxoProcessor.addEventListener("balance", (event) => {
			if (event.data.balance === undefined) {
				logger.debug("Balance event received with undefined balance, skipping emit.");
				return;
			}
			const balance = Number(event.data.balance.mature + event.data.balance.pending) / 1e8;
			const utxoCount = event.data.balance.matureUtxoCount + event.data.balance.pendingUtxoCount;
			this.emit("balance", { balance: balance, utxoCount: utxoCount });
		});

		this.utxoProcessor.addEventListener("maturity", (event: UtxoProcessorEvent<"maturity">) => {
			const tx = event.data;
			const type = tx.type;
			if (type === "incoming") {
				logger.debug("Incoming Transaction matured: ", tx.toJSON());
				this.emit("mature-incoming-tx", { txid: tx.id.toString(), data: tx });
			}
		});

		this.utxoProcessor.addEventListener("reorg", (event: UtxoProcessorEvent<"reorg">) => {
			const tx = event.data;
			logger.warn("Reorg Transaction event received (consider excluding from non managed lists!): ", tx.toJSON());
			this.emit("tx-reorg", { txid: tx.id.toString(), data: tx });
		});
	}

	get utxoProcessor(): kaspa.UtxoProcessor {
		if (!this._utxoProcessor) throw new Error("UtxoProcessor is not initialized");
		return this._utxoProcessor;
	}
	get rpcClient(): kaspa.RpcClient {
		if (!this._rpcClient) throw new Error("Kaspa RPC is not initialized – call connect()");
		return this._rpcClient;
	}
	get utxoContext(): kaspa.UtxoContext {
		if (!this._utxoContext) throw new Error("UtxoContext not initialised – call connect()");
		return this._utxoContext;
	}

	public async getUtxosByAddresses(request: kaspa.Address[] | string[]) {
		return this.rpcClient.getUtxosByAddresses(request);
	}

	public async getBalance(addresses: string | string[]): Promise<Balance> {
		const list = Array.isArray(addresses) ? addresses : [addresses];
		const { entries } = await this.getUtxosByAddresses(list);
		const totalSompi = entries.reduce((s: bigint, u: kaspa.UtxoEntryReference) => s + u.amount, 0n);
		return { balance: Number(totalSompi) / 1e8, utxoCount: entries.length };
	}

	public getAddressFromPublicKey(pub: string | Uint8Array | kaspa.PublicKey): string {
		const key = pub instanceof kaspa.PublicKey ? pub : new kaspa.PublicKey(pub instanceof Uint8Array ? bytesToHex(pub) : pub);
		return key.toAddress(this._networkId).toString();
	}

	public getXPointFromAddress(addr: string | kaspa.Address): string {
		const s = typeof addr === "string" ? addr : addr.toString();
		return addressToXPoint(s);
	}

	public getPublicKeyFromPrivateKey(privateKey: bigint | number | kaspa.PrivateKey): kaspa.PublicKey {
		if (privateKey instanceof kaspa.PrivateKey) return privateKey.toPublicKey();
		return new kaspa.PrivateKey(intToHex(privateKey, 32)).toPublicKey();
	}

	public async getFeeRate(feeLevel: FeeLevel): Promise<number> {
		const feeEstimateResonse = await this.rpcClient.getFeeEstimate();
		const feeEstimate = feeEstimateResonse.estimate;
		logger.debug(`Estimated fee:`, JSON.stringify(feeEstimate, null, 2));
		let feeRate: number;
		switch (feeLevel) {
			case "priority":
				feeRate = feeEstimate.priorityBucket.feerate;
				break;
			case "low":
				feeRate = feeEstimate.lowBuckets[0].feerate;
				break;
			case "normal":
			default:
				feeRate = feeEstimate.normalBuckets[0].feerate;
		}
		if (feeRate > 100) {
			logger.warn(`${feeLevel} fee rate is unusually high: x${feeRate} sompi/gram`);
		}
		return feeRate;
	}

	public async createTransaction(
		myAddress: string,
		payloadSizeBytes: bigint,
		priorityFeeSompi: bigint = 0n,
		feeLevel: FeeLevel = "normal",
		outputs?: PaymentOutput[]
	): Promise<kaspa.Transaction> {
		let transactionOutputs: kaspa.PaymentOutput[] = [];
		if (outputs !== undefined) {
			outputs.forEach((output) => {
				let destination = new kaspa.Address(output.address);
				let amountKasStr = typeof output.amountKas === "number" ? output.amountKas.toString() : output.amountKas;
				let amountSompi = kaspa.kaspaToSompi(amountKasStr);
				if (!amountSompi) {
					throw new Error(`Can't convert kaspa amount ${output.amountKas} to sompi`);
				}
				transactionOutputs.push(new kaspa.PaymentOutput(destination, amountSompi));
			});
		}
		const feeRate = await this.getFeeRate(feeLevel);
		const dummyPayload = payloadSizeBytes > 0n ? new Uint8Array(Number(payloadSizeBytes)) : undefined;
		let entries = this.utxoContext.matureLength > 0 ? this.utxoContext : this.utxoContext.getPending();
		const gen = new kaspa.Generator({
			networkId: this._networkId.toString(),
			entries,
			changeAddress: myAddress,
			outputs: transactionOutputs,
			payload: dummyPayload,
			feeRate: feeRate,
			priorityFee: priorityFeeSompi // ¯\_(ツ)_/¯ maybe check https://kaspa.aspectron.org/docs/interfaces/IGeneratorSettingsObject.html#priorityFee
		});
		const pending = await gen.next();
		if (!pending) throw new Error("Generator failed");
		return pending.transaction;
	}

	public async sendTransaction(tx: kaspa.Transaction, privateKey: bigint | number, payload?: string): Promise<string> {
		const pk = new kaspa.PrivateKey(intToHex(privateKey, 32));
		if (payload) {
			tx.payload = payload;
		}
		const signed = kaspa.signTransaction(tx, [pk], true);
		const { transactionId } = await this.rpcClient.submitTransaction({ transaction: signed });
		return transactionId;
	}

	get isConnected() {
		return this._connected;
	}

	get networkId() {
		return this._networkId.toString();
	}

	get url() {
		return this._url;
	}

	get kaspa(): typeof import("kaspa-wasm") {
		return kaspa;
	}

	get eventBus() {
		return this._eventBus;
	}

	public async getServerInfo() {
		return this.rpcClient.getServerInfo();
	}
}
