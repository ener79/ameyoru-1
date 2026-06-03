import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export async function POST(request: Request) {
  const { pathname } = new URL(request.url);
  if (pathname === "/api/auth/sign-up/email") {
    return Response.json({ error: "注册入口已关闭" }, { status: 403 });
  }
  return handlers.POST(request);
}
