import { json } from '@sveltejs/kit';
import {
	callTool,
	isConnected,
	getSelectedAddressId,
	setSelectedAddressId
} from '$lib/server/swiggy';

export async function GET() {
	if (!isConnected()) return json({ error: 'Not connected' }, { status: 401 });

	try {
		const result = await callTool('get_addresses') as Record<string, unknown>;
		const data = result?.data as Record<string, unknown> | undefined;
		return json({ addresses: data?.addresses, selected: getSelectedAddressId() });
	} catch (err) {
		console.error('[Swiggy] get_addresses error:', err);
		return json({ error: String(err) }, { status: 500 });
	}
}

export async function POST({ request }) {
	if (!isConnected()) return json({ error: 'Not connected' }, { status: 401 });

	const { addressId } = await request.json();
	if (!addressId) return json({ error: 'addressId required' }, { status: 400 });

	setSelectedAddressId(addressId);
	return json({ selected: addressId });
}
