import { parse } from "shell-quote"

export interface CommandPattern {
	pattern: string
	description?: string
}

export interface SecurityWarning {
	type: "subshell" | "injection"
	message: string
}

export function extractCommandPatterns(command: string): string[] {
	if (!command?.trim()) return []

	const patterns = new Set<string>()

	try {
		// First, remove subshell expressions to avoid extracting their contents
		const cleanedCommand = command
			.replace(/\$\([^)]*\)/g, "") // Remove $() subshells
			.replace(/`[^`]*`/g, "") // Remove backtick subshells

		const parsed = parse(cleanedCommand)

		const commandSeparators = new Set(["|", "&&", "||", ";"])
		let current: any[] = []

		for (const token of parsed) {
			if (typeof token === "object" && "op" in token && token.op && commandSeparators.has(token.op)) {
				if (current.length) processCommand(current, patterns)
				current = []
			} else {
				current.push(token)
			}
		}

		if (current.length) processCommand(current, patterns)
	} catch (_error) {
		// If parsing fails, try to extract at least the main command
		const mainCommand = command.trim().split(/\s+/)[0]

		// Apply same validation as in processCommand
		if (
			mainCommand &&
			!/^\d+$/.test(mainCommand) && // Skip pure numbers
			!["total", "error", "warning", "failed", "success", "done"].includes(mainCommand.toLowerCase()) &&
			(/[a-zA-Z]/.test(mainCommand) || mainCommand.includes("/"))
		) {
			patterns.add(mainCommand)
		}
	}

	return Array.from(patterns).sort()
}

function processCommand(cmd: any[], patterns: Set<string>) {
	if (!cmd.length || typeof cmd[0] !== "string") return

	const mainCmd = cmd[0]

	// Skip if it's just a number (like "0" from "0 total")
	if (/^\d+$/.test(mainCmd)) return

	// Skip common output patterns that aren't commands
	const skipWords = ["total", "error", "warning", "failed", "success", "done"]
	if (skipWords.includes(mainCmd.toLowerCase())) return

	// Only add if it contains at least one letter or is a valid path
	if (/[a-zA-Z]/.test(mainCmd) || mainCmd.includes("/")) {
		patterns.add(mainCmd)
	} else {
		return // Don't process further if main command is invalid
	}

	// Patterns that indicate we should stop looking for subcommands
	const stopPatterns = [/^-/, /[\\/.~ ]/]

	// Build up patterns progressively
	for (let i = 1; i < cmd.length; i++) {
		const arg = cmd[i]
		if (typeof arg !== "string" || stopPatterns.some((re) => re.test(arg))) break

		const pattern = cmd.slice(0, i + 1).join(" ")
		patterns.add(pattern)
	}
}

export function detectSecurityIssues(command: string): SecurityWarning[] {
	const warnings: SecurityWarning[] = []

	// Check for subshell execution attempts
	if (command.includes("$(") || command.includes("`")) {
		warnings.push({
			type: "subshell",
			message: "Command contains subshell execution which could bypass restrictions",
		})
	}

	return warnings
}

/**
 * Get a human-readable description for a command pattern.
 * Simply returns the pattern followed by "commands".
 */
export function getPatternDescription(pattern: string): string {
	return `${pattern} commands`
}

export function parseCommandAndOutput(text: string): {
	command: string
	output: string
	suggestions: string[]
} {
	// Default result
	const result = {
		command: text,
		output: "",
		suggestions: [] as string[],
	}

	// First check if the text already has been split by COMMAND_OUTPUT_STRING
	// This happens when the command has already been executed and we have the output
	const outputSeparator = "Output:"
	const outputIndex = text.indexOf(`\n${outputSeparator}`)

	if (outputIndex !== -1) {
		// Text is already split into command and output
		// The command is everything before the output separator
		result.command = text.slice(0, outputIndex).trim()
		// The output is everything after the output separator
		// We need to skip the newline and "Output:" text
		const afterNewline = outputIndex + 1 // Skip the newline
		const afterSeparator = afterNewline + outputSeparator.length // Skip "Output:"
		// Check if there's a colon and potential space after it
		let startOfOutput = afterSeparator
		if (text[afterSeparator] === "\n") {
			startOfOutput = afterSeparator + 1 // Skip additional newline after "Output:"
		}
		result.output = text.slice(startOfOutput).trim()
	} else if (text.indexOf(outputSeparator) === 0) {
		// Edge case: text starts with "Output:" (no command)
		result.command = ""
		result.output = text.slice(outputSeparator.length).trim()
	} else {
		// No output separator found, the entire text is the command
		result.command = text.trim()
		result.output = ""
	}

	// Look for AI suggestions in the output
	// These might be in a format like:
	// "Suggested patterns: npm, npm install, npm run"
	// or as a list
	const suggestionPatterns = [
		/Suggested patterns?:\s*(.+?)(?:\n|$)/i,
		/Command patterns?:\s*(.+?)(?:\n|$)/i,
		/You (?:can|may|might) (?:want to )?(?:allow|add):\s*(.+?)(?:\n|$)/i,
	]

	for (const pattern of suggestionPatterns) {
		const match = result.output.match(pattern)
		if (match) {
			// Split by common delimiters and clean up
			const suggestions = match[1]
				.split(/[,;]/)
				.map((s) => s.trim())
				.filter((s) => s) // Allow multi-word patterns like "npm install"

			if (suggestions.length > 0) {
				// Add to existing suggestions instead of replacing
				result.suggestions.push(...suggestions)
			}
		}
	}

	// Remove duplicates
	result.suggestions = Array.from(new Set(result.suggestions))

	// Also look for bullet points or numbered lists
	// const listPattern = /^[\s\-*•·▪▫◦‣⁃]\s*`?([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)`?$/gm
	const lines = result.output.split("\n")
	for (const line of lines) {
		const match = line.match(/^[\s\-*•·▪▫◦‣⁃]\s*`?([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)?)`?$/)
		if (match && match[1] && !result.suggestions.includes(match[1])) {
			result.suggestions.push(match[1])
		}
	}

	return result
}
