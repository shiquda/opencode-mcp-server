#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	Tool,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

// Default configuration (loaded from environment variables)
const DEFAULT_CONFIG = {
	url: process.env.OPENCODE_URL || "http://127.0.0.1:4096",
	username: process.env.OPENCODE_USERNAME || "opencode",
	password: process.env.OPENCODE_PASSWORD || "",
	token: process.env.OPENCODE_TOKEN || "",
	authType: process.env.OPENCODE_AUTH_TYPE || "basic", // OpenCode uses basic auth by default
};

const PORT = parseInt(process.env.PORT || "3000");

const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 200;
const DEFAULT_MAX_OUTPUT_TOKENS = 5000;
const MAX_OUTPUT_TOKENS = 20000;
const DEFAULT_MESSAGE_FIELDS = [
	"info.id",
	"info.role",
	"info.time",
	"parts.type",
	"parts.text",
];

type CursorPayload = {
	offset: number;
};

type AsyncRequestPayload = {
	session_id: string;
	message_id: string;
	submitted_at_ms: number;
};

type PendingQuestion = {
	id: string;
	sessionID: string;
	questions: Array<{
		question: string;
		header: string;
	}>;
};

type SessionStatusInfo = {
	type: "idle" | "busy" | "retry";
	attempt?: number;
	message?: string;
	next?: number;
};

// Generate authentication headers
function getAuthHeader(config: typeof DEFAULT_CONFIG): Record<string, string> {
	const headers: Record<string, string> = {};

	switch (config.authType) {
		case "bearer":
			if (config.token) {
				headers["Authorization"] = `Bearer ${config.token}`;
			} else if (config.password) {
				headers["Authorization"] = `Bearer ${config.password}`;
			}
			break;
		case "basic":
			// OpenCode uses basic auth, username is "opencode", password is the one set during serve
			const user = config.username || "opencode";
			const pass = config.password;
			if (pass) {
				const credentials = Buffer.from(`${user}:${pass}`).toString("base64");
				headers["Authorization"] = `Basic ${credentials}`;
			}
			break;
		case "none":
		default:
			break;
	}

	return headers;
}

function estimateTokensFromString(value: string): number {
	return Math.ceil(value.length / 4);
}

function estimateTokensFromObject(value: unknown): number {
	return estimateTokensFromString(JSON.stringify(value));
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMessageId(message: unknown): string | null {
	if (!message || typeof message !== "object") {
		return null;
	}

	const info = (message as { info?: unknown }).info;
	if (!info || typeof info !== "object") {
		return null;
	}

	const id = (info as { id?: unknown }).id;
	return typeof id === "string" && id.length > 0 ? id : null;
}

function getMessageRole(message: unknown): string | null {
	if (!message || typeof message !== "object") {
		return null;
	}

	const info = (message as { info?: unknown }).info;
	if (!info || typeof info !== "object") {
		return null;
	}

	const role = (info as { role?: unknown }).role;
	return typeof role === "string" && role.length > 0 ? role : null;
}

function getMessageParentId(message: unknown): string | null {
	if (!message || typeof message !== "object") {
		return null;
	}

	const info = (message as { info?: unknown }).info;
	if (!info || typeof info !== "object") {
		return null;
	}

	const parentId = (info as { parentID?: unknown }).parentID;
	return typeof parentId === "string" && parentId.length > 0 ? parentId : null;
}

function generateMessageId(): string {
	return `msg_async_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function encodeAsyncRequestId(payload: AsyncRequestPayload): string {
	return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeAsyncRequestId(asyncRequestId: string): AsyncRequestPayload {
	try {
		const parsed = JSON.parse(
			Buffer.from(asyncRequestId, "base64url").toString("utf8"),
		) as Partial<AsyncRequestPayload>;

		if (
			typeof parsed.session_id !== "string" ||
			typeof parsed.message_id !== "string" ||
			typeof parsed.submitted_at_ms !== "number"
		) {
			throw new Error("missing fields");
		}

		return {
			session_id: parsed.session_id,
			message_id: parsed.message_id,
			submitted_at_ms: parsed.submitted_at_ms,
		};
	} catch {
		throw new Error(
			"Invalid async_request_id. Expected a base64url encoded async request id.",
		);
	}
}

async function fetchSessionMessages(
	baseUrl: string,
	authHeaders: Record<string, string>,
	sessionId: string,
	limit: number,
): Promise<unknown[]> {
	const queryParams = new URLSearchParams();
	queryParams.append("limit", limit.toString());

	const response = await fetch(
		`${baseUrl}/session/${sessionId}/message?${queryParams}`,
		{
			headers: authHeaders,
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to get messages: ${response.status}`);
	}

	const messages = await response.json();
	if (!Array.isArray(messages)) {
		throw new Error("Unexpected message response format: expected an array.");
	}

	return messages;
}

async function fetchOptionalJson(
	url: string,
	authHeaders: Record<string, string>,
): Promise<unknown | null> {
	try {
		const response = await fetch(url, { headers: authHeaders });
		if (!response.ok) {
			return null;
		}
		return await response.json();
	} catch {
		return null;
	}
}

function getPartTypes(message: unknown): string[] {
	if (!message || typeof message !== "object") {
		return [];
	}
	const parts = (message as { parts?: unknown }).parts;
	if (!Array.isArray(parts)) {
		return [];
	}

	return parts
		.map((part) => {
			if (!part || typeof part !== "object") {
				return null;
			}
			const type = (part as { type?: unknown }).type;
			return typeof type === "string" ? type : null;
		})
		.filter((type): type is string => !!type);
}

function getFirstTextPreview(message: unknown, maxLength = 180): string | null {
	if (!message || typeof message !== "object") {
		return null;
	}
	const parts = (message as { parts?: unknown }).parts;
	if (!Array.isArray(parts)) {
		return null;
	}

	for (const part of parts) {
		if (!part || typeof part !== "object") {
			continue;
		}
		const type = (part as { type?: unknown }).type;
		const text = (part as { text?: unknown }).text;
		if (type === "text" && typeof text === "string" && text.length > 0) {
			return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
		}
	}

	return null;
}

function findLatestAssistantReplyByParentId(
	messages: unknown[],
	parentMessageId: string,
): unknown | null {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i];
		if (getMessageRole(message) !== "assistant") {
			continue;
		}
		if (getMessageParentId(message) !== parentMessageId) {
			continue;
		}
		return message;
	}

	return null;
}

function normalizePendingQuestions(value: unknown): PendingQuestion[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
		.map((item) => {
			const id = typeof item.id === "string" ? item.id : "";
			const sessionID = typeof item.sessionID === "string" ? item.sessionID : "";
			const rawQuestions = Array.isArray(item.questions) ? item.questions : [];
			const questions = rawQuestions
				.filter(
					(question): question is Record<string, unknown> =>
						!!question && typeof question === "object",
				)
				.map((question) => ({
					question:
						typeof question.question === "string" ? question.question : "",
					header:
						typeof question.header === "string" ? question.header : "",
				}));
			return { id, sessionID, questions };
		})
		.filter((item) => item.id && item.sessionID);
}

async function fetchPendingQuestionsForSession(
	baseUrl: string,
	authHeaders: Record<string, string>,
	sessionId: string,
): Promise<PendingQuestion[]> {
	const raw = await fetchOptionalJson(`${baseUrl}/question`, authHeaders);
	return normalizePendingQuestions(raw).filter(
		(question) => question.sessionID === sessionId,
	);
}

function normalizeSessionStatusInfo(value: unknown): SessionStatusInfo | null {
	if (!value || typeof value !== "object") {
		return null;
	}

	const record = value as Record<string, unknown>;
	const type = record.type;
	if (type !== "idle" && type !== "busy" && type !== "retry") {
		return null;
	}

	const normalized: SessionStatusInfo = { type };
	if (typeof record.attempt === "number") {
		normalized.attempt = record.attempt;
	}
	if (typeof record.message === "string") {
		normalized.message = record.message;
	}
	if (typeof record.next === "number") {
		normalized.next = record.next;
	}

	return normalized;
}

function getSessionStatusForSession(
	value: unknown,
	sessionId: string,
): SessionStatusInfo | null {
	if (!value || typeof value !== "object") {
		return null;
	}

	const statuses = value as Record<string, unknown>;
	return normalizeSessionStatusInfo(statuses[sessionId]);
}

async function fetchSessionStatusForSession(
	baseUrl: string,
	authHeaders: Record<string, string>,
	sessionId: string,
): Promise<SessionStatusInfo | null> {
	const raw = await fetchOptionalJson(`${baseUrl}/session/status`, authHeaders);
	return getSessionStatusForSession(raw, sessionId);
}

function encodeCursor(payload: CursorPayload): string {
	return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeCursor(cursor?: string): CursorPayload {
	if (!cursor) {
		return { offset: 0 };
	}

	try {
		const parsed = JSON.parse(
			Buffer.from(cursor, "base64url").toString("utf8"),
		) as Partial<CursorPayload>;
		const offset = Number(parsed.offset);
		if (!Number.isInteger(offset) || offset < 0) {
			throw new Error("invalid offset");
		}
		return { offset };
	} catch {
		throw new Error("Invalid cursor. Expected a base64url encoded cursor.");
	}
}

function parseRequestedFields(fields: unknown): string[] {
	if (fields === undefined || fields === null) {
		return [...DEFAULT_MESSAGE_FIELDS];
	}

	const values = Array.isArray(fields)
		? fields
		: String(fields)
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean);

	const normalized = values
		.map((item) => String(item).trim())
		.filter(Boolean);

	if (normalized.length === 0) {
		return [...DEFAULT_MESSAGE_FIELDS];
	}

	if (normalized.includes("*")) {
		return ["*"];
	}

	return Array.from(new Set(normalized));
}

function pathExists(value: unknown, path: string[]): boolean {
	if (path.length === 0) {
		return true;
	}

	if (Array.isArray(value)) {
		return value.some((entry) => pathExists(entry, path));
	}

	if (!value || typeof value !== "object") {
		return false;
	}

	const [head, ...rest] = path;
	const record = value as Record<string, unknown>;
	if (!(head in record)) {
		return false;
	}

	return pathExists(record[head], rest);
}

function projectValue(value: unknown, pathGroups: string[][]): unknown {
	if (pathGroups.some((path) => path.length === 0)) {
		return value;
	}

	if (Array.isArray(value)) {
		return value
			.map((entry) => projectValue(entry, pathGroups))
			.filter((entry) => entry !== undefined);
	}

	if (!value || typeof value !== "object") {
		return undefined;
	}

	const record = value as Record<string, unknown>;
	const buckets = new Map<string, string[][]>();

	for (const path of pathGroups) {
		if (path.length === 0) {
			continue;
		}
		const [head, ...rest] = path;
		const current = buckets.get(head) || [];
		current.push(rest);
		buckets.set(head, current);
	}

	const output: Record<string, unknown> = {};
	for (const [key, nestedPaths] of buckets.entries()) {
		if (!(key in record)) {
			continue;
		}

		const projected = projectValue(record[key], nestedPaths);
		if (projected !== undefined) {
			output[key] = projected;
		}
	}

	return Object.keys(output).length > 0 ? output : undefined;
}

function projectMessage(
	message: unknown,
	fields: string[],
): {
	projected: unknown;
	missingFields: string[];
} {
	if (fields.includes("*")) {
		return { projected: message, missingFields: [] };
	}

	const paths = fields.map((field) => field.split(".").filter(Boolean));
	const missingFields = fields.filter(
		(field) => !pathExists(message, field.split(".").filter(Boolean)),
	);
	const projected = projectValue(message, paths) ?? {};

	return {
		projected,
		missingFields,
	};
}

// Define tools
const TOOLS: Tool[] = [
	{
		name: "opencode_chat",
		description:
			"Send a message to OpenCode Agent to execute programming tasks. Creates a new session if no session_id is provided, then sends the message.",
		inputSchema: {
			type: "object",
			properties: {
				message: {
					type: "string",
					description:
						"Message/task description to send to OpenCode (required)",
				},
				session_id: {
					type: "string",
					description:
						"Optional session ID. If not provided, a new session will be created automatically",
				},
				directory: {
					type: "string",
					description:
						"Working directory (optional, for specifying project path)",
				},
				url: {
					type: "string",
					description: `OpenCode server address (optional, default: ${DEFAULT_CONFIG.url})`,
				},
				username: {
					type: "string",
					description: "Username (optional, default: opencode)",
				},
				password: {
					type: "string",
					description: "Password (optional, loaded from environment variable)",
				},
				auth_type: {
					type: "string",
					description:
						"Authentication type: basic | bearer | none (optional, default: basic)",
					enum: ["basic", "bearer", "none"],
				},
			},
			required: ["message"],
		},
	},
	{
		name: "opencode_create_session",
		description: "Create a new OpenCode session",
		inputSchema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					description: "Session title (optional)",
				},
				directory: {
					type: "string",
					description: "Working directory (optional)",
				},
				url: {
					type: "string",
					description: `OpenCode server address (optional, default: ${DEFAULT_CONFIG.url})`,
				},
				username: {
					type: "string",
					description: "Username (optional)",
				},
				password: {
					type: "string",
					description: "Password (optional)",
				},
				auth_type: {
					type: "string",
					description: "Authentication type (optional, default: basic)",
					enum: ["basic", "bearer", "none"],
				},
			},
		},
	},
	{
		name: "opencode_chat_async",
		description:
			"Send a message asynchronously. Returns immediately and can be paired with opencode_wait_for_reply.",
		inputSchema: {
			type: "object",
			properties: {
				message: {
					type: "string",
					description:
						"Message/task description to send to OpenCode (required)",
				},
				session_id: {
					type: "string",
					description:
						"Optional session ID. If not provided, a new session will be created automatically",
				},
				directory: {
					type: "string",
					description: "Working directory (optional)",
				},
				url: {
					type: "string",
					description: `OpenCode server address (optional, default: ${DEFAULT_CONFIG.url})`,
				},
				username: {
					type: "string",
					description: "Username (optional, default: opencode)",
				},
				password: {
					type: "string",
					description: "Password (optional, loaded from environment variable)",
				},
				auth_type: {
					type: "string",
					description:
						"Authentication type: basic | bearer | none (optional, default: basic)",
					enum: ["basic", "bearer", "none"],
				},
			},
			required: ["message"],
		},
	},
	{
		name: "opencode_wait_for_reply",
		description:
			"Wait for assistant output of an async request. Returns full reply when idle, partial reply while streaming, or diagnostics on timeout.",
		inputSchema: {
			type: "object",
			properties: {
				async_request_id: {
					type: "string",
					description:
						"Async request id returned by opencode_chat_async (required)",
				},
				timeout_seconds: {
					type: "number",
					description: "Maximum wait time in seconds (optional, default: 30)",
				},
				poll_interval_ms: {
					type: "number",
					description:
						"Polling interval in milliseconds (optional, default: 500, min: 300)",
				},
				poll_limit: {
					type: "number",
					description:
						"Messages fetched each poll (optional, default: 200, max: 200)",
				},
				url: {
					type: "string",
					description: `OpenCode server address (optional, default: ${DEFAULT_CONFIG.url})`,
				},
				username: {
					type: "string",
					description: "Username (optional)",
				},
				password: {
					type: "string",
					description: "Password (optional)",
				},
				auth_type: {
					type: "string",
					description: "Authentication type (optional, default: basic)",
					enum: ["basic", "bearer", "none"],
				},
			},
			required: ["async_request_id"],
		},
	},
	{
		name: "opencode_list_questions",
		description: "List pending question requests from OpenCode",
		inputSchema: {
			type: "object",
			properties: {
				session_id: {
					type: "string",
					description: "Filter pending questions by session ID (optional)",
				},
				url: {
					type: "string",
					description: `OpenCode server address (optional, default: ${DEFAULT_CONFIG.url})`,
				},
				username: {
					type: "string",
					description: "Username (optional)",
				},
				password: {
					type: "string",
					description: "Password (optional)",
				},
				auth_type: {
					type: "string",
					description: "Authentication type (optional, default: basic)",
					enum: ["basic", "bearer", "none"],
				},
			},
		},
	},
	{
		name: "opencode_answer_question",
		description: "Reply to a pending question request",
		inputSchema: {
			type: "object",
			properties: {
				request_id: {
					type: "string",
					description: "Question request ID (required)",
				},
				answers: {
					type: "array",
					description:
						"Answers in order of questions. Each entry is an array of selected labels.",
					items: {
						type: "array",
						items: {
							type: "string",
						},
					},
				},
				url: {
					type: "string",
					description: `OpenCode server address (optional, default: ${DEFAULT_CONFIG.url})`,
				},
				username: {
					type: "string",
					description: "Username (optional)",
				},
				password: {
					type: "string",
					description: "Password (optional)",
				},
				auth_type: {
					type: "string",
					description: "Authentication type (optional, default: basic)",
					enum: ["basic", "bearer", "none"],
				},
			},
			required: ["request_id", "answers"],
		},
	},
	{
		name: "opencode_reject_question",
		description: "Reject a pending question request",
		inputSchema: {
			type: "object",
			properties: {
				request_id: {
					type: "string",
					description: "Question request ID (required)",
				},
				url: {
					type: "string",
					description: `OpenCode server address (optional, default: ${DEFAULT_CONFIG.url})`,
				},
				username: {
					type: "string",
					description: "Username (optional)",
				},
				password: {
					type: "string",
					description: "Password (optional)",
				},
				auth_type: {
					type: "string",
					description: "Authentication type (optional, default: basic)",
					enum: ["basic", "bearer", "none"],
				},
			},
			required: ["request_id"],
		},
	},
	{
		name: "opencode_list_sessions",
		description:
			'List all OpenCode sessions. By default, filters out subagent sessions (those containing "subagent" in the title).',
		inputSchema: {
			type: "object",
			properties: {
				directory: {
					type: "string",
					description: "Filter by directory (optional)",
				},
				limit: {
					type: "number",
					description: "Maximum number of results (optional)",
				},
				include_subagents: {
					type: "boolean",
					description: "Whether to include subagent sessions (default: false)",
				},
				url: {
					type: "string",
					description: `OpenCode server address (optional, default: ${DEFAULT_CONFIG.url})`,
				},
				username: {
					type: "string",
					description: "Username (optional)",
				},
				password: {
					type: "string",
					description: "Password (optional)",
				},
				auth_type: {
					type: "string",
					description: "Authentication type (optional, default: basic)",
					enum: ["basic", "bearer", "none"],
				},
			},
		},
	},
	{
		name: "opencode_get_session",
		description: "Get detailed information about a specific session",
		inputSchema: {
			type: "object",
			properties: {
				session_id: {
					type: "string",
					description: "Session ID (required, format: ses_xxx)",
				},
				url: {
					type: "string",
					description: `OpenCode server address (optional, default: ${DEFAULT_CONFIG.url})`,
				},
				username: {
					type: "string",
					description: "Username (optional)",
				},
				password: {
					type: "string",
					description: "Password (optional)",
				},
				auth_type: {
					type: "string",
					description: "Authentication type (optional, default: basic)",
					enum: ["basic", "bearer", "none"],
				},
			},
			required: ["session_id"],
		},
	},
	{
		name: "opencode_get_messages",
		description:
			"Get session messages with segmented query, token budget, and field projection",
		inputSchema: {
			type: "object",
			properties: {
				session_id: {
					type: "string",
					description: "Session ID (required)",
				},
				limit: {
					type: "number",
					description:
						"Page size (optional, default: 50, max: 200). Used with cursor for segmented query",
				},
				cursor: {
					type: "string",
					description:
						"Opaque cursor from previous response (optional, for segmented query)",
				},
				max_output_tokens: {
					type: "number",
					description:
						"Estimated token budget for this response (optional, default: 5000, max: 20000)",
				},
				fields: {
					type: "array",
					description:
						"Projected fields to return (optional). Example: [\"info.id\",\"parts.text\"] or [\"*\"]",
					items: {
						type: "string",
					},
				},
				url: {
					type: "string",
					description: `OpenCode server address (optional, default: ${DEFAULT_CONFIG.url})`,
				},
				username: {
					type: "string",
					description: "Username (optional)",
				},
				password: {
					type: "string",
					description: "Password (optional)",
				},
				auth_type: {
					type: "string",
					description: "Authentication type (optional, default: basic)",
					enum: ["basic", "bearer", "none"],
				},
			},
			required: ["session_id"],
		},
	},
	{
		name: "opencode_check_health",
		description: "Check OpenCode server connection status",
		inputSchema: {
			type: "object",
			properties: {
				url: {
					type: "string",
					description: `OpenCode server address (optional, default: ${DEFAULT_CONFIG.url})`,
				},
				username: {
					type: "string",
					description: "Username (optional)",
				},
				password: {
					type: "string",
					description: "Password (optional)",
				},
				auth_type: {
					type: "string",
					description: "Authentication type (optional, default: basic)",
					enum: ["basic", "bearer", "none"],
				},
			},
		},
	},
];

// Create MCP Server
const server = new Server(
	{
		name: "opencode-remote-mcp",
		version: "0.1.0",
	},
	{
		capabilities: {
			tools: {},
		},
	},
);

// Handle tool list requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
	return { tools: TOOLS };
});

// Handle tool call requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;

	try {
		// Merge configuration: params > env vars > defaults
		const config = {
			url: (args?.url as string) || DEFAULT_CONFIG.url,
			username: (args?.username as string) || DEFAULT_CONFIG.username,
			password: (args?.password as string) || DEFAULT_CONFIG.password,
			token: (args?.password as string) || DEFAULT_CONFIG.token,
			authType: (
				(args?.auth_type as string) || DEFAULT_CONFIG.authType
			).toLowerCase(),
		};

		// Ensure URL format is correct
		const baseUrl = config.url.replace(/\/$/, "");
		const authHeaders = getAuthHeader(config);

			switch (name) {
				case "opencode_chat": {
				const { message, session_id, directory } = args as {
					message: string;
					session_id?: string;
					directory?: string;
				};

				let targetSessionId = session_id;

				// Create a new session if no session_id is provided
				if (!targetSessionId) {
					const queryParams = new URLSearchParams();
					if (directory) queryParams.append("directory", directory);

					const createResponse = await fetch(
						`${baseUrl}/session?${queryParams}`,
						{
							method: "POST",
							headers: {
								...authHeaders,
							},
						},
					);

					if (!createResponse.ok) {
						const error = await createResponse.text();
						throw new Error(
							`Failed to create session: ${createResponse.status} - ${error}`,
						);
					}

					const sessionData = (await createResponse.json()) as { id: string };
					targetSessionId = sessionData.id;
				}

				// Send message to session
				const queryParams = new URLSearchParams();
				if (directory) queryParams.append("directory", directory);

				const response = await fetch(
					`${baseUrl}/session/${targetSessionId}/message?${queryParams}`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							...authHeaders,
						},
						body: JSON.stringify({
							parts: [{ type: "text", text: message }],
						}),
					},
				);

				if (!response.ok) {
					const error = await response.text();
					throw new Error(
						`Failed to send message: ${response.status} - ${error}`,
					);
				}

				const data = (await response.json()) as {
					info?: { id: string };
					parts?: any[];
				};
				return {
					content: [
						{
							type: "text",
							text: `✅ Message sent!\nSession ID: ${targetSessionId}\nMessage ID: ${data.info?.id || "unknown"}\n\nResponse:\n${JSON.stringify(data, null, 2)}`,
						},
					],
				};
				}

				case "opencode_chat_async": {
					const { message, session_id, directory } = args as {
						message: string;
						session_id?: string;
						directory?: string;
					};

					let targetSessionId = session_id;
					if (!targetSessionId) {
						const queryParams = new URLSearchParams();
						if (directory) queryParams.append("directory", directory);

						const createResponse = await fetch(
							`${baseUrl}/session?${queryParams}`,
							{
								method: "POST",
								headers: {
									...authHeaders,
								},
							},
						);

						if (!createResponse.ok) {
							const error = await createResponse.text();
							throw new Error(
								`Failed to create session: ${createResponse.status} - ${error}`,
							);
						}

						const sessionData = (await createResponse.json()) as { id: string };
						targetSessionId = sessionData.id;
					}

					const queryParams = new URLSearchParams();
					if (directory) queryParams.append("directory", directory);

					const submittedAtMs = Date.now();
					const asyncMessageId = generateMessageId();
					const pendingBeforeSend = await fetchPendingQuestionsForSession(
						baseUrl,
						authHeaders,
						targetSessionId,
					);
					if (pendingBeforeSend.length > 0) {
						return {
							content: [
								{
									type: "text",
									text: `⛔ Session blocked by pending question\n${JSON.stringify(
										{
											session_id: targetSessionId,
											blocked_by: "question",
											pending_questions: pendingBeforeSend.map((question) => ({
												request_id: question.id,
												question_count: question.questions.length,
												headers: question.questions.map((q) => q.header),
											})),
											next_action:
												"Use opencode_list_questions then opencode_answer_question/opencode_reject_question before sending new prompts to this session.",
										},
										null,
										2,
									)}`,
								},
							],
						};
					}
					const response = await fetch(
						`${baseUrl}/session/${targetSessionId}/prompt_async?${queryParams}`,
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								...authHeaders,
							},
							body: JSON.stringify({
								messageID: asyncMessageId,
								parts: [{ type: "text", text: message }],
							}),
						},
					);

					if (!response.ok) {
						const error = await response.text();
						throw new Error(
							`Failed to send async message: ${response.status} - ${error}`,
						);
					}

					const asyncRequestId = encodeAsyncRequestId({
						session_id: targetSessionId,
						message_id: asyncMessageId,
						submitted_at_ms: submittedAtMs,
					});

					return {
						content: [
							{
								type: "text",
								text: `✅ Async message accepted\n${JSON.stringify(
									{
										session_id: targetSessionId,
										message_id: asyncMessageId,
										submitted_at_ms: submittedAtMs,
										async_request_id: asyncRequestId,
										tip: "Pass async_request_id to opencode_wait_for_reply.",
									},
									null,
									2,
								)}`,
							},
						],
					};
				}

				case "opencode_wait_for_reply": {
					const {
						async_request_id,
						timeout_seconds,
						poll_interval_ms,
						poll_limit,
					} = args as {
						async_request_id: string;
						timeout_seconds?: number;
						poll_interval_ms?: number;
						poll_limit?: number;
					};

					const requestPayload = decodeAsyncRequestId(async_request_id);
					const session_id = requestPayload.session_id;
					const targetMessageId = requestPayload.message_id;

					const timeoutMs = Math.max(Math.floor((timeout_seconds ?? 30) * 1000), 1000);
					const intervalMs = Math.max(Math.floor(poll_interval_ms ?? 500), 300);
					const pollLimitValue = Math.min(
						Math.max(Math.floor(poll_limit ?? 200), 1),
						MAX_MESSAGE_LIMIT,
					);
					const startTime = Date.now();

					const deadline = startTime + timeoutMs;
					while (Date.now() < deadline) {
						const messages = await fetchSessionMessages(
							baseUrl,
							authHeaders,
							session_id,
							pollLimitValue,
						);

						const latestMatchingReply = findLatestAssistantReplyByParentId(
							messages,
							targetMessageId,
						);

						if (latestMatchingReply) {
							const sessionStatus = await fetchSessionStatusForSession(
								baseUrl,
								authHeaders,
								session_id,
							);

							let resolvedReply = latestMatchingReply;
							if (sessionStatus?.type === "idle") {
								const refreshedMessages = await fetchSessionMessages(
									baseUrl,
									authHeaders,
									session_id,
									pollLimitValue,
								).catch(() => null as unknown[] | null);

								if (refreshedMessages) {
									const refreshedReply = findLatestAssistantReplyByParentId(
										refreshedMessages,
										targetMessageId,
									);
									if (refreshedReply) {
										resolvedReply = refreshedReply;
									}
								}
							}

							const stillStreaming =
								sessionStatus?.type === "busy" || sessionStatus?.type === "retry";

							const payload = {
								session_id,
								async_request_id,
								target_parent_message_id: targetMessageId,
								reply_message_id: getMessageId(resolvedReply),
								reply: resolvedReply,
								streaming: stillStreaming,
								session_status: sessionStatus,
								wait: {
									timeout_seconds: timeoutMs / 1000,
									elapsed_ms: Date.now() - startTime,
									poll_interval_ms: intervalMs,
								},
								next_action: stillStreaming
									? "Assistant output is still streaming. Call opencode_wait_for_reply again with the same async_request_id for further incremental output."
									: undefined,
							};

							return {
								content: [
									{
										type: "text",
										text: `${stillStreaming ? "🟡 Partial assistant reply (still streaming)" : "✅ Assistant reply received"}\n${JSON.stringify(payload, null, 2)}`,
									},
								],
							};
						}

						const pendingQuestionsInLoop = await fetchPendingQuestionsForSession(
							baseUrl,
							authHeaders,
							session_id,
						);
						if (pendingQuestionsInLoop.length > 0) {
							return {
								content: [
									{
										type: "text",
										text: `⛔ Blocked while waiting for assistant reply\n${JSON.stringify(
											{
												session_id,
												async_request_id,
												target_parent_message_id: targetMessageId,
												blocked_by: "question",
												pending_questions: pendingQuestionsInLoop.map(
													(question) => ({
														request_id: question.id,
														question_count: question.questions.length,
														headers: question.questions.map((q) => q.header),
													}),
												),
												wait: {
													elapsed_ms: Date.now() - startTime,
													poll_interval_ms: intervalMs,
												},
												next_action:
													"Resolve pending question(s) in this session before waiting for this async request reply.",
											},
											null,
											2,
										)}`,
									},
								],
							};
						}

						await sleep(intervalMs);
					}

					return {
						content: [
							{
								type: "text",
								text: `⏱️ Timeout waiting for assistant reply\n${JSON.stringify(
									await (async () => {
										try {
											const latestMessages = await fetchSessionMessages(
												baseUrl,
												authHeaders,
												session_id,
												pollLimitValue,
											).catch(() => [] as unknown[]);

											const assistantMessages = latestMessages.filter(
												(message) => getMessageRole(message) === "assistant",
											);
											const matchingParent = assistantMessages.filter(
												(message) => getMessageParentId(message) === targetMessageId,
											);
											const latestAssistant = assistantMessages.at(-1);
											const latestMatching = matchingParent.at(-1);
											const sessionStatus = await fetchSessionStatusForSession(
												baseUrl,
												authHeaders,
												session_id,
											).catch(() => null as SessionStatusInfo | null);

											const pendingPermissions = await fetchOptionalJson(
												`${baseUrl}/permission`,
												authHeaders,
											).catch(() => null);
											const pendingQuestions = await fetchOptionalJson(
												`${baseUrl}/question`,
												authHeaders,
											).catch(() => null);

											return {
												session_id,
												async_request_id,
												target_parent_message_id: targetMessageId,
												timed_out: true,
												streaming:
													sessionStatus?.type === "busy" || sessionStatus?.type === "retry",
												session_status: sessionStatus,
												latest_partial_reply: latestMatching ?? null,
												wait: {
													timeout_seconds: timeoutMs / 1000,
													poll_interval_ms: intervalMs,
													poll_limit: pollLimitValue,
													elapsed_ms: Date.now() - startTime,
												},
												diagnostics: {
													message_window_count: latestMessages.length,
													assistant_count_in_window: assistantMessages.length,
													matching_parent_count: matchingParent.length,
													latest_assistant: latestAssistant
														? {
															id: getMessageId(latestAssistant),
															parentID: getMessageParentId(latestAssistant),
															part_types: getPartTypes(latestAssistant),
															text_preview: getFirstTextPreview(latestAssistant),
														}
														: null,
													latest_matching_parent: latestMatching
														? {
															id: getMessageId(latestMatching),
															part_types: getPartTypes(latestMatching),
															text_preview: getFirstTextPreview(latestMatching),
														}
														: null,
													pending_permissions_count: Array.isArray(pendingPermissions)
														? pendingPermissions.length
														: null,
													pending_questions_count: Array.isArray(pendingQuestions)
														? pendingQuestions.length
														: null,
												},
												note:
													latestMatching
														? "Timeout reached. Returned the latest partial reply found in the session window."
														: "Request was accepted by prompt_async, but no matching assistant reply appeared before timeout.",
											};
										} catch {
											return {
												session_id,
												async_request_id,
												target_parent_message_id: targetMessageId,
												timed_out: true,
												wait: {
													timeout_seconds: timeoutMs / 1000,
													poll_interval_ms: intervalMs,
													poll_limit: pollLimitValue,
													elapsed_ms: Date.now() - startTime,
												},
												note: "Timeout reached, but diagnostic payload collection failed.",
											};
										}
									})(),
									null,
									2,
								)}`,
							},
						],
					};
				}

				case "opencode_list_questions": {
					const { session_id } = args as { session_id?: string };
					const raw = await fetchOptionalJson(`${baseUrl}/question`, authHeaders);
					const allQuestions = normalizePendingQuestions(raw);
					const questions = session_id
						? allQuestions.filter((item) => item.sessionID === session_id)
						: allQuestions;

					return {
						content: [
							{
								type: "text",
								text: `❓ Pending Questions\n${JSON.stringify(
									{
										count: questions.length,
										session_filter: session_id ?? null,
										items: questions,
									},
									null,
									2,
								)}`,
							},
						],
					};
				}

				case "opencode_answer_question": {
					const { request_id, answers } = args as {
						request_id: string;
						answers: string[][];
					};

					const response = await fetch(
						`${baseUrl}/question/${request_id}/reply`,
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								...authHeaders,
							},
							body: JSON.stringify({ answers }),
						},
					);

					if (!response.ok) {
						const error = await response.text();
						throw new Error(
							`Failed to answer question: ${response.status} - ${error}`,
						);
					}

					return {
						content: [
							{
								type: "text",
								text: `✅ Question answered\nRequest ID: ${request_id}`,
							},
						],
					};
				}

				case "opencode_reject_question": {
					const { request_id } = args as {
						request_id: string;
					};

					const response = await fetch(
						`${baseUrl}/question/${request_id}/reject`,
						{
							method: "POST",
							headers: authHeaders,
						},
					);

					if (!response.ok) {
						const error = await response.text();
						throw new Error(
							`Failed to reject question: ${response.status} - ${error}`,
						);
					}

					return {
						content: [
							{
								type: "text",
								text: `✅ Question rejected\nRequest ID: ${request_id}`,
							},
						],
					};
				}

			case "opencode_create_session": {
				const { title, directory } = args as {
					title?: string;
					directory?: string;
				};

				const queryParams = new URLSearchParams();
				if (directory) queryParams.append("directory", directory);

				const body = title ? JSON.stringify({ title }) : undefined;
				const headers = body
					? { "Content-Type": "application/json", ...authHeaders }
					: authHeaders;

				const response = await fetch(`${baseUrl}/session?${queryParams}`, {
					method: "POST",
					headers,
					body,
				});

				if (!response.ok) {
					const error = await response.text();
					throw new Error(
						`Failed to create session: ${response.status} - ${error}`,
					);
				}

				const data = (await response.json()) as { id: string; title?: string };
				return {
					content: [
						{
							type: "text",
							text: `✅ Session created successfully!\nSession ID: ${data.id}\nTitle: ${data.title || "Untitled"}`,
						},
					],
				};
			}

			case "opencode_list_sessions": {
				const { directory, limit, include_subagents } = args as {
					directory?: string;
					limit?: number;
					include_subagents?: boolean;
				};

				const queryParams = new URLSearchParams();
				if (directory) queryParams.append("directory", directory);
				// Request more sessions if we need to filter subagents
				if (limit) queryParams.append("limit", (limit * 2).toString());

				const response = await fetch(`${baseUrl}/session?${queryParams}`, {
					headers: authHeaders,
				});

				if (!response.ok) {
					throw new Error(`Failed to list sessions: ${response.status}`);
				}

				let sessions = (await response.json()) as Array<{
					id: string;
					title?: string;
					time?: { created: number };
				}>;

				// Filter out subagent sessions by default
				const showSubagents = include_subagents ?? false;
				if (!showSubagents) {
					sessions = sessions.filter(
						(s) => !s.title?.toLowerCase().includes("subagent"),
					);
				}

				// Apply limit after filtering
				if (limit && sessions.length > limit) {
					sessions = sessions.slice(0, limit);
				}

				if (sessions.length === 0) {
					return {
						content: [{ type: "text", text: "No sessions found" }],
					};
				}

				const sessionList = sessions
					.map(
						(s, i) =>
							`${i + 1}. ${s.title || "Untitled"}\n   ID: ${s.id}\n   Created: ${s.time?.created ? new Date(s.time.created).toLocaleString() : "unknown"}`,
					)
					.join("\n\n");

				const filterInfo = showSubagents
					? "(including subagents)"
					: "(main sessions only)";
				return {
					content: [
						{
							type: "text",
							text: `📋 Session List ${filterInfo} (${sessions.length}):\n\n${sessionList}`,
						},
					],
				};
			}

			case "opencode_get_session": {
				const { session_id } = args as { session_id: string };

				const response = await fetch(`${baseUrl}/session/${session_id}`, {
					headers: authHeaders,
				});

				if (!response.ok) {
					throw new Error(`Failed to get session: ${response.status}`);
				}

				const data = await response.json();
				return {
					content: [
						{
							type: "text",
							text: `📄 Session Details:\n${JSON.stringify(data, null, 2)}`,
						},
					],
				};
			}

			case "opencode_get_messages": {
				const { session_id, limit, cursor, max_output_tokens, fields } = args as {
					session_id: string;
					limit?: number;
					cursor?: string;
					max_output_tokens?: number;
					fields?: string[];
				};

				const pageSize = Math.min(
					Math.max(Math.floor(limit ?? DEFAULT_MESSAGE_LIMIT), 1),
					MAX_MESSAGE_LIMIT,
				);
				const cursorData = decodeCursor(cursor);
				const requestedFields = parseRequestedFields(fields);
				const maxOutputTokens = Math.min(
					Math.max(
						Math.floor(max_output_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS),
						1,
					),
					MAX_OUTPUT_TOKENS,
				);

				const fetchLimit = cursorData.offset + pageSize + 1;
				const messages = await fetchSessionMessages(
					baseUrl,
					authHeaders,
					session_id,
					fetchLimit,
				);

				const rawPage = messages.slice(
					cursorData.offset,
					cursorData.offset + pageSize,
				);
				const hasMoreFromSource =
					messages.length > cursorData.offset + rawPage.length;

				const missingFields = new Set<string>();
				const projectedPage = rawPage.map((message) => {
					const { projected, missingFields: dropped } = projectMessage(
						message,
						requestedFields,
					);
					for (const field of dropped) {
						missingFields.add(field);
					}
					return projected;
				});

				const responseItems: unknown[] = [];
				let truncatedByBudget = false;
				for (const item of projectedPage) {
					const candidate = [...responseItems, item];
					const estimatedTokens = estimateTokensFromString(
						JSON.stringify(candidate),
					);

					if (estimatedTokens <= maxOutputTokens || responseItems.length === 0) {
						responseItems.push(item);
						continue;
					}

					truncatedByBudget = true;
					break;
				}

				const nextOffset = cursorData.offset + responseItems.length;
				const hasMore =
					nextOffset < cursorData.offset + projectedPage.length || hasMoreFromSource;
				const payload = {
					session_id,
					items: responseItems,
					page: {
						limit: pageSize,
						cursor: cursor ?? null,
						next_cursor: hasMore ? encodeCursor({ offset: nextOffset }) : null,
						has_more: hasMore,
						offset: cursorData.offset,
						returned: responseItems.length,
					},
					budget: {
						max_output_tokens: maxOutputTokens,
						estimated_output_tokens: estimateTokensFromString(
							JSON.stringify(responseItems),
						),
						truncated: truncatedByBudget,
						finish_reason: truncatedByBudget ? "length" : "stop",
					},
					projection: {
						requested_fields: requestedFields,
						missing_fields: [...missingFields],
					},
				};

				while (
					estimateTokensFromObject(payload) > maxOutputTokens &&
					payload.items.length > 0
				) {
					payload.items.pop();
					payload.page.returned = payload.items.length;
					payload.page.next_cursor = encodeCursor({
						offset: cursorData.offset + payload.items.length,
					});
					payload.page.has_more = true;
					payload.budget.truncated = true;
					payload.budget.finish_reason = "length";
					payload.budget.estimated_output_tokens = estimateTokensFromObject(
						payload.items,
					);
				}

				if (estimateTokensFromObject(payload) > maxOutputTokens) {
					payload.items = [];
					payload.page.returned = 0;
					payload.page.has_more = true;
					payload.page.next_cursor = encodeCursor({ offset: cursorData.offset });
					payload.budget.truncated = true;
					payload.budget.finish_reason = "length";
					payload.budget.estimated_output_tokens = estimateTokensFromObject(
						payload.items,
					);
					Object.assign(payload, {
						notice:
							"Payload still exceeds token budget with current field projection. Reduce fields or increase max_output_tokens.",
					});
				}

				return {
					content: [
						{
							type: "text",
							text: `💬 Message Page:\n${JSON.stringify(payload, null, 2)}`,
						},
					],
				};
			}

			case "opencode_check_health": {
				const response = await fetch(`${baseUrl}/global/health`, {
					headers: authHeaders,
				});

				if (!response.ok) {
					throw new Error(`Health check failed: ${response.status}`);
				}

				const data = (await response.json()) as {
					healthy: boolean;
					version: string;
				};
				return {
					content: [
						{
							type: "text",
							text: `✅ OpenCode server is running normally\nVersion: ${data.version}\nHealthy: ${data.healthy ? "Yes" : "No"}\nAddress: ${baseUrl}`,
						},
					],
				};
			}

			default:
				throw new Error(`Unknown tool: ${name}`);
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return {
			content: [{ type: "text", text: `❌ Error: ${errorMessage}` }],
			isError: true,
		};
	}
});

// Select launch mode
const mode = process.argv[2] || "stdio";

if (mode === "stdio") {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("OpenCode MCP Server v0.1.0 running on stdio");
	console.error(`Default endpoint: ${DEFAULT_CONFIG.url}`);
} else if (mode === "sse") {
	const app = express();
	app.use(cors());
	app.use(express.json());

	let transport: SSEServerTransport | null = null;

	app.get("/sse", async (req, res) => {
		transport = new SSEServerTransport("/messages", res);
		await server.connect(transport);
		console.log("Client connected via SSE");
	});

	app.post("/messages", async (req, res) => {
		if (transport) {
			await transport.handlePostMessage(req, res);
		} else {
			res.status(400).json({ error: "No active SSE connection" });
		}
	});

	app.get("/health", (req, res) => {
		res.json({
			status: "ok",
			version: "0.1.0",
			defaultEndpoint: DEFAULT_CONFIG.url,
			authType: DEFAULT_CONFIG.authType,
		});
	});

	app.listen(PORT, () => {
		console.log(
			`OpenCode MCP Server v0.1.0 running on http://localhost:${PORT}`,
		);
		console.log(`Default OpenCode endpoint: ${DEFAULT_CONFIG.url}`);
		console.log(`Default auth type: ${DEFAULT_CONFIG.authType}`);
		console.log("");
		console.log("Available tools:");
		console.log(
			"  - opencode_chat: Send programming tasks (auto-creates session)",
		);
		console.log("  - opencode_chat_async: Send tasks asynchronously");
		console.log("  - opencode_wait_for_reply: Wait for assistant output");
		console.log("  - opencode_list_questions: List pending questions");
		console.log("  - opencode_answer_question: Answer pending question");
		console.log("  - opencode_reject_question: Reject pending question");
		console.log("  - opencode_create_session: Create session");
		console.log("  - opencode_list_sessions: List sessions");
		console.log("  - opencode_get_session: Get session details");
		console.log("  - opencode_get_messages: Get session messages");
		console.log("  - opencode_check_health: Health check");
	});
} else {
	console.error("Usage: node index.js [stdio|sse]");
	process.exit(1);
}
