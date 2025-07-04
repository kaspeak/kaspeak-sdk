# Kaspeak SDK

Эта страница представляет собой краткое руководство по основным методам и возможностям **Kaspeak SDK**. Подробные схемы форматов данных и криптографии представлены в соответствующих разделах документации.

Здесь описано, **как пользоваться SDK на практике**.

---

## Быстрый старт

Инициализируйте SDK:

```js
import { Kaspeak, randomBytes } from "kaspeak-sdk";

const sdk = await Kaspeak.create(randomBytes(32), "CHAT");
await sdk.connect();
```

### Параметры метода `create(privateKey, prefix)`

* **`privateKey`** — приватный ключ, представленный как `bigint`, `number`, массив байт (`Uint8Array`) или hex-строка.
* **`prefix`** — уникальный префикс вашего приложения, ограниченный 4 символами ASCII. Это необходимо, чтобы сообщения разных приложений не пересекались.

После вызова `create()` SDK полностью инициализирован и готов к подключению.

### Параметры метода `connect(networkId?, url?)`

| Параметр    | По умолчанию      | Описание                                         |
| ----------- | ----------------- | ------------------------------------------------ |
| `networkId` | `"testnet-10"`    | Сеть Kaspa (`"mainnet"` или любая тестовая сеть) |
| `url`       | *(автоматически)* | URL конкретной Kaspa-ноды (опционально)          |

---

## Подписка на события и обработка ошибок

Kaspeak SDK предоставляет удобную систему событий:

```js
sdk.on("KaspeakMessageReceived", async ({ header, data }) => {
    // обработка входящих сообщений
});

sdk.on("error", console.error);
```

* **`KaspeakMessageReceived`** срабатывает для каждого входящего payload-а, даже если его тип не зарегистрирован.
* **`error`** уведомляет о проблемах сети, сериализации и других ошибках.

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

    toPlainObject() { return { t: this.text }; }
    fromPlainObject({ t }) { this.text = t; }
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
    Identifier.random(),
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
const kasBalance = await sdk.getBalance();
```

---

## Настройки и параметры SDK

Kaspeak SDK имеет гибкие настройки:

```js
sdk.setPrefixFilterEnabled(false); // Принимать сообщения с любыми префиксами
sdk.setSignatureVerificationEnabled(false); // Отключить проверку Schnorr-подписи (небезопасно!)
sdk.setPriorityFee(0.1); // Изменить размер минимальной комиссии за транзакцию в KAS
```

---

## Дополнительные методы и свойства SDK

| Метод / Свойство                | Описание                                      |
| ------------------------------- | --------------------------------------------- |
| `sdk.address`                   | KAS-адрес, рассчитанный из приватного ключа.  |
| `sdk.publicKey`                 | Публичный ключ (hex, 33 байта в сжатом виде). |
| `sdk.balance`                   | Последний полученный баланс кошелька.         |
| `sdk.utxoCount`                 | Количество UTXO на кошельке.                  |
| `sdk.isConnected`               | Статус текущего подключения к сети Kaspa.     |
| `sdk.getAddressFromPublicKey()` | Получение адреса Kaspa по публичному ключу.   |
