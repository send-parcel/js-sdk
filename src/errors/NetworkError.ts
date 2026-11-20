/**
 * The request did not reach the API or broke off: `fetch` threw. The original error is in `cause`.
 */
export class NetworkError extends Error {
    constructor(cause: unknown) {
        super('The request did not reach the API.', { cause });
        this.name = 'NetworkError';
    }
}
