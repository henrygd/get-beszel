# get-beszel

A Cloudflare Worker that serves installation scripts for [Beszel](https://github.com/henrygd/beszel).

## Installation

```bash
bun i
```

## Development

```bash
bun run dev
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Returns Linux agent script (or Windows script if User-Agent contains `powershell`) |
| `GET /hub` | Returns hub installation script (Linux) |
| `GET /brew` | Returns Homebrew agent installation script (macOS/Linux) |
| `GET /windows` | Returns Windows agent installation script |
| `GET /upgrade` | Returns Windows agent upgrade script |
| `GET /upgrade-wrapper` | Returns Windows agent upgrade wrapper script |
| `GET /latest-version` | Returns the latest Beszel version number |
