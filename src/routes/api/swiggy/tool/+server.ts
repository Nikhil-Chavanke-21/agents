import { json } from '@sveltejs/kit';
import { callTool, isConnected } from '$lib/server/swiggy';

export async function POST({ request }) {
	if (!isConnected()) return json({ error: 'Not connected' }, { status: 401 });

	const { name, args = {} } = await request.json();
	if (!name || typeof name !== 'string') {
		return json({ error: 'tool name required' }, { status: 400 });
	}

	try {
		const result = await callTool(name, args);
		return json({ ok: true, result });
	} catch (err) {
		return json({ ok: false, error: String(err) }, { status: 500 });
	}
}
