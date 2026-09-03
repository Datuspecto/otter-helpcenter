/** 비밀번호 1개 + 서명 쿠키. 편집자가 1~2명이라 계정 관리는 두지 않습니다. */
const COOKIE = 'oh_admin'
const MAX_AGE = 60 * 60 * 24 * 14   // 2주

const enc = new TextEncoder()
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(msg)))
}

export async function makeToken(env) {
  const exp = String(Date.now() + MAX_AGE * 1000)
  return `${exp}.${await hmac(env.SESSION_SECRET, exp)}`
}

export async function verifyToken(env, token) {
  if (!token || !token.includes('.')) return false
  const [exp, sig] = token.split('.')
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false
  const expected = await hmac(env.SESSION_SECRET, exp)
  // 타이밍 차이를 줄이기 위해 길이 확인 후 문자 단위 비교
  if (sig.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

export function readCookie(request, name = COOKIE) {
  const raw = request.headers.get('cookie') || ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

export function sessionCookie(token, base) {
  return `${COOKIE}=${token}; Path=${base}/admin; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`
}
export function clearCookie(base) {
  return `${COOKIE}=; Path=${base}/admin; HttpOnly; SameSite=Lax; Max-Age=0`
}

export async function isAuthed(request, env) {
  return verifyToken(env, readCookie(request))
}
