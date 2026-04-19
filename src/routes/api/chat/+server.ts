import type { RequestHandler } from './$types';
import { chat, resetConversation, type ChatEvent, type Bot } from '$lib/server/chat';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json();

	if (body.reset) {
		resetConversation();
		const line = JSON.stringify({ type: 'done', toolsUsed: false } satisfies ChatEvent) + '\n';
		return new Response(line, {
			headers: { 'Content-Type': 'application/x-ndjson' }
		});
	}

	const {
		message,
		bot = 'chat',
		systemPrompt = ''
	} = body as { message?: string; bot?: Bot; systemPrompt?: string };
	if (!message || typeof message !== 'string') {
		const line = JSON.stringify({ type: 'error', message: 'message is required' } satisfies ChatEvent) + '\n';
		return new Response(line, {
			status: 400,
			headers: { 'Content-Type': 'application/x-ndjson' }
		});
	}

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			const emit = (event: ChatEvent) => {
				controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
			};

			try {
				await chat(message, emit, cookies, bot, systemPrompt);
			} catch (err) {
				emit({ type: 'error', message: String(err) });
				emit({ type: 'done', toolsUsed: false });
			}

			controller.close();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson',
			'Cache-Control': 'no-cache',
			'X-Accel-Buffering': 'no'
		}
	});
};
