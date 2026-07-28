"""
YAMNet WAV Noise Analyzer — Full Duration, Chunked Processing (v3)
==================================================================
Fixes:
  - Processes the ENTIRE audio file regardless of duration (30min, 40min, etc.)
  - Chunks audio into 30-second segments to avoid TF memory/tensor size limits
  - Aggregates all frame scores across all chunks before analysis

Install:
  pip install tensorflow tensorflow-hub librosa soundfile numpy pandas

Usage:
  Single file:    python yamnet_noise_analyzer_v3.py --input C:\\path\\to\\file.wav
  Folder:         python yamnet_noise_analyzer_v3.py --input C:\\path\\to\\folder\\
  With threshold: python yamnet_noise_analyzer_v4.py --input ... --threshold 0.20


  run this best: python yamnet_noise_analyzer_v4.py --input . --threshold 0.20

"""

import os
os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import sys
import re
import argparse
import warnings
import numpy as np
import pandas as pd
import librosa
import soundfile as sf
from pathlib import Path

warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────────────────────────────────────
#  AudioSet Class Groups
# ─────────────────────────────────────────────────────────────────────────────

CLEAN_CLASSES = {
    "Speech", "Male speech, man speaking", "Female speech, woman speaking",
    "Child speech, kid speaking", "Conversation", "Narration, monologue",
    "Silence", "Inside, small room", "Inside, large room or hall",
}

MODERATE_NOISE_CLASSES = {
    "Music", "Background music", "Ambient music", "Whispering",
    "Television", "Radio", "Telephone", "Inside, public space",
    "Outside, urban or manmade", "Vehicle", "Car", "Train",
    "Aircraft", "Bus", "Subway, metro, underground",
    "Crowd", "Hubbub, speech noise, speech babble",
    "Chatter", "Buzz", "Hum",
    "Bell", "Doorbell", "Telephone bell ringing", "Church bell",
    "Jingle bell", "Bicycle bell", "Ding-dong",
    "Chime", "Wind chime", "Knock", "Tap", "Squeak",
    "Creak", "Clap", "Snap", "Click",
    "Dog", "Cat", "Bird", "Animal",
    "Baby cry, infant cry", "Crying, sobbing",
    "Laughter", "Cough", "Sneeze",
}

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

# ─────────────────────────────────────────────────────────────────────────────
#  YAMNet constants
# ─────────────────────────────────────────────────────────────────────────────

YAMNET_SR            = 16000       # YAMNet expects 16 kHz mono
YAMNET_FRAME_DUR     = 0.48        # seconds per output frame (0.96s window, 50% hop)
CHUNK_SECONDS        = 30          # process in 30-second chunks to avoid OOM
CHUNK_SAMPLES        = YAMNET_SR * CHUNK_SECONDS


# ─────────────────────────────────────────────────────────────────────────────
#  Load YAMNet
# ─────────────────────────────────────────────────────────────────────────────

def load_yamnet():
    try:
        import tensorflow as tf
        import tensorflow_hub as hub
    except ImportError:
        print("\n[ERROR] Missing packages. Run:\n")
        print("  pip install tensorflow tensorflow-hub\n")
        sys.exit(1)

    print("  Loading YAMNet (downloads ~12 MB on first run)...")
    try:
        model = hub.load("https://tfhub.dev/google/yamnet/1")
    except ValueError as e:
        err_msg = str(e)
        if "tfhub_modules" in err_msg and ("contains neither" in err_msg or "incompatible/unknown type" in err_msg):
            import re
            import shutil
            paths = re.findall(r"'(.*?)'", err_msg)
            if paths and os.path.exists(paths[0]):
                corrupt_dir = paths[0]
                print(f"  [Warning] Corrupted TFHub cache detected at: {corrupt_dir}")
                print("  Clearing corrupted cache and retrying download...")
                try:
                    shutil.rmtree(corrupt_dir, ignore_errors=True)
                    model = hub.load("https://tfhub.dev/google/yamnet/1")
                except Exception as retry_err:
                    print(f"\n[ERROR] Failed to reload YAMNet after clearing cache: {retry_err}\n")
                    sys.exit(1)
            else:
                import tempfile
                temp_tfhub = os.path.join(tempfile.gettempdir(), "tfhub_modules")
                if os.path.exists(temp_tfhub):
                    print(f"  [Warning] Corrupted cache error: {err_msg}")
                    print(f"  Clearing entire TFHub cache directory: {temp_tfhub}")
                    shutil.rmtree(temp_tfhub, ignore_errors=True)
                    try:
                        model = hub.load("https://tfhub.dev/google/yamnet/1")
                    except Exception as retry_err:
                        print(f"\n[ERROR] Failed to load YAMNet after clearing cache: {retry_err}\n")
                        sys.exit(1)
                else:
                    print(f"\n[ERROR] ValueError loading YAMNet: {e}\n")
                    sys.exit(1)
        else:
            print(f"\n[ERROR] ValueError loading YAMNet: {e}\n")
            sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Unexpected error loading YAMNet: {e}\n")
        sys.exit(1)

    print("  YAMNet ready.\n")
    return model, tf


def load_class_names():
    # 1. Try local file first (ensures offline reliability in AWS Lambda Sandbox)
    local_path = Path(__file__).parent / "yamnet_class_map.csv"
    if local_path.exists():
        try:
            import csv
            with open(local_path, mode="r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                return [row["display_name"] for row in reader]
        except Exception as e:
            print(f"  [Warning] Failed to load local class map: {e}")

    # 2. Fallback to Github
    try:
        import csv, io, urllib.request
        url = ("https://raw.githubusercontent.com/tensorflow/models/master"
               "/research/audioset/yamnet/yamnet_class_map.csv")
        # Add a timeout of 5 seconds to prevent indefinite hanging when offline
        with urllib.request.urlopen(url, timeout=5) as response:
            reader = csv.DictReader(io.TextIOWrapper(response, encoding="utf-8"))
            return [row["display_name"] for row in reader]
    except Exception:
        return []


# ─────────────────────────────────────────────────────────────────────────────
#  Audio Helpers
# ─────────────────────────────────────────────────────────────────────────────

import math
from scipy.signal import resample_poly

def load_audio_full(filepath):
    """
    Load the ENTIRE audio file (capped to first 10 minutes) and resample it to 16kHz mono using scipy.signal.resample_poly.
    This is highly memory-efficient and avoids spawning external binaries or using heavy librosa Kaiser windows.
    """
    print(f"         Loading audio via soundfile (capped to 10 mins)...")
    info = sf.info(filepath)
    sr = info.samplerate
    max_frames = min(info.frames, 600 * sr)
    audio, sr = sf.read(filepath, dtype='float32', frames=max_frames)
    
    # If stereo, mix down to mono by taking the mean of channels
    if len(audio.shape) > 1:
        audio = audio.mean(axis=1)
        
    if sr != YAMNET_SR:
        print(f"         Resampling audio from {sr}Hz to {YAMNET_SR}Hz...")
        gcd = math.gcd(sr, YAMNET_SR)
        up = YAMNET_SR // gcd
        down = sr // gcd
        audio = resample_poly(audio, up, down)
        
    # Peak normalize
    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = audio / peak
    return audio


def get_original_sample_rate(filepath):
    return sf.info(filepath).samplerate


def format_time(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


# ─────────────────────────────────────────────────────────────────────────────
#  Chunked YAMNet Inference
# ─────────────────────────────────────────────────────────────────────────────

def run_yamnet_chunked(filepath, model, tf):
    """
    Stream audio directly from disk in CHUNK_SECONDS-sized blocks, resample, and run YAMNet.
    Uses virtually zero memory even for 1-hour files.
    """
    info = sf.info(filepath)
    sr = info.samplerate
    chunk_samples = sr * CHUNK_SECONDS
    
    all_scores = []
    all_timestamps = []
    
    block_idx = 0
    # Read in chunks using soundfile blocks
    # Using blocks streams the file directly from disk without loading it fully in RAM
    for chunk in sf.blocks(filepath, blocksize=chunk_samples, dtype='float32', fill_value=0.0):
        # Mix down to mono if stereo
        if len(chunk.shape) > 1:
            chunk = chunk.mean(axis=1)
            
        # Resample to YAMNET_SR (16000) using scipy polyphase resampler
        if sr != YAMNET_SR:
            gcd = math.gcd(sr, YAMNET_SR)
            up = YAMNET_SR // gcd
            down = sr // gcd
            chunk = resample_poly(chunk, up, down)
            
        # Peak normalize the chunk
        peak = np.max(np.abs(chunk))
        if peak > 0:
            chunk = chunk / peak
            
        # Ensure it has enough samples for YAMNet
        min_samples = int(YAMNET_SR * 0.975) + 1
        if len(chunk) < min_samples:
            chunk = np.pad(chunk, (0, min_samples - len(chunk)))
            
        chunk_tensor = tf.constant(chunk, dtype=tf.float32)
        scores, _, _ = model(chunk_tensor)
        scores_np = scores.numpy()
        n_frames = scores_np.shape[0]
        
        # Anchor timestamps
        chunk_start_sec = (block_idx * chunk_samples) / sr
        frame_times = chunk_start_sec + np.arange(n_frames) * YAMNET_FRAME_DUR
        
        all_scores.append(scores_np)
        all_timestamps.append(frame_times)
        
        elapsed_start = format_time(chunk_start_sec)
        elapsed_end = format_time(chunk_start_sec + len(chunk)/YAMNET_SR)
        print(f"           Streaming Chunk {block_idx+1}  [{elapsed_start} -> {elapsed_end}]  frames: {n_frames}")
        
        block_idx += 1
        
    return (
        np.concatenate(all_scores, axis=0),
        np.concatenate(all_timestamps, axis=0)
    )


# ─────────────────────────────────────────────────────────────────────────────
#  Per-Frame Event Detection
# ─────────────────────────────────────────────────────────────────────────────

def detect_noise_events(scores, frame_times, class_names, threshold):
    num_frames      = scores.shape[0]
    heavy_events    = []
    moderate_events = []

    for frame_idx in range(num_frames):
        frame_scores  = scores[frame_idx]
        timestamp_sec = float(frame_times[frame_idx])  # exact, sample-anchored

        for class_idx, score in enumerate(frame_scores):
            if score < threshold:
                continue

            cname = class_names[class_idx] if class_names else f"Class_{class_idx}"

            event = {
                "frame":         frame_idx,
                "timestamp":     format_time(timestamp_sec),
                "timestamp_sec": round(timestamp_sec, 2),
                "class":         cname,
                "score":         round(float(score), 4),
            }

            if cname in HEAVY_NOISE_CLASSES:
                event["severity"] = "HEAVY"
                heavy_events.append(event)
            elif cname in MODERATE_NOISE_CLASSES:
                event["severity"] = "MODERATE"
                moderate_events.append(event)

    mean_scores = scores.mean(axis=0)
    top_idx     = int(np.argmax(mean_scores))
    top_class   = class_names[top_idx] if class_names else f"Class_{top_idx}"
    top_score   = round(float(mean_scores[top_idx]), 4)

    peak_heavy    = max((e["score"] for e in heavy_events),    default=0.0)
    peak_moderate = max((e["score"] for e in moderate_events), default=0.0)

    if heavy_events:
        unique_classes = list({e["class"] for e in heavy_events})
        rating = 10
        # Avoid non-ASCII em-dash to prevent UnicodeEncodeError on Windows console
        label  = f"Strong noise detected - {len(unique_classes)} heavy noise class(es) found"
    elif moderate_events:
        unique_classes = list({e["class"] for e in moderate_events})
        rating = 5
        # Avoid non-ASCII em-dash to prevent UnicodeEncodeError on Windows console
        label  = f"Moderate noise detected - {len(unique_classes)} moderate noise class(es) found"
    else:
        rating = 0
        # Avoid non-ASCII em-dash to prevent UnicodeEncodeError on Windows console
        label  = "Clean - no noise events detected in any frame"

    return {
        "suspicion_rating":    rating,
        "rating_label":        label,
        "heavy_events":        heavy_events,
        "moderate_events":     moderate_events,
        "peak_heavy_score":    round(peak_heavy, 4),
        "peak_moderate_score": round(peak_moderate, 4),
        "total_frames":        num_frames,
        "overall_top_class":   f"{top_class} ({top_score})",
    }


# ─────────────────────────────────────────────────────────────────────────────
#  Analyze Single File
# ─────────────────────────────────────────────────────────────────────────────

def analyze_file(filepath, model, tf, class_names, threshold):
    original_sr  = get_original_sample_rate(filepath)
    duration_sec = round(sf.info(filepath).duration, 2)

    print(f"         Sample Rate : {original_sr} Hz")
    print(f"         Duration    : {format_time(duration_sec)}  ({duration_sec:.1f}s)")
    print(f"         Running streaming YAMNet inference ({CHUNK_SECONDS}s chunks)...")

    # ← KEY FIX: stream audio and do chunked inference over full audio
    scores_np, frame_times = run_yamnet_chunked(filepath, model, tf)

    print(f"         Total frames analyzed : {scores_np.shape[0]}")
    print(f"         Scanning events (threshold={threshold})...")

    result = detect_noise_events(scores_np, frame_times, class_names, threshold)

    # Deduplicate: one entry per class per 60-second window
    # Then pick top 20 by score but sort them by TIME so the output
    # shows a proper timeline across the full duration.
    BUCKET_FRAMES = int(60 / YAMNET_FRAME_DUR)   # ~62 frames = 60 s window

    seen          = set()
    unique_events = []
    for e in result["heavy_events"] + result["moderate_events"]:
        key = (e["class"], e["frame"] // BUCKET_FRAMES)
        if key not in seen:
            seen.add(key)
            unique_events.append(e)

    # Pick top 20 by score, then re-sort chronologically
    top_events = sorted(unique_events, key=lambda x: x["score"], reverse=True)[:20]
    top_events = sorted(top_events,    key=lambda x: x["timestamp_sec"])

    # Filter out redundant events that are already covered in the 8s playback window of a kept event
    filtered_events = []
    for e in top_events:
        covered = False
        t_sec = e["timestamp_sec"]
        for kept in filtered_events:
            k_sec = kept["timestamp_sec"]
            k_start = max(0.0, k_sec - 3.0)
            k_end = k_start + 8.0
            if k_start <= t_sec <= k_end:
                covered = True
                break
        if not covered:
            filtered_events.append(e)
    top_events = filtered_events

    events_str = " | ".join(
        f"[{e['timestamp']}] {e['class']} ({e['score']}) [{e['severity']}]"
        for e in top_events
    ) if top_events else "None"

    return {
        "file":                  os.path.basename(filepath),
        "full_path":             filepath,
        "suspicion_rating":      result["suspicion_rating"],
        "rating_label":          result["rating_label"],
        "sample_rate_hz":        original_sr,
        "duration":              format_time(duration_sec),
        "duration_sec":          duration_sec,
        "frames_analyzed":       result["total_frames"],
        "overall_top_class":     result["overall_top_class"],
        "heavy_events_count":    len(result["heavy_events"]),
        "moderate_events_count": len(result["moderate_events"]),
        "peak_heavy_score":      result["peak_heavy_score"],
        "peak_moderate_score":   result["peak_moderate_score"],
        "top_noise_events":      events_str,
        "events":                top_events,
    }


# ─────────────────────────────────────────────────────────────────────────────
#  File Collection
# ─────────────────────────────────────────────────────────────────────────────

def collect_wav_files(path):
    p = Path(path)
    if p.is_file() and p.suffix.lower() == ".wav":
        return [str(p)]
    elif p.is_dir():
        files = sorted(str(f) for f in p.rglob("*.wav"))
        if not files:
            print(f"[ERROR] No .wav files found in: {path}")
            sys.exit(1)
        return files
    else:
        print(f"[ERROR] Path not found: {path}")
        sys.exit(1)


# ─────────────────────────────────────────────────────────────────────────────
#  Print Summary
# ─────────────────────────────────────────────────────────────────────────────

def print_summary(df):
    print("\n" + "=" * 78)
    print("   YAMNet  WAV BACKGROUND NOISE SUSPICION REPORT")
    print("=" * 78)

    for _, row in df.iterrows():
        icon = {0: "[CLEAN-0]", 5: "[MODERATE-5]", 10: "[NOISY-10]"}.get(
            row["suspicion_rating"], "[ERROR]"
        )
        print(f"\n  {icon}  {row['file']}")
        print(f"      Suspicion Rating   : {row['suspicion_rating']}")
        print(f"      Label              : {row['rating_label']}")
        print(f"      Sample Rate        : {row.get('sample_rate_hz', 'N/A')} Hz")
        print(f"      Duration           : {row.get('duration', 'N/A')}")
        print(f"      Frames Analyzed    : {row.get('frames_analyzed', 'N/A')}")
        print(f"      Heavy Events       : {row.get('heavy_events_count', 0)}")
        print(f"      Moderate Events    : {row.get('moderate_events_count', 0)}")
        print(f"      Peak Heavy Score   : {row.get('peak_heavy_score', 'N/A')}")
        events = str(row.get("top_noise_events", "None"))
        if events != "None":
            print(f"      Noise Events Detected:")
            for event in events.split(" | "):
                print(f"        -> {event}")

    valid = df[df["suspicion_rating"].apply(lambda x: isinstance(x, (int, float)))]
    print("\n" + "-" * 78)
    if not valid.empty:
        c = valid["suspicion_rating"].value_counts().sort_index()
        print(f"  SUMMARY -> Rating 0: {c.get(0,0)} file(s)  |  "
              f"Rating 5: {c.get(5,0)} file(s)  |  "
              f"Rating 10: {c.get(10,0)} file(s)")
    print("=" * 78 + "\n")


# ─────────────────────────────────────────────────────────────────────────────
#  WAV Duration Comparison
# ─────────────────────────────────────────────────────────────────────────────

def extract_call_id(filepath):
    """
    Extracts the call ID from the filename.
    Strips speaker prefix (e.g. 'spk_55-12345' or 'spk_55_12345' -> '12345').
    """
    filename = os.path.basename(filepath)
    name_without_ext = os.path.splitext(filename)[0]
    
    # Match spk[-_]<alphanumeric>[-_]<call_id>
    match = re.match(r'^spk[-_][a-zA-Z0-9]+[-_](.+)$', name_without_ext, re.IGNORECASE)
    if match:
        return match.group(1)
        
    # Match <digits>[-_]<call_id> (e.g., 55-12345 or 55_12345)
    match_digits = re.match(r'^\d+[-_](.+)$', name_without_ext)
    if match_digits:
        return match_digits.group(1)
        
    # General fallback: if there is an underscore or dash, split after the first segment
    parts = re.split(r'[-_]', name_without_ext, maxsplit=1)
    if len(parts) >= 2:
        return parts[1]
        
    return None

def compare_and_report_durations(wav_files, output_csv_path):
    """
    Finds pairs of WAV files with matching Call IDs, calculates their precise 
    durations in milliseconds, reports the difference, and writes to a CSV.
    """
    pairs = []
    n = len(wav_files)
    
    # Store extracted call IDs for active files
    file_info = []
    for f in wav_files:
        call_id = extract_call_id(f)
        if call_id:
            file_info.append((f, call_id))
            
    # Find matching pairs (same call ID, different filenames/paths)
    for i in range(len(file_info)):
        for j in range(i + 1, len(file_info)):
            path1, call_id1 = file_info[i]
            path2, call_id2 = file_info[j]
            
            if call_id1 == call_id2 and os.path.basename(path1) != os.path.basename(path2):
                pairs.append((path1, path2, call_id1))
                
    if not pairs:
        return
        
    print("\n" + "=" * 78)
    print("   WAV CALL ID DURATION COMPARISON (Matching Call IDs)")
    print("=" * 78)
    
    comparison_records = []
    
    for path1, path2, call_id in pairs:
        try:
            info1 = sf.info(path1)
            info2 = sf.info(path2)
            
            dur1 = info1.duration
            dur2 = info2.duration
            diff_ms = abs(dur1 - dur2) * 1000.0
            
            print(f"\n  Call ID Match: {call_id}")
            print(f"    File 1: {os.path.basename(path1)}")
            print(f"            Duration: {dur1:.6f}s ({dur1*1000.0:.3f} ms)")
            print(f"    File 2: {os.path.basename(path2)}")
            print(f"            Duration: {dur2:.6f}s ({dur2*1000.0:.3f} ms)")
            print(f"    Difference: {diff_ms:.3f} ms")
            
            comparison_records.append({
                "Call_ID": call_id,
                "File_1": os.path.basename(path1),
                "File_2": os.path.basename(path2),
                "Duration_1_sec": round(dur1, 6),
                "Duration_2_sec": round(dur2, 6),
                "Difference_ms": round(diff_ms, 3),
                "Path_1": path1,
                "Path_2": path2
            })
        except Exception as e:
            print(f"  [Error comparing {os.path.basename(path1)} and {os.path.basename(path2)}: {e}]")
            
    print("\n" + "=" * 78 + "\n")
    
    if comparison_records:
        base, ext = os.path.splitext(output_csv_path)
        comp_csv = f"{base}_duration_comparisons{ext}"
        try:
            pd.DataFrame(comparison_records).to_csv(comp_csv, index=False)
            print(f"  Duration comparison results saved to: {comp_csv}\n")
        except Exception as e:
            print(f"  [Error saving comparison CSV: {e}]")


# ─────────────────────────────────────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="YAMNet WAV noise analyzer — full-duration chunked processing."
    )
    parser.add_argument("--input",  "-i", required=True,
                        help="Path to a .wav file or folder of .wav files")
    parser.add_argument("--output", "-o", default="yamnet_noise_results.csv",
                        help="Output CSV path (default: yamnet_noise_results.csv)")
    parser.add_argument("--threshold", "-t", type=float, default=0.25,
                        help="Detection sensitivity 0.0–1.0 (default=0.25). "
                             "Lower = more sensitive.")
    parser.add_argument("--chunk-seconds", "-c", type=int, default=CHUNK_SECONDS,
                        help=f"Seconds per inference chunk (default={CHUNK_SECONDS}). "
                             "Reduce if you get OOM errors.")
    parser.add_argument("--json", action="store_true",
                        help="Output single-file results as JSON instead of CSV/terminal report")
    args = parser.parse_args()

    # Allow overriding chunk size via CLI
    global CHUNK_SAMPLES
    CHUNK_SAMPLES = YAMNET_SR * args.chunk_seconds

    model, tf   = load_yamnet()
    class_names = load_class_names()
    if not class_names:
        if not args.json:
            print("  [Warning] Could not load class names. Using class indices.\n")

    wav_files = collect_wav_files(args.input)

    if args.json:
        if len(wav_files) == 1:
            try:
                record = analyze_file(wav_files[0], model, tf, class_names, args.threshold)
                import json
                print(json.dumps(record))
            except Exception as e:
                import json
                print(json.dumps({"error": str(e)}))
            sys.exit(0)
    print(f"  Found {len(wav_files)} WAV file(s). "
          f"Threshold = {args.threshold}  |  Chunk = {args.chunk_seconds}s\n")

    records = []
    for i, wav in enumerate(wav_files, 1):
        print(f"\n  [{i}/{len(wav_files)}] {os.path.basename(wav)}")
        try:
            record = analyze_file(wav, model, tf, class_names, args.threshold)
            records.append(record)
        except Exception as e:
            print(f"         ERROR: {e}")
            records.append({
                "file":             os.path.basename(wav),
                "full_path":        wav,
                "suspicion_rating": "ERROR",
                "rating_label":     str(e),
                "sample_rate_hz":   "N/A",
            })

    df = pd.DataFrame(records)
    print_summary(df)
    df.to_csv(args.output, index=False)
    print(f"  Results saved to: {args.output}\n")

    # Compare and report precise durations for files with matching Call IDs
    compare_and_report_durations(wav_files, args.output)


if __name__ == "__main__":
    main()
