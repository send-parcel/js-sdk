import type { Auth } from '../types.js';

/**
 * Where the token comes from: the consumer decides how to get it and what to forget after a 401.
 */
export interface TokenProvider {
    getToken(): Promise<string>;
    invalidate?(): void;
}

/**
 * Authenticates requests with `Authorization: Bearer <token>`. After a 401 the transport calls
 * `invalidate()`, takes a token again and repeats the request once.
 */
export function bearerToken({ getToken, invalidate = () => {} }: TokenProvider): Auth {
    if (typeof getToken !== 'function') {
        throw new TypeError('bearerToken() needs getToken().');
    }

    return Object.freeze({
        async headers() {
            return { Authorization: `Bearer ${await getToken()}` };
        },
        invalidate,
    });
}
