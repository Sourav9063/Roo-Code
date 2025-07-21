import type { TokenUsage, ClineMessage } from "@roo-code/types"

export type ParsedApiReqStartedTextType = {
	tokensIn: number
	tokensOut: number
	cacheWrites: number
	cacheReads: number
	cost?: number // Only present if combineApiRequests has been called
	apiProtocol?: "anthropic" | "openai"
}

/**
 * Calculates API metrics from an array of ClineMessages.
 *
 * This function processes 'condense_context' messages and 'api_req_started' messages that have been
 * combined with their corresponding 'api_req_finished' messages by the combineApiRequests function.
 * It extracts and sums up the tokensIn, tokensOut, cacheWrites, cacheReads, and cost from these messages.
 *
 * @param messages - An array of ClineMessage objects to process.
 * @returns An ApiMetrics object containing totalTokensIn, totalTokensOut, totalCacheWrites, totalCacheReads, totalCost, and contextTokens.
 *
 * @example
 * const messages = [
 *   { type: "say", say: "api_req_started", text: '{"request":"GET /api/data","tokensIn":10,"tokensOut":20,"cost":0.005}', ts: 1000 }
 * ];
 * const { totalTokensIn, totalTokensOut, totalCost } = getApiMetrics(messages);
 * // Result: { totalTokensIn: 10, totalTokensOut: 20, totalCost: 0.005 }
 */
export function getApiMetrics(messages: ClineMessage[]) {
	const result: TokenUsage = {
		totalTokensIn: 0,
		totalTokensOut: 0,
		totalCacheWrites: undefined,
		totalCacheReads: undefined,
		totalCost: 0,
		contextTokens: 0,
	}

	// Track cumulative context tokens
	let cumulativeContextTokens = 0
	let lastCondenseIndex = -1

	// Find the last condense_context message if any
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].type === "say" && messages[i].say === "condense_context") {
			lastCondenseIndex = i
			break
		}
	}

	// Calculate running totals and context tokens
	messages.forEach((message, index) => {
		if (message.type === "say" && message.say === "api_req_started" && message.text) {
			try {
				const parsedText: ParsedApiReqStartedTextType = JSON.parse(message.text)
				const { tokensIn, tokensOut, cacheWrites, cacheReads, cost } = parsedText

				if (typeof tokensIn === "number") {
					result.totalTokensIn += tokensIn
				}
				if (typeof tokensOut === "number") {
					result.totalTokensOut += tokensOut
				}
				if (typeof cacheWrites === "number") {
					result.totalCacheWrites = (result.totalCacheWrites ?? 0) + cacheWrites
				}
				if (typeof cacheReads === "number") {
					result.totalCacheReads = (result.totalCacheReads ?? 0) + cacheReads
				}
				if (typeof cost === "number") {
					result.totalCost += cost
				}

				// Add to cumulative context tokens if this message is after the last condense
				if (index > lastCondenseIndex) {
					// For context calculation, we count input and output tokens
					// Cache reads represent tokens that were already in context, so we don't add them
					// Cache writes are new tokens being added to context
					if (typeof tokensIn === "number") {
						cumulativeContextTokens += tokensIn
					}
					if (typeof tokensOut === "number") {
						cumulativeContextTokens += tokensOut
					}
				}
			} catch (error) {
				console.error("Error parsing JSON:", error)
			}
		} else if (message.type === "say" && message.say === "condense_context") {
			result.totalCost += message.contextCondense?.cost ?? 0

			// When we hit a condense_context, reset the cumulative tokens to the new context size
			if (index === lastCondenseIndex && message.contextCondense?.newContextTokens !== undefined) {
				cumulativeContextTokens = message.contextCondense.newContextTokens
			}
		}
	})

	// Set the final context tokens
	result.contextTokens = cumulativeContextTokens

	return result
}
