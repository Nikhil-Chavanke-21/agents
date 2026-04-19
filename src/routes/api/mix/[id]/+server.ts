import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;
	const ytdlpPath = process.env.YTDLP_PATH || 'yt-dlp';
	const mixUrl = `https://www.youtube.com/watch?v=${id}&list=RD${id}`;

	try {
		const { stdout } = await execAsync(
			`${ytdlpPath} --flat-playlist --print "%(id)s|||%(title)s|||%(channel)s" --no-warnings --playlist-end 25 "${mixUrl}"`,
			{ timeout: 20_000 }
		);

		const songs = stdout
			.trim()
			.split('\n')
			.filter(Boolean)
			.map((line) => {
				const [videoId, title, artist] = line.split('|||');
				return {
					videoId,
					title: title || 'Unknown',
					artist: artist || 'Unknown',
					thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
					streamUrl: `/api/stream/${videoId}`
				};
			})
			.filter((s) => s.videoId !== id); // exclude the seed song

		return json(songs);
	} catch (err) {
		console.error('[API /mix] yt-dlp failed:', err);
		return json([]);
	}
};
