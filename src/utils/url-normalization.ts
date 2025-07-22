/**
 * Normalizes a base URL by removing trailing slashes.
 * This prevents double slashes when concatenating paths.
 *
 * @param url - The URL to normalize
 * @returns The normalized URL without trailing slashes
 *
 * @example
 * normalizeBaseUrl("http://localhost:11434/") // returns "http://localhost:11434"
 * normalizeBaseUrl("http://localhost:11434") // returns "http://localhost:11434"
 * normalizeBaseUrl("http://localhost:11434//") // returns "http://localhost:11434"
 */
export function normalizeBaseUrl(url: string): string {
	// Remove all trailing slashes
	return url.replace(/\/+$/, "")
}

/**
 * Joins a base URL with a path, ensuring no double slashes.
 *
 * @param baseUrl - The base URL (will be normalized)
 * @param path - The path to append (should start with /)
 * @returns The joined URL
 *
 * @example
 * joinUrlPath("http://localhost:11434/", "/api/tags") // returns "http://localhost:11434/api/tags"
 * joinUrlPath("http://localhost:11434", "/api/tags") // returns "http://localhost:11434/api/tags"
 */
export function joinUrlPath(baseUrl: string, path: string): string {
	const normalizedBase = normalizeBaseUrl(baseUrl)
	// Ensure path starts with a single slash
	const normalizedPath = path.startsWith("/") ? path : `/${path}`
	return `${normalizedBase}${normalizedPath}`
}
