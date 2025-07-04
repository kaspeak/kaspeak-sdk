import { Point, Secp256k1 } from "./secp256k1";
import { bytesToInt, sha256FromBytes } from "./utils";

export class Peer {
	readonly address: string;
	readonly #publicKey: Uint8Array;
	readonly #signature: Uint8Array;
	readonly isOwn: boolean;
	readonly #privateKey: bigint;
	#publicKeyPoint: Point | null = null;
	#sharedSecret: Uint8Array | null = null;
	#chainKey: bigint | null = null;

	constructor(address: string, publicKey: Uint8Array, signature: Uint8Array, isOwn: boolean, privateKey: bigint) {
		this.address = address;
		this.#publicKey = new Uint8Array(publicKey);
		this.#signature = new Uint8Array(signature);
		this.isOwn = isOwn;
		this.#privateKey = privateKey;
	}

	get publicKey(): Uint8Array {
		return new Uint8Array(this.#publicKey);
	}

	get signature(): Uint8Array {
		return new Uint8Array(this.#signature);
	}

	private get publicKeyPoint(): Point {
		if (!this.#publicKeyPoint) this.#publicKeyPoint = Point.fromBytes(this.#publicKey);
		return this.#publicKeyPoint;
	}

	get sharedSecret(): Uint8Array {
		if (!this.#sharedSecret) this.#sharedSecret = Secp256k1.getSharedSecret(this.#privateKey, this.publicKeyPoint);
		return new Uint8Array(this.#sharedSecret);
	}

	get chainKey(): bigint {
		if (!this.#chainKey) {
			const chainKeyBytes = sha256FromBytes(this.sharedSecret);
			this.#chainKey = bytesToInt(chainKeyBytes);
		}
		return this.#chainKey;
	}
}
