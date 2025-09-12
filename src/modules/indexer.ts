import { EventBus } from "../sdk/event-bus";
import { QueryRequest, QueryResponse, IndexerEvents } from "../sdk/types";
import { randomBytes, bytesToHex } from "../crypto/utils";
import { DEFAULT_INDEXER_URL, INDEXER_BASE_DELAY, INDEXER_MAX_DELAY, INDEXER_BATCH_DELAY, INDEXER_BATCH_MAX } from "../sdk/constants";
import { logger } from "../utils/logger";

export class IndexerClient {
	private ws: WebSocket | null = null;
	private connected = false;
	private reconnectDelay = INDEXER_BASE_DELAY;
	private readonly _eventBus = new EventBus<IndexerEvents>();
	private readonly buffer: QueryRequest[] = [];
	private offline: string[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly pending = new Map<
		string,
		{ resolve: (r: QueryResponse) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
	>();

	public send(req: QueryRequest): void {
		this.buffer.push(req);
		this.scheduleFlush();
	}

	public async sendQuery(req: QueryRequest, timeout = 30000): Promise<QueryResponse> {
		if (!req.id) req.id = bytesToHex(randomBytes(16));
		return new Promise<QueryResponse>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(req.id!);
				reject(new Error("Indexer query timeout"));
			}, timeout);
			this.pending.set(req.id!, { resolve, reject, timer });
			this.send(req);
		});
	}

	public disconnect(): void {
		this.ws?.close();
	}

	private get socket(): WebSocket {
		if (!this.ws) throw new Error("WebSocket is not created");
		return this.ws;
	}

	public on<E extends keyof IndexerEvents>(e: E, fn: (d: IndexerEvents[E]) => void) {
		this._eventBus.on(e, fn);
	}

	public off<E extends keyof IndexerEvents>(e: E, fn: (d: IndexerEvents[E]) => void) {
		this._eventBus.off(e, fn);
	}

	private emit<E extends keyof IndexerEvents>(e: E, d: IndexerEvents[E]) {
		this._eventBus.emit(e, d);
	}

	get isConnected(): boolean {
		return this.connected;
	}

	public connect(url?: string): void {
		let WSImpl: any;
		if (typeof WebSocket !== "undefined") WSImpl = WebSocket;
		else {
			try {
				WSImpl = require("ws");
			} catch {
				throw new Error("Module 'ws' not found");
			}
		}
		this.ws = new WSImpl(url ?? DEFAULT_INDEXER_URL);
		this.socket.onopen = () => {
			this.connected = true;
			this.reconnectDelay = INDEXER_BASE_DELAY;
			for (const raw of this.offline) this.socket.send(raw);
			this.offline = [];
			this.emit("connect", undefined);
		};
		this.socket.onmessage = (e: MessageEvent | { data: string }) => this.handleMessage(e.data);
		this.socket.onclose = () => {
			this.scheduleReconnect();
			this.emit("disconnect", undefined);
		};
		this.socket.onerror = () => {
			if (this.socket.readyState === WebSocket.OPEN) {
				this.socket.close();
			}
		};
	}

	private scheduleReconnect(): void {
		if (this.connected) this.connected = false;
		setTimeout(() => {
			this.reconnectDelay = Math.min(this.reconnectDelay * 2, INDEXER_MAX_DELAY);
			this.connect(this.ws?.url);
		}, this.reconnectDelay);
	}

	private handleMessage(raw: string): void {
		let resp: QueryResponse | QueryResponse[];
		try {
			resp = JSON.parse(raw);
		} catch {
			return;
		}
		const list = Array.isArray(resp) ? resp : [resp];
		for (const r of list) {
			if (r.id && this.pending.has(r.id)) {
				const entry = this.pending.get(r.id)!;
				clearTimeout(entry.timer);
				this.pending.delete(r.id);
				entry.resolve(r);
			} else {
				this.emit("message", r);
			}
		}
	}

	private scheduleFlush(): void {
		if (this.flushTimer) return;
		this.flushTimer = setTimeout(() => this.flush(), INDEXER_BATCH_DELAY);
	}

	private flush(): void {
		this.flushTimer = null;
		if (!this.buffer.length) return;
		while (this.buffer.length) {
			const batch = this.buffer.splice(0, INDEXER_BATCH_MAX);
			const payload = JSON.stringify(batch);
			try {
				if (this.connected && this.socket.readyState === WebSocket.OPEN) {
					this.socket.send(payload);
				} else {
					this.offline.push(payload);
				}
			} catch (e) {
				logger.warn("Indexer send error", e);
				this.offline.push(payload);
			}
		}
	}
}
