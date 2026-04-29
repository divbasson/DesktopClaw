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
---

<div align="center">
  <img src="src/assets/brand/preview-notification.png" alt="DesktopClaw notification preview" width="600" />
  <br/>
  <sub>DesktopClaw - an OpenClaw desktop companion</sub>
</div>

[codeql-shield]: https://github.com/divbasson/DesktopClaw/actions/workflows/github-code-scanning/codeql/badge.svg
[codeql-url]: https://github.com/divbasson/DesktopClaw/actions/workflows/github-code-scanning/codeql
[release-shield]: https://img.shields.io/github/v/release/divbasson/DesktopClaw?style=for-the-badge
[release-url]: https://github.com/divbasson/DesktopClaw/releases
[issues-shield]: https://img.shields.io/github/issues/divbasson/DesktopClaw.svg?style=for-the-badge
[issues-url]: https://github.com/divbasson/DesktopClaw/issues
[license-shield]: https://img.shields.io/badge/license-MIT-green?style=for-the-badge
[license-url]: https://github.com/divbasson/DesktopClaw/blob/main/package.json
[electron-shield]: https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=electron&logoColor=white
[electron-url]: https://www.electronjs.org/
[node-shield]: https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white
[node-url]: https://nodejs.org/
[javascript-shield]: https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=000
[javascript-url]: https://developer.mozilla.org/en-US/docs/Web/JavaScript
[piper-url]: https://github.com/rhasspy/piper
[vosk-url]: https://alphacephei.com/vosk/
[openclaw-url]: https://github.com/divbasson/OpenClaw
