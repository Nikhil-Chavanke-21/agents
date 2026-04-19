export type Song = {
	title: string;
	artist: string;
	thumbnail: string;
	streamUrl: string;
};

type PlayerCommand = 'play' | 'pause' | 'resume' | 'forward' | 'back' | null;

let currentSong = $state<Song | null>(null);
let queue = $state<Song[]>([]);
let queueIndex = $state(-1);
let command = $state<PlayerCommand>(null);
let seekSeconds = $state(0);
let loading = $state(false);

async function fetchMix(videoId: string) {
	try {
		const res = await fetch(`/api/mix/${videoId}`);
		if (!res.ok) return;
		const songs: Song[] = await res.json();
		queue = songs;
		queueIndex = -1;
		console.log(`[Player] Queued ${songs.length} songs from mix`);
	} catch (err) {
		console.error('[Player] Failed to fetch mix:', err);
	}
}

export const player = {
	get song() {
		return currentSong;
	},
	get command() {
		return command;
	},
	get loading() {
		return loading;
	},
	get queue() {
		return queue;
	},
	get queueIndex() {
		return queueIndex;
	},
	get hasNext() {
		return queueIndex < queue.length - 1;
	},
	get hasPrevious() {
		return queueIndex > 0;
	},
	get seekSeconds() {
		return seekSeconds;
	},

	async playSong(query: string) {
		loading = true;
		command = null;
		try {
			const res = await fetch('/api/play', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query })
			});
			if (!res.ok) throw new Error(await res.text());
			const data = await res.json();
			currentSong = {
				title: data.title,
				artist: data.artist,
				thumbnail: data.thumbnail,
				streamUrl: `/api/stream/${data.videoId}`
			};
			command = 'play';

			// Fetch the mix queue in the background
			fetchMix(data.videoId);
		} catch (err) {
			console.error('[Player] Failed to search:', err);
		} finally {
			loading = false;
		}
	},

	playNext() {
		if (queueIndex >= queue.length - 1) {
			console.log('[Player] Queue exhausted');
			return false;
		}
		queueIndex++;
		currentSong = queue[queueIndex];
		command = 'play';
		console.log(`[Player] Playing next: "${currentSong.title}" (${queueIndex + 1}/${queue.length})`);
		return true;
	},

	playPrevious() {
		if (queueIndex <= 0) {
			console.log('[Player] No previous song');
			return false;
		}
		queueIndex--;
		currentSong = queue[queueIndex];
		command = 'play';
		console.log(`[Player] Playing previous: "${currentSong.title}" (${queueIndex + 1}/${queue.length})`);
		return true;
	},

	skip() {
		return this.playNext();
	},

	forward(seconds = 10) {
		seekSeconds = seconds;
		command = 'forward';
	},
	back(seconds = 10) {
		seekSeconds = seconds;
		command = 'back';
	},

	pause() {
		command = 'pause';
	},
	resume() {
		command = 'resume';
	},
	clearCommand() {
		command = null;
	},

	runCommand(text: string): string {
		const lower = text.toLowerCase().trim();
		if (!lower) return '';

		if (lower.includes('next') || lower.includes('skip')) {
			if (this.skip()) return `Next: "${currentSong?.title}"`;
			return 'No more songs in queue';
		}
		if (lower.includes('last')) {
			if (this.playPrevious()) return `Last: "${currentSong?.title}"`;
			return 'No previous song';
		}
		if (lower.includes('forward')) {
			const match = lower.match(/(\d+)/);
			const secs = match ? parseInt(match[1], 10) : 10;
			this.forward(secs);
			return `Forward ${secs}s`;
		}
		if (lower.includes('back') || lower.includes('rewind')) {
			const match = lower.match(/(\d+)/);
			const secs = match ? parseInt(match[1], 10) : 10;
			this.back(secs);
			return `Back ${secs}s`;
		}
		const playMatch = lower.match(/play\s+(.+)/);
		if (playMatch) {
			const songName = playMatch[1];
			this.playSong(songName).then(() => {});
			return `Searching "${songName}"...`;
		}
		if (lower.includes('pause')) {
			this.pause();
			return 'Paused';
		}
		if (lower.includes('resume')) {
			this.resume();
			return 'Resumed';
		}

		return `Unknown: "${lower}"`;
	}
};
