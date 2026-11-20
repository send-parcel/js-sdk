import { describe, expect, it } from 'vitest';
import { ResponseFormatError } from '../../src/errors/ResponseFormatError.js';
import type { Transport } from '../../src/http/transport.js';
import { type ApiKey, apiKeys, type CreatedApiKey } from '../../src/resources/apiKeys.js';

const KEY: ApiKey = {
    id: 512,
    name: 'WooCommerce shop',
    maskedKey: 'sp_…x7Qa',
    createdAt: '2026-11-17T14:05:31+02:00',
    lastUsedAt: null,
};

function resourceAnswering(body: unknown) {
    const requests: unknown[][] = [];
    const transport: Transport = {
        async request(...args) {
            requests.push(args);

            return body;
        },
    };

    return { keys: apiKeys(transport), requests };
}

function without(field: keyof ApiKey): Record<string, unknown> {
    const key: Record<string, unknown> = { ...KEY };
    delete key[field];

    return key;
}

describe('apiKeys.list', () => {
    it('gets the keys of the account in the order of the API', async () => {
        const used: ApiKey = { ...KEY, id: 513, lastUsedAt: '2026-11-17T15:05:31+02:00' };
        const { keys, requests } = resourceAnswering([used, KEY]);

        expect(await keys.list()).toStrictEqual([used, KEY]);
        expect(requests).toStrictEqual([['GET', '/api/v2/api-key']]);
    });

    it('gets an empty list', async () => {
        expect(await resourceAnswering([]).keys.list()).toStrictEqual([]);
    });

    it.each([
        ['not a list', { keys: [] }],
        ['a list with null', [null]],
        ['a key without a field', [without('lastUsedAt')]],
        ['a key with an unknown field', [{ ...KEY, key: 'sp_secret' }]],
        ['an id that is not an integer', [{ ...KEY, id: '512' }]],
        ['a name that is not a string', [{ ...KEY, name: 7 }]],
        ['a masked key that is not a string', [{ ...KEY, maskedKey: null }]],
        ['a creation date that is not a string', [{ ...KEY, createdAt: 0 }]],
        ['a last use that is neither null nor a string', [{ ...KEY, lastUsedAt: 0 }]],
    ])('fails with a ResponseFormatError on %s', async (name, body) => {
        await expect(resourceAnswering(body).keys.list()).rejects.toStrictEqual(
            new ResponseFormatError('GET /api/v2/api-key answered something other than a list of API keys.')
        );
    });

    it('is frozen', () => {
        expect(Object.isFrozen(resourceAnswering([]).keys)).toBe(true);
    });
});

const CREATED: CreatedApiKey = {
    id: 513,
    name: 'Own ERP',
    key: 'sp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdEfG',
    maskedKey: 'sp_…AbCdEfG',
    createdAt: '2026-11-20T09:00:00+02:00',
};

describe('apiKeys.create', () => {
    it('creates a key with the name and gives the key itself, once', async () => {
        const { keys, requests } = resourceAnswering(CREATED);

        expect(await keys.create({ name: 'Own ERP' })).toStrictEqual(CREATED);
        expect(requests).toStrictEqual([['POST', '/api/v2/api-key', { name: 'Own ERP' }]]);
    });

    it.each([
        ['a listed key without the key itself', KEY],
        ['a created key with lastUsedAt', { ...CREATED, lastUsedAt: null }],
        ['a key that is not a string', { ...CREATED, key: null }],
        ['an id that is not an integer', { ...CREATED, id: 1.5 }],
        ['a name that is not a string', { ...CREATED, name: [] }],
        ['a masked key that is not a string', { ...CREATED, maskedKey: 1 }],
        ['a creation date that is not a string', { ...CREATED, createdAt: null }],
        ['null', null],
    ])('fails with a ResponseFormatError on %s', async (name, body) => {
        await expect(resourceAnswering(body).keys.create({ name: 'Own ERP' })).rejects.toStrictEqual(
            new ResponseFormatError('POST /api/v2/api-key answered something other than a created API key.')
        );
    });
});

describe('apiKeys.remove', () => {
    it('revokes the key by its id and gives the revoked key', async () => {
        const { keys, requests } = resourceAnswering(KEY);

        expect(await keys.remove(512)).toStrictEqual(KEY);
        expect(requests).toStrictEqual([['DELETE', '/api/v2/api-key/512']]);
    });

    it('fails with a ResponseFormatError on an answer other than the revoked key', async () => {
        await expect(resourceAnswering(CREATED).keys.remove(512)).rejects.toStrictEqual(
            new ResponseFormatError('DELETE /api/v2/api-key/512 answered something other than the revoked API key.')
        );
    });

    it.each([
        ['zero', 0],
        ['a negative id', -1],
        ['a fraction', 1.5],
        ['a string', '512'],
    ])('needs the id of a key, not %s, and sends nothing', async (name, id) => {
        const { keys, requests } = resourceAnswering(KEY);

        await expect(keys.remove(id as never)).rejects.toStrictEqual(new TypeError('apiKeys.remove() needs the id of a key.'));
        expect(requests).toStrictEqual([]);
    });
});
