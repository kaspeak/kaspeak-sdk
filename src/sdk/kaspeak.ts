import { ensureKaspaInitialized, KaspaWasm } from "../wasm/kaspa";
import { ensureZstdInitialized } from "../utils/compression";
import { ITransaction, Transaction, PublicKey as KaspaPublicKey } from "kaspa-wasm";
import { LimitedHashSet } from "../utils/limited-hash-set";
import { EventBus } from "./event-bus";
import { BaseMessage, MessageHeader, Payload } from "../models";
import { MessageClass, MessageRegistry, WorkerFn } from "./message-registry";
import { MessageSerializer } from "./message-serializer";
import { hexToBytes, hexToInt, bytesToInt, sha256FromBytes } from "../crypto/utils";
import { SecretIdentifier, Identifier, Secp256k1, Point } from "../crypto";
import { HEADER_SIZE, DEFAULT_NETWORK_ID } from "./constants";
import { logger } from "../utils/logger";
import type { Balance, KaspeakEvents, ConversationKeys, BlockMeta, NetworkId, FeeLevel, PaymentOutput } from "./types";

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

	/* ------------------------------ Kaspa RPC -------------------------------- */

	private async ensureConnected(): Promise<void> {
		if (this.kaspa && this.kaspa.isConnected) return;
		if (!this.#waitForConnectionEnabled) throw new Error("Node is not connected. Call connect() first.");
		logger.warn("Waiting for Kaspa RPC connection...");
		if (!this.#connectPromise) {
			this.#connectPromise = new Promise<void>((resolve) => {
				this.eventBus.once("connect", resolve);
			});
		}
		await this.#connectPromise;
	}

	public async connect(url?: string): Promise<void> {
		this.kaspa.on("block-added", async (block) => {
			const blockMeta = { hash: block.header.hash, timestamp: block.header.timestamp, daaScore: block.header.daaScore };
			await this.processTransactions(block.transactions, blockMeta);
		});
		this.kaspa.on("balance", ({ balance, utxoCount }) => {
			this.#balance = balance;
			this.#utxoCount = utxoCount;
			this.eventBus.emit("balance", { balance, utxoCount });
		});
		this.kaspa.on("connect", () => this.eventBus.emit("connect", undefined));
		this.kaspa.on("disconnect", () => this.eventBus.emit("disconnect", undefined));

		await this.kaspa.connect(this.#publicKeyHex, url);
		await this.kaspa.getServerInfo();

		await this.getBalance();
		logger.debug("Connected to node and subscribed to new blocks");
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

	/**
	 * Drafts an unsigned “send-to-self” transaction sized for a Kaspeak payload.
	 *
	 * The SDK adds its fixed {@link HEADER_SIZE} to the supplied `dataLength`
	 * to reserve enough bytes in the payload field.  Fee bucket is taken from
	 * `#feeLevel`, plus any extra tip in `#priorityFeeSompi`.
	 *
	 * @param dataLength – Length of the **encoded message body**; used to
	 *                     calculate the required payload capacity.
	 * @returns Unsigned `Transaction` ready to be filled and signed.
	 */
	public async createTransaction(dataLength: number): Promise<Transaction> {
		await this.ensureConnected();
		const payloadSize = BigInt(dataLength) + BigInt(HEADER_SIZE);
		return this.kaspa.createTransaction(this.#address, payloadSize, this.#priorityFeeSompi, this.#feeLevel);
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
	public async sendTransaction(transaction: Transaction, payload: string): Promise<string> {
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
		const txid = await this.kaspa.sendTransaction(transaction, this.#privateKey);
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
						logger.debug(`Payload signature verification failed for txId: ${txid}`);
						continue;
					}
				}
				logger.debug("Processing transaction:", tx);
				const messageHeader = this.createMessageHeaderFromTransaction(txid, prefix, payload, blockMeta, consensusHash);
				this.eventBus.emit("message", { header: messageHeader, data: payload.data });
				if (prefix === this.prefixString) this.callWorker(messageHeader, payload.data);
			} catch (e) {
				if (e instanceof Error) logger.error(`Error processing transaction: ${e.message}, tx=> ${tx}`);
			}
		}
	}
}
