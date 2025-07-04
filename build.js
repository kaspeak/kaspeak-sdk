import { build } from "esbuild";
import { rmSync, existsSync, mkdirSync, copyFileSync } from "fs";
import path from "path";

console.log("🗑️ Cleaning destination package...");
rmSync("pkg", { recursive: true, force: true });
console.log("✔️  Done");
console.log("========================================\n");

async function runBuildsSequentially() {
	await runBuild("Browser", {
		entryPoints: ["src/index.ts"],
		platform: "browser",
		bundle: true,
		outdir: "pkg/esm",
		format: "esm",
		target: ["esnext"],
		tsconfig: "tsconfig.json",
		loader: {
			".wasm": "file"
		},
		plugins: [copyZstdWasmPlugin("pkg/esm")],
		logLevel: "info",
		assetNames: "[name]",
		keepNames: true,
		minify: true
	});

	console.log("\n========================================\n");

	await runBuild("Node.js", {
		entryPoints: ["src/index.ts"],
		platform: "node",
		bundle: true,
		format: "cjs",
		target: ["node17"],
		tsconfig: "tsconfig.json",
		loader: {
			".wasm": "file"
		},
		plugins: [copyZstdWasmPlugin("pkg/cjs")],
		logLevel: "info",
		assetNames: "[name]",
		keepNames: true,
		outfile: "pkg/cjs/index.cjs",
		minify: true
	});
}

function runBuild(name, options) {
	console.log(`▶️ ${name} build started...`);
	return build(options).catch((e) => {
		console.error(`❌ ${name} build failed`, e);
		process.exit(1);
	});
}

function copyZstdWasmPlugin(outDir = "pkg") {
	return {
		name: "copy-zstd-wasm",
		setup(build) {
			build.onStart(() => {
				const zstdWasmPath = path.resolve("node_modules", "@bokuweb/zstd-wasm", "dist", "web", "zstd.wasm");
				const outWasmPath = path.resolve(outDir, "zstd.wasm");

				if (existsSync(zstdWasmPath)) {
					mkdirSync(outDir, { recursive: true });
					copyFileSync(zstdWasmPath, outWasmPath);
					console.log(`📦 zstd.wasm copied to ${outWasmPath}`);
				} else {
					console.warn(`⚠️  zstd.wasm not found at expected location: ${zstdWasmPath}`);
				}
			});
		}
	};
}

runBuildsSequentially();
