import { player } from './player.svelte';
import { cart } from './cart.svelte';

export type Bot = 'dj' | 'cart' | 'chat';

export type Message =
	| { role: 'user' | 'voice' | 'agent'; text: string; bot?: Bot }
	| { role: 'tool_call'; name: string };

let messages = $state<Message[]>([]);
let thinking = $state(false);
let activeBot = $state<Bot>('chat');

const BOT_VOICES: Record<Bot, { name: string; pitch: number; rate: number }> = {
	// dj: { name: 'Google US English', pitch: 0.9, rate: 1.0 },
	dj: { name: 'Google 日本語', pitch: 1.1, rate: 1.05 },
	cart: { name: 'Google US English Male', pitch: 1.0, rate: 0.95 },
	chat: { name: 'Google US English', pitch: 0.9, rate: 1.0 }
};

function speak(text: string, bot?: Bot) {
	if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

	speechSynthesis.cancel();

	// Defer to avoid Chrome dropping utterances after cancel() or inside recognition callbacks
	setTimeout(() => {
		const config = BOT_VOICES[bot ?? activeBot];
		const utterance = new SpeechSynthesisUtterance(text);
		utterance.rate = config.rate;
		utterance.pitch = config.pitch;

		const voices = speechSynthesis.getVoices();
		const voice = voices.find((v) => v.name === config.name);
		if (voice) utterance.voice = voice;

		speechSynthesis.speak(utterance);
	}, 50);
}

function addMsg(msg: Message) {
	messages = [...messages, msg];
	if (msg.role === 'agent' && 'text' in msg) speak(msg.text, msg.bot);
}

let toolsUsedInRound = false;

function handleEvent(event: { type: string; [key: string]: unknown }) {
	if (event.type === 'tool_call') {
		toolsUsedInRound = true;
		addMsg({ role: 'tool_call', name: event.name as string });
	} else if (event.type === 'tool_result') {
		// don't show raw results in UI
	} else if (event.type === 'reply') {
		if (!toolsUsedInRound) {
			addMsg({ role: 'agent', text: event.text as string, bot: 'chat' });
		}
	} else if (event.type === 'error') {
		addMsg({ role: 'agent', text: `Error: ${event.message}` });
	} else if (event.type === 'done') {
		if (event.toolsUsed) cart.refreshCart();
		toolsUsedInRound = false;
	}
}

function parseBot(text: string): { bot: Bot | null; rest: string } {
	const match = text.match(/^@(dj|cart|chat)\s*/i);
	if (match) {
		return { bot: match[1].toLowerCase() as Bot, rest: text.slice(match[0].length) };
	}
	return { bot: null, rest: text };
}

export const chatStore = {
	get messages() {
		return messages;
	},
	get thinking() {
		return thinking;
	},
	get activeBot() {
		return activeBot;
	},

	async send(text: string, source: 'user' | 'voice' = 'user') {
		const raw = text.trim();
		if (!raw || thinking) return;

		const { bot: explicitBot, rest } = parseBot(raw);
		if (explicitBot) activeBot = explicitBot;
		const bot = activeBot;
		const cmd = rest.trim() || raw.trim();

		addMsg({ role: source === 'voice' ? 'voice' : 'user', text: raw, bot });

		if (bot === 'dj') {
			const result = player.runCommand(cmd);
			addMsg({ role: 'agent', text: result, bot: 'dj' });
			return;
		}

		thinking = true;
		try {
			const systemPrompt =
				typeof window !== 'undefined' ? localStorage.getItem('systemPrompt') || '' : '';
			const res = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: cmd, bot, systemPrompt })
			});

			const body = await res.text();
			const lines = body.split('\n').filter((l) => l.trim());

			for (const line of lines) {
				try {
					handleEvent(JSON.parse(line));
				} catch {
					console.warn('[Chat] Failed to parse:', line);
				}
			}
		} catch (e) {
			addMsg({ role: 'agent', text: `Failed: ${e}` });
		} finally {
			thinking = false;
		}
	},

	speak,

	switchBot(bot: Bot) {
		activeBot = bot;
	},

	async reset() {
		await fetch('/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ reset: true })
		});
		messages = [];
	}
};
