// test/index.spec.ts
import {
	env,
	createExecutionContext,
	fetchMock,
	waitOnExecutionContext,
} from "cloudflare:test";
import {
	describe,
	it,
	expect,
	beforeAll,
	beforeEach,
	afterAll,
	afterEach,
} from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

afterEach(() => {
	fetchMock.assertNoPendingInterceptors();
});

// NOTE: These tests make real network requests to GitHub and raw.githubusercontent.com.
// They may fail if those services are unavailable or rate-limited.

// ─── Routing ────────────────────────────────────────────────────────

describe("routing", () => {
	it("returns 404 for unknown paths", async () => {
		const req = new IncomingRequest("https://get.beszel.dev/unknown");
		const ctx = createExecutionContext();
		const res = await worker.fetch(req, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(res.status).toBe(404);
	});

	it("serves agent install script at /", async () => {
		const req = new IncomingRequest("https://get.beszel.dev/");
		const ctx = createExecutionContext();
		const res = await worker.fetch(req, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("text/plain");
		expect(await res.text()).toContain(`description="Beszel Agent Service"`);
	});

	it("serves hub script at /hub", async () => {
		const req = new IncomingRequest("https://get.beszel.dev/hub");
		const ctx = createExecutionContext();
		const res = await worker.fetch(req, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("text/plain");
		expect(await res.text()).toContain(`Description=Beszel Hub Service`);
	});

	it("serves brew script at /brew", async () => {
		const req = new IncomingRequest("https://get.beszel.dev/brew");
		const ctx = createExecutionContext();
		const res = await worker.fetch(req, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("text/plain");
		expect(await res.text()).toContain(`brew services start beszel-agent`);
	});

	it("serves windows script at /windows", async () => {
		const req = new IncomingRequest("https://get.beszel.dev/windows");
		const ctx = createExecutionContext();
		const res = await worker.fetch(req, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("text/plain");
		expect(await res.text()).toContain(`function Install-WithScoop`);
	});

	it("serves upgrade script at /upgrade", async () => {
		const req = new IncomingRequest("https://get.beszel.dev/upgrade");
		const ctx = createExecutionContext();
		const res = await worker.fetch(req, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("text/plain");
		expect(await res.text()).toContain(`function Find-BeszelAgent`);
	});

	it("serves upgrade wrapper at /upgrade-wrapper", async () => {
		const req = new IncomingRequest("https://get.beszel.dev/upgrade-wrapper");
		const ctx = createExecutionContext();
		const res = await worker.fetch(req, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("text/plain");
		expect(await res.text()).toContain(`Beszel Agent Upgrade Wrapper`);
	});

	it("serves windows script for PowerShell user-agent", async () => {
		const req = new IncomingRequest("https://get.beszel.dev/", {
			headers: { "User-Agent": "Mozilla/5.0 (Windows NT; PowerShell/7.4)" },
		});
		const ctx = createExecutionContext();
		const res = await worker.fetch(req, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("text/plain");
		expect(await res.text()).toContain(`function Install-WithScoop`);
	});
});

// ─── getVersion ─────────────────────────────────────────────────────

describe("getVersion", () => {
	it("returns a valid semver version string", async () => {
		const req = new IncomingRequest("https://get.beszel.dev/latest-version");
		const ctx = createExecutionContext();
		const res = await worker.fetch(req, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("public, max-age=43200");
		expect(res.headers.get("content-type")).toBe("text/plain");
		expect(await res.text()).toMatch(/^\d+\.\d+\.\d+$/);
	});
});

// ─── Mocked upstream ────────────────────────────────────────────────

const RELEASE_CACHE_KEY = "https://get.beszel.dev/__cache/latest-release";
const GH_API = "https://api.github.com";
const GH_API_PATH = "/repos/henrygd/beszel/releases/latest";

async function get(url: string, init?: RequestInit) {
	const req = new IncomingRequest(url, init);
	const ctx = createExecutionContext();
	const res = await worker.fetch(req, env, ctx);
	await waitOnExecutionContext(ctx);
	return res;
}

describe("mocked upstream", () => {
	beforeAll(() => {
		fetchMock.activate();
		fetchMock.disableNetConnect();
	});
	beforeEach(async () => {
		await caches.default.delete(RELEASE_CACHE_KEY);
	});
	afterEach(() => fetchMock.assertNoPendingInterceptors());
	afterAll(() => fetchMock.deactivate());

	// ─── /latest-version ───

	describe("/latest-version", () => {
		it("strips v prefix and caches for 12 hours on success", async () => {
			fetchMock
				.get(GH_API)
				.intercept({ path: GH_API_PATH })
				.reply(200, JSON.stringify({ tag_name: "v9.9.9" }));

			const res = await get("https://get.beszel.dev/latest-version");
			expect(await res.text()).toBe("9.9.9");
			expect(res.headers.get("cache-control")).toBe("public, max-age=43200");

			// second request is served from cache (no pending interceptor needed)
			const res2 = await get("https://gh.beszel.dev/latest-version");
			expect(await res2.text()).toBe("9.9.9");
		});

		it("returns fallback version and short cache-control when API returns error", async () => {
			fetchMock
				.get(GH_API)
				.intercept({ path: GH_API_PATH })
				.reply(500, "Internal Server Error");

			const res = await get("https://get.beszel.dev/latest-version");
			expect(await res.text()).toMatch(/^\d+\.\d+\.\d+$/);
			expect(res.headers.get("cache-control")).toBe("public, max-age=60");
		});

		it("returns fallback version and short cache-control on network failure", async () => {
			fetchMock
				.get(GH_API)
				.intercept({ path: GH_API_PATH })
				.replyWithError(new Error("Network failure"));

			const res = await get("https://get.beszel.dev/latest-version");
			expect(await res.text()).toMatch(/^\d+\.\d+\.\d+$/);
			expect(res.headers.get("cache-control")).toBe("public, max-age=60");
		});

		it("does not cache failures", async () => {
			fetchMock
				.get(GH_API)
				.intercept({ path: GH_API_PATH })
				.reply(500, "Internal Server Error");
			await get("https://get.beszel.dev/latest-version");

			fetchMock
				.get(GH_API)
				.intercept({ path: GH_API_PATH })
				.reply(200, JSON.stringify({ tag_name: "v1.2.3" }));
			const res = await get("https://get.beszel.dev/latest-version");
			expect(await res.text()).toBe("1.2.3");
		});
	});

	// ─── /repos/henrygd/beszel/releases/latest ───

	describe("release JSON passthrough", () => {
		it("passes through the GitHub release JSON", async () => {
			const release = {
				tag_name: "v9.9.9",
				assets: [
					{
						name: "beszel-agent_linux_amd64.tar.gz",
						browser_download_url:
							"https://github.com/henrygd/beszel/releases/download/v9.9.9/beszel-agent_linux_amd64.tar.gz",
					},
				],
			};
			fetchMock
				.get(GH_API)
				.intercept({ path: GH_API_PATH })
				.reply(200, JSON.stringify(release));

			const res = await get(
				"https://gh.beszel.dev/repos/henrygd/beszel/releases/latest?api=true",
			);
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toBe("application/json");
			expect(res.headers.get("cache-control")).toBe("public, max-age=43200");
			expect(await res.json()).toEqual(release);
		});

		it("returns 502 when the GitHub API fails", async () => {
			fetchMock
				.get(GH_API)
				.intercept({ path: GH_API_PATH })
				.reply(500, "Internal Server Error");

			const res = await get(
				"https://gh.beszel.dev/repos/henrygd/beszel/releases/latest?api=true",
			);
			expect(res.status).toBe(502);
		});
	});

	// ─── Release downloads ───

	describe("release downloads", () => {
		const TAG = "v9.9.9";
		const FILE = "beszel_9.9.9_checksums.txt";
		const DOWNLOAD_PATH = `/henrygd/beszel/releases/download/${TAG}/${FILE}`;
		const CONTENT = "abc123  beszel-agent_linux_amd64.tar.gz\n";

		it.each([
			"/henrygd/other/releases/download/v9.9.9/beszel_9.9.9_checksums.txt",
			"/henrygd/beszel/releases/download/latest/beszel_9.9.9_checksums.txt",
			"/henrygd/beszel/releases/download/v9.9.9/evil.sh",
			"/henrygd/beszel/releases/download/v9.9.9/beszel-agent_linux_amd64.tar.gz/extra",
		])("returns 404 without fetching for %s", async (path) => {
			const res = await get(`https://gh.beszel.dev${path}`);
			expect(res.status).toBe(404);
		});

		it("fetches from GitHub on R2 miss and stores the asset", async () => {
			fetchMock
				.get("https://github.com")
				.intercept({ path: DOWNLOAD_PATH })
				.reply(200, CONTENT, {
					headers: { "content-length": String(CONTENT.length) },
				});

			const res = await get(`https://gh.beszel.dev${DOWNLOAD_PATH}`);
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toBe("text/plain");
			expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
			expect(await res.text()).toBe(CONTENT);

			const stored = await env.RELEASES.get(`${TAG}/${FILE}`);
			expect(await stored?.text()).toBe(CONTENT);
		});

		it("serves from R2 without contacting GitHub", async () => {
			await env.RELEASES.put(`${TAG}/${FILE}`, CONTENT);

			const res = await get(`https://get.beszel.dev${DOWNLOAD_PATH}`);
			expect(res.status).toBe(200);
			expect(res.headers.get("content-length")).toBe(String(CONTENT.length));
			expect(res.headers.get("etag")).toBeTruthy();
			expect(await res.text()).toBe(CONTENT);
		});

		it("supports HEAD from R2", async () => {
			await env.RELEASES.put(`${TAG}/${FILE}`, CONTENT);

			const res = await get(`https://get.beszel.dev${DOWNLOAD_PATH}`, {
				method: "HEAD",
			});
			expect(res.status).toBe(200);
			expect(res.headers.get("content-length")).toBe(String(CONTENT.length));
		});

		it("passes through upstream 404 and stores nothing", async () => {
			fetchMock
				.get("https://github.com")
				.intercept({ path: DOWNLOAD_PATH })
				.reply(404, "Not Found");

			const res = await get(`https://gh.beszel.dev${DOWNLOAD_PATH}`);
			expect(res.status).toBe(404);
			expect(await env.RELEASES.head(`${TAG}/${FILE}`)).toBeNull();
		});

		it("returns 502 on upstream network failure", async () => {
			fetchMock
				.get("https://github.com")
				.intercept({ path: DOWNLOAD_PATH })
				.replyWithError(new Error("Network failure"));

			const res = await get(`https://gh.beszel.dev${DOWNLOAD_PATH}`);
			expect(res.status).toBe(502);
		});
	});

	// ─── Latest release downloads ───

	describe("latest release downloads", () => {
		const FILE = "beszel_linux_amd64.tar.gz";
		const LATEST_PATH = `/henrygd/beszel/releases/latest/download/${FILE}`;

		it("redirects to the versioned download path of the latest release", async () => {
			fetchMock
				.get(GH_API)
				.intercept({ path: GH_API_PATH })
				.reply(200, JSON.stringify({ tag_name: "v9.9.9" }));

			const res = await get(`https://gh.beszel.dev${LATEST_PATH}`, {
				redirect: "manual",
			});
			expect(res.status).toBe(302);
			expect(res.headers.get("location")).toBe(
				`https://gh.beszel.dev/henrygd/beszel/releases/download/v9.9.9/${FILE}`,
			);
			expect(res.headers.get("cache-control")).toBe("public, max-age=300");
		});

		it("supports HEAD", async () => {
			fetchMock
				.get(GH_API)
				.intercept({ path: GH_API_PATH })
				.reply(200, JSON.stringify({ tag_name: "v9.9.9" }));

			const res = await get(`https://gh.beszel.dev${LATEST_PATH}`, {
				method: "HEAD",
				redirect: "manual",
			});
			expect(res.status).toBe(302);
		});

		it.each([
			"/henrygd/beszel/releases/latest/download/evil.sh",
			`/henrygd/other/releases/latest/download/${FILE}`,
			`/henrygd/beszel/releases/latest/download/${FILE}/extra`,
		])("returns 404 without fetching for %s", async (path) => {
			const res = await get(`https://gh.beszel.dev${path}`);
			expect(res.status).toBe(404);
		});

		it("returns 502 when the latest release can't be fetched", async () => {
			fetchMock
				.get(GH_API)
				.intercept({ path: GH_API_PATH })
				.reply(500, "Internal Server Error");

			const res = await get(`https://gh.beszel.dev${LATEST_PATH}`);
			expect(res.status).toBe(502);
			expect(res.headers.get("cache-control")).toBe("no-store");
		});

		it("rejects non-GET methods", async () => {
			const res = await get(`https://gh.beszel.dev${LATEST_PATH}`, {
				method: "POST",
			});
			expect(res.status).toBe(405);
		});
	});
});
