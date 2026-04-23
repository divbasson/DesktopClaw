<div align="center">
  <img src="src/assets/brand/banner.png" alt="DesktopClaw — Your Vigilant, Warm Desktop Companion" width="100%" />
</div>

<br/>

<div align="center">
  <img src="src/assets/brand/avatar.png" alt="DesktopClaw Avatar" width="96" />

  # DesktopClaw

[![CodeQL](https://github.com/divbasson/DesktopClaw/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/divbasson/DesktopClaw/actions/workflows/github-code-scanning/codeql)

  *A Windows desktop pet companion powered by OpenClaw.*
</div>

## Prieview



<br/>

## What this prototype does

- Floating transparent desktop pet window
- Draggable mascot with idle motion and random quirks
- Always-on-top toggle (default on)
- Global hotkey to trigger listening
- Voice input via Web Speech API when available
- Text input fallback
- Configurable OpenClaw gateway client with mock mode
- TTS playback via system voices
- Basic mouth animation synced from lightweight speech amplitude heuristics
- Settings panel backed by `config.json`
- Wake-word fallback mode using continuous speech recognition when supported
- Optional click-through when idle
- Status polling with lightweight in-app notifications
- Optional WebSocket live-event stream support
- Native desktop notifications
- Voice selection from available system TTS voices
- Cursor-proximity reaction for a more alive idle feel
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
cd /zfs/source-code/desktopclaw
npm install
npm start
```

## Configuring OpenClaw

Edit `config.json` or use the settings panel.

When running the packaged app, DesktopClaw persists runtime settings in the Electron user data folder (`%APPDATA%/DesktopClaw/config.json`) so updates like `gateway.mode = "http"` are writable and survive restarts.

- `gateway.mode = "mock"` keeps everything local for UI testing.
- `gateway.mode = "http"` sends requests to:
  - `baseUrl + chatPath` for chat
  - `baseUrl + statusPath` for status
- Authentication options for `gateway.mode = "http"`:
  - `gateway.token` sends `Authorization: Bearer <token>`
  - `gateway.password` sends `X-OpenClaw-Password: <password>`
  - If both are set, both auth headers are sent
- Current request payload is:

```json
{ "message": "...", "input": "...", "query": "..." }
```

The client accepts a reply from any of these response fields:

- `reply`
- `text`
- `message`
- `output`
- `response`

If your OpenClaw gateway uses a different schema, adapt `src/main/openclaw-client.js`.

## Status polling and notifications

A lightweight polling monitor is included for the MVP.

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
- updates the pet's status pill
- raises a small in-app notification when status payload changes
- can optionally speak those updates
- can subscribe to a WebSocket event feed for live OpenClaw notifications
- can mirror notifications to native desktop toasts

## Hotkeys

Default hotkeys live in `config.json`:

- Listen: `Ctrl+Shift+Space`
- Mute: `Ctrl+Shift+M`
- Show/hide: `Ctrl+Shift+H`
- Settings: `Ctrl+Shift+S`

## Building a Windows .exe

For a fast unpacked Windows prototype:

```bash
npm run dist:dir
```

That targets `dist/win-unpacked/DesktopClaw.exe`.

For installer + portable packaging:

This repo is set up for `electron-builder`:

```bash
npm run dist
```

That produces a Windows installer/portable app **when run in a Windows-capable packaging environment**.

### Important note

I prepared the project for Windows packaging, but if you are building from Linux you may still need one of:

- a Windows machine
- Wine + NSIS toolchain
- CI that targets Windows

So the codebase is ready for `.exe` output, but final packaging depends on the host build environment.

## MVP limitations

- Wake word is config-backed but not yet true offline wake-word detection
- Speech recognition depends on platform/browser support in Electron
- Mouth sync is amplitude/heuristic-based, not phoneme-based
- Asset pack is intentionally minimal and code-driven for the MVP

## Next best upgrades

1. Add native STT (Whisper/Vosk) for reliable speech capture
2. Add Porcupine/openWakeWord for true wake word support
3. Replace CSS pet with full PNG sprite atlas from the approved art pack
4. Add WebSocket/live OpenClaw events and notification badges
5. Add click-through-on-idle behavior tuning and cursor reactions

---
<div align="center">
  <img src="src/assets/brand/preview-notification.png" alt="DesktopClaw in action — System Ready notification" width="600" />
  <br/>
  <sub>© DesktopClaw — Your Vigilant, Warm Desktop Companion</sub>
</div>
