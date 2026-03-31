export async function getVersion(): Promise<Response> {
	const cache = caches.default;
	const cacheKey = "https://get.beszel.dev/latest-version";

	const cached = await cache.match(cacheKey);
	if (cached) {
		return cached;
	}

	const url = "https://api.github.com/repos/henrygd/beszel/releases/latest";
	let latestVersion = "0.18.6";
	let success = false;

	try {
		const response = await fetch(url, {
			headers: {
				"user-agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			},
			cf: {
				cacheTtl: 600, // cache GitHub API response for 10 minutes
				cacheKey: url,
			},
		});

		if (response.ok) {
			const result = (await response.json()) as { tag_name: string };
			if (result.tag_name) {
				latestVersion = result.tag_name.replace("v", "");
				success = true;
			}
		}
	} catch {
		// Network error, use fallback
	}

	const resp = new Response(latestVersion, {
		headers: {
			"content-type": "text/plain",
			"Cache-Control": success ? "public, max-age=600" : "public, max-age=60",
		},
	});

	// Only cache successful responses in the CDN cache
	if (success) {
		await cache.put(cacheKey, resp.clone());
	}

	return resp;
}
