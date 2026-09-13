import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {ToastNotifier} from '../src/ui/toast-notifier'

function createMockClient() {
    return {
        tui: {
            showToast: vi.fn().mockResolvedValue(undefined),
        },
    }
}

function createClientWithoutToast() {
    return {
        tui: {},
    }
}

describe('ToastNotifier', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleSpy.mockRestore()
        vi.restoreAllMocks()
    })

    describe('success', () => {
        it('should call showToast with success variant', async () => {
            const client = createMockClient()
            const notifier = new ToastNotifier(client)

            await notifier.success('Operation completed', 'Success')

            expect(client.tui.showToast).toHaveBeenCalledWith({
                body: {
                    title: 'Success',
                    message: 'Operation completed',
                    variant: 'success',
                    duration: 3000,
                },
            })
        })

        it('should use custom duration', async () => {
            const client = createMockClient()
            const notifier = new ToastNotifier(client)

            await notifier.success('Done', undefined, 5000)

            expect(client.tui.showToast).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: expect.objectContaining({duration: 5000}),
                })
            )
        })
    })

    describe('error', () => {
        it('should call showToast with error variant', async () => {
            const client = createMockClient()
            const notifier = new ToastNotifier(client)

            await notifier.error('Something failed', 'Error')

            expect(client.tui.showToast).toHaveBeenCalledWith({
                body: {
                    title: 'Error',
                    message: 'Something failed',
                    variant: 'error',
                    duration: 5000,
                },
            })
        })
    })

    describe('warning', () => {
        it('should call showToast with warning variant', async () => {
            const client = createMockClient()
            const notifier = new ToastNotifier(client)

            await notifier.warning('Be careful', 'Warning')

            expect(client.tui.showToast).toHaveBeenCalledWith({
                body: {
                    title: 'Warning',
                    message: 'Be careful',
                    variant: 'warning',
                    duration: 4000,
                },
            })
        })
    })

    describe('info', () => {
        it('should call showToast with info variant', async () => {
            const client = createMockClient()
            const notifier = new ToastNotifier(client)

            await notifier.info('FYI', 'Info')

            expect(client.tui.showToast).toHaveBeenCalledWith({
                body: {
                    title: 'Info',
                    message: 'FYI',
                    variant: 'info',
                    duration: 3000,
                },
            })
        })
    })

    describe('progress', () => {
        it('should show progress percentage in message', async () => {
            const client = createMockClient()
            const notifier = new ToastNotifier(client)

            await notifier.progress('Loading', undefined, 50)

            expect(client.tui.showToast).toHaveBeenCalledWith({
                body: {
                    title: undefined,
                    message: 'Loading (50%)',
                    variant: 'info',
                    duration: 0,
                },
            })
        })

        it('should use default duration when no progress', async () => {
            const client = createMockClient()
            const notifier = new ToastNotifier(client)

            await notifier.progress('Loading')

            expect(client.tui.showToast).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: expect.objectContaining({duration: 2000}),
                })
            )
        })
    })

    describe('detailed', () => {
        it('should pass all options through', async () => {
            const client = createMockClient()
            const notifier = new ToastNotifier(client)

            await notifier.detailed({
                title: 'Title',
                message: 'Body',
                variant: 'warning',
                duration: 10000,
            })

            expect(client.tui.showToast).toHaveBeenCalledWith({
                body: {
                    title: 'Title',
                    message: 'Body',
                    variant: 'warning',
                    duration: 10000,
                },
            })
        })

        it('should default variant to info', async () => {
            const client = createMockClient()
            const notifier = new ToastNotifier(client)

            await notifier.detailed({message: 'test'})

            expect(client.tui.showToast).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: expect.objectContaining({variant: 'info'}),
                })
            )
        })
    })

    describe('when showToast is not available', () => {
        it('should not throw and log warning', async () => {
            const client = createClientWithoutToast()
            const notifier = new ToastNotifier(client)

            await expect(
                notifier.success('test')
            ).resolves.not.toThrow()

            await expect(
                notifier.error('test')
            ).resolves.not.toThrow()

            await expect(
                notifier.warning('test')
            ).resolves.not.toThrow()

            await expect(
                notifier.info('test')
            ).resolves.not.toThrow()
        })
    })

    describe('when showToast throws', () => {
        it('should not propagate error', async () => {
            const client = createMockClient()
            client.tui.showToast.mockRejectedValue(new Error('UI error'))
            const notifier = new ToastNotifier(client)

            await expect(notifier.success('test')).resolves.not.toThrow()
            await expect(notifier.error('test')).resolves.not.toThrow()
            await expect(notifier.warning('test')).resolves.not.toThrow()
            await expect(notifier.info('test')).resolves.not.toThrow()
            await expect(notifier.progress('test')).resolves.not.toThrow()
            await expect(notifier.detailed({message: 'test'})).resolves.not.toThrow()
        })
    })

    describe('when client is null', () => {
        it('should not throw', async () => {
            const notifier = new ToastNotifier(null)

            await expect(notifier.success('test')).resolves.not.toThrow()
            await expect(notifier.error('test')).resolves.not.toThrow()
        })
    })
})
