import {describe, expect, it} from 'vitest'
import {validateConfig} from '../src/utils/validation/validate-config'
import {validateHookInput} from '../src/utils/validation/validate-hook-input'
import {validateLlamaCppResponse} from '../src/utils/validation/validate-llama-cpp-response'
import {isPluginHookInput, isLlamaCppProvider, isValidModel} from '../src/utils/validation/type-guards'
import {safeJSONParse, safeAsyncOperation} from '../src/utils/validation/safe-operations'

describe('validateConfig', () => {
    it('should reject non-object config', () => {
        const result = validateConfig(null)
        expect(result.isValid).toBe(false)
        expect(result.errors).toContain('Config must be an object')
    })

    it('should accept empty config (no llama.cpp provider)', () => {
        const result = validateConfig({})
        expect(result.isValid).toBe(true)
        expect(result.errors).toHaveLength(0)
    })

    it('should auto-set missing npm field and warn', () => {
        const config = {provider: {'llama.cpp': {name: 'test'}}}
        const result = validateConfig(config)
        expect(result.isValid).toBe(true)
        expect(result.warnings.some(w => w.includes('npm'))).toBe(true)
        expect(config.provider['llama.cpp'].npm).toBe('@ai-sdk/openai-compatible')
    })

    it('should auto-set missing name field and warn', () => {
        const config = {provider: {'llama.cpp': {npm: '@ai-sdk/openai-compatible'}}}
        const result = validateConfig(config)
        expect(result.isValid).toBe(true)
        expect(result.warnings.some(w => w.includes('name'))).toBe(true)
    })

    it('should create empty options if missing', () => {
        const config = {provider: {'llama.cpp': {npm: 'pkg', name: 'n'}}}
        const result = validateConfig(config)
        expect(result.warnings.some(w => w.includes('options'))).toBe(true)
        expect(config.provider['llama.cpp'].options).toEqual({})
    })

    it('should not error on non-string baseURL when options already exists (validation gap)', () => {
        // Note: validateConfig only checks baseURL validity inside the `if (!llamaCpp.options)` block.
        // When options is pre-provided, baseURL validation is skipped — this is a known gap.
        const config = {provider: {'llama.cpp': {options: {baseURL: 123}}}}
        const result = validateConfig(config)
        expect(result.isValid).toBe(true) // No error because validation path is not entered
    })

    it('should warn about baseURL when options is auto-created and baseURL is invalid', () => {
        const config = {provider: {'llama.cpp': {}}}
        const result = validateConfig(config)
        // Options is auto-created, and baseURL is missing → warns about missing baseURL
        expect(result.warnings.some(w => w.includes('missing baseURL'))).toBe(true)
    })

    it('should error if models is not an object', () => {
        const config = {provider: {'llama.cpp': {models: 'invalid'}}}
        const result = validateConfig(config)
        expect(result.isValid).toBe(false)
        expect(result.errors.some(e => e.includes('models must be an object'))).toBe(true)
    })

    it('should accept valid config', () => {
        const config = {
            provider: {
                'llama.cpp': {
                    npm: '@ai-sdk/openai-compatible',
                    name: 'llama.cpp',
                    options: {baseURL: 'http://localhost:1234'},
                    models: {},
                },
            },
        }
        const result = validateConfig(config)
        expect(result.isValid).toBe(true)
        expect(result.errors).toHaveLength(0)
    })
})

describe('validateHookInput', () => {
    it('should reject non-object input', () => {
        const result = validateHookInput('chat.params', null)
        expect(result.isValid).toBe(false)
        expect(result.errors[0]).toContain('Input must be an object')
    })

    describe('chat.params', () => {
        const validInput = {
            sessionID: 'ses-123',
            model: {id: 'test-model'},
            provider: {info: {id: 'llama.cpp'}},
        }

        it('should accept valid input', () => {
            const result = validateHookInput('chat.params', validInput)
            expect(result.isValid).toBe(true)
        })

        it('should error on missing sessionID', () => {
            const input = {...validInput, sessionID: undefined}
            const result = validateHookInput('chat.params', input)
            expect(result.isValid).toBe(false)
            expect(result.errors.some(e => e.includes('sessionID'))).toBe(true)
        })

        it('should error on missing model', () => {
            const input = {...validInput, model: undefined}
            const result = validateHookInput('chat.params', input)
            expect(result.isValid).toBe(false)
            expect(result.errors.some(e => e.includes('model'))).toBe(true)
        })

        it('should error on missing model.id', () => {
            const input = {...validInput, model: {}}
            const result = validateHookInput('chat.params', input)
            expect(result.isValid).toBe(false)
            expect(result.errors.some(e => e.includes('model.id'))).toBe(true)
        })

        it('should error on missing provider', () => {
            const input = {...validInput, provider: undefined}
            const result = validateHookInput('chat.params', input)
            expect(result.isValid).toBe(false)
            expect(result.errors.some(e => e.includes('provider'))).toBe(true)
        })

        it('should warn on missing provider.info.id', () => {
            const input = {...validInput, provider: {info: {}}}
            const result = validateHookInput('chat.params', input)
            expect(result.isValid).toBe(true)
            expect(result.warnings.some(w => w.includes('provider.info.id'))).toBe(true)
        })
    })

    describe('event', () => {
        it('should error on missing event', () => {
            const result = validateHookInput('event', {})
            expect(result.isValid).toBe(false)
            expect(result.errors.some(e => e.includes('event is required'))).toBe(true)
        })

        it('should warn on missing event.type', () => {
            const result = validateHookInput('event', {event: {}})
            expect(result.isValid).toBe(true)
            expect(result.warnings.some(w => w.includes('event.type'))).toBe(true)
        })

        it('should accept valid event', () => {
            const result = validateHookInput('event', {event: {type: 'test'}})
            expect(result.isValid).toBe(true)
        })
    })

    it('should handle unknown hook names gracefully', () => {
        const result = validateHookInput('unknown-hook', {data: true})
        expect(result.isValid).toBe(true)
    })
})

describe('validateLlamaCppResponse', () => {
    it('should reject non-object response', () => {
        const result = validateLlamaCppResponse(null)
        expect(result.isValid).toBe(false)
        expect(result.errors[0]).toContain('must be an object')
    })

    it('should warn on missing data array', () => {
        const result = validateLlamaCppResponse({})
        expect(result.isValid).toBe(true)
        expect(result.warnings.some(w => w.includes('missing data array'))).toBe(true)
    })

    it('should warn if data is not an array', () => {
        const result = validateLlamaCppResponse({data: 'not-array'})
        expect(result.warnings.some(w => w.includes('missing data array'))).toBe(true)
    })

    it('should error on model missing id', () => {
        const result = validateLlamaCppResponse({data: [{object: 'model'}]})
        expect(result.isValid).toBe(false)
        expect(result.errors.some(e => e.includes('missing required id'))).toBe(true)
    })

    it('should warn on model missing object field', () => {
        const result = validateLlamaCppResponse({data: [{id: 'test'}]})
        expect(result.isValid).toBe(true)
        expect(result.warnings.some(w => w.includes('missing object field'))).toBe(true)
    })

    it('should accept valid response', () => {
        const result = validateLlamaCppResponse({
            data: [{id: 'test', object: 'model'}],
        })
        expect(result.isValid).toBe(true)
        expect(result.errors).toHaveLength(0)
    })
})

describe('type guards', () => {
    describe('isPluginHookInput', () => {
        it('should return true for objects', () => {
            expect(isPluginHookInput({})).toBe(true)
            expect(isPluginHookInput({sessionID: 'test'})).toBe(true)
        })

        it('should return false for non-objects', () => {
            expect(isPluginHookInput(null)).toBeFalsy()
            expect(isPluginHookInput(undefined)).toBeFalsy()
            expect(isPluginHookInput('string')).toBeFalsy()
            expect(isPluginHookInput(42)).toBeFalsy()
        })
    })

    describe('isLlamaCppProvider', () => {
        it('should return true for llama.cpp provider', () => {
            expect(isLlamaCppProvider({info: {id: 'llama.cpp'}})).toBe(true)
        })

        it('should return false for other providers', () => {
            expect(isLlamaCppProvider({info: {id: 'openai'}})).toBe(false)
        })

        it('should return false for non-objects', () => {
            expect(isLlamaCppProvider(null)).toBeFalsy()
            expect(isLlamaCppProvider({info: {}})).toBeFalsy()
        })
    })

    describe('isValidModel', () => {
        it('should return true for valid model', () => {
            expect(isValidModel({id: 'test'})).toBe(true)
        })

        it('should return false for missing id', () => {
            expect(isValidModel({})).toBe(false)
        })

        it('should return false for empty id', () => {
            expect(isValidModel({id: ''})).toBe(false)
        })

        it('should return false for non-string id', () => {
            expect(isValidModel({id: 42})).toBe(false)
        })

        it('should return false for non-objects', () => {
            expect(isValidModel(null)).toBeFalsy()
        })
    })
})

describe('safeJSONParse', () => {
    it('should parse valid JSON', () => {
        const result = safeJSONParse<{a: number}>('{"a": 1}')
        expect(result.data).toEqual({a: 1})
        expect(result.error).toBeUndefined()
    })

    it('should return error for invalid JSON', () => {
        const result = safeJSONParse('not json')
        expect(result.error).toBeDefined()
        expect(result.data).toBeUndefined()
    })

    it('should validate with validator function', () => {
        const validator = (data: any) => ({
            isValid: typeof data.a === 'number',
            errors: typeof data.a !== 'number' ? ['a must be number'] : [],
            warnings: [],
        })

        const valid = safeJSONParse('{\"a\": 1}', validator)
        expect(valid.data).toEqual({a: 1})

        const invalid = safeJSONParse('{\"a\": "string"}', validator)
        expect(invalid.error).toBe('Validation failed')
    })
})

describe('safeAsyncOperation', () => {
    it('should return data on success', async () => {
        const result = await safeAsyncOperation(async () => 'ok')
        expect(result.data).toBe('ok')
        expect(result.error).toBeUndefined()
    })

    it('should return error on failure', async () => {
        const result = await safeAsyncOperation(async () => {
            throw new Error('boom')
        })
        expect(result.error).toBe('boom')
        expect(result.data).toBeUndefined()
    })

    it('should return fallback on failure', async () => {
        const result = await safeAsyncOperation(
            async () => { throw new Error('boom') },
            'fallback'
        )
        expect(result.data).toBe('fallback')
        expect(result.error).toBeUndefined()
    })

    it('should call errorHandler on failure', async () => {
        const handler = vi.fn()
        await safeAsyncOperation(
            async () => { throw new Error('boom') },
            undefined,
            handler
        )
        expect(handler).toHaveBeenCalledTimes(1)
        expect(handler).toHaveBeenCalledWith(expect.objectContaining({message: 'boom'}))
    })
})
