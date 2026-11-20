import type { FetchLike } from '../../src/types.js';

export interface FakeAnswer {
    status: number;
    body?: unknown;
    raw?: string;
    headers?: Record<string, string>;
}

export interface SentRequest extends RequestInit {
    url: string;
}

/**
 * A fetch that answers from a list, one answer per call, and remembers what was sent.
 */
export function fakeFetch(answers: Array<FakeAnswer | Error>): { fetch: FetchLike; calls: SentRequest[] } {
    const calls: SentRequest[] = [];
    const queue = [...answers];

    async function fetch(url: string, init: RequestInit): Promise<Response> {
        calls.push({ url, ...init });
        const answer = queue.shift();
        if (answer === undefined) {
            throw new Error(`Unexpected request ${init.method} ${url}.`);
        }
        if (answer instanceof Error) {
            throw answer;
        }
        const text = answer.raw ?? (answer.body === undefined ? '' : JSON.stringify(answer.body));

        return new Response(text === '' ? null : text, {
            status: answer.status,
            ...(answer.headers === undefined ? {} : { headers: answer.headers }),
        });
    }

    return { fetch, calls };
}
