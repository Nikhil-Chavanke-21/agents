import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeCode } from '$lib/server/swiggy';

export const GET: RequestHandler = async ({ url }) => {
	const code = url.searchParams.get('code');
	if (!code) {
		return new Response('Missing authorization code', { status: 400 });
	}

	try {
		await exchangeCode(code);
	} catch (err) {
		return new Response(`OAuth failed: ${err}`, { status: 500 });
	}

	redirect(302, '/');
};
