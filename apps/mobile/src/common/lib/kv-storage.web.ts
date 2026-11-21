export function getItemSync(key: string): string | null {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage.getItem(key);
    }
  } catch (error: unknown) {
    // Ignore storage error
  }
  return null;
}

export function setItemSync(key: string, value: string): void {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      globalThis.localStorage.setItem(key, value);
    }
  } catch (error: unknown) {
    // Ignore storage error
  }
}

export function removeItemSync(key: string): void {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      globalThis.localStorage.removeItem(key);
    }
  } catch (error: unknown) {
    // Ignore storage error
  }
}
