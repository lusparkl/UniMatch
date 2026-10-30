import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  eval: vi.fn(),
  set: vi.fn(),
  decrby: vi.fn(),
  incrby: vi.fn(),
  quit: vi.fn(),
  pttl: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("../lib/queue", () => ({ redisConnection: () => mocks }));
vi.mock("../lib/db", () => ({
  db: {
    researchJob: { updateMany: mocks.updateMany, update: mocks.update },
    modelUsage: { create: mocks.create },
    $transaction: mocks.transaction,
  },
}));
import { OpenAIProvider, openAISchema } from "../lib/ai/openai";
import { extractionJsonSchema } from "../lib/research/extraction";
import { z } from "zod";
const schema = z.object({ answer: z.string() });
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key-never-live");
  vi.stubEnv("OPENAI_MODEL", "gpt-5.4-mini");
  vi.stubEnv("OPENAI_BASE_URL", "https://api.openai.com/v1");
  mocks.pttl.mockResolvedValue(-2);
  mocks.eval.mockResolvedValue(1);
  mocks.set.mockResolvedValue("OK");
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockResolvedValue([]);
});
describe("OpenAI provider (recorded transport, no external calls)", () => {
  it("uses documented schema format and records returned usage", async () => {
    const transport = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { content: '{"answer":"source-backed"}' },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
      }),
    );
    expect(
      await new OpenAIProvider("test", transport).structured(
        "Stable instructions",
        { text: "data" },
        z.toJSONSchema(schema),
        schema,
      ),
    ).toEqual({ answer: "source-backed" });
    const body = JSON.parse(transport.mock.calls[0][1].body);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.reasoning_effort).toBe("low");
    expect(body.store).toBe(false);
    expect(body.max_completion_tokens).toBe(4000);
    expect(transport.mock.calls[0][0]).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    expect(body.model).toBe("gpt-5.4-mini");
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalTokens: 25 }),
      }),
    );
  });
  it("omits reasoning_effort for models without reasoning support", async () => {
    vi.stubEnv("OPENAI_MODEL", "gpt-4.1-mini");
    const transport = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { content: '{"answer":"source-backed"}' },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
      }),
    );
    await new OpenAIProvider("test", transport).structured(
      "Stable instructions",
      { text: "data" },
      z.toJSONSchema(schema),
      schema,
    );
    const body = JSON.parse(transport.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-4.1-mini");
    expect(body).not.toHaveProperty("reasoning_effort");
  });
  it("adapts nested URL formats without weakening local validation", () => {
    const adapted = openAISchema(extractionJsonSchema);
    expect(JSON.stringify(adapted)).not.toContain('"format":"uri"');
    expect(JSON.stringify(extractionJsonSchema)).toContain('"format":"uri"');
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) return value.forEach(visit);
      const node = value as Record<string, unknown>;
      if (node.type === "object") {
        expect(node.additionalProperties).toBe(false);
        expect(node.required).toEqual(Object.keys(node.properties as object));
      }
      Object.values(node).forEach(visit);
    };
    visit(adapted);
  });
  it.each([
    { finish_reason: "length", message: { content: '{"answer":"partial"}' } },
    {
      finish_reason: "stop",
      message: { refusal: "Cannot comply", content: null },
    },
  ])(
    "rejects incomplete/refused output without a model fallback",
    async (choice) => {
      const transport = vi
        .fn()
        .mockResolvedValue(Response.json({ choices: [choice] }));
      await expect(
        new OpenAIProvider("test", transport).structured(
          "safe",
          {},
          z.toJSONSchema(schema),
          schema,
        ),
      ).rejects.toThrow("refusal, truncated output");
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it("retries rate limits with bounded backoff", async () => {
    vi.useFakeTimers();
    const transport = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            { finish_reason: "stop", message: { content: '{"answer":"ok"}' } },
          ],
        }),
      );
    const result = new OpenAIProvider("test", transport).structured(
      "safe",
      {},
      z.toJSONSchema(schema),
      schema,
    );
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ answer: "ok" });
    expect(transport).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
  it("reports failed provider requests honestly", async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 401 }));
    await expect(
      new OpenAIProvider("test", transport).structured(
        "",
        {},
        z.toJSONSchema(schema),
        schema,
      ),
    ).rejects.toThrow("HTTP 401");
  });
  it("refuses malformed structured data", async () => {
    const transport = vi.fn().mockResolvedValue(
      Response.json({
        choices: [
          { finish_reason: "stop", message: { content: '{"answer":42}' } },
        ],
      }),
    );
    await expect(
      new OpenAIProvider("test", transport).structured(
        "",
        {},
        z.toJSONSchema(schema),
        schema,
      ),
    ).rejects.toThrow("schema validation");
  });
  it("stops before a request when daily budget is exhausted", async () => {
    mocks.eval.mockResolvedValueOnce(0);
    const transport = vi.fn();
    await expect(
      new OpenAIProvider("test", transport).structured(
        "",
        {},
        z.toJSONSchema(schema),
        schema,
      ),
    ).rejects.toThrow("Daily OpenAI token budget");
    expect(transport).not.toHaveBeenCalled();
  });
  it("enforces persisted per-job call limits", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      new OpenAIProvider("test", vi.fn()).structured(
        "",
        {},
        z.toJSONSchema(schema),
        schema,
      ),
    ).rejects.toThrow("Per-job");
    expect(mocks.decrby).toHaveBeenCalled();
  });
  it("starts without a key and explicitly disables live requests", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(
      new OpenAIProvider("test", vi.fn()).structured(
        "",
        {},
        z.toJSONSchema(schema),
        schema,
      ),
    ).rejects.toThrow("disabled");
  });
});
