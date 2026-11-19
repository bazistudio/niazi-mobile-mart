/**
 * Pakistan Standard Time (PKT, UTC+5) date-range and currency utilities
 * for the Niazi Mobile Mart Enterprise Command Center dashboard.
 *
 * Ensures day boundaries (00:00:00–23:59:59.999 PKT) never shift onto the
 * previous UTC date between 00:00 and 04:59 PKT.
 */

export type DashboardDatePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'prev_month'
  | 'this_year'
  | 'custom';

export type ChartBucketMode = 'hourly' | 'daily' | 'monthly';

export interface DashboardDateRange {
  preset: DashboardDatePreset;
  /** YYYY-MM-DD in PKT */
  startDate: string;
  /** YYYY-MM-DD in PKT */
  endDate: string;
  /** PKT 00:00:00.000 converted to UTC ISO timestamp */
  startIso: string;
  /** PKT 23:59:59.999 converted to UTC ISO timestamp */
  endIso: string;
  /** Equivalent comparison period start (YYYY-MM-DD in PKT) */
  prevStartDate: string;
  /** Equivalent comparison period end (YYYY-MM-DD in PKT) */
  prevEndDate: string;
  prevStartIso: string;
  prevEndIso: string;
  label: string;
  comparisonLabel: string;
  isSingleDay: boolean;
  bucketMode: ChartBucketMode;
}

export const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatYmd(year: number, monthIndex0: number, day: number): string {
  return `${year}-${pad2(monthIndex0 + 1)}-${pad2(day)}`;
}

function parseYmdParts(ymd: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function getDaysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

function addDaysYmd(ymd: string, deltaDays: number): string {
  const p = parseYmdParts(ymd);
  if (!p) return ymd;
  const d = new Date(Date.UTC(p.year, p.month, p.day + deltaDays));
  return formatYmd(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function diffDaysInclusive(startYmd: string, endYmd: string): number {
  const a = parseYmdParts(startYmd);
  const b = parseYmdParts(endYmd);
  if (!a || !b) return 1;
  const msA = Date.UTC(a.year, a.month, a.day);
  const msB = Date.UTC(b.year, b.month, b.day);
  return Math.max(1, Math.round((msB - msA) / 86_400_000) + 1);
}

/** Returns current wall-clock date string in Pakistan (UTC+5) as YYYY-MM-DD. */
export function getPktTodayDateStr(nowMs: number = Date.now()): string {
  const pkt = new Date(nowMs + PKT_OFFSET_MS);
  return formatYmd(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate());
}

/** Converts YYYY-MM-DD in PKT to UTC ISO string at 00:00:00.000 PKT. */
export function pktDateStartIso(ymd: string): string {
  const p = parseYmdParts(ymd);
  if (!p) return ymd;
  return new Date(Date.UTC(p.year, p.month, p.day, 0, 0, 0, 0) - PKT_OFFSET_MS).toISOString();
}

/** Converts YYYY-MM-DD in PKT to UTC ISO string at 23:59:59.999 PKT. */
export function pktDateEndIso(ymd: string): string {
  const p = parseYmdParts(ymd);
  if (!p) return ymd;
  return new Date(Date.UTC(p.year, p.month, p.day, 23, 59, 59, 999) - PKT_OFFSET_MS).toISOString();
}

/** Converts an ISO timestamp or YYYY-MM-DD string to PKT YYYY-MM-DD date key. */
export function toPktDateKey(input: string | null | undefined): string | null {
  if (!input) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) return input.trim();
  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) return null;
  const pkt = new Date(parsed + PKT_OFFSET_MS);
  return formatYmd(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate());
}

/** Returns PKT hour (0-23) for an ISO timestamp, or null if invalid. */
export function toPktHour(input: string | null | undefined): number | null {
  if (!input) return null;
  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) return null;
  const pkt = new Date(parsed + PKT_OFFSET_MS);
  return pkt.getUTCHours();
}

/** Returns YYYY-MM in PKT for an ISO timestamp or YYYY-MM-DD string. */
export function toPktMonthKey(input: string | null | undefined): string | null {
  const ymd = toPktDateKey(input);
  return ymd ? ymd.slice(0, 7) : null;
}

export function formatShortPktDate(ymd: string): string {
  const p = parseYmdParts(ymd);
  if (!p) return ymd;
  return `${pad2(p.day)} ${SHORT_MONTHS[p.month]}`;
}

export function formatShortPktMonth(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const monthIdx = Number(m[2]) - 1;
  return `${SHORT_MONTHS[monthIdx] ?? m[2]} ${m[1].slice(2)}`;
}

/** Enumerates every PKT YYYY-MM-DD date between startDate and endDate (inclusive, capped safely). */
export function enumeratePktDates(startDate: string, endDate: string, maxDays: number = 95): string[] {
  const span = diffDaysInclusive(startDate, endDate);
  const count = Math.min(span, maxDays);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(addDaysYmd(startDate, i));
  }
  return out;
}

/** Enumerates every YYYY-MM month between startDate and endDate inclusive. */
export function enumeratePktMonths(startDate: string, endDate: string): string[] {
  const a = parseYmdParts(startDate);
  const b = parseYmdParts(endDate);
  if (!a || !b) return [];
  const out: string[] = [];
  let y = a.year;
  let m = a.month;
  for (let guard = 0; guard < 36; guard++) {
    out.push(`${y}-${pad2(m + 1)}`);
    if (y === b.year && m === b.month) break;
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

/** Resolves a preset + optional custom bounds into a complete PKT DashboardDateRange. */
export function resolveDateRange(
  preset: DashboardDatePreset,
  customStart?: string,
  customEnd?: string,
  nowMs: number = Date.now()
): DashboardDateRange {
  const today = getPktTodayDateStr(nowMs);
  const todayParts = parseYmdParts(today)!;

  let startDate = today;
  let endDate = today;
  let prevStartDate = addDaysYmd(today, -1);
  let prevEndDate = addDaysYmd(today, -1);
  let label = 'Today';
  let comparisonLabel = 'vs Yesterday';

  switch (preset) {
    case 'today': {
      startDate = today;
      endDate = today;
      prevStartDate = addDaysYmd(today, -1);
      prevEndDate = prevStartDate;
      label = `Today (${formatShortPktDate(today)})`;
      comparisonLabel = 'vs Yesterday';
      break;
    }
    case 'yesterday': {
      const yest = addDaysYmd(today, -1);
      startDate = yest;
      endDate = yest;
      prevStartDate = addDaysYmd(yest, -1);
      prevEndDate = prevStartDate;
      label = `Yesterday (${formatShortPktDate(yest)})`;
      comparisonLabel = 'vs Prior Day';
      break;
    }
    case 'this_week': {
      const pktNow = new Date(Date.UTC(todayParts.year, todayParts.month, todayParts.day));
      const dow = pktNow.getUTCDay(); // 0=Sun..6=Sat
      const daysSinceMonday = (dow + 6) % 7;
      startDate = addDaysYmd(today, -daysSinceMonday);
      endDate = today;
      prevStartDate = addDaysYmd(startDate, -7);
      prevEndDate = addDaysYmd(endDate, -7);
      label = `This Week (${formatShortPktDate(startDate)} – ${formatShortPktDate(endDate)})`;
      comparisonLabel = 'vs Prev Week';
      break;
    }
    case 'this_month': {
      startDate = formatYmd(todayParts.year, todayParts.month, 1);
      endDate = today;
      const pmYear = todayParts.month === 0 ? todayParts.year - 1 : todayParts.year;
      const pmMonth = todayParts.month === 0 ? 11 : todayParts.month - 1;
      const pmDays = getDaysInMonth(pmYear, pmMonth);
      prevStartDate = formatYmd(pmYear, pmMonth, 1);
      prevEndDate = formatYmd(pmYear, pmMonth, Math.min(todayParts.day, pmDays));
      label = `${SHORT_MONTHS[todayParts.month]} ${todayParts.year} MTD`;
      comparisonLabel = `vs ${SHORT_MONTHS[pmMonth]} 1–${Math.min(todayParts.day, pmDays)}`;
      break;
    }
    case 'prev_month': {
      const pmYear = todayParts.month === 0 ? todayParts.year - 1 : todayParts.year;
      const pmMonth = todayParts.month === 0 ? 11 : todayParts.month - 1;
      const pmLastDay = getDaysInMonth(pmYear, pmMonth);
      startDate = formatYmd(pmYear, pmMonth, 1);
      endDate = formatYmd(pmYear, pmMonth, pmLastDay);

      const ppmYear = pmMonth === 0 ? pmYear - 1 : pmYear;
      const ppmMonth = pmMonth === 0 ? 11 : pmMonth - 1;
      prevStartDate = formatYmd(ppmYear, ppmMonth, 1);
      prevEndDate = formatYmd(ppmYear, ppmMonth, getDaysInMonth(ppmYear, ppmMonth));
      label = `${SHORT_MONTHS[pmMonth]} ${pmYear}`;
      comparisonLabel = `vs ${SHORT_MONTHS[ppmMonth]} ${ppmYear}`;
      break;
    }
    case 'this_year': {
      startDate = formatYmd(todayParts.year, 0, 1);
      endDate = today;
      const pyYear = todayParts.year - 1;
      const pyDays = getDaysInMonth(pyYear, todayParts.month);
      prevStartDate = formatYmd(pyYear, 0, 1);
      prevEndDate = formatYmd(pyYear, todayParts.month, Math.min(todayParts.day, pyDays));
      label = `FY ${todayParts.year} YTD`;
      comparisonLabel = `vs ${pyYear} YTD`;
      break;
    }
    case 'custom': {
      const rawStart = parseYmdParts(customStart || '') ? customStart! : today;
      const rawEnd = parseYmdParts(customEnd || '') ? customEnd! : today;
      if (rawStart <= rawEnd) {
        startDate = rawStart;
        endDate = rawEnd;
      } else {
        startDate = rawEnd;
        endDate = rawStart;
      }
      const span = diffDaysInclusive(startDate, endDate);
      prevEndDate = addDaysYmd(startDate, -1);
      prevStartDate = addDaysYmd(prevEndDate, -(span - 1));
      label =
        startDate === endDate
          ? formatShortPktDate(startDate)
          : `${formatShortPktDate(startDate)} – ${formatShortPktDate(endDate)}`;
      comparisonLabel = `vs Prior ${span}d`;
      break;
    }
  }

  const isSingleDay = startDate === endDate;
  const span = diffDaysInclusive(startDate, endDate);
  const bucketMode: ChartBucketMode = isSingleDay
    ? 'hourly'
    : preset === 'this_year' || span > 62
    ? 'monthly'
    : 'daily';

  return {
    preset,
    startDate,
    endDate,
    startIso: pktDateStartIso(startDate),
    endIso: pktDateEndIso(endDate),
    prevStartDate,
    prevEndDate,
    prevStartIso: pktDateStartIso(prevStartDate),
    prevEndIso: pktDateEndIso(prevEndDate),
    label,
    comparisonLabel,
    isSingleDay,
    bucketMode,
  };
}

/** Whole-rupee PKR formatting (matches backend BIGINT currency storage). */
export function formatPkr(value: number | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 'Rs 0';
  const rounded = Math.round(num);
  if (rounded < 0) {
    return `-Rs ${Math.abs(rounded).toLocaleString('en-PK')}`;
  }
  return `Rs ${rounded.toLocaleString('en-PK')}`;
}

/** Compact PKR formatting for chart Y-axes so labels never overflow. */
export function formatCompactPkr(value: number | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 'Rs 0';
  const abs = Math.abs(num);
  const prefix = num < 0 ? '-Rs ' : 'Rs ';
  if (abs >= 1_000_000) return `${prefix}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${prefix}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${prefix}${Math.round(abs).toLocaleString('en-PK')}`;
}

/** Percentage delta compared with prior equivalent period. Returns null when prior baseline is zero. */
export function computePercentDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}
