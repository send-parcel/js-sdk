import { describe, expect, it } from 'vitest';
import { ResponseFormatError } from '../../src/errors/ResponseFormatError.js';
import type { Transport } from '../../src/http/transport.js';
import { auth } from '../../src/resources/auth.js';

const TOKENS = { token: 'access', refresh_token: 'refresh', refresh_token_expiration: 1795800000 };

function resourceAnswering(body: unknown) {
    const requests: unknown[][] = [];
    const transport: Transport = {
        async request(...args) {
            requests.push(args);

            return body;
        },
    };

    return { api: auth(transport), requests };
}

describe('auth.login', () => {
    it('issues the tokens for the email and the password, without auth of the client', async () => {
        const { api, requests } = resourceAnswering(TOKENS);

        expect(await api.login({ email: 'user@example.com', password: 'secret' })).toStrictEqual(TOKENS);
        expect(requests).toStrictEqual([
            ['POST', '/api/v2/auth/login', { email: 'user@example.com', password: 'secret' }, { authenticated: false }],
        ]);
    });

    it('names the login when a name is given', async () => {
        const { api, requests } = resourceAnswering(TOKENS);

        await api.login({ email: 'user@example.com', password: 'secret', name: 'iPhone' });

        expect(requests[0]?.[2]).toStrictEqual({ email: 'user@example.com', password: 'secret', name: 'iPhone' });
    });

    it('keeps only the tokens of the answer', async () => {
        const { api } = resourceAnswering({ ...TOKENS, extra: 'ignored' });

        expect(await api.login({ email: 'user@example.com', password: 'secret' })).toStrictEqual(TOKENS);
    });

    it.each([
        ['not an object', 'token'],
        ['null', null],
        ['no refresh token', { token: 'access', refresh_token_expiration: 1795800000 }],
        ['a token that is not a string', { ...TOKENS, token: 7 }],
        ['an expiration that is not an integer', { ...TOKENS, refresh_token_expiration: '1795800000' }],
    ])('fails with a ResponseFormatError on %s', async (name, body) => {
        await expect(resourceAnswering(body).api.login({ email: 'user@example.com', password: 'secret' }))
            .rejects.toStrictEqual(new ResponseFormatError('POST /api/v2/auth/login answered something other than tokens.'));
    });
});

describe('auth.refresh', () => {
    it('issues new tokens for the refresh token, without auth of the client', async () => {
        const { api, requests } = resourceAnswering(TOKENS);

        expect(await api.refresh('refresh-old')).toStrictEqual(TOKENS);
        expect(requests).toStrictEqual([
            ['POST', '/api/v2/auth/refresh', { refresh_token: 'refresh-old' }, { authenticated: false }],
        ]);
    });

    it('fails with a ResponseFormatError on an answer without tokens', async () => {
        await expect(resourceAnswering({ token: 'access' }).api.refresh('refresh-old'))
            .rejects.toStrictEqual(new ResponseFormatError('POST /api/v2/auth/refresh answered something other than tokens.'));
    });

    it('needs the refresh token', async () => {
        const { api, requests } = resourceAnswering(TOKENS);

        await expect(api.refresh('')).rejects.toStrictEqual(new TypeError('auth.refresh() needs the refresh token.'));
        expect(requests).toStrictEqual([]);
    });
});

describe('auth.logout', () => {
    it('ends the login of the refresh token', async () => {
        const { api, requests } = resourceAnswering({ success: true });

        expect(await api.logout('refresh')).toBeUndefined();
        expect(requests).toStrictEqual([
            ['POST', '/api/v2/auth/logout', { refresh_token: 'refresh' }, { authenticated: false }],
        ]);
    });

    it.each([
        ['no success', { code: 200, message: 'OK' }],
        ['success other than true', { success: 'yes' }],
        ['null', null],
    ])('fails with a ResponseFormatError on %s', async (name, body) => {
        await expect(resourceAnswering(body).api.logout('refresh'))
            .rejects.toStrictEqual(new ResponseFormatError('POST /api/v2/auth/logout answered something other than success.'));
    });

    it('needs the refresh token', async () => {
        await expect(resourceAnswering({ success: true }).api.logout(undefined as never))
            .rejects.toStrictEqual(new TypeError('auth.logout() needs the refresh token.'));
    });
});

describe('auth', () => {
    it('is frozen', () => {
        expect(Object.isFrozen(resourceAnswering(null).api)).toBe(true);
    });
});
