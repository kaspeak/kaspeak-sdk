import { ensureKaspaInitialized, KaspaWasm } from "../modules/kaspa";
import { IndexerClient } from "../modules/indexer";
import { ensureZstdInitialized } from "../utils/compression";
import { Address as KaspaAddress, ITransaction, PublicKey as KaspaPublicKey, sompiToKaspaString, Transaction } from "kaspa-wasm";
import { LimitedHashSet } from "../utils/limited-hash-set";
import { EventBus } from "./event-bus";
import { BaseMessage, MessageHeader, Payload } from "../models";
import { MessageClass, MessageRegistry, WorkerFn } from "./message-registry";
import { MessageSerializer } from "./message-serializer";
import {
	bytesToHex,
	bytesToInt,
	hexToBytes,
	hexToInt,
	Identifier,
	Point,
	randomBytes,
	Secp256k1,
	SecretIdentifier,
	sha256FromBytes
} from "../crypto";
import { DEFAULT_NETWORK_ID, HEADER_SIZE } from "./constants";
import { logger } from "../utils/logger";
import type {
	Balance,
	BlockMeta,
	ConversationKeys,
	FeeLevel,
	KaspeakEvents,
	MatureIncomingTx,
	MessageEvent,
	MessageRecord,
	NetworkId,
	PaymentOutput,
	QueryRequest,
	QueryResponse,
	SignatureType,
	TransactionOutput,
	TxReorg
} from "./types";

export class Kaspeak {
	private kaspa!: KaspaWasm;
	private indexer?: IndexerClient;

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
	#connectPromise: Promise<void> | null = null;

	/* State */
	#balance = 0;
	#utxoCount = 0;
	#prefixFilterEnabled = true;
	#signatureVerificationEnabled = true;
	#waitForConnectionEnabled = false;
	#priorityFeeSompi: bigint = 0n;
	#feeLevel: FeeLevel = "priority";

	private constructor(privateKey: bigint, prefix: string) {
		this.#privateKey = privateKey;
		this.prefixString = prefix;
		this.prefixBytes = new TextEncoder().encode(prefix.padEnd(4, "\0").slice(0, 4));
	}

	/* ---------------------------- Initialization --------------------------- */

	private async postInit(networkId: NetworkId): Promise<void> {
		this.kaspa = await KaspaWasm.create(networkId);
		this.#publicKeyHex = this.kaspa.getPublicKeyFromPrivateKey(this.#privateKey).toString();
		this.#publicKey = hexToBytes(this.#publicKeyHex);
		this.#address = this.kaspa.getAddressFromPublicKey(this.#publicKeyHex);
	}

	private async initWasmModules(): Promise<void> {
		await Promise.all([ensureZstdInitialized(), ensureKaspaInitialized()]);
	}

	public static async create(
		privateKey: number | Uint8Array | string | bigint,
		prefix = "TEST",
		networkId: NetworkId = DEFAULT_NETWORK_ID
	): Promise<Kaspeak> {
		let privateKeyBigInt: bigint;
		if (typeof privateKey === "string") privateKeyBigInt = hexToInt(privateKey);
		else if (typeof privateKey === "number") privateKeyBigInt = BigInt(privateKey);
		else if (privateKey instanceof Uint8Array) privateKeyBigInt = bytesToInt(privateKey);
		else privateKeyBigInt = privateKey;

		const sdk = new Kaspeak(privateKeyBigInt, prefix);
		await sdk.initWasmModules();
		await sdk.postInit(networkId);
		return sdk;
	}

	/* ------------------------------ Settings ------------------------------- */

	/**
	 * Enable or disable prefix filtering.
	 *
	 * When `true` (default) the SDK accepts only messages whose 4-byte
	 * prefix matches the one supplied at {@link Kaspeak.create}.
	 * Set to `false` if you need to watch traffic from several Kaspeak-based
	 * apps on the same node.
	 *
	 * @param enabled – `true` to keep the filter on, `false` to turn it off.
	 */
	public setPrefixFilterEnabled(enabled: boolean): void {
		this.#prefixFilterEnabled = enabled;
	}

	/**
	 * Toggle Schnorr-signature verification for incoming payloads.
	 *
	 * Verification (`true`) guarantees authenticity but costs CPU; skipping it
	 * (`false`) boosts throughput at the expense of trust.  Choose according
	 * to your threat model.
	 *
	 * @param enabled – `true` to verify every payload, `false` to skip checks.
	 */
	public setSignatureVerificationEnabled(enabled: boolean): void {
		this.#signatureVerificationEnabled = enabled;
	}

	/**
	 * Enable dynamic fee selection based on current network load.
	 *
	 * Three buckets are available:
	 *  • `"priority"` — sub-second inclusion **(default)**
	 *  • `"normal"`   — inclusion within about a minute
	 *  • `"low"`      — inclusion within roughly an hour
	 *
	 * Call {@link setPriorityFee} only if you need to add a fixed extra tip
	 * on top of the chosen bucket.
	 *
	 * @param level – `"low"`, `"normal"` or `"priority"`.
	 */
	public setFeeLevel(level: FeeLevel): void {
		this.#feeLevel = level;
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

	/**
	 * Toggle automatic waiting for an RPC connection.
	 *
	 * When enabled (`true`), network-dependent methods such as
	 * `getBalance`, `createTransaction` and `sendTransaction`
	 * will silently await the internal “connect” event instead
	 * of throwing `Error: Node is not connected. Call connect() first.`
	 *
	 * Disabled (`false`, default) keeps the SDK in strict
	 * fail-fast mode, making connectivity issues explicit.
	 *
	 * @param enabled – `true` to wait for the connection,
	 *                  `false` to throw immediately.
	 */
	public setWaitForConnectionEnabled(enabled: boolean): void {
		this.#waitForConnectionEnabled = enabled;
	}

	public setTransactionMaturityDAA(maturityDAA: bigint) {
		this.kaspa.setTransactionMaturityDAA(maturityDAA);
	}

	/* ------------------------------ Kaspa RPC -------------------------------- */

	private async ensureConnected(): Promise<void> {
		if (this.kaspa && this.kaspa.isConnected) return;
		if (!this.#waitForConnectionEnabled) throw new Error("Node is not connected. Call connect() first.");
		logger.warn("Waiting for Kaspa RPC connection...");
		if (!this.#connectPromise) {
			this.#connectPromise = new Promise<void>((resolve) => {
				this.eventBus.once("node-connect", resolve);
			});
		}
		await this.#connectPromise;
	}

	public async connectNode(url?: string): Promise<void> {
		this.kaspa.on("block-added", async (block) => {
			const blockMeta = { hash: block.header.hash, timestamp: block.header.timestamp, daaScore: block.header.daaScore };
			await this.processTransactions(block.transactions, blockMeta);
		});
		this.kaspa.on("balance", ({ balance, utxoCount }) => {
			this.#balance = balance;
			this.#utxoCount = utxoCount;
			this.eventBus.emit("balance", { balance, utxoCount });
		});
		this.kaspa.on("mature-incoming-tx", (event: MatureIncomingTx) => {
			this.eventBus.emit("mature-incoming-tx", event);
		});
		this.kaspa.on("tx-reorg", (event: TxReorg) => {
			this.eventBus.emit("tx-reorg", event);
		});
		this.kaspa.on("connect", () => {
			this.eventBus.emit("node-connect", undefined);
			this.eventBus.emit("connect", undefined);
		});
		this.kaspa.on("disconnect", () => {
			this.eventBus.emit("node-disconnect", undefined);
			this.eventBus.emit("disconnect", undefined);
		});

		await this.kaspa.connect(this.#publicKeyHex, url);
		await this.kaspa.getServerInfo();

		await this.getBalance();
		logger.debug("Connected to node and subscribed to new blocks");
	}

	/** @deprecated This method is deprecated. Use connectNode(url) instead. */
	public async connect(url?: string): Promise<void> {
		return this.connectNode(url);
	}

	public get isConnected(): boolean {
		return this.kaspa.isConnected;
	}

	/**
	 * Fetch the current balance and UTXO count.
	 *
	 * If `address` is omitted the request is made for the SDK’s own
	 * wallet address and the internal `sdk.balance` / `sdk.utxoCount`
	 * caches are updated.  The value is reported in **KAS** (not sompi).
	 *
	 * @param address – Optional Kaspa address to query.
	 * @returns `{ balance, utxoCount }`
	 * @throws Error when the node is disconnected
	 */
	public async getBalance(address?: string): Promise<Balance> {
		await this.ensureConnected();
		const addr = address ?? this.#address;
		const { balance, utxoCount } = await this.kaspa.getBalance(addr);
		if (addr === this.#address) {
			this.#balance = balance;
			this.#utxoCount = utxoCount;
			this.eventBus.emit("balance", { balance, utxoCount });
		}
		return { balance, utxoCount };
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

	get kaspaWasm(): typeof import("kaspa-wasm") {
		return this.kaspa.kaspa;
	}

	get kaspaWasmEventBus() {
		return this.kaspa.eventBus;
	}

	get utxoProcessor() {
		return this.kaspa.utxoProcessor;
	}
	get rpcClient() {
		return this.kaspa.rpcClient;
	}
	get utxoContext() {
		return this.kaspa.utxoContext;
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

	/**
	 * Turn a `BaseMessage` instance into bytes ready for the wire.
	 *
	 *Pass `key` only when `message.requiresEncryption` is
	 * `true`; otherwise it is silently ignored.
	 *
	 * @param message – Message instance to encode.
	 * @param key     – Shared secret for encryption (optional).
	 * @returns Compressed (and maybe encrypted) byte buffer.
	 * @throws Error if encryption is required but no key is provided.
	 */
	public async encode(message: BaseMessage, key?: Uint8Array): Promise<Uint8Array> {
		return MessageSerializer.encode(message, key);
	}

	/**
	 * Reconstruct a typed message from raw payload bytes.
	 * On any failure an `UnknownMessage` is returned
	 *
	 * @param header – Parsed `MessageHeader` of the payload.
	 * @param data   – Raw bytes from the blockdag.
	 * @param key    – Shared secret for decryption when required.
	 * @returns Concrete message instance or `UnknownMessage`.
	 * @throws Error if decryption is required but no key is provided.
	 */
	public async decode<T extends BaseMessage>(header: MessageHeader, data: Uint8Array, key?: Uint8Array): Promise<T> {
		if (!this.isSignatureTypeAllowed(header.type, header.signatureType)) {
			throw new Error(`Signature type ${header.signatureType} is not allowed for message type ${header.type}`);
		}
		return MessageSerializer.decode(this.messageRegistry, header, data, key);
	}

	/**
	 * Register a custom message type and its optional worker callback.
	 *
	 * Every inbound payload whose `type` equals `ctor.messageType`
	 * (0-65535) is instantiated with `new ctor()`.  If `worker` is
	 * supplied it is invoked asynchronously for each such message.
	 * Re-registering the same `messageType` overrides the previous entry
	 *
	 * @param message – Class extending `BaseMessage`.
	 * @param worker  – Optional handler for the raw payload.
	 */
	public registerMessage(message: MessageClass, worker?: WorkerFn) {
		if (message.messageType < 0 || message.messageType > 65535)
			throw new Error(`Invalid messageType: ${message.messageType}. messageType must be between 0 and 65535.`);
		this.messageRegistry.register(message, worker);
	}

	private callWorker(header: MessageHeader, rawData: Uint8Array): void {
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

	public getXPointFromAddress(address: string | KaspaAddress): string {
		return this.kaspa.getXPointFromAddress(address);
	}

	/* --------------------------- Payload helpers --------------------------- */

	public async createPayload(
		outpointIds: string,
		messageCtor: MessageClass,
		identifier: SecretIdentifier | Identifier,
		data: Uint8Array
	): Promise<string> {
		const messageType = messageCtor.messageType;
		if (messageType < 0 || messageType > 65535)
			throw new Error(`Invalid messageType: ${messageType}. messageType must be between 0 and 65535.`);
		const signatureType = messageCtor.signatureType;
		const payload = new Payload(this.prefixBytes, messageType, identifier, this.#publicKey, signatureType, data);
		if (signatureType === "multi") {
			if (!(identifier instanceof SecretIdentifier)) throw new Error("SecretIdentifier is required for multi signature");
			await payload.sign(outpointIds, [this.#privateKey, identifier.secret]);
		} else {
			await payload.sign(outpointIds, [this.#privateKey]);
		}
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

	/**
	 * Drafts an unsigned “send-to-self” transaction sized for a Kaspeak payload.
	 *
	 * The SDK adds its fixed {@link HEADER_SIZE} to the supplied `dataLength`
	 * to reserve enough bytes in the payload field.  Fee bucket is taken from
	 * `#feeLevel`, plus any extra tip in `#priorityFeeSompi`.
	 *
	 * @param dataLength – Length of the **encoded message body**; used to
	 *                     calculate the required payload capacity.
	 * @param recipients Array of objects { address, amountKas },
	 *                where amountKas is a number or string in KAS.
	 * @returns Unsigned `Transaction` ready to be filled and signed.
	 */
	public async createTransaction(dataLength: number, recipients?: PaymentOutput[]): Promise<Transaction> {
		await this.ensureConnected();
		const payloadSize = BigInt(dataLength) + BigInt(HEADER_SIZE);
		return this.kaspa.createTransaction(this.#address, payloadSize, this.#priorityFeeSompi, this.#feeLevel, recipients);
	}

	/**
	 * Fills, signs and broadcasts the prepared transaction.
	 *
	 * `transaction` must come from {@link createTransaction}; `payload` is the
	 * hex string built by {@link createPayload}.
	 *
	 * @param transaction – Unsigned transaction.
	 * @param payload     – Hex-encoded Kaspeak payload to embed.
	 * @returns The resulting transaction ID.
	 */
	public async sendTransaction(transaction: Transaction, payload?: string): Promise<string> {
		await this.ensureConnected();
		const txid = await this.kaspa.sendTransaction(transaction, this.#privateKey, payload);
		return txid;
	}

	/**
	 * Sends an amount of **KAS** to one or several addresses.
	 *
	 * To send **messages**, use:
	 * createTransaction → createPayload → sendTransaction.
	 *
	 * @param recipients Array of objects { address, amountKas },
	 *                where amountKas is a number or string in KAS.
	 * @returns Promise<string> — tx-id of the created transaction.
	 *
	 * Errors:
	 * — invalid amount (cannot be converted to sompi);
	 * — no node connection (if auto-wait is disabled).
	 *
	 * @example
	 * const txid = await sdk.transferFunds([
	 *   { address: "kaspa:qz7vr…", amountKas: 2 },
	 *   { address: "kaspa:qp3jc…", amountKas: "0.3" }
	 * ]);
	 */
	public async transferFunds(recipients: PaymentOutput[]): Promise<string> {
		await this.ensureConnected();
		let transaction = await this.kaspa.createTransaction(this.#address, 0n, this.#priorityFeeSompi, this.#feeLevel, recipients);
		logger.debug(transaction);
		return await this.kaspa.sendTransaction(transaction, this.#privateKey);
	}

	private isSignatureTypeAllowed(messageType: number, actual: SignatureType): boolean {
		const ctor = this.messageRegistry.getCtor(messageType);
		if (!ctor) return true;
		const expected = ctor.signatureType;
		if (expected === "single") return true;
		return actual === "multi";
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
				const address = this.kaspa.getAddressFromPublicKey(payload.publicKey);
				const isOwn = this.#address === address;
				const outputs = tx.outputs.map((output) => {
					if (!(typeof output.scriptPublicKey === "string")) {
						throw new Error(`Output scriptPublicKey: ${output.scriptPublicKey} has wrong type. Tx skipped`);
					}
					const address = output.verboseData!.scriptPublicKeyAddress;
					const pubKey = (output.scriptPublicKey as string).slice(6, 70);

					const mapped: TransactionOutput = {
						amount: {
							kas: sompiToKaspaString(output.value),
							sompi: output.value
						},
						address,
						pubKey
					};
					return mapped;
				});
				const isPayment = outputs.filter((output) => output.pubKey !== bytesToHex(payload.publicKey).slice(2)).length > 0;

				logger.debug(`Payment: ${isPayment} , outputs:`, outputs);

				const header = MessageHeader.fromTransaction(
					prefix,
					txid,
					address,
					outputs,
					payload,
					isOwn,
					isPayment,
					blockMeta,
					consensusHash,
					this.#privateKey
				);
				if (!this.isSignatureTypeAllowed(header.type, header.signatureType)) {
					const ctor = this.messageRegistry.getCtor(header.type);
					const expected = ctor ? ctor.signatureType : "unknown";
					logger.warn(
						`Signature type mismatch: expected ${expected}, got ${header.signatureType}; txid=${txid}. Dropping message.`
					);
					continue;
				}
				this.eventBus.emit("message", { header, data: payload.data });
				if (prefix === this.prefixString) this.callWorker(header, payload.data);
			} catch (e) {
				if (e instanceof Error) logger.error(`Error processing transaction: ${e.message}, tx=>`, tx);
			}
		}
	}

	/* ---------------------------- Indexer queries --------------------------- */

	public connectIndexer(url?: string): void {
		if (this.indexer?.isConnected) return;
		this.indexer = new IndexerClient();
		this.indexer.on("message", (r) => {
			this.processIndexerResponse(r).catch(() => {});
		});
		this.indexer.on("connect", () => this.eventBus.emit("indexer-connect", undefined));
		this.indexer.on("disconnect", () => this.eventBus.emit("indexer-disconnect", undefined));
		this.indexer.connect(url);
	}

	public indexerSend(request: QueryRequest): void {
		if (!this.indexer) throw new Error("Indexer is not connected");
		logger.debug("IndexerSend", request);
		this.indexer.send(request);
	}

	public async indexerRequest(request: QueryRequest, parsed?: false): Promise<QueryResponse>;
	public async indexerRequest(request: QueryRequest, parsed: true): Promise<MessageEvent[]>;
	public async indexerRequest(request: QueryRequest, parsed?: boolean, timeout?: number): Promise<QueryResponse | MessageEvent[]> {
		if (!this.indexer) throw new Error("Indexer is not connected");
		if (!request.id) request.id = bytesToHex(randomBytes(16));
		logger.debug("IndexerRequest", request);
		const finalTimeout = timeout ?? 30000;
		const r = await this.indexer.sendQuery(request, finalTimeout);
		if (!r.ok) {
			if (parsed) return [];
			return r;
		}
		const events: MessageEvent[] = [];
		const filtered: MessageRecord[] = [];
		for (const rec of r.data) {
			const evt = await this.validateIndexerRecord(rec, r.id);
			if (evt) {
				events.push(evt);
				filtered.push(rec);
			}
		}
		if (parsed) return events;
		return { id: r.id, count: r.count, ok: true, data: filtered };
	}

	private async validateIndexerRecord(
		rec: MessageRecord,
		requestId?: string
	): Promise<{ header: MessageHeader; data: Uint8Array } | null> {
		const payload = Payload.fromIndexerRecord(rec);
		const prefix = payload.getPrefix();
		if (this.#prefixFilterEnabled && prefix !== this.prefixString) return null;
		if (this.#signatureVerificationEnabled) {
			const verified = await payload.verify(rec.consensusHash);
			if (!verified) {
				logger.warn("Indexer response signature verification failed", rec.txid);
				return null;
			}
		}
		const address = rec.address;
		const isOwn = this.#address === address;
		const header = MessageHeader.fromIndexerRecord(rec, prefix, payload, isOwn, this.#privateKey, requestId);
		if (!this.isSignatureTypeAllowed(header.type, header.signatureType)) {
			const ctor = this.messageRegistry.getCtor(header.type);
			const expected = ctor ? ctor.signatureType : "unknown";
			logger.warn(
				`Signature type mismatch (indexer): expected ${expected}, got ${header.signatureType}; txid=${rec.txid}. Dropping message.`
			);
			return null;
		}
		return { header, data: payload.data };
	}

	private async processIndexerResponse(r: QueryResponse): Promise<void> {
		if (!r.ok) {
			logger.warn("Indexer response error", r.id, r.err);
			return;
		}
		const reqId = r.id;
		logger.debug("Indexer response ok, reqId:", reqId, "count:", r.count, "records:", r.data.length);
		for (const rec of r.data) {
			try {
				const evt = await this.validateIndexerRecord(rec, reqId);
				if (!evt) continue;
				this.eventBus.emit("message", evt);
				if (evt.header.prefix === this.prefixString) this.callWorker(evt.header, evt.data);
			} catch (e) {
				logger.error("processIndexerResponse error", e);
			}
		}
	}
}
