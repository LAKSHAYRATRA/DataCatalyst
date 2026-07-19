/**
 * LEGACY STANDALONE TEST HARNESS — NOT PART OF THE REACT APP
 *
 * This file is a standalone WebRTC + Socket.IO test client that references
 * plain DOM elements (e.g. #status, #connectBtn) from a separate HTML test page.
 * It is NOT imported anywhere in the React application (main.jsx is the real entry).
 *
 * Do NOT import or modify this file as part of the React build. It exists only
 * as a development/debugging utility.
 */
import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://192.168.1.28:3001";

const statusEl = document.getElementById("status");
const connectBtn = document.getElementById("connectBtn");
const findBtn = document.getElementById("findBtn");
const hangupBtn = document.getElementById("hangupBtn");
const remoteAudio = document.getElementById("remoteAudio");

const callIdEl = document.getElementById("callId");
const roleEl = document.getElementById("role");
const peerEl = document.getElementById("peer");
const recEl = document.getElementById("rec");

const logEl = document.getElementById("log");

function log(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.textContent = `${line}\n${logEl.textContent}`;
}

function parseIceServers() {
  const raw = import.meta.env.VITE_ICE_SERVERS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let socket = null;
let pc = null;
let localStream = null;
let audioContext = null;
let workletNode = null;
let callId = null;
let role = null;
let peerId = null;
let pendingCandidates = [];
let startedRecording = false;

async function ensureLocalStream() {
  if (localStream) return localStream;

  localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 1 } });
  return localStream;
}

async function startRecording() {
  if (!socket || !callId || !localStream || startedRecording) return;

  audioContext = new AudioContext();
  await audioContext.audioWorklet.addModule("/pcm-worklet.js");

  const source = audioContext.createMediaStreamSource(localStream);
  workletNode = new AudioWorkletNode(audioContext, "pcm-processor");

  const gain = audioContext.createGain();
  gain.gain.value = 0;

  workletNode.port.onmessage = (e) => {
    if (!socket || !startedRecording) return;
    const buf = e.data;
    socket.emit("record_chunk", buf);
  };

  source.connect(workletNode);
  workletNode.connect(gain);
  gain.connect(audioContext.destination);

  socket.emit("record_start", {
    callId,
    sampleRate: audioContext.sampleRate,
    channels: 1,
  });

  startedRecording = true;
  recEl.textContent = "starting";
}

function stopRecording() {
  if (!socket) return;

  startedRecording = false;
  recEl.textContent = "stopped";

  try {
    socket.emit("record_stop");
  } catch {
  }

  try {
    if (workletNode) workletNode.disconnect();
  } catch {
  }

  try {
    if (audioContext) audioContext.close();
  } catch {
  }

  workletNode = null;
  audioContext = null;
}

async function createPeerConnection() {
  if (pc) return pc;

  const iceServers = parseIceServers();
  pc = new RTCPeerConnection({ iceServers });

  pc.onicecandidate = (ev) => {
    if (!ev.candidate || !socket || !callId || !peerId) return;
    socket.emit("signal", {
      callId,
      to: peerId,
      data: { type: "ice", candidate: ev.candidate },
    });
  };

  pc.ontrack = (ev) => {
    const [stream] = ev.streams;
    if (stream) {
      remoteAudio.srcObject = stream;
    }
  };

  pc.onconnectionstatechange = () => {
    log(`pc state: ${pc.connectionState}`);
  };

  const stream = await ensureLocalStream();
  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream);
  }

  return pc;
}

async function maybeMakeOffer() {
  if (role !== "offerer") return;
  const pc2 = await createPeerConnection();
  const offer = await pc2.createOffer({ offerToReceiveAudio: true });
  await pc2.setLocalDescription(offer);
  socket.emit("signal", {
    callId,
    to: peerId,
    data: { type: "offer", sdp: pc2.localDescription },
  });
}

async function onSignal(data) {
  if (!pc) await createPeerConnection();

  if (data.type === "offer") {
    await pc.setRemoteDescription(data.sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("signal", {
      callId,
      to: peerId,
      data: { type: "answer", sdp: pc.localDescription },
    });
    for (const c of pendingCandidates) {
      try { await pc.addIceCandidate(c); } catch {}
    }
    pendingCandidates = [];
    return;
  }

  if (data.type === "answer") {
    await pc.setRemoteDescription(data.sdp);
    for (const c of pendingCandidates) {
      try { await pc.addIceCandidate(c); } catch {}
    }
    pendingCandidates = [];
    return;
  }

  if (data.type === "ice") {
    if (pc.remoteDescription) {
      try { await pc.addIceCandidate(data.candidate); } catch {}
    } else {
      pendingCandidates.push(data.candidate);
    }
  }
}

function setUiConnected(connected) {
  statusEl.textContent = connected ? "Connected" : "Disconnected";
  findBtn.disabled = !connected;
  connectBtn.textContent = connected ? "Disconnect" : "Connect";
}

function resetCallUi() {
  callId = null;
  role = null;
  peerId = null;
  pendingCandidates = [];
  statusEl.textContent = "Idle";
  callIdEl.textContent = "-";
  roleEl.textContent = "-";
  peerEl.textContent = "-";
  hangupBtn.disabled = true;
  recEl.textContent = "-";
}

function cleanupCall() {
  stopRecording();

  try {
    if (pc) pc.close();
  } catch {
  }
  pc = null;

  remoteAudio.srcObject = null;
  resetCallUi();
}

connectBtn.onclick = async () => {
  if (socket && socket.connected) {
    cleanupCall();
    socket.disconnect();
    socket = null;
    setUiConnected(false);
    return;
  }

  socket = io(BACKEND_URL, {
  });

  socket.on("connect", () => {
    setUiConnected(true);
    log(`socket connected: ${socket.id}`);
  });

  socket.on("disconnect", () => {
    setUiConnected(false);
    log("socket disconnected");
    cleanupCall();
  });

  socket.on("queue", ({ status }) => {
    log(`queue: ${status}`);
  });

  socket.on("matched", async ({ callId: cid, role: r, peerId: pid }) => {
    callId = cid;
    role = r;
    peerId = pid;
    callIdEl.textContent = callId;
    roleEl.textContent = role;
    peerEl.textContent = peerId;
    hangupBtn.disabled = false;

    log(`matched: ${role} with ${peerId}`);

    await ensureLocalStream();
    await createPeerConnection();
    await startRecording();

    if (role === "offerer") {
      await maybeMakeOffer();
    }
  });

  socket.on("signal", async ({ data }) => {
    try {
      await onSignal(data);
    } catch (e) {
      log(`signal error: ${e?.message || e}`);
    }
  });

  socket.on("peer_left", ({ reason }) => {
    log(`peer left: ${reason}`);
    cleanupCall();
  });

  socket.on("record_ready", ({ fileName }) => {
    recEl.textContent = `writing ${fileName}`;
  });

  socket.on("error_message", ({ message, detail }) => {
    log(`error: ${message} ${detail || ""}`);
  });
};

findBtn.onclick = async () => {
  if (!socket || !socket.connected) return;

  try {
    await ensureLocalStream();
  } catch {
    log("mic permission denied");
    return;
  }

  log("finding match...");
  socket.emit("find_match");
};

hangupBtn.onclick = () => {
  if (!socket) return;
  socket.emit("hangup");
  cleanupCall();
};

resetCallUi();
setUiConnected(false);
