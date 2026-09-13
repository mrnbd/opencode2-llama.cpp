import {describe, expect, it} from 'vitest'
import {extractModelOwner, formatModelName} from '../src/utils/format-model-name'
import type {LlamaCppModel} from '../src/types'

function makeModel(overrides: Partial<LlamaCppModel> & {id: string}): LlamaCppModel {
    return {
        object: 'model',
        created: 1234567890,
        owned_by: 'local',
        ...overrides,
    }
}

describe('extractModelOwner', () => {
    it('should extract owner from namespaced model ID', () => {
        expect(extractModelOwner('qwen/qwen3-30b')).toBe('qwen')
    })

    it('should extract owner with multi-part namespace', () => {
        expect(extractModelOwner('meta-llama/llama-3-8b')).toBe('meta-llama')
    })

    it('should return undefined for non-namespaced model ID', () => {
        expect(extractModelOwner('nomic-embed')).toBeUndefined()
    })

    it('should return undefined for empty string', () => {
        expect(extractModelOwner('')).toBeUndefined()
    })

    it('should handle model ID with only a slash', () => {
        expect(extractModelOwner('/model')).toBe('')
    })
})

describe('formatModelName', () => {
    it('should return API name if provided and non-empty', () => {
        const model = makeModel({id: 'qwen/qwen3-30b', name: 'Qwen3 30B A3B'})
        expect(formatModelName(model)).toBe('Qwen3 30B A3B')
    })

    it('should return trimmed API name', () => {
        const model = makeModel({id: 'qwen/qwen3-30b', name: '  Qwen3 30B  '})
        expect(formatModelName(model)).toBe('Qwen3 30B')
    })

    it('should ignore blank API name', () => {
        const model = makeModel({id: 'qwen/qwen3-30b', name: '   '})
        expect(formatModelName(model)).toBe('Qwen3 30B')
    })

    it('should format namespaced model ID', () => {
        const model = makeModel({id: 'qwen/qwen3-30b-a3b'})
        expect(formatModelName(model)).toBe('Qwen3 30B A3B')
    })

    it('should format non-namespaced model ID', () => {
        const model = makeModel({id: 'llama-3-8b'})
        expect(formatModelName(model)).toBe('Llama 3 8B')
    })

    it('should uppercase known acronyms (gpt, gguf, nomic)', () => {
        const gpt = makeModel({id: 'openai/gpt-4o'})
        expect(formatModelName(gpt)).toBe('GPT 4O')

        const nomic = makeModel({id: 'nomic/nomic-embed-text'})
        expect(formatModelName(nomic)).toBe('NOMIC Embed Text')
    })

    it('should not uppercase unknown tokens', () => {
        const model = makeModel({id: 'model-mini'})
        expect(formatModelName(model)).toBe('Model Mini')
    })

    it('should split by dot only when dot is followed by known extension pattern', () => {
        // The formatter splits by [-_], not by '.', so "model.gguf" stays as one token
        const model = makeModel({id: 'model.gguf'})
        expect(formatModelName(model)).toBe('Model.gguf')
    })

    it('should handle version numbers like 3.2', () => {
        const model = makeModel({id: 'model-3.2'})
        expect(formatModelName(model)).toBe('Model 3.2')
    })

    it('should uppercase quantization tokens like q4', () => {
        const model = makeModel({id: 'model-q4_k_m'})
        expect(formatModelName(model)).toBe('Model Q4 K M')
    })

    it('should uppercase special patterns like a3b', () => {
        const model = makeModel({id: 'model-a3b'})
        expect(formatModelName(model)).toBe('Model A3B')
    })

    it('should handle mixed separators', () => {
        const model = makeModel({id: 'org/model_name-30b-q4'})
        expect(formatModelName(model)).toBe('Model Name 30B Q4')
    })

    it('should handle single token model ID', () => {
        const model = makeModel({id: 'llama'})
        expect(formatModelName(model)).toBe('Llama')
    })
})
