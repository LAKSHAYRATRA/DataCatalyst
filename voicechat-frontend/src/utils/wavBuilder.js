// Encodes a Float32Array of PCM samples as a 32-bit IEEE float WAV blob
// (format code 3 = WAVE_FORMAT_IEEE_FLOAT). Using float32 avoids the
// 16-bit quantisation (96 dB ceiling) that the old Int16 encoder imposed.
export function encodeWAV(samples, sampleRate = 48000, numChannels = 1) {
  const bytesPerSample = 4; // float32
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);                                          // IEEE float
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);  // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true);               // block align
  view.setUint16(34, 32, true);                                         // bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 4) {
    view.setFloat32(offset, samples[i], true);
  }

  return new Blob([view], { type: 'audio/wav' });
}
