import { afterEach, describe, expect, it, vi } from 'vitest';
import { bearerToken, createClient, userSession } from '../src/index.js';
import { fakeFetch } from './support/fakeFetch.js';

const auth = bearerToken({ getToken: async () => 'jwt' });

const TOKENS = { token: 'access-1', refresh_token: 'refresh-1', refresh_token_expiration: 1795800000 };

describe('createClient', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('lists the API keys through the fetch it was given', async () => {
        const fake = fakeFetch([{ status: 200, body: [] }]);
        const client = createClient({ baseUrl: 'https://api.sendparcel.com', auth, locale: 'en', fetch: fake.fetch });

        expect(await client.apiKeys.list()).toStrictEqual([]);
        expect(fake.calls).toStrictEqual([{
            url: 'https://api.sendparcel.com/api/v2/api-key',
            method: 'GET',
            headers: { Accept: 'application/json', 'Accept-Language': 'en', Authorization: 'Bearer jwt' },
        }]);
        expect(Object.keys(client)).toStrictEqual(['auth', 'apiKeys']);
        expect(Object.isFrozen(client)).toBe(true);
    });

    it('uses the global fetch when it was given none', async () => {
        const fake = fakeFetch([{ status: 200, body: [] }]);
        vi.stubGlobal('fetch', fake.fetch);

        await createClient({ baseUrl: 'https://api.sendparcel.com', auth }).apiKeys.list();

        expect(fake.calls.map((call) => call.url)).toStrictEqual(['https://api.sendparcel.com/api/v2/api-key']);
    });

    it('logs in without auth, but refuses a request that needs it', async () => {
        const fake = fakeFetch([{ status: 200, body: TOKENS }]);
        const client = createClient({ baseUrl: 'https://api.sendparcel.com', fetch: fake.fetch });

        expect(await client.auth.login({ email: 'user@example.com', password: 'secret' })).toStrictEqual(TOKENS);
        await expect(client.apiKeys.list()).rejects.toStrictEqual(
            new TypeError('GET /api/v2/api-key needs auth: pass it to createClient().')
        );
        expect(fake.calls.map((call) => [call.method, call.url, call.headers])).toStrictEqual([
            ['POST', 'https://api.sendparcel.com/api/v2/auth/login', { Accept: 'application/json', 'Content-Type': 'application/json' }],
        ]);
    });

    it('refreshes the tokens of a user once after a 401 and repeats the request with the new token', async () => {
        const fake = fakeFetch([
            { status: 401, body: { status: 401, code: 'invalid_token' } },
            { status: 200, body: { token: 'access-2', refresh_token: 'refresh-2', refresh_token_expiration: 1795900000 } },
            { status: 200, body: [] },
        ]);
        const options = { baseUrl: 'https://api.sendparcel.com', fetch: fake.fetch };
        const onTokens = vi.fn();
        const session = userSession({ auth: createClient(options).auth, tokens: TOKENS, onTokens });
        const client = createClient({ ...options, auth: bearerToken(session) });

        expect(await client.apiKeys.list()).toStrictEqual([]);
        expect(fake.calls.map((call) => [call.method, call.url, call.headers, call.body])).toStrictEqual([
            ['GET', 'https://api.sendparcel.com/api/v2/api-key', { Accept: 'application/json', Authorization: 'Bearer access-1' }, undefined],
            ['POST', 'https://api.sendparcel.com/api/v2/auth/refresh', { Accept: 'application/json', 'Content-Type': 'application/json' }, '{"refresh_token":"refresh-1"}'],
            ['GET', 'https://api.sendparcel.com/api/v2/api-key', { Accept: 'application/json', Authorization: 'Bearer access-2' }, undefined],
        ]);
        expect(onTokens.mock.calls).toStrictEqual([[{ token: 'access-2', refresh_token: 'refresh-2', refresh_token_expiration: 1795900000 }]]);
    });

    it.each([
        ['no options', undefined, 'createClient() needs baseUrl.'],
        ['an empty baseUrl', { baseUrl: '', auth }, 'createClient() needs baseUrl.'],
        ['auth that is not of the SDK', { baseUrl: 'https://api.sendparcel.com', auth: { token: 'jwt' } }, 'createClient() needs auth from bearerToken().'],
        ['null as auth', { baseUrl: 'https://api.sendparcel.com', auth: null }, 'createClient() needs auth from bearerToken().'],
        ['an unknown locale', { baseUrl: 'https://api.sendparcel.com', auth, locale: 'uk' }, 'createClient() does not know the locale "uk".'],
    ])('fails at once on %s, as a JavaScript consumer can pass it', (name, options, message) => {
        expect(() => createClient(options as never)).toThrow(new TypeError(message));
    });
});
