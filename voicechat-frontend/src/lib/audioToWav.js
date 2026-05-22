/**
 * Fetches an audio file (any format the browser can decode — WebM, Ogg, MP4…),
 * decodes it with Web Audio API, and returns a WAV Blob.
 *
 * All conversion happens in the browser — zero backend load.
 *
 * @param {string} url  Fetch URL (credentials: "include" is used automatically)
 * @returns {Promise<Blob>}  WAV Blob ready for download
 */
export async function fetchAndConvertToWav(url) {
    let token = null;
    const cookies = document.cookie.split(";").map((c) => c.trim());
    const vcCookie = cookies.find((c) => c.startsWith("vc_token="));
    if (vcCookie) token = vcCookie.split("=")[1];
    else token = localStorage.getItem("vc_token");

    const res = await fetch(url, { 
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();

    // 2. Decode to PCM using Web Audio API
    const audioCtx = new AudioContext();
    let audioBuffer;
    try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } finally {
        audioCtx.close();
    }

    // 3. Build 32-bit IEEE float WAV (format 3) — preserves the full dynamic
    //    range that decodeAudioData delivers. The old Int16 path was silently
    //    downgrading 24-bit FLAC to 16-bit for every QA/admin playback and download.
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const numFrames = audioBuffer.length;
    const bytesPerSample = 4; // float32
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numFrames * blockAlign;
    const bufferSize = 44 + dataSize;

    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, "WAVE");

    // fmt chunk
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 3, true);           // IEEE float
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 32, true);          // 32-bit

    // data chunk
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    // Interleave float32 samples from all channels
    let offset = 44;
    for (let i = 0; i < numFrames; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            view.setFloat32(offset, audioBuffer.getChannelData(ch)[i], true);
            offset += 4;
        }
    }

    return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}
