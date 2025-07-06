# Быстрый старт

По умолчанию Kaspeak SDK работает в сети `TESTNET-10`, но ничто не мешает Вам использовать `MAINET` для запуска Вашего приложения.

Вы можете получить немного TKAS в `TESTNET-10`, обратившись к [крану](https://faucet-tn10.kaspanet.io/).

### Установка

```bash
npm i kaspeak-sdk
```

### Инициализация

```js
const { Kaspeak } = require("kaspeak-sdk");

const PREFIX = "TEST"
const PRIV_KEY = 6

const sdk = await Kaspeak.create(PRIV_KEY, PREFIX);
await sdk.connect();
```
> `PREFIX` это уникальное название вашего приложения, размер которого ограничен 4 байтами.
> Благодаря ему, сообщения других пользователей SDK не будут пересекаться с Вашими сообщениями.

### Создание, отправка и прием простого незашифрованного сообщения

```js
const { Kaspeak, BaseMessage, SecretIdentifier } = require("kaspeak-sdk");

class ExampleMessage extends BaseMessage {
	static requiresEncryption = false;
	static messageType = 1;

	constructor(foo = "", bar = "", header) {
		super(header);
		this.foo = foo;
		this.bar = bar;
	}

	toPlainObject() {
		return { f: this.foo, b: this.bar };
	}

	fromPlainObject(obj) {
		this.foo = obj.f ?? "";
		this.bar = obj.b ?? "";
	}
}

const PREFIX = "TEST";
const PRIV_KEY = 6;
const NETWORK_ID = "testnet-10";

let sdk;

async function exampleHandler(header, raw) {
	const msg = await sdk.decode(header, raw);
	console.log("Foo:", msg.foo, "Bar:", msg.bar);
}

async function main() {
	sdk = await Kaspeak.create(PRIV_KEY, PREFIX);
	await sdk.connect(NETWORK_ID);
	console.log("Public key:", sdk.publicKey);
	console.log("Address:", sdk.address);

	sdk.registerMessage(ExampleMessage, exampleHandler);

	const msg = new ExampleMessage("hello", "world");
	const encoded = await sdk.encode(msg);
	const identifier = SecretIdentifier.random();
	const tx = await sdk.createTransaction(encoded.length);
	const opIds = sdk.getOutpointIds(tx);
	const payload = await sdk.createPayload(opIds, ExampleMessage.messageType, identifier, encoded);
	await sdk.sendTransaction(tx, payload);
}

main();
```
> Для запуска примера в основной сети, используйте `NETWORK_ID = "mainnet"`

> Данный пример **НЕ** использует шифрование сообщений.
> Если вы хотите отправлять зашифрованные сообщения, обратитесь к [разделу документации по шифрованию](../03-advanced/encryption.md).
