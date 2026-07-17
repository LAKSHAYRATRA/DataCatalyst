/**
 * yamnetAnalysis.js
 * Browser-based background noise analysis using TensorFlow.js + YAMNet.
 *
 * - TF.js and the YAMNet model are loaded lazily (only on first call).
 * - The 521-class map is fetched once and cached in memory.
 * - Audio is resampled to 16 kHz mono using OfflineAudioContext.
 * - If the model fails to load, automatically falls back to RMS analysis.
 *
 * Returns: { hasNoise: boolean, rating: 0|5|10, label: string, method: string }
 */

import { analyzeNoiseClientSide } from './clientNoiseAnalysis';

const YAMNET_MODEL_URL = 'https://tfhub.dev/google/yamnet/1';
const CLASS_MAP_URL =
  'https://raw.githubusercontent.com/tensorflow/models/master' +
  '/research/audioset/yamnet/yamnet_class_map.csv';

const YAMNET_SR = 16000;

const HEAVY_NOISE_CLASSES = new Set([
  'Noise', 'White noise', 'Pink noise', 'Static',
  'Cacophony', 'Distortion', 'Reverberation',
  'Environmental noise', 'Wind noise', 'Rain', 'Thunder',
  'Water', 'Stream', 'Waterfall', 'Fire', 'Crackling',
  'Explosion', 'Gunshot, gunfire', 'Jackhammer', 'Drill',
  'Power tool', 'Lawn mower', 'Chainsaw', 'Engine',
  'Traffic noise, roadway noise', 'Mechanisms',
  'Alarm', 'Siren', 'Civil defense siren',
  'Smoke detector, smoke alarm', 'Car alarm',
  'Interference, noise', 'Electric hum',
  'Bang', 'Thud', 'Boom', 'Crash', 'Breaking',
  'Glass', 'Shatter', 'Slam',
]);

const MODERATE_NOISE_CLASSES = new Set([
  'Music', 'Background music', 'Ambient music', 'Whispering',
  'Television', 'Radio', 'Telephone', 'Inside, public space',
  'Outside, urban or manmade', 'Vehicle', 'Car', 'Train',
  'Aircraft', 'Bus', 'Subway, metro, underground',
  'Crowd', 'Hubbub, speech noise, speech babble',
  'Chatter', 'Buzz', 'Hum',
  'Dog', 'Cat', 'Bird', 'Animal',
  'Baby cry, infant cry', 'Crying, sobbing',
  'Laughter', 'Cough', 'Sneeze',
]);

let _tf = null;
let _model = null;
let _classNames = null;
let _loadPromise = null;

async function ensureLoaded() {
  if (_model && _classNames && _tf) return true;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    try {
      _tf = await import('@tensorflow/tfjs');

      console.log('[YAMNet] Loading model from TFHub...');
      _model = await _tf.loadGraphModel(YAMNET_MODEL_URL, { fromTFHub: true });
      console.log('[YAMNet] Model loaded');

      const resp = await fetch(CLASS_MAP_URL);
      const text = await resp.text();
      _classNames = text
        .trim()
        .split('\n')
        .slice(1)
        .map((line) => {
          const parts = line.split(',');
          return parts[parts.length - 1].replace(/^"|"$/g, '').trim();
        });

      console.log(`[YAMNet] Class map loaded - ${_classNames.length} classes`);
      return true;
    } catch (err) {
      console.error('[YAMNet] Failed to load:', err);
      _model = null;
      _classNames = null;
      return false;
    }
  })();

  return _loadPromise;
}

async function resampleTo16k(audioBlob) {
  const arrayBuffer = await audioBlob.arrayBuffer();

  const tmpCtx = new (window.AudioContext || window.webkitAudioContext)();
  let decoded;
  try {
    decoded = await tmpCtx.decodeAudioData(arrayBuffer);
  } finally {
    tmpCtx.close();
  }

  const originalSR = decoded.sampleRate;
  if (originalSR === YAMNET_SR) {
    return decoded.getChannelData(0);
  }

  const targetLength = Math.ceil(decoded.duration * YAMNET_SR);
  const offlineCtx = new OfflineAudioContext(1, targetLength, YAMNET_SR);
  const src = offlineCtx.createBufferSource();
  src.buffer = decoded;
  src.connect(offlineCtx.destination);
  src.start(0);

  const resampled = await offlineCtx.startRendering();
  return resampled.getChannelData(0);
}

export async function analyzeNoiseYAMNet(audioBlob) {
  const loaded = await ensureLoaded();

  if (!loaded) {
    console.warn('[YAMNet] Falling back to RMS analysis');
    const result = await analyzeNoiseClientSide(audioBlob);
    return { ...result, method: 'rms_fallback' };
  }

  try {
    const samples = await resampleTo16k(audioBlob);
    const waveformTensor = _tf.tensor1d(samples, 'float32');
    const output = _model.execute(waveformTensor);

    const scoresTensor = Array.isArray(output) ? output[0] : output;
    const scoresArray = await scoresTensor.array();

    _tf.dispose(waveformTensor);
    if (Array.isArray(output)) output.forEach((tensor) => _tf.dispose(tensor));
    else _tf.dispose(output);

    const nFrames = scoresArray.length;
    const nClasses = scoresArray[0].length;
    const meanScores = new Float32Array(nClasses);

    for (let c = 0; c < nClasses; c += 1) {
      let sum = 0;
      for (let f = 0; f < nFrames; f += 1) sum += scoresArray[f][c];
      meanScores[c] = sum / nFrames;
    }

    const THRESHOLD = 0.25;
    let heavyScore = 0;
    let moderateScore = 0;
    let heavyLabel = '';
    let moderateLabel = '';

    for (let c = 0; c < nClasses; c += 1) {
      if (meanScores[c] < THRESHOLD) continue;
      const name = _classNames[c] || `Class_${c}`;
      if (HEAVY_NOISE_CLASSES.has(name)) {
        if (meanScores[c] > heavyScore) {
          heavyScore = meanScores[c];
          heavyLabel = name;
        }
      } else if (MODERATE_NOISE_CLASSES.has(name)) {
        if (meanScores[c] > moderateScore) {
          moderateScore = meanScores[c];
          moderateLabel = name;
        }
      }
    }

    let rating;
    let label;

    if (heavyScore >= THRESHOLD) {
      rating = 10;
      label = `Heavy background noise detected (${heavyLabel} - score ${(heavyScore * 100).toFixed(0)}%).`;
    } else if (moderateScore >= THRESHOLD) {
      rating = 5;
      label = `Moderate background noise detected (${moderateLabel} - score ${(moderateScore * 100).toFixed(0)}%). Try moving to a quieter place.`;
    } else {
      rating = 0;
      label = 'Environment sounds clear - no significant background noise detected.';
    }

    return { hasNoise: rating > 0, rating, label, method: 'yamnet' };
  } catch (err) {
    console.error('[YAMNet] Runtime error - falling back to RMS:', err);
    const result = await analyzeNoiseClientSide(audioBlob);
    return { ...result, method: 'rms_fallback' };
  }
}
