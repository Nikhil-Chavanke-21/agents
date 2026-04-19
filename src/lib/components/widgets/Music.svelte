<script lang="ts">
	import { player } from '$lib/stores/player.svelte';

	let playing = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let audioRef = $state<HTMLAudioElement | null>(null);
	let rotation = $state(0);
	let animFrame = $state(0);
	let lastTimestamp = $state(0);
	let audioSrc = $state('');

	function loadAndPlay(url: string) {
		if (!audioRef) return;
		audioRef.pause();
		cancelAnimationFrame(animFrame);
		playing = false;
		currentTime = 0;
		duration = 0;

		audioSrc = url;
		audioRef.src = url;
		audioRef.load();
		console.log('[Music] Loading:', url);

		const onReady = () => {
			if (!audioRef) return;
			audioRef.removeEventListener('canplay', onReady);
			audioRef
				.play()
				.then(() => {
					playing = true;
					lastTimestamp = performance.now();
					spinRecord(lastTimestamp);
					console.log('[Music] Playback started');
				})
				.catch((e) => {
					console.error('[Music] play() failed:', e);
				});
		};

		audioRef.addEventListener('canplay', onReady);
	}

	function pausePlayback() {
		if (!audioRef) return;
		audioRef.pause();
		playing = false;
		cancelAnimationFrame(animFrame);
	}

	function resumePlayback() {
		if (!audioRef || !audioSrc) return;
		audioRef
			.play()
			.then(() => {
				playing = true;
				lastTimestamp = performance.now();
				spinRecord(lastTimestamp);
			})
			.catch((err) => console.warn('[Music] resume failed:', err));
	}

	function togglePlay() {
		if (!audioRef || !audioSrc) return;
		if (playing) {
			pausePlayback();
		} else {
			resumePlayback();
		}
	}

	$effect(() => {
		const cmd = player.command;
		if (!cmd) return;

		if (cmd === 'play' && player.song) {
			loadAndPlay(player.song.streamUrl);
		} else if (cmd === 'pause') {
			pausePlayback();
		} else if (cmd === 'resume') {
			resumePlayback();
		} else if (cmd === 'forward' && audioRef) {
			audioRef.currentTime += player.seekSeconds;
		} else if (cmd === 'back' && audioRef) {
			audioRef.currentTime = Math.max(0, audioRef.currentTime - player.seekSeconds);
		}

		player.clearCommand();
	});

	function onAudioError() {
		if (!audioRef) return;
		const err = audioRef.error;
		console.error('[Music] Audio error:', err?.code, err?.message);
	}

	function spinRecord(timestamp: number) {
		const delta = timestamp - lastTimestamp;
		lastTimestamp = timestamp;
		rotation += delta * 0.06;
		animFrame = requestAnimationFrame(spinRecord);
	}

	function onTimeUpdate() {
		if (audioRef) currentTime = audioRef.currentTime;
	}

	function onLoadedMetadata() {
		if (audioRef) duration = audioRef.duration;
	}

	function onEnded() {
		playing = false;
		cancelAnimationFrame(animFrame);
		if (!player.playNext()) {
			console.log('[Music] Queue finished');
		}
	}

	function seek(e: MouseEvent) {
		const target = e.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const pct = (e.clientX - rect.left) / rect.width;
		if (audioRef && duration) {
			audioRef.currentTime = pct * duration;
		}
	}

	function formatTime(sec: number): string {
		const m = Math.floor(sec / 60);
		const s = Math.floor(sec % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}
</script>

<div class="flex flex-col items-center justify-center gap-2 rounded-md bg-[#ffffff05] p-6">
	<div class="relative">
		<div class="absolute inset-0 translate-y-2 rounded-full bg-black/30 blur-xl"></div>

		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="vinyl"
			style="transform: rotate({rotation}deg); cursor: pointer;"
			class:vinyl-paused={!playing}
			onclick={togglePlay}
			role="button"
			tabindex="0"
		>
			<div class="groove groove-1"></div>
			<div class="groove groove-2"></div>
			<div class="groove groove-3"></div>
			<div class="groove groove-4"></div>
			<div class="groove groove-5"></div>

			<div class="label">
				{#if player.song?.thumbnail}
					<img src={player.song.thumbnail} alt="Album art" class="label-img" />
				{/if}
				<div class="label-hole"></div>
			</div>
		</div>

		<div class="tonearm-pivot">
			<div class="tonearm" class:tonearm-playing={playing}>
				<div class="tonearm-head"></div>
			</div>
		</div>
	</div>

	<div class="mt-2 flex flex-col items-center gap-1">
		{#if player.loading}
			<p class="text-sm font-semibold tracking-wide text-gray-400">Searching...</p>
		{:else if player.song}
			<p class=" w-1/2 truncate text-sm font-semibold text-gray-200">{player.song.title}</p>
			<p class="truncate text-xs text-gray-500">{player.song.artist}</p>
		{:else}
			<p class="text-sm font-semibold tracking-wide text-gray-200">No song loaded</p>
			<p class="text-xs text-gray-500">Say "Play &lt;song name&gt;"</p>
		{/if}
	</div>

	<div class="flex w-full items-center justify-between gap-2 text-[10px] text-gray-600">
		<span>{formatTime(currentTime)}</span>
		<div
			class="group h-1.5 w-full cursor-pointer rounded-full bg-neutral-800 transition-all hover:h-2"
			role="slider"
			tabindex="0"
			aria-valuenow={currentTime}
			aria-valuemin={0}
			aria-valuemax={duration}
			onclick={seek}
			onkeydown={() => {}}
		>
			<div
				class="h-full rounded-full bg-linear-to-r from-amber-500 to-orange-500 transition-all"
				style="width: {duration ? (currentTime / duration) * 100 : 0}%"
			></div>
		</div>
		<span>{formatTime(duration)}</span>
	</div>

	<audio
		bind:this={audioRef}
		src={audioSrc}
		ontimeupdate={onTimeUpdate}
		onloadedmetadata={onLoadedMetadata}
		onerror={onAudioError}
		onended={onEnded}
	></audio>
</div>

<style>
	.vinyl {
		width: 180px;
		height: 180px;
		border-radius: 50%;
		background: radial-gradient(
			circle,
			#1a1a1a 0%,
			#111 20%,
			#1a1a1a 21%,
			#0d0d0d 22%,
			#1a1a1a 40%,
			#111 41%,
			#1a1a1a 42%,
			#0d0d0d 60%,
			#1a1a1a 61%,
			#111 80%,
			#1a1a1a 81%,
			#0d0d0d 100%
		);
		position: relative;
		transition: transform 0.1s linear;
		box-shadow:
			0 0 0 3px #222,
			0 0 0 6px #111,
			0 8px 30px rgba(0, 0, 0, 0.6);
	}

	.vinyl::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background: conic-gradient(
			from 0deg,
			transparent 0%,
			rgba(255, 255, 255, 0.03) 10%,
			transparent 20%,
			rgba(255, 255, 255, 0.02) 40%,
			transparent 50%,
			rgba(255, 255, 255, 0.03) 70%,
			transparent 80%,
			rgba(255, 255, 255, 0.02) 100%
		);
	}

	.groove {
		position: absolute;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.04);
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
	}

	.groove-1 {
		width: 85%;
		height: 85%;
	}
	.groove-2 {
		width: 72%;
		height: 72%;
	}
	.groove-3 {
		width: 60%;
		height: 60%;
	}
	.groove-4 {
		width: 50%;
		height: 50%;
	}
	.groove-5 {
		width: 42%;
		height: 42%;
	}

	.label {
		position: absolute;
		width: 34%;
		height: 34%;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		background: radial-gradient(circle at 40% 35%, #d97706, #b45309 40%, #92400e 70%, #78350f 100%);
		box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.2);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.label-img {
		position: absolute;
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 50%;
	}

	.label-hole {
		width: 14%;
		height: 14%;
		border-radius: 50%;
		background: #0a0a0a;
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.8);
		z-index: 1;
	}

	.tonearm-pivot {
		position: absolute;
		top: -8px;
		right: 10px;
		z-index: 10;
	}

	.tonearm {
		width: 4px;
		height: 100px;
		background: linear-gradient(to bottom, #555, #333);
		border-radius: 2px;
		transform-origin: top center;
		transform: rotate(-30deg);
		transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
		position: relative;
		box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.5);
	}

	.tonearm-playing {
		transform: rotate(-10deg);
	}

	.tonearm-head {
		position: absolute;
		bottom: -4px;
		left: 50%;
		transform: translateX(-50%);
		width: 8px;
		height: 10px;
		background: #888;
		border-radius: 0 0 2px 2px;
	}

	.tonearm::before {
		content: '';
		position: absolute;
		top: -5px;
		left: 50%;
		transform: translateX(-50%);
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: radial-gradient(circle at 40% 35%, #666, #333);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
	}
</style>
