import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isConnected, getAuthorizationUrl } from '$lib/server/swiggy';

export const GET: RequestHandler = async ({ cookies }) => {
	if (isConnected(cookies)) {
		return json({ connected: true });
	}
	try {
		const authUrl = await getAuthorizationUrl(cookies);
		return json({ connected: false, authUrl });
	} catch (err) {
		return json({ connected: false, error: String(err) }, { status: 500 });
	}
};
