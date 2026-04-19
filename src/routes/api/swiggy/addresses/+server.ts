import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	callTool,
	isConnected,
	getSelectedAddressId,
	setSelectedAddressId
} from '$lib/server/swiggy';

export const GET: RequestHandler = async ({ cookies }) => {
	if (!isConnected(cookies)) return json({ error: 'Not connected' }, { status: 401 });

	try {
		const result = (await callTool(cookies, 'get_addresses')) as Record<string, unknown>;
		const data = result?.data as Record<string, unknown> | undefined;
		return json({ addresses: data?.addresses, selected: getSelectedAddressId(cookies) });
	} catch (err) {
		console.error('[Swiggy] get_addresses error:', err);
		return json({ error: String(err) }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	if (!isConnected(cookies)) return json({ error: 'Not connected' }, { status: 401 });

	const { addressId } = await request.json();
	if (!addressId) return json({ error: 'addressId required' }, { status: 400 });

	setSelectedAddressId(cookies, addressId);
	return json({ selected: addressId });
};
