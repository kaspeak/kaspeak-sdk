# История изменений

## 0.1.0 — 2025-07-14
* **BREAKING:** Исправлена ошибка, не позволяющая отправить сообщение в сети *mainnet*.
* **BREAKING:** Подписка на событие `KaspeakMessageReceived` переименована в `message`.
* **BREAKING:** Метод `sdk.getBalance()` теперь возвращает объект `{ balance, utxoCount }` вместо `number`.
* **BREAKING:** Параметр `networkId` теперь передаётся в `Kaspeak.create`, а не в `sdk.connect`.
* `sdk.balance` и `sdk.utxoCount` теперь всегда содержат актуальные значения.
* Добавлены подписки на события `balance`, `connect`, `disconnect`.
* Добавлен метод `sdk.setWaitForConnectionEnabled(enabled)`.
* Добавлено динамическое определение размера комиссии в зависимости от нагрузки сети.
* Добавлен метод `sdk.setFeeLevel(FeeLevel)`.
* Добавлен метод `sdk.transferFunds(recipients)`, реализующий возможность перевода и вывода средств.
* Внутренние `debug`-сообщения скрыты.
* `kaspa-wasm` обновлен до версии `1.0.1`.
* Мелкие исправления и улучшения кодовой базы.

## 0.0.2 — 2025-07-06
* Первая публичная версия SDK