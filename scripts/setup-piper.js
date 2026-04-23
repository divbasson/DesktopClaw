#!/usr/bin/env node
/**
 * setup-piper.js
 * Downloads the Piper TTS engine and the en_US-hal voice model for DesktopClaw.
 *
 * Usage:  npm run setup-piper
 *
 * By default installs to:
 *   piper/piper/piper.exe
 *   piper/voices/en_US-hal_6409-medium.onnx
 *   piper/voices/en_US-hal_6409-medium.onnx.json
 *
 * Override install directory:  PIPER_DIR=C:\my\piper npm run setup-piper
 */

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const PIPER_DIR = process.env.PIPER_DIR || path.join(ROOT, 'piper');
const VOICES_DIR = path.join(PIPER_DIR, 'voices');

// Piper Windows release (amd64)
const PIPER_VERSION = '2023.11.14-2';
const PIPER_ZIP_URL = `https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_windows_amd64.zip`;

// Voice files on HuggingFace
const VOICE_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/hal/medium';
const VOICE_MODEL_URL = `${VOICE_BASE}/en_US-hal_6409-medium.onnx`;
const VOICE_CONFIG_URL = `${VOICE_BASE}/en_US-hal_6409-medium.onnx.json`;

const PIPER_EXE = path.join(PIPER_DIR, 'piper', 'piper.exe');
const VOICE_MODEL = path.join(VOICES_DIR, 'en_US-hal_6409-medium.onnx');
const VOICE_CONFIG = path.join(VOICES_DIR, 'en_US-hal_6409-medium.onnx.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { process.stdout.write(`[setup-piper] ${msg}\n`); }
function err(msg) { process.stderr.write(`[setup-piper] ERROR: ${msg}\n`); }

/** Follow redirects and download URL to destPath, showing progress. */
function download(url, destPath) {
  return new Promise((resolve, reject) => {
    log(`Downloading ${path.basename(destPath)} ...`);
    log(`  from: ${url}`);

    function get(currentUrl, redirects = 0) {
      if (redirects > 10) return reject(new Error('Too many redirects'));
      const parsed = new URL(currentUrl);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: { 'User-Agent': 'desktopclaw-setup/1.0' },
      };

      https.get(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return get(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${currentUrl}`));
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        let lastPct = -1;

        const out = fs.createWriteStream(destPath);
        res.on('data', (chunk) => {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.floor((received / total) * 100);
            if (pct !== lastPct && pct % 10 === 0) {
              process.stdout.write(`\r  ${pct}% (${(received / 1024 / 1024).toFixed(1)} MB)`);
              lastPct = pct;
            }
          }
        });
        res.pipe(out);
        out.on('finish', () => { process.stdout.write('\n'); resolve(); });
        out.on('error', reject);
        res.on('error', reject);
      }).on('error', reject);
    }

    get(url);
  });
}

/** Extract a zip using PowerShell's Expand-Archive (Windows only). */
function extractZip(zipPath, destDir) {
  log(`Extracting ${path.basename(zipPath)} → ${destDir} ...`);
  fs.mkdirSync(destDir, { recursive: true });
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force"`,
    { stdio: 'inherit' },
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (os.platform() !== 'win32') {
    err('This script currently only supports Windows (piper_windows_amd64).');
    err('On Linux/macOS, install piper manually: https://github.com/rhasspy/piper/releases');
    process.exit(1);
  }

  log(`Install directory: ${PIPER_DIR}`);
  fs.mkdirSync(PIPER_DIR, { recursive: true });
  fs.mkdirSync(VOICES_DIR, { recursive: true });

  // ── Piper binary ──────────────────────────────────────────────────────────
  if (fs.existsSync(PIPER_EXE)) {
    log(`Piper already installed: ${PIPER_EXE} — skipping.`);
  } else {
    const zipPath = path.join(os.tmpdir(), `piper_windows_amd64_${Date.now()}.zip`);
    try {
      await download(PIPER_ZIP_URL, zipPath);
      extractZip(zipPath, PIPER_DIR);
      if (!fs.existsSync(PIPER_EXE)) {
        throw new Error(`piper.exe not found after extraction at ${PIPER_EXE}`);
      }
      log(`Piper installed: ${PIPER_EXE}`);
    } finally {
      try { fs.unlinkSync(zipPath); } catch { /* ignore */ }
    }
  }

  // ── Voice model ───────────────────────────────────────────────────────────
  if (fs.existsSync(VOICE_MODEL) && fs.existsSync(VOICE_CONFIG)) {
    log(`Voice model already installed: ${VOICE_MODEL} — skipping.`);
  } else {
    await download(VOICE_MODEL_URL, VOICE_MODEL);
    log(`Voice model installed: ${VOICE_MODEL}`);

    await download(VOICE_CONFIG_URL, VOICE_CONFIG);
    log(`Voice config installed: ${VOICE_CONFIG}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  log('');
  log('Setup complete!');
  log(`  Piper exe:   ${PIPER_EXE}`);
  log(`  Voice model: ${VOICE_MODEL}`);
  log('');
  log('Update config.json (or app settings) if you installed to a custom PIPER_DIR:');
  log(`  tts.piperExe:   "${PIPER_EXE.replace(/\\/g, '\\\\')}"`);
  log(`  tts.piperModel: "${VOICE_MODEL.replace(/\\/g, '\\\\')}"`);
}

main().catch((error) => {
  err(error.message);
  process.exit(1);
});
