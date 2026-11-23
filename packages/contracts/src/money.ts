import { z } from 'zod';

export const DEFAULT_CURRENCY = 'PHP' as const;
export const DEFAULT_CURRENCY_SYMBOL = '₱' as const;

export const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(3)
  .default(DEFAULT_CURRENCY);

export const MAX_SAFE_MONEY_MINOR = 1_000_000_000_000_000;

export const amountMinorSchema = z
  .number()
  .int()
  .min(-MAX_SAFE_MONEY_MINOR)
  .max(MAX_SAFE_MONEY_MINOR);

export const positiveAmountMinorSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_SAFE_MONEY_MINOR);

/**
 * Formats an integer minor unit amount into a localized currency string.
 * e.g. 1250 -> "₱12.50", -400 -> "-₱4.00", 0 -> "₱0.00"
 */
export function formatMinorUnits(
  amountMinor: number,
  currency: string = DEFAULT_CURRENCY,
): string {
  const normalizedAmount = amountMinor === 0 ? 0 : amountMinor / 100;
  const locale = currency === 'PHP' ? 'en-PH' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(normalizedAmount);
}

/**
 * Converts integer minor units to a clean calculator decimal string.
 * e.g. 12000 -> "120", 1250 -> "12.5", 1205 -> "12.05", 0 -> "0"
 */
export function minorUnitsToDecimalInput(amountMinor: number): string {
  if (amountMinor === 0) {
    return '0';
  }
  const isNegative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const major = Math.floor(abs / 100);
  const minor = abs % 100;

  const prefix = isNegative ? '-' : '';
  if (minor === 0) {
    return `${prefix}${major}`;
  }
  if (minor % 10 === 0) {
    return `${prefix}${major}.${minor / 10}`;
  }
  return `${prefix}${major}.${minor.toString().padStart(2, '0')}`;
}

/**
 * Normalizes live decimal input strings across mobile/web locales:
 * - Strips whitespace
 * - Converts a regional decimal comma (e.g. "12,", "12,5", "12,50", ",") to "."
 * - Strips thousands commas when commas appear alongside "." or in 3-digit groups (e.g. "1,234.56", "1,234")
 */
export function normalizeDecimalInput(input: string): string {
  const compact = input.replace(/\s+/g, '');
  if (!compact.includes(',')) {
    return compact;
  }
  if (compact.includes('.')) {
    return compact.replace(/,/g, '');
  }
  const commaCount = (compact.match(/,/g) ?? []).length;
  if (commaCount === 1 && /,\d{0,2}$/.test(compact)) {
    return compact.replace(',', '.');
  }
  return compact.replace(/,/g, '');
}

/**
 * Parses a decimal string (up to 2 decimal places, optional leading -) into integer minor units
 * using exact string/integer math without float drift.
 * Returns null if invalid or exceeds 2 decimal places.
 * e.g. "12" -> 1200, "12.5" -> 1250, "12.55" -> 1255, "" or "." -> 0, invalid -> null
 */
export function parseDecimalToMinorUnits(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '' || trimmed === '.' || trimmed === '-' || trimmed === '-.') {
    return 0;
  }

  const match = trimmed.match(/^(-)?(\d+)?(?:\.(\d+))?$/);
  if (!match) {
    return null;
  }

  const [, sign, intPart, decPart] = match;

  if (decPart && decPart.length > 2) {
    return null;
  }

  if (!intPart && !decPart) {
    return 0;
  }

  const isNegative = sign === '-';
  const whole = intPart ? parseInt(intPart, 10) : 0;
  let fraction = 0;

  if (decPart) {
    if (decPart.length === 1) {
      fraction = parseInt(decPart, 10) * 10;
    } else if (decPart.length === 2) {
      fraction = parseInt(decPart, 10);
    }
  }

  const total = whole * 100 + fraction;
  return isNegative && total !== 0 ? -total : total;
}

/**
 * Returns totalMinor - sum(splitAmountsMinor).
 */
export function computeSplitRemainder(
  totalMinor: number,
  splitAmountsMinor: readonly number[],
): number {
  const sum = splitAmountsMinor.reduce((acc, curr) => acc + curr, 0);
  return totalMinor - sum;
}

/**
 * Balances a two-way split returning [firstSplitMinor, Math.max(0, totalMinor - firstSplitMinor)].
 */
export function rebalanceTwoWaySplit(
  totalMinor: number,
  firstSplitMinor: number,
): [number, number] {
  return [firstSplitMinor, Math.max(0, totalMinor - firstSplitMinor)];
}

/**
 * Divides totalMinor integer minor units evenly among count buckets.
 * Places any remainder (odd cents) into the first bucket so that sum(result) === totalMinor.
 */
export function splitEvenly(totalMinor: number, count: number): number[] {
  if (count <= 0) {
    return [];
  }
  const base = Math.floor(totalMinor / count);
  const remainder = totalMinor - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base));
}

