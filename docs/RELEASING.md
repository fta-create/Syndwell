# Publish downloadable installers

GitHub Actions builds installers on native OS runners. GitHub Releases hosts the downloads. No local Windows or Mac machine is required to compile, although target-platform testing is still required before publication.

## First try: build without publishing

1. Merge the installer-workflow pull request into `main`.
2. Open the repository's **Actions** tab and select **Build downloadable installers**.
3. Choose **Run workflow**, branch `main`, then **Run workflow** again.
4. Wait for all four build jobs to finish. A failed build has no usable installer for that platform; inspect its logs.
5. At the bottom of the workflow run, download an **Artifact**. GitHub wraps it in a ZIP; extract that ZIP to obtain the installer and its SHA-256 file. Artifact downloads require GitHub login and expire after 14 days.

This manual run does not create a release. It lets you test Windows `.exe`, macOS Apple Silicon/Intel `.dmg`, and Debian/Ubuntu Linux `.deb` installers first. Unsigned Windows/macOS builds can trigger OS warnings. Certificates and notarization are not configured by this workflow.

## Create the downloadable release

1. Confirm `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` all have the release version. For the initial release they are `0.1.0`. For subsequent versions, also refresh `Cargo.lock` using Cargo, commit the changes, and update the release notes.
2. Create and push a matching version tag from a local clone with the latest `main`:

```sh
git switch main
git pull --ff-only
git tag v0.1.0
git push origin v0.1.0
```

Do not create a release with the same tag beforehand: the workflow creates its draft itself. Never replace an existing published version's tag to retry a build.

3. The tag push triggers **Build downloadable installers**. After every build succeeds, a final job creates a **draft prerelease** and uploads all four installers and checksums.
4. Open **Releases**, edit the generated draft, review its assets and release notes, and install/test each supported platform. Keep the prerelease checkbox for early testing.
5. Click **Publish release** only when the release is ready for users.

Users download directly from the public repository's Releases page. A private repository's downloads remain restricted to authorized GitHub users. The workflow does not change repository visibility.

## Retry behavior

A build failure prevents creation of the draft. Fix the cause; rerun failed jobs when no source changes are needed, or use a new version/tag after code changes. If the final publishing job fails after creating a draft, inspect the draft and assets before retrying: `gh release create` intentionally refuses to overwrite an existing release. Complete the asset upload manually or remove only the unpublished draft and rerun the publishing job. This avoids silently replacing published installers.

## Scope

The workflow uses the repository-scoped, short-lived GitHub Actions token only for its final draft-release job. No personal access token is required. Manual runs retain installers as temporary artifacts; tag runs prepare a reviewable draft and do not automatically publish it. macOS signing/notarization and Windows code signing remain future distributor configuration.
