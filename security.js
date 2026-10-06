export function buildAllowedOrigins(value = '') {
  return String(value)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export function sanitizeHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([key, value]) => key && value !== undefined && value !== null)
      .map(([key, value]) => [String(key).toLowerCase(), String(value).trim()]),
  )
}

export function isOriginAllowed(origin, allowedOrigins = [], renderOrigin = '') {
  if (!origin) return true
  return allowedOrigins.includes('*') || allowedOrigins.includes(origin) || origin === renderOrigin
}

export function requireApiToken(request = {}) {
  const token = process.env.MARCI_API_TOKEN
  if (!token) return true

  const headers = sanitizeHeaders(request.headers || {})
  const provided = headers['x-marci-token'] || headers['authorization']
  const normalized = typeof provided === 'string' && provided.startsWith('Bearer ') ? provided.slice(7) : provided

  return normalized === token
}

export function buildSecurityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cache-Control': 'no-store',
    ...extra,
  }
}
