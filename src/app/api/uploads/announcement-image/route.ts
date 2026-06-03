import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { auth } from "@/lib/auth";
import { readImageUpload } from "@/lib/image-upload";

const UPLOAD_ROOT = join(process.cwd(), "uploads");
const MAX_BYTES = 10 * 1024 * 1024;

function nanoid(len = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (role !== "BOSS" && role !== "STAFF") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "请选择图片" }, { status: 400 });
  }

  const result = await readImageUpload(file, {
    maxBytes: MAX_BYTES,
    label: "公告图片",
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const filename = `${nanoid()}.${result.upload.ext}`;
  const dir = join(UPLOAD_ROOT, "announcements");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), result.upload.bytes);

  return Response.json({
    url: `/api/uploads/announcements/${filename}`,
  });
}
