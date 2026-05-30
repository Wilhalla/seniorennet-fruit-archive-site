export type FetchPriority = 'high' | 'low' | 'auto'

type PriorityRequestInit = RequestInit & { priority?: FetchPriority }

type FetchJsonOptions = {
  priority?: FetchPriority
  signal?: AbortSignal
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const init: PriorityRequestInit = {}
  if (options.priority) init.priority = options.priority
  if (options.signal) init.signal = options.signal

  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`)
  return response.json() as Promise<T>
}
