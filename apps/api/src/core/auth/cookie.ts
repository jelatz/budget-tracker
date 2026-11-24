import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';

export const SESSION_COOKIE_NAME = 'bt_session';
export const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function isSecureCookieRequest(c: Context): boolean {
  if (process.env.NODE_ENV === 'production') {
    return true;
  }
  const forwardedProto = c.req.header('x-forwarded-proto')?.toLowerCase();
  if (forwardedProto === 'https') {
    return true;
  }
  return c.req.url.toLowerCase().startsWith('https://');
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureCookieRequest(c),
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureCookieRequest(c),
  });
}
