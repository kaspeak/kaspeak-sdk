/**
 * LimitedHashSet is a fixed-capacity, order-aware wrapper around a native
 * `Set`.
 *
 * • **Constant-time lookup** – membership checks delegate to the internal
 *   `Set<T>`.
 * • **Insertion order is preserved** – a FIFO queue (`Array<T>`) tracks the
 *   order in which elements were added.
 * • **Automatic eviction** – once the configured `capacity` is reached, the
 *   oldest item is removed to make room for a new one.
 *
 * Typical use-cases include:
 *   - Deduplication of “recently seen” identifiers or messages
 *   - Maintaining a rolling cache of the last _N_ items
 *   - Throttling repetitive events by key
 *
 * Complexity:
 *   • `tryAdd`, `has`, and eviction are all **O(1)** time.
 *   • Memory footprint is **O(capacity)**.
 *
 * @template T The type of items stored in the collection.
 */
export class LimitedHashSet<T> {
	/** FIFO queue that records insertion order for eviction. */
	private queue: T[] = [];

	/** Backing a hash set providing constant-time membership checks. */
	private set: Set<T> = new Set();

	/**
	 * Create a new LimitedHashSet with a fixed maximum size.
	 *
	 * @param capacity Maximum number of elements the set can hold.
	 * @throws RangeError If `capacity` is less than 1.
	 */
	constructor(private readonly capacity: number) {
		if (capacity < 1) throw new RangeError("capacity must be positive");
	}

	/**
	 * Attempt to insert `value` into the set.
	 *
	 * Behavior:
	 *  1. If `value` already exists, **no changes** are made and `false` is
	 *     returned.
	 *  2. If the set is full (`size === capacity`), the oldest element is
	 *     evicted before `value` is inserted.
	 *
	 * @param value Element to insert.
	 * @returns `true` if `value` was added, `false` if it was already present.
	 */
	tryAdd(value: T): boolean {
		if (this.set.has(value)) return false;

		if (this.queue.length === this.capacity) {
			const oldest = this.queue.shift()!;
			this.set.delete(oldest);
		}
		this.queue.push(value);
		this.set.add(value);
		return true;
	}

	/**
	 * Check whether `value` is currently contained in the set.
	 *
	 * @param value Element to look up.
	 * @returns `true` if present, otherwise `false`.
	 */
	has(value: T): boolean {
		return this.set.has(value);
	}

	/**
	 * Current number of elements stored.
	 *
	 * @readonly
	 */
	get size(): number {
		return this.queue.length;
	}

	/**
	 * Remove **all** elements, resetting the structure to empty state.
	 */
	clear(): void {
		this.queue.length = 0;
		this.set.clear();
	}
}
