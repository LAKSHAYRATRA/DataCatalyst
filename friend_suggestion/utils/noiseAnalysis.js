function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * ratio)));
  return sorted[index];
}

export async function analyzeBackgroundNoise(audioBlob) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return {
      hasBackgroundNoise: false,
      noiseFloor: 0,
      peakLevel: 0,
      feedback: "Microphone test complete.",
      warning: "",
    };
  }

  const audioContext = new AudioContextClass();
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const channelData = audioBuffer.getChannelData(0);
    const frameSize = 2048;
    const rmsValues = [];

    for (let i = 0; i < channelData.length; i += frameSize) {
      const frame = channelData.subarray(i, Math.min(i + frameSize, channelData.length));
      let sumSquares = 0;
      for (let j = 0; j < frame.length; j += 1) {
        sumSquares += frame[j] * frame[j];
      }
      rmsValues.push(Math.sqrt(sumSquares / Math.max(frame.length, 1)));
    }

    const peakLevel = rmsValues.length ? Math.max(...rmsValues) : 0;
    const noiseFloor = percentile(rmsValues, 0.2);
    const averageLevel = rmsValues.length ? rmsValues.reduce((sum, value) => sum + value, 0) / rmsValues.length : 0;
    const dynamicRange = peakLevel - noiseFloor;

    const hasBackgroundNoise = noiseFloor > 0.018 || (noiseFloor > 0.012 && dynamicRange < 0.045) || averageLevel > 0.035;

    return {
      hasBackgroundNoise,
      noiseFloor: Number(noiseFloor.toFixed(4)),
      peakLevel: Number(peakLevel.toFixed(4)),
      feedback: hasBackgroundNoise
        ? "We detected noticeable background noise in your recording."
        : "Your microphone recording sounds clear.",
      warning: hasBackgroundNoise
        ? "Please sit in a quiet place or switch to a cleaner microphone if possible."
        : "",
    };
  } finally {
    await audioContext.close();
  }
}
