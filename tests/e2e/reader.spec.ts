import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
let dir: string;
let database: string;
const binary = resolve('src-tauri/target/debug/syndwell-cli');
function command(op: string, args: unknown = {}) {
  return JSON.parse(
    execFileSync(binary, [database, op, JSON.stringify(args)], { encoding: 'utf8' }),
  );
}
test.beforeEach(async ({ page }) => {
  dir = mkdtempSync(join(tmpdir(), 'syndwell-e2e-'));
  database = join(dir, 'library.sqlite3');
  command('import_opml', { xml: readFileSync('tests/fixtures/subscriptions.opml', 'utf8') });
  execFileSync(binary, [database, '--ingest-fixture', '1', resolve('tests/fixtures/rss.xml')]);
  execFileSync(binary, [database, '--ingest-fixture', '2', resolve('tests/fixtures/atom.xml')]);
  execFileSync(binary, [database, '--ingest-fixture', '3', resolve('tests/fixtures/feed.json')]);
  // Test only: replace Tauri's IPC transport, keeping the real Rust engine and SQLite database.
  await page.exposeFunction('nativeRequest', (op: string, args: unknown) => command(op, args));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isTauri', { value: true });
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {
        invoke: (_cmd: string, p: { op: string; args: unknown }) =>
          (
            window as unknown as { nativeRequest: (op: string, args: unknown) => Promise<unknown> }
          ).nativeRequest(p.op, p.args),
      },
    });
  });
});
test.afterEach(() => rmSync(dir, { recursive: true, force: true }));
test('real SQLite reading, saved states, searchable notes, filters and reopen', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.article-card')).toHaveCount(4);
  await page.getByRole('button', { name: /The quiet art of growing things/ }).click();
  await expect(page.locator('.reading-article h1')).toHaveText('The quiet art of growing things');
  await expect(page.locator('.prose')).toContainText('Gardening is an invitation');
  await page.getByRole('button', { name: 'Save for later', exact: true }).click();
  await page.getByRole('button', { name: 'Article notes', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Article note' })
    .fill('## Keep this\nA rare botanical insight.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Note saved');
  await page.getByRole('textbox', { name: 'Search articles' }).fill('botanical');
  await expect(page.locator('.article-card')).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: /Read later/ }).click();
  await expect(page.locator('.article-card')).toHaveCount(1);
  await page.locator('.article-card').click();
  await page.getByRole('button', { name: 'Article notes', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Article note' })).toHaveValue(
    '## Keep this\nA rare botanical insight.',
  );
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.note-preview h2')).toHaveText('Keep this');
  await page.screenshot({ path: '/tmp/syndwell-reading.png', fullPage: true });
});
test('organize feeds and use appearance settings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  await page.getByLabel('Folder name').fill('Research');
  await page.getByRole('button', { name: 'Create folder', exact: true }).click();
  await expect(page.locator('.folder-row')).toContainText([
    'Ideas & culture',
    'Design',
    'Research',
  ]);
  await page.getByRole('button', { name: 'Edit Field Notes', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('My Field Notes');
  await page.getByLabel('Folder', { exact: true }).selectOption({ label: 'Research' });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('.feed-row')).toHaveCount(3);
  await expect(page.locator('.feed-row')).toContainText([
    'Atom Journal',
    'My Field Notes',
    'JSON Journal',
  ]);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('.settings-content select').first().selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.article-card')).toHaveCount(4);
  await expect(page.locator('.workspace')).toHaveCSS('background-color', 'rgb(41, 46, 39)');
  await page.screenshot({ path: '/tmp/syndwell-dark.png', fullPage: true });
});
test('responsive article navigation and offline reading', async ({ page }) => {
  await page.setViewportSize({ width: 780, height: 900 });
  await page.goto('/');
  await page.locator('.article-card').first().click();
  await expect(page.locator('.reading-article')).toBeVisible();
  await page.getByRole('button', { name: 'Back to articles', exact: true }).click();
  await expect(page.locator('.timeline')).toBeVisible();
  await page.context().setOffline(true);
  await page.locator('.article-card').first().click();
  await expect(page.locator('.prose')).toContainText('Free software');
  await expect(page.locator('.global-bar')).toContainText('Offline');
});
test('empty browser preview is honest and usable', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto('http://127.0.0.1:1420');
  await expect(page.locator('.global-bar')).toContainText('DESKTOP INTERFACE PREVIEW');
  await expect(page.locator('.article-card')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/syndwell-empty.png', fullPage: true });
  await page.close();
});
