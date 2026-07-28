import numpy as np
import soundfile as sf
import os
import glob
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
from scipy.signal import welch


# ─────────────────────────────────────────────
# ANALYSIS
# ─────────────────────────────────────────────

def estimate_bit_depth_from_speech(audio):
    abs_audio = np.abs(audio)
    quiet_nonzero = abs_audio[(abs_audio > 0) & (abs_audio < 0.01)]
    if len(quiet_nonzero) < 100:
        return None
    return float(20 * np.log10(np.mean(quiet_nonzero)))


def diagnose_noise_floor(noise_floor_db):
    """
    Returns detailed reason for noise floor reading
    instead of a generic 'PROCESSED' label.
    """
    if noise_floor_db is None:
        return "Cannot determine — no non-zero quiet samples found"

    if noise_floor_db < -144:
        return f"{round(noise_floor_db,1)} dBFS — below theoretical 24-bit floor, possible noise gate or digital silence"
    elif noise_floor_db < -130:
        return f"{round(noise_floor_db,1)} dBFS — genuine 24-bit ADC confirmed"
    elif noise_floor_db < -110:
        return f"{round(noise_floor_db,1)} dBFS — between 18–22 bit range, high quality but not full 24-bit"
    elif noise_floor_db < -96:
        return f"{round(noise_floor_db,1)} dBFS — near 16-bit ceiling (~-96 dBFS), likely 16-bit source"
    elif noise_floor_db < -80:
        return f"{round(noise_floor_db,1)} dBFS — above 16-bit floor, likely AGC, Windows audio enhancements, or browser recorder"
    elif noise_floor_db < -60:
        return f"{round(noise_floor_db,1)} dBFS — heavy processing detected, likely noise suppression, GHub, or DSP plugin active"
    else:
        return f"{round(noise_floor_db,1)} dBFS — extremely high noise floor, near-clipping DSP or severe processing"


def get_bit_verdict(noise_floor_db, noise_gate_detected=False):
    prefix = "(noise gate present) " if noise_gate_detected else ""

    if noise_floor_db is None:
        if noise_gate_detected:
            return "NOISE GATE — bit depth unverifiable ⚠️", "WARN"
        return "EMPTY FILE ⚠️", "WARN"
    elif noise_floor_db < -130:
        return f"GENUINE 24-bit ✅ {prefix}", "PASS"
    elif noise_floor_db < -90:
        return f"16-bit / FAKE 24-bit ❌ {prefix}", "FAIL"
    elif noise_floor_db < -60:
        return f"PROCESSED ⚠️ {prefix}", "WARN"
    else:
        return f"HEAVILY PROCESSED ❌ {prefix}", "FAIL"


def analyze_file(filepath):
    audio, sr = sf.read(filepath)

    if len(audio.shape) > 1:
        audio = audio.mean(axis=1)

    # ── Noise floor — standard method (quietest 10%) ──
    sorted_samples = np.sort(np.abs(audio))
    noise_samples  = sorted_samples[:int(len(sorted_samples) * 0.1)]
    noise_samples  = noise_samples[noise_samples > 0]

    noise_gate_detected = False

    if len(noise_samples) == 0:
        if np.max(np.abs(audio)) > 0:
            noise_gate_detected = True
            noise_floor_db = estimate_bit_depth_from_speech(audio)
        else:
            noise_floor_db = None
    else:
        noise_floor_db = float(20 * np.log10(np.mean(noise_samples)))

    # ── Bit depth verdict + detailed diagnosis ──
    bit_verdict, bit_status = get_bit_verdict(noise_floor_db, noise_gate_detected)
    noise_diagnosis = diagnose_noise_floor(noise_floor_db)

    # ── Processing detection ──
    peak = float(20 * np.log10(np.max(np.abs(audio)) + 1e-12))
    rms  = float(20 * np.log10(np.sqrt(np.mean(audio**2)) + 1e-12))
    crest_factor = peak - rms

    processing_flags   = []
    processing_reasons = []

    if crest_factor < 10:
        processing_flags.append("compression/limiting")
        processing_reasons.append(f"Crest factor {round(crest_factor,1)} dB — below 10 dB indicates dynamic compression or limiting applied")

    if noise_floor_db is not None and noise_floor_db > -80 and noise_floor_db < -60:
        processing_flags.append("AGC/Windows enhancements")
        processing_reasons.append(f"Noise floor {round(noise_floor_db,1)} dBFS — consistent with Windows audio enhancements, AGC, or browser recorder")

    if noise_floor_db is not None and noise_floor_db >= -60:
        processing_flags.append("noise suppression")
        processing_reasons.append(f"Noise floor {round(noise_floor_db,1)} dBFS — consistent with active noise suppression (GHub, Discord, Teams, or DSP plugin)")

    if noise_floor_db is not None and noise_floor_db < -144:
        processing_flags.append("possible noise gate")
        processing_reasons.append(f"Noise floor {round(noise_floor_db,1)} dBFS — below theoretical 24-bit floor, noise gate likely zeroing silence sections")

    if noise_gate_detected:
        processing_flags.append("noise gate confirmed")
        processing_reasons.append("Quietest 10% of file is all zeros — noise gate actively zeroing silence between words")

    if peak > -0.5:
        processing_flags.append("clipping risk")
        processing_reasons.append(f"Peak {round(peak,2)} dBFS — dangerously close to 0 dBFS, re-take or reduce gain")

    processing_verdict = ", ".join(processing_flags) if processing_flags else "Clean ✅"
    processing_status  = "WARN" if processing_flags else "PASS"

    # ── Peak level ──
    if peak <= -6:
        peak_verdict, peak_status = f"{round(peak,2)} dBFS ✅", "PASS"
    elif peak <= 0:
        peak_verdict, peak_status = f"{round(peak,2)} dBFS ⚠️ (above -6)", "WARN"
    else:
        peak_verdict, peak_status = f"{round(peak,2)} dBFS ❌ CLIPPING", "FAIL"

    # ── Header ──
    with sf.SoundFile(filepath) as f:
        header   = f.subtype
        channels = f.channels
        frames   = f.frames

    duration = round(frames / sr, 2)
    mono_ok  = channels == 1
    sr_ok    = sr in [48000, 44100]

    # ── Silence gaps ──
    threshold = 0.001
    nonzero   = np.where(np.abs(audio) > threshold)[0]
    if len(nonzero) > 0:
        lead_ms  = round((nonzero[0] / sr) * 1000, 1)
        trail_ms = round(((len(audio) - nonzero[-1]) / sr) * 1000, 1)
    else:
        lead_ms = trail_ms = 0

    lead_ok  = lead_ms  <= 300
    trail_ok = trail_ms <= 200

    # ── Overall ──
    statuses = [bit_status, peak_status]
    if "FAIL" in statuses or not mono_ok or not sr_ok:
        overall = "FAIL ❌"
    elif "WARN" in statuses or processing_flags or not lead_ok or not trail_ok:
        overall = "WARN ⚠️"
    else:
        overall = "PASS ✅"

    # ── Frequency data (Welch) ──
    freqs, psd = welch(audio, fs=sr, nperseg=8192, scaling='density')
    db = 10 * np.log10(psd + 1e-12)
    db = db - db.max()

    return {
        "file":               os.path.basename(filepath),
        "filepath":           filepath,
        "audio":              audio,
        "sr":                 sr,
        "freqs":              freqs,
        "db":                 db,
        "duration":           duration,
        "header":             header,
        "sr_ok":              sr_ok,
        "channels":           channels,
        "mono_ok":            mono_ok,
        "noise_floor_db":     round(noise_floor_db, 2) if noise_floor_db else None,
        "noise_diagnosis":    noise_diagnosis,
        "noise_gate":         noise_gate_detected,
        "bit_verdict":        bit_verdict,
        "bit_status":         bit_status,
        "peak_db":            round(peak, 2),
        "peak_verdict":       peak_verdict,
        "peak_status":        peak_status,
        "crest_factor":       round(crest_factor, 2),
        "processing_verdict": processing_verdict,
        "processing_reasons": processing_reasons,
        "processing_status":  processing_status,
        "lead_ms":            lead_ms,
        "trail_ms":           trail_ms,
        "lead_ok":            lead_ok,
        "trail_ok":           trail_ok,
        "overall":            overall,
    }


# ─────────────────────────────────────────────
# TERMINAL REPORT
# ─────────────────────────────────────────────

def print_file_report(r):
    w = 62
    print(f"\n  ┌{'─'*w}┐")
    print(f"  │  {r['file'][:w-2]:<{w-2}}│")
    print(f"  ├{'─'*w}┤")

    def row(label, value, ok=None):
        icon = "✅" if ok is True else ("❌" if ok is False else "  ")
        line = f"  {icon}  {label:<22} {str(value)}"
        print(f"  │{line:<{w+2}}│")

    row("Duration",      f"{r['duration']}s")
    row("Header",        r['header'])
    row("Sample Rate",   f"{r['sr']}Hz",                           r['sr_ok'])
    row("Mono",          "Yes" if r['mono_ok'] else f"No ({r['channels']}ch)", r['mono_ok'])
    row("Noise Gate",    "Detected ⚠️" if r['noise_gate'] else "None")
    row("Bit Depth",     r['bit_verdict'])
    row("Noise Diagnosis", r['noise_diagnosis'])
    row("Peak Level",    r['peak_verdict'])
    row("Crest Factor",  f"{r['crest_factor']} dB")
    row("Processing",    r['processing_verdict'])
    row("Lead Silence",  f"{r['lead_ms']} ms",                     r['lead_ok'])
    row("Trail Silence", f"{r['trail_ms']} ms",                    r['trail_ok'])

    # Print processing reasons if any
    if r['processing_reasons']:
        print(f"  ├{'─'*w}┤")
        print(f"  │  {'PROCESSING DETAIL':<{w-2}}│")
        for reason in r['processing_reasons']:
            # Word wrap at w-6 chars
            words = reason.split()
            line = ""
            for word in words:
                if len(line) + len(word) + 1 > w - 6:
                    print(f"  │    {line:<{w-4}}│")
                    line = word
                else:
                    line = f"{line} {word}".strip()
            if line:
                print(f"  │    {line:<{w-4}}│")

    print(f"  ├{'─'*w}┤")
    print(f"  │  OVERALL STATUS: {r['overall']:<{w-18}}│")
    print(f"  └{'─'*w}┘")


# ─────────────────────────────────────────────
# FREQUENCY CURVE — SINGLE FILE
# ─────────────────────────────────────────────

def smooth(db, window=30):
    return np.convolve(db, np.ones(window) / window, mode='same')


SPEECH_ZONES = [
    (80,   300,  "#22c55e", "Fundamental\n80-300Hz"),
    (300,  3000, "#3b82f6", "Formants\n300Hz-3kHz"),
    (3000, 8000, "#a855f7", "Consonants\n3-8kHz"),
    (8000, 12000,"#f59e0b", "Breath/Air\n8-12kHz"),
]


def plot_freq_curve(r, output_dir, show=False):
    freqs = r["freqs"]
    db    = r["db"]
    sr    = r["sr"]

    max_freq = min(sr // 2, 20000)
    mask     = (freqs >= 20) & (freqs <= max_freq)
    db_s     = smooth(db[mask])

    fig, ax = plt.subplots(figsize=(12, 5), facecolor='#0a0a0f')
    ax.set_facecolor('#0a0a0f')

    for (flo, fhi, color, label) in SPEECH_ZONES:
        ax.axvspan(flo, fhi, alpha=0.07, color=color)
        mid = np.sqrt(flo * fhi)
        ax.text(mid, -58, label, ha='center', va='bottom',
                fontsize=7, color=color, alpha=0.85, fontfamily='monospace')

    ax.plot(freqs[mask], db_s, color='#38bdf8', linewidth=2, zorder=5,
            label=r['file'])
    ax.fill_between(freqs[mask], db_s, -70, alpha=0.08, color='#38bdf8')

    overall_color = '#22c55e' if 'PASS' in r['overall'] else ('#f59e0b' if 'WARN' in r['overall'] else '#ef4444')
    nf_display = r['noise_diagnosis'][:50] if r['noise_diagnosis'] else "Noise gate detected"
    info = (f"Noise Floor: {nf_display}  |  "
            f"Peak: {r['peak_db']} dBFS  |  "
            f"Status: {r['overall']}")
    ax.set_title(f"{r['file'][:80]}", color='#e8e8f0', fontsize=10, pad=10)
    fig.text(0.5, 0.01, info, ha='center', fontsize=7,
             color=overall_color, fontfamily='monospace')

    ax.set_xlim(20, max_freq)
    ax.set_ylim(-70, 5)
    ax.set_xlabel('Frequency (Hz)', color='#666680', fontsize=9)
    ax.set_ylabel('dB (normalized)', color='#666680', fontsize=9)
    ax.tick_params(colors='#444460', labelsize=8)
    major_ticks = [k * 2000 for k in range(0, 13)]
    ax.set_xticks(major_ticks)
    ax.xaxis.set_minor_locator(ticker.MultipleLocator(1000))
    ax.xaxis.set_major_formatter(ticker.FuncFormatter(
        lambda x, _: f'{int(x)}Hz' if x == 0 else f'{int(x//1000)}kHz'
    ))
    for sp in ax.spines.values():
        sp.set_color('#1e1e2e')
    ax.grid(True, which='both', color='#1e1e2e', linewidth=0.5, alpha=0.8)

    plt.tight_layout(rect=[0, 0.04, 1, 1])

    base, _ = os.path.splitext(r['file'])
    safe_name = base[:60].replace(' ', '_')
    out_path  = os.path.join(output_dir, f"{safe_name}_freq.png")
    plt.savefig(out_path, dpi=120, bbox_inches='tight', facecolor='#0a0a0f')
    if show:
        plt.show()
    plt.close()

    return out_path


# ─────────────────────────────────────────────
# COMPARISON PLOT — ALL FILES
# ─────────────────────────────────────────────

def plot_comparison(results, output_dir):
    fig, ax = plt.subplots(figsize=(14, 6), facecolor='#0a0a0f')
    ax.set_facecolor('#0a0a0f')

    colors = ['#38bdf8','#f97316','#22c55e','#a855f7',
              '#f59e0b','#ec4899','#14b8a6','#6366f1',
              '#84cc16','#06b6d4']

    for i, r in enumerate(results):
        freqs    = r["freqs"]
        db       = r["db"]
        sr       = r["sr"]
        max_freq = min(sr // 2, 20000)
        mask     = (freqs >= 20) & (freqs <= max_freq)
        db_s     = smooth(db[mask])

        status_icon = "✅" if "PASS" in r["overall"] else ("⚠️" if "WARN" in r["overall"] else "❌")
        label = f"{r['file'][:35]} {status_icon}"

        ax.plot(freqs[mask], db_s,
                color=colors[i % len(colors)],
                linewidth=1.8, alpha=0.85, label=label)

    ax.set_xlim(20, 20000)
    ax.set_ylim(-70, 5)
    ax.set_xlabel('Frequency (Hz)', color='#666680', fontsize=10)
    ax.set_ylabel('dB (normalized)', color='#666680', fontsize=10)
    ax.set_title('Frequency Comparison -- All Files', color='#e8e8f0', fontsize=12, pad=12)
    ax.tick_params(colors='#444460', labelsize=8)
    major_ticks = [k * 2000 for k in range(0, 13)]
    ax.set_xticks(major_ticks)
    ax.xaxis.set_minor_locator(ticker.MultipleLocator(1000))
    ax.xaxis.set_major_formatter(ticker.FuncFormatter(
        lambda x, _: f'{int(x)}Hz' if x == 0 else f'{int(x//1000)}kHz'
    ))
    for sp in ax.spines.values():
        sp.set_color('#1e1e2e')
    ax.grid(True, which='both', color='#1e1e2e', linewidth=0.5, alpha=0.8)
    ax.legend(loc='lower left', fontsize=7,
              facecolor='#12121a', edgecolor='#1e1e2e', labelcolor='#9999b0')

    plt.tight_layout()
    out_path = os.path.join(output_dir, '_comparison_freq.png')
    plt.savefig(out_path, dpi=120, bbox_inches='tight', facecolor='#0a0a0f')
    plt.close()
    return out_path


# ─────────────────────────────────────────────
# BATCH
# ─────────────────────────────────────────────

def batch_check(folder_path):
    files = sorted(glob.glob(os.path.join(folder_path, "*.wav")))

    if not files:
        print(f"\n  No WAV files found in: {folder_path}\n")
        return

    plots_dir = os.path.join(folder_path, "qc_plots")
    os.makedirs(plots_dir, exist_ok=True)

    print(f"\n{'='*64}")
    print(f"  DataCatalyst Audio QC")
    print(f"  Folder : {folder_path}")
    print(f"  Files  : {len(files)} WAV files")
    print(f"  Plots  : {plots_dir}")
    print(f"{'='*64}")

    results = []
    for i, filepath in enumerate(files):
        print(f"\n  Analyzing {i+1}/{len(files)}: {os.path.basename(filepath)[:50]} ...", flush=True)
        r = analyze_file(filepath)
        results.append(r)
        print_file_report(r)
        png = plot_freq_curve(r, plots_dir)
        print(f"  Freq plot saved: {os.path.basename(png)}")

    if len(results) > 1:
        comp_png = plot_comparison(results, plots_dir)
        print(f"\n  Comparison plot saved: {os.path.basename(comp_png)}")

    passed = sum(1 for r in results if "PASS" in r["overall"])
    warned = sum(1 for r in results if "WARN" in r["overall"])
    failed = sum(1 for r in results if "FAIL" in r["overall"])
    total  = len(results)

    print(f"\n{'='*64}")
    print(f"  BATCH SUMMARY -- {total} files")
    print(f"  {'-'*62}")
    print(f"  {'FILE':<35} {'NOISE FLOOR':<28} STATUS")
    print(f"  {'-'*33} {'-'*26} {'-'*6}")
    for r in results:
        fname = (r["file"][:33] + "..") if len(r["file"]) > 33 else r["file"]
        diag  = r['noise_diagnosis'][:26] + ".." if len(r['noise_diagnosis']) > 26 else r['noise_diagnosis']
        print(f"  {fname:<35} {diag:<28} {r['overall']}")

    print(f"  {'-'*62}")
    print(f"  Passed : {passed}/{total}")
    print(f"  Warned : {warned}/{total}")
    print(f"  Failed : {failed}/{total}")
    print(f"\n  Plots saved to: {plots_dir}")
    print(f"{'='*64}\n")


# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import json
    class NpEncoder(json.JSONEncoder):
        def default(self, obj):
            if isinstance(obj, np.integer):
                return int(obj)
            if isinstance(obj, np.floating):
                return float(obj)
            if isinstance(obj, np.ndarray):
                return obj.tolist()
            if isinstance(obj, np.bool_):
                return bool(obj)
            return super(NpEncoder, self).default(obj)

    if "--json" in sys.argv:
        args = [a for a in sys.argv[1:] if a != "--json"]
        if args:
            filepath = args[0]
            r = analyze_file(filepath)
            plots_dir = os.path.dirname(filepath)
            png = plot_freq_curve(r, plots_dir, show=False)
            output_dict = {k: v for k, v in r.items() if k not in ["audio", "freqs", "db"]}
            output_dict["plot_path"] = png
            print(json.dumps(output_dict, cls=NpEncoder))
            sys.exit(0)

    if len(sys.argv) < 2:
        folder = os.getcwd()
    else:
        folder = sys.argv[1]

    if os.path.isfile(folder) and folder.lower().endswith(".wav"):
        r = analyze_file(folder)
        print_file_report(r)
        plots_dir = os.path.dirname(folder)
        png = plot_freq_curve(r, plots_dir, show=True)
        print(f"\n  Freq plot saved: {png}\n")
    else:
        batch_check(folder)