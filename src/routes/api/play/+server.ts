import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { YouTube } from 'youtube-sr';

export const POST: RequestHandler = async ({ request }) => {
	const { query } = await request.json();
	if (!query || typeof query !== 'string') {
		throw error(400, 'Missing query');
	}

	try {
		const results = await YouTube.search(query, { limit: 1, type: 'video' });
		if (!results.length) {
			throw error(404, 'No results found');
		}

		const video = results[0];
		const thumbnail =
			video.thumbnail?.url ??
			`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;

		return json({
			videoId: video.id,
			title: video.title ?? query,
			artist: video.channel?.name ?? 'Unknown',
			thumbnail,
			duration: video.duration
		});
	} catch (err) {
		console.error('[API /play] YouTube search failed:', err);
		throw error(500, 'YouTube search failed');
	}
};
