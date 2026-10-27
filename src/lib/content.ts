import DOMPurify from 'dompurify';
import { marked } from 'marked';
export function safeHtml(html: string, images: Record<string, string> = {}, base?: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  const doc = template.content;
  for (const img of doc.querySelectorAll('img')) {
    let url = '';
    try {
      url = new URL(img.getAttribute('src') || '', base).href;
    } catch {
      /* Invalid URL is removed below. */
    }
    const data = images[url];
    if (data && /^data:image\/(png|jpeg|webp|gif|avif);base64,[a-zA-Z0-9+/=]+$/.test(data)) {
      img.setAttribute('src', data);
      for (const attr of [...img.attributes])
        if (!['src', 'alt', 'width', 'height'].includes(attr.name)) img.removeAttribute(attr.name);
    } else img.remove();
  }
  return DOMPurify.sanitize(template.innerHTML, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      'video',
      'audio',
      'iframe',
      'form',
      'input',
      'button',
      'style',
      'svg',
      'math',
      'picture',
      'source',
    ],
    FORBID_ATTR: ['style', 'srcset', 'id', 'name', 'ping'],
    ALLOW_DATA_ATTR: false,
  });
}
export function plain(html: string): string {
  const d = document.createElement('template');
  d.innerHTML = safeHtml(html);
  return d.content.textContent || '';
}
export function markdown(text: string) {
  return safeHtml(marked.parse(text, { async: false }) as string);
}
export function dateLabel(date: string) {
  const d = new Date(date);
  return Number.isNaN(+d)
    ? 'Undated'
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
