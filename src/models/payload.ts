import { MARKER, PROTOCOL_VERSION, HEADER_SIZE } from "../sdk/constants";
import { Schnorr, SecretIdentifier, Identifier, bytesToHex, hexToBytes } from "../crypto";

const dv = new DataView(new ArrayBuffer(2));
function readU16(buf: Uint8Array, off: number): number {
	dv.setUint8(0, buf[off]);
	dv.setUint8(1, buf[off + 1]);
	return dv.getUint16(0, true);
}
function writeU16(buf: Uint8Array, off: number, val: number) {
	dv.setUint16(0, val, true);
	buf[off] = dv.getUint8(0);
	buf[off + 1] = dv.getUint8(1);
}

export class Payload {
	marker: Uint8Array;
	version: number;
	prefix: Uint8Array;
	type: number;
	id: Uint8Array;
	publicKey: Uint8Array;
	signature: Uint8Array;
	data: Uint8Array;

	constructor(prefix: Uint8Array, type: number, identifier: SecretIdentifier | Identifier, publicKey: Uint8Array, data: Uint8Array) {
		if (type >>> 0 > 0xffff) throw new Error(`Type ${type} is out of 16‑bit range`);
		if (publicKey.length !== 33) throw new Error("publicKey must be 33 bytes");
		this.marker = MARKER;
		this.version = PROTOCOL_VERSION;
		this.prefix = new Uint8Array(prefix);
		this.type = type;
		this.id = identifier.bytes;
		this.publicKey = new Uint8Array(publicKey);
		this.signature = new Uint8Array(64);
		this.data = new Uint8Array(data);
	}

	static fromBytes(bytes: Uint8Array): Payload {
		if (bytes.length < HEADER_SIZE) throw new Error("Invalid payload size");
		let o = 0;
		if (!bytes.subarray(0, 4).every((v, i) => v === MARKER[i])) throw new Error("Bad marker");
		o += 4;
		if (bytes[o++] !== PROTOCOL_VERSION) throw new Error("Bad version");
		const prefix = bytes.subarray(o, o + 4);
		o += 4;
		const type = readU16(bytes, o);
		o += 2;
		const id = bytes.subarray(o, o + 33);
		const identifier = Identifier.fromBytes(id);
		o += 33;
		const publicKey = bytes.subarray(o, o + 33);
		o += 33;
		const signature = bytes.subarray(o, o + 64);
		o += 64;
		const dataLen = readU16(bytes, o);
		o += 2;
		const data = bytes.subarray(o, o + dataLen);
		if (data.length !== dataLen) throw new Error("Data length mismatch");
		const p = new Payload(prefix, type, identifier, publicKey, data);
		p.signature = signature;
		return p;
	}

	static fromHex(data: string): Payload {
		return Payload.fromBytes(hexToBytes(data));
	}

	toBytes(): Uint8Array {
		const total = HEADER_SIZE + this.data.length;
		const out = new Uint8Array(total);
		let o = 0;
		out.set(this.marker, o);
		o += 4;
		out[o++] = this.version;
		out.set(this.prefix, o);
		o += 4;
		writeU16(out, o, this.type);
		o += 2;
		out.set(this.id, o);
		o += 33;
		out.set(this.publicKey, o);
		o += 33;
		out.set(this.signature, o);
		o += 64;
		writeU16(out, o, this.data.length & 0xffff);
		o += 2;
		out.set(this.data, o);
		return out;
	}

	toHex(): string {
		return bytesToHex(this.toBytes());
	}

	private buildMessage(outIds: string): string {
		return [
			bytesToHex(this.marker),
			this.version.toString(16).padStart(2, "0"),
			bytesToHex(this.prefix),
			this.type.toString(16).padStart(4, "0"),
			bytesToHex(this.id),
			bytesToHex(this.publicKey),
			bytesToHex(this.data),
			outIds
		].join("");
	}

	async sign(outIds: string, priv: bigint | number): Promise<void> {
		this.signature = await Schnorr.sign(this.buildMessage(outIds), priv);
	}

	async verify(outIds: string): Promise<boolean> {
		const pubHex = bytesToHex(this.publicKey);
		return Schnorr.verify(this.signature, this.buildMessage(outIds), pubHex);
	}

	getSize(): number {
		return this.toBytes().length;
	}

	getPrefix(): string {
		return new TextDecoder().decode(this.prefix).replace(/\0/g, "");
	}
}
