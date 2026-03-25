import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = request.cookies.get(AUTH_COOKIE_NAME)?.value

  if (pathname.startsWith("/dashboard")) {
    if (!session) {
      const login = new URL("/login", request.url)
      login.searchParams.set("from", pathname)
      return NextResponse.redirect(login)
    }
  }

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
}
