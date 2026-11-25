// Secrets aren't in wrangler.jsonc, so `wrangler types` doesn't know about them.
declare namespace Cloudflare {
	interface Env {
		/**
		 * Optional GitHub token for api.github.com requests (raises the rate limit
		 * from 60 to 5,000 requests per hour). Set with `wrangler secret put GITHUB_TOKEN`.
		 */
		GITHUB_TOKEN?: string;
	}
}
