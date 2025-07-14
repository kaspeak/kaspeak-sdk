# Changelog

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