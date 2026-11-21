export function downloadTextFile(
  _content: string,
  _filename: string,
  _mimeType: string,
): boolean {
  return false;
}

export async function copyTextToClipboard(_text: string): Promise<boolean> {
  return false;
}

export async function pickTextFile(_accept: string): Promise<{ name: string; content: string } | null> {
  return null;
}
