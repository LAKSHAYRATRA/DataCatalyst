import { evaluateSpeech } from "../util/geminiService.js";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Absolute path to the YAMNet script (sits in backend root)
const YAMNET_SCRIPT = path.resolve(process.cwd(), "yamnet_noise_analyzer_v3.py");
// Env-override: YAMNET_PYTHON=python3 or full path
const PYTHON_BIN = process.env.YAMNET_PYTHON || "python";

// POST /api/test/analyze-speech
export async function analyzeSpeech(req, res) {
  const { audio, sentence } = req.body;

  if (!audio || !sentence) {
    return res.status(400).json({ error: "Missing audio or sentence" });
  }
  if (typeof audio !== "string") {
    return res.status(400).json({ error: "Audio must be a base64 string" });
  }

  try {
    const result = await evaluateSpeech(audio, sentence);
    res.json(result);
  } catch (err) {
    console.error("Speech analysis failed:", err);
    res
      .status(500)
      .json({ error: "Internal server error during speech analysis" });
  }
}

// POST /api/test/check-noise
// Accepts: multipart audio file (audio/webm)
// Returns: { hasNoise, rating, label, fallback? }
export async function checkNoise(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file uploaded" });
  }

  // Write the uploaded webm buffer to a temp file
  const tmpDir = os.tmpdir();
  const webmPath = path.join(tmpDir, `noise_check_${Date.now()}.webm`);
  const wavPath  = path.join(tmpDir, `noise_check_${Date.now()}.wav`);

  try {
    fs.writeFileSync(webmPath, req.file.buffer);

    // Convert webm → 16 kHz mono WAV using ffmpeg
    await new Promise((resolve, reject) => {
      ffmpeg(webmPath)
        .audioChannels(1)
        .audioFrequency(16000)
        .toFormat("wav")
        .on("end", resolve)
        .on("error", reject)
        .save(wavPath);
    });

    // Run the YAMNet Python script
    const result = await new Promise((resolve, reject) => {
      const py = spawn(PYTHON_BIN, [
        YAMNET_SCRIPT,
        "--input", wavPath,
        "--threshold", "0.25",
        "--json",
      ]);

      let stdout = "";
      let stderr = "";

      py.stdout.on("data", (d) => { stdout += d.toString(); });
      py.stderr.on("data", (d) => { stderr += d.toString(); });

      py.on("close", (code) => {
        if (code !== 0) {
          console.error("[checkNoise] Python exited with code", code, stderr);
          reject(new Error(`Python script exited with code ${code}: ${stderr.slice(0, 300)}`));
          return;
        }
        try {
          // stdout may have WARNING lines before the JSON — find the JSON object
          const jsonLine = stdout.split("\n").find(l => l.trim().startsWith("{"));
          if (!jsonLine) throw new Error("No JSON in Python output");
          resolve(JSON.parse(jsonLine.trim()));
        } catch (e) {
          reject(new Error("Failed to parse Python output: " + e.message));
        }
      });

      py.on("error", reject);
    });

    const rating = typeof result.suspicion_rating === "number" ? result.suspicion_rating : 10;
    return res.json({
      hasNoise: rating > 0,
      rating,
      label: result.rating_label || "",
    });

  } catch (err) {
    console.error("[checkNoise] Error:", err.message);
    // Fallback: if Python/YAMNet not installed, allow user to proceed
    return res.status(500).json({
      error: "Noise check failed",
      detail: err.message,
      fallback: true,   // frontend can use this to skip gracefully
    });
  } finally {
    // Clean up temp files
    try { fs.unlinkSync(webmPath); } catch {}
    try { fs.unlinkSync(wavPath);  } catch {}
  }
}

// GET /api/test/download
export function downloadSpeedTest(req, res) {
  const sizeMb = Math.max(1, Math.min(10, Number(req.query.mb || 5)));
  const bytes = sizeMb * 1024 * 1024;

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", String(bytes));

  const chunk = Buffer.alloc(64 * 1024, 0);
  let sent = 0;
  while (sent < bytes) {
    const remaining = bytes - sent;
    const toSend =
      remaining >= chunk.length ? chunk : chunk.subarray(0, remaining);
    res.write(toSend);
    sent += toSend.length;
  }
  res.end();
}

// POST /api/test/upload
export function uploadSpeedTest(req, res) {
  res.json({ ok: true, bytes: req.body?.length || 0 });
}
