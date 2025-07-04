# Модели данных

Здесь описаны основные структуры данных, используемые в **Kaspeak SDK** для формирования, отправки и приёма сообщений.

---

## Структура Payload

`Payload` — это структура данных, которая вставляется в транзакцию Kaspa. Каждый payload содержит полезную нагрузку (данные) и необходимую служебную информацию.

Payload всегда начинается с уникального маркера `KSPK` (0x4B53454B).

### Формат payload-а

| Смещение | Поле        | Размер | Описание                                    |
|----------|-------------|--------|---------------------------------------------|
| 0        | marker      | 4      | Маркер `KSPK` (идентификатор SDK)           |
| 4        | version     | 1      | Версия протокола (сейчас = 1)               |
| 5        | prefix      | 4      | Префикс приложения (ASCII)                  |
| 9        | type        | 2      | Тип сообщения (`messageType`)               |
| 11       | id          | 33     | Идентификатор (`Identifier`) сообщения      |
| 44       | publicKey   | 33     | Публичный ключ отправителя                  |
| 77       | signature   | 64     | Schnorr-подпись payload-а                   |
| 141      | dataLen     | 2      | Длина данных (в байтах)                     |
| 143      | data        | N      | Данные (CBOR, сжатые, возможно зашифрованные) |

---

## Объект Peer

`Peer` — это объект, описывающий отправителя сообщения. Он формируется при получении сообщения и хранит информацию о публичном ключе и вычисленном общем секрете (для зашифрованных сообщений).

### Поля объекта `Peer`

| Поле           | Тип           | Описание                                                |
|----------------|---------------|---------------------------------------------------------|
| `address`      | `string`      | Адрес отправителя (Kaspa-адрес)                         |
| `publicKey`    | `Uint8Array`  | Публичный ключ отправителя (secp256k1, 33 байта)        |
| `signature`    | `Uint8Array`  | Schnorr-подпись payload-а                               |
| `isOwn`        | `boolean`     | `true`, если сообщение отправлено самим SDK             |
| `sharedSecret` | `Uint8Array`  | Общий секрет (ключ для шифрования), вычисляется лениво  |
| `chainKey`     | `bigint`      | Скаляр для генерации цепочек идентификаторов сообщений  |

---

## Identifier и SecretIdentifier

Эти объекты представляют криптографические идентификаторы сообщений. Они обеспечивают приватность и связность сообщений в рамках диалогов.

### Identifier

Компактная метка-точка на эллиптической кривой secp256k1, позволяющая однозначно идентифицировать сообщение, не раскрывая их порядок посторонним.

| Поле    | Тип           | Описание                                              |
|---------|---------------|-------------------------------------------------------|
| `hex`   | `string`      | Hex-представление точки (66 символов, сжатый формат)  |
| `bytes` | `Uint8Array`  | Бинарное представление идентификатора (33 байта)      |

Ключевые методы:

- `fromHex(hex)` / `fromBytes(buf)` — создание из существующей точки.
- `fromChainKey(chainKey, i, PK)` — создание на основе цепочки идентификаторов.
- `next(chainKey, n)` / `prev(chainKey, n)` — получение следующего/предыдущего идентификатора в цепочке.
- `verify(sig, msg)` — проверка Schnorr-подписи относительно идентификатора.

---

### SecretIdentifier

Расширяет `Identifier`, добавляя приватный ключ (скаляр) для создания подписей.

| Поле     | Тип      | Описание                              |
|----------|----------|---------------------------------------|
| `secret` | `bigint` | Закрытый скаляр для подписи сообщений |

Дополнительные методы:

- `sign(msg)` — создание Schnorr-подписи сообщения с помощью секретного ключа.

> **Важно:** `SecretIdentifier` нельзя создавать из публичных данных. Используйте фабрики:  
> - `SecretIdentifier.fromSecret(secret)`  
> - `SecretIdentifier.random()`

---

## Объект MessageHeader

`MessageHeader` содержит всю необходимую информацию о сообщении и его отправителе. Он передаётся в обработчики зарегистрированных сообщений.

### Поля объекта `MessageHeader`:

| Поле                  | Тип          | Описание                                     |
|-----------------------|--------------|----------------------------------------------|
| `txid`                | `string`     | Идентификатор транзакции Kaspa               |
| `peer`                | `Peer`       | Информация об отправителе                    |
| `prefix`              | `string`     | Префикс приложения                           |
| `type`                | `number`     | Тип сообщения (`messageType`)                |
| `identifier`          | `Identifier` | Идентификатор сообщения                      |
| `blockMeta.hash`      | `string`     | Хеш блока, в котором подтверждена транзакция |
| `blockMeta.timestamp` | `bigint`     | Время подтверждения (Unix-time)              |
| `blockMeta.daaScore`  | `bigint`     | Показатель сложности сети Kaspa (DAA)        |
| `consensusHash`       | `string`     | Хеш консенсуса (подписываемые данные)        |
