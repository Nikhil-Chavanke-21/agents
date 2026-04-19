<script lang="ts">
	import { chatStore, type Bot } from '$lib/stores/chat.svelte';

	let commandInput = $state('');
	let inputRef = $state<HTMLInputElement | null>(null);
	let inputFocused = $state(false);
	let showHelp = $state(false);
	let chatRef = $state<HTMLDivElement | null>(null);

	const BOT_CONFIG: Record<Bot, { label: string; color: string }> = {
		dj: { label: 'dj', color: '#8b5cf6' },
		cart: { label: 'cart', color: '#ea580c' },
		chat: { label: 'chat', color: '#6366f1' }
	};

	const BOTS: Bot[] = ['dj', 'cart', 'chat'];

	const COMMANDS = [
		{ cmd: '@dj', desc: 'Switch to music bot', example: '"@dj play lofi"' },
		{ cmd: '@cart', desc: 'Switch to grocery bot', example: '"@cart add paneer"' },
		{ cmd: '@chat', desc: 'Switch to chat bot', example: '"@chat tell me a joke"' },
		{ cmd: 'Play <song>', desc: 'Play a song (dj)', example: '"play Bohemian Rhapsody"' },
		{ cmd: 'Pause / Resume', desc: 'Control playback (dj)', example: '"pause"' },
		{ cmd: 'Next / Last', desc: 'Skip tracks (dj)', example: '"next"' }
	];

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			showHelp = !showHelp;
		}
		if (e.key === 'Escape') {
			if (showHelp) showHelp = false;
			if (inputFocused) inputRef?.blur();
		}
		if (e.key === '/' && !inputFocused && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
			e.preventDefault();
			inputRef?.focus();
		}
	}

	function scrollToBottom() {
		requestAnimationFrame(() => {
			if (chatRef) chatRef.scrollTop = chatRef.scrollHeight;
		});
	}

	$effect(() => {
		void chatStore.messages.length;
		void chatStore.thinking;
		scrollToBottom();
	});

	async function handleSubmit() {
		const cmd = commandInput.trim();
		if (!cmd) return;
		commandInput = '';
		await chatStore.send(cmd, 'user');
	}

	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleSubmit();
		}
		if (e.key === 'Escape') {
			inputRef?.blur();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if showHelp}
	<div class="help-backdrop" onclick={() => (showHelp = false)} role="presentation">
		<div
			class="help-modal"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.key === 'Escape' && (showHelp = false)}
			role="dialog"
			aria-label="Command reference"
			tabindex="-1"
		>
			<div class="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
				<h2 class="text-sm font-semibold tracking-wide text-gray-200">Commands</h2>
				<div class="flex items-center gap-2">
					<kbd class="kbd">Ctrl</kbd><span class="text-xs text-gray-600">+</span><kbd class="kbd">K</kbd>
				</div>
			</div>
			<div class="px-5 py-4">
				<table class="w-full">
					<thead>
						<tr class="text-left text-[10px] tracking-widest text-gray-600 uppercase">
							<th class="pb-3 font-medium">Command</th>
							<th class="pb-3 font-medium">Description</th>
							<th class="pb-3 font-medium">Example</th>
						</tr>
					</thead>
					<tbody>
						{#each COMMANDS as { cmd, desc, example }, i (i)}
							<tr class="group border-t border-neutral-800/50">
								<td class="py-2.5 pr-4">
									<code class="rounded bg-neutral-800 px-2 py-0.5 text-xs text-indigo-400">{cmd}</code>
								</td>
								<td class="py-2.5 pr-4 text-xs text-gray-400">{desc}</td>
								<td class="py-2.5 text-xs text-gray-500 italic">{example}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="border-t border-neutral-800 px-5 py-3">
				<p class="text-[11px] text-gray-600">
					Music commands are handled locally. Everything else goes through the AI assistant.
				</p>
			</div>
		</div>
	</div>
{/if}

<div class="chat-container">
	<div class="chat-header">
		<span class="text-xs font-medium tracking-wide text-gray-500">Chat</span>
		<div class="flex items-center gap-2">
			{#if chatStore.messages.length > 0}
				<button class="header-icon-btn" title="Reset conversation" onclick={() => chatStore.reset()}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
				</button>
			{/if}
			<button class="help-btn" onclick={() => (showHelp = true)}>
				<kbd class="kbd-sm">Ctrl+K</kbd>
			</button>
		</div>
	</div>

	<div class="chat-messages" bind:this={chatRef}>
		{#if chatStore.messages.length === 0 && !chatStore.thinking}
			<div class="empty-state">
				<p class="text-sm text-gray-600">No messages yet</p>
				<p class="text-xs text-gray-700">
					Press <kbd class="kbd-inline">/</kbd> to start chatting
				</p>
			</div>
		{:else}
			{#each chatStore.messages as msg, i (i)}
				{#if msg.role === 'user'}
					<div class="msg msg-user">
						<span class="msg-label">You</span>
						<span class="msg-text">{msg.text}</span>
					</div>
				{:else if msg.role === 'voice'}
					<div class="msg msg-voice">
						<span class="msg-label msg-label-voice">Voice</span>
						<span class="msg-text">{msg.text}</span>
					</div>
				{:else if msg.role === 'agent'}
					<div class="msg msg-agent">
						{#if msg.bot}
							<span class="msg-label" style="color: {BOT_CONFIG[msg.bot].color}">{msg.bot}</span>
						{:else}
							<span class="msg-label msg-label-agent">Agent</span>
						{/if}
						<span class="msg-text">{msg.text}</span>
					</div>
				{:else if msg.role === 'tool_call'}
					<div class="msg msg-tool">
						<span class="msg-label msg-label-tool">Tool</span>
						<code class="tool-name">{msg.name}</code>
					</div>
				{/if}
			{/each}
			{#if chatStore.thinking}
				<div class="msg msg-agent">
					<span class="msg-label" style="color: {BOT_CONFIG[chatStore.activeBot].color}">{chatStore.activeBot}</span>
					<span class="msg-text thinking-dots">Thinking</span>
				</div>
			{/if}
		{/if}
	</div>

	<div class="chat-input-area">
		<div class="bot-switcher">
			{#each BOTS as bot (bot)}
				<button
					class="bot-tab"
					class:bot-tab-active={chatStore.activeBot === bot}
					style={chatStore.activeBot === bot ? `color: ${BOT_CONFIG[bot].color}; border-color: ${BOT_CONFIG[bot].color}` : ''}
					onclick={() => chatStore.switchBot(bot)}
				>@{bot}</button>
			{/each}
		</div>
		<div class="cmd-input-wrapper">
			<input
				bind:this={inputRef}
				bind:value={commandInput}
				onfocus={() => (inputFocused = true)}
				onblur={() => (inputFocused = false)}
				onkeydown={handleInputKeydown}
				class="cmd-input"
				type="text"
				placeholder={chatStore.thinking ? 'Waiting for response...' : `Message @${chatStore.activeBot}...`}
				spellcheck="false"
				autocomplete="off"
				disabled={chatStore.thinking}
			/>
			{#if !inputFocused && !commandInput && !chatStore.thinking}
				<kbd class="cmd-kbd">/</kbd>
			{/if}
		</div>
	</div>
</div>

<style>
	.chat-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: rgba(255, 255, 255, 0.02);
		border-radius: 8px;
	}

	.chat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid #1f1f1f;
	}

	.header-icon-btn {
		background: none;
		border: none;
		cursor: pointer;
		padding: 4px;
		color: #6b7280;
		border-radius: 4px;
		display: flex;
		align-items: center;
		transition: color 0.15s;
	}

	.header-icon-btn:hover {
		color: #d1d5db;
	}

	.help-btn {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
	}

	.kbd-sm {
		font-family: inherit;
		font-size: 10px;
		background: #1f2937;
		border: 1px solid #374151;
		border-radius: 4px;
		padding: 2px 6px;
		color: #6b7280;
	}

	.chat-messages {
		flex: 1;
		overflow-y: auto;
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.empty-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
	}

	.kbd-inline {
		font-family: inherit;
		font-size: 11px;
		background: #1f2937;
		border: 1px solid #374151;
		border-radius: 3px;
		padding: 0 5px;
		color: #9ca3af;
	}

	.msg {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 6px 10px;
		border-radius: 6px;
	}

	.msg-user {
		background: rgba(99, 102, 241, 0.06);
	}

	.msg-voice {
		background: rgba(139, 92, 246, 0.06);
	}

	.msg-agent {
		background: rgba(255, 255, 255, 0.03);
	}

	.msg-label {
		font-size: 10px;
		font-weight: 600;
		color: #6366f1;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		flex-shrink: 0;
	}

	.msg-label-voice {
		color: #8b5cf6;
	}

	.msg-label-agent {
		color: #6b7280;
	}

	.msg-text {
		font-size: 13px;
		color: #d1d5db;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.msg-tool {
		background: rgba(234, 179, 8, 0.04);
		border-left: 2px solid rgba(234, 179, 8, 0.3);
		padding: 4px 10px;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.msg-label-tool {
		font-size: 9px;
		font-weight: 600;
		color: #a3a3a3;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		flex-shrink: 0;
	}

	.tool-name {
		font-size: 11px;
		color: #eab308;
		background: rgba(234, 179, 8, 0.1);
		padding: 1px 5px;
		border-radius: 3px;
	}

	.thinking-dots::after {
		content: '';
		animation: dots 1.4s steps(4, end) infinite;
	}

	@keyframes dots {
		0% { content: ''; }
		25% { content: '.'; }
		50% { content: '..'; }
		75% { content: '...'; }
	}

	.chat-input-area {
		padding: 8px 16px 12px;
		border-top: 1px solid #1f1f1f;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.bot-switcher {
		display: flex;
		gap: 4px;
	}

	.bot-tab {
		background: none;
		border: 1px solid transparent;
		border-radius: 4px;
		padding: 2px 8px;
		font-size: 11px;
		font-weight: 500;
		color: #4b5563;
		cursor: pointer;
		transition: all 0.15s;
		font-family: ui-monospace, monospace;
	}

	.bot-tab:hover {
		color: #9ca3af;
	}

	.bot-tab-active {
		border-color: currentColor;
		background: rgba(255, 255, 255, 0.03);
	}

	.cmd-input-wrapper {
		position: relative;
		width: 100%;
	}

	.cmd-input {
		width: 100%;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid #2a2a2a;
		border-radius: 8px;
		padding: 10px 14px;
		font-size: 13px;
		color: #e5e7eb;
		outline: none;
		transition: all 0.2s;
		font-family: inherit;
	}

	.cmd-input::placeholder {
		color: #4b5563;
	}

	.cmd-input:focus {
		border-color: #4f46e5;
		box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.15);
		background: rgba(255, 255, 255, 0.05);
	}

	.cmd-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.cmd-kbd {
		position: absolute;
		right: 10px;
		top: 50%;
		transform: translateY(-50%);
		font-family: inherit;
		font-size: 11px;
		background: #1f2937;
		border: 1px solid #374151;
		border-radius: 4px;
		padding: 1px 7px;
		color: #6b7280;
		pointer-events: none;
	}

	/* Modals */
	.help-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		animation: fade-in 0.15s ease-out;
	}

	.help-modal {
		width: 520px;
		max-width: 90vw;
		background: #141414;
		border: 1px solid #2a2a2a;
		border-radius: 12px;
		box-shadow:
			0 25px 60px rgba(0, 0, 0, 0.5),
			0 0 0 1px rgba(255, 255, 255, 0.03) inset;
		animation: modal-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
		overflow: hidden;
	}

	.kbd {
		font-family: inherit;
		font-size: 10px;
		background: #1f2937;
		border: 1px solid #374151;
		border-radius: 4px;
		padding: 2px 6px;
		color: #9ca3af;
		line-height: 1;
	}

	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes modal-in {
		from { opacity: 0; transform: scale(0.95) translateY(8px); }
		to { opacity: 1; transform: scale(1) translateY(0); }
	}
</style>
