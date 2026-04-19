<script>
	import Agent from '$lib/components/Agent.svelte';
	import Chat from '$lib/components/widgets/Chat.svelte';
	import Music from '$lib/components/widgets/Music.svelte';
	import Cart from '$lib/components/widgets/Cart.svelte';
</script>

<div class="flex h-screen flex-col gap-2 bg-neutral-950 p-2 text-gray-400">
	<div class="flex flex-1 gap-2 overflow-hidden">
		<div class="flex w-1/4 flex-col gap-2">
			<Agent />
		</div>

		<div class="flex w-1/2 flex-col">
			<Chat />
		</div>

		<div class="flex w-1/4 flex-col gap-2">
			<Music />
			<Cart />
		</div>
	</div>
</div>
