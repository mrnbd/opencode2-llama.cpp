# opencode-llama-cpp

OpenCode V2 plugin for enhanced llama.cpp support with auto-detection, dynamic model discovery, and enriched model metadata.

> **Note**: The migration to the OpenCode V2 API (and related development work) was carried out with the assistance of AI tools. Code correctness and behavior should be reviewed before production use.

## Features

- **Auto-detection**: Automatically detects a llama.cpp server running on common ports (1234, 8080, 11434)
- **Dynamic Model Discovery**: Queries llama.cpp's `/v1/models` endpoint and registers discovered models into the OpenCode catalog (V2 API)
- **Enriched Model Metadata**:
  - Human-readable display names, preferring the name provided by the API (e.g., "Qwen3 30B A3B" instead of "qwen/qwen3-30b-a3b")
  - Context limit from `context_length` / `context_window`
  - Output limit from llama-swap metadata when available
  - Release date from the model's `created` field
  - Tool support detection (`function_calling` / `tools` parameter)
  - Input/output modalities, with embedding models classified accordingly
- **Organization Owner Extraction**: Extracts and sets the `organizationOwner` field from model IDs
- **Model Validation**: A session context hook verifies that the selected model is actually loaded on the server (with retry/backoff) and adds a system warning to the prompt if it is not
- **Periodic Refresh**: Re-discovers models every 60 seconds and reloads the catalog
- **Health Check Monitoring**: Verifies the llama.cpp server is accessible before attempting operations
- **Caching**: A single shared model status cache reduces redundant API calls
- **Error Handling**: Smart error categorization with actionable messages
- **Logging**: Centralized logger with an `[opencode-llama-cpp]` prefix; set `DEBUG=1` for verbose debug output

## Installation

```bash
pnpm add opencode-plugin-llama.cpp
```

## Usage

Add the plugin to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-plugin-llama.cpp"
  ],
  "providers": {
    "llama.cpp": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "llama.cpp (local)",
      "settings": {
        "baseURL": "http://127.0.0.1:1234"
      }
    }
  }
}
```

Both configuration formats are supported:

- **V1**: `provider` with `options.baseURL`
- **V2**: `providers` with `settings.baseURL`

`baseURL` may include or omit the `/v1` suffix — it is normalized automatically.

### Auto-detection

If you don't configure the `llama.cpp` provider, the plugin will automatically detect a llama.cpp server on one of the common ports and register the provider configuration for you.

### Manual Configuration

You can also manually configure the provider with specific models:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-plugin-llama.cpp"
  ],
  "providers": {
    "llama.cpp": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "llama.cpp (local)",
      "settings": {
        "baseURL": "http://127.0.0.1:1234"
      }
    }
  }
}
```

The plugin will automatically discover and register any additional models available on the llama.cpp server that aren't already configured.

## How It Works

1. On OpenCode startup, the plugin's `setup` function runs and resolves the llama.cpp base URL:
   1. It reads `opencode.json` / `opencode.jsonc` files (global and project-level), supporting both V1 (`provider.options.baseURL`) and V2 (`providers.settings.baseURL`) formats
   2. If not found, it falls back to the OpenCode provider catalog
   3. If still not found, it auto-detects a llama.cpp server on localhost ports 1234, 8080, and 11434
2. If a server is found, its health is checked via the `/v1/models` endpoint
3. Discovered models are registered into the `llama.cpp` provider in the OpenCode catalog, enriched with metadata (display name, limits, capabilities, modalities, organization owner)
4. Models are re-discovered every 60 seconds and the catalog is reloaded
5. On every chat request, a session context hook validates that the selected model is loaded on the server (with retry/backoff); if validation fails, a warning is added to the system prompt

## Debugging

Set the `DEBUG` environment variable to enable verbose logging:

```bash
DEBUG=1 opencode
```

Log lines are prefixed with `[opencode-llama-cpp]`.

## Requirements

- OpenCode (V2)
- llama.cpp server running locally (default port: 1234)
- Node.js 18+ (global `fetch`)

## Development

The project uses pnpm exclusively.

```bash
pnpm install        # install dependencies
pnpm test           # run unit tests (157 tests, ~68% coverage)
pnpm test:coverage  # run tests with coverage report
pnpm validate       # lint + typecheck + tests
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
