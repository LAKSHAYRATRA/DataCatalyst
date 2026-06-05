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
export function getWavBuffer(s3ReadableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const pt = new PassThrough();

    pt.on("data", (chunk) => chunks.push(chunk));
    pt.on("end", () => resolve(Buffer.concat(chunks)));
    pt.on("error", reject);

    ffmpeg(s3ReadableStream)
      .format("wav")
      .outputOptions([
        "-ar 48000",
        "-acodec pcm_s24le"
      ])
      .on("error", (err) => {
        console.error("FFMPEG Stream Error:", err);
        reject(err);
      })
      .pipe(pt, { end: true });
  });
}
