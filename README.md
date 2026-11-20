# SendParcel JS SDK

TypeScript and JavaScript client for the SendParcel App API v2 (`/api/v2`).

- No runtime dependencies.
- No framework: works in the browser and in Node.js 22+ (uses the built-in `fetch`).
- Written in TypeScript: types are included, plain JavaScript works the same.

> Status: in development. The contract may change until `v1.0.0`.

## Install

```bash
npm install @sendparcel/sdk
```

## Usage

### Log in as a user

```js
import { bearerToken, createClient, userSession } from '@sendparcel/sdk';

const baseUrl = 'https://api.sendparcel.com';

// A client without auth can only log in, refresh and log out.
const api = createClient({ baseUrl, locale: 'en' });
const tokens = await api.auth.login({ email, password, name: 'Warehouse PC' });

// The session gives the access token and, after a 401, refreshes the tokens once and the
// request is repeated with the new token. Store the new refresh token in onTokens.
const session = userSession({ auth: api.auth, tokens, onTokens: (next) => save(next) });
const client = createClient({ baseUrl, locale: 'en', auth: bearerToken(session) });

const keys = await client.apiKeys.list();

// Log out: the refresh token stops working.
await api.auth.logout(session.tokens().refresh_token);
```

A refresh token is single use: every refresh gives a new pair, so keep the last one (`onTokens`).
When the refresh itself fails (the refresh token expired or was already used), the error is thrown
and the user has to log in again.

### Manage API keys

```js
const created = await client.apiKeys.create({ name: 'WooCommerce shop' });
// created.key is the full key, shown only now: store it.

await client.apiKeys.remove(created.id);   // revoked at once
```

The SDK authenticates with the JWT of a user (`bearerToken`). The keys it creates are for your
integration: it sends them in the `X-Api-Key` header itself.

### Your own token provider

```js
const client = createClient({
    baseUrl: 'https://api.sendparcel.com',
    auth: bearerToken({
        getToken: async () => obtainToken(),  // your App API v2 access token
        invalidate: () => forgetToken(),       // called after a 401, before the one retry
    }),
});
```

On a `401` the client calls `invalidate()`, takes a token again with `getToken()` and repeats the
request once; a second `401` is an `ApiError`.

Use `https://staging.sendparcel.com` as `baseUrl` to work with the staging environment. Staging and
production are separate: a user, a token and a key from one environment do not work in the other.

## Resources

| Method | Request | Returns |
|---|---|---|
| `auth.login({ email, password, name? })` | `POST /api/v2/auth/login` | `token`, `refresh_token`, `refresh_token_expiration` (Unix seconds) |
| `auth.refresh(refreshToken)` | `POST /api/v2/auth/refresh` | a new pair of tokens; the old refresh token stops working |
| `auth.logout(refreshToken)` | `POST /api/v2/auth/logout` | nothing |
| `apiKeys.list()` | `GET /api/v2/api-key` | the API keys of the account: `id`, `name`, `maskedKey`, `createdAt`, `lastUsedAt` |
| `apiKeys.create({ name })` | `POST /api/v2/api-key` | the new key: `id`, `name`, `key`, `maskedKey`, `createdAt` |
| `apiKeys.remove(id)` | `DELETE /api/v2/api-key/{id}` | the revoked key |

Field names are those of the API. Dates are ISO 8601 strings, as the API sends them. More resources
are added as they are needed.

## Types

The package ships its types. Besides the functions and the error classes it exports `ApiKey`,
`CreatedApiKey`, `ApiKeys`, `AuthApi`, `LoginCredentials`, `Tokens`, `UserSession`,
`UserSessionOptions`, `Client`, `ClientOptions`, `Auth`, `TokenProvider`, `FetchLike`, `Locale`,
`Violation` and `ApiErrorFields`:

```ts
import type { ApiKey, FetchLike } from '@sendparcel/sdk';
```

`FetchLike` is the shape of `fetch`: pass any function of it as `fetch` to send the requests
through another HTTP client.

## Errors

| Error | When |
|---|---|
| `ApiError` | The API answered with a status other than `2xx`. Has `status`, `code`, `detail`; `violations` for `422`, `retryAfter` for `429`. |
| `NetworkError` | The request did not reach the API or was interrupted. The original error is in `cause`. |
| `ResponseFormatError` | The API answered `2xx`, but the body is not what the endpoint returns. |

## Development

```bash
npm run typecheck
npm test
npm run build
```

`build` compiles `src/` into `dist/`. Tests run on Vitest with 100% coverage required for `src/`.
TypeScript and Vitest are development dependencies only; the package itself has no runtime
dependencies.

## License

[Apache License 2.0](LICENSE). Copyright 2026 UAB „Technologijų era“, see [NOTICE](NOTICE).
