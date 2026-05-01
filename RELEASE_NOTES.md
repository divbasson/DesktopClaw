# DesktopClaw v0.1.2 Release Notes

Changes since `v0.1.1`.

## Overview

This release turns DesktopClaw into a more usable OpenClaw companion instead of a simple desktop pet. The main focus is message triage, request continuity, cleaner visuals, better tray controls, and a more alive avatar presence.

DesktopClaw now treats each user prompt as its own request, streams OpenClaw progress into the UI, fades completed indicators away, keeps long-running jobs alive while you interact with settings or the tray, and gives the avatar idle actions such as reading, sleeping, and working on a laptop.

## Highlights

- Added OpenClaw run-progress streaming from the main process to the renderer.
- Added request-scoped thought bubbles with elapsed time and source labels.
- Fixed completed request bubbles getting stuck after late OpenClaw progress events.
- Restyled the reply bubble and request indicators to avoid clipped scrollbars and cheap-looking boxes.
- Added a mood/presence layer for calm, curious, focused, speaking, happy, and concerned states.
- Added generated idle action sprites for reading, sleeping, and laptop work.
- Normalized idle action sprite scale so the avatar no longer grows when switching actions.
- Moved power controls into the tray and kept the main avatar UI cleaner.
- Added tray commands for stopping speech, hiding replies, cancelling active requests, history, and diagnostics.
- Hardened always-on-top behavior so other windows are less likely to cover the avatar.
- Changed the global listen shortcut to focus the text input for immediate typing.
- Cleaned the TTS path so emoji remain visible on screen but are not spoken aloud.

## OpenClaw Messaging

- `pet:query-stream` now forwards per-request progress events over IPC.
- The renderer receives milestones such as history loading, sending, run start, polling, run events, final responses, and errors.
- Late run events can no longer move a completed, failed, cancelled, or interrupted request back into an active state.
- Active requests remain request-scoped rather than session-scoped, which is important because OpenClaw sessions stay alive across multiple channels and tool interactions.
- Gateway status checks and settings interactions no longer visually complete or discard the active chat request.
- Request history and diagnostics are available from the tray instead of cluttering the avatar surface.

## Avatar UX

- Added idle sprites:
  - `openclaw_idle_reading.png`
  - `openclaw_idle_sleeping.png`
  - `openclaw_idle_laptop.png`
- Added the generated source sheet for traceability:
  - `openclaw_idle_actions_sheet_source.png`
- Idle random behavior now uses the generated reading, sleeping, and laptop poses only.
- Sprite alpha bounds were normalized against the base avatar so idle poses preserve the same apparent size.
- The mood layer changes glow/filter treatment during listening, thinking, speaking, success, and error states.
- The avatar remains draggable, transparent, and interruptible by double-clicking while it speaks.

## Visual And Interaction Polish

- The top reply bubble is now a cleaner dark glass panel with hidden scrollbars and automatic scroll-to-bottom for long content.
- Request indicators are compact cream thought bubbles instead of blue diagnostic boxes.
- Completed request indicators fade out after a valid response.
- Failed or cancelled request indicators remain briefly so the user can notice what happened.
- The main canvas no longer shows settings/history/status buttons; those controls live in the tray.
- Always-on-top behavior is re-applied on show, focus, and blur.
- `Ctrl+Shift+Space` brings DesktopClaw forward and focuses the text box.

## Speech Improvements

- Piper speech text is normalized for better punctuation pacing.
- Common abbreviations such as URL, API, TTS, STT, IPC, OAuth, UI, UX, HTTP, HTTPS, and WS are expanded for more natural speech.
- Links are spoken as "a link" instead of reading long URLs.
- Emoji and pictographic symbols are stripped from the speech-only text path.
- The visual response remains unchanged, so emoji can still be shown in the bubble.

## Packaging

- Version bumped to `0.1.2`.
- Installer and standalone/portable artifacts are produced by the Windows Electron Builder flow.
- Release artifacts remain available from the GitHub releases page.

## Verification

The release was checked with:

- Renderer ES module syntax checks.
- Main process syntax checks for changed Electron files.
- `npm run lint`.
- `git diff --check`.
- `npx electron-builder --win nsis portable --publish never`.
- Relaunch from `dist/win-unpacked/DesktopClaw.exe`.

## Known Gaps

- `npm run lint` is still a placeholder and should be replaced with real static analysis.
- The app still needs deeper automated visual regression coverage for transparent-window layout.
- Always-on-top is hardened, but Windows shell/security surfaces can still appear above normal app windows by design.
