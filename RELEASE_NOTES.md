# DesktopClaw v0.1.0 Release Notes

Changes since `v0.0.10`.

## Overview

This release moves DesktopClaw further from a simple desktop pet prototype toward a more capable OpenClaw companion. The biggest change is better handling of long-running and interleaved OpenClaw interactions: DesktopClaw now treats each user request as its own visual job, keeps active requests alive while you interact with settings, and avoids confusing transient gateway/model errors with final assistant responses.

## Highlights

- Improved OpenClaw reply handling for shared, always-active sessions.
- Added request-scoped in-progress indicators that disappear after valid responses.
- Preserved in-flight chat requests while checking or changing app settings.
- Added double-click interruption while the avatar is speaking.
- Cleaned up the avatar visual presentation by removing a glow layer that exposed rectangular window edges.
- Updated Electron from `39.8.5` to `39.8.9`.
- Added GitHub issue templates for bug reports and feature requests.
- Updated README preview/branding content after the `v0.0.10` redesign.

## OpenClaw Interaction Improvements

DesktopClaw now handles OpenClaw sessions more carefully. OpenClaw sessions are long-lived and can contain messages from the desktop app, chat, tools, retries, and gateway actions, so the app no longer treats a session as equivalent to one request.

- Request indicators are keyed to individual user requests, not session lifetime.
- Valid assistant responses remove the in-progress indicator immediately.
- Gateway settings/status checks no longer stop or visually complete an active chat request.
- Existing gateway clients stay alive until their active query finishes, even if settings are changed mid-request.
- Chat history correlation now uses the matching user message plus OpenClaw sequence numbers.
- Transient assistant error entries, such as model retry failures, are skipped when a later valid assistant response is available.
- When OpenClaw does not provide a `runId`, DesktopClaw falls back to safer history-based reply matching instead of listening to unrelated session events.

## Avatar And UX Improvements

- Added a compact request activity rail for active jobs.
- Long prompts and OAuth callback URLs are truncated instead of covering the avatar.
- Removed visible scrollbars from the request indicator area.
- Request indicators auto-scroll to the newest request.
- Completed request indicators fade out instead of staying on screen.
- Error indicators remain briefly so failures are still visible.
- Double-clicking the avatar while it is speaking stops speech playback and hides the response bubble.
- Speech interruption works for active audio playback and for Piper synthesis that has not started playback yet.
- Removed the separate blurred avatar glow layer that caused visible rectangular side artifacts in the transparent window.

## Documentation And Project Updates

- Added `.github/ISSUE_TEMPLATE/bug_report.md`.
- Added `.github/ISSUE_TEMPLATE/feature_request.md`.
- Updated README preview and redesign notes.
- Replaced the older README image reference with the newer preview asset.

## Verification

The release changes were checked with:

- `npm run lint`
- `node --check src/main/openclaw-client.js`
- `node --check src/main/app-controller.js`
- Renderer ES module syntax check with `node --input-type=module --check`
- TTS ES module syntax check with `node --input-type=module --check`
- Live OpenClaw gateway prompt returning `OK`
- App restart with renderer initialization confirmed in the app log

## Known Gaps

- Manual double-click interruption while Piper synthesis is still in progress should still be tested interactively across longer spoken responses.
- `npm run lint` is currently a placeholder script and does not perform deep static analysis.
