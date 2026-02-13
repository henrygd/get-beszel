export async function getVersion(): Promise<Response> {
	const url = 'https://api.github.com/repos/henrygd/beszel/releases/latest';
	let latestVersion = '0.12.12';

	const response = await fetch(url, {
		headers: {
			'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
		},
		cf: {
			cacheTtl: 600, // cache for 10 minutes
			cacheKey: url,
		},
	});

	if (response.status === 200) {
		const result = (await response.json()) as { tag_name: string };
		if (result.tag_name) {
			latestVersion = result.tag_name.replace('v', '');
		}
	}

	return new Response(latestVersion, {
		headers: {
			'content-type': 'text/plain',
			'Cache-Control': 'public, max-age=600',
		},
		cf: {
			cacheTtl: 600, // cache for 10 minutes
			cacheKey: 'latest-version',
		},
	});
}
