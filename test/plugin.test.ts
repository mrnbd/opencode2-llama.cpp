import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {LlamaCppPlugin} from '../src'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock AbortSignal.timeout for older Node versions
if (!global.AbortSignal.timeout) {
    global.AbortSignal.timeout = vi.fn(() => {
        const controller = new AbortController()
        setTimeout(() => controller.abort(), 3000)
        return controller.signal
    })
}

// Mock PluginContext for V2
function createMockContext() {
    const registrations: any[] = []

    return {
        app: {
            version: "2.0.0"
        },
        location: {
            directory: "/tmp",
            project: {
                id: 'test-project',
                directory: '/tmp',
                canonical: '/tmp'
            }
        },
        catalog: {
            provider: {
                list: vi.fn().mockResolvedValue({data: []}),
                get: vi.fn().mockResolvedValue(null),
            },
            model: {
                list: vi.fn().mockResolvedValue({data: []}),
                default: vi.fn().mockResolvedValue(null),
            },
            transform: vi.fn().mockImplementation(async (callback: Function) => {
                const editor = {
                    provider: {
                        list: () => [],
                        get: (id: string) => undefined,
                        update: vi.fn(),
                        remove: vi.fn(),
                    },
                    model: {
                        get: (pid: string, mid: string) => undefined,
                        update: vi.fn(),
                        remove: vi.fn(),
                        default: {
                            get: () => undefined,
                            set: vi.fn(),
                        }
                    }
                }
                callback(editor)
                const reg = {dispose: vi.fn().mockResolvedValue(undefined)}
                registrations.push(reg)
                return reg
            }),
            reload: vi.fn().mockResolvedValue(undefined),
        },
        session: {
            hook: vi.fn().mockImplementation(async (name: string, callback: Function) => {
                const reg = {dispose: vi.fn().mockResolvedValue(undefined)}
                registrations.push({name, callback, reg})
                return reg
            }),
        },
        event: {
            subscribe: vi.fn().mockImplementation(async function* () {
                // Empty async iterator
                return
            }),
        },
        storage: {
            get: vi.fn().mockResolvedValue(undefined),
            set: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue(undefined),
        },
        _registrations: registrations,
    }
}

describe('Llama.cpp Plugin (V2)', () => {
    let mockCtx: ReturnType<typeof createMockContext>

    beforeEach(async () => {
        mockFetch.mockClear()
        mockCtx = createMockContext()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('Plugin Definition', () => {
        it('should have correct V2 plugin shape', () => {
            expect(LlamaCppPlugin).toBeDefined()
            const plugin = LlamaCppPlugin as any
            expect(plugin.id).toBe('llama-cpp')
            expect(typeof plugin.setup).toBe('function')
        })
    })

    describe('Setup', () => {
        it('should initialize successfully', async () => {
            // Mock no llama.cpp available
            mockFetch.mockRejectedValue(new Error('Connection refused'))

            const plugin = LlamaCppPlugin as any
            const cleanup = await plugin.setup(mockCtx as any)

            expect(typeof cleanup).toBe('function')
        })

        it('should auto-detect and register llama.cpp when available', async () => {
            // Mock: health check → ok, then models discovery → data
            mockFetch.mockResolvedValueOnce({ok: true}) // health check
            mockFetch.mockResolvedValueOnce({           // discover models
                ok: true,
                json: async () => ({
                    data: [
                        {id: 'test-model-1', object: 'model', created: 1234567890, owned_by: 'local'},
                        {id: 'test-model-2', object: 'model', created: 1234567890, owned_by: 'local'}
                    ]
                })
            })

            const plugin = LlamaCppPlugin as any
            await plugin.setup(mockCtx as any)

            // Verify catalog transform was called
            expect(mockCtx.catalog.transform).toHaveBeenCalled()
        })

        it('should handle llama.cpp offline gracefully', async () => {
            mockFetch.mockRejectedValue(new Error('Connection refused'))

            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

            const plugin = LlamaCppPlugin as any
            const cleanup = await plugin.setup(mockCtx as any)

            expect(typeof cleanup).toBe('function')
            consoleSpy.mockRestore()
        })
    })

    describe('Model Validation Hook', () => {
        it('should register session hook for model validation', async () => {
            mockFetch.mockRejectedValue(new Error('Connection refused'))

            const plugin = LlamaCppPlugin as any
            await plugin.setup(mockCtx as any)

            // Verify session hook was registered
            expect(mockCtx.session.hook).toHaveBeenCalledWith('context', expect.any(Function))
        })
    })
})
