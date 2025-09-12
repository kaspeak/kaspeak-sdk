import { bytesToHex } from "./utils";

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const REV: number[] = (() => {
	const r = new Array<number>(123).fill(-1);
	for (let i = 0; i < CHARSET.length; ++i) r[CHARSET.charCodeAt(i)] = i;
	return r;
})();

function conv5to8(data: number[]): Uint8Array {
	let acc = 0;
	let bits = 0;
	const out: number[] = [];
	for (const v of data) {
		acc = (acc << 5) | v;
		bits += 5;
		while (bits >= 8) {
			bits -= 8;
			out.push((acc >> bits) & 0xff);
		}
	}
	return Uint8Array.from(out);
}

function polymod(values: number[]): bigint {
	let c = 1n;
	for (const d of values) {
		const c0 = c >> 35n;
		c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d);
		if (c0 & 1n) c ^= 0x98f2bc8e61n;
		if (c0 & 2n) c ^= 0x79b76d99e2n;
		if (c0 & 4n) c ^= 0xf33e5fb3c4n;
		if (c0 & 8n) c ^= 0xae2eabe2a8n;
		if (c0 & 16n) c ^= 0x1e4f43e470n;
	}
	return c ^ 1n;
}

function checksum(payload: number[], prefix: string): bigint {
	const arr: number[] = [];
	for (const ch of prefix) arr.push(ch.charCodeAt(0) & 31);
	arr.push(0);
	const v = [...arr, ...payload, 0, 0, 0, 0, 0, 0, 0, 0];
	return polymod(v);
}

function decode(addr: string): { version: number; x: Uint8Array } {
	const [prefix, body] = addr.includes(":") ? addr.split(":") : ["kaspa", addr];
	const data: number[] = [];
	for (const ch of body) {
		const v = REV[ch.charCodeAt(0)];
		if (v < 0) throw new Error(`bad char '${ch}'`);
		data.push(v);
	}
	if (data.length < 8) throw new Error("bad payload");
	const payload = data.slice(0, -8);
	const chk = data.slice(-8);
	const chkVal = conv5to8(chk).reduce<bigint>((s, b) => (s << 8n) | BigInt(b), 0n);
	if (chkVal !== checksum(payload, prefix)) throw new Error("checksum");
	const buf = conv5to8(payload);
	if (buf.length < 33) throw new Error("payload too short");
	const version = buf[0];
	const x = buf.slice(1, 33);
	return { version, x };
}

export function addressToXPoint(addr: string): string {
	const { version, x } = decode(addr);
	if (version !== 0) throw new Error(`unsupported version ${version}`);
	return bytesToHex(x, 32);
}
