import { MARKER, PROTOCOL_VERSION, HEADER_SIZE } from "../sdk/constants";
import { Schnorr, SecretIdentifier, Identifier, bytesToHex, hexToBytes, intToHex } from "../crypto";
import type { MessageRecord, SignatureType } from "../sdk/types";

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

function sigTypeToByte(t: SignatureType): number {
	return t === "multi" ? 2 : 1;
}

export class Payload {
	marker: Uint8Array;
	version: number;
	prefix: Uint8Array;
	type: number;
	id: Uint8Array;
	publicKey: Uint8Array;
	signatureType: number;
	signature: Uint8Array;
	data: Uint8Array;

	constructor(
		prefix: Uint8Array,
		type: number,
		identifier: SecretIdentifier | Identifier,
		publicKey: Uint8Array,
		signatureType: number | SignatureType,
		data: Uint8Array
	) {
		if (type >>> 0 > 0xffff) throw new Error(`Type ${type} is out of 16-bit range`);
		if (publicKey.length !== 33) throw new Error("publicKey must be 33 bytes");
		this.marker = MARKER;
		this.version = PROTOCOL_VERSION;
		this.prefix = new Uint8Array(prefix);
		this.type = type;
		this.id = identifier.bytes;
		this.publicKey = new Uint8Array(publicKey);
		this.signatureType = typeof signatureType === "string" ? sigTypeToByte(signatureType) : signatureType;
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
		const signatureType = bytes[o++];
		const signature = bytes.subarray(o, o + 64);
		o += 64;
		const dataLen = readU16(bytes, o);
		o += 2;
		const data = bytes.subarray(o, o + dataLen);
		if (data.length !== dataLen) throw new Error("Data length mismatch");
		const p = new Payload(prefix, type, identifier, publicKey, signatureType, data);
		p.signature = signature;
		return p;
	}

	static fromHex(data: string): Payload {
		return Payload.fromBytes(hexToBytes(data));
	}

	static fromIndexerRecord(rec: MessageRecord): Payload {
		const prefix = new TextEncoder().encode(rec.prefix.padEnd(4, "\0").slice(0, 4));
		const typeNum = rec.type;
		const identifier = Identifier.fromHex(rec.identifier);
		const publicKey = hexToBytes(rec.publicKey);
		const data = hexToBytes(rec.data);
		const sigType = sigTypeToByte(rec.signatureType);
		const p = new Payload(prefix, typeNum, identifier, publicKey, sigType, data);
		p.signature = hexToBytes(rec.signature);
		return p;
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
		out[o++] = this.signatureType;
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
			intToHex(this.version, 1),
			bytesToHex(this.prefix),
			intToHex(this.type, 2),
			bytesToHex(this.id),
			bytesToHex(this.publicKey),
			intToHex(this.signatureType, 1),
			bytesToHex(this.data),
			outIds
		].join("");
	}

	async sign(outIds: string, privs: Array<bigint | number | Uint8Array>): Promise<void> {
		this.signature = await Schnorr.sign(this.buildMessage(outIds), privs);
	}

	async verify(outIds: string): Promise<boolean> {
		const pubHex = bytesToHex(this.publicKey);
		if (this.signatureType === 2) {
			const idHex = bytesToHex(this.id);
			return Schnorr.verify(this.signature, this.buildMessage(outIds), [pubHex, idHex]);
		}
		return Schnorr.verify(this.signature, this.buildMessage(outIds), [pubHex]);
	}

	getSize(): number {
		return this.toBytes().length;
	}

	getPrefix(): string {
		return new TextDecoder().decode(this.prefix).replace(/\0/g, "");
	}
}
