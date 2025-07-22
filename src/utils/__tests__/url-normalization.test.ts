import { describe, it, expect } from "vitest"
import { normalizeBaseUrl, joinUrlPath } from "../url-normalization"

describe("url-normalization", () => {
	describe("normalizeBaseUrl", () => {
		it("should remove a single trailing slash", () => {
			expect(normalizeBaseUrl("http://localhost:11434/")).toBe("http://localhost:11434")
		})

		it("should remove multiple trailing slashes", () => {
			expect(normalizeBaseUrl("http://localhost:11434//")).toBe("http://localhost:11434")
			expect(normalizeBaseUrl("http://localhost:11434///")).toBe("http://localhost:11434")
		})

		it("should not modify URLs without trailing slashes", () => {
			expect(normalizeBaseUrl("http://localhost:11434")).toBe("http://localhost:11434")
		})

		it("should handle URLs with paths", () => {
			expect(normalizeBaseUrl("http://localhost:11434/api/")).toBe("http://localhost:11434/api")
			expect(normalizeBaseUrl("http://localhost:11434/api/v1/")).toBe("http://localhost:11434/api/v1")
		})

		it("should handle URLs with query parameters", () => {
			expect(normalizeBaseUrl("http://localhost:11434/?key=value")).toBe("http://localhost:11434/?key=value")
			expect(normalizeBaseUrl("http://localhost:11434/api/?key=value")).toBe(
				"http://localhost:11434/api/?key=value",
			)
		})

		it("should handle empty strings", () => {
			expect(normalizeBaseUrl("")).toBe("")
		})

		it("should handle URLs with ports", () => {
			expect(normalizeBaseUrl("http://localhost:8080/")).toBe("http://localhost:8080")
		})

		it("should handle HTTPS URLs", () => {
			expect(normalizeBaseUrl("https://api.example.com/")).toBe("https://api.example.com")
		})
	})

	describe("joinUrlPath", () => {
		it("should join base URL with path correctly", () => {
			expect(joinUrlPath("http://localhost:11434", "/api/tags")).toBe("http://localhost:11434/api/tags")
		})

		it("should handle base URL with trailing slash", () => {
			expect(joinUrlPath("http://localhost:11434/", "/api/tags")).toBe("http://localhost:11434/api/tags")
		})

		it("should handle base URL with multiple trailing slashes", () => {
			expect(joinUrlPath("http://localhost:11434//", "/api/tags")).toBe("http://localhost:11434/api/tags")
		})

		it("should handle path without leading slash", () => {
			expect(joinUrlPath("http://localhost:11434", "api/tags")).toBe("http://localhost:11434/api/tags")
		})

		it("should handle complex paths", () => {
			expect(joinUrlPath("http://localhost:11434/", "/v1/api/embed")).toBe("http://localhost:11434/v1/api/embed")
		})

		it("should handle base URL with existing path", () => {
			expect(joinUrlPath("http://localhost:11434/ollama", "/api/tags")).toBe(
				"http://localhost:11434/ollama/api/tags",
			)
			expect(joinUrlPath("http://localhost:11434/ollama/", "/api/tags")).toBe(
				"http://localhost:11434/ollama/api/tags",
			)
		})

		it("should handle empty path", () => {
			expect(joinUrlPath("http://localhost:11434", "")).toBe("http://localhost:11434/")
		})
	})
})
