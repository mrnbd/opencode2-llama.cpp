import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {ModelLoadingMonitor} from '../src/monitoring/loading-monitor'

describe('ModelLoadingMonitor', () => {
    let monitor: ModelLoadingMonitor

    beforeEach(() => {
        vi.useFakeTimers()
        monitor = new ModelLoadingMonitor()
    })

    afterEach(() => {
        monitor.cleanup()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('startMonitoring', () => {
        it('should set model status to loading', () => {
            monitor.startMonitoring('model-1', 'http://localhost:1234')
            const state = monitor.getState('model-1')
            expect(state).toBeDefined()
            expect(state!.status).toBe('loading')
            expect(state!.progress).toBe(0)
            expect(state!.startTime).toBeDefined()
        })

        it('should ignore duplicate startMonitoring calls', () => {
            monitor.startMonitoring('model-1', 'http://localhost:1234')
            const firstState = monitor.getState('model-1')

            monitor.startMonitoring('model-1', 'http://localhost:1234')
            const secondState = monitor.getState('model-1')

            expect(firstState!.startTime).toBe(secondState!.startTime)
        })
    })

    describe('stopMonitoring', () => {
        it('should stop polling for a model', () => {
            monitor.startMonitoring('model-1', 'http://localhost:1234')
            monitor.stopMonitoring('model-1')

            // No error should occur, interval cleared
        })

        it('should be safe to call for non-existent model', () => {
            expect(() => monitor.stopMonitoring('nonexistent')).not.toThrow()
        })
    })

    describe('getState', () => {
        it('should return undefined for unknown model', () => {
            expect(monitor.getState('unknown')).toBeUndefined()
        })

        it('should return current state after startMonitoring', () => {
            monitor.startMonitoring('model-1', 'http://localhost:1234')
            const state = monitor.getState('model-1')
            expect(state).toBeDefined()
        })
    })

    describe('getAllStates', () => {
        it('should return empty map initially', () => {
            const states = monitor.getAllStates()
            expect(states.size).toBe(0)
        })

        it('should return a copy of all states', () => {
            monitor.startMonitoring('model-1', 'http://localhost:1234')
            monitor.startMonitoring('model-2', 'http://localhost:1234')

            const states = monitor.getAllStates()
            expect(states.size).toBe(2)

            // Should be a copy, not a reference
            states.delete('model-1')
            expect(monitor.getState('model-1')).toBeDefined()
        })
    })

    describe('cleanup', () => {
        it('should clear all states and intervals', () => {
            monitor.startMonitoring('model-1', 'http://localhost:1234')
            monitor.startMonitoring('model-2', 'http://localhost:1234')

            monitor.cleanup()

            expect(monitor.getState('model-1')).toBeUndefined()
            expect(monitor.getState('model-2')).toBeUndefined()
            expect(monitor.getAllStates().size).toBe(0)
        })

        it('should be safe to call on empty monitor', () => {
            expect(() => monitor.cleanup()).not.toThrow()
        })
    })
})
