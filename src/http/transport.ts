import { ApiError, type Violation } from '../errors/ApiError.js';
import { NetworkError } from '../errors/NetworkError.js';
import { ResponseFormatError } from '../errors/ResponseFormatError.js';
import type { Auth, FetchLike, Locale } from '../types.js';
import { joinUrl } from './url.js';

const UNAUTHORIZED = 401;
const VALIDATION_FAILED = 422;
const TOO_MANY_REQUESTS = 429;

export interface TransportOptions {
    baseUrl: string;
    auth: Auth | undefined;
    locale: Locale | undefined;
    fetch: FetchLike;
}

export interface RequestOptions {
    /** false for the requests that carry the credentials themselves: login, refresh, logout */
    authenticated?: boolean;
}

export interface Transport {
    /**
     * @returns the JSON body of a 2xx answer
     */
    request(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<unknown>;
}

async function readJson(response: Response): Promise<unknown> {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

async function apiError(response: Response): Promise<ApiError> {
    const body = await readJson(response);
    const problem: Record<string, unknown> = body !== null && typeof body === 'object' ? { ...body } : {};
    const retryAfter = response.headers.get('Retry-After');

    return new ApiError({
        status: response.status,
        code: typeof problem['code'] === 'string' ? problem['code'] : null,
        detail: typeof problem['detail'] === 'string' ? problem['detail'] : null,
        violations: response.status === VALIDATION_FAILED && Array.isArray(problem['violations'])
            ? problem['violations'] as Violation[]
            : null,
        retryAfter: response.status === TOO_MANY_REQUESTS && retryAfter !== null ? Number(retryAfter) : null,
    });
}

/**
 * One request to the API: the address, the headers, JSON both ways and the reading of the answer.
 */
export function createTransport({ baseUrl, auth, locale, fetch }: TransportOptions): Transport {
    async function send(method: string, path: string, body: unknown, requestAuth: Auth | null): Promise<Response> {
        const headers: Record<string, string> = {
            Accept: 'application/json',
            ...(locale === undefined ? {} : { 'Accept-Language': locale }),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(requestAuth === null ? {} : await requestAuth.headers()),
        };
        try {
            return await fetch(joinUrl(baseUrl, path), {
                method,
                headers,
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
        } catch (error) {
            throw new NetworkError(error);
        }
    }

    return {
        async request(method, path, body = undefined, { authenticated = true } = {}) {
            let requestAuth: Auth | null = null;
            if (authenticated) {
                if (auth === undefined) {
                    throw new TypeError(`${method} ${path} needs auth: pass it to createClient().`);
                }
                requestAuth = auth;
            }

            let response = await send(method, path, body, requestAuth);
            if (response.status === UNAUTHORIZED && requestAuth !== null) {
                requestAuth.invalidate();
                response = await send(method, path, body, requestAuth);
            }
            if (!response.ok) {
                throw await apiError(response);
            }

            const json = await readJson(response);
            if (json === undefined) {
                throw new ResponseFormatError(`${method} ${path} answered ${response.status} without a JSON body.`);
            }

            return json;
        },
    };
}
