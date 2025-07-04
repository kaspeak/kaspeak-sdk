import { BaseMessage, MessageHeader } from "../models";

/**
 * Constructor signature for a message class that can be instantiated by the
 * {@link MessageRegistry}.
 *
 * The implementing class **must** expose two static properties:
 *   • `messageType` – a unique numeric identifier for the message
 *   • `requiresEncryption` – whether the message payload must be encrypted
 *
 * @template T - A concrete subclass of {@link BaseMessage}.
 */
export interface MessageClass<T extends BaseMessage = BaseMessage> {
	/** Standard JavaScript constructor. */
	new (...args: any[]): T;
	/** Unique numeric code for the message kind. */
	messageType: number;
	/** Indicates if the message requires encryption when transported. */
	requiresEncryption: boolean;
}

/**
 * Alias for numeric message identifiers used as a registry key.
 */
export type MessageType = number;

/**
 * Callback executed when raw data for a specific message type is received.
 *
 * A worker typically:
 *   1. Decrypts the payload if needed
 *   2. Parses or transforms the byte array
 *   3. Performs domain-specific side effects (saving to DB, emitting events, …)
 *
 * @param header  - Deserialized {@link MessageHeader} extracted from the
 *                  surrounding transaction/packet.
 * @param rawData - `Uint8Array` of the message payload (encrypted or plain).
 */
export type WorkerFn = (header: MessageHeader, rawData: Uint8Array) => void;

/**
 * Internal structure stored in the registry for quick look-up.
 */
interface RegistryEntry {
	cls: MessageClass;
	worker?: WorkerFn;
}

/**
 * Central runtime registry that maps message-type codes to their
 * corresponding constructor and an optional worker function.
 *
 * Usage example:
 * ```ts
 * const registry = new MessageRegistry()
 *   .register(ChatMessage, handleChatMessage)
 *   .register(FileTransferMessage);
 *
 * // Incoming data with type-code 42:
 * const msg = registry.create(42);          // -> ChatMessage instance
 * const worker = registry.getWorker(42);    // -> handleChatMessage
 * ```
 */
export class MessageRegistry {
	/**
	 * Holds the mapping from `messageType` to {@link RegistryEntry}.
	 * Keys are kept as plain numbers for O(1) retrieval.
	 */
	private classes: Record<MessageType, RegistryEntry> = {};

	/**
	 * Register a message constructor with an optional processing worker.
	 *
	 * If the same `messageType` is registered twice, the latest call overwrites
	 * the previous entry.
	 *
	 * @param ctor   - The message class to register.
	 * @param worker - Optional handler that will process raw payloads of this
	 *                 message type.
	 * @returns `this` for fluent chaining.
	 */
	register(ctor: MessageClass, worker?: WorkerFn): this {
		this.classes[ctor.messageType] = { cls: ctor, worker };
		return this;
	}

	/**
	 * Instantiate a new message object by its `MessageType` key.
	 *
	 * @throws Error if the type is unknown.
	 */
	create(key: MessageType): BaseMessage {
		const entry = this.classes[key];
		if (!entry) {
			throw new Error(`Class "${key}" not registered`);
		}
		return new entry.cls();
	}

	/**
	 * Retrieve the worker function associated with a given `MessageType` key.
	 *
	 * @throws Error if the type is unknown.
	 */
	getWorker(key: MessageType): WorkerFn | undefined {
		const entry = this.classes[key];
		if (!entry) {
			throw new Error(`Class "${key}" not found in registry`);
		}
		return entry.worker;
	}

	/**
	 * Get the constructor registered for a given `MessageType`.
	 * Returns `undefined` if the type is unknown.
	 */
	getCtor(key: MessageType): MessageClass | undefined {
		return this.classes[key]?.cls;
	}
}
