import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { callTool, isConnected } from '$lib/server/swiggy';

export const POST: RequestHandler = async ({ request, cookies }) => {
	if (!isConnected(cookies)) return json({ error: 'Not connected' }, { status: 401 });

	const { name, args = {} } = await request.json();
	if (!name || typeof name !== 'string') {
		return json({ error: 'tool name required' }, { status: 400 });
	}

	try {
		const result = await callTool(cookies, name, args);
		return json({ ok: true, result });
	} catch (err) {
		return json({ ok: false, error: String(err) }, { status: 500 });
	}
};
