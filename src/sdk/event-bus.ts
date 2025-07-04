import { logger } from "../utils/logger";

/**
 * A callback that is invoked when an event is emitted.
 *
 * @template T - The data payload type for a specific event.
 */
type Listener<T> = (data: T) => void;

/**
 * A simple, type-safe publish/subscribe (pub/sub) event bus.
 *
 * Type parameter `TEvents` must be an object map that uses event names
 * (keys) mapped to their corresponding payload data types (values).
 *
 * Example:
 * ```ts
 * interface MyEvents {
 *   "user:login": { id: string; token: string };
 *   "socket:error": Error;
 * }
 *
 * const bus = new EventBus<MyEvents>();
 *
 * bus.on("user:login", ({ id, token }) => authenticate(id, token));
 * bus.emit("socket:error", new Error("Connection lost"));
 * ```
 */
export class EventBus<TEvents extends Record<string, any>> {
	/**
	 * Internal registry of listeners grouped by event name.
	 * Each key is optional because no listener might be registered yet.
	 */
	private listeners: {
		[K in keyof TEvents]?: Listener<TEvents[K]>[];
	} = {};

	/**
	 * Subscribe to an event with a listener that will be invoked
	 * every time the event is emitted.
	 *
	 * @typeParam K - The key of the event in `TEvents`.
	 * @param event - The event name to subscribe to.
	 * @param listener - Callback that receives the event payload.
	 */
	on<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): void {
		if (!this.listeners[event]) {
			this.listeners[event] = [];
		}
		this.listeners[event]!.push(listener);
	}

	/**
	 * Subscribe to an event **once**.
	 * The listener is automatically removed after the first invocation.
	 *
	 * @typeParam K - The key of the event in `TEvents`.
	 * @param event - The event name to subscribe to once.
	 * @param listener - Callback that receives the event payload.
	 */
	once<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): void {
		const onceWrapper = (data: TEvents[K]) => {
			this.off(event, onceWrapper);
			listener(data);
		};
		this.on(event, onceWrapper);
	}

	/**
	 * Unsubscribe a previously registered listener from an event.
	 * If the listener is not found, the call is silently ignored.
	 *
	 * @typeParam K - The key of the event in `TEvents`.
	 * @param event - The event name to unsubscribe from.
	 * @param listener - The exact listener function passed to `on`/`once`.
	 */
	off<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): void {
		const arr = this.listeners[event];
		if (!arr) return;
		this.listeners[event] = arr.filter((fn) => fn !== listener);
	}

	/**
	 * Emit an event, invoking all current listeners asynchronously
	 * via `queueMicrotask`. Any listener errors are caught and printed
	 * to `console.error` so that other listeners still execute.
	 *
	 * @typeParam K - The key of the event in `TEvents`.
	 * @param event - The event key to emit.
	 * @param data - The payload to pass to each listener.
	 */
	emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
		const arr = this.listeners[event];
		if (!arr) return;

		// Clone to avoid mutation issues if listeners are removed during emit.
		for (const fn of [...arr]) {
			queueMicrotask(() => {
				try {
					fn(data);
				} catch (e) {
					logger.error("[EventBus] Listener error:", e);
				}
			});
		}
	}
}
