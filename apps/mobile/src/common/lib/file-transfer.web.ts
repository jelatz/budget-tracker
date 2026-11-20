export interface PickedTextFile {
  name: string;
  content: string;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error: unknown) {
    return false;
  }
  return false;
}

export async function exportTextFile(
  content: string,
  filename: string,
  mimeType: string,
): Promise<string> {
  if (typeof document !== 'undefined') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return `Downloaded ${filename}`;
  }

  const copied = await copyTextToClipboard(content);
  return copied ? `Copied ${filename} to clipboard` : `${filename} ready`;
}

export async function pickTextFile(
  format: 'json' | 'csv',
): Promise<PickedTextFile | null> {
  if (typeof document === 'undefined') {
    return null;
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept =
      format === 'json'
        ? '.json,application/json'
        : '.csv,text/csv,text/plain';

    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      const file = target?.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const content = typeof reader.result === 'string' ? reader.result : '';
        resolve({ name: file.name, content });
      };
      reader.onerror = () => {
        reject(new Error(`Failed to read file "${file.name}"`));
      };
      reader.readAsText(file);
    };

    input.click();
  });
}
