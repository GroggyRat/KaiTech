import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/auth/login", "/auth/register", "/auth/callback"];

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Never block API routes or static files
  if (
    path.startsWith("/api/") ||
    path.startsWith("/_next/") ||
    path.startsWith("/favicon") ||
    path.includes(".")
  ) {
    return NextResponse.next();
  }

  const isPublicPath = PUBLIC_PATHS.some(
    (p) => path === p || path.startsWith(p + "/")
  );

  // Check for auth cookie manually (no Supabase, no JWT verification)
  const authCookie = request.cookies.getAll().find(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );

  const hasSession = !!authCookie?.value;

  // No session + protected route → login
  if (!hasSession && !isPublicPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("redirectedFrom", path);
    return NextResponse.redirect(loginUrl);
  }

  // Has session + login page → home
  if (hasSession && isPublicPath) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};