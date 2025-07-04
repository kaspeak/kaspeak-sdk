import { ensureKaspaInitialized, KaspaWasm } from "../wasm/kaspa";
import { ensureZstdInitialized } from "../utils/compression";
import { ITransaction, Transaction, PublicKey as KaspaPublicKey } from "kaspa-wasm";
import { LimitedHashSet } from "../utils/limited-hash-set";
import { EventBus } from "./event-bus";
import { BaseMessage, MessageHeader, Payload, BlockMeta } from "../models";
import { MessageClass, MessageRegistry, WorkerFn } from "./message-registry";
import { MessageSerializer } from "./message-serializer";
import { hexToBytes, hexToInt, bytesToInt, sha256FromBytes } from "../crypto/utils";
import { SecretIdentifier, Identifier, Secp256k1, Point } from "../crypto";
import { HEADER_SIZE } from "./constants";
import { logger } from "../utils/logger";

export interface KaspeakEvents {
	KaspeakMessageReceived: { data: Uint8Array; header: MessageHeader };
	error: string;
}

export interface ConversationKeys {
	secret: Uint8Array;
	chainKey: bigint;
}

export class Kaspeak {
	private kaspa!: KaspaWasm;

	/* Wallet */
	readonly #privateKey: bigint;
	#publicKey!: Uint8Array;
	#publicKeyHex!: string;
	#address!: string;

	/* Settings */
	private readonly prefixBytes: Uint8Array;
	private readonly prefixString: string;
	private readonly knownTxIds = new LimitedHashSet<string>(5_000);
	private readonly eventBus = new EventBus<KaspeakEvents>();
	private readonly messageRegistry = new MessageRegistry();

	/* State */
	#balance = 0;
	#utxoCount = 0;
	#prefixFilterEnabled = true;
	#signatureVerificationEnabled = true;
	#priorityFeeSompi: bigint = 0n;

	private constructor(privateKey: bigint, prefix: string) {
		this.#privateKey = privateKey;
		this.prefixString = prefix;
		this.prefixBytes = new TextEncoder().encode(prefix.padEnd(4, "\0").slice(0, 4));
	}

	/* ---------------------------- Initialization --------------------------- */

	private async postInit(): Promise<void> {
		this.kaspa = await KaspaWasm.create();
		this.#publicKeyHex = this.kaspa.getPublicKeyFromPrivateKey(this.#privateKey).toString();
		this.#publicKey = hexToBytes(this.#publicKeyHex);
		this.#address = this.kaspa.getAddressFromPublicKey(this.#publicKeyHex);
	}

	private async initWasmModules(): Promise<void> {
		await Promise.all([ensureZstdInitialized(), ensureKaspaInitialized()]);
	}

	public static async create(privateKey: number | Uint8Array | string | bigint, prefix = "TEST"): Promise<Kaspeak> {
		let privateKeyBigInt: bigint;
		if (typeof privateKey === "string") privateKeyBigInt = hexToInt(privateKey);
		else if (typeof privateKey === "number") privateKeyBigInt = BigInt(privateKey);
		else if (privateKey instanceof Uint8Array) privateKeyBigInt = bytesToInt(privateKey);
		else privateKeyBigInt = privateKey;

		const sdk = new Kaspeak(privateKeyBigInt, prefix);
		await sdk.initWasmModules();
		await sdk.postInit();
		return sdk;
	}

	/* ------------------------------ Settings ------------------------------- */

	public setPrefixFilterEnabled(enabled: boolean): void {
		this.#prefixFilterEnabled = enabled;
	}

	public setSignatureVerificationEnabled(enabled: boolean): void {
		this.#signatureVerificationEnabled = enabled;
	}

	/**
	 * Sets the priority fee in KAS (NOT SOMPI!) for transactions.
	 * The fee is converted to sompi (1 KAS = 1e8 sompi).
	 *
	 * @param feeKAS - The priority fee in KAS.
	 * @throws Error if the fee is negative.
	 */
	public setPriorityFee(feeKAS: number): void {
		if (feeKAS > 100) {
			logger.warn("The priority fee is too high, decreased to 100 KAS");
			feeKAS = 100;
		}
		const v = BigInt(Math.round(Number(feeKAS) * 1e8));
		if (v < 0n) throw new Error("priorityFee must be ≥ 0");
		this.#priorityFeeSompi = v;
	}

	/* ------------------------------ Kaspa RPC -------------------------------- */

	public async connect(networkId?: string, url?: string): Promise<void> {
		await this.kaspa.connect(networkId, url);
		await this.kaspa.getServerInfo();

		this.kaspa.subscribe((block) => {
			const blockMeta: BlockMeta = {
				hash: block.header.hash,
				timestamp: block.header.timestamp,
				daaScore: block.header.daaScore
			};
			return this.processTransactions(block.transactions, blockMeta);
		});

		await this.kaspa.startUtxoMonitoring(this.#address);
		await this.getBalance();
		logger.debug("Connected to node and subscribed to new blocks");
	}

	public get isConnected(): boolean {
		return this.kaspa.isConnected;
	}

	public async getBalance(address?: string): Promise<number> {
		const addr = address ?? this.#address;
		const { balance, utxoCount } = await this.kaspa.getBalance(addr);
		if (addr === this.#address) {
			this.#balance = balance;
			this.#utxoCount = utxoCount;
		}
		return balance;
	}

	/* ------------------------------ Accessors ------------------------------ */

	public get address(): string {
		return this.#address;
	}

	public get publicKey(): string {
		return this.#publicKeyHex;
	}

	public get balance(): number {
		return this.#balance;
	}

	public get utxoCount(): number {
		return this.#utxoCount;
	}

	/* ------------------------------- Events -------------------------------- */

	public on<E extends keyof KaspeakEvents>(event: E, listener: (data: KaspeakEvents[E]) => void): void {
		this.eventBus.on(event, listener);
	}

	public off<E extends keyof KaspeakEvents>(event: E, listener: (data: KaspeakEvents[E]) => void): void {
		this.eventBus.off(event, listener);
	}

	public once<E extends keyof KaspeakEvents>(event: E, listener: (data: KaspeakEvents[E]) => void): void {
		this.eventBus.once(event, listener);
	}

	/* ----------------------- Message encode / decode ----------------------- */

	public async encode(message: BaseMessage, key?: Uint8Array): Promise<Uint8Array> {
		return MessageSerializer.encode(message, key);
	}

	public async decode<T extends BaseMessage>(header: MessageHeader, data: Uint8Array, key?: Uint8Array): Promise<T> {
		return MessageSerializer.decode(this.messageRegistry, header, data, key);
	}

	public registerMessage(message: MessageClass, worker?: WorkerFn) {
		if (message.messageType < 0 || message.messageType > 65535)
			throw new Error(`Invalid messageType: ${message.messageType}. messageType must be between 0 and 65535.`);
		this.messageRegistry.register(message, worker);
	}

	public callWorker(header: MessageHeader, rawData: Uint8Array): void {
		const worker = this.messageRegistry.getWorker(header.type);
		if (!worker) return;
		queueMicrotask(() => {
			try {
				worker(header, rawData);
			} catch (error) {
				logger.error("Worker error:", error);
			}
		});
	}

	/* ---------------------------- Crypto helpers --------------------------- */

	public deriveConversationKeys(publicKey: Point | string | Uint8Array): ConversationKeys {
		const publicKeyPoint =
			publicKey instanceof Point
				? publicKey
				: typeof publicKey === "string"
					? Point.fromHex(publicKey)
					: Point.fromBytes(publicKey);

		const secret = Secp256k1.getSharedSecret(this.#privateKey, publicKeyPoint);
		const chainKey = bytesToInt(sha256FromBytes(secret));
		return { secret, chainKey };
	}

	public getAddressFromPublicKey(publicKey: string | Uint8Array | KaspaPublicKey): string {
		return this.kaspa.getAddressFromPublicKey(publicKey);
	}

	/* --------------------------- Payload helpers --------------------------- */

	public async createPayload(
		outpointIds: string,
		messageType: number,
		identifier: SecretIdentifier | Identifier,
		data: Uint8Array
	): Promise<string> {
		if (messageType < 0 || messageType > 65535)
			throw new Error(`Invalid messageType: ${messageType}. messageType must be between 0 and 65535.`);
		const payload = new Payload(this.prefixBytes, messageType, identifier, this.#publicKey, data);
		await payload.sign(outpointIds, this.#privateKey);
		return payload.toHex();
	}

	public parsePayload(data: Uint8Array | string): Payload {
		return typeof data === "string" ? Payload.fromHex(data) : Payload.fromBytes(data);
	}

	public getOutpointIds(tx: Transaction | ITransaction): string {
		return tx.inputs
			.slice()
			.sort((a, b) => a.previousOutpoint.index - b.previousOutpoint.index)
			.map((input) => input.previousOutpoint.transactionId)
			.join("");
	}

	/* ------------------------ Transaction utilities ------------------------ */

	public async createTransaction(dataLength: number): Promise<Transaction> {
		const payloadSize = BigInt(dataLength) + BigInt(HEADER_SIZE);
		return this.kaspa.createTransaction(this.#address, this.#address, payloadSize, this.#priorityFeeSompi);
	}

	public async sendTransaction(transaction: Transaction, payload: string): Promise<string> {
		const txid = await this.kaspa.sendTransaction(transaction, this.#privateKey, payload);
		await this.getBalance();
		return txid;
	}

	public createMessageHeaderFromTransaction(
		txid: string,
		prefix: string,
		payload: Payload,
		blockMeta: BlockMeta,
		consensusHash: string
	): MessageHeader {
		const myAddress = this.#address;
		const address = this.kaspa.getAddressFromPublicKey(payload.publicKey);
		return MessageHeader.fromTransaction(myAddress, prefix, txid, address, payload, blockMeta, consensusHash, this.#privateKey);
	}

	private async processTransactions(transactions: ITransaction[], blockMeta: BlockMeta): Promise<void> {
		for (const tx of transactions) {
			try {
				if (tx.payload.length & 1) continue;
				if (tx.payload.length < HEADER_SIZE) continue;
				if (!tx.payload.startsWith("4b53504b")) continue;
				if (!tx.verboseData) throw new Error(`verboseData is undefined in tx => ${tx}`);
				const txid = tx.verboseData.transactionId;
				if (!this.knownTxIds.tryAdd(txid)) continue;
				const payload = this.parsePayload(tx.payload);
				const prefix = payload.getPrefix();

				if (this.#prefixFilterEnabled && prefix !== this.prefixString) continue;
				const consensusHash = this.getOutpointIds(tx);
				logger.debug("Received outpointIds:", consensusHash);
				if (this.#signatureVerificationEnabled) {
					const verified = await payload.verify(consensusHash);
					if (!verified) {
						logger.warn(`Payload signature verification failed for txId: ${txid}`);
						continue;
					}
				}
				logger.debug("Processing transaction:", tx);
				const messageHeader = this.createMessageHeaderFromTransaction(txid, prefix, payload, blockMeta, consensusHash);
				this.eventBus.emit("KaspeakMessageReceived", { header: messageHeader, data: payload.data });
				if (prefix === this.prefixString) this.callWorker(messageHeader, payload.data);
			} catch (e) {
				if (e instanceof Error) logger.error(`Error processing transaction: ${e.message}, tx=> ${tx}`);
			}
		}
	}
}
