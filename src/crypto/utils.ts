import { sha256 } from "@noble/hashes/sha2";
import { randomBytes as nobleRandomBytes } from "@noble/hashes/utils";

const P = 115792089237316195423570985008687907853269984665640564039457584007908834671663n;
const TWO_512 = 1n << 512n;
const MU = TWO_512 / P;

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
const DECODE: Uint8Array = (() => {
	const t = new Uint8Array(103);
	for (let i = 0; i < 10; i++) t[48 + i] = i;
	for (let i = 0; i < 6; i++) {
		t[65 + i] = 10 + i;
		t[97 + i] = 10 + i;
	}
	return t;
})();

export function randomBytes(n: number): Uint8Array {
	return nobleRandomBytes(n);
}

export function sha256FromBytes(bytes: Uint8Array): Uint8Array {
	return sha256(bytes);
}

export function sha256FromHex(hexData: string): Uint8Array {
	const bytes = hexToBytes(hexData);
	return sha256(bytes);
}

export function sha256FromString(data: string): Uint8Array {
	const bytes = new TextEncoder().encode(data);
	return sha256(bytes);
}

export function mod(a: bigint, m: bigint): bigint {
	const r = a % m;
	return r >= 0n ? r : r + m;
}

export function modP(x: bigint): bigint {
	let z = x;
	if (z < 0n) z = (z % P) + P;
	if (z < P) return z;
	const q = (z * MU) >> 512n;
	let r = z - q * P;
	if (r < 0n) r += P;
	while (r >= P) r -= P;
	return r;
}

function egcdLehmer(a: bigint, b: bigint) {
	if (a <= 0n || b <= 0n) throw new RangeError("a,b > 0");
	let x = 1n,
		y = 0n,
		u = 0n,
		v = 1n;
	const BASE = 1n << 30n;
	while (b) {
		if (b < BASE) break;
		const n = b.toString(2).length - 30;
		let ah = a >> BigInt(n),
			bh = b >> BigInt(n);
		let A = 1n,
			B = 0n,
			C = 0n,
			D = 1n;
		while (bh + C && bh + D) {
			const q = (ah + A) / (bh + C);
			const q2 = (ah + B) / (bh + D);
			if (q !== q2) break;
			[ah, bh] = [bh, ah - q * bh];
			[A, C] = [C, A - q * C];
			[B, D] = [D, B - q * D];
		}
		if (B === 0n) {
			const q = a / b;
			[a, b] = [b, a - q * b];
			[x, u] = [u, x - q * u];
			[y, v] = [v, y - q * v];
		} else {
			const tmp = A * a + B * b;
			b = C * a + D * b;
			a = tmp;
			const tmpX = A * x + B * u;
			u = C * x + D * u;
			x = tmpX;
			const tmpY = A * y + B * v;
			v = C * y + D * v;
			y = tmpY;
		}
	}
	while (b) {
		const q = a / b;
		[a, b] = [b, a - q * b];
		[x, u] = [u, x - q * u];
		[y, v] = [v, y - q * v];
	}
	return { g: a, x, y };
}

export function modInv(a: bigint, n: bigint): bigint {
	const { g, x } = egcdLehmer(mod(a, n), n);
	if (g === 1n) return mod(x, n);
	if (g === -1n) return mod(-x, n);
	throw new RangeError(`${a} not invertible mod ${n}`);
}

export function powMod(base: bigint, exponent: bigint, modulus: bigint): bigint {
	let result = 1n;
	let b = mod(base, modulus);
	let e = exponent;
	while (e > 0n) {
		if (e & 1n) {
			result = mod(result * b, modulus);
		}
		e >>= 1n;
		b = mod(b * b, modulus);
	}
	return result;
}

export function powModW4(base: bigint, exponent: bigint, modulus: bigint): bigint {
	if (exponent === 0n) return 1n;
	const W = 4;
	const tbl: bigint[] = Array(1 << W);
	tbl[0] = 1n;
	tbl[1] = base % modulus;
	for (let i = 2; i < 1 << W; i++) tbl[i] = (tbl[i - 1] * tbl[1]) % modulus;
	const bits = exponent.toString(2);
	const first = bits.length % W || W;
	let result = tbl[parseInt(bits.slice(0, first), 2)];
	let i = first;
	while (i < bits.length) {
		for (let k = 0; k < W; k++) result = (result * result) % modulus;
		const chunk = parseInt(bits.slice(i, i + W), 2);
		if (chunk) result = (result * tbl[chunk]) % modulus;
		i += W;
	}
	return result;
}

export function bytesToHex(bytes: Uint8Array, byteSize?: number): string {
	let out = "";
	for (let i = 0; i < bytes.length; i++) out += HEX[bytes[i]];
	return byteSize === undefined ? out : out.padStart(byteSize * 2, "0");
}

export function hexToBytes(hex: string): Uint8Array {
	if (hex.length & 1) throw new Error("hex length must be even");
	const len = hex.length >> 1;
	const arr = new Uint8Array(len);
	for (let i = 0, j = 0; i < len; i++, j += 2) {
		arr[i] = (DECODE[hex.charCodeAt(j)] << 4) | DECODE[hex.charCodeAt(j + 1)];
	}
	return arr;
}

export function bytesToInt(bytes: Uint8Array): bigint {
	return BigInt("0x" + bytesToHex(bytes));
}

export function intToHex(a: bigint | number, byteSize?: number): string {
	const big = typeof a === "number" ? BigInt(a) : a;
	const out = big.toString(16);
	return byteSize === undefined ? out : out.padStart(byteSize * 2, "0");
}

export function intToBytes(integer: bigint | number, byteSize?: number): Uint8Array {
	const big = typeof integer === "number" ? BigInt(integer) : integer;
	const hexString = intToHex(big, byteSize);
	return hexToBytes(hexString);
}

export function hexToInt(hex: string): bigint {
	return BigInt("0x" + hex);
}
