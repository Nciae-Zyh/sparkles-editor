/**
 * AI 相关接口的日志工具，便于正式环境排查问题。
 * 统一前缀 [AI] 便于在日志中过滤。
 */

const PREFIX = '[AI]'

function safeStrLen(value: unknown): string {
  if (value == null) return '0'
  if (typeof value === 'string') return String(value.length)
  return String(JSON.stringify(value).length)
}

export function logAiRequest(endpoint: string, meta: Record<string, unknown>) {
  const safe: Record<string, string> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === 'string' && v.length > 200) {
      safe[k] = `length=${v.length}`
    } else if (v !== undefined && v !== null) {
      safe[k] = String(v)
    }
  }
  console.info(`${PREFIX} request endpoint=${endpoint}`, safe)
}

export function logAiConfig(endpoint: string, config: { hasApiKey: boolean, apiUrl: string }) {
  console.info(`${PREFIX} config endpoint=${endpoint} hasApiKey=${config.hasApiKey} apiUrl=${config.apiUrl || '(empty)'}`)
}

export function logAiUpstream(endpoint: string, url: string, status: number, bodyPreview?: string) {
  console.info(`${PREFIX} upstream endpoint=${endpoint} url=${url} status=${status}`, bodyPreview != null ? `bodyPreview=${bodyPreview.slice(0, 100)}` : '')
}

export function logAiSuccess(endpoint: string, meta: { contentLength: number, cached?: boolean }) {
  console.info(`${PREFIX} success endpoint=${endpoint}`, meta)
}

export function logAiError(endpoint: string, error: unknown, extra?: Record<string, unknown>) {
  const err = error as Error & { statusCode?: number, data?: unknown }
  console.error(`${PREFIX} error endpoint=${endpoint} message=${err?.message ?? err} statusCode=${err?.statusCode ?? 'n/a'}`, extra ?? '')
  if (err?.stack) {
    console.error(`${PREFIX} stack`, err.stack)
  }
}

export function logAiValidationFail(endpoint: string, reason: string) {
  console.warn(`${PREFIX} validation_fail endpoint=${endpoint} reason=${reason}`)
}
