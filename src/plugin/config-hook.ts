import type {Plugin} from "@opencode/plugin"

type PluginContext = Plugin.Context
import {existsSync, readFileSync} from 'fs'
import {join} from 'path'
import stripJsonComments from 'strip-json-comments'
import {ModelStatusCache} from '../cache/model-status-cache'
import {categorizeModel, extractModelOwner, formatModelName} from '../utils'
import {autoDetectLlamaCpp, checkLlamaCppHealth, discoverLlamaCppModels, normalizeBaseURL} from '../utils/llama-cpp-api'
import type {LlamaCppModel} from '../types'
import {log} from '../utils/log'

const modelStatusCache = new ModelStatusCache()

// Default llama.cpp URL
const DEFAULT_LLAMA_CPP_URL = "http://127.0.0.1:1234"

// Cached baseURL after initial detection — never re-read config after startup
let cachedBaseURL: string | null = null

// Read baseURL from opencode.json config files
function readBaseURLFromConfig(): string | null {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    const cwd = process.cwd()

    const configPaths = [
        join(home, '.config/opencode/opencode.json'),
        join(home, '.config/opencode/opencode.jsonc'),
        join(cwd, 'opencode.json'),
        join(cwd, 'opencode.jsonc'),
        join(cwd, '.opencode/opencode.json'),
        join(cwd, '.opencode/opencode.jsonc'),
    ]

    log.debug(`Searching config in: HOME=${home}, CWD=${cwd}`)

    for (const configPath of configPaths) {
        if (!existsSync(configPath)) {
            log.debug(`Config not found: ${configPath}`)
            continue
        }

        log.debug(`Reading config: ${configPath}`)

        try {
            const raw = readFileSync(configPath, 'utf-8')
            const cleaned = stripJsonComments(raw).replace(/,\s*([\]}])/g, '$1')
            const config = JSON.parse(cleaned)

            // V2 format: providers
            const providerV2 = config.providers?.['llama.cpp']
            if (providerV2?.settings?.baseURL) {
                log.debug(`Found baseURL in ${configPath} (V2)`)
                return providerV2.settings.baseURL
            }

            // V1 format: provider
            const providerV1 = config.provider?.['llama.cpp']
            if (providerV1?.settings?.baseURL) {
                log.debug(`Found baseURL in ${configPath} (V1 settings)`)
                return providerV1.settings.baseURL
            }
            if (providerV1?.options?.baseURL) {
                log.debug(`Found baseURL in ${configPath} (V1 options)`)
                return providerV1.options.baseURL
            }
        } catch (e) {
            log.warn(`Failed to parse ${configPath}`, {error: String(e)})
        }
    }

    return null
}

export async function createConfigHook(ctx: PluginContext): Promise<(() => Promise<void>) | void> {
    try {
        // Try to detect and register llama.cpp provider
        await detectAndRegister(ctx)

        // Set up periodic refresh (uses cachedBaseURL — no config re-read)
        const refreshInterval = setInterval(() => {
            refreshModels(ctx).catch((error) => {
                log.warn("Periodic refresh failed", {error: String(error)})
            })
        }, 60_000) // Refresh every 60 seconds

        return async () => {
            clearInterval(refreshInterval)
        }
    } catch (error) {
        log.error("Failed to initialize config hook", {error: String(error)})
    }
}

async function detectAndRegister(ctx: PluginContext): Promise<void> {
    let baseURL: string | null = null

    // 1. Try reading from config files directly (startup only)
    baseURL = readBaseURLFromConfig()

    // 2. Try catalog (if OpenCode loaded the provider)
    if (!baseURL) {
        try {
            const existingProviders = await ctx.catalog.provider.list()
            log.debug("Catalog providers", {providers: existingProviders.data?.map((p: any) => p.id)})
            const existingProvider = existingProviders.data?.find(
                (p: any) => p.id === 'llama.cpp'
            )
            if (existingProvider) {
                baseURL = normalizeBaseURL(
                    (existingProvider as any).settings?.baseURL || DEFAULT_LLAMA_CPP_URL
                )
            }
        } catch (e) {
            log.warn("Failed to read catalog", {error: String(e)})
        }
    }

    // 3. Auto-detect on localhost
    if (!baseURL) {
        log.debug("Trying auto-detect on localhost...")
        const detectedURL = await autoDetectLlamaCpp()
        if (detectedURL) {
            baseURL = detectedURL
        }
    }

    if (!baseURL) {
        log.warn("No llama.cpp server found")
        return
    }

    log.info(`Using baseURL: ${baseURL}`)

    // Cache for subsequent refresh cycles
    cachedBaseURL = normalizeBaseURL(baseURL)

    // Check health
    const isHealthy = await checkLlamaCppHealth(baseURL)
    if (!isHealthy) {
        log.warn("llama.cpp appears to be offline", {baseURL})
        return
    }

    // Discover and register models
    await discoverAndRegister(ctx, baseURL)
}

function applyModelInfo(model: LlamaCppModel, modelInfo: any) {
    modelInfo.name = formatModelName(model)

    const owner = extractModelOwner(model.id)
    if (owner) {
        modelInfo.organizationOwner = owner
    }

    const contextSize = model.context_length || model.context_window
    if (contextSize) {
        modelInfo.limit = {
            ...modelInfo.limit,
            context: contextSize,
        }
    }

    const outputSize = model.meta?.llamaswap?.limit?.output
    if (outputSize) {
        modelInfo.limit = {
            ...modelInfo.limit,
            output: outputSize,
        }
    }

    if (model.created) {
        modelInfo.time = {
            ...modelInfo.time,
            released: model.created,
        }
    }

    const supportsTools = model.capabilities?.function_calling === true
        || model.supported_parameters?.includes("tools") === true
    modelInfo.capabilities = {
        ...modelInfo.capabilities,
        tools: supportsTools,
    }

    const modelType = categorizeModel(model.id)
    if (modelType === 'embedding') {
        modelInfo.capabilities.input = ["text"]
        modelInfo.capabilities.output = ["embedding"]
    } else if (modelType === 'chat') {
        const inputModalities = model.architecture?.input_modalities
        if (inputModalities && inputModalities.length > 0) {
            modelInfo.capabilities.input = inputModalities
        } else {
            const hasVision = model.capabilities?.vision === true
            const input = ["text"]
            if (hasVision) input.push("image")
            modelInfo.capabilities.input = input
        }
        modelInfo.capabilities.output = ["text"]
    }
}

async function discoverAndRegister(ctx: PluginContext, baseURL: string): Promise<void> {
    let models: LlamaCppModel[]
    try {
        models = await discoverLlamaCppModels(baseURL)
    } catch (error) {
        log.warn("Model discovery failed", {
            error: error instanceof Error ? error.message : String(error)
        })
        return
    }

    if (models.length === 0) {
        log.warn("No models found in llama.cpp")
        return
    }

    await ctx.catalog.transform((catalog) => {
        catalog.provider.update("llama.cpp", (provider: any) => {
            provider.name = "llama.cpp (local)"
            provider.settings = {
                ...provider.settings,
                baseURL: `${normalizeBaseURL(baseURL)}/v1`,
            }
        })

        for (const model of models) {
            catalog.model.update("llama.cpp", model.id, (modelInfo: any) => {
                applyModelInfo(model, modelInfo)
            })
        }
    })

    log.info(`Discovered ${models.length} models from llama.cpp`)

    // Warm up cache
    try {
        await modelStatusCache.getModels(baseURL, async () => {
            return models.map(m => m.id)
        })
    } catch {
        // Cache warming failed, not critical
    }
}

async function refreshModels(ctx: PluginContext): Promise<void> {
    // Use cached baseURL — never re-read config after startup
    let baseURL = cachedBaseURL

    // Fallback to catalog only if cache is empty (shouldn't happen after startup)
    if (!baseURL) {
        try {
            const providers = await ctx.catalog.provider.list()
            const provider = providers.data?.find((p: any) => p.id === 'llama.cpp')
            if (provider) {
                baseURL = normalizeBaseURL(
                    (provider as any).settings?.baseURL || DEFAULT_LLAMA_CPP_URL
                )
            }
        } catch {
            // Catalog read failed
        }
    }

    if (!baseURL) return

    // Check health
    const isHealthy = await checkLlamaCppHealth(baseURL)
    if (!isHealthy) return

    // Discover and register models
    try {
        const models = await discoverLlamaCppModels(baseURL)
        if (models.length > 0) {
            await ctx.catalog.transform((catalog) => {
                for (const model of models) {
                    catalog.model.update("llama.cpp", model.id, (modelInfo: any) => {
                        applyModelInfo(model, modelInfo)
                    })
                }
            })

            await ctx.catalog.reload()
        }
    } catch (error) {
        log.warn("Refresh failed", {error: String(error)})
    }
}
