(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push(["chunks/[root-of-the-server]__27755b18._.js",
"[externals]/node:buffer [external] (node:buffer, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:buffer", () => require("node:buffer"));

module.exports = mod;
}),
"[externals]/node:async_hooks [external] (node:async_hooks, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:async_hooks", () => require("node:async_hooks"));

module.exports = mod;
}),
"[project]/Documents/openmind/frontend/lib/auth-session.ts [middleware-edge] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AUTH_COOKIE_NAME",
    ()=>AUTH_COOKIE_NAME
]);
const AUTH_COOKIE_NAME = "openmind_session";
}),
"[project]/Documents/openmind/frontend/middleware.ts [middleware-edge] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "config",
    ()=>config,
    "middleware",
    ()=>middleware
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$openmind$2f$frontend$2f$node_modules$2f$next$2f$dist$2f$esm$2f$api$2f$server$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/Documents/openmind/frontend/node_modules/next/dist/esm/api/server.js [middleware-edge] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$openmind$2f$frontend$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/openmind/frontend/node_modules/next/dist/esm/server/web/exports/index.js [middleware-edge] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$openmind$2f$frontend$2f$lib$2f$auth$2d$session$2e$ts__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/openmind/frontend/lib/auth-session.ts [middleware-edge] (ecmascript)");
;
;
function middleware(request) {
    const { pathname } = request.nextUrl;
    const session = request.cookies.get(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$openmind$2f$frontend$2f$lib$2f$auth$2d$session$2e$ts__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["AUTH_COOKIE_NAME"])?.value;
    if (pathname.startsWith("/dashboard")) {
        if (!session) {
            const login = new URL("/login", request.url);
            login.searchParams.set("from", pathname);
            return __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$openmind$2f$frontend$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].redirect(login);
        }
    }
    if (pathname === "/login" && session) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$openmind$2f$frontend$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL("/dashboard", request.url));
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$openmind$2f$frontend$2f$node_modules$2f$next$2f$dist$2f$esm$2f$server$2f$web$2f$exports$2f$index$2e$js__$5b$middleware$2d$edge$5d$__$28$ecmascript$29$__["NextResponse"].next();
}
const config = {
    matcher: [
        "/dashboard/:path*",
        "/login"
    ]
};
}),
]);

//# sourceMappingURL=%5Broot-of-the-server%5D__27755b18._.js.map