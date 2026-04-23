const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { logInfo, logError } = require('./logger');

class NativeTtsService {
  /**
   * Synthesize text to audio using piper TTS.
   * Returns { ok: true, buffer: ArrayBuffer } on success or { ok: false, error: string }.
   */
  async synthesize({ text, piperExe, modelPath }) {
    const sanitizedText = String(text || '').replace(/[\r\n]+/g, ' ').trim();
    if (!sanitizedText) return { ok: false, error: 'Empty text' };

    const resolvedExe = this._resolvePath(piperExe);
    const resolvedModel = this._resolvePath(modelPath);

    if (!fs.existsSync(resolvedExe)) {
      return { ok: false, error: `Piper executable not found: ${resolvedExe}. Run: npm run setup-piper` };
    }
    if (!fs.existsSync(resolvedModel)) {
      return { ok: false, error: `Piper voice model not found: ${resolvedModel}. Run: npm run setup-piper` };
    }

    const tempOut = path.join(
      os.tmpdir(),
      `desktopclaw-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`,
    );

    try {
      logInfo('native-tts', 'Starting Piper synthesis', { chars: sanitizedText.length });

      await new Promise((resolve, reject) => {
        const proc = spawn(
          resolvedExe,
          ['--model', resolvedModel, '--output-file', tempOut],
          { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
        );

        let stderr = '';
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        proc.on('error', (err) => reject(new Error(`Failed to start piper: ${err.message}`)));
        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Piper exited with code ${code}: ${stderr.slice(0, 300)}`));
          }
        });

        proc.stdin.write(sanitizedText, 'utf8');
        proc.stdin.end();
      });

      const nodeBuffer = fs.readFileSync(tempOut);
      // Copy into a standalone ArrayBuffer — Node Buffers share backing memory
      // so slicing alone is not safe across the IPC boundary.
      const arrayBuffer = new ArrayBuffer(nodeBuffer.length);
      const view = new Uint8Array(arrayBuffer);
      for (let i = 0; i < nodeBuffer.length; i++) view[i] = nodeBuffer[i];

      logInfo('native-tts', 'Piper synthesis succeeded', { bytes: nodeBuffer.length });
      return { ok: true, buffer: arrayBuffer };
    } catch (error) {
      logError('native-tts', 'Piper synthesis failed', { message: error.message });
      return { ok: false, error: error.message };
    } finally {
      try { fs.unlinkSync(tempOut); } catch { /* ignore */ }
    }
  }

  _resolvePath(p) {
    if (!p) return '';
    if (path.isAbsolute(p)) return p;
    // Resolve relative paths from the app root (two levels up from src/main/)
    return path.resolve(__dirname, '..', '..', p);
  }
}

module.exports = { NativeTtsService };
