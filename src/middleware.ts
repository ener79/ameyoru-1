import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);

  const isLogin = pathname === "/login";
  const isPlayerInvite = pathname.startsWith("/player-invite");
  const forceLogin = request.nextUrl.searchParams.has("inactive");

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
