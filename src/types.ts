/**
 * The `fetch` the client sends requests with: the global one, or any function of its shape (an
 * adapter over another HTTP client).
 */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * How the transport authenticates a request with a JWT: the headers to add and what to do before
 * the one repeat after a 401. `bearerToken()` makes one.
 */
export interface Auth {
    headers(): Promise<Record<string, string>>;
    invalidate(): void;
}

/**
 * The language the API writes `detail` and `violations[].message` in.
 */
export type Locale = 'en' | 'lt' | 'lv' | 'ee' | 'ru';
