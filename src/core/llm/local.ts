// Local models behind an OpenAI-compatible server (Ollama, LM Studio, llama.cpp server …).
import { AppError } from '../errors'

/** "http://localhost:11434/" → "http://localhost:11434/v1"; only http(s). */
export function normalizeLocalUrl(input: string): string {
  let u: URL
  try {
    u = new URL(input.trim())
  } catch {
    throw new AppError('VALIDATION', 'Enter the server address with http:// or https://, e.g. http://localhost:11434/v1')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new AppError('VALIDATION', 'The server address must start with http:// or https://')
  const path = u.pathname.replace(/\/+$/, '')
  return `${u.origin}${path || '/v1'}`
}

/** Names of the models the server offers, sorted. */
export async function listLocalModels(baseUrl: string, timeoutMs = 4000): Promise<string[]> {
  const base = normalizeLocalUrl(baseUrl)
  let res: Response
  try {
    res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    throw new AppError('VALIDATION', `Could not reach ${base}. Is Ollama (or LM Studio) running?`)
  }
  if (!res.ok) throw new AppError('VALIDATION', `${base} answered with HTTP ${res.status} — is this an OpenAI-compatible server (…/v1)?`)
  const body = (await res.json().catch(() => null)) as { data?: { id?: unknown }[] } | null
  const ids = (body?.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string')
  return ids.sort((a, b) => a.localeCompare(b))
}
