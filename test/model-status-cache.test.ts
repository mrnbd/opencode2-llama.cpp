import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {ModelStatusCache} from '../src/cache/model-status-cache'

describe('ModelStatusCache', () => {
    let cache: ModelStatusCache

    beforeEach(() => {
        vi.useFakeTimers()
        cache = new ModelStatusCache()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    describe('getModels', () => {
        it('should fetch and cache models on first call', async () => {
            const fetchFn = vi.fn().mockResolvedValue(['model-a', 'model-b'])

            const result = await cache.getModels('http://localhost:1234', fetchFn)
            expect(result).toEqual(['model-a', 'model-b'])
            expect(fetchFn).toHaveBeenCalledTimes(1)
        })

        it('should return cached data on second call within TTL', async () => {
            const fetchFn = vi.fn().mockResolvedValue(['model-a'])

            await cache.getModels('http://localhost:1234', fetchFn)
            const result = await cache.getModels('http://localhost:1234', fetchFn)

            expect(result).toEqual(['model-a'])
            expect(fetchFn).toHaveBeenCalledTimes(1) // Only one fetch
        })

        it('should re-fetch after TTL expires', async () => {
            const fetchFn = vi.fn()
                .mockResolvedValueOnce(['model-a'])
                .mockResolvedValueOnce(['model-b'])

            await cache.getModels('http://localhost:1234', fetchFn)

            // Advance past default TTL (15s)
            vi.advanceTimersByTime(16_000)

            const result = await cache.getModels('http://localhost:1234', fetchFn)
            expect(result).toEqual(['model-b'])
            expect(fetchFn).toHaveBeenCalledTimes(2)
        })

        it('should return stale cache on fetch error', async () => {
            const fetchFn = vi.fn()
                .mockResolvedValueOnce(['model-a'])
                .mockRejectedValueOnce(new Error('network error'))

            await cache.getModels('http://localhost:1234', fetchFn)
            vi.advanceTimersByTime(16_000) // Expire TTL

            const result = await cache.getModels('http://localhost:1234', fetchFn)
            expect(result).toEqual(['model-a']) // Stale data returned
        })

        it('should throw if no stale cache and fetch fails', async () => {
            const fetchFn = vi.fn().mockRejectedValue(new Error('network error'))

            await expect(
                cache.getModels('http://localhost:1234', fetchFn)
            ).rejects.toThrow('network error')
        })

        it('should return stale data even when >5x TTL, and invalidate for next call', async () => {
            const fetchFn = vi.fn()
                .mockResolvedValueOnce(['model-a'])
                .mockRejectedValueOnce(new Error('fail'))
                .mockRejectedValueOnce(new Error('fail'))

            await cache.getModels('http://localhost:1234', fetchFn)

            // Advance past 5x TTL (75s)
            vi.advanceTimersByTime(76_000)

            // Second call: stale >5x TTL → invalidated, but stale data returned because fetch fails
            const result = await cache.getModels('http://localhost:1234', fetchFn)
            expect(result).toEqual(['model-a']) // Stale data still returned
            expect(fetchFn).toHaveBeenCalledTimes(2)

            // Third call: entry was invalidated, no stale data → throws
            await expect(
                cache.getModels('http://localhost:1234', fetchFn)
            ).rejects.toThrow('fail')
        })

        it('should replace stale cache with fresh data when fetch succeeds', async () => {
            const fetchFn = vi.fn()
                .mockResolvedValueOnce(['model-a'])
                .mockResolvedValueOnce(['model-b'])

            await cache.getModels('http://localhost:1234', fetchFn)

            // Advance past default TTL
            vi.advanceTimersByTime(16_000)

            const result = await cache.getModels('http://localhost:1234', fetchFn)
            expect(result).toEqual(['model-b']) // Fresh data replaces stale
        })

        it('should cache separately per baseURL', async () => {
            const fetchFn = vi.fn()
                .mockResolvedValueOnce(['model-a'])
                .mockResolvedValueOnce(['model-b'])

            const result1 = await cache.getModels('http://host1:1234', fetchFn)
            const result2 = await cache.getModels('http://host2:1234', fetchFn)

            expect(result1).toEqual(['model-a'])
            expect(result2).toEqual(['model-b'])
            expect(fetchFn).toHaveBeenCalledTimes(2)
        })

        it('should return a copy of models to prevent mutations', async () => {
            const fetchFn = vi.fn().mockResolvedValue(['model-a'])
            const result1 = await cache.getModels('http://localhost:1234', fetchFn)
            result1.push('injected')

            const result2 = await cache.getModels('http://localhost:1234', fetchFn)
            expect(result2).toEqual(['model-a'])
        })
    })

    describe('invalidate', () => {
        it('should remove cache entry for specific URL', async () => {
            const fetchFn = vi.fn().mockResolvedValue(['model-a'])
            await cache.getModels('http://localhost:1234', fetchFn)

            cache.invalidate('http://localhost:1234')

            // Should re-fetch
            fetchFn.mockResolvedValueOnce(['model-b'])
            const result = await cache.getModels('http://localhost:1234', fetchFn)
            expect(result).toEqual(['model-b'])
            expect(fetchFn).toHaveBeenCalledTimes(2)
        })

        it('should not affect other URLs', async () => {
            const fetchFn = vi.fn().mockResolvedValue(['model-a'])
            await cache.getModels('http://host1:1234', fetchFn)
            await cache.getModels('http://host2:1234', fetchFn)

            cache.invalidate('http://host1:1234')

            // host2 should still be cached
            await cache.getModels('http://host2:1234', fetchFn)
            expect(fetchFn).toHaveBeenCalledTimes(2) // No extra fetch for host2
        })
    })

    describe('invalidateAll', () => {
        it('should clear all cache entries', async () => {
            const fetchFn = vi.fn().mockResolvedValue(['model-a'])
            await cache.getModels('http://host1:1234', fetchFn)
            await cache.getModels('http://host2:1234', fetchFn)

            cache.invalidateAll()

            // Both should re-fetch
            fetchFn.mockResolvedValue(['model-b'])
            await cache.getModels('http://host1:1234', fetchFn)
            await cache.getModels('http://host2:1234', fetchFn)
            expect(fetchFn).toHaveBeenCalledTimes(4)
        })
    })

    describe('forceRefresh', () => {
        it('should invalidate and re-fetch', async () => {
            const fetchFn = vi.fn()
                .mockResolvedValueOnce(['model-a'])
                .mockResolvedValueOnce(['model-b'])

            await cache.getModels('http://localhost:1234', fetchFn)
            const result = await cache.forceRefresh('http://localhost:1234', fetchFn)

            expect(result).toEqual(['model-b'])
            expect(fetchFn).toHaveBeenCalledTimes(2)
        })
    })

    describe('getStats', () => {
        it('should return empty stats for empty cache', () => {
            const stats = cache.getStats()
            expect(stats.size).toBe(0)
            expect(stats.entries).toHaveLength(0)
        })

        it('should return stats after caching', async () => {
            const fetchFn = vi.fn().mockResolvedValue(['a', 'b', 'c'])
            await cache.getModels('http://localhost:1234', fetchFn)

            const stats = cache.getStats()
            expect(stats.size).toBe(1)
            expect(stats.entries[0].baseURL).toBe('http://localhost:1234')
            expect(stats.entries[0].modelCount).toBe(3)
            expect(stats.entries[0].age).toBeGreaterThanOrEqual(0)
            expect(stats.entries[0].ttl).toBe(15000)
        })
    })

    describe('setTTL', () => {
        it('should update TTL for existing entry', async () => {
            const fetchFn = vi.fn().mockResolvedValue(['model-a'])
            await cache.getModels('http://localhost:1234', fetchFn)

            cache.setTTL('http://localhost:1234', 60_000)

            // Advance past default TTL but within new TTL
            vi.advanceTimersByTime(16_000)

            // Should still be cached
            await cache.getModels('http://localhost:1234', fetchFn)
            expect(fetchFn).toHaveBeenCalledTimes(1)
        })

        it('should do nothing for non-existent entry', () => {
            // Should not throw
            cache.setTTL('http://nonexistent:1234', 60_000)
        })
    })

    describe('isValid', () => {
        it('should return false for non-existent entry', () => {
            expect(cache.isValid('http://localhost:1234')).toBe(false)
        })

        it('should return true for valid entry', async () => {
            const fetchFn = vi.fn().mockResolvedValue(['model-a'])
            await cache.getModels('http://localhost:1234', fetchFn)
            expect(cache.isValid('http://localhost:1234')).toBe(true)
        })

        it('should return false after TTL expires', async () => {
            const fetchFn = vi.fn().mockResolvedValue(['model-a'])
            await cache.getModels('http://localhost:1234', fetchFn)

            vi.advanceTimersByTime(16_000)
            expect(cache.isValid('http://localhost:1234')).toBe(false)
        })
    })
})
