import { Point, N, Secp256k1 } from "./secp256k1";
import { bytesToHex, hexToBytes, bytesToInt, hexToInt, powModW4, modInv, randomBytes } from "./utils";
import { Schnorr } from "./signatures";

/**
 * Identifier
 *
 * A compact, chain-movable label built from a compressed secp256k1 point.
 *
 * Concept
 * -------
 *   ID(i) = BasePoint · chainKey^i  (mod n)      ← “chain-key derivation”
 *
 * where
 *   - *BasePoint*  – any long-term public key;
 *   - *chainKey*   – 32-byte scalar shared by sender and receiver;
 *   - i ≥ 1        – message index.
 *
 * Features
 * --------
 *   - Created from hexadecimal string / raw bytes, or derived with `fromChainKey`.
 *   - `next()` / `prev()` move the label forward or backward along the chain
 *     when the caller knows the same *chainKey*.
 *   - `verify()` checks a Schnorr signature against this public point.
 *
 * Note: Without the matching *chainKey* two identifiers look like independent
 * points and cannot be linked.
 */
export class Identifier {
	readonly hex: string;
	readonly #bytes: Uint8Array;
	#identifierPoint: Point | null = null;

	protected constructor(hex: string, bytes: Uint8Array) {
		this.hex = hex;
		this.#bytes = bytes;
	}

	/** Build Identifier from identifier in hex (33 bytes). */
	static fromHex(hex: string): Identifier {
		const bytes = hexToBytes(hex);
		if (bytes.length !== 33) {
			throw new Error(`Invalid Identifier length: expected 33 bytes, got ${bytes.length}`);
		}
		return new Identifier(hex.toLowerCase(), bytes);
	}

	/** Build Identifier from identifier bytes (33 bytes). */
	static fromBytes(bytes: Uint8Array): Identifier {
		if (bytes.length !== 33) {
			throw new Error(`Invalid Identifier length: expected 33 bytes, got ${bytes.length}`);
		}
		const hex = bytesToHex(bytes);
		return new Identifier(hex, new Uint8Array(bytes));
	}

	/**
	 * Derive **ID(i)** = PK · chainKey^i (mod n).
	 * @param chainKey Shared `chainKey` (bigint).
	 * @param index    Message index **≥ 1**.
	 * @param publicKey Base public point PK(A).
	 * @throws RangeError if `index = 0`.
	 */
	static fromChainKey(chainKey: bigint, index: number | bigint, publicKey: Point | string | Uint8Array): Identifier {
		if (index < 1 || index < 1n) throw new RangeError("index must be ≥ 1");
		const publicKeyPoint =
			publicKey instanceof Point
				? publicKey
				: typeof publicKey === "string"
					? Point.fromHex(publicKey)
					: Point.fromBytes(publicKey);
		const ki = powModW4(chainKey, BigInt(index), N);
		const p = Secp256k1.mul(publicKeyPoint, ki);
		return Identifier.fromBytes(p.toCompressed());
	}

	/**
	 * Retrieves a copy of the internal byte array.
	 *
	 * @returns A new `Uint8Array` instance containing the bytes.
	 */
	get bytes(): Uint8Array {
		return new Uint8Array(this.#bytes);
	}

	private get identifierPoint(): Point {
		if (!this.#identifierPoint) this.#identifierPoint = Point.fromBytes(this.#bytes);
		return this.#identifierPoint;
	}

	/**
	 * Determines whether this identifier is equal to another by comparing their hexadecimal representations.
	 *
	 * @param other - The identifier to compare with this instance.
	 * @returns True if both identifiers have the same hexadecimal string; otherwise, false.
	 */
	equals(other: Identifier): boolean {
		return this.hex === other.hex;
	}

	private jump(factor: bigint): Identifier {
		const p = Secp256k1.mul(this.identifierPoint, factor);
		return Identifier.fromBytes(p.toCompressed());
	}

	/**
	 * Jump **forward** `count` positions in the chain:
	 * `ID_(i+count) = ID_i · chainKey^count`
	 *
	 * @param chainKey Shared `chainKey`
	 * @param count    How many messages ahead (default = 1).
	 * @returns        Next identifier in the sequence.
	 */
	next(chainKey: bigint, count: number | bigint = 1): Identifier {
		const c = BigInt(count);
		const step = c === 1n ? chainKey : powModW4(chainKey, c, N);
		return this.jump(step);
	}

	/**
	 * Jump **backward** `count` positions in the chain:
	 * `ID_(i-count) = ID_i · chainKey_inv^count`
	 * (section 4, bullet 2).
	 *
	 * @param chainKey  Shared `chainKey`
	 * @param count     How many messages back (default = 1).
	 * @returns         Previous identifier in the sequence.
	 */
	prev(chainKey: bigint, count: number | bigint = 1): Identifier {
		const kInv = modInv(chainKey, N);
		const c = BigInt(count);
		const step = c === 1n ? kInv : powModW4(kInv, c, N);
		return this.jump(step);
	}

	/**
	 * Verifies the provided signature against the message using the Schnorr algorithm.
	 *
	 * @param sig - The signature to verify, represented as a Uint8Array.
	 * @param msg - The message to validate, which can be either a string or a Uint8Array.
	 * @returns A Promise that resolves to a boolean indicating whether the signature is valid.
	 */
	async verify(sig: Uint8Array, msg: Uint8Array | string): Promise<boolean> {
		return Schnorr.verify(sig, msg, this.hex);
	}
}

/**
 * SecretIdentifier
 *
 * Identifier that additionally stores its private scalar.
 *
 * Creation
 * --------
 *   - `fromSecret()` – wrap an existing secret (bigint / bytes / hex).
 *   - `random()`     – generate a new cryptographically secure secret.
 *
 * Extra capability
 * ----------------
 *   - `sign()` – produce a Schnorr signature for arbitrary data.
 *
 * Public-only factories inherited from {@link Identifier} are disabled to
 * emphasise that a SecretIdentifier must originate from a secret, not from
 * public material.
 */
export class SecretIdentifier extends Identifier {
	readonly secret: bigint;

	private constructor(secretBigInt: bigint) {
		const cpub = Secp256k1.getPub(secretBigInt).toCompressed();
		super(bytesToHex(cpub), cpub);
		this.secret = secretBigInt;
	}

	/** Wrap existing secret (bigint | number | bytes | hex). */
	static fromSecret(secret: bigint | number | Uint8Array | string): SecretIdentifier {
		let d: bigint;
		if (typeof secret === "bigint") d = secret;
		else if (typeof secret === "number") d = BigInt(secret);
		else if (secret instanceof Uint8Array) d = bytesToInt(secret);
		else d = hexToInt(secret);
		d = d % N;
		if (d === 0n) throw new Error("secret must be non-zero");
		return new SecretIdentifier(d);
	}

	/** @deprecated not available on SecretIdentifier. Use Identifier instead. */
	static fromHex(_: string): never {
		throw new Error("Method isn't supported for SecretIdentifier. Use Identifier instead.");
	}

	/** @deprecated not available on SecretIdentifier. Use Identifier instead. */
	static fromBytes(_: Uint8Array): never {
		throw new Error("Method isn't supported for SecretIdentifier. Use Identifier instead.");
	}

	/** @deprecated not available on SecretIdentifier. Use Identifier instead. */
	static fromChainKey(): never {
		throw new Error("Method isn't supported for SecretIdentifier. Use Identifier instead.");
	}

	/** Generate random 32-byte secret (cryptographically secure RNG). */
	static random(): SecretIdentifier {
		return SecretIdentifier.fromSecret(randomBytes(32));
	}

	/** Produce Schnorr signature of `msg` with the stored secret scalar. */
	async sign(msg: Uint8Array | string): Promise<Uint8Array> {
		return Schnorr.sign(msg, this.secret);
	}
}
