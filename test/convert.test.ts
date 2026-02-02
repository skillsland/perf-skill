/**
 * Tests for convert module
 */

import { describe, it, mock } from "node:test";
import assert from "node:assert";
import {
  sanitizeMarkdown,
  redactSecrets,
  truncateSourceBlocks,
  truncateContent,
  generateSlug,
} from "../src/convert/sanitize.js";
import {
  extractHotspots,
  extractProfileMeta,
  extractCallPath,
} from "../src/convert/extract.js";

describe("sanitize", () => {
  describe("redactSecrets", () => {
    it("should redact AWS keys", () => {
      const input = "Key: AKIAIOSFODNN7EXAMPLE";
      const result = redactSecrets(input);
      assert.ok(!result.includes("AKIAIOSFODNN7EXAMPLE"));
      assert.ok(result.includes("[REDACTED]"));
    });

    it("should redact Bearer tokens", () => {
      const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
      const result = redactSecrets(input);
      assert.ok(result.includes("[REDACTED]"));
    });

    it("should redact API keys", () => {
      const input = 'api_key = "sk-1234567890abcdefghijklmnop"';
      const result = redactSecrets(input);
      assert.ok(result.includes("[REDACTED]"));
    });
  });

  describe("truncateSourceBlocks", () => {
    it("should truncate long code blocks", () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
      const input = "```typescript\n" + lines.join("\n") + "\n```";
      const result = truncateSourceBlocks(input, 10);
      assert.ok(result.includes("more lines truncated"));
      assert.ok(result.includes("line 1"));
      assert.ok(!result.includes("line 50"));
    });

    it("should not truncate short code blocks", () => {
      const input = "```js\nconst x = 1;\n```";
      const result = truncateSourceBlocks(input, 10);
      assert.strictEqual(result, input);
    });
  });

  describe("truncateContent", () => {
    it("should truncate at section boundaries", () => {
      const input = "# Header\n\nContent here.\n\n## Section 2\n\nMore content.\n\n## Section 3\n\nEven more.";
      const result = truncateContent(input, 50);
      assert.ok(result.length <= 150); // Some buffer for note
      assert.ok(result.includes("truncated"));
    });
  });

  describe("generateSlug", () => {
    it("should convert function names to slugs", () => {
      assert.strictEqual(generateSlug("JSON.parse"), "jsonparse");
      assert.strictEqual(generateSlug("processRequest"), "processrequest");
      assert.strictEqual(generateSlug("<anonymous>"), "anonymous");
    });
  });
});

describe("extract", () => {
  describe("extractProfileMeta", () => {
    it("should extract CPU profile metadata", () => {
      const markdown = `# PPROF Analysis: CPU

**Duration:** 30.5s | **Samples:** 45,231
`;
      const meta = extractProfileMeta(markdown);
      assert.strictEqual(meta?.type, "cpu");
      assert.strictEqual(meta?.durationSec, 30.5);
      assert.strictEqual(meta?.samples, 45231);
    });

    it("should extract Heap profile metadata", () => {
      const markdown = `# PPROF Analysis: Heap

**Samples:** 1,234
`;
      const meta = extractProfileMeta(markdown);
      assert.strictEqual(meta?.type, "heap");
      assert.strictEqual(meta?.samples, 1234);
    });
  });

  describe("extractHotspots", () => {
    it("should extract hotspots from table format", () => {
      const markdown = `## Top Hotspots

| Rank | Function | Self% | Cum% | Location |
|------|----------|-------|------|----------|
| 1 | \`JSON.parse\` | 23.4% | 23.4% | \`<native>\` |
| 2 | \`processRequest\` | 15.2% | 67.8% | \`handler.ts:142\` |
`;
      const hotspots = extractHotspots(markdown);
      assert.strictEqual(hotspots.length, 2);
      assert.strictEqual(hotspots[0].function, "JSON.parse");
      assert.strictEqual(hotspots[0].selfPct, 23.4);
      assert.strictEqual(hotspots[1].location, "handler.ts:142");
    });

    it("should extract hotspots from list format", () => {
      const markdown = `## Hotspots

1. \`JSON.parse\` (**23.4%**) → [Details](#json-parse)
2. \`processRequest\` (**15.2%**) → [Details](#processrequest)
`;
      const hotspots = extractHotspots(markdown);
      assert.strictEqual(hotspots.length, 2);
      assert.strictEqual(hotspots[0].function, "JSON.parse");
      assert.strictEqual(hotspots[0].selfPct, 23.4);
    });
  });

  describe("extractCallPath", () => {
    it("should extract call path from function details", () => {
      const markdown = `### \`JSON.parse\`

**Call path:** \`handleHTTP\` → \`processRequest\` → \`parseBody\` → \`JSON.parse\`
**Self-time:** 23.4%
`;
      const path = extractCallPath(markdown, "JSON.parse");
      assert.deepStrictEqual(path, [
        "handleHTTP",
        "processRequest",
        "parseBody",
        "JSON.parse",
      ]);
    });
  });
});
