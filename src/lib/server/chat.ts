import OpenAI from 'openai';
import { env } from '$env/dynamic/private';
import fs from 'node:fs';
import path from 'node:path';
import type { Cookies } from '@sveltejs/kit';
import { callTool, getCachedTools, getSelectedAddressId, isConnected, listTools } from './swiggy';
import { SPLITWISE_TOOL, createExpense } from './splitwise';

const PROMPT_PATH = path.resolve('.system-prompt.txt');

function loadPrompt(): string {
	try {
		return fs.readFileSync(PROMPT_PATH, 'utf-8');
	} catch {
		return '';
	}
}

let systemPrompt = loadPrompt();
let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

export function getSystemPrompt() {
	return systemPrompt;
}

export function setSystemPrompt(prompt: string) {
	systemPrompt = prompt;
	fs.writeFileSync(PROMPT_PATH, prompt, 'utf-8');
}

export function resetConversation() {
	messages = [];
}

function buildTools(): OpenAI.Chat.ChatCompletionTool[] {
	const swiggyTools = getCachedTools().map((tool) => ({
		type: 'function' as const,
		function: {
			name: tool.name,
			description: tool.description || '',
			parameters: (tool.inputSchema as Record<string, unknown>) || {
				type: 'object',
				properties: {}
			}
		}
	}));
	return [...swiggyTools, SPLITWISE_TOOL];
}

function buildSystemContent(cookies: Cookies): string {
	let sys = systemPrompt;
	const addressId = getSelectedAddressId(cookies);
	if (addressId) {
		sys += `\n\nThe user's delivery address ID is: ${addressId}. Use this for any tool call requiring addressId or selectedAddressId.`;
	}
	sys += `\n\nIMPORTANT: The update_cart tool REPLACES the entire cart — it does not append. When the user asks to add items, you MUST first call get_cart to retrieve the current items, then call update_cart with ALL items (existing + new) to avoid losing anything. Similarly, when removing items, get the cart first, remove the requested item from the list, and call update_cart with the remaining items.`;
	return sys;
}

export type ChatEvent =
	| { type: 'tool_call'; name: string; args: Record<string, unknown> }
	| { type: 'tool_result'; name: string; result: string; ok: boolean }
	| { type: 'reply'; text: string }
	| { type: 'error'; message: string }
	| { type: 'done'; toolsUsed: boolean };

function sanitizeMessages() {
	while (messages.length > 0) {
		const last = messages[messages.length - 1];
		if (last.role === 'assistant' && 'tool_calls' in last && last.tool_calls?.length) {
			const needed = new Set(
				last.tool_calls
					.filter((tc): tc is typeof tc & { id: string } => 'id' in tc)
					.map((tc) => tc.id)
			);
			const found = new Set(
				messages
					.filter(
						(m): m is typeof m & { tool_call_id: string } =>
							m.role === 'tool' && 'tool_call_id' in m
					)
					.map((m) => m.tool_call_id)
			);
			const allAnswered = [...needed].every((id) => found.has(id));
			if (!allAnswered) {
				messages.pop();
				continue;
			}
		}
		if (last.role === 'tool') {
			const toolCallId =
				'tool_call_id' in last ? (last as { tool_call_id: string }).tool_call_id : null;
			const hasParent = messages.some(
				(m) =>
					m.role === 'assistant' &&
					'tool_calls' in m &&
					Array.isArray(m.tool_calls) &&
					m.tool_calls.some((tc: { id?: string }) => tc.id === toolCallId)
			);
			if (!hasParent) {
				messages.pop();
				continue;
			}
		}
		break;
	}
}

const SEARCH_ITEM_LIMIT = 6;

function postProcessToolResult(toolName: string, result: any): unknown {
	if (!result || typeof result !== 'object') return result;

	result.message = '';

	if (toolName === 'search_products') {
		result.data.products = result.data.products.slice(0, SEARCH_ITEM_LIMIT);
	}

	return result;
}

export type Bot = 'dj' | 'cart' | 'chat';

const MAX_ITERATIONS = 15;

export async function chat(
	userMessage: string,
	emit: (event: ChatEvent) => void,
	cookies: Cookies,
	bot: Bot = 'chat'
): Promise<void> {
	const apiKey = env.OPENAI_API_KEY;
	if (!apiKey) {
		emit({ type: 'error', message: 'OPENAI_API_KEY not set. Add it to your .env file.' });
		emit({ type: 'done', toolsUsed: false });
		return;
	}

	const openai = new OpenAI({ apiKey });
	sanitizeMessages();
	messages.push({ role: 'user', content: userMessage });

	const useTools = bot === 'cart' && isConnected(cookies);
	if (useTools && getCachedTools().length === 0) {
		try {
			await listTools(cookies);
		} catch (err) {
			console.error('[Chat] listTools failed:', err);
		}
	}
	const tools = useTools ? buildTools() : [];
	console.log(`[Chat] bot=${bot} useTools=${useTools} for: "${userMessage}"`);
	let toolsUsed = false;

	function msgSize(m: OpenAI.Chat.ChatCompletionMessageParam): number {
		if (typeof m.content === 'string') return m.content.length;
		if (Array.isArray(m.content)) return JSON.stringify(m.content).length;
		return 0;
	}

	for (let i = 0; i < MAX_ITERATIONS; i++) {
		const payload = [{ role: 'system' as const, content: buildSystemContent(cookies) }, ...messages];
		const sizes = payload.map((m) => `${m.role}:${msgSize(m)}`);
		const totalChars = payload.reduce((s, m) => s + msgSize(m), 0);
		console.log(
			`[Chat] Iter ${i} | msgs=${payload.length} | totalChars=${totalChars} | sizes=[${sizes.join(', ')}]`
		);

		const t0 = Date.now();
		const completion = await openai.chat.completions.create({
			model: 'gpt-5-mini',
			messages: payload,
			...(tools.length ? { tools } : {})
		});
		const elapsed = Date.now() - t0;

		const msg = completion.choices[0].message;
		const replySize = (msg.content ?? '').length;
		console.log(
			`[Chat] Iter ${i} completed in ${elapsed}ms | assistant reply: ${replySize} chars | tool_calls: ${msg.tool_calls?.length ?? 0}`
		);
		messages.push(msg);

		if (msg.tool_calls?.length) {
			toolsUsed = true;
			for (const tc of msg.tool_calls) {
				if (tc.type !== 'function') continue;

				let args: Record<string, unknown> = {};
				try {
					args = JSON.parse(tc.function.arguments);
				} catch {
					/* empty args */
				}

				emit({ type: 'tool_call', name: tc.function.name, args });
				console.log(`[Chat] Tool: ${tc.function.name}(${JSON.stringify(args).slice(0, 300)})`);

				const toolT0 = Date.now();
				let result: unknown;
				let ok = true;
				try {
					if (tc.function.name === 'splitwise_create_expense') {
						result = await createExpense(args as Parameters<typeof createExpense>[0]);
					} else {
						result = await callTool(cookies, tc.function.name, args);
					}
				} catch (err) {
					result = { error: String(err) };
					ok = false;
				}
				const toolElapsed = Date.now() - toolT0;

				result = postProcessToolResult(tc.function.name, result);
				const resultStr = JSON.stringify(result);
				console.log(
					`[Chat] Tool ${tc.function.name} took ${toolElapsed}ms | result: ${resultStr.length} chars`
				);
				emit({
					type: 'tool_result',
					name: tc.function.name,
					result: resultStr.length > 300 ? resultStr.slice(0, 300) + '…' : resultStr,
					ok
				});

				messages.push({
					role: 'tool',
					tool_call_id: tc.id,
					content: resultStr
				});
			}
			continue;
		}

		const reply = msg.content || '(no response)';
		console.log(`[Chat] Reply:`, reply.slice(0, 200));
		emit({ type: 'reply', text: reply });
		emit({ type: 'done', toolsUsed });
		return;
	}

	emit({ type: 'reply', text: 'Reached max tool-calling iterations.' });
	emit({ type: 'done', toolsUsed });
}
