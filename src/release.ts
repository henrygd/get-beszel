export const FALLBACK_VERSION = "0.21.2";

/** Cache successful release lookups for 12 hours. */
export const CACHE_TTL = 43200;

const GITHUB_API_URL =
	"https://api.github.com/repos/henrygd/beszel/releases/latest";
const CACHE_KEY = "https://get.beszel.dev/__cache/latest-release";

/**
 * Returns the raw JSON body of the latest GitHub release, or null if it could
 * not be fetched. Successful lookups are cached in the CDN cache for CACHE_TTL.
 */
async function getLatestRelease(): Promise<string | null> {
	const cache = caches.default;
	const cached = await cache.match(CACHE_KEY);
	if (cached) {
		return cached.text();
	}

	try {
		const response = await fetch(GITHUB_API_URL, {
			headers: {
				accept: "application/vnd.github+json",
				"user-agent": "get-beszel",
			},
			cf: {
				cacheTtl: CACHE_TTL,
				cacheKey: GITHUB_API_URL,
			},
		});
		if (!response.ok) {
			return null;
		}
		const body = await response.text();
		const release = JSON.parse(body) as { tag_name?: unknown };
		if (typeof release.tag_name !== "string" || !release.tag_name) {
			return null;
		}
		await cache.put(
			CACHE_KEY,
			new Response(body, {
				headers: {
					"content-type": "application/json",
					"Cache-Control": `public, max-age=${CACHE_TTL}`,
				},
			}),
		);
		return body;
	} catch {
		// Network error or invalid JSON
		return null;
	}
}

/** Returns the latest release tag (e.g. "v0.21.2"), or null if it could not be fetched. */
export async function getLatestTag(): Promise<string | null> {
	const body = await getLatestRelease();
	return body ? (JSON.parse(body) as { tag_name: string }).tag_name : null;
}

/** GET /latest-version: the latest version number without the "v" prefix. */
export async function getVersion(): Promise<Response> {
	const body = await getLatestRelease();
	let version: string | null = null;
	if (body) {
		const tag = (JSON.parse(body) as { tag_name: string }).tag_name;
		version = tag.replace(/^v/, "");
	}
	return new Response(version ?? FALLBACK_VERSION, {
		headers: {
			"content-type": "text/plain",
			"Cache-Control": version
				? `public, max-age=${CACHE_TTL}`
				: "public, max-age=60",
		},
	});
}

/**
 * GET /repos/henrygd/beszel/releases/latest: GitHub API release JSON passthrough,
 * used by the agent/hub updater with --china-mirrors (gh.beszel.dev).
 */
export async function getReleaseJson(): Promise<Response> {
	const body = await getLatestRelease();
	if (!body) {
		return new Response("Failed to fetch latest release", {
			status: 502,
			headers: { "Cache-Control": "no-store" },
		});
	}
	return new Response(body, {
		headers: {
			"content-type": "application/json",
			"Cache-Control": `public, max-age=${CACHE_TTL}`,
		},
	});
}
