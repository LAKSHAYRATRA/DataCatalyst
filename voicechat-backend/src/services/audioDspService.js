import { spawn } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Runs deep Python DSP Spectral Analysis on a WAV/FLAC audio file.
 * USER DIRECTIVE:
 * 1. ONLY catch continuous static interference/tone/notch lines >= 2000 Hz (2 kHz+).
 * 2. Ignore all low frequencies below 2 kHz (speech fundamentals/mains harmonics).
 * 3. Scan ALL non-speech silence gaps for elevated static noise floor.
 */
export async function analyzeAudioDsp(audioFilePath) {
  return new Promise((resolve) => {
    if (!audioFilePath || !fs.existsSync(audioFilePath)) {
      return resolve({ success: false, error: "Audio file not found on disk" });
    }

    const pythonScript = `
import numpy as np, scipy.io.wavfile as wav, os, sys, json, subprocess

audio_path = sys.argv[1]
temp_wav = audio_path + "_temp_dsp.wav"

try:
    subprocess.run(['ffmpeg', '-i', audio_path, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', temp_wav, '-y'], 
                   capture_output=True, check=True)
    
    sr, data = wav.read(temp_wav)
    data = data.astype(np.float32) / 32768.0
    total_samples = len(data)
    dur = total_samples / sr
    
    n_fft = 2048
    hop = 512
    w = np.blackman(n_fft)
    num_frames = (total_samples - n_fft) // hop
    
    if num_frames < 4:
        print(json.dumps({"success": True, "verdict": "PASS", "defectBoxes": [], "tones": []}))
        sys.exit(0)

    stft = np.empty((n_fft // 2 + 1, num_frames), dtype=np.complex64)
    for t in range(num_frames):
        stft[:, t] = np.fft.rfft(data[t * hop : t * hop + n_fft] * w)

    mag = np.abs(stft)
    db = 20 * np.log10(np.maximum(1e-9, mag))
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)

    # Separate speech vs silence frames
    frame_energy = np.mean(db[0:170, :], axis=0) # 0-4kHz
    speech_thresh = np.max(frame_energy) - 20.0
    silence_frames = np.where(frame_energy < speech_thresh)[0]
    speech_frames = np.where(frame_energy >= speech_thresh)[0]

    mean_full_spec = np.mean(db, axis=1)
    silence_spec = np.mean(db[:, silence_frames], axis=1) if len(silence_frames) > 5 else None
    time_std = np.std(db, axis=1)
    defect_boxes = []

    # 1. Continuous Interference Lines / Whine / Notch: ONLY 2 kHz+ (2000Hz - 22000Hz)
    scan_bins = np.where((freqs >= 2000) & (freqs <= 22000))[0]
    detected_lines = []

    for b in scan_bins:
        f = freqs[b]
        if b >= 8 and b < len(freqs) - 8:
            # Median background across +/- 8 frequency bins (approx +/- 180 Hz)
            full_window = mean_full_spec[b-8:b+9]
            full_med = np.median(full_window)
            full_diff = mean_full_spec[b] - full_med
            stdev = time_std[b]

            # Case A: Persistent static tone line (active continuously across time)
            is_persistent_tone = (full_diff >= 1.6 and stdev < 7.0)

            # Case B: Tone line in silence/pause frames
            is_silence_tone = False
            if silence_spec is not None:
                sil_window = silence_spec[b-8:b+9]
                sil_med = np.median(sil_window)
                sil_diff = silence_spec[b] - sil_med
                if sil_diff >= 1.8 and stdev < 7.5:
                    is_silence_tone = True
                    full_diff = max(full_diff, sil_diff)

            # Case C: Sharp notch cut / dead line (e.g. 5kHz notch filter)
            is_notch = (full_diff <= -3.5 and stdev < 4.5)

            if is_persistent_tone or is_silence_tone:
                detected_lines.append((b, f, full_diff, "PEAK"))
            elif is_notch:
                detected_lines.append((b, f, full_diff, "DIP"))

    # Cluster adjacent line bins
    if len(detected_lines) > 0:
        clusters = []
        current_cluster = [detected_lines[0]]
        for item in detected_lines[1:]:
            if item[0] == current_cluster[-1][0] + 1 and item[3] == current_cluster[-1][3]:
                current_cluster.append(item)
            else:
                clusters.append(current_cluster)
                current_cluster = [item]
        clusters.append(current_cluster)

        for cluster in clusters:
            if cluster[0][3] == "PEAK":
                best = max(cluster, key=lambda x: x[2])
                f_tone = best[1]
                diff_db = best[2]
                sev = "Critical" if diff_db >= 3.5 else ("High" if diff_db >= 2.2 else "Medium")
                y_norm = int(round((1.0 - (f_tone / 24000.0)) * 1000))
                defect_boxes.append({
                    "id": len(defect_boxes) + 1,
                    "label": "STATIC_TONE_LINE",
                    "frequencyBand": f"{int(round(f_tone))} Hz",
                    "severity": sev,
                    "measuredDb": f"+{round(float(diff_db), 1)} dB",
                    "timeSpan": "Continuous 0s - End",
                    "box_2d": [max(0, y_norm - 10), 0, min(1000, y_norm + 10), 1000],
                    "issueDescription": f"STATIC_TONE_LINE ({int(round(f_tone))} Hz, +{round(float(diff_db), 1)} dB) · {sev} continuous static line"
                })
            else:
                best = min(cluster, key=lambda x: x[2])
                f_notch = best[1]
                dip_db = best[2]
                sev = "Critical" if dip_db <= -7.0 else ("High" if dip_db <= -4.5 else "Medium")
                y_norm = int(round((1.0 - (f_notch / 24000.0)) * 1000))
                defect_boxes.append({
                    "id": len(defect_boxes) + 1,
                    "label": "STATIC_TONE_LINE",
                    "frequencyBand": f"{int(round(f_notch))} Hz",
                    "severity": sev,
                    "measuredDb": f"{round(float(dip_db), 1)} dB dip",
                    "timeSpan": "Continuous 0s - End",
                    "box_2d": [max(0, y_norm - 10), 0, min(1000, y_norm + 10), 1000],
                    "issueDescription": f"NOTCH_STRIPE ({int(round(f_notch))} Hz, {round(float(dip_db), 1)} dB) · {sev} hardware notch line"
                })

    severities = [d["severity"] for d in defect_boxes]
    overall_sev = "Critical" if "Critical" in severities else ("High" if "High" in severities else ("Medium" if "Medium" in severities else "None"))
    verdict = "REJECT" if len(defect_boxes) > 0 else "PASS"

    result = {
        "success": True,
        "duration": round(dur, 2),
        "sampleRate": sr,
        "verdict": verdict,
        "hasStaticNoise": len(defect_boxes) > 0,
        "overallSeverity": overall_sev,
        "defectBoxes": defect_boxes
    }
    print(json.dumps(result))

except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
finally:
    if os.path.exists(temp_wav):
        try: os.remove(temp_wav)
        except: pass
`;

    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    const py = spawn(pythonCmd, ["-c", pythonScript, audioFilePath]);
    let stdout = "";
    let stderr = "";

    py.stdout.on("data", (d) => { stdout += d.toString(); });
    py.stderr.on("data", (d) => { stderr += d.toString(); });

    py.on("close", (code) => {
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (err) {
        console.warn("[audioDspService] Python output parse error:", stdout, stderr);
        resolve({ success: false, error: stderr || "Failed to parse DSP output" });
      }
    });

    py.on("error", (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}
