/**
 * clientNoiseAnalysis.js
 * Fully client-side background noise analysis — no server, no TensorFlow.
 */

function flattenChunks(chunks) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

function computeRMS(samples) {
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i];
  return Math.sqrt(sumSq / Math.max(samples.length, 1));
}

function toDb(rms) {
  return 20 * Math.log10(Math.max(rms, 1e-10));
}

// Splits samples into 50ms frames, sorts by RMS, returns the value at the given
// percentile. Using the bottom 20th percentile as the noise floor means brief
// loud events during the silence phase (breaths, clicks) don't skew the result.
function percentileRMS(samples, sampleRate, percentile = 0.2) {
  const frameLen = Math.floor(sampleRate * 0.05); // 50 ms
  const frames   = [];
  for (let i = 0; i + frameLen <= samples.length; i += frameLen) {
    let sum = 0;
    for (let j = i; j < i + frameLen; j++) sum += samples[j] * samples[j];
    frames.push(Math.sqrt(sum / frameLen));
  }
  if (frames.length === 0) return computeRMS(samples);
  frames.sort((a, b) => a - b);
  return frames[Math.max(0, Math.floor(frames.length * percentile))];
}

/**
 * Two-phase mic check.
 *
 * Phase 1 (speechChunks): user speaks — waves should rise.
 * Phase 2 (silenceChunks): user is silent — waves should stay flat.
 *
 * Pass = voice detected in phase 1 AND quiet in phase 2.
 * Fail = no voice detected OR environment is noisy during silence.
 */
export function analyzeSNR(silenceChunks, speechChunks) {
  const speechRms = computeRMS(flattenChunks(speechChunks));

  // 80th-percentile: picks the louder frames so any sustained sound during silence
  // (voice, music, fan spike) pushes this value up and gets caught.
  const noiseRms  = percentileRMS(flattenChunks(silenceChunks), 48000, 0.8);

  const speechDb     = toDb(speechRms);
  const noiseFloorDb = toDb(noiseRms);

  // Speech phase: did the waves actually move?
  const voiceDetected = speechDb > -40;

  // Silence phase: did the waves stay flat?
  const silenceClean  = noiseFloorDb < -35;

  let hasNoise, label;

  if (!voiceDetected) {
    hasNoise = true;
    label    = `No voice detected during the speaking phase (${speechDb.toFixed(1)} dBFS). Please speak louder or move closer to the mic.`;
  } else if (!silenceClean) {
    hasNoise = true;
    label    = `Background noise detected during the silent phase (${noiseFloorDb.toFixed(1)} dBFS). Try moving to a quieter spot or turning off fans.`;
  } else {
    hasNoise = false;
    label    = `Microphone sounds good — voice came through clearly and silence was clean.`;
  }

  return {
    hasNoise,
    rating:       hasNoise ? 5 : 0,
    label,
    speechDb:     parseFloat(speechDb.toFixed(1)),
    noiseFloorDb: parseFloat(noiseFloorDb.toFixed(1)),
  };
}

/**
 * Blob-based analysis (kept for any legacy callers).
 */
export async function analyzeNoiseClientSide(audioBlob) {
  const arrayBuffer = await audioBlob.arrayBuffer();
  const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
  let audioBuffer;
  try {
    audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
  } finally {
    tempCtx.close();
  }

  const channelData  = audioBuffer.getChannelData(0);
  const sampleRate   = audioBuffer.sampleRate;
  const frameSamples = Math.floor(sampleRate * 0.1);

  if (channelData.length < frameSamples) {
    return { hasNoise: false, rating: 0, label: 'Audio too short to analyze' };
  }

  const frameRms = [];
  for (let i = 0; i + frameSamples <= channelData.length; i += frameSamples) {
    let sum = 0;
    for (let j = i; j < i + frameSamples; j++) sum += channelData[j] * channelData[j];
    frameRms.push(Math.sqrt(sum / frameSamples));
  }

  const maxRms = Math.max(...frameRms);
  const backgroundFrames = frameRms.filter(r => r < maxRms * 0.2);
  if (backgroundFrames.length === 0) return { hasNoise: false, rating: 0, label: 'No detectable background noise' };

  const noiseFloor = backgroundFrames.reduce((a, b) => a + b, 0) / backgroundFrames.length;
  const noiseFloorDb = toDb(noiseFloor);

  let rating, label;
  if (noiseFloorDb > -30)      { rating = 10; label = `Heavy background noise (${noiseFloorDb.toFixed(1)} dBFS).`; }
  else if (noiseFloorDb > -45) { rating = 5;  label = `Moderate background noise (${noiseFloorDb.toFixed(1)} dBFS).`; }
  else                         { rating = 0;  label = `Environment sounds clear (${noiseFloorDb.toFixed(1)} dBFS).`; }

  return { hasNoise: rating > 0, rating, label, noiseFloorDb: parseFloat(noiseFloorDb.toFixed(1)) };
}
