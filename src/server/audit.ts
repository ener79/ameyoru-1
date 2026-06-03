import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { nanoid } from "./id";

export async function logAudit(opts: {
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId?: string;
  detail?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLog).values({
      id: nanoid(),
      actorId: opts.actorId,
      actorName: opts.actorName,
      action: opts.action,
      targetType: opts.targetType,
      targetId: opts.targetId ?? null,
      detail: opts.detail ? JSON.stringify(opts.detail) : null,
    });
  } catch (e) {
    // 日志失败不阻断业务,但记录到控制台便于排查
    console.error("[audit] logAudit failed:", e);
  }
}
