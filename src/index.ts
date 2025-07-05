/**
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return handleRequest(request);
	},
} satisfies ExportedHandler<Env>;

const validPaths = new Set(['/', '/hub', '/brew', '/windows']);

async function handleRequest(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname
	// Return 404 if not root url
	if (!validPaths.has(path)) {
		return new Response('Not Found', { status: 404 });
	}

	// Get user agent and determine script URL (default is agent linux script)
	let resource = 'install-agent.sh';

	if (path === '/hub') {
		// Return hub script if url is hu
		resource = 'install-hub.sh';
	} else if (path === '/brew') {
		// Return brew script if url is brew
		resource = 'install-agent-brew.sh'
	} else {
		// Return Windows script if user agent includes powershell
		const userAgent = request.headers.get('User-Agent')?.toLowerCase() || '';
		if (path === '/windows' || userAgent.includes('powershell')) {
			resource = 'install-agent.ps1';
		}
	}
	
	// Change resource to beta script if beta param is present
	const beta = url.searchParams.get('beta')
	if (beta === '1' || beta === 'true') {
		resource = resource.replace('.', '-beta.');
	}

	const originScriptUrl = `https://raw.githubusercontent.com/henrygd/beszel/main/supplemental/scripts/${resource}`;

	try {
		// Fetch the script from the external URL
		const externalResponse = await fetch(originScriptUrl, {
			cf: {
				cacheTtl: 600, // cache for 10 minutes
				cacheKey: resource,
			},
		});

		// Create new headers, removing Content-Disposition and setting Content-Type
		const newHeaders = new Headers();
		for (const [key, value] of externalResponse.headers) {
			if (key.toLowerCase() !== 'content-disposition') {
				newHeaders.set(key, value);
				newHeaders.set('Cache-Control', 'public, max-age=600');
			}
		}
		newHeaders.set('Content-Type', 'text/plain');

		// Return the response with modified headers
		const response = new Response(externalResponse.body, {
			status: externalResponse.status,
			statusText: externalResponse.statusText,
			headers: newHeaders,
			cf: {
				cacheTtl: 600, // cache for 10 minutes
			},
		});

		return response;
	} catch (error) {
		return new Response('Error fetching script', { status: 500 });
	}
}
