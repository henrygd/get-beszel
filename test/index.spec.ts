// test/index.spec.ts
import {
	env,
	createExecutionContext,
	fetchMock,
	waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
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
		expect(res.headers.get("cache-control")).toMatch(/^public, max-age=\d+$/);
		expect(res.headers.get("content-type")).toBe("text/plain");
		expect(await res.text()).toMatch(/^\d+\.\d+\.\d+$/);
	});
});

// ─── getVersion (mocked) ─────────────────────────────────────────────────────

describe("getVersion (mocked)", () => {
	beforeAll(() => {
		fetchMock.activate();
		fetchMock.disableNetConnect();
	});
	afterEach(() => fetchMock.assertNoPendingInterceptors());
	afterAll(() => fetchMock.deactivate());

	it("strips v prefix and returns long cache-control on success", async () => {
		// fetchMock
		// 	.get("https://api.github.com")
		// 	.intercept({ path: "/repos/henrygd/beszel/releases/latest" })
		// 	.reply(200, JSON.stringify({ tag_name: "v9.9.9" }));
		fetchMock
			.get("https://gh.beszel.dev")
			.intercept({ path: "/repos/henrygd/beszel/releases/latest?api=true" })
			.reply(200, JSON.stringify({ tag_name: "v9.9.9" }));

		const req = new IncomingRequest("https://get.beszel.dev/latest-version");
		const ctx = createExecutionContext();
		const res = await worker.fetch(req, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(await res.text()).toBe("9.9.9");
		expect(res.headers.get("cache-control")).toBe("public, max-age=600");
	});

	it("returns fallback version and short cache-control when API returns error", async () => {
		// fetchMock
		// 	.get("https://api.github.com")
		// 	.intercept({ path: "/repos/henrygd/beszel/releases/latest" })
		// 	.reply(500, "Internal Server Error");
		fetchMock
			.get("https://gh.beszel.dev")
			.intercept({ path: "/repos/henrygd/beszel/releases/latest?api=true" })
			.reply(500, "Internal Server Error");

		const req = new IncomingRequest("https://get.beszel.dev/latest-version");
		const ctx = createExecutionContext();
		const res = await worker.fetch(req, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(await res.text()).toMatch(/^\d+\.\d+\.\d+$/);
		expect(res.headers.get("cache-control")).toBe("public, max-age=60");
	});

	it("returns fallback version and short cache-control on network failure", async () => {
		// fetchMock
		// 	.get("https://api.github.com")
		// 	.intercept({ path: "/repos/henrygd/beszel/releases/latest" })
		// 	.replyWithError(new Error("Network failure"));
		fetchMock
			.get("https://gh.beszel.dev")
			.intercept({ path: "/repos/henrygd/beszel/releases/latest?api=true" })
			.replyWithError(new Error("Network failure"));

		const req = new IncomingRequest("https://get.beszel.dev/latest-version");
		const ctx = createExecutionContext();
		const res = await worker.fetch(req, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(await res.text()).toMatch(/^\d+\.\d+\.\d+$/);
		expect(res.headers.get("cache-control")).toBe("public, max-age=60");
	});
});
