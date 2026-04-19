import { json } from '@sveltejs/kit';
import { getSystemPrompt, setSystemPrompt } from '$lib/server/chat';

export async function GET() {
	return json({ prompt: getSystemPrompt() });
}

export async function PUT({ request }) {
	const { prompt } = await request.json();
	if (typeof prompt !== 'string') {
		return json({ error: 'prompt must be a string' }, { status: 400 });
	}
	setSystemPrompt(prompt);
	return json({ ok: true });
}
