/**
 * LLM client abstraction - supports OpenAI and compatible APIs
 */

import OpenAI from "openai";
import type { LLMConfig } from "../types.js";
import { logger } from "../utils/logger.js";
import { withTimeout } from "../utils/limits.js";

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  durationMs: number;
}

export interface LLMClient {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<LLMResponse>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

const DEFAULT_LLM_TIMEOUT_MS = 30_000;
const DEFAULT_LLM_MAX_RETRIES = 2;
const DEFAULT_LLM_RETRY_DELAY_MS = 500;

function parseEnvNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetries<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelayMs: number; label: string }
): Promise<T> {
  let attempt = 0;
  // attempt = 0 is the initial try
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= options.maxRetries) {
        throw error;
      }
      const delay = options.baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 100);
      logger.warn(`${options.label} failed, retrying`, {
        attempt: attempt + 1,
        delayMs: delay + jitter,
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(delay + jitter);
      attempt += 1;
    }
  }
}

/**
 * Create an LLM client based on configuration
 */
export function createLLMClient(config: LLMConfig): LLMClient {
  switch (config.provider) {
    case "openai":
    case "azure-openai":
    case "custom":
      return new OpenAICompatibleClient(config);
    case "anthropic":
      return new AnthropicClient(config);
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}

/**
 * Custom error class for LLM configuration issues
 */
export class LLMNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`${provider} API key is required. Set the appropriate environment variable (OPENAI_API_KEY or ANTHROPIC_API_KEY) or provide apiKey in configuration.`);
    this.name = "LLMNotConfiguredError";
  }
}

/**
 * OpenAI-compatible client (works with OpenAI, Azure, and compatible APIs)
 */
class OpenAICompatibleClient implements LLMClient {
  private client: OpenAI;
  private model: string;
  private defaultMaxTokens: number;
  private defaultTemperature: number;
  private timeoutMs: number;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(config: LLMConfig) {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new LLMNotConfiguredError("OpenAI");
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: config.baseUrl || process.env.OPENAI_BASE_URL,
    });

    this.model = config.model || "gpt-5.2";
    this.defaultMaxTokens = config.maxTokens || 4096;
    this.defaultTemperature = config.temperature ?? 0.1;
    this.timeoutMs =
      config.timeoutMs ??
      parseEnvNumber(process.env.LLM_TIMEOUT_MS, DEFAULT_LLM_TIMEOUT_MS);
    this.maxRetries =
      config.maxRetries ??
      parseEnvNumber(process.env.LLM_MAX_RETRIES, DEFAULT_LLM_MAX_RETRIES);
    this.retryDelayMs =
      config.retryDelayMs ??
      parseEnvNumber(
        process.env.LLM_RETRY_DELAY_MS,
        DEFAULT_LLM_RETRY_DELAY_MS
      );
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {}
  ): Promise<LLMResponse> {
    const startTime = performance.now();

    logger.debug("LLM request", {
      model: this.model,
      messageCount: messages.length,
      jsonMode: options.jsonMode,
    });

    try {
      const response = await withRetries(
        () =>
          withTimeout(
            this.client.chat.completions.create({
              model: this.model,
              messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              max_tokens: options.maxTokens || this.defaultMaxTokens,
              temperature: options.temperature ?? this.defaultTemperature,
              response_format: options.jsonMode
                ? { type: "json_object" }
                : undefined,
            }),
            this.timeoutMs,
            "LLM request timed out"
          ),
        {
          maxRetries: this.maxRetries,
          baseDelayMs: this.retryDelayMs,
          label: "OpenAI request",
        }
      );

      const durationMs = performance.now() - startTime;
      const content = response.choices[0]?.message?.content || "";

      logger.debug("LLM response", {
        durationMs: Math.round(durationMs),
        tokens: response.usage?.total_tokens,
        contentLength: content.length,
      });

      return {
        content,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
        durationMs,
      };
    } catch (error) {
      logger.error("LLM request failed", {
        error: error instanceof Error ? error.message : String(error),
        model: this.model,
      });
      throw error;
    }
  }
}

/**
 * Anthropic Claude client
 */
class AnthropicClient implements LLMClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private defaultMaxTokens: number;
  private defaultTemperature: number;
  private timeoutMs: number;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(config: LLMConfig) {
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || "";
    if (!this.apiKey) {
      throw new LLMNotConfiguredError("Anthropic");
    }

    this.baseUrl = config.baseUrl || "https://api.anthropic.com";
    this.model = config.model || "claude-sonnet-4-20250514";
    this.defaultMaxTokens = config.maxTokens || 4096;
    this.defaultTemperature = config.temperature ?? 0.1;
    this.timeoutMs =
      config.timeoutMs ??
      parseEnvNumber(process.env.LLM_TIMEOUT_MS, DEFAULT_LLM_TIMEOUT_MS);
    this.maxRetries =
      config.maxRetries ??
      parseEnvNumber(process.env.LLM_MAX_RETRIES, DEFAULT_LLM_MAX_RETRIES);
    this.retryDelayMs =
      config.retryDelayMs ??
      parseEnvNumber(
        process.env.LLM_RETRY_DELAY_MS,
        DEFAULT_LLM_RETRY_DELAY_MS
      );
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {}
  ): Promise<LLMResponse> {
    const startTime = performance.now();

    // Extract system message
    const systemMessage =
      messages.find((m) => m.role === "system")?.content || "";
    const userMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    logger.debug("Anthropic request", {
      model: this.model,
      messageCount: userMessages.length,
    });

    try {
      const response = await withRetries(
        async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), this.timeoutMs);
          try {
            return await fetch(`${this.baseUrl}/v1/messages`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": this.apiKey,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: this.model,
                max_tokens: options.maxTokens || this.defaultMaxTokens,
                temperature: options.temperature ?? this.defaultTemperature,
                system: systemMessage,
                messages: userMessages,
              }),
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timer);
          }
        },
        {
          maxRetries: this.maxRetries,
          baseDelayMs: this.retryDelayMs,
          label: "Anthropic request",
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as {
        content: Array<{ type: string; text: string }>;
        usage?: { input_tokens: number; output_tokens: number };
      };
      const durationMs = performance.now() - startTime;
      const content = data.content[0]?.text || "";

      logger.debug("Anthropic response", {
        durationMs: Math.round(durationMs),
        contentLength: content.length,
      });

      return {
        content,
        usage: data.usage
          ? {
              promptTokens: data.usage.input_tokens,
              completionTokens: data.usage.output_tokens,
              totalTokens: data.usage.input_tokens + data.usage.output_tokens,
            }
          : undefined,
        durationMs,
      };
    } catch (error) {
      logger.error("Anthropic request failed", {
        error: error instanceof Error ? error.message : String(error),
        model: this.model,
      });
      throw error;
    }
  }
}

/**
 * Get default LLM configuration from environment
 */
export function getDefaultLLMConfig(): LLMConfig {
  const provider =
    (process.env.LLM_PROVIDER as LLMConfig["provider"]) || "openai";

  return {
    provider,
    model:
      process.env.LLM_MODEL ||
      (provider === "anthropic" ? "claude-sonnet-4-20250514" : "gpt-5.2"),
    apiKey:
      process.env.LLM_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.LLM_BASE_URL,
    maxTokens: process.env.LLM_MAX_TOKENS
      ? parseInt(process.env.LLM_MAX_TOKENS, 10)
      : undefined,
    temperature: process.env.LLM_TEMPERATURE
      ? parseFloat(process.env.LLM_TEMPERATURE)
      : undefined,
  };
}
