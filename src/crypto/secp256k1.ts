import { bytesToInt, hexToBytes, intToBytes, modP, modInv, sha256FromBytes } from "./utils";
import { ProjectivePoint } from "@noble/secp256k1";

export const P = 115792089237316195423570985008687907853269984665640564039457584007908834671663n;
export const N = 115792089237316195423570985008687907852837564279074904382605163141518161494337n;
export const A = 0n;
export const B = 7n;
export const Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
export const Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

function sqr(x: bigint): bigint {
	return modP(x * x);
}
function mul(a: bigint, b: bigint): bigint {
	return modP(a * b);
}

export function sqrtModSecp256k1(n: bigint): bigint {
	let x2 = mul(sqr(n), n);
	let x3 = mul(sqr(x2), n);
	let x6 = x3;
	for (let i = 0; i < 3; i++) x6 = sqr(x6);
	x6 = mul(x6, x3);
	let x9 = x6;
	for (let i = 0; i < 3; i++) x9 = sqr(x9);
	x9 = mul(x9, x3);
	let x11 = x9;
	for (let i = 0; i < 2; i++) x11 = sqr(x11);
	x11 = mul(x11, x2);
	let x22 = x11;
	for (let i = 0; i < 11; i++) x22 = sqr(x22);
	x22 = mul(x22, x11);
	let x44 = x22;
	for (let i = 0; i < 22; i++) x44 = sqr(x44);
	x44 = mul(x44, x22);
	let x88 = x44;
	for (let i = 0; i < 44; i++) x88 = sqr(x88);
	x88 = mul(x88, x44);
	let x176 = x88;
	for (let i = 0; i < 88; i++) x176 = sqr(x176);
	x176 = mul(x176, x88);
	let x220 = x176;
	for (let i = 0; i < 44; i++) x220 = sqr(x220);
	x220 = mul(x220, x44);
	let x223 = x220;
	for (let i = 0; i < 3; i++) x223 = sqr(x223);
	x223 = mul(x223, x3);
	let t1 = x223;
	for (let i = 0; i < 23; i++) t1 = sqr(t1);
	t1 = mul(t1, x22);
	for (let i = 0; i < 6; i++) t1 = sqr(t1);
	t1 = mul(t1, x2);
	t1 = sqr(t1);
	const r = sqr(t1);
	if (modP(r * r) !== modP(n)) throw new Error("no sqrt");
	return r;
}

export class Point {
	constructor(
		public readonly x: bigint,
		public readonly y: bigint,
		public readonly z: bigint
	) {}

	static fromAffine(x: bigint, y: bigint): Point {
		return new Point(x, y, 1n);
	}

	static basePoint(): Point {
		return new Point(Gx, Gy, 1n);
	}

	static fromBytes(publicKey: Uint8Array): Point {
		if (publicKey.length === 33 && (publicKey[0] === 0x02 || publicKey[0] === 0x03)) {
			const x = bytesToInt(publicKey.slice(1));
			const isOdd = publicKey[0] === 0x03;
			return Secp256k1.computeY(x, isOdd);
		} else if (publicKey.length === 65 && publicKey[0] === 0x04) {
			const x = bytesToInt(publicKey.slice(1, 33));
			const y = bytesToInt(publicKey.slice(33, 65));
			return Point.fromAffine(x, y);
		} else {
			throw new Error("Invalid public key format");
		}
	}

	static fromHex(publicKey: string): Point {
		return Point.fromBytes(hexToBytes(publicKey));
	}

	equals(other: Point): boolean {
		return this.x === other.x && this.y === other.y && this.z === other.z;
	}

	negate(): Point {
		return new Point(this.x, modP(-this.y), this.z);
	}

	toAffine(): Point {
		if (this.z === 1n) {
			return new Point(this.x, this.y, 1n);
		}
		if (this.x === 0n && this.y === 0n && this.z === 0n) {
			return new Point(0n, 0n, 0n);
		}
		const iz = modInv(this.z, P);
		const ax = modP(this.x * iz);
		const ay = modP(this.y * iz);
		return Point.fromAffine(ax, ay);
	}

	toCompressed(): Uint8Array {
		const { x, y } = this.toAffine();
		const prefix = (y & 1n) === 0n ? 0x02 : 0x03;
		const xb = intToBytes(x, 32);
		const result = new Uint8Array(1 + xb.length);
		result[0] = prefix;
		result.set(xb, 1);
		return result;
	}

	toUncompressed(): Uint8Array {
		const { x, y } = this.toAffine();
		const prefix = 0x04;
		const xb = intToBytes(x, 32);
		const yb = intToBytes(y, 32);
		const result = new Uint8Array(1 + xb.length + yb.length);
		result[0] = prefix;
		result.set(xb, 1);
		result.set(yb, 1 + xb.length);
		return result;
	}

	toRawX(): Uint8Array {
		const { x } = this.toAffine();
		return intToBytes(x, 32);
	}
}

export class Secp256k1 {
	public static readonly Infinity = new Point(0n, 1n, 0n);

	public static computeY(x: bigint, isOdd: boolean): Point {
		const rhs = modP(((x * x) % P) * x + B);
		let y = sqrtModSecp256k1(rhs);
		if (((y & 1n) === 1n) !== isOdd) y = modP(-y);
		return Point.fromAffine(x, y);
	}

	public static mul(p: Point, priv: bigint | number | Uint8Array): Point {
		let privBigInt = typeof priv === "bigint" ? priv : typeof priv === "number" ? BigInt(priv) : bytesToInt(priv);
		privBigInt = privBigInt % N;
		if (this.isInfinity(p) || privBigInt === 0n) {
			return this.Infinity;
		}
		const nP = new ProjectivePoint(p.x, p.y, p.z);
		const product = nP.multiply(privBigInt);
		return new Point(product.px, product.py, product.pz);
	}

	public static getPub(priv: bigint | number | Uint8Array): Point {
		return this.mul(Point.basePoint(), priv);
	}

	public static getSharedSecret(privA: bigint | number | Uint8Array, pubB: Point): Uint8Array {
		const sharedPoint = this.mul(pubB, privA).toCompressed();
		return sha256FromBytes(sha256FromBytes(sharedPoint));
	}

	private static isInfinity(p: Point): boolean {
		return p.x === 0n && p.y === 1n && p.z === 0n;
	}
}
