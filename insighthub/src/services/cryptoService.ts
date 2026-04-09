/**
 * AES-256-GCM encryption/decryption using the Web Crypto API.
 * Falls back to no-op when crypto.subtle is unavailable (non-secure context).
 */

const ALGORITHM = 'AES-GCM'

export interface EncryptedPayload {
  iv: string   // base64
  data: string   // base64
}

export const isCryptoAvailable = typeof crypto !== 'undefined'
  && typeof crypto.subtle !== 'undefined'

function toBase64(buf: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf
}

// ========== Auto-managed key ==========

const STORAGE_KEY = 'insighthub:enc-key'

async function getOrCreateKey(): Promise<CryptoKey> {
  const existing = localStorage.getItem(STORAGE_KEY)
  if (existing) {
    const raw = fromBase64(existing)
    return crypto.subtle.importKey(
      'raw',
      raw as BufferSource,
      { name: ALGORITHM },
      false,
      ['encrypt', 'decrypt'] as KeyUsage[],
    )
  }
  const raw = crypto.getRandomValues(new Uint8Array(32))
  localStorage.setItem(STORAGE_KEY, toBase64(raw))
  return crypto.subtle.importKey(
    'raw',
    raw as BufferSource,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt'] as KeyUsage[],
  )
}

// ========== Public API ==========

/**
 * Encrypt plaintext. Returns JSON-serializable payload, or the original
 * plaintext if crypto.subtle is unavailable.
 */
export async function encrypt(plaintext: string): Promise<string | EncryptedPayload> {
  if (!isCryptoAvailable) return plaintext

  const key = await getOrCreateKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)

  const cipherBuf = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as BufferSource },
    key,
    encoded as BufferSource,
  )

  return { iv: toBase64(iv), data: toBase64(new Uint8Array(cipherBuf)) }
}

/**
 * Decrypt an encrypted payload. Returns the original plaintext,
 * or the raw string as-is if not encrypted.
 */
export async function decrypt(payload: EncryptedPayload | string): Promise<string> {
  if (!isCryptoAvailable) return typeof payload === 'string' ? payload : JSON.stringify(payload)

  const p = typeof payload === 'string' ? JSON.parse(payload) : payload
  if (!p?.iv || !p?.data) return typeof payload === 'string' ? payload : JSON.stringify(payload)

  const key = await getOrCreateKey()
  const iv = fromBase64(p.iv)
  const data = fromBase64(p.data)

  const plainBuf = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv as BufferSource },
    key,
    data as BufferSource,
  )

  return new TextDecoder().decode(plainBuf)
}

/**
 * Check if a string looks like an encrypted payload.
 */
export function isEncryptedPayload(str: string): boolean {
  try {
    const obj = JSON.parse(str)
    return typeof obj === 'object' && obj !== null
      && typeof obj.iv === 'string' && typeof obj.data === 'string'
  } catch {
    return false
  }
}
