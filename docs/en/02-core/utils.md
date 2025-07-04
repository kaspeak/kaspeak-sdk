### Utilities

#### bytesToHex

```js
const hex = bytesToHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
// "deadbeef"
```

* **`bytes`** – array of arbitrary length.
* **`byteSize`** *(optional)* – if specified, the output is padded with leading zeros to `byteSize * 2` characters.

---

#### bytesToInt

```js
const n = bytesToInt(new Uint8Array([0xff, 0x01]));
// 65281n
```

Returns an unsigned `bigint` value.

---

#### hexToBytes

```js
const buf = hexToBytes("deadbeef");
// Uint8Array(4) [ 222, 173, 190, 239 ]
```

* **Requirement**: string length must be **even**; otherwise, an exception is thrown.

---

#### hexToInt

```js
const n = hexToInt("ff01");
// 65281n
```

---

#### intToBytes

```js
const buf = intToBytes(0x1234n, 4);
// Uint8Array(4) [ 0, 0, 18, 52 ]
```

* **`byteSize`** – optional fixed length.
  If provided, the result is padded with leading zeros.
* When passing a `number`, internal conversion is performed via `BigInt()`.

---

#### intToHex

```js
const hex = intToHex(4660, 4);
// 00001234
```

Similar to `intToBytes`, but returns a string.

---

#### randomBytes

```js
const nonce = randomBytes(24);
// Uint8Array(24) [
//  133, 199,  42,  72, 64, 23, 157,
//   73, 233, 145,  94, 63, 78,  17,
//   24,  13, 182, 185, 52, 29,  38,
//  171, 215, 234
//]
```

* Delegates to `@noble/hashes/utils::randomBytes`, which uses
  the platform's cryptographically secure generator (Web Crypto in browsers / `node:crypto` in Node.js).
* **Guaranteed** to return a buffer of exactly the specified length.

---

#### Notes

1. All functions **do not modify** the input buffers — a new object is always created.
2. `intToHex` and `intToBytes` accept both `number` and `bigint`; however, for values > 2^53, you should use `bigint` to avoid loss of precision.
3. When working with keys and hashes, specify `byteSize` to guarantee a fixed length (e.g., `32` bytes / `64` characters).
