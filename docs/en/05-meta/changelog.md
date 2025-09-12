# Changelog

## 1.0.0 — 2025-08-25
* **BREAKING:** Protocol updated to version 2. Added 1 extra byte for `SignatureType`.
* **BREAKING:** `sdk.createPayload` now takes the message class itself as the second argument instead of `messageType`.
* **BREAKING:** `sdk.connect` is deprecated. Use `sdk.connectNode` instead.
* **BREAKING:** Subscriptions to `connect`/`disconnect` events are deprecated. Use `node-connect`/`node-disconnect` instead.
* `kaspa.RpcClient`, `kaspa.UtxoProcessor`, `kaspa.UtxoContext`, as well as the initialized `kaspa-wasm` module, are now directly accessible via `sdk` instance getters for more fine-grained network interaction.
* Added new event subscriptions: `indexer-connect`, `indexer-disconnect`, `mature-incoming-tx`, `tx-reorg`.
* Added indexer interaction methods: `sdk.connectIndexer`, `sdk.indexerSend`, `sdk.indexerRequest`.
* Added method `sdk.getXPointFromAddress`.
* Added method `sdk.setTransactionMaturityDAA`.
* `sdk.createTransaction` now accepts an additional optional parameter `recipients`, enabling sending data along with fund transfers.
* `MessageHeader` now includes additional fields: `live`, `signatureType`, `isPayment`, `txOutputs`, and an optional `requestId`.
* Minor codebase fixes and improvements.

## 0.1.0 — 2025-07-14
* **BREAKING:** Fixed an error that prevented sending a message on the *mainnet* network.
* **BREAKING:** Subscription event `KaspeakMessageReceived` renamed to `message`.
* **BREAKING:** The `sdk.getBalance()` method now returns an object `{ balance, utxoCount }` instead of a `number`.
* **BREAKING:** The `networkId` parameter is now passed to `Kaspeak.create` instead of `sdk.connect`.
* `sdk.balance` and `sdk.utxoCount` now always contain up-to-date values.
* Added event subscriptions: `balance`, `connect`, `disconnect`.
* Added method `sdk.setWaitForConnectionEnabled(enabled)`.
* Added dynamic fee size determination based on network load.
* Added method `sdk.setFeeLevel(FeeLevel)`.
* Added method `sdk.transferFunds(recipients)` for transferring and withdrawing funds.
* Internal `debug` messages are now hidden.
* `kaspa-wasm` updated to version `1.0.1`.
* Minor codebase fixes and improvements.

## 0.0.2 — 2025-07-06
* First public SDK release
