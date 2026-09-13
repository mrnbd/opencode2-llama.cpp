import {ModelStatusCache} from './model-status-cache'

// Single shared cache instance used across the plugin so all modules
// (config hook, loaded-models lookup) share one source of truth.
export const modelStatusCache = new ModelStatusCache()
export {ModelStatusCache} from './model-status-cache'
