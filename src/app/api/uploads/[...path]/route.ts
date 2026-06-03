import { readFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { auth } from "@/lib/auth";
import { contentTypeForImageExt } from "@/lib/image-upload";

const UPLOAD_ROOT = resolve(process.cwd(), "uploads");

function resolveUploadPath(parts: string[]): string | null {
  if (parts.length === 0) return null;
  if (
    parts.some(
      (part) =>
        part === "." ||
        part === ".." ||
        part.includes("/") ||
        part.includes("\\") ||
        part.includes("\0")
    )
  ) {
    return null;
  }

  const fullPath = resolve(UPLOAD_ROOT, ...parts);
  const rel = relative(UPLOAD_ROOT, fullPath);
  if (rel === "" || rel.startsWith("..") || rel.includes(`..${sep}`)) {
    return null;
  }
  return fullPath;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { path } = await params;
  const fullPath = resolveUploadPath(path);
  if (!fullPath) {
    return new Response("Not found", { status: 404 });
  }

  const ext = extname(fullPath).slice(1);
  const contentType = contentTypeForImageExt(ext);
  if (!contentType) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const bytes = await readFile(fullPath);
    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
