"""Optional offline Kokoro speech. Takes the same JSON stdin as speak.ps1."""
import io
import json
import os
from pathlib import Path
import sys
import winsound

import onnxruntime as ort
import soundfile as sf
from kokoro_onnx import Kokoro


def main():
    payload = json.load(sys.stdin)
    text = payload['text']
    if not isinstance(text, str) or not 1 <= len(text) <= 280:
        raise ValueError('Speech text must contain 1 to 280 characters')
    directory = Path(os.environ['AGENT_ALERT_KOKORO_DIR'])
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(directory / 'kokoro-v1.0.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
    engine = Kokoro.from_session(session, str(directory / 'voices-v1.0.bin'))
    voice = os.environ.get('AGENT_ALERT_KOKORO_VOICE', 'bm_lewis')
    language = os.environ.get('AGENT_ALERT_KOKORO_LANG', 'en-gb')
    speed = max(0.5, min(2.0, 2 ** (float(payload.get('rate', 0)) / 10)))
    samples, sample_rate = engine.create(text, voice=voice, speed=speed, lang=language)
    samples *= max(0, min(100, float(payload.get('volume', 70)))) / 100
    buffer = io.BytesIO()
    sf.write(buffer, samples, sample_rate, format='WAV', subtype='PCM_16')
    if len(sys.argv) == 3 and sys.argv[1] == '--save':
        Path(sys.argv[2]).write_bytes(buffer.getvalue())
    else:
        winsound.PlaySound(buffer.getvalue(), winsound.SND_MEMORY)


if __name__ == '__main__':
    main()
