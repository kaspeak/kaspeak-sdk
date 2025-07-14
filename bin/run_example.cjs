#!/usr/bin/env node
const { spawn } = require("child_process");
const path = require("path");

const style = (code) => (txt) => `\x1b[${code}m${txt}\x1b[0m`;
const bold = style(1);
const cyan = style(36);
const green = style(32);
const yellow = style(33);
const red = style(31);

function showHelp() {
	const examples = ["quick-start", "secret-message", "delegate"];
	const colWidth = Math.max(...examples.map((e) => e.length)) + 2;

	console.log(bold("\nKaspeak SDK examples\n"));
	console.log(`${cyan("Usage:")} ${green("kaspeak-example")} ${yellow("<name>")}\n`);
	console.log(cyan("Available examples:"));

	for (let i = 0; i < examples.length; i += 3) {
		const row = examples
			.slice(i, i + 3)
			.map((e) => e.padEnd(colWidth))
			.join("");
		console.log(`  ${row}`);
	}
	console.log();
}

(async () => {
	const [name, ...rest] = process.argv.slice(2);

	if (!name) {
		showHelp();
		process.exit(1);
	}

	const file = path.resolve(__dirname, "..", "examples", `${name}.cjs`);

	try {
		await new Promise((ok, fail) => {
			const p = spawn(process.execPath, [file, ...rest], { stdio: "inherit" });
			p.on("exit", (code) => (code === 0 ? ok() : fail()));
		});
	} catch {
		console.error(red(`\n✖ Example "${name}" not found\n`));
		showHelp();
		process.exit(1);
	}
})();
