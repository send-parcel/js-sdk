/**
 * Joins the base address of the API and a path of an endpoint, whether or not the base ends with "/".
 *
 * @param path starts with "/"
 */
export function joinUrl(baseUrl: string, path: string): string {
    return `${baseUrl.replace(/\/+$/, '')}${path}`;
}
