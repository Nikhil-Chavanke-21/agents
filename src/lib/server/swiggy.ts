import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import crypto from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';

const MCP_SERVER_URL = 'https://mcp.swiggy.com/im';
const AUTH_COOKIE = 'swiggy_auth';
const OAUTH_STATE_COOKIE = 'swiggy_oauth_state';

type Auth = {
	accessToken: string;
	refreshToken?: string;
	clientId: string;
	selectedAddressId?: string;
};

type OAuthState = {
	codeVerifier: string;
	clientId: string;
};

function readJsonCookie<T>(cookies: Cookies, name: string): T | null {
	const v = cookies.get(name);
	if (!v) return null;
	try {
		return JSON.parse(Buffer.from(v, 'base64url').toString('utf-8')) as T;
	} catch {
		return null;
	}
}

function writeJsonCookie(cookies: Cookies, name: string, value: unknown, maxAge: number) {
	const encoded = Buffer.from(JSON.stringify(value)).toString('base64url');
	cookies.set(name, encoded, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge
	});
}

function readAuth(cookies: Cookies): Auth | null {
	return readJsonCookie<Auth>(cookies, AUTH_COOKIE);
}

function writeAuth(cookies: Cookies, auth: Auth) {
	writeJsonCookie(cookies, AUTH_COOKIE, auth, 60 * 60 * 24 * 30);
}

function clearAuthCookie(cookies: Cookies) {
	cookies.delete(AUTH_COOKIE, { path: '/' });
}

function readOAuthState(cookies: Cookies): OAuthState | null {
	return readJsonCookie<OAuthState>(cookies, OAUTH_STATE_COOKIE);
}

function writeOAuthState(cookies: Cookies, state: OAuthState) {
	writeJsonCookie(cookies, OAUTH_STATE_COOKIE, state, 60 * 10);
}

function clearOAuthState(cookies: Cookies) {
	cookies.delete(OAUTH_STATE_COOKIE, { path: '/' });
}

function getBaseUrl() {
	return process.env.PUBLIC_BASE_URL || 'http://localhost:5173';
}

function getRedirectUri() {
	return `${getBaseUrl()}/api/swiggy/callback`;
}

let authMeta: Record<string, string> | null = null;
let toolsCache: Array<{ name: string; description?: string; inputSchema?: unknown }> = [];

export function isConnected(cookies: Cookies): boolean {
	return !!readAuth(cookies);
}

export function getSelectedAddressId(cookies: Cookies) {
	return readAuth(cookies)?.selectedAddressId ?? null;
}

export function setSelectedAddressId(cookies: Cookies, id: string) {
	const auth = readAuth(cookies);
	if (!auth) return;
	writeAuth(cookies, { ...auth, selectedAddressId: id });
}

export function getCachedTools() {
	return toolsCache;
}

async function discoverOAuth(): Promise<Record<string, string>> {
	if (authMeta) return authMeta;
	const origin = new URL(MCP_SERVER_URL).origin;
	const res = await fetch(`${origin}/.well-known/oauth-authorization-server`);
	if (!res.ok) throw new Error(`OAuth discovery failed: ${res.status}`);
	authMeta = (await res.json()) as Record<string, string>;
	return authMeta;
}

async function registerClient(meta: Record<string, string>): Promise<string> {
	if (!meta.registration_endpoint) throw new Error('No dynamic registration endpoint');
	const res = await fetch(meta.registration_endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			client_name: 'Agent App',
			redirect_uris: [getRedirectUri()],
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			token_endpoint_auth_method: 'none'
		})
	});
	if (!res.ok) throw new Error(`Client registration failed: ${res.status} ${await res.text()}`);
	const data = (await res.json()) as { client_id: string };
	return data.client_id;
}

export async function getAuthorizationUrl(cookies: Cookies): Promise<string> {
	const meta = await discoverOAuth();
	const existing = readAuth(cookies)?.clientId ?? readOAuthState(cookies)?.clientId;
	const clientId = existing ?? (await registerClient(meta));

	const codeVerifier = crypto.randomBytes(32).toString('base64url');
	const challenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

	writeOAuthState(cookies, { codeVerifier, clientId });

	const params = new URLSearchParams({
		response_type: 'code',
		client_id: clientId,
		redirect_uri: getRedirectUri(),
		code_challenge: challenge,
		code_challenge_method: 'S256',
		state: crypto.randomBytes(16).toString('hex')
	});

	return `${meta.authorization_endpoint}?${params}`;
}

export async function exchangeCode(cookies: Cookies, code: string): Promise<void> {
	const meta = await discoverOAuth();
	const state = readOAuthState(cookies);
	if (!state) throw new Error('Missing OAuth state — restart login');

	const res = await fetch(meta.token_endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: getRedirectUri(),
			client_id: state.clientId,
			code_verifier: state.codeVerifier
		})
	});
	if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);

	const data = (await res.json()) as { access_token: string; refresh_token?: string };
	const existingAddressId = readAuth(cookies)?.selectedAddressId;
	writeAuth(cookies, {
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		clientId: state.clientId,
		selectedAddressId: existingAddressId
	});
	clearOAuthState(cookies);
}

async function refreshAccessToken(cookies: Cookies, auth: Auth): Promise<Auth | null> {
	if (!auth.refreshToken) return null;
	try {
		const meta = await discoverOAuth();
		const res = await fetch(meta.token_endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: auth.refreshToken,
				client_id: auth.clientId
			})
		});
		if (!res.ok) {
			console.error(`[Swiggy] Token refresh failed: ${res.status}`);
			return null;
		}
		const data = (await res.json()) as { access_token: string; refresh_token?: string };
		const next: Auth = {
			...auth,
			accessToken: data.access_token,
			refreshToken: data.refresh_token ?? auth.refreshToken
		};
		writeAuth(cookies, next);
		console.log('[Swiggy] Token refreshed successfully');
		return next;
	} catch (err) {
		console.error('[Swiggy] Token refresh error:', err);
		return null;
	}
}

async function createClient(accessToken: string): Promise<Client> {
	const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL), {
		requestInit: { headers: { Authorization: `Bearer ${accessToken}` } }
	});
	const client = new Client({ name: 'agent-app', version: '1.0.0' });
	await client.connect(transport);
	const { tools } = await client.listTools();
	toolsCache = tools;
	return client;
}

export async function callTool(
	cookies: Cookies,
	name: string,
	args: Record<string, unknown> = {}
): Promise<unknown> {
	const auth = readAuth(cookies);
	if (!auth) throw new Error('Not authenticated with Swiggy');

	const attempt = async (token: string) => {
		const client = await createClient(token);
		console.log(`[Swiggy MCP] Calling ${name}(${JSON.stringify(args)})`);
		const result = await client.callTool({ name, arguments: args });
		const textBlock = (result.content as Array<{ type: string; text?: string }>)?.find(
			(c) => c.type === 'text'
		);
		if (!textBlock?.text) return result.content;
		try {
			return JSON.parse(textBlock.text);
		} catch {
			return textBlock.text;
		}
	};

	try {
		return await attempt(auth.accessToken);
	} catch (err: unknown) {
		const isExpired =
			err instanceof Error && 'code' in err && (err as { code: number }).code === 401;
		if (!isExpired) throw err;
		console.log('[Swiggy] Token expired, attempting refresh...');
		const refreshed = await refreshAccessToken(cookies, auth);
		if (!refreshed) {
			clearAuthCookie(cookies);
			throw new Error('Swiggy session expired — please reconnect');
		}
		return await attempt(refreshed.accessToken);
	}
}

export async function listTools(cookies: Cookies) {
	const auth = readAuth(cookies);
	if (!auth) throw new Error('Not authenticated with Swiggy');
	const client = await createClient(auth.accessToken);
	const { tools } = await client.listTools();
	toolsCache = tools;
	return tools;
}
