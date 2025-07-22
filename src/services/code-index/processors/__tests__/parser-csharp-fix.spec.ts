import { describe, it, expect, beforeEach, vi } from "vitest"
import { CodeParser } from "../parser"
import * as path from "path"

// Mock the language parser loading
vi.mock("../../../tree-sitter/languageParser", () => ({
	loadRequiredLanguageParsers: vi.fn().mockResolvedValue({
		cs: {
			parser: {
				parse: vi.fn().mockReturnValue({
					rootNode: {
						type: "compilation_unit",
						startPosition: { row: 0, column: 0 },
						endPosition: { row: 27, column: 1 },
						text: "",
						children: [],
					},
				}),
			},
			query: {
				captures: vi.fn(),
			},
		},
	}),
}))

describe("CodeParser - C# Using Directives Fix", () => {
	let parser: CodeParser

	beforeEach(() => {
		parser = new CodeParser()
		vi.clearAllMocks()
	})

	it("should group using directives together to meet minimum block size", async () => {
		const filePath = "/test/TestFile.cs"
		const content = `using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace TestNamespace
{
    public class TestClass
    {
        public void TestMethod()
        {
            Console.WriteLine("Hello World");
        }
    }
}`

		// Mock the tree-sitter captures to return using directives and other nodes
		const mockCaptures = [
			{
				name: "name.definition.using",
				node: {
					type: "using_directive",
					text: "using System;",
					startPosition: { row: 0, column: 0 },
					endPosition: { row: 0, column: 13 },
					children: [],
					childForFieldName: () => null,
				},
			},
			{
				name: "name.definition.using",
				node: {
					type: "using_directive",
					text: "using System.Collections.Generic;",
					startPosition: { row: 1, column: 0 },
					endPosition: { row: 1, column: 33 },
					children: [],
					childForFieldName: () => null,
				},
			},
			{
				name: "name.definition.using",
				node: {
					type: "using_directive",
					text: "using System.Linq;",
					startPosition: { row: 2, column: 0 },
					endPosition: { row: 2, column: 18 },
					children: [],
					childForFieldName: () => null,
				},
			},
			{
				name: "name.definition.using",
				node: {
					type: "using_directive",
					text: "using System.Threading.Tasks;",
					startPosition: { row: 3, column: 0 },
					endPosition: { row: 3, column: 29 },
					children: [],
					childForFieldName: () => null,
				},
			},
			{
				name: "name.definition.namespace",
				node: {
					type: "namespace_declaration",
					text: `namespace TestNamespace
{
    public class TestClass
    {
        public void TestMethod()
        {
            Console.WriteLine("Hello World");
        }
    }
}`,
					startPosition: { row: 5, column: 0 },
					endPosition: { row: 14, column: 1 },
					children: [],
					childForFieldName: () => null,
				},
			},
		]

		// Update the mock to return our captures
		const { loadRequiredLanguageParsers } = await import("../../../tree-sitter/languageParser")
		const mockParsers = await loadRequiredLanguageParsers([filePath])
		mockParsers.cs.query.captures = vi.fn().mockReturnValue(mockCaptures)

		const result = await parser.parseFile(filePath, { content })

		// Should have 2 blocks: grouped using directives and the namespace
		expect(result).toHaveLength(2)

		// First block should be the grouped using directives
		const usingBlock = result.find((block) => block.type === "using_directive_group")
		expect(usingBlock).toBeDefined()
		expect(usingBlock?.start_line).toBe(1)
		expect(usingBlock?.end_line).toBe(4)
		expect(usingBlock?.content).toBe(
			"using System;\n" +
				"using System.Collections.Generic;\n" +
				"using System.Linq;\n" +
				"using System.Threading.Tasks;",
		)

		// Second block should be the namespace
		const namespaceBlock = result.find((block) => block.type === "namespace_declaration")
		expect(namespaceBlock).toBeDefined()
		expect(namespaceBlock?.start_line).toBe(6)
		expect(namespaceBlock?.end_line).toBe(15)
	})

	it("should not group using directives if they are separated by too many lines", async () => {
		const filePath = "/test/TestFile.cs"
		const content = `using System;
using System.Collections.Generic;
using System.Text;

// Some comment

using System.Linq;
using System.Threading.Tasks;

namespace TestNamespace
{
	   public class TestClass { }
}`

		const mockCaptures = [
			{
				name: "name.definition.using",
				node: {
					type: "using_directive",
					text: "using System;",
					startPosition: { row: 0, column: 0 },
					endPosition: { row: 0, column: 13 },
					children: [],
					childForFieldName: () => null,
				},
			},
			{
				name: "name.definition.using",
				node: {
					type: "using_directive",
					text: "using System.Collections.Generic;",
					startPosition: { row: 1, column: 0 },
					endPosition: { row: 1, column: 33 },
					children: [],
					childForFieldName: () => null,
				},
			},
			{
				name: "name.definition.using",
				node: {
					type: "using_directive",
					text: "using System.Text;",
					startPosition: { row: 2, column: 0 },
					endPosition: { row: 2, column: 18 },
					children: [],
					childForFieldName: () => null,
				},
			},
			{
				name: "name.definition.using",
				node: {
					type: "using_directive",
					text: "using System.Linq;",
					startPosition: { row: 6, column: 0 },
					endPosition: { row: 6, column: 18 },
					children: [],
					childForFieldName: () => null,
				},
			},
			{
				name: "name.definition.using",
				node: {
					type: "using_directive",
					text: "using System.Threading.Tasks;",
					startPosition: { row: 7, column: 0 },
					endPosition: { row: 7, column: 29 },
					children: [],
					childForFieldName: () => null,
				},
			},
		]

		const { loadRequiredLanguageParsers } = await import("../../../tree-sitter/languageParser")
		const mockParsers = await loadRequiredLanguageParsers([filePath])
		mockParsers.cs.query.captures = vi.fn().mockReturnValue(mockCaptures)

		const result = await parser.parseFile(filePath, { content })

		// Should have at least one block for the grouped using directives
		const usingBlocks = result.filter((block) => block.type === "using_directive_group")
		expect(usingBlocks.length).toBeGreaterThanOrEqual(1)

		// The first group should contain the first three using directives
		const firstGroup = usingBlocks[0]
		expect(firstGroup.content).toBe(
			"using System;\n" + "using System.Collections.Generic;\n" + "using System.Text;",
		)
		expect(firstGroup.start_line).toBe(1)
		expect(firstGroup.end_line).toBe(3)

		// If there's a second group, it should contain the last two using directives
		if (usingBlocks.length > 1) {
			const secondGroup = usingBlocks[1]
			expect(secondGroup.content).toBe("using System.Linq;\n" + "using System.Threading.Tasks;")
			expect(secondGroup.start_line).toBe(7)
			expect(secondGroup.end_line).toBe(8)
		}
	})
})
