import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MCP_SERVER_URL = 'https://mcp.swiggy.com/im';
const AUTH_CACHE_PATH = path.resolve('.swiggy-auth.json');

type AuthCache = {
	accessToken: string;
	refreshToken?: string;
	clientId: string;
	selectedAddressId?: string;
};

function loadAuthCache() {
	try {
		const raw = fs.readFileSync(AUTH_CACHE_PATH, 'utf-8');
		const data = JSON.parse(raw) as AuthCache;
		if (data.accessToken) {
			accessToken = data.accessToken;
			refreshToken = data.refreshToken ?? null;
			clientId = data.clientId ?? null;
			selectedAddressId = data.selectedAddressId ?? null;
			console.log('[Swiggy] Restored auth from cache');
		}
	} catch {
		// no cache or invalid — fresh start
	}
}

function saveAuthCache() {
	const data: AuthCache = {
		accessToken: accessToken!,
		refreshToken: refreshToken ?? undefined,
		clientId: clientId!,
		selectedAddressId: selectedAddressId ?? undefined
	};
	fs.writeFileSync(AUTH_CACHE_PATH, JSON.stringify(data, null, '\t'), 'utf-8');
	console.log('[Swiggy] Auth cached to disk');
}

function getBaseUrl() {
	return process.env.PUBLIC_BASE_URL || 'http://localhost:5173';
}

function getRedirectUri() {
	return `${getBaseUrl()}/api/swiggy/callback`;
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let codeVerifier: string | null = null;
let clientId: string | null = null;
let authMeta: Record<string, string> | null = null;
let mcpClient: Client | null = null;
let toolsCache: Array<{ name: string; description?: string; inputSchema?: unknown }> = [];
let selectedAddressId: string | null = null;

loadAuthCache();

export function isConnected(): boolean {
	return !!accessToken;
}

export function getSelectedAddressId() {
	return selectedAddressId;
}

export function setSelectedAddressId(id: string) {
	selectedAddressId = id;
	if (accessToken) saveAuthCache();
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

async function ensureClientId(meta: Record<string, string>): Promise<string> {
	if (clientId) return clientId;
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
	clientId = data.client_id;
	return clientId;
}

export async function getAuthorizationUrl(): Promise<string> {
	const meta = await discoverOAuth();
	const id = await ensureClientId(meta);

	codeVerifier = crypto.randomBytes(32).toString('base64url');
	const challenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

	const params = new URLSearchParams({
		response_type: 'code',
		client_id: id,
		redirect_uri: getRedirectUri(),
		code_challenge: challenge,
		code_challenge_method: 'S256',
		state: crypto.randomBytes(16).toString('hex')
	});

	return `${meta.authorization_endpoint}?${params}`;
}

export async function exchangeCode(code: string): Promise<void> {
	const meta = await discoverOAuth();

	const res = await fetch(meta.token_endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: getRedirectUri(),
			client_id: clientId!,
			code_verifier: codeVerifier!
		})
	});
	if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);

	const data = (await res.json()) as { access_token: string; refresh_token?: string };
	accessToken = data.access_token;
	refreshToken = data.refresh_token ?? null;
	mcpClient = null;
	saveAuthCache();
}

function clearAuth() {
	accessToken = null;
	refreshToken = null;
	mcpClient = null;
	try {
		fs.unlinkSync(AUTH_CACHE_PATH);
	} catch { /* ignore */ }
	console.log('[Swiggy] Auth cleared — re-login required');
}

async function refreshAccessToken(): Promise<boolean> {
	if (!refreshToken || !clientId) return false;

	try {
		const meta = await discoverOAuth();
		const res = await fetch(meta.token_endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: refreshToken,
				client_id: clientId
			})
		});

		if (!res.ok) {
			console.error(`[Swiggy] Token refresh failed: ${res.status}`);
			return false;
		}

		const data = (await res.json()) as { access_token: string; refresh_token?: string };
		accessToken = data.access_token;
		refreshToken = data.refresh_token ?? refreshToken;
		mcpClient = null;
		saveAuthCache();
		console.log('[Swiggy] Token refreshed successfully');
		return true;
	} catch (err) {
		console.error('[Swiggy] Token refresh error:', err);
		return false;
	}
}

async function getClient(): Promise<Client> {
	if (mcpClient) return mcpClient;
	if (!accessToken) throw new Error('Not authenticated with Swiggy');

	const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL), {
		requestInit: {
			headers: { Authorization: `Bearer ${accessToken}` }
		}
	});

	const client = new Client({ name: 'agent-app', version: '1.0.0' });
	await client.connect(transport);
	mcpClient = client;

	const { tools } = await client.listTools();
	toolsCache = tools;
	console.log(
		'[Swiggy MCP] Connected. Tools:',
		tools.map((t) => t.name)
	);

	return client;
}

export async function callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
	const attempt = async () => {
		const client = await getClient();
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
		return await attempt();
	} catch (err: unknown) {
		const isExpired = err instanceof Error && 'code' in err && (err as { code: number }).code === 401;
		if (!isExpired) throw err;

		console.log('[Swiggy] Token expired, attempting refresh...');
		const refreshed = await refreshAccessToken();
		if (!refreshed) {
			clearAuth();
			throw new Error('Swiggy session expired — please reconnect');
		}
		return await attempt();
	}
}

export async function listTools() {
	const client = await getClient();
	const { tools } = await client.listTools();
	toolsCache = tools;
	return tools;
}
