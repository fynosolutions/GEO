import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
const cookieName = 'geo_session';
const lifetime = 8 * 60 * 60;
const digest = (value: string) => createHash('sha256').update(value).digest();
export function authenticated(request: IncomingMessage, token: string, now = Date.now()): boolean {
  if (!token) return false;
  const authorization = request.headers.authorization;
  if (authorization?.startsWith('Bearer ') && timingSafeEqual(digest(authorization.slice(7)), digest(token))) return true;
  const cookie = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  if (!cookie) return false;
  const parts = cookie.split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) return false;
  const expires = Number(parts[0]);
  if (expires <= now || expires > now + lifetime * 1000) return false;
  const expected = createHmac('sha256', token).update(parts[0] + '.' + parts[1]).digest('hex');
  return timingSafeEqual(digest(parts[2]), digest(expected));
}
export function sessionCookie(token: string, secure = false, now = Date.now()): string {
  const value = `${now + lifetime * 1000}.${randomBytes(16).toString('hex')}`;
  const signature = createHmac('sha256', token).update(value).digest('hex');
  return `${cookieName}=${value}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${lifetime}${secure ? '; Secure' : ''}`;
}
