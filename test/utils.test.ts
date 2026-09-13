import {describe, expect, it, vi, beforeEach} from 'vitest'
import {
    categorizeModel,
    findSimilarModels,
    categorizeError,
    generateAutoFixSuggestions,
    retryWithBackoff,
} from '../src/utils'

describe('categorizeModel', () => {
    it('should identify embedding models', () => {
        expect(categorizeModel('nomic-embed-text')).toBe('embedding')
        expect(categorizeModel('bge-embedding-large')).toBe('embedding')
        expect(categorizeModel('EMBED-model')).toBe('embedding')
    })

    it('should identify chat models', () => {
        expect(categorizeModel('llama-3-8b')).toBe('chat')
        expect(categorizeModel('qwen/qwen3-30b')).toBe('chat')
        expect(categorizeModel('gpt-4o-mini')).toBe('chat')
        expect(categorizeModel('claude-3-haiku')).toBe('chat')
        expect(categorizeModel('mistral-7b')).toBe('chat')
        expect(categorizeModel('gemma-2-9b')).toBe('chat')
        expect(categorizeModel('phi-3-mini')).toBe('chat')
        expect(categorizeModel('falcon-7b')).toBe('chat')
    })

    it('should return unknown for unrecognized models', () => {
        expect(categorizeModel('some-random-model')).toBe('unknown')
        expect(categorizeModel('custom-model')).toBe('unknown')
    })

    it('should be case-insensitive', () => {
        expect(categorizeModel('LLAMA-3-8B')).toBe('chat')
        expect(categorizeModel('NOMIC-EMBED')).toBe('embedding')
    })
})

describe('findSimilarModels', () => {
    const available = [
        'llama-3-8b',
        'llama-3-70b',
        'qwen/qwen3-30b',
        'mistral-7b',
        'nomic-embed-text',
    ]

    it('should return exact match first', () => {
        const results = findSimilarModels('llama-3-8b', available)
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].model).toBe('llama-3-8b')
        expect(results[0].similarity).toBe(1.0)
    })

    it('should find models from same family', () => {
        const results = findSimilarModels('llama-3-70b', available)
        const llamaModels = results.filter(r => r.model.startsWith('llama'))
        expect(llamaModels.length).toBeGreaterThanOrEqual(2)
    })

    it('should return empty for completely unrelated model', () => {
        const results = findSimilarModels('zzz-999-aaa', available)
        expect(results).toHaveLength(0)
    })

    it('should limit results to 5', () => {
        const manyModels = Array.from({length: 10}, (_, i) => `model-${i}`)
        const results = findSimilarModels('model-0', manyModels)
        expect(results.length).toBeLessThanOrEqual(5)
    })

    it('should return empty for empty available models', () => {
        const results = findSimilarModels('llama-3-8b', [])
        expect(results).toHaveLength(0)
    })

    it('should be case-insensitive', () => {
        const results = findSimilarModels('LLAMA-3-8B', available)
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].model).toBe('llama-3-8b')
    })
})

describe('categorizeError', () => {
    const context = {baseURL: 'http://localhost:1234', modelId: 'test-model'}

    it('should categorize connection refused as offline', () => {
        const result = categorizeError('Fetch failed: connect ECONNREFUSED', context)
        expect(result.type).toBe('offline')
        expect(result.severity).toBe('critical')
        expect(result.canRetry).toBe(true)
        expect(result.autoFixAvailable).toBe(true)
    })

    it('should categorize network error as offline', () => {
        const result = categorizeError('network error occurred', context)
        expect(result.type).toBe('offline')
    })

    it('should categorize timeout', () => {
        const result = categorizeError('Request timeout', context)
        expect(result.type).toBe('timeout')
        expect(result.severity).toBe('medium')
        expect(result.canRetry).toBe(true)
    })

    it('should categorize abort as timeout', () => {
        const result = categorizeError('The operation was aborted', context)
        expect(result.type).toBe('timeout')
    })

    it('should categorize 404 as not_found', () => {
        const result = categorizeError('HTTP 404 not found', context)
        expect(result.type).toBe('not_found')
        expect(result.severity).toBe('high')
        expect(result.canRetry).toBe(false)
    })

    it('should categorize 401 as permission', () => {
        const result = categorizeError('HTTP 401 unauthorized', context)
        expect(result.type).toBe('permission')
        expect(result.severity).toBe('high')
    })

    it('should categorize 403 as permission', () => {
        const result = categorizeError('HTTP 403 forbidden', context)
        expect(result.type).toBe('permission')
    })

    it('should categorize unknown errors', () => {
        const result = categorizeError('Something weird happened', context)
        expect(result.type).toBe('unknown')
        expect(result.severity).toBe('medium')
        expect(result.canRetry).toBe(true)
    })
})

describe('generateAutoFixSuggestions', () => {
    it('should return suggestions for offline errors', () => {
        const result = generateAutoFixSuggestions({
            type: 'offline',
            severity: 'critical',
            message: 'offline',
            canRetry: true,
            autoFixAvailable: true,
        })
        expect(result.length).toBeGreaterThan(0)
        expect(result[0].action).toBeDefined()
        expect(result[0].steps).toBeDefined()
    })

    it('should return suggestions for not_found errors', () => {
        const result = generateAutoFixSuggestions({
            type: 'not_found',
            severity: 'high',
            message: 'not found',
            canRetry: false,
            autoFixAvailable: false,
        })
        expect(result.length).toBeGreaterThan(0)
    })

    it('should return suggestions for timeout errors', () => {
        const result = generateAutoFixSuggestions({
            type: 'timeout',
            severity: 'medium',
            message: 'timeout',
            canRetry: true,
            autoFixAvailable: false,
        })
        expect(result.length).toBeGreaterThan(0)
    })

    it('should return empty for unknown errors', () => {
        const result = generateAutoFixSuggestions({
            type: 'unknown',
            severity: 'medium',
            message: 'unknown',
            canRetry: true,
            autoFixAvailable: false,
        })
        expect(result).toHaveLength(0)
    })
})

describe('retryWithBackoff', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    it('should return success on first attempt', async () => {
        const op = vi.fn().mockResolvedValue('ok')
        const resultPromise = retryWithBackoff(op, 3, 100)
        const result = await resultPromise
        expect(result.success).toBe(true)
        expect(result.result).toBe('ok')
        expect(op).toHaveBeenCalledTimes(1)
    })

    it('should succeed after retries', async () => {
        const op = vi.fn()
            .mockRejectedValueOnce(new Error('fail 1'))
            .mockRejectedValueOnce(new Error('fail 2'))
            .mockResolvedValue('ok')

        const resultPromise = retryWithBackoff(op, 3, 100)

        // Advance timers for retries
        await vi.advanceTimersByTimeAsync(100) // first retry delay
        await vi.advanceTimersByTimeAsync(200) // second retry delay

        const result = await resultPromise
        expect(result.success).toBe(true)
        expect(result.result).toBe('ok')
        expect(op).toHaveBeenCalledTimes(3)
    })

    it('should return failure after exhausting retries', async () => {
        const op = vi.fn().mockRejectedValue(new Error('persistent fail'))

        const resultPromise = retryWithBackoff(op, 2, 100)

        await vi.advanceTimersByTimeAsync(100)
        await vi.advanceTimersByTimeAsync(200)

        const result = await resultPromise
        expect(result.success).toBe(false)
        expect(result.error).toBe('persistent fail')
    })
})
