/**
 * HTTP API integration tests
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { createServer } from "../src/server/http.js";

function buildMultipartPayload(args: {
  fields?: Record<string, string>;
  files?: Array<{
    fieldName: string;
    filename: string;
    contentType?: string;
    content: Buffer;
  }>;
}): { body: Buffer; contentType: string } {
  const boundary = `----perf-skill-${randomUUID()}`;
  const chunks: Buffer[] = [];

  const push = (value: string | Buffer) => {
    chunks.push(typeof value === "string" ? Buffer.from(value, "utf8") : value);
  };

  for (const [name, value] of Object.entries(args.fields ?? {})) {
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
    push(value);
    push("\r\n");
  }

  for (const file of args.files ?? []) {
    push(`--${boundary}\r\n`);
    push(
      `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n`
    );
    push(`Content-Type: ${file.contentType ?? "application/octet-stream"}\r\n\r\n`);
    push(file.content);
    push("\r\n");
  }

  push(`--${boundary}--\r\n`);

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe("http api", () => {
  it("parses analyze options from JSON field", async () => {
    let receivedOptions: unknown;
    const server = await createServer({
      analyzeFn: async (_profile, options) => {
        receivedOptions = options;
        return { markdown: "ok", hotspots: [] };
      },
    });

    const payload = buildMultipartPayload({
      fields: { options: JSON.stringify({ mode: "convert-only", includeSource: true }) },
      files: [
        {
          fieldName: "file",
          filename: "profile.pb",
          content: Buffer.from("dummy"),
        },
      ],
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/pprof/analyze",
      payload: payload.body,
      headers: { "content-type": payload.contentType },
    });

    try {
      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body) as { success: boolean };
      assert.strictEqual(body.success, true);
      assert.deepStrictEqual(receivedOptions, { mode: "convert-only", includeSource: true });
    } finally {
      await server.close();
    }
  });

  it("parses diff options from JSON field", async () => {
    let receivedOptions: unknown;
    const server = await createServer({
      diffFn: async (_base, _current, options) => {
        receivedOptions = options;
        return { markdown: "diff", regressions: [], improvements: [], summary: [] };
      },
    });

    const payload = buildMultipartPayload({
      fields: { options: JSON.stringify({ normalize: "none", maxRegressions: 2 }) },
      files: [
        {
          fieldName: "base",
          filename: "base.pb",
          content: Buffer.from("base"),
        },
        {
          fieldName: "current",
          filename: "current.pb",
          content: Buffer.from("current"),
        },
      ],
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/pprof/diff",
      payload: payload.body,
      headers: { "content-type": payload.contentType },
    });

    try {
      assert.strictEqual(response.statusCode, 200);
      const body = JSON.parse(response.body) as { success: boolean };
      assert.strictEqual(body.success, true);
      assert.deepStrictEqual(receivedOptions, { normalize: "none", maxRegressions: 2 });
    } finally {
      await server.close();
    }
  });
});
