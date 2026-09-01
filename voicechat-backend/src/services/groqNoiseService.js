import dotenv from 'dotenv';
dotenv.config();

const AUDIT_SYSTEM_PROMPT = `You are a Lead Acoustic Forensics Engineer for high-end studio voice datasets.
You are provided with BOTH:
1. A visual Mel-spectrogram of the audio.
2. Exact mathematical DSP audio measurements extracted directly from the raw .wav file.

Your task is to synthesize these into a definitive Studio Quality Control Audit report.`;

const AUDIT_USER_PROMPT = (dspJson) => `Inspect this Mel-spectrogram image for persistent HORIZONTAL STATIC LINES (-------) or notch filter cuts.

RAW .WAV AUDIO DSP TELEMETRY:
\`\`\`json
${JSON.stringify(dspJson || {}, null, 2)}
\`\`\`

CRITICAL INSPECTION RULES:
1. HORIZONTAL STATIC LINE DETECTION (2kHz - 24kHz):
   - Closely scan the spectrogram from 2kHz upwards to 24kHz.
   - Look for ANY continuous, unbroken horizontal line (-------), bright electrical whine stripe, or dark notch stripe cutting horizontally across the entire width of the spectrogram from 0s to the end.
   - (e.g. A visible line running horizontally across ~4.5k - 5.5kHz, ~8kHz, ~12kHz, etc.)
   - Real speech formants are curved, organic, vertical clusters that change dynamically with words.
   - In contrast, STATIC INTERFERENCE is a continuous, straight, flat horizontal line running across both speech and silence.
2. If ANY continuous horizontal line, tone stripe, or notch line is present at >= 2000 Hz -> REJECT IMMEDIATELY (label: STATIC_TONE_LINE).
3. Only if there are ZERO continuous horizontal lines across the 2k-24k spectrum -> PASS.

Return strictly valid JSON:
{
  "verdict": "PASS" | "REJECT",
  "hasStaticNoise": boolean,
  "overallSeverity": "None" | "Low" | "Medium" | "High" | "Critical",
  "summary": "<2 sentence engineer summary citing the exact horizontal static line frequency if rejected, or confirming pristine recording if passed>",
  "defectBoxes": [
    {
      "id": 1,
      "label": "STATIC_TONE_LINE",
      "severity": "Critical" | "High" | "Medium" | "Low",
      "measuredDb": "<measured level or estimated dB>",
      "box_2d": [ymin, 0, ymax, 1000],
      "frequencyBand": "<exact frequency >= 2000 Hz, e.g. 4850 Hz, 5207 Hz>",
      "timeSpan": "Continuous 0s - End",
      "issueDescription": "<technical description of continuous horizontal line>"
    }
  ],
  "confidenceScore": number
}`;

/**
 * Calculates 1D overlap ratio between two intervals [start, end]
 */
function getIntervalOverlapRatio(s1, e1, s2, e2) {
  const overlap = Math.max(0, Math.min(e1, e2) - Math.max(s1, s2));
  const minLen = Math.min(e1 - s1, e2 - s2);
  return minLen > 0 ? overlap / minLen : 0;
}

/**
 * Sanitizes and performs Non-Maximum Suppression (NMS) on defect boxes:
 * 1. Merges/hides overlapping silence gap boxes.
 * 2. Deduplicates adjacent/overlapping horizontal tone lines (<300 Hz apart).
 * 3. Enforces >= 2000 Hz (2kHz+) rule.
 */
function sanitizeDefectBoxes(boxes, dspBoxes = []) {
  // Use authoritative DSP boxes first if available
  const allBoxes = [...(dspBoxes || []), ...(Array.isArray(boxes) ? boxes : [])];
  const candidates = [];

  for (let i = 0; i < allBoxes.length; i++) {
    const b = allBoxes[i];
    if (!b.box_2d || !Array.isArray(b.box_2d) || b.box_2d.length < 4) continue;

    let [ymin, xmin, ymax, xmax] = b.box_2d.map(v => Math.max(0, Math.min(1000, Number(v) || 0)));
    let label = (b.label || "STATIC_NOISE").toUpperCase();
    let freq = b.frequencyBand || "";
    let desc = b.issueDescription || "";

    // If label or freq or desc mentions HISS or FLOOR or 0-4kHz, it is strictly HISS_FLOOR (0kHz - 4kHz)
    const isHiss = label.includes("HISS") || label.includes("FLOOR") || freq.includes("0kHz") || freq.includes("4kHz") || desc.includes("HISS");
    const isTone = !isHiss && (label.includes("TONE") || label.includes("LINE") || label.includes("WHISTLE") || label.includes("NOTCH") || label.includes("PEAK") || (freq && freq.includes("Hz")));

    if (isHiss) {
      // Strictly 0-4kHz band (ymin = 833, ymax = 990 in 0-24kHz scale)
      candidates.push({
        label: "STATIC_HISS_FLOOR",
        severity: b.severity || "High",
        measuredDb: b.measuredDb || "",
        box_2d: [833, Math.min(xmin, xmax), 990, Math.max(xmin, xmax)],
        frequencyBand: "0kHz - 4kHz",
        timeSpan: b.timeSpan || "",
        issueDescription: desc || `Static hiss floor in silence gap (${b.measuredDb || ""})`
      });
    } else if (isTone) {
      // Calculate exact Y coordinate from frequency if present
      let exactY = (ymin + ymax) / 2;
      const freqMatch = freq.match(/([\d\.]+)\s*(k?hz)/i);
      if (freqMatch) {
        let fVal = parseFloat(freqMatch[1]);
        if (freqMatch[2].toLowerCase().startsWith("k")) fVal *= 1000;
        if (fVal < 2000) continue; // Ignore all sub-2kHz lines
        exactY = (1 - (Math.min(24000, fVal) / 24000)) * 1000;
      } else if (exactY > 916) {
        // > 916 is < 2kHz, ignore
        continue;
      }

      candidates.push({
        label: "STATIC_TONE_LINE",
        severity: b.severity || "High",
        measuredDb: b.measuredDb || "",
        box_2d: [Math.max(0, Math.round(exactY - 8)), 0, Math.min(1000, Math.round(exactY + 8)), 1000],
        frequencyBand: freq || `${Math.round((1 - exactY / 1000) * 24000)} Hz`,
        timeSpan: "Continuous 0s - End",
        issueDescription: desc || `Continuous static tone line (${freq || ""})`
      });
    }
  }

  // Group candidates into Lines vs Hiss Gaps
  const lines = candidates.filter(c => c.label === "STATIC_TONE_LINE");
  const hissBoxes = candidates.filter(c => c.label === "STATIC_HISS_FLOOR");

  // 1. Deduplicate & Suppress Overlapping Tone Lines within 300 Hz (y tolerance ~20)
  const filteredLines = [];
  for (const line of lines) {
    const [ymin, , ymax] = line.box_2d;
    const midY = (ymin + ymax) / 2;
    const existing = filteredLines.find(f => {
      const [fymin, , fymax] = f.box_2d;
      const fmidY = (fymin + fymax) / 2;
      return Math.abs(midY - fmidY) < 22; // Overlapping line zone
    });

    if (!existing) {
      filteredLines.push(line);
    } else {
      // Keep highest severity
      const rank = { "Critical": 4, "High": 3, "Medium": 2, "Low": 1 };
      if ((rank[line.severity] || 0) > (rank[existing.severity] || 0)) {
        const idx = filteredLines.indexOf(existing);
        filteredLines[idx] = line;
      }
    }
  }

  // 2. Deduplicate & Merge Overlapping or Adjacent Silence Hiss Boxes (Overlap > 10% or distance < 25)
  const filteredHiss = [];
  // Sort hiss boxes by xmin
  hissBoxes.sort((a, b) => a.box_2d[1] - b.box_2d[1]);

  for (const box of hissBoxes) {
    const [, xmin, , xmax] = box.box_2d;
    let merged = false;

    for (let j = 0; j < filteredHiss.length; j++) {
      const existing = filteredHiss[j];
      const [, exMin, , exMax] = existing.box_2d;
      const overlapRatio = getIntervalOverlapRatio(xmin, xmax, exMin, exMax);
      const isAdjacent = (xmin <= exMax + 25) && (exMin <= xmax + 25);

      if (overlapRatio > 0.10 || isAdjacent) {
        // Merge into single non-overlapping box
        const newXmin = Math.min(xmin, exMin);
        const newXmax = Math.max(xmax, exMax);
        const rank = { "Critical": 4, "High": 3, "Medium": 2, "Low": 1 };
        const bestSev = (rank[box.severity] || 0) > (rank[existing.severity] || 0) ? box.severity : existing.severity;
        
        filteredHiss[j] = {
          ...existing,
          box_2d: [833, newXmin, 990, newXmax],
          severity: bestSev,
          measuredDb: existing.measuredDb || box.measuredDb,
          issueDescription: existing.issueDescription || box.issueDescription
        };
        merged = true;
        break;
      }
    }

    if (!merged) {
      filteredHiss.push(box);
    }
  }

  // Final sanitized defect list with re-indexed IDs
  const clean = [...filteredLines, ...filteredHiss].map((b, idx) => ({
    id: idx + 1,
    ...b
  }));

  return clean;
}

let currentKeyIndex = 0;

/**
 * Returns an array of available Groq API keys from environment.
 * Supports comma-separated GROQ_API_KEYS (e.g. key1,key2,key3) or fallback GROQ_API_KEY.
 */
export function getGroqApiKeys() {
  const keysStr = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
  const keys = keysStr
    .split(",")
    .map(k => k.trim())
    .filter(k => k.length > 0 && !k.startsWith("#"));
  return keys;
}

export async function analyzeSpectrogramImage(base64Image, dspTelemetry = null) {
  const apiKeys = getGroqApiKeys();
  if (apiKeys.length === 0) {
    throw new Error("No GROQ_API_KEY or GROQ_API_KEYS configured in backend environment.");
  }

  let cleanBase64 = base64Image;
  if (cleanBase64.includes(",")) {
    cleanBase64 = cleanBase64.split(",")[1];
  }

  const modelsToTry = ["qwen/qwen3.8-27b", "qwen/qwen3.6-27b"];
  let lastError = null;

  // Round-Robin initial index
  const totalKeys = apiKeys.length;
  const startKeyIndex = currentKeyIndex % totalKeys;
  currentKeyIndex = (currentKeyIndex + 1) % totalKeys;

  // Try each API key in the pool starting from the round-robin index
  for (let k = 0; k < totalKeys; k++) {
    const keyIdx = (startKeyIndex + k) % totalKeys;
    const apiKey = apiKeys[keyIdx];
    const keyMasked = apiKey.length > 10 ? `${apiKey.substring(0, 7)}...${apiKey.slice(-4)}` : `Key #${keyIdx + 1}`;

    for (const modelId of modelsToTry) {
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              {
                role: "system",
                content: AUDIT_SYSTEM_PROMPT
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: AUDIT_USER_PROMPT(dspTelemetry)
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:image/png;base64,${cleanBase64}`
                    }
                  }
                ]
              }
            ],
            temperature: 0.1,
            max_tokens: 1024,
            response_format: { type: "json_object" }
          })
        });

        // If rate limited (429), immediately fail over to the next key in the pool
        if (response.status === 429) {
          const errText = await response.text();
          console.warn(`[groqNoiseService] ⚠️ Rate limit (429) on Key [${keyIdx + 1}/${totalKeys}: ${keyMasked}]. Auto-switching to next key in pool...`);
          lastError = new Error(`Rate limit (429) on key ${keyMasked}`);
          break; // Break model loop, proceed to next API key
        }

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`[groqNoiseService] Model ${modelId} on Key [${keyIdx + 1}/${totalKeys}: ${keyMasked}] failed (${response.status}):`, errText);
          lastError = new Error(`Groq API error (${response.status}): ${errText}`);
          continue;
        }

        const resJson = await response.json();
        const rawContent = resJson.choices?.[0]?.message?.content;
        if (!rawContent) {
          throw new Error("Empty response from Groq Vision model.");
        }

        let parsed;
        try {
          parsed = JSON.parse(rawContent);
        } catch (pErr) {
          const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("Failed to parse JSON response from Groq Vision.");
          }
        }

        // Merge and sanitize boxes with Non-Maximum Suppression (NMS)
        const sanitizedBoxes = sanitizeDefectBoxes(parsed.defectBoxes || [], dspTelemetry?.defectBoxes || []);
        
        const hasDefects = sanitizedBoxes.length > 0;

        return {
          success: true,
          verdict: hasDefects ? "REJECT" : "PASS",
          hasStaticNoise: hasDefects,
          overallSeverity: dspTelemetry?.overallSeverity || parsed.overallSeverity || (hasDefects ? "High" : "None"),
          summary: parsed.summary || (hasDefects ? "Static noise/interference detected in audio." : "Pristine studio recording without static noise."),
          defectBoxes: sanitizedBoxes,
          confidenceScore: parsed.confidenceScore || 0.95,
          activeKeyIndex: keyIdx + 1,
          totalKeysInPool: totalKeys
        };

      } catch (err) {
        console.warn(`[groqNoiseService] Error with Key [${keyIdx + 1}/${totalKeys}: ${keyMasked}] and model ${modelId}:`, err.message);
        lastError = err;
      }
    }
  }

  // Fallback to pure DSP telemetry if all Groq keys fail
  if (dspTelemetry && dspTelemetry.success) {
    console.log("[groqNoiseService] All Groq API keys exhausted or rate-limited. Using local DSP fallback.");
    const sanitizedBoxes = sanitizeDefectBoxes([], dspTelemetry.defectBoxes || []);
    return {
      success: true,
      verdict: sanitizedBoxes.length > 0 ? "REJECT" : "PASS",
      hasStaticNoise: sanitizedBoxes.length > 0,
      overallSeverity: dspTelemetry.overallSeverity || "None",
      summary: sanitizedBoxes.length > 0 ? `DSP analysis detected ${sanitizedBoxes.length} static noise anomalies.` : "Audio meets studio acoustic standards.",
      defectBoxes: sanitizedBoxes,
      confidenceScore: 0.98,
      fallbackUsed: "DSP_LOCAL"
    };
  }

  throw lastError || new Error("All Groq API keys in pool failed or exhausted rate limits.");
}
