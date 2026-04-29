<a id="readme-top"></a>

[![CodeQL][codeql-shield]][codeql-url]
[![GitHub release][release-shield]][release-url]
[![GitHub issues][issues-shield]][issues-url]
[![License][license-shield]][license-url]

<br />

<div align="center">
  <a href="https://github.com/divbasson/DesktopClaw">
    <img src="src/assets/brand/avatar.png" alt="DesktopClaw Avatar" width="96" height="96">
  </a>

  <h3 align="center">DesktopClaw</h3>

  <p align="center">
    A small Windows desktop avatar that gives OpenClaw a visible, voice-enabled presence.
    <br />
    <a href="RELEASE_NOTES.md"><strong>Read the release notes »</strong></a>
    <br />
    <br />
    <a href="https://github.com/divbasson/DesktopClaw/releases">Download Releases</a>
    &middot;
    <a href="https://github.com/divbasson/DesktopClaw/issues/new?labels=bug&template=bug_report.md">Report Bug</a>
    &middot;
    <a href="https://github.com/divbasson/DesktopClaw/issues/new?labels=enhancement&template=feature_request.md">Request Feature</a>
  </p>
</div>

<div align="center">
  <img src="src/assets/brand/banner.png" alt="DesktopClaw - Your Vigilant, Warm Desktop Companion" width="100%" />
</div>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#download">Download</a>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#run-from-source">Run From Source</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#openclaw-gateway">OpenClaw Gateway</a></li>
    <li><a href="#voice-and-speech">Voice And Speech</a></li>
    <li><a href="#configuration">Configuration</a></li>
    <li><a href="#packaging">Packaging</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
  </ol>
</details>

## About The Project

<div align="center">
  <img width="240" height="300" alt="DesktopClaw avatar preview" src="https://github.com/user-attachments/assets/6a167d9e-c02a-45a0-a6ad-8459d6400dba" />
</div>

DesktopClaw is a transparent Electron desktop companion for OpenClaw. It sits on your Windows desktop as a small animated avatar, listens when you ask for attention, speaks OpenClaw responses back through local text-to-speech, and stays out of the way when a request is still running.

The goal is to make OpenClaw feel less like a background service and more like a present, responsive assistant. You can send a chat request, check gateway settings, change app options, or use the tray while the request continues. DesktopClaw keeps the active request alive and only removes the in-progress indicator when that specific request has a valid response.

What it does today:

- Connects to OpenClaw through a WebSocket gateway.
- Shows a draggable, transparent, always-on-top desktop avatar.
- Accepts typed prompts and push-to-talk voice input.
- Speaks responses with local Piper text-to-speech.
- Tracks in-progress jobs as request-scoped visual indicators.
- Handles long-lived OpenClaw sessions with interleaved user, tool, retry, and assistant messages.
- Lets you double-click the avatar to interrupt speech.
- Offers gateway status, model refresh, mute, visibility, settings, and quit actions from the system tray.
- Supports optional idle click-through behavior.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

- [![Electron][electron-shield]][electron-url]
- [![Node.js][node-shield]][node-url]
- [![JavaScript][javascript-shield]][javascript-url]
- [Piper TTS][piper-url]
- [Vosk][vosk-url]
- [OpenClaw][openclaw-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Download

Installer and standalone builds are available from the GitHub releases page:

<div align="center">
  <a href="https://github.com/divbasson/DesktopClaw/releases"><strong>Download DesktopClaw Releases »</strong></a>
</div>

Use the installer when you want DesktopClaw registered like a normal Windows app with shortcuts. Use the standalone/portable build when you want to try it without installing it system-wide.

Runtime settings are stored under the current Windows user profile, so packaged builds can preserve your gateway, voice, hotkey, and UI preferences between launches.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started

Use the release installer or standalone build for normal use. Run from source when you are developing, testing local gateway behavior, or changing the avatar code.

### Prerequisites

- Windows.
- Node.js `20.x` or newer compatible with the Electron dependency set.
- An OpenClaw gateway reachable over WebSocket.
- Optional: Piper installed locally for speech output.
- Optional: Vosk model files under `models/` for native speech capture.

### Run From Source

```powershell
git clone https://github.com/divbasson/DesktopClaw.git
cd DesktopClaw
npm install
npm start
```

The app starts as a transparent desktop avatar. Hover or click the avatar to open the text input, or use the listen hotkey for voice input.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage

DesktopClaw is designed to feel like a small companion rather than a static chat window.

- Click or hover near the avatar to bring up the text input.
- Type a request and press `Enter`.
- Use `Ctrl+Shift+Space` to start voice capture.
- Watch the compact request indicator while OpenClaw is working.
- Continue using settings or the tray while a request is in progress.
- Double-click the avatar while it is speaking to stop the current spoken response.
- Use the tray menu for mute, visibility, settings, status checks, and model refresh.

Default hotkeys:

- Listen: `Ctrl+Shift+Space`
- Mute: `Ctrl+Shift+M`
- Show/hide: `Ctrl+Shift+H`
- Settings: `Ctrl+Shift+S`

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## OpenClaw Gateway

DesktopClaw is primarily a WebSocket gateway client. The default settings point at a local OpenClaw gateway:

```json
{
  "gateway": {
    "mode": "gateway",
    "baseUrl": "ws://localhost:18789",
    "eventsUrl": "ws://localhost:18789",
    "sessionKey": "main",
    "timeoutMs": 30000
  }
}
```

The app talks to OpenClaw through gateway methods such as:

- `connect`
- `chat.send`
- `chat.history`
- `health` / `status`
- `sessions.list`
- `models.list`

OpenClaw sessions are long-lived and can contain messages from the desktop app, other chat surfaces, tool calls, retries, model errors, and final assistant replies. DesktopClaw correlates replies to the matching user request instead of assuming the whole session represents one job.

Model listing is supported through OpenClaw. Session model switching depends on backend support and may be unavailable on some gateway versions.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Voice And Speech

DesktopClaw supports native voice input and local speech output:

- Voice input uses the native Vosk listener in `src/native/vosk_listener.py`.
- Push-to-talk is available with the global listen hotkey.
- Text-to-speech uses Piper when `tts.usePiperTts` is enabled.
- The default Piper voice path is configured as `tts.piperModel`.
- Double-click the avatar while it is speaking to stop the current spoken response.
