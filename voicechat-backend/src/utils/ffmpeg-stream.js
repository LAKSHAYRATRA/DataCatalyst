import ffmpeg from "fluent-ffmpeg";
import { PassThrough } from "stream";

export function streamS3ToWav(s3ReadableStream, res, filename) {
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.wav"`);

  ffmpeg(s3ReadableStream)
    .format("wav")
    .outputOptions([
      "-ar 48000",
      "-acodec pcm_s24le"
    ])
    .on("error", (err) => {
      console.error("FFMPEG Stream Error:", err);
      if (!res.headersSent) res.status(500).end();
    })
    .pipe(res, { end: true });
}

export function getWavStream(s3ReadableStream) {
  const pt = new PassThrough();
  ffmpeg(s3ReadableStream)
    .format("wav")
    .outputOptions([
      "-ar 48000",
      "-acodec pcm_s24le"
    ])
    .on("error", (err) => {
      console.error("FFMPEG Stream Error:", err);
    })
    .pipe(pt, { end: true });
  return pt;
}

// Convert an S3 readable stream to a fully-buffered WAV Buffer.
// Resolves only once the whole file has been converted, and rejects on
// any ffmpeg/stream error so the caller can reliably tell success from
// failure (instead of silently producing a partial/empty entry).
function padWavBuffer(wavBuffer, targetDurationMs, sampleRate = 48000, numChannels = 1, bytesPerSample = 3) {
  if (!targetDurationMs || targetDurationMs <= 0) return wavBuffer;

  const bytesPerSec = sampleRate * numChannels * bytesPerSample;
  const targetDataSize = Math.round((targetDurationMs / 1000) * bytesPerSec);
  
  // Basic WAV header check
  if (wavBuffer.length < 44) return wavBuffer;
  const subchunk2Size = wavBuffer.readUInt32LE(40);
  
  if (subchunk2Size >= targetDataSize) {
    return wavBuffer; 
  }
  
  const paddingSize = targetDataSize - subchunk2Size;
  const paddingBuffer = Buffer.alloc(paddingSize, 0); 
  
  const newWavBuffer = Buffer.concat([wavBuffer, paddingBuffer]);
  
  newWavBuffer.writeUInt32LE(newWavBuffer.length - 8, 4);
  newWavBuffer.writeUInt32LE(targetDataSize, 40);
  
  return newWavBuffer;
}

export function getWavBuffer(s3ReadableStream, { offsetMs, durationMs } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const pt = new PassThrough();

    pt.on("data", (chunk) => chunks.push(chunk));
    pt.on("end", () => {
      let finalBuffer = Buffer.concat(chunks);
      if (durationMs && durationMs > 0) {
        finalBuffer = padWavBuffer(finalBuffer, durationMs);
      }
      resolve(finalBuffer);
    });
    pt.on("error", reject);

    const cmd = ffmpeg(s3ReadableStream);
    const filters = [];

    if (offsetMs && offsetMs > 0) {
      filters.push(`adelay=${Math.round(offsetMs)}|${Math.round(offsetMs)}`);
    }

    if (filters.length > 0) {
      cmd.audioFilters(filters);
    }

    cmd.format("wav")
      .outputOptions([
        "-ar 48000",
        "-acodec pcm_s24le",
        "-ac 1"
      ])
      .on("error", (err) => {
        console.error("FFMPEG Stream Error:", err);
        reject(err);
      })
      .pipe(pt, { end: true });
  });
}
