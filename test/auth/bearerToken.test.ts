import { describe, expect, it, vi } from 'vitest';
import { bearerToken } from '../../src/auth/bearerToken.js';

describe('bearerToken', () => {
    it('puts the token of the provider into the Authorization header', async () => {
        const auth = bearerToken({ getToken: async () => 'jwt' });

        expect(await auth.headers()).toStrictEqual({ Authorization: 'Bearer jwt' });
        expect(Object.isFrozen(auth)).toBe(true);
    });

    it('passes invalidate() of the provider through', () => {
        const invalidate = vi.fn();

        bearerToken({ getToken: async () => 'jwt', invalidate }).invalidate();

        expect(invalidate.mock.calls).toStrictEqual([[]]);
    });

    it('has nothing to invalidate when the provider gives no invalidate()', () => {
        expect(bearerToken({ getToken: async () => 'jwt' }).invalidate()).toBeUndefined();
    });

    it('needs getToken() when called from plain JavaScript', () => {
        // @ts-expect-error a JavaScript consumer can pass a provider without getToken()
        expect(() => bearerToken({})).toThrow(new TypeError('bearerToken() needs getToken().'));
    });
});
