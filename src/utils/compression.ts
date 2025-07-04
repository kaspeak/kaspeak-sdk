import { compress, decompress, init } from "@bokuweb/zstd-wasm";

let zstdInitialized = false;

export async function ensureZstdInitialized(): Promise<void> {
	if (!zstdInitialized) {
		await init();
		zstdInitialized = true;
	}
}

export async function compressZstd(data: Uint8Array, level = 5): Promise<Uint8Array> {
	await ensureZstdInitialized();
	return compress(data, level);
}

export async function decompressZstd(data: Uint8Array): Promise<Uint8Array> {
	await ensureZstdInitialized();
	return decompress(data);
}
