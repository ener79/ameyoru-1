import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);

  const isLogin = pathname === "/login";
  const isPlayerInvite = pathname.startsWith("/player-invite");
  // inactive: 用户被停用;stale: cookie 还在但 session DB 失效。
  // 这两个 param 一旦带上,即便 cookie 还在也允许进 /login,避免死循环。
  const forceLogin =
    request.nextUrl.searchParams.has("inactive") ||
    request.nextUrl.searchParams.has("stale");

  // 邀请链接无需登录
  if (isPlayerInvite) return NextResponse.next();

  if (!sessionCookie) {
    if (isLogin) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isLogin && forceLogin) return NextResponse.next();

  if (isLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
