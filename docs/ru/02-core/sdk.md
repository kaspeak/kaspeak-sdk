# Kaspeak SDK

Эта страница представляет собой краткое руководство по основным методам и возможностям **Kaspeak SDK**. Подробные схемы форматов данных и криптографии представлены в соответствующих разделах документации.

Здесь описано, **как пользоваться SDK на практике**.

---

## Быстрый старт

Инициализируйте SDK:

```js
import { Kaspeak, randomBytes } from "kaspeak-sdk";

const sdk = await Kaspeak.create(randomBytes(32), "CHAT", "testnet-10");
await sdk.connect();
```

### Параметры метода `create(privateKey, prefix, networkId?)`

* **`privateKey`** — приватный ключ используемого адреса, представленный как `bigint`, `number`, массив байт (`Uint8Array`) или hex-строка.
* **`prefix`** — уникальный префикс вашего приложения, ограниченный 4 символами ASCII. Это необходимо, чтобы сообщения разных приложений не пересекались.
* **`networkId`** *(опционально)* — `"mainnet"`, `"testnet-10"` (по умолчанию).

После вызова `create()` SDK полностью инициализирован и готов к подключению.

### Параметры метода `connect(url?)`
* **`url`** *(опционально)* — URL для подключения в выбранной Kaspa-ноде. Если значение не указано, адрес для подключения будет выбран автоматически.

---

## Подписка на события и обработка ошибок

```js
sdk.on("message", async ({ header, data }) => {
    /* обработка входящих сообщений */
});

sdk.on("error", console.error);
```

| Событие      | Данные                   |
| ------------ | ------------------------ |
| `message`    | `{ header, data }`       |
| `balance`    | `{ balance, utxoCount }` |
| `connect`    | `void`                   |
| `disconnect` | `void`                   |
| `error`      | `string`                 |

* **`message`** срабатывает для каждого входящего payload-а, даже если его тип не зарегистрирован.
* **`balance`** срабатывает при любом изменении баланса используемого в SDK адреса.
* **`connect`** вызывается сразу после успешного установления RPC-подключения к сети Kaspa.
* **`disconnect`** срабатывает, когда текущее RPC-соединение разорвано.
* **`error`** заглушка для будущего функционала
---

## Работа с собственными типами сообщений

Для создания собственных типов сообщений:

```js
class ChatMsg extends BaseMessage {
    static messageType = 1337; // уникальный код типа сообщения
    static requiresEncryption = true; // требуется ли шифрование

    constructor(text = "", header) {
        super(header);
        this.text = text;
    }

    toPlainObject() {
        return { t: this.text };
    }

    fromPlainObject({ t }) {
        this.text = t;
    }
}

sdk.registerMessage(ChatMsg, async (header, rawData) => {
    const secret = header.peer.sharedSecret; // извлечение общего секрета
    const chat = await sdk.decode(header, rawData, secret);
    console.log(chat.text);
});
```

Метод `registerMessage(ctor, worker?)`:

* **`ctor`** — класс-наследник `BaseMessage`.
* **`worker`** — функция-обработчик входящих сообщений данного типа.

---

## Основные методы SDK для работы с сообщениями

Кодирование и отправка сообщения:

```js
const encoded = await sdk.encode(messageInstance, secret);
const tx = await sdk.createTransaction(encoded.length);
const opIds = sdk.getOutpointIds(tx);
const payload = await sdk.createPayload(
    opIds,
    messageInstance.messageType,
    SecretIdentifier.random(),
    encoded
);
await sdk.sendTransaction(tx, payload);
```

Расшифровка и обработка сообщения:

```js
const message = await sdk.decode(header, rawData, secret);
```

Получение ключей диалога (для шифрования и идентификаторов):

```js
const { secret, chainKey } = sdk.deriveConversationKeys(remotePublicKey);
```

Проверка баланса:

```js
const { balance, utxoCount } = await sdk.getBalance();
```

---

## Настройки и параметры SDK

Kaspeak SDK имеет гибкие настройки:

```js
sdk.setPrefixFilterEnabled(false); // Принимать сообщения с любыми префиксами
sdk.setSignatureVerificationEnabled(false); // Отключить проверку Schnorr-подписи (небезопасно!)
sdk.setWaitForConnectionEnabled(true); // если включено (true), все сетевые методы будут ждать установления соединения вместо того, чтобы мгновенно бросать ошибку «Node is not connected».
sdk.setPriorityFee(0.1); // Изменить размер доплаты за отправку транзакции (в KAS)
sdk.setFeeLevel(FeeLevel) // Установить динамическое определение размера комиссии за отправку транзакции в сеть ("low" | "normal" | "priority" (по умолчанию))
```

---

## Дополнительные методы и свойства SDK

* **sdk.address** — Используемый Kaspa адрес, рассчитанный из приватного ключа.
* **sdk.publicKey** — Публичный ключ (hex, 33 байта в сжатом виде).
* **sdk.balance** — Актуальный баланс используемого адреса.
* **sdk.utxoCount** — Актуальное количество UTXO у используемого адреса.
* **sdk.isConnected** — Статус текущего подключения к сети Kaspa.
* **sdk.getAddressFromPublicKey()** — Получение адреса Kaspa по публичному ключу.
* **sdk.transferFunds()** — отправка KAS на один или несколько адресов.
