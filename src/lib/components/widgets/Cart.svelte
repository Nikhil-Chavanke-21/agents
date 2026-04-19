<script lang="ts">
	import { cart } from '$lib/stores/cart.svelte';
	import { onMount } from 'svelte';

	let showPromptEditor = $state(false);
	let systemPrompt = $state('');

	async function openPromptEditor() {
		try {
			const res = await fetch('/api/chat/system-prompt');
			const data = await res.json();
			systemPrompt = data.prompt;
		} catch {
			/* keep whatever we have */
		}
		showPromptEditor = true;
	}

	async function savePrompt() {
		await fetch('/api/chat/system-prompt', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ prompt: systemPrompt })
		});
		showPromptEditor = false;
	}

	$effect(() => {
		console.log(cart.items);
	});

	onMount(() => {
		cart.checkConnection();
	});
</script>

{#if showPromptEditor}
	<div class="prompt-backdrop" onclick={() => (showPromptEditor = false)} role="presentation">
		<div
			class="prompt-modal"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.key === 'Escape' && (showPromptEditor = false)}
			role="dialog"
			aria-label="System prompt editor"
			tabindex="-1"
		>
			<div class="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
				<h2 class="text-sm font-semibold tracking-wide text-gray-200">System Prompt</h2>
				<button
					class="text-xs text-gray-500 hover:text-gray-300"
					onclick={() => (showPromptEditor = false)}>ESC</button
				>
			</div>
			<div class="px-5 py-4">
				<textarea class="prompt-textarea" bind:value={systemPrompt} rows="12" spellcheck="false"
				></textarea>
			</div>
			<div class="flex items-center justify-end gap-3 border-t border-neutral-800 px-5 py-3">
				<button class="prompt-btn prompt-btn-secondary" onclick={() => (showPromptEditor = false)}
					>Cancel</button
				>
				<button class="prompt-btn prompt-btn-primary" onclick={savePrompt}>Save</button>
			</div>
		</div>
	</div>
{/if}

<div class="cart-container">
	{#if !cart.connected}
		<div class="cart-header">
			<span class="text-xs font-medium tracking-wide text-gray-500">Instamart</span>
		</div>
		<div class="flex flex-1 items-center justify-center">
			<button class="connect-btn" onclick={() => cart.connect()}>Connect Swiggy</button>
		</div>
	{:else}
		<div class="cart-header">
			<span class="text-[10px] font-medium tracking-wider text-orange-500 uppercase">Instamart</span
			>
			<button class="header-icon-btn" title="Edit system prompt" onclick={openPromptEditor}>
				<svg
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path
						d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
					/><circle cx="12" cy="12" r="3" /></svg
				>
			</button>
			{#if cart.addresses.length > 0}
				<select
					class="address-select w-1/2"
					value={cart.selectedAddressId ?? ''}
					onchange={(e) => cart.selectAddress(e.currentTarget.value)}
				>
					<option value="" disabled>Select address...</option>
					{#each cart.addresses as addr (addr.id)}
						<option value={addr.id}>
							{addr.label}{addr.address ? ` — ${addr.address}` : ''}
						</option>
					{/each}
				</select>
			{:else}
				<span class="text-[11px] text-gray-600">No addresses found</span>
			{/if}
		</div>

		<div class="cart-body">
			{#if cart.items.length === 0}
				<div class="empty-state">
					<p class="text-sm text-gray-600">Cart is empty</p>
					<p class="text-xs text-gray-700">
						Type <code class="rounded bg-neutral-800 px-1.5 py-0.5 text-indigo-400">add milk</code> in
						chat
					</p>
				</div>
			{:else}
				<div class="bill-section">
					{#each cart.items as item, idx (idx)}
						<div class="bill-line">
							<span class="bill-label"
								><span class="item-qty">{item.quantity}</span> {item.name}</span
							>
							<span class="bill-value">₹{item.price * item.quantity}</span>
						</div>
					{/each}
				</div>
				{#if cart.billLines.length > 0}
					<div class="bill-section">
						{#each cart.billLines as line (line.label)}
							<div class="bill-line">
								<span class="bill-label">{line.label}</span>
								<span class="bill-value">{line.value}</span>
							</div>
						{/each}
					</div>
				{/if}
				<div class="bill-total">
					<span>To Pay</span>
					<span>₹{cart.total}</span>
				</div>
				<button class="order-btn" onclick={() => cart.order()} disabled={cart.loading}>
					{cart.loading ? 'Ordering...' : 'Order Now'}
				</button>
			{/if}
		</div>

		{#if cart.loading}
			<div class="loading-bar"></div>
		{/if}
	{/if}
</div>

<style>
	.cart-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: rgba(255, 255, 255, 0.02);
		border-radius: 8px;
		overflow: hidden;
		position: relative;
	}

	.cart-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid #1f1f1f;
	}

	.address-select {
		background: #141414;
		border: 1px solid #2a2a2a;
		border-radius: 6px;
		padding: 5px 8px;
		font-size: 11px;
		color: #d1d5db;
		outline: none;
	}

	.address-select:focus {
		border-color: #ea580c;
	}

	.address-select option {
		background: #141414;
		color: #d1d5db;
	}

	.cart-body {
		flex: 1;
		overflow-y: auto;
		padding: 12px;
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

	.bill-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-bottom: 8px;
		border-bottom: 1px solid #1f1f1f;
	}

	.bill-line {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.bill-label {
		font-size: 11px;
		color: #6b7280;
	}

	.item-qty {
		color: #ea580c;
		font-weight: 600;
	}

	.bill-value {
		font-size: 11px;
		color: #9ca3af;
		font-variant-numeric: tabular-nums;
	}

	.bill-total {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 13px;
		font-weight: 600;
		color: #e5e7eb;
	}

	.order-btn {
		width: 100%;
		padding: 8px 0;
		border-radius: 6px;
		border: none;
		background: #ea580c;
		color: white;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}

	.order-btn:hover:not(:disabled) {
		background: #c2410c;
	}

	.order-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.connect-btn {
		padding: 10px 20px;
		border-radius: 8px;
		border: 1px solid #ea580c;
		background: rgba(234, 88, 12, 0.1);
		color: #ea580c;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.connect-btn:hover {
		background: rgba(234, 88, 12, 0.2);
	}

	.loading-bar {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 2px;
		background: linear-gradient(90deg, transparent, #ea580c, transparent);
		animation: shimmer 1.5s infinite;
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

	.prompt-backdrop {
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

	.prompt-modal {
		width: 600px;
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

	.prompt-textarea {
		width: 100%;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid #2a2a2a;
		border-radius: 8px;
		padding: 12px;
		font-size: 12px;
		color: #d1d5db;
		outline: none;
		resize: vertical;
		font-family: inherit;
		line-height: 1.6;
	}

	.prompt-textarea:focus {
		border-color: #ea580c;
	}

	.prompt-btn {
		padding: 6px 16px;
		border-radius: 6px;
		border: none;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.prompt-btn-secondary {
		background: #1f2937;
		color: #9ca3af;
	}

	.prompt-btn-secondary:hover {
		background: #374151;
	}

	.prompt-btn-primary {
		background: #ea580c;
		color: white;
	}

	.prompt-btn-primary:hover {
		background: #c2410c;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes modal-in {
		from {
			opacity: 0;
			transform: scale(0.95) translateY(8px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	@keyframes shimmer {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(100%);
		}
	}
</style>
