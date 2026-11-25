/**
 * Release asset mirror: GET /henrygd/beszel/releases/download/<tag>/<file>
 *
 * Mirrors the github.com download path so it works as a drop-in replacement for
 * `$GITHUB_URL` in the install scripts and for the updater's `--china-mirrors`
 * (which swaps github.com for gh.beszel.dev in `browser_download_url`).
 *
 * Assets are served from R2. On a miss, the asset is fetched from GitHub once,
 * streamed to the client and stored in R2 in the background. Release assets are
 * immutable, so stored objects never need invalidating.
 */

import { getLatestTag } from "./release";

const DOWNLOAD_PATH = /^\/henrygd\/beszel\/releases\/download\/([^/]+)\/([^/]+)$/;
const LATEST_DOWNLOAD_PATH =
	/^\/henrygd\/beszel\/releases\/latest\/download\/([^/]+)$/;
const VALID_TAG = /^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;
const VALID_FILES = [
	/^beszel(-agent)?_[a-z0-9._]+\.(tar\.gz|zip|deb)$/,
	/^beszel_[0-9A-Za-z.-]+_checksums\.txt$/,
];

const RESPONSE_CACHE_CONTROL = "public, max-age=86400";

export function isDownloadPath(path: string): boolean {
	return DOWNLOAD_PATH.test(path);
}

export function isLatestDownloadPath(path: string): boolean {
	return LATEST_DOWNLOAD_PATH.test(path);
}

function isValidFile(file: string): boolean {
	return VALID_FILES.some((re) => re.test(file));
}

function methodNotAllowed(): Response {
	return new Response("Method Not Allowed", {
		status: 405,
		headers: { allow: "GET, HEAD" },
	});
}

function contentType(file: string): string {
	return file.endsWith(".txt") ? "text/plain" : "application/octet-stream";
}

/**
 * Copies a stream chunk by chunk. workerd doesn't implement pipeTo() from a
 * tee()'d branch into a FixedLengthStream, so this is done manually.
 */
async function copyStream(
	source: ReadableStream<Uint8Array>,
	dest: WritableStream<Uint8Array>,
): Promise<void> {
	const reader = source.getReader();
	const writer = dest.getWriter();
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			await writer.write(value);
		}
		await writer.close();
	} catch (err) {
		await writer.abort(err).catch(() => {});
		throw err;
	}
}

function notFound(): Response {
	return new Response("Not Found", { status: 404 });
}

export async function handleDownload(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
): Promise<Response> {
	if (request.method !== "GET" && request.method !== "HEAD") {
		return methodNotAllowed();
	}

	const match = DOWNLOAD_PATH.exec(new URL(request.url).pathname);
	if (!match) {
		return notFound();
	}
	const [, tag, file] = match;
	if (!VALID_TAG.test(tag) || !isValidFile(file)) {
		return notFound();
	}

	const key = `${tag}/${file}`;
	const isHead = request.method === "HEAD";

	// Serve from R2 if we already have the asset
	const stored = isHead
		? await env.RELEASES.head(key)
		: await env.RELEASES.get(key);
	if (stored) {
		const headers = new Headers({
			"content-type": contentType(file),
			"content-length": String(stored.size),
			etag: stored.httpEtag,
			"Cache-Control": RESPONSE_CACHE_CONTROL,
		});
		const body = isHead ? null : (stored as R2ObjectBody).body;
		return new Response(body, { headers });
	}

	// Miss: fetch from GitHub (follows the redirect to the asset host)
	const upstreamUrl = `https://github.com/henrygd/beszel/releases/download/${tag}/${file}`;
	let upstream: Response;
	try {
		upstream = await fetch(upstreamUrl, {
			method: request.method,
			headers: { "user-agent": "get-beszel" },
		});
	} catch {
		return new Response("Error fetching release asset", { status: 502 });
	}

	if (!upstream.ok) {
		const status = upstream.status === 404 ? 404 : 502;
		return new Response(status === 404 ? "Not Found" : "Upstream error", {
			status,
		});
	}

	const headers = new Headers({
		"content-type": contentType(file),
		"Cache-Control": RESPONSE_CACHE_CONTROL,
	});
	const length = Number(upstream.headers.get("content-length"));
	if (length > 0) {
		headers.set("content-length", String(length));
	}

	if (isHead || !upstream.body) {
		return new Response(null, { headers });
	}

	// Without a known length R2 can't accept the stream; just pass it through
	if (!(length > 0)) {
		return new Response(upstream.body, { headers });
	}

	const [clientBody, storeBody] = upstream.body.tee();
	const fixed = new FixedLengthStream(length);
	ctx.waitUntil(
		Promise.all([
			copyStream(storeBody, fixed.writable),
			env.RELEASES.put(key, fixed.readable, {
				httpMetadata: { contentType: contentType(file) },
			}),
		]).catch((err) => {
			console.error(`failed to store ${key} in R2`, err);
		}),
	);

	return new Response(clientBody, { headers });
}

/**
 * GET /henrygd/beszel/releases/latest/download/<file>
 *
 * Like github.com, redirects to the asset in the latest release, so the
 * download itself is served (and stored in R2) under its versioned path.
 * Used by the hub install script with --mirror.
 */
export async function handleLatestDownload(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "GET" && request.method !== "HEAD") {
		return methodNotAllowed();
	}

	const url = new URL(request.url);
	const match = LATEST_DOWNLOAD_PATH.exec(url.pathname);
	if (!match || !isValidFile(match[1])) {
		return notFound();
	}

	const tag = await getLatestTag(env);
	if (!tag || !VALID_TAG.test(tag)) {
		return new Response("Failed to fetch latest release", {
			status: 502,
			headers: { "Cache-Control": "no-store" },
		});
	}

	const location = new URL(
		`/henrygd/beszel/releases/download/${tag}/${match[1]}`,
		url,
	);
	return new Response(null, {
		status: 302,
		headers: {
			location: location.toString(),
			"Cache-Control": "public, max-age=300",
		},
	});
}
