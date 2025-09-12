import { ec as EC } from "elliptic";
import { intToBytes, sha256FromBytes, sha256FromString, bytesToHex, intToHex, hexToBytes, bytesToInt } from "./utils";
import { Point, modN, Secp256k1 } from "./secp256k1";
import { signMessage, verifyMessage, PrivateKey } from "kaspa-wasm";
import { ensureKaspaInitialized } from "../modules/kaspa";
import { ProjectivePoint } from "@noble/secp256k1";

const elliptic = new EC("secp256k1");

const TAG_L = sha256FromString("Kaspeak/KeyAgg/L");
const TAG_A = sha256FromString("Kaspeak/KeyAgg/a");

function hashMessage(msg: Uint8Array | string): Uint8Array {
	return msg instanceof Uint8Array ? sha256FromBytes(msg) : sha256FromString(msg);
}

function privToHex(priv: bigint | number | Uint8Array): string {
	return typeof priv === "bigint" || typeof priv === "number" ? intToHex(priv, 32) : bytesToHex(priv, 32);
}

function msgToHex(msg: Uint8Array | string): string {
	return msg instanceof Uint8Array ? bytesToHex(msg) : msg;
}

function compressedXOnlyHexFromPoint(p: Point): string {
	return bytesToHex(p.toCompressed()).slice(2);
}

function tagHash(tagHashBytes: Uint8Array, payload: Uint8Array): Uint8Array {
	const buf = new Uint8Array(tagHashBytes.length * 2 + payload.length);
	buf.set(tagHashBytes, 0);
	buf.set(tagHashBytes, tagHashBytes.length);
	buf.set(payload, tagHashBytes.length * 2);
	return sha256FromBytes(buf);
}

function hashToScalar(bytes: Uint8Array): bigint {
	const h = bytesToInt(bytes);
	const r = modN(h);
	return r === 0n ? 1n : r;
}

class MultiSig {
	static aggregateFromPrivs(privs: Array<bigint | number | Uint8Array>) {
		if (privs.length === 0) throw new Error("Empty private keys");
		const ds: bigint[] = [];
		const xList: string[] = [];
		for (const pk of privs) {
			let d: bigint;
			if (typeof pk === "bigint") d = modN(pk);
			else if (typeof pk === "number") d = modN(BigInt(pk));
			else d = modN(bytesToInt(pk));
			if (d === 0n) throw new Error("Zero private key");
			ds.push(d);
			const P = Secp256k1.getPub(d);
			xList.push(compressedXOnlyHexFromPoint(P));
		}
		const L = MultiSig.computeL(xList);
		const coeffs = xList.map((x) => MultiSig.computeCoeff(L, x));
		let dAgg = 0n;
		for (let i = 0; i < ds.length; i++) dAgg = modN(dAgg + modN(ds[i] * coeffs[i]));
		return dAgg;
	}

	static aggregateFromPubs(pubs: Array<Point | string>) {
		if (pubs.length === 0) throw new Error("Empty public keys");
		const points: Point[] = pubs.map((p) => (typeof p === "string" ? Point.fromHex(p) : p));
		const xList = points.map((p) => compressedXOnlyHexFromPoint(p));
		const L = MultiSig.computeL(xList);
		const coeffs = xList.map((x) => MultiSig.computeCoeff(L, x));
		let sum: ProjectivePoint | null = null;
		for (let i = 0; i < points.length; i++) {
			const term = new ProjectivePoint(points[i].x, points[i].y, points[i].z).multiply(coeffs[i]);
			sum = sum ? sum.add(term) : term;
		}
		if (!sum || sum.equals(ProjectivePoint.ZERO)) throw new Error("Aggregated public key is infinity");
		return new Point(sum.px, sum.py, sum.pz);
	}

	static computeL(xList: string[]): Uint8Array {
		const sorted = [...xList].sort();
		const payload = hexToBytes(sorted.join(""));
		return tagHash(TAG_L, payload);
	}

	static computeCoeff(L: Uint8Array, xOnlyHex: string): bigint {
		const x = hexToBytes(xOnlyHex);
		const payload = new Uint8Array(L.length + x.length);
		payload.set(L, 0);
		payload.set(x, L.length);
		return hashToScalar(tagHash(TAG_A, payload));
	}
}

export class ECDSA {
	static sign(msg: Uint8Array | string, privateKey: Array<bigint | number | Uint8Array>): Uint8Array {
		if (privateKey.length === 0) throw new Error("Empty private keys");
		let priv: string;
		if (privateKey.length > 1) {
			const dAgg = MultiSig.aggregateFromPrivs(privateKey);
			priv = privToHex(dAgg);
		} else {
			priv = privToHex(privateKey[0]);
		}
		const keyPair = elliptic.keyFromPrivate(priv, "hex");
		const { r, s } = keyPair.sign(hashMessage(msg));
		const out = new Uint8Array(64);
		out.set(intToBytes(BigInt("0x" + r.toString(16)), 32), 0);
		out.set(intToBytes(BigInt("0x" + s.toString(16)), 32), 32);
		return out;
	}

	static verify(signature: Uint8Array, msg: Uint8Array | string, publicKey: Array<Point | string>): boolean {
		if (signature.length !== 64) return false;
		if (publicKey.length === 0) return false;
		let point: Point;
		try {
			if (publicKey.length > 1) {
				point = MultiSig.aggregateFromPubs(publicKey);
			} else {
				point = typeof publicKey[0] === "string" ? Point.fromHex(publicKey[0]) : publicKey[0];
			}
			const keyPub = elliptic.keyFromPublic(bytesToHex(point.toUncompressed()), "hex");
			const rHex = bytesToHex(signature.slice(0, 32));
			const sHex = bytesToHex(signature.slice(32));
			return keyPub.verify(hashMessage(msg), { r: rHex, s: sHex });
		} catch {
			return false;
		}
	}
}

export class Schnorr {
	static async sign(msg: Uint8Array | string, privateKey: Array<bigint | number | Uint8Array>): Promise<Uint8Array> {
		if (privateKey.length === 0) throw new Error("Empty private keys");
		let priv: string;
		if (privateKey.length > 1) {
			const dAgg = MultiSig.aggregateFromPrivs(privateKey);
			priv = privToHex(dAgg);
		} else {
			priv = privToHex(privateKey[0]);
		}
		await ensureKaspaInitialized();
		const signature = signMessage({
			message: msgToHex(msg),
			privateKey: new PrivateKey(priv)
		});
		return hexToBytes(signature);
	}

	static async verify(signature: Uint8Array, msg: Uint8Array | string, publicKey: Array<Point | string>): Promise<boolean> {
		if (signature.length !== 64) return false;
		if (publicKey.length === 0) return false;
		let point: Point;
		try {
			if (publicKey.length > 1) {
				point = MultiSig.aggregateFromPubs(publicKey);
			} else {
				point = typeof publicKey[0] === "string" ? Point.fromHex(publicKey[0]) : publicKey[0];
			}
			await ensureKaspaInitialized();
			const xOnly = bytesToHex(point.toCompressed()).slice(2);
			return verifyMessage({
				message: msgToHex(msg),
				signature: bytesToHex(signature),
				publicKey: xOnly
			});
		} catch {
			return false;
		}
	}
}
