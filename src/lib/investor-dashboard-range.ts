const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type InvestorRangePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last15"
  | "last30"
  | "lastWeek"
  | "lastMonth"
  | "custom";

export interface InvestorDateRange {
  preset: InvestorRangePreset;
  from: Date;
  to: Date;
  label: string;
}

export const investorRangeLabels: Record<InvestorRangePreset, string> = {
  today: "今日",
  yesterday: "昨日",
  last7: "最近7天",
  last15: "最近15天",
  last30: "最近30天",
  lastWeek: "上周",
  lastMonth: "上月",
  custom: "自定义",
};

export function resolveInvestorDateRange(opts: {
  preset?: string;
  from?: string;
  to?: string;
  now?: Date;
}): InvestorDateRange {
  const preset = isPreset(opts.preset) ? opts.preset : "last7";
  const shNow = toShanghaiWallTime(opts.now ?? new Date());
  let from: Date;
  let to: Date;

  if (preset === "custom") {
    const parsedFrom = parseDateOnly(opts.from);
    const parsedTo = parseDateOnly(opts.to);
    from = startOfDaySH(parsedFrom ?? shNow);
    to = endOfDaySH(parsedTo ?? parsedFrom ?? shNow);
  } else if (preset === "today") {
    from = startOfDaySH(shNow);
    to = endOfDaySH(shNow);
  } else if (preset === "yesterday") {
    const d = addDays(shNow, -1);
    from = startOfDaySH(d);
    to = endOfDaySH(d);
  } else if (preset === "last7") {
    from = startOfDaySH(addDays(shNow, -6));
    to = endOfDaySH(shNow);
  } else if (preset === "last15") {
    from = startOfDaySH(addDays(shNow, -14));
    to = endOfDaySH(shNow);
  } else if (preset === "last30") {
    from = startOfDaySH(addDays(shNow, -29));
    to = endOfDaySH(shNow);
  } else if (preset === "lastWeek") {
    const day = shNow.getDay() || 7;
    const thisMonday = addDays(shNow, -day + 1);
    const lastMonday = addDays(thisMonday, -7);
    from = startOfDaySH(lastMonday);
    to = endOfDaySH(addDays(lastMonday, 6));
  } else {
    const year = shNow.getMonth() === 0 ? shNow.getFullYear() - 1 : shNow.getFullYear();
    const month = shNow.getMonth() === 0 ? 11 : shNow.getMonth() - 1;
    from = new Date(year, month, 1);
    to = endOfDaySH(new Date(year, month + 1, 0));
  }

  if (to < from) to = endOfDaySH(from);

  return {
    preset,
    from: toUTC(from),
    to: toUTC(to),
    label:
      preset === "custom"
        ? `${formatDateOnly(from)} 至 ${formatDateOnly(to)}`
        : investorRangeLabels[preset],
  };
}

export function formatDateOnly(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dateKeyInShanghai(date: Date) {
  return formatDateOnly(toShanghaiWallTime(date));
}

export function eachShanghaiDay(fromUtc: Date, toUtc: Date) {
  const from = startOfDaySH(toShanghaiWallTime(fromUtc));
  const to = startOfDaySH(toShanghaiWallTime(toUtc));
  const result: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    result.push(formatDateOnly(d));
  }
  return result;
}

function isPreset(value?: string): value is InvestorRangePreset {
  return (
    value === "today" ||
    value === "yesterday" ||
    value === "last7" ||
    value === "last15" ||
    value === "last30" ||
    value === "lastWeek" ||
    value === "lastMonth" ||
    value === "custom"
  );
}

function parseDateOnly(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toShanghaiWallTime(date: Date) {
  return new Date(date.getTime() + date.getTimezoneOffset() * 60_000 + SHANGHAI_OFFSET_MS);
}

function toUTC(shanghaiDate: Date) {
  return new Date(shanghaiDate.getTime() - SHANGHAI_OFFSET_MS);
}

function startOfDaySH(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDaySH(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}
