import { minorUnitsToDecimalInput, parseDecimalToMinorUnits } from './money';

export type CalculatorOperator = '+' | '-' | '×' | '÷';

export type CalculatorKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '.'
  | '+'
  | '-'
  | '×'
  | '÷'
  | 'BACKSPACE'
  | 'CLEAR'
  | '=';

export interface CalculatorEvaluation {
  expression: string;
  displayExpression: string;
  previewMinor: number;
  isValid: boolean;
  hasOperator: boolean;
  endsWithOperator: boolean;
  error: 'DIVIDE_BY_ZERO' | 'NON_POSITIVE' | 'INVALID_SYNTAX' | null;
}

const OPERATOR_SET = new Set<string>(['+', '-', '×', '÷']);

interface NumToken {
  type: 'num';
  value: number; // in integer minor units
}

interface OpToken {
  type: 'op';
  op: CalculatorOperator;
}

type Token = NumToken | OpToken;

/**
 * Normalizes operator characters (* -> ×, / -> ÷) and removes duplicate spaces.
 */
function normalizeExpression(expression: string): string {
  return expression.replace(/\*/g, '×').replace(/\//g, '÷').trim();
}

/**
 * Pure evaluation function for calculator expressions.
 * Applies standard operator precedence (× and ÷ first, then + and -).
 * Evaluates live preview even with trailing operators (e.g. "12.50 +").
 */
export function evaluateCalculatorExpression(expression: string): CalculatorEvaluation {
  const normalized = normalizeExpression(expression);

  if (normalized === '') {
    return {
      expression,
      displayExpression: '0',
      previewMinor: 0,
      isValid: false,
      hasOperator: false,
      endsWithOperator: false,
      error: null,
    };
  }

  const rawTokens = normalized
    .split(/([+\-×÷])/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawTokens.length === 0) {
    return {
      expression,
      displayExpression: '0',
      previewMinor: 0,
      isValid: false,
      hasOperator: false,
      endsWithOperator: false,
      error: 'INVALID_SYNTAX',
    };
  }

  // Handle leading negative number (e.g. "-5 + 10")
  if (rawTokens[0] === '-' && rawTokens.length > 1 && !OPERATOR_SET.has(rawTokens[1])) {
    rawTokens.splice(0, 2, `-${rawTokens[1]}`);
  }

  const lastToken = rawTokens[rawTokens.length - 1];
  const endsWithOperator = OPERATOR_SET.has(lastToken);
  const hasOperator = rawTokens.some((tok, idx) => idx > 0 && OPERATOR_SET.has(tok));
  const displayExpression = rawTokens.join(' ');

  // Determine tokens to evaluate
  const tokensToEval = endsWithOperator ? rawTokens.slice(0, -1) : rawTokens;

  if (tokensToEval.length === 0) {
    return {
      expression,
      displayExpression,
      previewMinor: 0,
      isValid: false,
      hasOperator,
      endsWithOperator,
      error: endsWithOperator ? null : 'INVALID_SYNTAX',
    };
  }

  // Validate alternating pattern: [num, op, num, op, num]
  const parsedTokens: Token[] = [];
  for (let i = 0; i < tokensToEval.length; i++) {
    const raw = tokensToEval[i];
    if (i % 2 === 0) {
      // Must be a number token
      if (OPERATOR_SET.has(raw)) {
        return {
          expression,
          displayExpression,
          previewMinor: 0,
          isValid: false,
          hasOperator,
          endsWithOperator,
          error: 'INVALID_SYNTAX',
        };
      }
      const minor = parseDecimalToMinorUnits(raw);
      if (minor === null) {
        return {
          expression,
          displayExpression,
          previewMinor: 0,
          isValid: false,
          hasOperator,
          endsWithOperator,
          error: 'INVALID_SYNTAX',
        };
      }
      parsedTokens.push({ type: 'num', value: minor });
    } else {
      // Must be an operator token
      if (!OPERATOR_SET.has(raw)) {
        return {
          expression,
          displayExpression,
          previewMinor: 0,
          isValid: false,
          hasOperator,
          endsWithOperator,
          error: 'INVALID_SYNTAX',
        };
      }
      parsedTokens.push({ type: 'op', op: raw as CalculatorOperator });
    }
  }

  // Pass 1: Multiplication (×) and Division (÷)
  const pass1: Token[] = [];
  let i = 0;
  while (i < parsedTokens.length) {
    const current = parsedTokens[i];
    if (current.type === 'num') {
      let currentVal = current.value;
      while (
        i + 1 < parsedTokens.length &&
        parsedTokens[i + 1].type === 'op' &&
        (parsedTokens[i + 1] as OpToken).op === '×' ||
        (i + 1 < parsedTokens.length &&
          parsedTokens[i + 1].type === 'op' &&
          (parsedTokens[i + 1] as OpToken).op === '÷')
      ) {
        const op = (parsedTokens[i + 1] as OpToken).op;
        const nextToken = parsedTokens[i + 2];
        if (!nextToken || nextToken.type !== 'num') {
          return {
            expression,
            displayExpression,
            previewMinor: 0,
            isValid: false,
            hasOperator,
            endsWithOperator,
            error: 'INVALID_SYNTAX',
          };
        }
        const nextVal = nextToken.value;
        if (op === '×') {
          currentVal = Math.round((currentVal * nextVal) / 100);
        } else {
          if (nextVal === 0) {
            return {
              expression,
              displayExpression,
              previewMinor: 0,
              isValid: false,
              hasOperator,
              endsWithOperator,
              error: 'DIVIDE_BY_ZERO',
            };
          }
          currentVal = Math.round((currentVal * 100) / nextVal);
        }
        i += 2;
      }
      pass1.push({ type: 'num', value: currentVal });
      i++;
    } else {
      pass1.push(current);
      i++;
    }
  }

  // Pass 2: Addition (+) and Subtraction (-)
  if (pass1.length === 0 || pass1[0].type !== 'num') {
    return {
      expression,
      displayExpression,
      previewMinor: 0,
      isValid: false,
      hasOperator,
      endsWithOperator,
      error: 'INVALID_SYNTAX',
    };
  }

  let result = pass1[0].value;
  for (let j = 1; j < pass1.length; j += 2) {
    const opToken = pass1[j];
    const nextToken = pass1[j + 1];
    if (opToken.type !== 'op' || !nextToken || nextToken.type !== 'num') {
      return {
        expression,
        displayExpression,
        previewMinor: 0,
        isValid: false,
        hasOperator,
        endsWithOperator,
        error: 'INVALID_SYNTAX',
      };
    }
    if (opToken.op === '+') {
      result += nextToken.value;
    } else if (opToken.op === '-') {
      result -= nextToken.value;
    }
  }

  if (result <= 0) {
    return {
      expression,
      displayExpression,
      previewMinor: result,
      isValid: false,
      hasOperator,
      endsWithOperator,
      error: 'NON_POSITIVE',
    };
  }

  return {
    expression,
    displayExpression,
    previewMinor: result,
    isValid: !endsWithOperator,
    hasOperator,
    endsWithOperator,
    error: null,
  };
}

/**
 * Updates the calculator expression by applying a single key input.
 */
export function applyCalculatorKey(currentExpression: string, key: CalculatorKey): string {
  if (key === 'CLEAR') {
    return '0';
  }

  if (key === 'BACKSPACE') {
    const trimmed = currentExpression.trimEnd();
    const next = trimmed.slice(0, -1).trimEnd();
    return next === '' ? '0' : next;
  }

  if (key === '=') {
    const evalResult = evaluateCalculatorExpression(currentExpression);
    if (evalResult.isValid || evalResult.previewMinor > 0) {
      return minorUnitsToDecimalInput(evalResult.previewMinor);
    }
    return currentExpression;
  }

  // Operator keys (+, -, ×, ÷)
  if (key === '+' || key === '-' || key === '×' || key === '÷') {
    const trimmed = currentExpression.trimEnd();
    if (/[+\-×÷]$/.test(trimmed)) {
      const withoutOp = trimmed.slice(0, -1).trimEnd();
      return `${withoutOp} ${key}`;
    }
    if (trimmed.endsWith('.')) {
      return `${trimmed.slice(0, -1).trimEnd()} ${key}`;
    }
    if (trimmed === '') {
      return `0 ${key}`;
    }
    return `${trimmed} ${key}`;
  }

  // Decimal key (.)
  if (key === '.') {
    const trimmed = currentExpression.trimEnd();
    if (/[+\-×÷]$/.test(trimmed)) {
      return `${trimmed} 0.`;
    }
    if (trimmed === '' || trimmed === '0') {
      return '0.';
    }
    const lastOpIdx = Math.max(
      trimmed.lastIndexOf('+'),
      trimmed.lastIndexOf('-'),
      trimmed.lastIndexOf('×'),
      trimmed.lastIndexOf('÷'),
    );
    const token = lastOpIdx === -1 ? trimmed : trimmed.slice(lastOpIdx + 1).trim();
    if (token.includes('.')) {
      return currentExpression;
    }
    if (token === '') {
      return `${trimmed} 0.`;
    }
    return `${trimmed}.`;
  }

  // Digit keys ('0' - '9')
  const trimmed = currentExpression.trimEnd();
  if (/[+\-×÷]$/.test(trimmed)) {
    return `${trimmed} ${key}`;
  }

  const lastOpIdx = Math.max(
    trimmed.lastIndexOf('+'),
    trimmed.lastIndexOf('-'),
    trimmed.lastIndexOf('×'),
    trimmed.lastIndexOf('÷'),
  );
  const prefix = lastOpIdx === -1 ? '' : `${trimmed.slice(0, lastOpIdx + 1)} `;
  const token = lastOpIdx === -1 ? trimmed : trimmed.slice(lastOpIdx + 1).trim();

  if (token.includes('.')) {
    const dec = token.split('.')[1] || '';
    if (dec.length >= 2) {
      return currentExpression;
    }
    return `${trimmed}${key}`;
  }

  if (token === '0') {
    if (key === '0') {
      return currentExpression;
    }
    return `${prefix}${key}`;
  }

  return `${trimmed}${key}`;
}
