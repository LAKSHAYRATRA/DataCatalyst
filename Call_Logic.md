# DataCatalyst — Dual-Participant Call Synchronization & WebRTC Architecture (`Call_Logic.md`)

## Executive Summary
This document details the architecture, lifecycle, WebRTC signaling, AudioWorklet stream processing, and server-side sample-exact synchronization algorithm for 2-participant conversational audio recording in DataCatalyst.

---

## 1. High-Level Call Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    actor UserA as Speaker 1 (User A)
    participant Backend as Express / Socket.IO Server
    participant DB as MongoDB (CallSession)
    actor UserB as Speaker 2 (User B)

    UserA->>Backend: find_match (Language, System Check OK)
    UserB->>Backend: find_match (Language, System Check OK)
    Backend->>UserA: matched (callId, peerId, role: offerer)
    Backend->>UserB: matched (callId, peerId, role: answerer)
    
    rect rgb(30, 41, 59)
    note over UserA, UserB: Topic & Role Negotiation Phase (Max 4 Mins)
    UserA->>Backend: topic_claim (topicId, subtopicId)
    Backend-->>UserB: topic_claimed
    UserA->>Backend: role_selected (Speaker Role)
    UserB->>Backend: role_selected (Speaker Role)
    end

    UserA->>Backend: call_start_initiated
    Backend-->>UserA: call_start_initiated (expectedActualStartTime = now + 5s)
    Backend-->>UserB: call_start_initiated (expectedActualStartTime = now + 5s)

    rect rgb(15, 23, 42)
    note over UserA, UserB: WebAudio & Socket Recording Initialization
    UserA->>Backend: record_start (callId, mimeType: audio/pcm, sampleRate)
    UserB->>Backend: record_start (callId, mimeType: audio/pcm, sampleRate) [Joined ~3.2s late]
    Backend->>DB: Update recordingAStartedAt / recordingBStartedAt
    Backend-->>UserA: record_ready
    Backend-->>UserB: record_ready
    end

    rect rgb(30, 58, 138)
    note over UserA, UserB: WebRTC Peer-to-Peer Live Voice Chat
    UserA<-- WebRTC SDP / ICE Candidates -->UserB: Bidirectional Opus Live Audio
    UserA->>Backend: record_chunk (PCM Worklet float32 buffers)
    UserB->>Backend: record_chunk (PCM Worklet float32 buffers)
    end

    rect rgb(88, 28, 135)
    note over UserA, UserB: Call Teardown & Sample-Exact Audio Alignment
    UserA->>Backend: hangup / disconnect
    Backend->>DB: Freeze master session.endedAt timestamp (Atomic Lock)
    Backend->>Backend: Execute cleanupRecording(UserA)
    Backend->>Backend: Execute cleanupRecording(UserB)
    Backend->>Backend: 1. Pad Start (Prepend 3.2s digital silence to User B)
    Backend->>Backend: 2. Pad / Trim End (Lock both files to exact targetSizeBytes)
    Backend->>Backend: Convert aligned PCM -> 24-bit FLAC via FFmpeg
    Backend->>S3: Upload speaker1.flac & speaker2.flac to AWS S3
    end
```

---

## 2. WebRTC Live Voice Chat Architecture

### 2.1 Audio Track Routing
* **Browser Local Capture:** `navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: rate, channelCount: 1 } })`. Fallback to `{ audio: true }` if browser constraints fail.
* **WebRTC PeerConnection:** `RTCPeerConnection` relays live compressed Opus audio between browsers.
* **Remote Playback Element:** An offscreen HTML5 `<audio>` tag (`position: absolute; width: 1px; height: 1px; opacity: 0; pointerEvents: none;`) renders the incoming WebRTC `remoteStream`. *(Note: Using `className="hidden"` / `display: none` is avoided because browser rendering engines silence WebRTC media elements when hidden).*

---

## 3. Real-Time PCM Stream Ingestion (`AudioWorklet`)

1. **Client-Side Worklet (`/pcm-worklet.js`):**  
   Reads uncompressed float32 samples from native hardware `sampleRate` (e.g. 48,000 Hz) via WebAudio `AudioWorkletNode`.
2. **Noise Gate Application:** Applies user-assigned `noiseGateDb` threshold directly inside the worklet to suppress mic noise floor during quiet pauses.
3. **Socket Chunk Transmission:**  
   Emits `record_chunk` events over Socket.IO with sequence numbers (`seq`).
4. **Backend Stream Buffer:**  
   The backend collects chunk payloads in an in-memory `activeStreams` map, handling out-of-order sequence arrival and buffer flushing directly to temporary PCM files (`.pcm`).

---

## 4. Server-Side Audio Alignment & Sample-Parity Algorithm

When a call completes, Speaker 1 and Speaker 2 audio files undergo a **two-phase deterministic alignment process** inside `cleanupRecording()` before being converted to FLAC and uploaded to AWS S3.

### Phase 1: Start Silence Prepending (`Pad Start`)
Due to device speed, worklet initialization, and network ping differences, User B may start sending audio $N$ seconds after User A.

1. **Exact Start Timestamping:**  
   When a user emits `record_start`, the server records the exact arrival timestamp in MongoDB:
   - User A: `recordingAStartedAt`
   - User B: `recordingBStartedAt`
2. **Silence Offset Calculation:**  
   $$\text{startOffsetSec} = \max\left(0, \frac{\text{recStartTime} - \text{actualCallStartedAt}}{1000}\right)$$
3. **Stream Silence Insertion:**  
   The backend prepends $\text{startSilenceSize} = \text{startOffsetSec} \times \text{sampleRate} \times 4\text{ bytes}$ of pure digital silence (`0x00`) to the beginning of the PCM file.
4. **Result:** Both speakers' vocal timestamps align from $0.000\text{ seconds}$ on the timeline when opened in Audacity or audio editing tools.

---

### Phase 2: Master Timestamp Lock & Duration Parity (`Pad End / Trim End`)

To guarantee both speaker files end at the **exact same sample count and duration**:

1. **Atomic Master End Timestamp:**  
   Whichever speaker's cleanup runs first executes an atomic MongoDB update:
   ```javascript
   if (!session.endedAt) {
     const updatedSession = await CallSession.findOneAndUpdate(
       { _id: session._id, $or: [{ endedAt: null }, { endedAt: { $exists: false } }] },
       { $set: { endedAt: now } },
       { new: true }
     );
     if (updatedSession) session = updatedSession;
   }
   ```
   Both Speaker 1 and Speaker 2 cleanups use this exact same master `session.endedAt`.

2. **Target File Size Calculation:**  
   $$\text{totalCallDurationSec} = \max\left(0, \frac{\text{session.endedAt} - \text{session.actualCallStartedAt}}{1000}\right)$$
   $$\text{targetSizeBytes} = \text{Math.round}(\text{totalCallDurationSec} \times \text{sampleRate} \times 4)$$

3. **Sample Parity Enforcer:**
   - **If current PCM file size < $\text{targetSizeBytes}$:** Appends $(\text{targetSizeBytes} - \text{currentSize})$ bytes of digital silence using `fs.appendFileSync()`.
   - **If current PCM file size > $\text{targetSizeBytes}$:** Truncates extra disconnect lag bytes using `fs.truncateSync(tempPath, targetSizeBytes)`.

---

## 5. Post-Processing & AWS S3 Export Pipeline

1. **FFmpeg 24-bit FLAC Conversion:**  
   The sample-exact `.pcm` file is encoded to high-fidelity 24-bit FLAC (`s32` format in FFmpeg):
   ```bash
   ffmpeg -f f32le -ar 48000 -ac 1 -i <file>.pcm -sample_fmt s32 <file>.flac
   ```
2. **AWS S3 Storage Path:**  
   Uploaded via `@aws-sdk/lib-storage` `Upload` client:
   $$\text{Key} = \text{calls}/\{\text{callId}\}\_\{\text{language}\}\_\{\text{topic}\}/\text{speaker1.flac}$$
3. **Local Disk Cleanup:** Temporary `.pcm`, `.padded`, and `.flac` local files are unlinked after successful S3 delivery.

---

## 6. Verification Checklist in Audacity
When importing `speaker1.flac` and `speaker2.flac` into Audacity side-by-side:
* [x] **0.000s Start Alignment:** Voices line up from the zero mark.
* [x] **In-Call Speech Sync:** Responses between Speaker 1 and Speaker 2 occur in real-time conversational order.
* [x] **Identical Total Duration:** Both tracks end at the exact same sample and millisecond timestamp.
