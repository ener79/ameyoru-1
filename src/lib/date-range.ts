/**
 * 本地时区下的"今天/本周/本月"区间。
 * 周一为一周第一天。
 */
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";

export type RangeKey = "today" | "week" | "month";

export function rangeOf(key: RangeKey, now: Date = new Date()) {
  switch (key) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "week":
      return {
        from: startOfWeek(now, { weekStartsOn: 1 }),
        to: endOfWeek(now, { weekStartsOn: 1 }),
      };
    case "month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
  }
}

export const rangeLabel: Record<RangeKey, string> = {
  today: "今日",
  week: "本周",
  month: "本月",
};
