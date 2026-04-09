/**
 * AES-256-GCM encryption/decryption using the Web Crypto API.
 *
 * Two modes:
 * 1. Key-based (encrypt/decrypt) — uses a raw AES-256 key for transparent
 *    document encryption (imported docs are stored encrypted on the server).
 * 2. Password-based (encryptWithPassword/decryptWithPassword) — uses PBKDF2
 *    key derivation for future per-document password support.
 */

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const PBKDF2_ITERATIONS = 100_000

export interface EncryptedPayload {
  salt: string   // base64
  iv: string     // base64
  data: string   // base64
}

function toBase64(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf
}

// ========== Auto-managed key ==========

const STORAGE_KEY = 'insighthub:enc-key'

function getRawKey(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

function setRawKey(b64: string): void {
  localStorage.setItem(STORAGE_KEY, b64)
}

/**
 * Get or create the app-level AES-256 encryption key.
 * The key is stored in localStorage as a base64-encoded raw key.
 */
async function getOrCreateKey(): Promise<CryptoKey> {
  const existing = getRawKey()
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
  // Generate a new random 256-bit key
  const raw = crypto.getRandomValues(new Uint8Array(32))
  setRawKey(toBase64(raw))
  return crypto.subtle.importKey(
    'raw',
    raw as BufferSource,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt'] as KeyUsage[],
  )
}

// ========== Key-based encrypt/decrypt (transparent) ==========

/**
 * Encrypt plaintext with the app-level key. Returns JSON-serializable payload.
 */
export async function encrypt(plaintext: string): Promise<EncryptedPayload> {
  const key = await getOrCreateKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)

  const cipherBuf = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as BufferSource },
    key,
    encoded as BufferSource,
  )

  return {
    salt: '', // not needed for raw-key mode
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(cipherBuf)),
  }
}

/**
 * Decrypt an encrypted payload with the app-level key.
 * Throws if data is corrupted or key has changed.
 */
export async function decrypt(payload: EncryptedPayload): Promise<string> {
  const key = await getOrCreateKey()
  const iv = fromBase64(payload.iv)
  const data = fromBase64(payload.data)

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
