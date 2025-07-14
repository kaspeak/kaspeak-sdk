# Kaspeak SDK

[![npm](https://img.shields.io/npm/v/kaspeak-sdk)](https://www.npmjs.com/package/kaspeak-sdk)
[![en](https://img.shields.io/badge/lang-en-red.svg)](./README.md)
[![ru](https://img.shields.io/badge/lang-ru-green.svg)](./README.ru.md)

**Kaspeak SDK** — это инструмент для быстрой и удобной разработки децентрализованных приложений в сети Kaspa.  
Все операции с сетью, обработка сообщений, упаковка и распаковка данных, криптография и работа с транзакциями выполняются автоматически. Разработчику не нужно погружаться в низкоуровневые детали сетевого взаимодействия, управлять транзакциями вручную или самостоятельно настраивать шифрование. SDK предлагает готовое решение с прозрачным API и высоким уровнем абстракции.

---

## Возможности

- Передача текстовых и бинарных данных через Kaspa
- Простое описание собственных типов сообщений
- Встроенные криптографические методы (ECDH, XChaCha20-Poly1305, Schnorr)
- Эффективное сжатие и упаковка данных (CBOR, Zstandard)
- Конфиденциальные сообщения и уникальные идентификаторы
- Использование как в браузере, так и в Node.js

---

## Установка

```bash
npm install kaspeak-sdk
```

---

## Быстрый старт и примеры

Чтобы быстро познакомиться с возможностями SDK, воспользуйтесь готовыми примерами:

* **Просмотреть список всех доступных примеров:**

  ```bash
  npx kaspeak-example
  ```

* **Запустить отдельный пример:**

  ```bash
  npx kaspeak-example quick-start
  npx kaspeak-example delegate
  npx kaspeak-example secret-message
  ```

* **Запустить пример через npm-скрипты:**

  ```bash
  npm run example:quick-start
  npm run example:secret-message
  npm run example:delegate
  ```

---

## Документация

Подробное руководство, примеры и описание API:  
📚 https://kaspeak.github.io/kaspeak-sdk/latest/

---

## Обратная связь и участие

* Telegram чат: [RU](https://t.me/kaspeak_ru) / [EN](https://t.me/kaspeak_en)
* Поддержка: [@kaspeak\_support](https://t.me/kaspeak_support)
* [Правила и рекомендации по вкладу](./docs/ru/05-meta/contributing.md)
* Twitter/X: [@KaspeakOfficial](https://x.com/KaspeakOfficial)
* Email: [kaspeak@proton.me](mailto:kaspeak@proton.me)

---

## Лицензия

MIT © Kaspeak