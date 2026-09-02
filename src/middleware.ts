import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_TRAVA, travaValida } from "@/lib/trava";

const LIVRES = ["/entrar", "/api/trava", "/api/saude"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (LIVRES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  if (await travaValida(request.cookies.get(COOKIE_TRAVA)?.value)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/entrar", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
