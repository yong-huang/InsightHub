/**
 * AES-256-GCM encryption/decryption using the Web Crypto API.
 * Uses PBKDF2 to derive a 256-bit key from a user password + random salt.
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

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'] as KeyUsage[],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'] as KeyUsage[],
  )
}

/**
 * Encrypt a plaintext string with a password.
 * Returns a JSON-serializable payload (salt, iv, data all base64).
 */
export async function encrypt(plaintext: string, password: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const encoded = new TextEncoder().encode(plaintext)

  const cipherBuf = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as BufferSource },
    key,
    encoded as BufferSource,
  )

  return {
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(cipherBuf)),
  }
}

/**
 * Decrypt an encrypted payload back to the original plaintext string.
 * Throws if the password is wrong or data is corrupted.
 */
export async function decrypt(payload: EncryptedPayload, password: string): Promise<string> {
  const salt = fromBase64(payload.salt)
  const iv = fromBase64(payload.iv)
  const data = fromBase64(payload.data)

  const key = await deriveKey(password, salt)
  const plainBuf = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv as BufferSource },
    key,
    data as BufferSource,
  )

  return new TextDecoder().decode(plainBuf)
}
