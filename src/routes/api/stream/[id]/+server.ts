import type { RequestHandler } from './$types';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;
	const url = `https://www.youtube.com/watch?v=${id}`;
	const ytdlpPath = process.env.YTDLP_PATH || 'yt-dlp';

	try {
		const { stdout, stderr } = await execAsync(
			`${ytdlpPath} -f bestaudio -g --no-warnings --no-playlist "${url}"`,
			{ timeout: 15_000 }
		);

		const directUrl = stdout.trim();
		if (!directUrl) {
			console.error('[API /stream] yt-dlp returned empty URL:', stderr);
			return new Response('No audio URL found', { status: 500 });
		}

		console.log('[API /stream] Proxying audio for', id);

		const audioResponse = await fetch(directUrl);
		if (!audioResponse.ok || !audioResponse.body) {
			console.error('[API /stream] CDN fetch failed:', audioResponse.status);
			return new Response('CDN fetch failed', { status: 502 });
		}

		return new Response(audioResponse.body, {
			headers: {
				'Content-Type': audioResponse.headers.get('content-type') || 'audio/webm',
				...(audioResponse.headers.get('content-length') && {
					'Content-Length': audioResponse.headers.get('content-length')!
				}),
				'Cache-Control': 'no-cache'
			}
		});
	} catch (err) {
		console.error('[API /stream] failed:', err);
		return new Response('Stream failed', { status: 500 });
	}
};
