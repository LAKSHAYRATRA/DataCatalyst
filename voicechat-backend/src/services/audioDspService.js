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
    if data.ndim > 1:
        data = data[:, 0]
    data = data.astype(np.float32) / (32768.0 if data.dtype == np.int16 else 1.0)
    total_samples = len(data)
    dur = total_samples / float(sr)
    
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
    db = 20.0 * np.log10(np.maximum(1e-9, mag))
    freqs = np.fft.rfftfreq(n_fft, 1.0 / float(sr))

    mean_full_spec = np.mean(db, axis=1)
    p20_spec = np.percentile(db, 20, axis=1)
    defect_boxes = []

    # 1. Continuous Interference Lines / Whine / Notch: ONLY 2 kHz+ (2000Hz - 22000Hz)
    scan_bins = np.where((freqs >= 2000) & (freqs <= 22000))[0]
    detected_lines = []

    for b in scan_bins:
        f = freqs[b]
        w_min = max(0, b - 24)
        w_max = min(len(p20_spec), b + 25)
        
        base_p20 = np.median(p20_spec[w_min:w_max])
        diff_p20 = p20_spec[b] - base_p20
        
        base_mean = np.median(mean_full_spec[w_min:w_max])
        diff_mean = mean_full_spec[b] - base_mean
        
        # Static line persists in background floor (p20) or full average spectrum
        if diff_p20 >= 1.0 or diff_mean >= 1.3:
            diff_val = max(diff_p20, diff_mean)
            detected_lines.append((b, f, diff_val, "PEAK"))
        elif diff_mean <= -2.5:
            detected_lines.append((b, f, diff_mean, "DIP"))

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
                sev = "Critical" if diff_db >= 3.0 else ("High" if diff_db >= 1.8 else "Medium")
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
                sev = "Critical" if dip_db <= -6.0 else ("High" if dip_db <= -4.0 else "Medium")
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
      console.log(`[audioDspService] Python process exited with code ${code}. Stderr: "${stderr.trim()}"`);
      try {
        const parsed = JSON.parse(stdout.trim());
        console.log(`[audioDspService] DSP Result -> verdict: ${parsed.verdict}, defectBoxes: ${parsed.defectBoxes ? parsed.defectBoxes.length : 0}, error: ${parsed.error || "none"}`);
        resolve(parsed);
      } catch (err) {
        console.warn("[audioDspService] Python output parse error. Stdout:", stdout, "Stderr:", stderr);
        resolve({ success: false, error: stderr || "Failed to parse DSP output" });
      }
    });

    py.on("error", (err) => {
      console.error("[audioDspService] Failed to spawn Python process:", err.message);
      resolve({ success: false, error: err.message });
    });
  });
}
