/**
 * clientNoiseAnalysis.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fully client-side background noise analysis using the Web Audio API.
 * No server round-trip, no Python, no TensorFlow needed.
 *
 * Strategy:
 *  1. Decode the recorded audio blob into PCM samples via AudioContext
 *  2. Split into 100ms frames and compute RMS per frame
 *  3. Separate "speech" frames (high energy) from "background" frames (low energy)
 *  4. Evaluate the noise floor from the background frames
 *  5. Return { hasNoise, rating, label }
 */

/**
 * Analyze a recorded audio Blob for background noise.
 *
 * @param {Blob} audioBlob  - The recorded audio (webm/ogg/wav)
 * @returns {Promise<{ hasNoise: boolean, rating: number, label: string }>}
 *   rating: 0 = clean, 5 = moderate noise, 10 = heavy noise
 */
export async function analyzeNoiseClientSide(audioBlob) {
  const arrayBuffer = await audioBlob.arrayBuffer();

  // Use OfflineAudioContext for faster-than-realtime decoding
  const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
  let audioBuffer;
  try {
    audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
  } finally {
    tempCtx.close();
  }

  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0); // mono (first channel)
  const totalSamples = channelData.length;
  const frameSamples = Math.floor(sampleRate * 0.1); // 100ms frames

  if (totalSamples < frameSamples) {
    return { hasNoise: false, rating: 0, label: 'Audio too short to analyze' };
  }

  // ── Compute per-frame RMS ──────────────────────────────────────────────────
  const frameRms = [];
  for (let i = 0; i + frameSamples <= totalSamples; i += frameSamples) {
    let sum = 0;
    for (let j = i; j < i + frameSamples; j++) {
      sum += channelData[j] * channelData[j];
    }
    frameRms.push(Math.sqrt(sum / frameSamples));
  }

  const maxRms = Math.max(...frameRms);
  const meanRms = frameRms.reduce((a, b) => a + b, 0) / frameRms.length;

  // ── Separate speech frames from background frames ─────────────────────────
  // Speech frames are those with RMS > 20% of the peak (heuristic)
  const speechThreshold = maxRms * 0.2;
  const backgroundFrames = frameRms.filter(r => r < speechThreshold);

  // If there are no background frames, the entire clip is speech — likely OK
  if (backgroundFrames.length === 0) {
    return {
      hasNoise: false,
      rating: 0,
      label: 'No detectable background noise',
    };
  }

  // Background noise floor = mean of the quiet frames
  const noiseFloor = backgroundFrames.reduce((a, b) => a + b, 0) / backgroundFrames.length;

  // ── Classify ───────────────────────────────────────────────────────────────
  // These thresholds are tuned to real microphone recordings
  // noiseFloor is in [0, 1] range (normalized PCM)
  let rating, label;

  if (noiseFloor > 0.08) {
    rating = 10;
    label  = `Heavy background noise detected (noise floor ${(noiseFloor * 100).toFixed(1)}%). Please find a quieter place.`;
  } else if (noiseFloor > 0.025) {
    rating = 5;
    label  = `Moderate background noise detected (noise floor ${(noiseFloor * 100).toFixed(1)}%). Try turning off fans or music.`;
  } else {
    rating = 0;
    label  = `Environment sounds clear (noise floor ${(noiseFloor * 100).toFixed(1)}%).`;
  }

  return {
    hasNoise:   rating > 0,
    rating,
    label,
    noiseFloor: parseFloat(noiseFloor.toFixed(4)),
    meanRms:    parseFloat(meanRms.toFixed(4)),
  };
}
