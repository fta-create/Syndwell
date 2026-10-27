import { invoke, isTauri } from '@tauri-apps/api/core';
export const native = isTauri();
export async function request<T>(op: string, args: object = {}): Promise<T> {
  if (!native)
    throw new Error(
      'Launch Syndwell with npm run tauri dev to use the local database and native feed fetching. Browser mode is an interface preview.',
    );
  return invoke<T>('request', { op, args });
}
export async function openLink(url: string) {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol))
    throw new Error('Only HTTP and HTTPS links can be opened');
  if (native) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else window.open(url, '_blank', 'noopener,noreferrer');
}
export function download(name: string, body: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveExport(kind: 'opml' | 'notes' | 'backup') {
  return request<boolean>('save_export', { kind });
}
