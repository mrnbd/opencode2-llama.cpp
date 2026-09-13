import {modelStatusCache} from '../cache'
import {fetchLlamaCppModelsDirect} from '../utils/llama-cpp-api'

export function getLoadedModels(baseURL: string = "http://127.0.0.1:1234"): Promise<string[]> {
    return modelStatusCache.getModels(baseURL, async () => {
        return await fetchLlamaCppModelsDirect(baseURL)
    })
}

