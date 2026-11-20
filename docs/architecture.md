# Архітектура SendParcel JS SDK

SDK — клієнт App API v2 SendParcel (`/api/v2`) на TypeScript; споживач отримує зібраний JavaScript і типи. Ним користуються сайт
SendParcel (острови Vue в кабінеті) і, згодом, плагіни та інтеграції партнерів.

## Принципи

- **Без залежностей під час виконання.** У `package.json` немає `dependencies`. Лише те, що дає
  платформа: `fetch`, `URL`, `URLSearchParams`, `AbortController`, `Headers`.
- **Без прив'язки до фреймворку й середовища.** Ні Vue, ні React, ні DOM, ні `window`, ні
  `localStorage`. Працює в браузері й у Node.js 22+ (там `fetch` вбудований; `engines` — `>=22`,
  найстаріша LTS, що ще підтримується).
- **TypeScript, ES-модулі.** Код у `src/*.ts`, `tsc` збирає його в `dist/` (`.js`, `.d.ts`, карти);
  `exports` у `package.json` веде на `dist/index.js` з типами `dist/index.d.ts`. Споживач на TS
  отримує типи, на чистому JS — той самий код без них. TypeScript лише в `devDependencies`.
- **SDK знає лише API v2.** Сайт, його сесія, вхід через форму, переклади, формат дат кабінету —
  не тут: це логіка споживача поверх SDK.
- **Падати гучно.** Кожна відповідь, крім успішної, стає винятком із класом, за яким споживач
  розрізняє випадки. SDK нічого не ковтає й не підставляє значень замість помилки.
- **Секретів не зберігає.** Ключ API й токен живуть лише в об'єкті, який передав споживач; SDK їх
  не логує й не кешує. Помилки SDK не несуть заголовків і тіла запиту: споживач може передати
  помилку в звіт про збої, не ризикуючи злити ключ.

## Шари

```
споживач (сайт, плагін)
        │  createClient({ baseUrl, auth })
        ▼
resources/      методи за ресурсами API: apiKeys.list(), apiKeys.create(), …
        │
        ▼
http/transport  один запит: URL, заголовки, JSON, розбір відповіді, повтор після 401
        │
        ├── auth/      звідки береться автентифікація запиту
        └── errors/    класи помилок
        ▼
fetch (платформа або переданий споживачем)
```

Залежності йдуть лише вниз: ресурс не викликає `fetch` сам, транспорт не знає ресурсів.

## Структура

```
js-sdk/                            github.com/send-parcel/js-sdk (локальна тека — sendparcel-sdk-js)
├── package.json
├── README.md                      для споживачів, англійською
├── CLAUDE.md                      правила розробки
├── docs/
│   └── architecture.md
├── tsconfig.json                  перевірка типів src/, test/ і конфігу (noEmit)
├── tsconfig.build.json            збірка src/ у dist/
├── src/
│   ├── index.ts                   публічний вхід: createClient, auth, класи помилок, типи
│   ├── types.ts                   FetchLike, Auth, Locale
│   ├── client.ts                  createClient(options)
│   ├── http/
│   │   ├── transport.ts
│   │   └── url.ts
│   ├── auth/
│   │   ├── bearerToken.ts         Authorization: Bearer, один повтор після 401
│   │   └── userSession.ts         токени входу як провайдер bearerToken, перевипуск після 401
│   ├── errors/
│   │   ├── ApiError.ts
│   │   ├── NetworkError.ts
│   │   └── ResponseFormatError.ts
│   └── resources/
│       ├── auth.ts                login, refresh, logout
│       └── apiKeys.ts             list, create, remove
├── test/                          *.test.ts, support/fakeFetch.ts
├── dist/                          результат збірки, не в git
└── vitest.config.ts               покриття 100 %, include src/**
```

## Публічний контракт

```js
import { createClient, bearerToken, userSession, ApiError } from '@sendparcel/sdk';

// 1. Вхід: клієнт без auth уміє лише login, refresh і logout.
const api = createClient({ baseUrl: 'https://api.sendparcel.com', locale: 'en' });
const tokens = await api.auth.login({ email, password, name: 'Warehouse PC' });

// 2. Робота від імені користувача: після 401 сесія перевипускає токени один раз.
const session = userSession({ auth: api.auth, tokens, onTokens: (next) => store(next) });
const client = createClient({ baseUrl: 'https://api.sendparcel.com', auth: bearerToken(session) });

const created = await client.apiKeys.create({ name: 'WooCommerce shop' });   // created.key — один раз
const keys = await client.apiKeys.list();
await client.apiKeys.remove(created.id);
await api.auth.logout(session.tokens().refresh_token);

```

| Частина | Контракт |
|---|---|
| `createClient({ baseUrl, auth?, locale?, fetch? })` | `baseUrl` обов'язковий, без кінцевого `/` не вимагається — `url.ts` склеює правильно. `auth` — з `bearerToken()`; без нього клієнт робить лише `auth.login/refresh/logout`, інший запит — `TypeError` до відправки. Неправильні опції — `TypeError` одразу, а не на першому запиті. `locale` (`en`, `lt`, `lv`, `ee`, `ru`) — заголовок `Accept-Language` у кожному запиті: API перекладає ним `violations[].message` і `detail`. Без `locale` заголовок не ставиться, API відповідає англійською |
| `bearerToken({ getToken, invalidate? })` | `Authorization: Bearer <token>`. На `401` транспорт викликає `invalidate()`, знову `getToken()` і повторює запит **один раз**; другий `401` — `ApiError` |
| `userSession({ auth, tokens, onTokens? })` | провайдер токена для `bearerToken` з токенів `auth.login()`: `getToken()` віддає `token`; після `invalidate()` наступний `getToken()` робить **один** `auth.refresh(refresh_token)` на всіх, хто чекає, кладе нову пару й викликає `onTokens`. Невдалий перевипуск (прострочений чи вже використаний `refresh_token`) летить далі — користувач входить знову. `tokens()` — поточна пара, напр. для `logout` |
| `ApiError` | відповідь API не `2xx`: `status`, `code` і `detail` з `application/problem+json`, `violations` для `422` (кожне — `propertyPath`, `message`, `code`, як прийшли), `retryAfter` для `429` |
| `NetworkError` | запит не дійшов або обірвався (`fetch` кинув); оригінальна помилка — у `cause` |
| `ResponseFormatError` | `2xx`, але тіло не JSON або не тієї форми, яку обіцяє ресурс |

Ресурси повертають прості об'єкти з полями API, з тими самими назвами (`refresh_token`, не
`refreshToken`). Дати — рядки ISO 8601, як їх віддає API: перетворення в `Date` і формат показу —
справа споживача.

## Ресурси

Додаються, коли їх потребує споживач, а не «щоб було». Перші — для SP-2290 і роботи з
користувачем: вхід, перевипуск, вихід і ключі.

| Метод | Запит | Повертає |
|---|---|---|
| `auth.login({ email, password, name? })` | `POST /api/v2/auth/login`, без `auth` | `Tokens` — `token`, `refresh_token`, `refresh_token_expiration` (Unix, секунди); інші поля відповіді відкидаються. `name` — назва входу в списку входів акаунта. Помилки: `401 invalid_credentials`, `403 account_disabled`, `429` |
| `auth.refresh(refreshToken)` | `POST /api/v2/auth/refresh`, без `auth` | нова пара `Tokens`; старий `refresh_token` після цього не діє (`single_use`), повторно — `ApiError` 401 |
| `auth.logout(refreshToken)` | `POST /api/v2/auth/logout`, без `auth` | нічого; тіло API — `{"success": true}`, інше — `ResponseFormatError`. Невідомий токен — теж успіх |
| `apiKeys.list()` | `GET /api/v2/api-key` | `ApiKey[]` — рівно `id`, `name`, `maskedKey`, `createdAt`, `lastUsedAt` (`null`, якщо не використовувався) |
| `apiKeys.create({ name })` | `POST /api/v2/api-key` | `CreatedApiKey` — рівно `id`, `name`, `key` (повний, лише тут), `maskedKey`, `createdAt`. Порожня назва — `ApiError` 422 з `violations` |
| `apiKeys.remove(id)` | `DELETE /api/v2/api-key/{id}` | відкликаний `ApiKey`; чужий чи вже відкликаний — `ApiError` 404. `id` не додатне ціле — `TypeError` до відправки |

Форма відповіді звіряється з E2E-тестами сайту (`tests/E2e/ApiV2/Auth/*`, `ApiKeyTest`), а не лише з
OpenAPI: до SP-2290 OpenAPI `logout` описував тіло `{code, message}`, а `login` — лише `token`
(виправлено на сайті, `DocsTest::testAuthAnswersAreDocumentedAsTheyAre`).

### Автентифікація — внутрішній контракт

SDK автентифікує запити лише JWT (рішення розробника 20.11.2026): `bearerToken` і `userSession`.
Запитів ключем (`X-Api-Key`) у SDK немає — ключ, який SDK створює, інтеграція шле сама. Транспорт
знає про автентифікацію дві речі, які дає об'єкт `auth`: `headers()` — заголовки запиту
(асинхронно) і `invalidate()` — що зробити перед єдиним повтором після `401`.

Поля й коди помилок — з документації API v2 (`/api/v2/docs.html`); у SDK їх не вигадуємо.

## Тести

- **Vitest** з `@vitest/coverage-v8` (тести на TS запускає без збірки) — та сама платформа, що й для фронту сайту SendParcel, щоб
  тести й навички були одні на обидва репозиторії. Лише `devDependencies`: залежностей під час
  виконання від цього не з'являється.
- **100 % покриття** `src/**` — рядки, гілки, функції, інструкції; `coverage.thresholds: { 100:
  true }`, `exclude` порожній, коментарі `v8 ignore` / `istanbul ignore` заборонені.
- `fetch` у тестах — фальшивий, переданий у `createClient`; мережі в тестах немає.
- Кожен тест перевіряє весь результат точним збігом: який запит пішов (метод, URL, заголовки,
  тіло) і що повернулось або яка помилка з якими полями.
- Тести — частина публічного репозиторію: вони ж показують споживачам, як SDK поводиться.

## Версії й поширення

- Семантичні версії, теги `vX.Y.Z`. Зміна контракту з таблиць вище — мажорна версія.
- Репозиторій — [github.com/send-parcel/js-sdk](https://github.com/send-parcel/js-sdk), публічний,
  головна гілка `master`. Пакет — `@sendparcel/sdk` у публічному npm (область `@sendparcel`,
  `publishConfig.access: public`). Сайт ставить його з npm за версією, як будь-яку залежність.
- Випуск версії робить людина: коміт, тег `vX.Y.Z`, пуш, `npm publish` (перед ним `prepublishOnly`
  жене тести з порогом покриття). Опублікована версія незмінна: виправлення — лише нова версія.
- Ліцензія — Apache-2.0 (рішення Алекса 20.11.2026): дозвільна, як у більшості SDK платних API, з
  явною патентною ліцензією і пунктом 6 про те, що назва «SendParcel» не передається. Текст
  `LICENSE` — дослівний з apache.org, правовласник — у `NOTICE`; `NOTICE` входить у `files`, бо
  пункт 4(d) вимагає поширювати його разом із кодом. Новий файл коду заголовка ліцензії не
  потребує: досить `LICENSE` і `NOTICE` у корені.
