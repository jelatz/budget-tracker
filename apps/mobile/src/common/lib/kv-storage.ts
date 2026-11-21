import Storage from 'expo-sqlite/kv-store';

export function getItemSync(key: string): string | null {
  try {
    return Storage.getItemSync(key);
  } catch (error: unknown) {
    return null;
  }
}

export function setItemSync(key: string, value: string): void {
  try {
    Storage.setItemSync(key, value);
  } catch (error: unknown) {
    // Ignore storage write failure
  }
}

export function removeItemSync(key: string): void {
  try {
    Storage.removeItemSync(key);
  } catch (error: unknown) {
    // Ignore storage delete failure
  }
}
