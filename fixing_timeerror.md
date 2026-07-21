# Speaker Recording Synchronization Report

This document records the synchronization issues faced during compiled speaker-separated recordings, the solution implemented, and troubleshooting paths (Plan B) if further issues arise during testing.

---

## 1. The Problem We Faced
When compiling separate audio recordings for **Speaker A** and **Speaker B** into a single merged call recording, there was a persistent discrepancy of **1.0 to 1.5 seconds**. 

This caused:
1. **Overlapping**: One speaker started talking before the other had physically finished.
2. **Artificial Gaps**: When a speaker finished their turn, there was a long, awkward delay before the other speaker's voice started.

### The Technical Root Cause
The server was calculating the starting offset of each audio file by subtracting timestamps from **two different clocks**:
```javascript
// BROKEN LOGIC
offset = clientStartTime (Client Clock) - serverExpectedStartTime (Server Clock);
```
Since browser clocks on laptops/phones are not perfectly synchronized with the server's NTP clock, this difference (which is commonly 1.0–1.5 seconds) was incorrectly applied as a physical offset in FFmpeg, causing track misalignment.

---

## 2. What We Did
We eliminated the client-server clock drift by calculating the recording offset **entirely on the client's own clock** relative to a shared event:

1. **Frontend ([Call.jsx](file:///c:/Users/manoj/OneDrive/Desktop/DC%20App%20n%20Website/DC%20Website/voicechat-frontend/src/pages/Call.jsx))**:
   * Calculated `clientOffsetMs` by comparing when the audio recording *actually* started vs. when it *should* have started (the end of the 5-second countdown) on the local browser clock.
   * Sent this self-contained offset parameter to the server inside the `record_start` socket payload.
2. **Backend ([index.js](file:///c:/Users/manoj/OneDrive/Desktop/DC%20App%20n%20Website/DC%20Website/voicechat-backend/src/index.js))**:
   * Updated the `record_start` listener to accept `clientOffsetMs` and save it directly.
   * Created a server-only fallback calculation (`Date.now() - call.expectedActualStartTime`) so that even if the frontend fails to send an offset, the server never mixes client and server timestamps.

---

## 3. What Else We Can Do (Plan B / Alternative Solutions)
If the issue is not fully resolved after testing (for instance, if network jitter causes the countdowns to start at significantly different times on each client), we can implement the following backup solutions:

### Solution A: Ping-Pong Round-Trip-Time (RTT) Synchronization
If one client has a very slow WebSocket connection, they will receive the start event slightly later than the other.
* **How it works**: Before starting the call, the frontend sends a ping to the server, and the server replies (pong). By measuring how long it takes, the client can calculate exactly how long the socket message took to arrive.
* **Why it helps**: The client can adjust its countdown start time by subtracting the network transit time (typically 20ms–80ms), achieving sub-millisecond precision.

### Solution B: Continuous Synchronization Markers (Riverside Model)
If the conversation is long (e.g. over 15 minutes) and one participant's hardware sound card records slightly faster or slower than the other (known as *sample rate drift*).
* **How it works**: Every 10 seconds, the frontend sends a lightweight socket message with the exact number of audio frames captured so far.
* **Why it helps**: The server can dynamically stretch or compress the audio track in FFmpeg to match the session timeline, keeping long conversations synchronized from beginning to end.

### Solution C: RTCP Sender Reports (WebRTC level)
If we want to bypass WebSockets entirely for recording synchronization.
* **How it works**: Real-time communication protocols (RTP) contain sender reports mapping media packets directly to absolute NTP time.
* **Why it helps**: If we capture media directly at the media server (SFU) instead of writing stream packets through WebSockets, WebRTC will automatically synchronize the tracks down to the millisecond.
