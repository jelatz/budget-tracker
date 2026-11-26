import { describe, expect, it } from 'vitest';
import {
  parseAccountsTabParam,
  parseDebtsTabParam,
} from '../index';

describe('Dashboard Route Tab Param Parsers', () => {
  describe('parseAccountsTabParam', () => {
    it('parses canonical and legacy values', () => {
      expect(parseAccountsTabParam('accounts')).toBe('ACCOUNTS');
      expect(parseAccountsTabParam('paydays')).toBe('PAYDAYS');
      expect(parseAccountsTabParam('income-sources')).toBe('PAYDAYS');
      expect(parseAccountsTabParam('salary')).toBe('PAYDAYS');
    });

    it('normalizes uppercase and surrounding whitespace', () => {
      expect(parseAccountsTabParam('  ACCOUNTS  ')).toBe('ACCOUNTS');
      expect(parseAccountsTabParam('  Paydays  ')).toBe('PAYDAYS');
    });

    it('handles string arrays by taking the first element', () => {
      expect(parseAccountsTabParam(['paydays', 'accounts'])).toBe('PAYDAYS');
      expect(parseAccountsTabParam([])).toBeUndefined();
    });

    it('returns undefined for undefined or unrecognized values', () => {
      expect(parseAccountsTabParam(undefined)).toBeUndefined();
      expect(parseAccountsTabParam('')).toBeUndefined();
      expect(parseAccountsTabParam('sinking-funds')).toBeUndefined();
    });
  });

  describe('parseDebtsTabParam', () => {
    it('parses canonical and alias values', () => {
      expect(parseDebtsTabParam('all')).toBe('ALL');
      expect(parseDebtsTabParam('credit-cards')).toBe('CREDIT_CARDS');
      expect(parseDebtsTabParam('cards')).toBe('CREDIT_CARDS');
      expect(parseDebtsTabParam('loans')).toBe('LOANS');
      expect(parseDebtsTabParam('bills')).toBe('BILLS');
      expect(parseDebtsTabParam('utilities')).toBe('BILLS');
      expect(parseDebtsTabParam('unknown')).toBeUndefined();
    });
  });
});
