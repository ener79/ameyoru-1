/**
 * 上海时区下的"今天/本周/本月"区间。
 * 周一为一周第一天。
 * 不依赖 process.env.TZ — 始终用 +08:00 偏移计算。
 */

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function shanghaiNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset() * 60_000 + SHANGHAI_OFFSET_MS);
}

function startOfDaySH(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDaySH(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function toUTC(shanghaiDate: Date): Date {
  return new Date(shanghaiDate.getTime() - SHANGHAI_OFFSET_MS);
}

export type RangeKey = "today" | "week" | "month";

export function rangeOf(key: RangeKey, now?: Date) {
  const sh = now
    ? new Date(now.getTime() + now.getTimezoneOffset() * 60_000 + SHANGHAI_OFFSET_MS)
    : shanghaiNow();

  let from: Date;
  let to: Date;

  switch (key) {
    case "today":
      from = startOfDaySH(sh);
      to = endOfDaySH(sh);
      break;
    case "week": {
      const day = sh.getDay() || 7;
      const monday = new Date(sh);
      monday.setDate(sh.getDate() - day + 1);
      from = startOfDaySH(monday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      to = endOfDaySH(sunday);
      break;
    }
    case "month":
      from = new Date(sh.getFullYear(), sh.getMonth(), 1);
      to = endOfDaySH(new Date(sh.getFullYear(), sh.getMonth() + 1, 0));
      break;
  }

  return { from: toUTC(from), to: toUTC(to) };
}

export const rangeLabel: Record<RangeKey, string> = {
  today: "今日",
  week: "本周",
  month: "本月",
};
