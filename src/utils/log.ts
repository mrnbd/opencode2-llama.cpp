const PREFIX = "[opencode-llama-cpp]"
const isDebug = process.env.DEBUG === "1" || process.env.DEBUG === "true"

export const log = {
    debug(msg: string, data?: Record<string, unknown>) {
        if (!isDebug) return
        if (data !== undefined) {
            console.debug(`${PREFIX} ${msg}`, data)
        } else {
            console.debug(`${PREFIX} ${msg}`)
        }
    },

    info(msg: string, data?: Record<string, unknown>) {
        if (data !== undefined) {
            console.info(`${PREFIX} ${msg}`, data)
        } else {
            console.info(`${PREFIX} ${msg}`)
        }
    },

    warn(msg: string, data?: Record<string, unknown>) {
        if (data !== undefined) {
            console.warn(`${PREFIX} ${msg}`, data)
        } else {
            console.warn(`${PREFIX} ${msg}`)
        }
    },

    error(msg: string, data?: Record<string, unknown>) {
        if (data !== undefined) {
            console.error(`${PREFIX} ${msg}`, data)
        } else {
            console.error(`${PREFIX} ${msg}`)
        }
    },
}
