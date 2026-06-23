import { beforeEach, describe, expect, it, vi } from "vitest";
import { stream as streamAnthropic } from "../src/api/anthropic-messages.ts";
import { getModel } from "../src/compat.ts";
import type { Context, Model } from "../src/types.ts";

const mockState = vi.hoisted(() => ({
	constructorOpts: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@anthropic-ai/sdk", () => {
	function createSseResponse(): Response {
		const body = [
			`event: message_start\ndata: ${JSON.stringify({
				type: "message_start",
				message: {
					id: "msg_test",
					usage: { input_tokens: 1, output_tokens: 0 },
				},
			})}\n`,
			`event: message_delta\ndata: ${JSON.stringify({
				type: "message_delta",
				delta: { stop_reason: "end_turn" },
				usage: { output_tokens: 1 },
			})}\n`,
			`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n`,
		].join("\n");

		return new Response(body, {
			status: 200,
			headers: { "content-type": "text/event-stream" },
		});
	}

	class FakeAnthropic {
		constructor(opts: Record<string, unknown>) {
			mockState.constructorOpts = opts;
		}

		messages = {
			create: () => ({
				asResponse: async () => createSseResponse(),
			}),
		};
	}

	return { default: FakeAnthropic };
});

const context: Context = {
	messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
};

async function drain(model: Model<"anthropic-messages">, apiKey: string, env?: Record<string, string>): Promise<void> {
	const stream = streamAnthropic(model, context, { apiKey, env });
	for await (const event of stream) {
		if (event.type === "done" || event.type === "error") break;
	}
}

describe("Anthropic environment auth", () => {
	beforeEach(() => {
		mockState.constructorOpts = undefined;
	});

	it("uses scoped ANTHROPIC_AUTH_TOKEN as bearer auth with ANTHROPIC_BASE_URL", async () => {
		const model = getModel("anthropic", "claude-haiku-4-5");
		await drain(model, "ada_test", {
			ANTHROPIC_AUTH_TOKEN: "ada_test",
			ANTHROPIC_BASE_URL: "http://my.company.com/coding-plan",
		});

		expect(mockState.constructorOpts).toMatchObject({
			apiKey: null,
			authToken: "ada_test",
			baseURL: "http://my.company.com/coding-plan",
		});
	});

	it("keeps ANTHROPIC_API_KEY on x-api-key auth when both env vars are configured", async () => {
		const model = getModel("anthropic", "claude-haiku-4-5");
		await drain(model, "api-key", {
			ANTHROPIC_API_KEY: "api-key",
			ANTHROPIC_AUTH_TOKEN: "bearer-token",
			ANTHROPIC_BASE_URL: "http://my.company.com/coding-plan",
		});

		expect(mockState.constructorOpts).toMatchObject({
			apiKey: "api-key",
			authToken: null,
			baseURL: "http://my.company.com/coding-plan",
		});
	});

	it("uses scoped ANTHROPIC_AUTH_TOKEN as bearer auth for Anthropic-compatible providers", async () => {
		const baseModel = getModel("anthropic", "claude-haiku-4-5");
		const model: Model<"anthropic-messages"> = {
			...baseModel,
			provider: "anthropic-proxy",
			baseUrl: "https://proxy.example.com/v1",
		};
		await drain(model, "ada_test", {
			ANTHROPIC_AUTH_TOKEN: "ada_test",
			ANTHROPIC_BASE_URL: "http://my.company.com/coding-plan",
		});

		expect(mockState.constructorOpts).toMatchObject({
			apiKey: null,
			authToken: "ada_test",
			baseURL: "https://proxy.example.com/v1",
		});
	});

	it("does not leak ambient ANTHROPIC_AUTH_TOKEN to Anthropic-compatible providers", async () => {
		const originalAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;
		process.env.ANTHROPIC_AUTH_TOKEN = "ambient-token";

		try {
			const baseModel = getModel("anthropic", "claude-haiku-4-5");
			const model: Model<"anthropic-messages"> = {
				...baseModel,
				provider: "xiaomi",
				baseUrl: "https://api.xiaomimimo.com/v1",
			};
			await drain(model, "ambient-token");

			expect(mockState.constructorOpts).toMatchObject({
				apiKey: "ambient-token",
				authToken: null,
				baseURL: "https://api.xiaomimimo.com/v1",
			});
		} finally {
			if (originalAuthToken === undefined) {
				delete process.env.ANTHROPIC_AUTH_TOKEN;
			} else {
				process.env.ANTHROPIC_AUTH_TOKEN = originalAuthToken;
			}
		}
	});
});
