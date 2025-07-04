import log from "loglevel";

export type LogLevel = log.LogLevelDesc;

const isNode = typeof window === "undefined" && typeof process !== "undefined" && !!process.stdout;

function getEnvLogLevel(): LogLevel | undefined {
	if (isNode) return process.env?.KASPEAK_LOG_LEVEL as LogLevel | undefined;
	return undefined;
}

function getLocalStorageLogLevel(): LogLevel | undefined {
	if (typeof window !== "undefined" && window.localStorage) {
		try {
			return window.localStorage.getItem("KASPEAK_LOG_LEVEL") as LogLevel | undefined;
		} catch {
			return undefined;
		}
	}
	return undefined;
}

const logger = log.getLogger("kaspeak");
logger.setDefaultLevel(getEnvLogLevel() ?? getLocalStorageLogLevel() ?? "warn");

function colorize(level: string, message: string): string {
	const colors: Record<string, string> = {
		trace: "\x1b[90m",
		debug: "\x1b[36m",
		info: "\x1b[32m",
		warn: "\x1b[33m",
		error: "\x1b[31m"
	};
	const color = colors[level] || "\x1b[0m";
	return `${color}${message}\x1b[0m`;
}

const originalFactory = logger.methodFactory;
logger.methodFactory = (method, lvl, name) => {
	const rawMethod = originalFactory(method, lvl, name);
	return (...args: unknown[]) => {
		const timestamp = new Date().toISOString();
		const level = method.toUpperCase();
		if (isNode) {
			rawMethod(`${colorize(method, `[${timestamp}] [${level}] [KaspeakSDK]:`)}`, ...args);
		} else {
			rawMethod(`%c[${timestamp}] [${level}] [KaspeakSDK]:`, "color:#673ab7;font-weight:bold", ...args);
		}
	};
};
logger.setLevel(logger.getLevel());

export function setLogLevel(level: LogLevel) {
	logger.setLevel(level);
	if (typeof window !== "undefined" && window.localStorage) {
		try {
			window.localStorage.setItem("KASPEAK_LOG_LEVEL", String(level));
		} catch {
			logger.warn("Не удалось сохранить уровень логирования в localStorage");
		}
	}
}

export { logger };
