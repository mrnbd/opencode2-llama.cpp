// Core types for llama.cpp plugin
export interface LlamaCppModelArchitecture {
    input_modalities?: string[]
}

export interface LlamaCppModelCapabilities {
    function_calling?: boolean
    vision?: boolean
}

export interface LlamaCppModel {
    id: string
    object: string
    created: number
    owned_by: string
    name?: string
    context_length?: number
    context_window?: number
    architecture?: LlamaCppModelArchitecture
    capabilities?: LlamaCppModelCapabilities
    supported_parameters?: string[]
    meta?: {
        llamaswap?: {
            limit?: {
                output?: number
            }
        }
    }
}

export interface LlamaCppModelsResponse {
    object: string
    data: LlamaCppModel[]
}

export type ModelType = 'chat' | 'embedding' | 'unknown'

export interface ModelValidationError {
    type: 'offline' | 'not_found' | 'network' | 'permission' | 'timeout' | 'unknown'
    severity: 'low' | 'medium' | 'high' | 'critical'
    message: string
    canRetry: boolean
    autoFixAvailable: boolean
}

export interface AutoFixSuggestion {
    action: string
    command?: string
    steps?: string[]
    automated: boolean
}

export interface SimilarModel {
    model: string
    similarity: number
    reason: string
}

export interface CacheStats {
    size: number
    entries: Array<{
        baseURL: string
        age: number
        modelCount: number
        ttl: number
    }>
}
