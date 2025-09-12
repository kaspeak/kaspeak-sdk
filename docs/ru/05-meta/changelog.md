# История изменений

## 1.0.0 — 2025-08-25
* **BREAKING:** Протокол обновлен до версии 2. Добавлен 1 дополнительный байт для `SignatureType`
* **BREAKING:** `sdk.createPayload` принимает вторым аргументом не `messageType`, а сам класс сообщения. 
* **BREAKING:** `sdk.connect` устарело. Используйте `sdk.connectNode`
* **BREAKING:** Подписки на события `connect`/`disconnect` устарели. Используйте `node-connect`/`node-disconnect` соответственно.
* Используемые `kaspa.RpcClient`, `kaspa.UtxoProcessor`, `kaspa.UtxoContext` а так же сам проиницализированный модуль `kaspa-wasm` теперь доступен прямо через геттеры экземпляра `sdk` для более тонкого взаимодействия с сетью.
* Добавлены подписки на события `indexer-connect`, `indexer-disconnect`, `mature-incoming-tx`, `tx-reorg`.
* Добавлены методы для взаимодействия с индексатором: `sdk.connectIndexer`, `sdk.indexerSend`, `sdk.indexerRequest`
* Добавлен метод `sdk.getXPointFromAddress`
* Добавлен метод `sdk.setTransactionMaturityDAA`
* `sdk.createTransaction` теперь принимает дополнительный необязательный параметр `recipients`, реализующий возможность отправки данных вместе с переводом средств.
* В `MessageHeader` добавлены дополнительные поля `live`, `signatureType`, `isPayment`, `txOutputs` и опциональный `requestId`.
* Мелкие исправления и улучшения кодовой базы.

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