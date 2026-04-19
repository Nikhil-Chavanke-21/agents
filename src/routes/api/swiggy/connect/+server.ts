import { json } from '@sveltejs/kit';
import { isConnected, getAuthorizationUrl } from '$lib/server/swiggy';

export async function GET() {
	if (isConnected()) {
		return json({ connected: true });
	}
	try {
		const authUrl = await getAuthorizationUrl();
		return json({ connected: false, authUrl });
	} catch (err) {
		return json({ connected: false, error: String(err) }, { status: 500 });
	}
}
