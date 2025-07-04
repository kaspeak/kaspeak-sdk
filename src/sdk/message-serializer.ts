/**
 * Message serialization / deserialization helper.
 *
 * Responsibilities:
 *  1. Transform an in-memory {@link BaseMessage} instance to a `Uint8Array`
 *     ready for wire transport (`encode`).
 *  2. Perform the inverse operation, reconstructing a concrete message instance
 *     from raw bytes (`decode`).
 *
 * The pipeline executed by both directions is symmetrical
 *
 * • Encryption is applied only when the concrete message class signals
 *   {@link BaseMessage.requiresEncryption} **and** a key is provided.
 * • Decryption, decompression, and CBOR decoding all acts as error boundaries.
 *   Any failure produces an {@link UnknownMessage} so the caller can still
 *   progress without crashing.
 */

import { decode as cborDecode, encode as cborEncode } from "cborg";
import { compressZstd, decompressZstd } from "../utils/compression";
import { randomBytes } from "../crypto";
import { ZSTD_COMPRESSION_LEVEL } from "./constants";
import { XChaCha20Poly1305 } from "@stablelib/xchacha20poly1305";
import { BaseMessage, MessageHeader, UnknownMessage } from "../models";
import { MessageRegistry } from "./message-registry";
import { logger } from "../utils/logger";

export class MessageSerializer {
	/**
	 * Serialize a {@link BaseMessage} subclass to a `Uint8Array`.
	 *
	 * Steps:
	 *  1. Convert the message to a plain JS object via `toPlainObject()`.
	 *  2. Encode that object using CBOR (compact binary JSON-like format).
	 *  3. Compress the resulting bytes with Zstandard.
	 *  4. Optionally, encrypt the payload with XChaCha20-Poly1305
	 *     (24-byte nonce + ciphertext) if the class requests encryption.
	 *
	 * @typeParam T - Concrete message type extending {@link BaseMessage}.
	 * @param message - Message instance to encode.
	 * @param key     - Optional encryption key; must be provided when
	 *                  `message.requiresEncryption` is `true`.
	 * @throws Error  - When encryption is required but the key is missing.
	 * @returns Serialized bytes ready for transport.
	 */
	static async encode<T extends BaseMessage>(message: T, key?: Uint8Array): Promise<Uint8Array> {
		// Validate encryption parameters
		if (message.requiresEncryption && !key) {
			throw new Error(`Encryption key is required but not provided for ${typeof message}`);
		}
		if (!message.requiresEncryption && key) {
			logger.warn(`Message ${typeof message} does not require encryption, key is ignored.`);
		}

		// 1) Convert to a plain object
		const plainObj = message.toPlainObject();

		// 2) Encode via CBOR
		const cborBuf = cborEncode(plainObj);

		// 3) Compress
		const compressed = await compressZstd(cborBuf, ZSTD_COMPRESSION_LEVEL);

		// 4) Encrypt if required
		if (message.requiresEncryption && key) {
			const nonce = randomBytes(24);
			const aead = new XChaCha20Poly1305(key);
			const ciphertext = aead.seal(nonce, compressed);

			// Prepend nonce to ciphertext for transport
			const combined = new Uint8Array(nonce.length + ciphertext.length);
			combined.set(nonce, 0);
			combined.set(ciphertext, nonce.length);

			return combined;
		} else {
			return compressed;
		}
	}

	/**
	 * Deserialize raw bytes into an instance of the appropriate message class.
	 *
	 * The method is symmetric to {@link encode} and performs:
	 *  1. (Optional) Decryption with XChaCha20-Poly1305.
	 *  2. Decompression (Zstd).
	 *  3. CBOR decoding.
	 *  4. Hydration of the concrete class via its `fromPlainObject` method.
	 *
	 * Reliability principle:
	 *  Any error during the pipeline results in an {@link UnknownMessage}
	 *  instance, preventing the entire consumption pipeline from crashing.
	 *
	 * @param messageRegistry - Central registry used to create the correct
	 *                          concrete message class from `header.type`.
	 * @param header          - Already parsed {@link MessageHeader} that came
	 *                          with the raw payload.
	 * @param data            - Raw bytes (possibly encrypted) to decode.
	 * @param key             - Optional decryption key used for decryption when
	 *                          the message class requires it.
	 * @returns Either a fully hydrated message instance or an
	 *          {@link UnknownMessage} describing the failure reason.
	 * @throws Error - When decryption is required but the key is missing.
	 */
	static async decode(messageRegistry: MessageRegistry, header: MessageHeader, data: Uint8Array, key?: Uint8Array): Promise<any> {
		let instance = messageRegistry.create(header.type);
		instance.header = header;

		// Validate decryption parameters
		if (instance.requiresEncryption && !key) {
			throw new Error(`Encryption key is required but not provided for ${typeof instance}`);
		}
		if (!instance.requiresEncryption && key) {
			logger.warn(`Message ${typeof instance} does not require encryption, key is ignored.`);
		}

		/* ------------------------------------------------------------------
		 * Phase 1 – Decryption (if applicable)
		 * -----------------------------------------------------------------*/
		let plaintext: Uint8Array;
		try {
			if (instance.requiresEncryption && key) {
				const nonce = data.slice(0, 24);
				const ciphertext = data.slice(24);
				const aead = new XChaCha20Poly1305(key);
				const maybePlain = aead.open(nonce, ciphertext);

				if (!maybePlain) {
					logger.warn(`Decryption failed: invalid key for ${typeof instance}`);
					return new UnknownMessage(data, "Decryption failed: invalid key", 0);
				}
				if (maybePlain.length === 0) {
					logger.warn(`Decryption failed: empty decrypted data for ${typeof instance}`);
					return new UnknownMessage(data, "Decryption failed: empty decrypted data", 1);
				}
				plaintext = maybePlain;
			} else {
				plaintext = data;
			}
		} catch (e: any) {
			logger.warn(`Decryption failed for ${typeof instance}`, e);
			return new UnknownMessage(data, `Decryption failed: ${e.message}`, 2);
		}

		/* ------------------------------------------------------------------
		 * Phase 2 – Decompression
		 * -----------------------------------------------------------------*/
		let decompressed: Uint8Array;
		try {
			decompressed = await decompressZstd(plaintext);
		} catch (e: any) {
			logger.warn(`Decompress failed for ${typeof instance}`, e);
			return new UnknownMessage(data, `Decompress failed: ${e.message}`, 3);
		}

		/* ------------------------------------------------------------------
		 * Phase 3 – CBOR decoding
		 * -----------------------------------------------------------------*/
		let obj: any;
		try {
			obj = cborDecode(decompressed);
		} catch (e: any) {
			logger.warn(`CBOR decode failed for ${typeof instance}`, e);
			return new UnknownMessage(data, `CBOR decode failed: ${e.message}`, 4);
		}

		/* ------------------------------------------------------------------
		 * Phase 4 – Hydration via fromPlainObject
		 * -----------------------------------------------------------------*/
		try {
			if (typeof instance.fromPlainObject === "function") {
				instance.fromPlainObject(obj);
			}
		} catch (e: any) {
			logger.warn(`fromPlainObject failed for ${typeof instance}`, e);
			return new UnknownMessage(data, `fromPlainObject failed: ${e.message}`, 5);
		}
		return instance;
	}
}
