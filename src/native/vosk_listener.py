#!/usr/bin/env python
import argparse
import json
import queue
import sys
import time
from pathlib import Path

import sounddevice as sd
from vosk import KaldiRecognizer, Model, SetLogLevel


audio_queue = queue.Queue()


def callback(indata, frames, time_info, status):  # noqa: ARG001
    if status:
        print(str(status), file=sys.stderr)
    audio_queue.put(bytes(indata))


def emit(payload):
    print(json.dumps(payload), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    parser.add_argument('--timeout-seconds', type=float, default=10.0)
    parser.add_argument('--silence-seconds', type=float, default=1.2)
    parser.add_argument('--device', default=None)
    args = parser.parse_args()

    model_path = Path(args.model)
    if not model_path.exists():
        emit({'ok': False, 'error': f'Vosk model not found: {model_path}'})
        return 1

    try:
        SetLogLevel(-1)
        device_info = sd.query_devices(args.device, 'input')
        sample_rate = int(device_info['default_samplerate'])
        model = Model(str(model_path))
        recognizer = KaldiRecognizer(model, sample_rate)
        recognizer.SetWords(True)
    except Exception as exc:  # noqa: BLE001
        emit({'ok': False, 'error': f'Failed to initialize Vosk: {exc}'})
        return 1

    start_time = time.monotonic()
    heard_speech_at = None
    last_partial = ''
    last_partial_at = None

    try:
        with sd.RawInputStream(
            samplerate=sample_rate,
            blocksize=8000,
            device=args.device,
            dtype='int16',
            channels=1,
            callback=callback,
        ):
            while True:
                now = time.monotonic()
                if now - start_time > args.timeout_seconds:
                    final = json.loads(recognizer.FinalResult())
                    text = (final.get('text') or last_partial or '').strip()
                    if text:
                        emit({'ok': True, 'text': text})
                    else:
                        emit({'ok': False, 'error': 'No speech detected before timeout'})
                    return 0

                try:
                    data = audio_queue.get(timeout=0.2)
                except queue.Empty:
                    if heard_speech_at and last_partial_at and now - last_partial_at > args.silence_seconds:
                        final = json.loads(recognizer.FinalResult())
                        text = (final.get('text') or last_partial or '').strip()
                        if text:
                            emit({'ok': True, 'text': text})
                            return 0
                    continue

                if recognizer.AcceptWaveform(data):
                    result = json.loads(recognizer.Result())
                    text = (result.get('text') or '').strip()
                    if text:
                        emit({'ok': True, 'text': text})
                        return 0
                else:
                    partial = json.loads(recognizer.PartialResult()).get('partial', '').strip()
                    if partial:
                        heard_speech_at = now
                        last_partial = partial
                        last_partial_at = now
    except Exception as exc:  # noqa: BLE001
        emit({'ok': False, 'error': f'Native microphone capture failed: {exc}'})
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
