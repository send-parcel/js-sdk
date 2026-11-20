import type { AuthApi, Tokens } from '../resources/auth.js';
import type { TokenProvider } from './bearerToken.js';

export interface UserSessionOptions {
    /** `client.auth` of a client without auth: it refreshes the tokens */
    auth: Pick<AuthApi, 'refresh'>;
    /** the tokens of `auth.login()` or of an earlier session */
    tokens: Tokens;
    /** called with every new pair of tokens, e.g. to store the new refresh token */
    onTokens?(tokens: Tokens): void;
}

export interface UserSession extends TokenProvider {
    getToken(): Promise<string>;
    invalidate(): void;
    /** the tokens now, e.g. for `auth.logout(session.tokens().refresh_token)` */
    tokens(): Tokens;
}

/**
 * The tokens of a login as a token provider of `bearerToken()`: after a 401 the transport
 * invalidates the access token, and the next `getToken()` refreshes the pair once, however many
 * requests wait for it. A failed refresh (an expired or retired refresh token) is thrown: the
 * user has to log in again.
 */
export function userSession({ auth, tokens, onTokens }: UserSessionOptions): UserSession {
    if (auth === undefined || typeof auth.refresh !== 'function') {
        throw new TypeError('userSession() needs auth with refresh().');
    }
    if (tokens === undefined || typeof tokens.token !== 'string' || typeof tokens.refresh_token !== 'string') {
        throw new TypeError('userSession() needs the tokens of a login.');
    }

    let current = tokens;
    let stale = false;
    let pending: Promise<string> | null = null;

    return Object.freeze({
        async getToken() {
            if (!stale) {
                return current.token;
            }
            if (pending === null) {
                pending = auth.refresh(current.refresh_token).then(
                    (next) => {
                        current = next;
                        stale = false;
                        pending = null;
                        if (onTokens !== undefined) {
                            onTokens(next);
                        }

                        return next.token;
                    },
                    (error: unknown) => {
                        pending = null;
                        throw error;
                    },
                );
            }

            return pending;
        },

        invalidate() {
            stale = true;
        },

        tokens() {
            return current;
        },
    });
}
