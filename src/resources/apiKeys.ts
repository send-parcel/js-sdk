import { ResponseFormatError } from '../errors/ResponseFormatError.js';
import type { Transport } from '../http/transport.js';

/**
 * An API key of the account as the list shows it: never the key itself.
 */
export interface ApiKey {
    id: number;
    name: string;
    maskedKey: string;
    /** ISO 8601 */
    createdAt: string;
    /** ISO 8601, null while the key was never used */
    lastUsedAt: string | null;
}

/**
 * A key just created: the only time the API gives the key itself.
 */
export interface CreatedApiKey {
    id: number;
    name: string;
    /** the full key, for the `X-Api-Key` header of an integration; shown once, store it now */
    key: string;
    maskedKey: string;
    /** ISO 8601 */
    createdAt: string;
}

export interface ApiKeys {
    /**
     * @returns the keys in the order of the API
     */
    list(): Promise<ApiKey[]>;
    /** creates a key; a name the API refuses is an `ApiError` 422 with `violations` */
    create(input: { name: string }): Promise<CreatedApiKey>;
    /**
     * revokes a key at once; a key of another account or one already revoked is an `ApiError` 404
     *
     * @returns the revoked key
     */
    remove(id: number): Promise<ApiKey>;
}

const LISTED = ['id', 'name', 'maskedKey', 'createdAt', 'lastUsedAt'];
const CREATED = ['id', 'name', 'key', 'maskedKey', 'createdAt'];

function hasExactly(value: unknown, fields: string[]): value is Record<string, unknown> {
    return value !== null
        && typeof value === 'object'
        && Object.keys(value).length === fields.length
        && fields.every((field) => Object.hasOwn(value, field));
}

function isApiKey(value: unknown): value is ApiKey {
    return hasExactly(value, LISTED)
        && Number.isInteger(value['id'])
        && typeof value['name'] === 'string'
        && typeof value['maskedKey'] === 'string'
        && typeof value['createdAt'] === 'string'
        && (value['lastUsedAt'] === null || typeof value['lastUsedAt'] === 'string');
}

function isCreatedApiKey(value: unknown): value is CreatedApiKey {
    return hasExactly(value, CREATED)
        && Number.isInteger(value['id'])
        && typeof value['name'] === 'string'
        && typeof value['key'] === 'string'
        && typeof value['maskedKey'] === 'string'
        && typeof value['createdAt'] === 'string';
}

/**
 * The API keys of the signed-in account, `/api/v2/api-key`. Only a login manages them: a request
 * authenticated by a key is an `ApiError` 403.
 */
export function apiKeys(transport: Transport): ApiKeys {
    return Object.freeze({
        async list() {
            const keys = await transport.request('GET', '/api/v2/api-key');
            if (!Array.isArray(keys) || !keys.every(isApiKey)) {
                throw new ResponseFormatError('GET /api/v2/api-key answered something other than a list of API keys.');
            }

            return keys;
        },

        async create({ name }: { name: string }) {
            const created = await transport.request('POST', '/api/v2/api-key', { name });
            if (!isCreatedApiKey(created)) {
                throw new ResponseFormatError('POST /api/v2/api-key answered something other than a created API key.');
            }

            return created;
        },

        async remove(id: number) {
            if (!Number.isInteger(id) || id <= 0) {
                throw new TypeError('apiKeys.remove() needs the id of a key.');
            }
            const path = `/api/v2/api-key/${id}`;
            const removed = await transport.request('DELETE', path);
            if (!isApiKey(removed)) {
                throw new ResponseFormatError(`DELETE ${path} answered something other than the revoked API key.`);
            }

            return removed;
        },
    });
}
