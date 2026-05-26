/** 把"分"格式化成 ¥xx.xx */
export function formatYuan(cents: number): string {
  if (!Number.isFinite(cents)) return "¥0.00";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}¥${(abs / 100).toFixed(2)}`;
}

/** 把"分"格式化成数字(不带¥),用于表单输入 */
export function centsToYuanString(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

/** 用户输入的元(可能带小数)转为整数分 */
export function yuanStringToCents(yuan: string): number {
  const n = parseFloat(yuan);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** 时长分钟数格式化为 "2h20" 风格 */
export function formatDuration(min: number): string {
  if (min < 0) return "0";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

const pad = (n: number) => n.toString().padStart(2, "0");

function toDate(date: Date | string | number): Date {
  return date instanceof Date ? date : new Date(date);
}

function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 日期时间 yyyy-MM-dd HH:mm */
export function formatDateTime(date: Date | string | number): string {
  const d = toDate(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${formatTime(d)}`;
}

/** 给 startAt + durationMin 算结束时间。同日只显示 HH:mm,跨日显示完整时间。 */
export function formatEndAt(
  startAt: Date | string | number,
  durationMin: number
): string {
  const s = toDate(startAt);
  const e = new Date(s.getTime() + durationMin * 60000);
  const sameDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();
  return sameDay ? formatTime(e) : formatDateTime(e);
}

/** 仅日期 yyyy-MM-dd */
export function formatDate(date: Date | string | number): string {
  const d = toDate(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "今天 14:30" / "昨天 14:30" / "5月20日 14:30" / "2025年5月20日 14:30" */
export function formatRelativeDateTime(date: Date | string | number): string {
  const d = toDate(date);
  const now = new Date();
  const time = formatTime(d);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(d, now)) return `今天 ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(d, yesterday)) return `昨天 ${time}`;
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
}

/** 取显示名的首字符做头像(中文取最后一字,英文取首字母) */
export function avatarInitial(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "?";
  if (/[一-鿿]/.test(trimmed)) return trimmed.slice(-1);
  return trimmed.charAt(0).toUpperCase();
}
