const path = require('node:path');
const { spawn } = require('node:child_process');
const { logError, logInfo } = require('./logger');

class NativeSttService {
  constructor() {
    this.workspaceRoot = path.join(__dirname, '..', '..');
    this.pythonPath = 'python';
    this.scriptPath = path.join(this.workspaceRoot, 'src', 'native', 'vosk_listener.py');
    this.modelPath = path.join(this.workspaceRoot, 'models', 'vosk-model-small-en-us-0.15');
  }

  listenOnce(options = {}) {
    const timeoutSeconds = Number(options.timeoutSeconds) > 0 ? Number(options.timeoutSeconds) : 10;
    const silenceSeconds = Number(options.silenceSeconds) > 0 ? Number(options.silenceSeconds) : 1.2;
    const args = [
      this.scriptPath,
      '--model',
      this.modelPath,
      '--timeout-seconds',
      String(timeoutSeconds),
      '--silence-seconds',
      String(silenceSeconds),
    ];

    logInfo('native-stt', 'Starting Vosk listener', {
      pythonPath: this.pythonPath,
      scriptPath: this.scriptPath,
      modelPath: this.modelPath,
      timeoutSeconds,
      silenceSeconds,
    });

    return new Promise((resolve, reject) => {
      const child = spawn(this.pythonPath, args, {
        cwd: this.workspaceRoot,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });

      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });

      child.on('error', (error) => {
        logError('native-stt', 'Failed to spawn Vosk listener', error);
        reject(new Error(`Failed to start native speech recognition: ${error.message}`));
      });

      child.on('close', (code) => {
        const trimmedStdout = stdout.trim();
        const trimmedStderr = stderr.trim();

        if (trimmedStderr) {
          logInfo('native-stt', 'Vosk listener stderr', { stderr: trimmedStderr });
        }

        if (!trimmedStdout) {
          const message = trimmedStderr || `Native speech recognition exited with code ${code}`;
          logError('native-stt', 'Vosk listener returned no output', { code, stderr: trimmedStderr });
          reject(new Error(message));
          return;
        }

        try {
          const parsed = JSON.parse(trimmedStdout);
          if (!parsed.ok) {
            const message = parsed.error || 'Native speech recognition failed';
            const isTimeout = /no speech detected before timeout/i.test(message);
            if (isTimeout) {
              // Expected in wake-word polling loops; return a structured miss instead of throwing.
              logInfo('native-stt', 'Vosk listener timed out with no speech', parsed);
              resolve(parsed);
              return;
            }

            logError('native-stt', 'Vosk listener reported failure', parsed);
            reject(new Error(message));
            return;
          }

          logInfo('native-stt', 'Vosk listener succeeded', { text: parsed.text });
          resolve(parsed);
        } catch (error) {
          logError('native-stt', 'Failed to parse Vosk listener output', {
            stdout: trimmedStdout,
            stderr: trimmedStderr,
            error: error.message,
          });
          reject(new Error('Native speech recognition returned invalid output'));
        }
      });
    });
  }
}

module.exports = { NativeSttService };
