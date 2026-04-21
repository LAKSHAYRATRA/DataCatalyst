"""
YAMNet WAV Noise Analyzer — Full Duration, Chunked Processing (v3)
==================================================================
- If tensorflow + librosa are installed: uses full YAMNet deep-learning analysis
- If not installed: gracefully falls back to pure-Python RMS-based analysis
  (no extra packages needed beyond the standard library)

Install for full YAMNet (optional but recommended on server):
  pip install tensorflow tensorflow-hub librosa soundfile numpy pandas

Usage:
  python yamnet_noise_analyzer_v3.py --input file.wav --json
"""

import os
import sys
import json
import struct
import argparse
import warnings
import math

warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────────────────────────────────────
#  Lazy-import helpers — everything is optional
# ─────────────────────────────────────────────────────────────────────────────

def _try_import_numpy():
    try:
        import numpy as np
        return np
    except ImportError:
        return None

def _try_import_librosa():
    try:
        import librosa
        return librosa
    except ImportError:
        return None

def _try_import_soundfile():
    try:
        import soundfile as sf
        return sf
    except ImportError:
        return None

def _try_import_tensorflow():
    try:
        import tensorflow as tf
        import tensorflow_hub as hub
        return tf, hub
    except ImportError:
        return None, None

# ─────────────────────────────────────────────────────────────────────────────
#  AudioSet class groups (used by YAMNet path)
# ─────────────────────────────────────────────────────────────────────────────

HEAVY_NOISE_CLASSES = {
    "Noise", "White noise", "Pink noise", "Static",
    "Cacophony", "Distortion", "Reverberation",
    "Environmental noise", "Wind noise", "Rain", "Thunder",
    "Water", "Stream", "Waterfall", "Fire", "Crackling",
    "Explosion", "Gunshot, gunfire", "Jackhammer", "Drill",
    "Power tool", "Lawn mower", "Chainsaw", "Engine",
    "Traffic noise, roadway noise", "Mechanisms",
    "Alarm", "Siren", "Civil defense siren",
    "Smoke detector, smoke alarm", "Car alarm",
    "Interference, noise", "Electric hum",
    "Bang", "Thud", "Boom", "Crash", "Breaking",
    "Glass", "Shatter", "Slam",
}

MODERATE_NOISE_CLASSES = {
    "Music", "Background music", "Ambient music", "Whispering",
    "Television", "Radio", "Telephone", "Inside, public space",
    "Outside, urban or manmade", "Vehicle", "Car", "Train",
    "Aircraft", "Bus", "Subway, metro, underground",
    "Crowd", "Hubbub, speech noise, speech babble",
    "Chatter", "Buzz", "Hum",
    "Dog", "Cat", "Bird", "Animal",
    "Baby cry, infant cry", "Crying, sobbing",
    "Laughter", "Cough", "Sneeze",
}

# ─────────────────────────────────────────────────────────────────────────────
#  Pure-Python WAV reader (no numpy/librosa needed)
# ─────────────────────────────────────────────────────────────────────────────

def _read_wav_pure_python(filepath):
    """Read a WAV file using only the stdlib `wave` module.
    Returns (samples_as_floats_list, sample_rate)."""
    import wave
    with wave.open(filepath, 'rb') as wf:
        n_channels = wf.getnchannels()
        sampwidth  = wf.getsampwidth()
        framerate  = wf.getframerate()
        n_frames   = wf.getnframes()
        raw        = wf.readframes(n_frames)

    # Decode PCM samples
    if sampwidth == 2:
        fmt = f"<{n_frames * n_channels}h"
        samples = list(struct.unpack(fmt, raw))
        max_val = 32768.0
    elif sampwidth == 1:
        fmt = f"<{n_frames * n_channels}B"
        samples = [s - 128 for s in struct.unpack(fmt, raw)]
        max_val = 128.0
    elif sampwidth == 3:
        # 24-bit — unpack manually
        samples = []
        for i in range(0, len(raw), 3):
            val = struct.unpack('<i', raw[i:i+3] + (b'\xff' if raw[i+2] & 0x80 else b'\x00'))[0]
            samples.append(val)
        max_val = 8388608.0
    else:
        raise ValueError(f"Unsupported sample width: {sampwidth}")

    # Mix to mono if stereo
    if n_channels > 1:
        samples = [
            sum(samples[i:i+n_channels]) / n_channels
            for i in range(0, len(samples), n_channels)
        ]

    # Normalize to [-1, 1]
    samples = [s / max_val for s in samples]
    return samples, framerate


# ─────────────────────────────────────────────────────────────────────────────
#  Fallback: pure-Python RMS analysis
# ─────────────────────────────────────────────────────────────────────────────

def _rms_noise_analysis(filepath, threshold=0.25):
    """
    Simple RMS-based fallback when YAMNet is unavailable.
    Divides audio into 100ms frames and computes RMS noise floor.
    Returns the same JSON shape as the YAMNet path.
    """
    try:
        samples, sr = _read_wav_pure_python(filepath)
    except Exception as e:
        return {
            "suspicion_rating": "ERROR",
            "rating_label": f"Could not read WAV: {e}",
        }

    frame_size  = max(1, int(sr * 0.1))      # 100ms frames
    n_frames    = len(samples) // frame_size

    if n_frames == 0:
        return {
            "suspicion_rating": 0,
            "rating_label": "Clean (file too short to analyze reliably)",
            "method": "rms_fallback",
        }

    rms_values = []
    for i in range(n_frames):
        chunk = samples[i * frame_size : (i + 1) * frame_size]
        rms   = math.sqrt(sum(s * s for s in chunk) / len(chunk))
        rms_values.append(rms)

    mean_rms = sum(rms_values) / len(rms_values)
    max_rms  = max(rms_values)

    # Heuristic thresholds (tuned to typical background noise levels)
    if mean_rms > 0.15 or max_rms > 0.50:
        rating = 10
        label  = f"Strong noise detected (RMS mean={mean_rms:.3f}, peak={max_rms:.3f})"
    elif mean_rms > 0.06 or max_rms > 0.25:
        rating = 5
        label  = f"Moderate noise detected (RMS mean={mean_rms:.3f}, peak={max_rms:.3f})"
    else:
        rating = 0
        label  = f"Clean — background noise within acceptable limits (RMS mean={mean_rms:.3f})"

    return {
        "suspicion_rating": rating,
        "rating_label":     label,
        "rms_mean":         round(mean_rms, 4),
        "rms_peak":         round(max_rms, 4),
        "frames_analyzed":  n_frames,
        "method":           "rms_fallback",
    }


# ─────────────────────────────────────────────────────────────────────────────
#  YAMNet path (full analysis)
# ─────────────────────────────────────────────────────────────────────────────

YAMNET_SR        = 16000
YAMNET_FRAME_DUR = 0.48
CHUNK_SECONDS    = 30


def _load_class_names():
    try:
        import csv, io, urllib.request
        url = ("https://raw.githubusercontent.com/tensorflow/models/master"
               "/research/audioset/yamnet/yamnet_class_map.csv")
        with urllib.request.urlopen(url, timeout=10) as response:
            reader = csv.DictReader(io.TextIOWrapper(response, encoding="utf-8"))
            return [row["display_name"] for row in reader]
    except Exception:
        return []


def _yamnet_analysis(filepath, tf, hub, np, librosa, sf, threshold=0.25):
    CHUNK_SAMPLES = YAMNET_SR * CHUNK_SECONDS

    # Load model
    model = hub.load("https://tfhub.dev/google/yamnet/1")
    class_names = _load_class_names()

    # Load audio
    audio, _ = librosa.load(filepath, sr=YAMNET_SR, mono=True, res_type="kaiser_fast")
    audio = audio.astype(np.float32)
    peak  = np.max(np.abs(audio))
    if peak > 0:
        audio = audio / peak

    total_samples = len(audio)
    chunk_count   = int(np.ceil(total_samples / CHUNK_SAMPLES))
    all_scores    = []

    for i in range(chunk_count):
        start = i * CHUNK_SAMPLES
        end   = min(start + CHUNK_SAMPLES, total_samples)
        chunk = audio[start:end]
        min_s = int(YAMNET_SR * 0.975) + 1
        if len(chunk) < min_s:
            chunk = np.pad(chunk, (0, min_s - len(chunk)))
        scores, _, _ = model(tf.constant(chunk, dtype=tf.float32))
        all_scores.append(scores.numpy())

    all_scores_np = np.concatenate(all_scores, axis=0)
    n_frames      = all_scores_np.shape[0]

    heavy_count    = 0
    moderate_count = 0

    for frame_idx in range(n_frames):
        frame_scores = all_scores_np[frame_idx]
        for class_idx, score in enumerate(frame_scores):
            if score < threshold:
                continue
            cname = class_names[class_idx] if class_names else f"Class_{class_idx}"
            if cname in HEAVY_NOISE_CLASSES:
                heavy_count += 1
            elif cname in MODERATE_NOISE_CLASSES:
                moderate_count += 1

    if heavy_count > 0:
        rating = 10
        label  = f"Strong noise detected — {heavy_count} heavy noise event(s) found"
    elif moderate_count > 0:
        rating = 5
        label  = f"Moderate noise detected — {moderate_count} moderate noise event(s) found"
    else:
        rating = 0
        label  = "Clean — no noise events detected"

    return {
        "suspicion_rating":    rating,
        "rating_label":        label,
        "frames_analyzed":     n_frames,
        "heavy_events_count":  heavy_count,
        "moderate_events_count": moderate_count,
        "method":              "yamnet",
    }


# ─────────────────────────────────────────────────────────────────────────────
#  Main entry point
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="YAMNet WAV noise analyzer (with RMS fallback)."
    )
    parser.add_argument("--input",     "-i", required=True, help="Path to a .wav file")
    parser.add_argument("--threshold", "-t", type=float, default=0.25)
    parser.add_argument("--json",      action="store_true",
                        help="Output result as JSON to stdout")
    parser.add_argument("--output",    "-o", default="yamnet_noise_results.csv")
    args = parser.parse_args()

    # Try full YAMNet first
    np      = _try_import_numpy()
    librosa = _try_import_librosa()
    sf      = _try_import_soundfile()
    tf, hub = _try_import_tensorflow()

    if tf is not None and hub is not None and np is not None and librosa is not None and sf is not None:
        # Full YAMNet path
        try:
            result = _yamnet_analysis(args.input, tf, hub, np, librosa, sf, args.threshold)
        except Exception as e:
            # YAMNet failed at runtime — fall back to RMS
            print(f"[YAMNet runtime error, falling back to RMS]: {e}", file=sys.stderr)
            result = _rms_noise_analysis(args.input, args.threshold)
    else:
        # Missing packages — use pure-Python RMS fallback
        missing = []
        if np is None:      missing.append("numpy")
        if librosa is None: missing.append("librosa")
        if sf is None:      missing.append("soundfile")
        if tf is None:      missing.append("tensorflow + tensorflow-hub")
        print(f"[RMS fallback — missing: {', '.join(missing)}]", file=sys.stderr)
        result = _rms_noise_analysis(args.input, args.threshold)

    # Always add the file name
    result["file"] = os.path.basename(args.input)

    if args.json:
        print(json.dumps(result))
    else:
        import csv
        with open(args.output, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=result.keys())
            w.writeheader()
            w.writerow(result)
        print(f"Results saved to: {args.output}")


if __name__ == "__main__":
    main()
