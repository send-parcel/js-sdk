/**
 * The API answered 2xx, but the body is not JSON or not of the shape the resource promises.
 */
export class ResponseFormatError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ResponseFormatError';
    }
}
