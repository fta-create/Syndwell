// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { safeHtml, markdown, plain } from './content';
describe('untrusted article content', () => {
  it('removes scripts, handlers, frames, forms and remote tracking images', () => {
    const clean = safeHtml(
      '<p onclick="alert(1)">Hello</p><script>alert(1)</script><iframe src="https://evil.test"></iframe><img src="https://tracking.test/pixel"><form><input></form><svg onload="alert(1)"></svg>',
    );
    expect(clean).toBe('<p>Hello</p>');
  });
  it('rejects script URLs while retaining safe editorial links', () => {
    const clean = safeHtml(
      '<a href="javascript:alert(1)">Bad</a><a href="https://example.org">Good</a>',
    );
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('href="https://example.org"');
  });
  it('renders Markdown without permitting inline executable HTML', () => {
    expect(markdown('**My note**\n<script>alert(1)</script>')).toContain(
      '<strong>My note</strong>',
    );
    expect(markdown('<script>alert(1)</script>')).not.toContain('<script>');
  });
  it('returns readable preview text', () =>
    expect(plain('<p>Quiet &amp; curious.</p>')).toBe('Quiet & curious.'));
});

describe('offline cached images', () => {
  it('only renders a known cached raster image', () => {
    const html =
      '<img src="/photo.png" onerror="alert(1)" srcset="https://evil.test/x 2x" alt="A garden">';
    const rendered = safeHtml(
      html,
      { 'https://example.org/photo.png': 'data:image/png;base64,aGVsbG8=' },
      'https://example.org/story',
    );
    expect(rendered).toContain('src="data:image/png;base64,aGVsbG8="');
    expect(rendered).not.toContain('onerror');
    expect(rendered).not.toContain('srcset');
    expect(safeHtml(html)).not.toContain('<img');
  });
  it('does not accept SVG payloads as cached images', () => {
    expect(
      safeHtml('<img src="https://example.org/x">', {
        'https://example.org/x': 'data:image/svg+xml;base64,PHN2Zz4=',
      }),
    ).not.toContain('<img');
  });
});
