# DesktopClaw v0.1.3 Release Notes

Changes since `v0.1.2`.

## Overview

This release focuses on making DesktopClaw feel more like a reliable living desktop companion: clearer activity tracking, better response bubbles, safer speech behavior, a refreshed GitHub Pages site, and a release pipeline that now builds both Windows and macOS artifacts.

## Highlights

- Added a clickable activity indicator near the avatar for running and historical tasks.
- Added an activity drawer with running, completed, cancelled, errored, and faded older items.
- Added expandable task history so a specific chat can be reviewed without covering the avatar.
- Kept the latest active request visible at the bottom while moving older tasks into the activity drawer.
- Fixed active request tracking so visual trimming does not remove live request state.
- Improved the top response bubble to avoid clipping, show a slim scrollbar, and stay clear of the pet.
- Changed long reply readback so the bubble reveals and scrolls with speech instead of dumping static text.
- Added duplicate TTS protection so identical overlapping speech requests do not spawn multiple Piper jobs.
- Removed a tracked local troubleshooting log snapshot from the repository.
- Rebuilt the GitHub Pages site with the new DesktopClaw landing page, branded assets, and real pet sprites.
- Added macOS GitHub Actions builds for DMG and ZIP artifacts.

## Activity And Message Handling

- Requests are treated as short-lived visual jobs rather than long-lived OpenClaw sessions.
- Active tasks show orange, completed tasks show green, and failed tasks show red.
- Completed tasks flash green on the activity indicator.
- History entries older than ten minutes fade visually.
- The in-memory activity history is trimmed every thirty minutes to reduce renderer overhead.
- Cross-surface work is better represented: a request can continue while the user opens settings, checks status, or uses the tray.

## Visual And Speech Improvements

- The response bubble now uses a narrower, safer layout with less dead space.
- Long responses use a visible scrollbar and stay bounded above the avatar.
- Speech readback reveals text progressively and auto-scrolls to the current content.
- The top bubble no longer uses decorative tails that could overflow into the avatar area.
- The website hero now uses real DesktopClaw pet/action sprites instead of placeholder mascot art.

## Website

- Replaced the GitHub Pages landing page with the new provided HTML template.
- Preserved the template font, styling system, and Material Icons.
- Added DesktopClaw brand assets and actual pet/action sprites.
- Updated copy for OpenClaw and Hermes Agent support.
- Updated download messaging for installer, portable standalone, and release artifacts.

## Packaging

- Version bumped to `0.1.3`.
- Windows release artifacts continue to build as installer and portable `.exe` files.
- macOS release artifacts now build on GitHub Actions as `.dmg` and `.zip`.
- macOS builds are currently unsigned unless Apple Developer signing and notarization credentials are added.

## Verification

Checked before release:

- Secret/personal artifact scan of the current diff.
- Removal of tracked local troubleshooting log snapshot.
- Asset reference validation for the GitHub Pages site.
- Renderer/UI/TTS syntax checks during development.
- `npm test`.
- `npm run lint`.
- `git diff --check`.
- Runtime log sanity check after source launch.

## Known Gaps

- macOS artifacts are unsigned for now.
- macOS voice capture and always-on-top behavior still need hands-on testing on a Mac.
- Deeper automated visual regression coverage is still needed for transparent-window layouts.
