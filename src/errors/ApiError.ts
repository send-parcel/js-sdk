/**
 * One violation of a 422 answer, as the API sends it.
 */
export interface Violation {
    propertyPath: string;
    message: string;
    code: string;
}

export interface ApiErrorFields {
    status: number;
    code: string | null;
    detail: string | null;
    violations: Violation[] | null;
    retryAfter: number | null;
}

/**
 * The API answered with a status other than 2xx. The fields come from its application/problem+json
 * body; a body of another kind (a proxy error page) leaves `code` and `detail` null.
 */
export class ApiError extends Error {
    readonly status: number;
    readonly code: string | null;
    readonly detail: string | null;
    readonly violations: Violation[] | null;
    readonly retryAfter: number | null;

    constructor({ status, code, detail, violations, retryAfter }: ApiErrorFields) {
        super(`The API answered ${status}${code === null ? '' : ` ${code}`}.`);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.detail = detail;
        this.violations = violations;
        this.retryAfter = retryAfter;
    }
}
