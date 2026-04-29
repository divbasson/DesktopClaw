<div align="center">
  <img src="src/assets/brand/banner.png" alt="DesktopClaw — Your Vigilant, Warm Desktop Companion" width="100%" />
</div>

<br/>

<div align="center">
  <img src="src/assets/brand/avatar.png" alt="DesktopClaw Avatar" width="96" />

  # DesktopClaw

  [![CodeQL](https://github.com/divbasson/DesktopClaw/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/divbasson/DesktopClaw/actions/workflows/github-code-scanning/codeql)

  *A warm, vigilant Windows desktop pet companion powered by OpenClaw.*
</div>

---

## Preview

<div align="center">
  <img src="src/assets/brand/prievew.gif" alt="DesktopClaw animated preview" width="420" />
  <br/>
  <sub>Complete redesign in v0.0.10. See releases for the full change list.</sub>
</div>

<br/>

<div align="center">
  <img width="240" height="300" alt="DesktopClaw prototype preview" src="https://github.com/user-attachments/assets/6a167d9e-c02a-45a0-a6ad-8459d6400dba" />
</div>

## What is DesktopClaw?

DesktopClaw is an Electron-based Windows desktop companion that floats above your workspace, reacts to your cursor, listens through a global hotkey, talks back with system text-to-speech, and connects to an OpenClaw gateway when you want it to act as more than a cute mascot.

It can run fully local in mock mode for UI testing, or connect to an HTTP OpenClaw gateway for real assistant-style interactions, status polling, notifications, and live event updates.

## Current features

- Floating transparent desktop pet window
- Draggable mascot with idle motion and random quirks
- Always-on-top toggle, enabled by default
- Global hotkeys for listen, mute, show/hide, and settings
- Voice input via Web Speech API when available
- Text input fallback
- Configurable OpenClaw gateway client with mock mode
- TTS playback via available system voices
- Lightweight mouth animation synced from speech amplitude heuristics
- Settings panel backed by `config.json`
- Wake-word fallback mode using continuous speech recognition when supported
- Optional click-through behavior when idle
- Cursor-proximity reactions for a more alive desktop presence
- Status polling with lightweight in-app notifications
- Optional WebSocket live-event stream support
- Native desktop notifications
- System tray menu for quick pet actions

## Architecture

```text
src/
  main/
    app-controller.js   App orchestration + IPC
    config-store.js     Persisted config lifecycle
    main.js             Electron entrypoint
    openclaw-client.js  OpenClaw/mock HTTP client
    preload.js          Safe renderer bridge
    shortcut-manager.js Global hotkey registration
    ui-shell.js         Window creation + shell controls
  renderer/
    animation_engine.js Animation state + mouth/quirks
    index.html          Floating pet UI
    openclaw_client.js  Renderer-side gateway adapter
    renderer.js         Composition root for pet behavior
    styles.css          Pet visuals + animation states
    tts_engine.js       System TTS wrapper
    ui_shell.js         Bubble/settings helpers
    voice_input.js      Speech capture wrapper
    wake_word.js        Wake word fallback watcher
  shared/
    config.js           Config load/save
  assets/
    sprites/
      openclaw_pet.svg
      animations.json
config.json             Runtime configuration
```

## Quick start

```bash
git clone https://github.com/divbasson/DesktopClaw.git
cd DesktopClaw
npm install
npm start
```

## Configuration

DesktopClaw can be configured through the settings panel or by editing `config.json`.

When running the packaged app, runtime settings are stored in the Electron user data folder:

```text
%APPDATA%/DesktopClaw/config.json
```

This keeps packaged builds writable and allows settings such as `gateway.mode = "http"` to survive restarts.

## OpenClaw gateway setup

DesktopClaw supports two gateway modes:

- `gateway.mode = "mock"` keeps everything local for UI testing.
- `gateway.mode = "http"` sends requests to a running OpenClaw gateway.

When using HTTP mode, DesktopClaw calls:

- `baseUrl + chatPath` for chat requests
- `baseUrl + statusPath` for status polling

Authentication options:

- `gateway.token` sends `Authorization: Bearer <token>`
- `gateway.password` sends `X-OpenClaw-Password: <password>`
- If both are configured, both headers are sent

Current request payload:

```json
{
  "message": "...",
  "input": "...",
  "query": "..."
}
```

DesktopClaw accepts a reply from any of these response fields:

- `reply`
- `text`
- `message`
- `output`
- `response`

If your gateway uses a different schema, adapt `src/main/openclaw-client.js`.

## Status polling and notifications

The MVP includes a lightweight polling monitor.

Config keys:

- `status.pollEnabled`
- `status.pollIntervalMs`
- `status.showNotifications`
- `status.speakNotifications`
- `status.nativeNotifications`
- `gateway.eventsEnabled`
- `gateway.eventsUrl`

Current behavior:

- polls the configured status endpoint
- updates the pet status pill
- raises a small in-app notification when the status payload changes
- can optionally speak status updates
- can subscribe to a WebSocket event feed for live OpenClaw notifications
- can mirror notifications to native desktop toasts

## Hotkeys

Default hotkeys live in `config.json`:

| Action | Hotkey |
| --- | --- |
| Listen | `Ctrl+Shift+Space` |
| Mute | `Ctrl+Shift+M` |
| Show/hide | `Ctrl+Shift+H` |
| Settings | `Ctrl+Shift+S` |

## Building a Windows `.exe`

For a fast unpacked Windows prototype:

```bash
npm run dist:dir
```

Output:

```text
dist/win-unpacked/DesktopClaw.exe
```

For installer and portable packaging:

```bash
npm run dist
```

This repository is set up for `electron-builder`. Installer and portable builds are produced when running in a Windows-capable packaging environment.

### Packaging note

If you are building from Linux, you may still need one of the following:

- a Windows machine
- Wine and the NSIS toolchain
- CI that targets Windows

The codebase is prepared for `.exe` output, but final packaging depends on the host build environment.

## MVP limitations

- Wake word support is config-backed but not yet true offline wake-word detection
- Speech recognition depends on platform/browser support in Electron
- Mouth sync is amplitude/heuristic-based, not phoneme-based
- Asset pack is intentionally minimal and code-driven for the MVP

## Next best upgrades

1. Add native STT with Whisper or Vosk for reliable speech capture
2. Add Porcupine or openWakeWord for true wake-word support
3. Replace the CSS pet with a full PNG sprite atlas from the approved art pack
4. Expand WebSocket/live OpenClaw events and notification badges
5. Tune click-through-on-idle behavior and cursor reactions

---

<div align="center">
  <img src="src/assets/brand/preview-notification.png" alt="DesktopClaw in action — System Ready notification" width="600" />
  <br/>
  <sub>© DesktopClaw — Your Vigilant, Warm Desktop Companion</sub>
</div>
