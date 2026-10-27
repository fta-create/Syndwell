import { readdir, mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';
const [platform, input, output] = process.argv.slice(2);
const extensions = {
  'windows-x64': '.exe',
  'macos-arm64': '.dmg',
  'macos-x64': '.dmg',
  'linux-x64': '.deb',
};
if (!extensions[platform] || !input || !output)
  throw new Error('Usage: collect-installers.mjs PLATFORM BUNDLE_DIRECTORY OUTPUT_DIRECTORY');
async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(path)));
    else if (entry.isFile() && extname(path) === extensions[platform]) result.push(path);
  }
  return result;
}
const files = await walk(input);
if (files.length !== 1)
  throw new Error(`Expected exactly one ${extensions[platform]} installer, found ${files.length}.`);
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const name = `Syndwell-${version}-${platform}${extensions[platform]}`;
await mkdir(output, { recursive: true });
const target = join(output, name);
await copyFile(files[0], target);
const hash = createHash('sha256')
  .update(await readFile(target))
  .digest('hex');
await writeFile(`${target}.sha256`, `${hash}  ${name}\n`);
console.log(`Collected ${name} with SHA-256 checksum.`);
