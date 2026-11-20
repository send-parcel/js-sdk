import { createTransport } from './http/transport.js';
import { apiKeys, type ApiKeys } from './resources/apiKeys.js';
import { auth as authResource, type AuthApi } from './resources/auth.js';
import type { Auth, FetchLike, Locale } from './types.js';

const LOCALES: readonly string[] = ['en', 'lt', 'lv', 'ee', 'ru'] satisfies Locale[];

export interface ClientOptions {
    /** the address of the API, e.g. https://api.sendparcel.com */
    baseUrl: string;
    /**
     * from `bearerToken()`; without it the client only logs in, refreshes and logs out, and any
     * other request is a `TypeError`
     */
    auth?: Auth;
    /** the language of the messages of the API */
    locale?: Locale;
    /** the global fetch by default */
    fetch?: FetchLike;
}

export interface Client {
    readonly auth: AuthApi;
    readonly apiKeys: ApiKeys;
}

function isAuth(value: unknown): value is Auth {
    return value !== null
        && typeof value === 'object'
        && typeof (value as Record<string, unknown>)['headers'] === 'function'
        && typeof (value as Record<string, unknown>)['invalidate'] === 'function';
}

/**
 * A client of the App API v2. The options are checked at once, not on the first request, for
 * consumers that call it from plain JavaScript.
 */
export function createClient(options: ClientOptions): Client {
    const { baseUrl, auth, locale, fetch }: Partial<ClientOptions> = options ?? {};
    if (typeof baseUrl !== 'string' || baseUrl === '') {
        throw new TypeError('createClient() needs baseUrl.');
    }
    if (auth !== undefined && !isAuth(auth)) {
        throw new TypeError('createClient() needs auth from bearerToken().');
    }
    if (locale !== undefined && !LOCALES.includes(locale)) {
        throw new TypeError(`createClient() does not know the locale "${locale}".`);
    }

    const transport = createTransport({
        baseUrl,
        auth,
        locale,
        fetch: fetch ?? ((url, init) => globalThis.fetch(url, init)),
    });

    return Object.freeze({
        auth: authResource(transport),
        apiKeys: apiKeys(transport),
    });
}
