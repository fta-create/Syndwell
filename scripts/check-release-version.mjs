import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8');
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (pkg.version !== config.version || pkg.version !== cargoVersion) {
  throw new Error('package.json, tauri.conf.json and Cargo.toml must have the same version.');
}
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${pkg.version}`) {
  throw new Error(
    `Release tag must be v${pkg.version}; update all three version files before tagging.`,
  );
}
console.log(`Installer version verified: ${pkg.version}`);
