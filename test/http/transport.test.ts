import { describe, expect, it, vi } from 'vitest';
import { bearerToken } from '../../src/auth/bearerToken.js';
import { ApiError } from '../../src/errors/ApiError.js';
import { NetworkError } from '../../src/errors/NetworkError.js';
import { ResponseFormatError } from '../../src/errors/ResponseFormatError.js';
import { createTransport } from '../../src/http/transport.js';
import type { Locale } from '../../src/types.js';
import { type FakeAnswer, fakeFetch } from '../support/fakeFetch.js';

function transportWith(
    answers: Array<FakeAnswer | Error>,
    { locale = undefined, tokens = ['first', 'second'] }: { locale?: Locale | undefined; tokens?: string[] } = {}
) {
    const fake = fakeFetch(answers);
    const queue = [...tokens];
    const invalidate = vi.fn();
    const auth = bearerToken({ getToken: async () => queue.shift() ?? 'none', invalidate });
    const transport = createTransport({ baseUrl: 'https://api.sendparcel.com/', auth, locale, fetch: fake.fetch });

    return { transport, calls: fake.calls, invalidate };
}

async function errorOf(promise: Promise<unknown>): Promise<Error> {
    try {
        await promise;
    } catch (error) {
        return error as Error;
    }
    throw new Error('The request did not fail.');
}

async function apiErrorOf(promise: Promise<unknown>): Promise<ApiError> {
    const error = await errorOf(promise);
    expect(error).toBeInstanceOf(ApiError);

    return error as ApiError;
}

describe('createTransport', () => {
    it('sends a GET with the token and returns the JSON of the answer', async () => {
        const { transport, calls, invalidate } = transportWith([{ status: 200, body: [{ id: 1 }] }]);

        expect(await transport.request('GET', '/api/v2/api-key')).toStrictEqual([{ id: 1 }]);
        expect(calls).toStrictEqual([{
            url: 'https://api.sendparcel.com/api/v2/api-key',
            method: 'GET',
            headers: { Accept: 'application/json', Authorization: 'Bearer first' },
        }]);
        expect(invalidate).not.toHaveBeenCalled();
    });

    it('sends a body as JSON and asks for the messages in the locale', async () => {
        const { transport, calls } = transportWith([{ status: 201, body: { id: 2 } }], { locale: 'lt' });

        expect(await transport.request('POST', '/api/v2/api-key', { name: 'Shop' })).toStrictEqual({ id: 2 });
        expect(calls).toStrictEqual([{
            url: 'https://api.sendparcel.com/api/v2/api-key',
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-Language': 'lt',
                'Content-Type': 'application/json',
                Authorization: 'Bearer first',
            },
            body: '{"name":"Shop"}',
        }]);
    });

    it('after a 401 drops the token, takes a new one and repeats the request once', async () => {
        const { transport, calls, invalidate } = transportWith([
            { status: 401, body: { code: 'invalid_token' } },
            { status: 200, body: [] },
        ]);

        expect(await transport.request('GET', '/api/v2/api-key')).toStrictEqual([]);
        expect(calls.map((call) => (call.headers as Record<string, string>)['Authorization']))
            .toStrictEqual(['Bearer first', 'Bearer second']);
        expect(invalidate.mock.calls).toStrictEqual([[]]);
    });

    it('fails with the second 401 instead of repeating again', async () => {
        const { transport, calls, invalidate } = transportWith([
            { status: 401, body: { code: 'invalid_token' } },
            { status: 401, body: { status: 401, code: 'invalid_token', detail: 'Invalid JWT Token' } },
        ]);

        const error = await apiErrorOf(transport.request('GET', '/api/v2/api-key'));

        expect({ ...error, message: error.message }).toStrictEqual({
            name: 'ApiError',
            message: 'The API answered 401 invalid_token.',
            status: 401,
            code: 'invalid_token',
            detail: 'Invalid JWT Token',
            violations: null,
            retryAfter: null,
        });
        expect(calls).toHaveLength(2);
        expect(invalidate.mock.calls).toStrictEqual([[]]);
    });

    it('gives the violations of a 422 as they came', async () => {
        const violations = [{ propertyPath: 'name', message: 'Enter a name for the key.', code: 'required' }];
        const { transport } = transportWith([{
            status: 422,
            body: { status: 422, code: 'validation_failed', detail: 'name: Enter a name for the key.', violations },
        }]);

        const error = await apiErrorOf(transport.request('POST', '/api/v2/api-key', { name: '' }));

        expect([error.status, error.code, error.detail, error.violations, error.retryAfter])
            .toStrictEqual([422, 'validation_failed', 'name: Enter a name for the key.', violations, null]);
    });

    it('gives the Retry-After of a 429 in seconds', async () => {
        const { transport } = transportWith([{
            status: 429,
            body: { status: 429, code: 'too_many_requests', detail: 'Too many requests.' },
            headers: { 'Retry-After': '3' },
        }]);

        const error = await apiErrorOf(transport.request('GET', '/api/v2/api-key'));

        expect([error.status, error.code, error.violations, error.retryAfter])
            .toStrictEqual([429, 'too_many_requests', null, 3]);
    });

    it('takes no violations from an answer other than 422 and no Retry-After without the header', async () => {
        const { transport } = transportWith([
            { status: 400, body: { code: 'invalid_json', violations: [{ propertyPath: 'x' }] } },
            { status: 429, body: { code: 'too_many_requests' } },
        ]);

        const badRequest = await apiErrorOf(transport.request('GET', '/api/v2/api-key'));
        const tooMany = await apiErrorOf(transport.request('GET', '/api/v2/api-key'));

        expect([badRequest.violations, badRequest.detail, tooMany.retryAfter]).toStrictEqual([null, null, null]);
    });

    it('fails with the status alone when the error page is not problem JSON', async () => {
        const { transport } = transportWith([
            { status: 502, raw: '<html>Bad Gateway</html>' },
            { status: 500, raw: 'null' },
        ]);

        const html = await apiErrorOf(transport.request('GET', '/api/v2/api-key'));
        const nothing = await apiErrorOf(transport.request('GET', '/api/v2/api-key'));

        expect([html.message, html.status, html.code, html.detail]).toStrictEqual(['The API answered 502.', 502, null, null]);
        expect([nothing.status, nothing.code]).toStrictEqual([500, null]);
    });

    it('fails with a NetworkError that keeps the cause when the request does not reach the API', async () => {
        const cause = new TypeError('Failed to fetch');
        const { transport } = transportWith([cause]);

        const error = await errorOf(transport.request('GET', '/api/v2/api-key'));

        expect(error).toBeInstanceOf(NetworkError);
        expect([error.name, error.message, error.cause]).toStrictEqual(['NetworkError', 'The request did not reach the API.', cause]);
    });

    it('fails with a ResponseFormatError when a 2xx has no JSON body', async () => {
        const { transport } = transportWith([{ status: 200, raw: 'OK' }]);

        const error = await errorOf(transport.request('DELETE', '/api/v2/api-key/1'));

        expect(error).toBeInstanceOf(ResponseFormatError);
        expect([error.name, error.message])
            .toStrictEqual(['ResponseFormatError', 'DELETE /api/v2/api-key/1 answered 200 without a JSON body.']);
    });
});
