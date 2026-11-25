# get-beszel

A Cloudflare Worker for [Beszel](https://github.com/henrygd/beszel) that serves:

- **get.beszel.dev**: the installation scripts and the latest version number.
- **gh.beszel.dev**: a GitHub mirror for release downloads, used by the install scripts' `--mirror` option and the updater's `--china-mirrors` option. Release assets are stored in R2.

Both hostnames are served by the same worker, so every endpoint works on either.

## Installation

```bash
bun i
```

## Development

```bash
bun run dev
```

## Testing

```bash
bun run test
```

Most tests mock GitHub. The routing tests and one `/latest-version` test make real requests to GitHub and raw.githubusercontent.com.

## Endpoints

### Install scripts

Fetched from the `main` branch of the Beszel repo (`supplemental/scripts`) and cached for 5 minutes.

| Endpoint | Description |
|----------|-------------|
| `GET /` | Returns Linux agent script (or Windows script if User-Agent contains `powershell`) |
| `GET /hub` | Returns hub installation script (Linux) |
| `GET /brew` | Returns Homebrew agent installation script (macOS/Linux) |
| `GET /windows` | Returns Windows agent installation script |
| `GET /upgrade` | Returns Windows agent upgrade script |
| `GET /upgrade-wrapper` | Returns Windows agent upgrade wrapper script |

### Latest release

| Endpoint | Description |
|----------|-------------|
| `GET /latest-version` | Returns the latest Beszel version number without the `v` prefix (e.g. `0.21.2`). If GitHub can't be reached, it returns a hardcoded fallback version and caches it for only 60 seconds. |
| `GET /repos/henrygd/beszel/releases/latest` | Returns the GitHub API JSON for the latest release, unchanged. The updater's `--china-mirrors` option uses this with `?api=true`. Returns 502 if GitHub can't be reached. |

Both endpoints share one lookup of the latest release. It is cached for 10 minutes, so a new release appears within about 10 minutes of publishing.

### Release downloads

These paths match github.com's, so gh.beszel.dev can be swapped in for `https://github.com` in a download URL.

| Endpoint | Description |
|----------|-------------|
| `GET /henrygd/beszel/releases/download/<tag>/<file>` | Returns a release asset. On the first request the asset is fetched from GitHub, streamed to the client and stored in R2. Later requests are served from R2. Supports `HEAD`. |
| `GET /henrygd/beszel/releases/latest/download/<file>` | Redirects (302) to the download path above for the latest release's tag. The hub install script uses this. |

Only Beszel archives (`.tar.gz`, `.zip`, `.deb`) and the `checksums.txt` file are served, for tags like `v1.2.3` or `v1.2.3-beta1`. Any other path returns 404.

Release assets never change, so objects in R2 are never invalidated. Nothing removes them either. If an object is deleted from the bucket, the next request fetches it from GitHub again.

## Deployment

```bash
bun run deploy
```

The worker needs the following Cloudflare resources:

- **R2 bucket** `beszel-releases`, bound as `RELEASES` (see `wrangler.jsonc`). The bucket must exist before deploying:

  ```bash
  bunx wrangler r2 bucket create beszel-releases
  ```

- **Custom domains** `get.beszel.dev` and `gh.beszel.dev`, configured in `wrangler.jsonc`.
- **`GITHUB_TOKEN` secret** (optional, recommended): a GitHub token sent with requests to the GitHub API. It raises the rate limit from 60 to 5,000 requests per hour. A fine-grained token with read-only access to public repositories and no other permissions is enough. Without it, requests are sent unauthenticated.

  ```bash
  bunx wrangler secret put GITHUB_TOKEN
  ```

  For local development, add `GITHUB_TOKEN=...` to `.dev.vars`, which is gitignored.
