// @ts-ignore
import wasmUrl from "kaspa-wasm/kaspa_bg.wasm?url";
import * as kaspa from "kaspa-wasm";
import { DEFAULT_NETWORK_ID } from "../sdk/constants";
import { bytesToHex, intToHex } from "../crypto";
import { logger } from "../utils/logger";

let kaspaInitialized: boolean = false;

export async function ensureKaspaInitialized(): Promise<void> {
	if (!kaspaInitialized) {
		const maybeDefault = (kaspa as unknown as Record<string, any>).default;
		if (typeof maybeDefault === "function") {
			await maybeDefault({ wasmUrl });
		} else {
			logger.warn("Kaspa.default is not a function, perhaps node environment, skipping initialization");
		}
		logger.debug("Kaspa WASM loaded");
		kaspaInitialized = true;
	}
}

export class KaspaWasm {
	private _rpc: kaspa.RpcClient | null = null;
	private _processor: kaspa.UtxoProcessor | null = null;
	private _context: kaspa.UtxoContext | null = null;

	private _connected = false;
	private _networkId: kaspa.NetworkId;
	private _url?: string;

	private eventHandlers = new Set<(b: kaspa.IBlockAdded) => void>();

	private constructor() {
		this._networkId = new kaspa.NetworkId(DEFAULT_NETWORK_ID);
	}

	public static async create(): Promise<KaspaWasm> {
		await ensureKaspaInitialized();
		return new KaspaWasm();
	}

	public async connect(networkId?: string, url?: string) {
		if (this._rpc) {
			logger.warn("KaspaWasm is already connected.");
			return;
		}
		if (networkId) this._networkId = new kaspa.NetworkId(networkId);
		if (url) this._url = url;
		logger.debug(`Connecting to Kaspa network: ${this._networkId} ...`);
		this._rpc = new kaspa.RpcClient({
			resolver: new kaspa.Resolver(),
			url: this._url,
			networkId: this._networkId
		});
		await this.setUpRpcEventListeners();
		await this._rpc.connect();
		this._url = this._rpc.url;
	}

	public async startUtxoMonitoring(address: string) {
		if (!this._rpc) throw new Error("call connect() first");
		if (this._processor) return;

		this._processor = new kaspa.UtxoProcessor({
			networkId: this._networkId.toString(),
			rpc: this._rpc
		});
		this._context = new kaspa.UtxoContext({ processor: this._processor });

		await this._processor.start();
		await this._context.trackAddresses([new kaspa.Address(address)]);
	}

	public async stop() {
		if (this._processor) await this._processor.stop();
		this._processor = null;
		this._context = null;
	}

	public async disconnect() {
		await this.stop();
		if (this._rpc) {
			logger.debug("Disconnected from node...");
			await this._rpc.disconnect();
		}
		this._rpc = null;
		this._connected = false;
		this._url = undefined;
	}

	private get rpc(): kaspa.RpcClient {
		if (!this._rpc) throw new Error("Kaspa RPC is not initialized.");
		return this._rpc;
	}
	private get context(): kaspa.UtxoContext {
		if (!this._context) throw new Error("UtxoContext not initialised – call start()");
		return this._context;
	}

	public async getUtxosByAddresses(request: kaspa.Address[] | string[]) {
		return this.rpc.getUtxosByAddresses(request);
	}

	public async getBalance(addresses: string | string[]): Promise<{ balance: number; utxoCount: number }> {
		const list = Array.isArray(addresses) ? addresses : [addresses];
		const { entries } = await this.getUtxosByAddresses(list);
		const totalSompi = entries.reduce((s: bigint, u: kaspa.UtxoEntryReference) => s + u.amount, 0n);
		return { balance: Number(totalSompi) / 1e8, utxoCount: entries.length };
	}

	public getAddressFromPublicKey(pub: string | Uint8Array | kaspa.PublicKey): string {
		const key = pub instanceof kaspa.PublicKey ? pub : new kaspa.PublicKey(pub instanceof Uint8Array ? bytesToHex(pub) : pub);
		return key.toAddress(this._networkId).toString();
	}

	public getPublicKeyFromPrivateKey(privateKey: bigint | number | kaspa.PrivateKey): kaspa.PublicKey {
		if (privateKey instanceof kaspa.PrivateKey) return privateKey.toPublicKey();
		const privateKeyHex = intToHex(privateKey, 32);
		return new kaspa.PrivateKey(privateKeyHex).toPublicKey();
	}

	public async createTransaction(
		myAddress: string,
		destination: string,
		payloadSizeBytes: bigint,
		priorityFeeSompi: bigint = 0n
	): Promise<kaspa.Transaction> {
		if (!this._processor) throw new Error("call start(address) first");
		const dummyPayload = payloadSizeBytes > 0n ? new Uint8Array(Number(payloadSizeBytes)) : undefined;

		const gen = new kaspa.Generator({
			networkId: this._networkId.toString(),
			entries: this.context,
			changeAddress: myAddress,
			outputs: [],
			payload: dummyPayload,
			priorityFee: priorityFeeSompi
		});
		const pending = await gen.next();
		if (!pending) throw new Error("Generator failed");
		return pending.transaction;
	}

	public async sendTransaction(tx: kaspa.Transaction, privateKey: bigint | number, payload?: string): Promise<string> {
		const pk = new kaspa.PrivateKey(intToHex(privateKey, 32));
		tx.payload = payload;
		const signed = kaspa.signTransaction(tx, [pk], true);
		const { transactionId } = await this.rpc.submitTransaction({ transaction: signed });
		return transactionId;
	}

	private async setUpRpcEventListeners() {
		this.rpc.addEventListener("connect", async () => {
			this._connected = true;
			logger.debug("Subscribing to Block Added...");
			await this.rpc.subscribeBlockAdded();
		});
		this.rpc.addEventListener("disconnect", async (event) => {
			logger.debug("Disconnect", event);
			this._connected = false;
		});
		this.rpc.addEventListener("block-added", async (event) => {
			delete event.data.block.header.parentsByLevel;
			for (const handler of this.eventHandlers) {
				handler(event);
			}
		});
	}

	public subscribe(cb: (block: kaspa.IBlock) => Promise<void>) {
		const handler = (e: kaspa.IBlockAdded) =>
			void cb(e.data.block).catch((err) => logger.error("subscriber callback error:", err));
		this.eventHandlers.add(handler);
		return () => this.eventHandlers.delete(handler);
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

	public async getServerInfo() {
		return this.rpc.getServerInfo();
	}
}
