import { describe, expect, it, vi } from 'vitest';
import { userSession } from '../../src/auth/userSession.js';
import { ApiError } from '../../src/errors/ApiError.js';
import type { Tokens } from '../../src/resources/auth.js';

const FIRST: Tokens = { token: 'access-1', refresh_token: 'refresh-1', refresh_token_expiration: 1795800000 };
const SECOND: Tokens = { token: 'access-2', refresh_token: 'refresh-2', refresh_token_expiration: 1795900000 };

describe('userSession', () => {
    it('gives the access token of the login without asking the API', async () => {
        const refresh = vi.fn();
        const session = userSession({ auth: { refresh }, tokens: FIRST });

        expect([await session.getToken(), await session.getToken()]).toStrictEqual(['access-1', 'access-1']);
        expect(refresh).not.toHaveBeenCalled();
        expect(session.tokens()).toStrictEqual(FIRST);
        expect(Object.isFrozen(session)).toBe(true);
    });

    it('after invalidate() refreshes once with the refresh token and reports the new tokens', async () => {
        const refresh = vi.fn(async () => SECOND);
        const onTokens = vi.fn();
        const session = userSession({ auth: { refresh }, tokens: FIRST, onTokens });

        session.invalidate();

        expect(await session.getToken()).toBe('access-2');
        expect(await session.getToken()).toBe('access-2');
        expect(refresh.mock.calls).toStrictEqual([['refresh-1']]);
        expect(onTokens.mock.calls).toStrictEqual([[SECOND]]);
        expect(session.tokens()).toStrictEqual(SECOND);
    });

    it('refreshes once for any number of requests waiting at once', async () => {
        let resolve: (tokens: Tokens) => void = () => {};
        const refresh = vi.fn(() => new Promise<Tokens>((done) => {
            resolve = done;
        }));
        const session = userSession({ auth: { refresh }, tokens: FIRST });
        session.invalidate();

        const waiting = Promise.all([session.getToken(), session.getToken(), session.getToken()]);
        resolve(SECOND);

        expect(await waiting).toStrictEqual(['access-2', 'access-2', 'access-2']);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('uses the new refresh token for the next refresh', async () => {
        const refresh = vi.fn()
            .mockResolvedValueOnce(SECOND)
            .mockResolvedValueOnce({ ...SECOND, token: 'access-3', refresh_token: 'refresh-3' });
        const session = userSession({ auth: { refresh }, tokens: FIRST });

        session.invalidate();
        await session.getToken();
        session.invalidate();

        expect(await session.getToken()).toBe('access-3');
        expect(refresh.mock.calls).toStrictEqual([['refresh-1'], ['refresh-2']]);
    });

    it('lets a failed refresh through and tries again on the next call', async () => {
        const expired = new ApiError({ status: 401, code: 'invalid_refresh_token', detail: null, violations: null, retryAfter: null });
        const refresh = vi.fn()
            .mockRejectedValueOnce(expired)
            .mockResolvedValueOnce(SECOND);
        const onTokens = vi.fn();
        const session = userSession({ auth: { refresh }, tokens: FIRST, onTokens });
        session.invalidate();

        await expect(session.getToken()).rejects.toBe(expired);
        expect(session.tokens()).toStrictEqual(FIRST);
        expect(onTokens).not.toHaveBeenCalled();
        expect(await session.getToken()).toBe('access-2');
    });

    it.each([
        ['no auth', { tokens: FIRST }, 'userSession() needs auth with refresh().'],
        ['auth without refresh', { auth: {}, tokens: FIRST }, 'userSession() needs auth with refresh().'],
        ['no tokens', { auth: { refresh: vi.fn() } }, 'userSession() needs the tokens of a login.'],
        ['tokens without a refresh token', { auth: { refresh: vi.fn() }, tokens: { token: 'access' } }, 'userSession() needs the tokens of a login.'],
        ['tokens without an access token', { auth: { refresh: vi.fn() }, tokens: { refresh_token: 'refresh' } }, 'userSession() needs the tokens of a login.'],
    ])('fails at once on %s', (name, options, message) => {
        expect(() => userSession(options as never)).toThrow(new TypeError(message));
    });
});
