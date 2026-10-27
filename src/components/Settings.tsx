import { useState, useRef } from 'react';
import {
  Palette,
  BookOpen,
  RefreshCw,
  Database,
  Keyboard,
  Info,
  Download,
  Upload,
  ShieldCheck,
  ArrowUpRight,
} from 'lucide-react';
import { Modal } from './Modal';
import { request, openLink, saveExport } from '../lib/api';
export function Settings({
  prefs,
  setPreference,
  onClose,
  onChanged,
  onError,
  onImport,
}: {
  prefs: Record<string, string>;
  setPreference: (k: string, v: string) => void;
  onClose: () => void;
  onChanged: () => void;
  onError: (s: string) => void;
  onImport: () => void;
}) {
  const [tab, setTab] = useState('appearance');
  const [busy, setBusy] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const tabs = [
    ['appearance', 'Appearance', Palette],
    ['reading', 'Reading', BookOpen],
    ['sync', 'Feeds & sync', RefreshCw],
    ['data', 'Your data', Database],
    ['shortcuts', 'Shortcuts', Keyboard],
    ['about', 'About Syndwell', Info],
  ] as const;
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const select = (key: string, defaultValue: string, options: [string, string][]) => (
    <select value={prefs[key] || defaultValue} onChange={(e) => setPreference(key, e.target.value)}>
      {options.map(([v, n]) => (
        <option value={v} key={v}>
          {n}
        </option>
      ))}
    </select>
  );
  const row = (title: string, description: string, control: React.ReactNode) => (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {control}
    </div>
  );
  return (
    <Modal title="Make yourself at home" onClose={onClose} wide>
      <div className="settings-layout">
        <nav>
          {tabs.map(([k, n, Icon]) => (
            <button className={tab === k ? 'active' : ''} onClick={() => setTab(k)} key={k}>
              <Icon size={16} />
              {n}
            </button>
          ))}
        </nav>
        <section className="settings-content">
          {tab === 'appearance' && (
            <>
              <h3>A space that feels like you.</h3>
              <p className="settings-intro">Small details. A better reading experience.</p>
              {row(
                'Color theme',
                'Follow your mood, or your device.',
                select('theme', 'system', [
                  ['system', 'System'],
                  ['light', 'Light'],
                  ['dark', 'Dark'],
                ]),
              )}
              {row(
                'Reader font size',
                `${prefs.fontSize || 19}px`,
                <input
                  aria-label="Reader font size"
                  type="range"
                  min="15"
                  max="26"
                  value={prefs.fontSize || 19}
                  onChange={(e) => setPreference('fontSize', e.target.value)}
                />,
              )}
              {row(
                'Content width',
                `${prefs.width || 680}px`,
                <input
                  aria-label="Content width"
                  type="range"
                  min="440"
                  max="900"
                  step="20"
                  value={prefs.width || 680}
                  onChange={(e) => setPreference('width', e.target.value)}
                />,
              )}
              {row(
                'Line height',
                'Give your words room to breathe.',
                select('lineHeight', '1.85', [
                  ['1.5', 'Compact'],
                  ['1.85', 'Comfortable'],
                  ['2.1', 'Spacious'],
                ]),
              )}
            </>
          )}
          {tab === 'reading' && (
            <>
              <h3>Your reading rhythm.</h3>
              {row(
                'Mark read when opened',
                'Keep your unread list in step with you.',
                <input
                  aria-label="Mark read when opened"
                  type="checkbox"
                  checked={prefs.autoRead !== 'false'}
                  onChange={(e) => setPreference('autoRead', String(e.target.checked))}
                />,
              )}
              {row(
                'Download full articles',
                'Extract content in the background after refreshing. Failed extractions keep feed content.',
                <input
                  aria-label="Download full articles automatically"
                  type="checkbox"
                  checked={prefs.autoFull === 'true'}
                  onChange={(e) => setPreference('autoFull', String(e.target.checked))}
                />,
              )}
              <div className="info-box">
                Remote images are blocked by default to prevent tracking. Use Download images in an
                article to cache them explicitly. Downloaded images and text remain available
                offline.
              </div>
            </>
          )}
          {tab === 'sync' && (
            <>
              <h3>Fresh perspectives, at your pace.</h3>
              {row(
                'Refresh interval',
                'Updates run while Syndwell is open.',
                select('interval', '30', [
                  ['0', 'Manual only'],
                  ['5', 'Every 5 minutes'],
                  ['15', 'Every 15 minutes'],
                  ['30', 'Every 30 minutes'],
                  ['60', 'Every hour'],
                ]),
              )}
              <div className="info-box">
                Conditional requests reduce downloads. Unavailable feeds retry with exponential
                backoff. Your reading history is never sent anywhere.
              </div>
            </>
          )}
          {tab === 'data' && (
            <>
              <h3>Your library. Your control.</h3>
              {row(
                'Subscriptions',
                'Bring your feeds in, or take them with you.',
                <div className="button-group">
                  <button className="secondary-button" disabled={busy} onClick={onImport}>
                    <Upload size={14} />
                    Import OPML
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => action(async () => await saveExport('opml'))}
                  >
                    <Download size={14} />
                    Export
                  </button>
                </div>,
              )}
              {row(
                'Private notes',
                'All of your notes in one Markdown document.',
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => action(async () => await saveExport('notes'))}
                >
                  Export notes
                </button>,
              )}
              {row(
                'Library backup',
                'Includes articles, states, notes and preferences.',
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => action(async () => await saveExport('backup'))}
                >
                  Create backup
                </button>,
              )}
              {row(
                'Restore backup',
                'Replaces this library. Export a backup first.',
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setRestoreConfirm(true)}
                >
                  Restore…
                </button>,
              )}
              {restoreConfirm && (
                <div className="info-box danger-box">
                  <p>This replaces all current data. Restore a Syndwell JSON backup?</p>
                  <button className="secondary-button" onClick={() => file.current?.click()}>
                    Choose backup
                  </button>
                  <button className="text-button" onClick={() => setRestoreConfirm(false)}>
                    Cancel
                  </button>
                </div>
              )}
              <input
                type="file"
                accept=".json"
                hidden
                ref={file}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    action(async () => {
                      if (f.size > 512 * 1024 * 1024) throw new Error('Backup exceeds 512 MiB');
                      await request('restore', JSON.parse(await f.text()));
                      setRestoreConfirm(false);
                      onChanged();
                    });
                }}
              />
              {row(
                'Extracted content cache',
                'Removes full-text downloads and cached images. Feed content, notes and saved articles stay.',
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      await request('clear_cache');
                      onChanged();
                    })
                  }
                >
                  Clear cache
                </button>,
              )}
            </>
          )}
          {tab === 'shortcuts' && (
            <>
              <h3>Find your flow.</h3>
              <div className="shortcut-table">
                {[
                  ['Next / previous article', 'J / K'],
                  ['Search your library', '/'],
                  ['Star article', 'S'],
                  ['Save for later', 'B'],
                  ['Mark read / unread', 'M'],
                  ['Add a feed', '⌘ / Ctrl + N'],
                  ['Close dialog', 'Esc'],
                ].map(([a, b]) => (
                  <div key={a}>
                    <span>{a}</span>
                    <kbd>{b}</kbd>
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === 'about' && (
            <div className="about-content">
              <div className="brand-icon">
                <BookOpen size={30} />
              </div>
              <h3>
                Syndwell<span className="brand-period">.</span>
              </h3>
              <p>A quieter way to stay curious.</p>
              <span className="version-pill">VERSION 0.1.0</span>
              <div className="info-box">
                <ShieldCheck size={21} />
                <p>
                  Free, open source, and yours. No accounts, no subscriptions, no analytics. All
                  data lives on your device.
                </p>
              </div>
              <p>Licensed under GPL-3.0-or-later.</p>
              <button
                className="text-button"
                onClick={() =>
                  openLink('https://github.com/fta-create/Syndwell').catch((e) =>
                    onError(String(e)),
                  )
                }
              >
                Explore the source
                <ArrowUpRight size={14} />
              </button>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
