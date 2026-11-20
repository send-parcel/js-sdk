import { ResponseFormatError } from '../errors/ResponseFormatError.js';
import type { Transport } from '../http/transport.js';

/**
 * The tokens of a login, with the field names of the API.
 */
export interface Tokens {
    /** the access token, `Authorization: Bearer <token>` */
    token: string;
    /** single use: a refresh gives a new one and the old one stops working */
    refresh_token: string;
    /** when the refresh token expires, a Unix timestamp in seconds */
    refresh_token_expiration: number;
}

export interface LoginCredentials {
    email: string;
    password: string;
    /** how the login is named in the list of logins of the account, e.g. the device */
    name?: string;
}

export interface AuthApi {
    /** issues the tokens of a new login of the account */
    login(credentials: LoginCredentials): Promise<Tokens>;
    /** issues new tokens for the refresh token and retires it */
    refresh(refreshToken: string): Promise<Tokens>;
    /** ends the login of the refresh token; an unknown token ends nothing and is no error */
    logout(refreshToken: string): Promise<void>;
}

function tokensFrom(method: string, path: string, body: unknown): Tokens {
    if (body === null || typeof body !== 'object') {
        throw new ResponseFormatError(`${method} ${path} answered something other than tokens.`);
    }
    const answer = body as Record<string, unknown>;
    const token = answer['token'];
    const refreshToken = answer['refresh_token'];
    const expiration = answer['refresh_token_expiration'];
    if (typeof token !== 'string' || typeof refreshToken !== 'string' || !Number.isInteger(expiration)) {
        throw new ResponseFormatError(`${method} ${path} answered something other than tokens.`);
    }

    return { token, refresh_token: refreshToken, refresh_token_expiration: expiration as number };
}

function requireRefreshToken(method: string, refreshToken: string): void {
    if (typeof refreshToken !== 'string' || refreshToken === '') {
        throw new TypeError(`auth.${method}() needs the refresh token.`);
    }
}

/**
 * Logins of the account, `/api/v2/auth/*`. These requests carry no auth of the client: the
 * credentials are in the body.
 */
export function auth(transport: Transport): AuthApi {
    return Object.freeze({
        async login({ email, password, name }: LoginCredentials) {
            const body = await transport.request(
                'POST',
                '/api/v2/auth/login',
                { email, password, ...(name === undefined ? {} : { name }) },
                { authenticated: false },
            );

            return tokensFrom('POST', '/api/v2/auth/login', body);
        },

        async refresh(refreshToken: string) {
            requireRefreshToken('refresh', refreshToken);
            const body = await transport.request(
                'POST',
                '/api/v2/auth/refresh',
                { refresh_token: refreshToken },
                { authenticated: false },
            );

            return tokensFrom('POST', '/api/v2/auth/refresh', body);
        },

        async logout(refreshToken: string) {
            requireRefreshToken('logout', refreshToken);
            const body = await transport.request(
                'POST',
                '/api/v2/auth/logout',
                { refresh_token: refreshToken },
                { authenticated: false },
            );
            if (body === null || typeof body !== 'object' || (body as Record<string, unknown>)['success'] !== true) {
                throw new ResponseFormatError('POST /api/v2/auth/logout answered something other than success.');
            }
        },
    });
}
