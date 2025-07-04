import { ec as EC } from "elliptic";
import BN from "bn.js";
import { intToBytes, randomBytes, sha256FromBytes, sha256FromString, bytesToHex, intToHex, hexToBytes } from "./utils";
import { Point } from "./secp256k1";
import { signMessage, verifyMessage, PrivateKey } from "kaspa-wasm";
import { ensureKaspaInitialized } from "../wasm/kaspa";

const elliptic = new EC("secp256k1");

function hashMessage(msg: Uint8Array | string): Uint8Array {
	return msg instanceof Uint8Array ? sha256FromBytes(msg) : sha256FromString(msg);
}

function privToHex(priv: bigint | number | Uint8Array): string {
	return typeof priv === "bigint" || typeof priv === "number" ? intToHex(priv, 32) : bytesToHex(priv, 32);
}

function msgToHex(msg: Uint8Array | string): string {
	return msg instanceof Uint8Array ? bytesToHex(msg) : msg;
}

export class ECDSA {
	static sign(msg: Uint8Array | string, priv: bigint | number | Uint8Array): Uint8Array {
		const keyPair = elliptic.keyFromPrivate(privToHex(priv), "hex");
		const { r, s } = (keyPair.sign as any)(hashMessage(msg), { k: () => new BN(randomBytes(32)) });
		const out = new Uint8Array(64);
		out.set(intToBytes(r, 32), 0);
		out.set(intToBytes(s, 32), 32);
		return out;
	}

	static verify(signature: Uint8Array, msg: Uint8Array | string, publicKey: Point | string): boolean {
		if (signature.length !== 64) return false;
		const point = typeof publicKey === "string" ? Point.fromHex(publicKey) : publicKey;
		const keyPub = elliptic.keyFromPublic(point.toUncompressed());
		const rHex = bytesToHex(signature.slice(0, 32));
		const sHex = bytesToHex(signature.slice(32));
		return keyPub.verify(hashMessage(msg), { r: rHex, s: sHex });
	}
}

export class Schnorr {
	static async sign(msg: Uint8Array | string, priv: bigint | number | Uint8Array): Promise<Uint8Array> {
		await ensureKaspaInitialized();
		const signature = signMessage({
			message: msgToHex(msg),
			privateKey: new PrivateKey(privToHex(priv))
		});
		return hexToBytes(signature);
	}

	static async verify(signature: Uint8Array, msg: Uint8Array | string, publicKey: Point | string): Promise<boolean> {
		if (signature.length !== 64) return false;
		await ensureKaspaInitialized();
		const xOnly = (publicKey instanceof Point ? bytesToHex(publicKey.toCompressed()) : publicKey).slice(2);
		return verifyMessage({
			message: msgToHex(msg),
			signature: bytesToHex(signature),
			publicKey: xOnly
		});
	}
}
