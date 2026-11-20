import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export interface PickedTextFile {
  name: string;
  content: string;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch (error: unknown) {
    return false;
  }
}

export async function exportTextFile(
  content: string,
  filename: string,
  mimeType: string,
): Promise<string> {
  const file = new File(Paths.cache, filename);
  await file.write(content);

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, {
      mimeType,
      dialogTitle: filename,
    });
    return `Shared ${filename}`;
  }

  const copied = await copyTextToClipboard(content);
  return copied
    ? `Sharing unavailable — copied ${filename} to clipboard`
    : `Saved ${filename} to cache`;
}

export async function pickTextFile(
  format: 'json' | 'csv',
): Promise<PickedTextFile | null> {
  const mimeTypes =
    format === 'json'
      ? ['application/json', 'text/plain']
      : ['text/csv', 'text/comma-separated-values', 'text/plain'];

  const result = await DocumentPicker.getDocumentAsync({
    type: mimeTypes,
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const file = new File(asset.uri);
  const content = await file.text();
  return {
    name: asset.name ?? `import.${format}`,
    content,
  };
}
