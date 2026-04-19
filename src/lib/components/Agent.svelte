<script lang="ts">
	import { chatStore, type Bot } from '$lib/stores/chat.svelte';

	type AgentState = 'sleeping' | 'listening' | 'active';

	const TRIGGERS: { phrase: string; bot: Bot }[] = [
		{ phrase: 'hey siri', bot: 'dj' },
		{ phrase: 'hey mango', bot: 'cart' },
		{ phrase: 'hey buddy', bot: 'chat' }
	];

	let agentState: AgentState = $state('sleeping');
	let transcript = $state('');
	let statusText = $state('Click the orb to use voice');
	let micOn = $state(false);
	let recognition: SpeechRecognition | null = $state(null);
	let sleepTimer: ReturnType<typeof setTimeout> | null = $state(null);

	const SLEEP_TIMEOUT = 10_000;

	function matchTrigger(text: string): { bot: Bot; idx: number; phrase: string } | null {
		const lower = text.toLowerCase();
		console.log(lower);
		for (const t of TRIGGERS) {
			const idx = lower.indexOf(t.phrase);
			if (idx !== -1) return { bot: t.bot, idx, phrase: t.phrase };
		}
		return null;
	}

	function activate(bot: Bot) {
		chatStore.switchBot(bot);
		chatStore.speak('Yes', bot);
		agentState = 'active';
		statusText = `@${bot} listening...`;
		console.log(`[Agent] Activated → @${bot}`);
		resetSleepTimer();
	}

	function deactivate() {
		if (!micOn) return;
		agentState = 'listening';
		statusText = 'Say "Hey Siri / Mango / Buddy"';
		transcript = '';
		console.log('[Agent] Going to sleep');
		if (sleepTimer) clearTimeout(sleepTimer);
		sleepTimer = null;
	}

	function resetSleepTimer() {
		if (sleepTimer) clearTimeout(sleepTimer);
		sleepTimer = setTimeout(() => {
			console.log('[Agent] No input for 10s — going to sleep');
			deactivate();
		}, SLEEP_TIMEOUT);
	}

	function stopMic() {
		micOn = false;
		if (recognition) {
			recognition.onend = null;
			try {
				recognition.abort();
			} catch {
				/* ignore */
			}
			recognition = null;
		}
		if (sleepTimer) clearTimeout(sleepTimer);
		sleepTimer = null;
		agentState = 'sleeping';
		transcript = '';
		statusText = 'Click the orb to use voice';
	}

	function toggleMic() {
		if (micOn) {
			stopMic();
		} else {
			startRecognition();
		}
	}

	function startRecognition() {
		const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
		if (!SpeechRecognitionCtor) {
			statusText = 'Voice not supported in this browser';
			return;
		}

		micOn = true;

		const rec = new SpeechRecognitionCtor();
		rec.continuous = true;
		rec.interimResults = true;
		rec.lang = 'en-US';

		rec.onstart = () => {
			agentState = 'listening';
			statusText = 'Say "Hey Siri / Mango / Buddy"';
		};

		rec.onresult = (event: SpeechRecognitionEvent) => {
			let interim = '';
			let finalTranscript = '';

			for (let i = event.resultIndex; i < event.results.length; i++) {
				const result = event.results[i];
				if (result.isFinal) {
					finalTranscript += result[0].transcript;
				} else {
					interim += result[0].transcript;
				}
			}

			const combined = (finalTranscript + interim).toLowerCase();
			transcript = combined || transcript;

			if (agentState === 'listening') {
				const trigger = matchTrigger(combined);
				if (trigger) {
					activate(trigger.bot);
					return;
				}
			}

			if (agentState === 'active') {
				resetSleepTimer();
				if (finalTranscript.trim()) {
					let cmd = finalTranscript.toLowerCase().trim();
					const trigger = matchTrigger(cmd);
					if (trigger) {
						activate(trigger.bot);
						cmd = cmd.substring(trigger.idx + trigger.phrase.length).trim();
					}
					if (cmd) {
						statusText = `@${chatStore.activeBot}: "${cmd}"`;
						chatStore.send(cmd, 'voice');
					}
				}
			}
		};

		rec.onerror = (event: SpeechRecognitionErrorEvent) => {
			console.warn('[Agent] Recognition error:', event.error);
			if (event.error === 'not-allowed') {
				statusText = 'Mic denied';
				stopMic();
			}
		};

		rec.onend = () => {
			if (!micOn) return;
			try {
				rec.start();
			} catch {
				setTimeout(() => {
					if (micOn) rec.start();
				}, 300);
			}
		};

		rec.start();
		recognition = rec;
	}

	$effect(() => {
		return () => {
			if (recognition) {
				recognition.onend = null;
				try {
					recognition.abort();
				} catch {
					/* ignore */
				}
			}
			if (sleepTimer) clearTimeout(sleepTimer);
		};
	});
</script>

<div class="agent-widget">
	<button
		type="button"
		class="orb-area"
		class:orb-area-mic-on={micOn}
		onclick={toggleMic}
		aria-pressed={micOn}
		aria-label={micOn ? 'Turn off voice input' : 'Turn on voice input'}
	>
		<div class="orb">
			{#if agentState === 'active'}
				{#each [0, 1, 2, 3] as ring (ring)}
					<div class="pulse-ring" style="animation-delay: {ring * 0.4}s"></div>
				{/each}
			{/if}
			<div class="orb-core" class:orb-core-active={agentState === 'active'}>
				<div class="orb-inner"></div>
			</div>
		</div>
	</button>
	<p class="status">{statusText}</p>
</div>

<style>
	.agent-widget {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		user-select: none;
		gap: 12px;
	}

	.orb-area {
		position: relative;
		width: 120px;
		height: 120px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		border-radius: 16px;
		color: inherit;
	}

	.orb-area:focus-visible {
		outline: 2px solid rgba(99, 102, 241, 0.6);
		outline-offset: 4px;
	}

	.orb-area-mic-on {
		box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.25);
	}

	.orb {
		position: relative;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.orb-core {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: radial-gradient(circle at 40% 35%, #374151, #1f2937 60%, #111827);
		box-shadow:
			0 0 20px rgba(107, 114, 128, 0.15),
			inset 0 2px 8px rgba(255, 255, 255, 0.05);
		transition: all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
		z-index: 2;
		position: relative;
	}

	.orb-core-active {
		background: radial-gradient(circle at 40% 35%, #6366f1, #4f46e5 50%, #4338ca 80%, #3730a3);
		box-shadow:
			0 0 30px rgba(99, 102, 241, 0.5),
			0 0 60px rgba(99, 102, 241, 0.25),
			0 0 100px rgba(99, 102, 241, 0.1),
			inset 0 2px 10px rgba(255, 255, 255, 0.2);
		animation: core-breathe 2s ease-in-out infinite;
	}

	.orb-inner {
		position: absolute;
		top: 18%;
		left: 25%;
		width: 30%;
		height: 30%;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(255, 255, 255, 0.25), transparent);
	}

	.pulse-ring {
		position: absolute;
		width: 64px;
		height: 64px;
		border-radius: 50%;
		border: 2px solid rgba(99, 102, 241, 0.4);
		animation: pulse-expand 1.6s ease-out infinite;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%) scale(1);
	}

	.status {
		font-size: 11px;
		color: #6b7280;
		text-align: center;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@keyframes pulse-expand {
		0% {
			transform: translate(-50%, -50%) scale(1);
			opacity: 0.6;
		}
		100% {
			transform: translate(-50%, -50%) scale(2.2);
			opacity: 0;
		}
	}

	@keyframes core-breathe {
		0%,
		100% {
			box-shadow:
				0 0 30px rgba(99, 102, 241, 0.5),
				0 0 60px rgba(99, 102, 241, 0.25),
				0 0 100px rgba(99, 102, 241, 0.1),
				inset 0 2px 10px rgba(255, 255, 255, 0.2);
			transform: scale(1);
		}
		50% {
			box-shadow:
				0 0 40px rgba(99, 102, 241, 0.6),
				0 0 80px rgba(99, 102, 241, 0.35),
				0 0 120px rgba(99, 102, 241, 0.15),
				inset 0 2px 10px rgba(255, 255, 255, 0.25);
			transform: scale(1.05);
		}
	}
</style>
