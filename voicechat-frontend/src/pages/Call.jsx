import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav.jsx";
import { getSystemCheckPassed, getUserInfo, setSystemCheckPassed } from "../lib/auth.js";
import { apiGet } from "../lib/api.js";
import { setLastCall } from "../lib/lastCall.js";
import { useSystemCheck } from "../context/SystemCheckContext.jsx";

// Import new components
import LanguageSelection from "../components/call/LanguageSelection/LanguageSelection.jsx";
import SystemCheck from "../components/call/SystemCheck/SystemCheck.jsx";
import IdleScreen from "../components/call/IdleScreen.jsx";
import NegotiationPhase from "../components/call/NegotiationPhase/NegotiationPhase.jsx";
import ActiveCall from "../components/call/ActiveCall.jsx";
import FeedbackScreen from "../components/call/FeedbackScreen/FeedbackScreen.jsx";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

const STUN_ONLY_FALLBACK = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

async function fetchIceServers() {
  try {
    const res = await apiGet("/api/turn/credentials");
    if (Array.isArray(res?.iceServers) && res.iceServers.length > 0) {
      return res.iceServers;
    }
  } catch (e) {
    console.warn("TURN credential fetch failed, using STUN-only fallback:", e);
  }
  return STUN_ONLY_FALLBACK;
}

export default function Call() {
  const navigate = useNavigate();

  // Language Selection State
  const [showLanguageSelection, setShowLanguageSelection] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState(null);
  const [callCount, setCallCount] = useState(0);
  const [callLimit, setCallLimit] = useState(3);
  const [userInfo, setUserInfo] = useState(null);
  const [languageSampleRates, setLanguageSampleRates] = useState({});

  // System Check State
  const [showSystemCheck, setShowSystemCheck] = useState(false);
  const { hasValidatedLanguage, addValidatedLanguage } = useSystemCheck();

  // Feedback State
  const [showFeedback, setShowFeedback] = useState(false);

  // Call State
  const remoteAudioRef = useRef(null);
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const pendingCandidates = useRef([]);
  const localStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const workletNodeRef = useRef(null);
  const callRef = useRef({
    callId: null,
    role: null,
    peerId: null,
    peerUserId: null,
    peerUsername: null,
  });

  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("idle");
  const [callId, setCallId] = useState(null);
  const [role, setRole] = useState(null);
  const [peerId, setPeerId] = useState(null);
  const [peerUserId, setPeerUserId] = useState(null);
  const [peerUsername, setPeerUsername] = useState(null);
  const [callEndTime, setCallEndTime] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isFindingMatch, setIsFindingMatch] = useState(false);

  // Negotiation State
  const [negotiationMode, setNegotiationMode] = useState(false);
  const [negotiationTimer, setNegotiationTimer] = useState(240); // 4 minutes
  const [topics, setTopics] = useState([]);
  const [activeClaim, setActiveClaim] = useState(null); // { topicId, subtopicId, mine }
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [selectedSubtopic, setSelectedSubtopic] = useState(null);
  const [topicConfirmed, setTopicConfirmed] = useState(false);
  const [myRole, setMyRole] = useState(null);
  const [peerRole, setPeerRole] = useState(null);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownValue, setCountdownValue] = useState(5);
  const [showInstructionModal, setShowInstructionModal] = useState(false);
  const [currentInstructions, setCurrentInstructions] = useState("");

  // Fetch user info and today's call count on mount
  useEffect(() => {
    (async () => {
      try {
        // Fetch user info to get dailyCallLimit
        const userRes = await apiGet("/api/auth/me");
        setUserInfo(userRes.user);

        // Set the call limit from user info or default to 3
        const limit = userRes.user?.dailyCallLimit !== undefined ? userRes.user.dailyCallLimit : 3;
        setCallLimit(limit);

        // Fetch today's call count
        const countRes = await apiGet("/api/calls/today-count");
        setCallCount(countRes.count || 0);

        // Fetch language sample rates
        const langRes = await apiGet("/api/languages");
        const rates = {};
        if (langRes.languages) {
          langRes.languages.forEach(l => {
            rates[l.code] = l.sampleRate || 48000;
          });
        }
        setLanguageSampleRates(rates);
      } catch (e) {
        console.error("Failed to fetch user info or call count:", e);
      }
    })();
  }, []);

  // Language Selection Handler
  const handleLanguageSelect = (language) => {
    setSelectedLanguage(language);
    setShowLanguageSelection(false);

    if (hasValidatedLanguage(language)) {
      setSystemCheckPassed(true);
      setShowSystemCheck(false);
      connectSocket();
    } else {
      setShowSystemCheck(true);
    }
  };

  const negotiationModeRef = useRef(false);

  // Sync ref with state
  useEffect(() => {
    negotiationModeRef.current = negotiationMode;
  }, [negotiationMode]);

  // Ensure remote stream stays attached to audio element
  useEffect(() => {
    if (remoteStream && remoteAudioRef.current) {
      // console.log("🔄 Reattaching remote stream to audio element");
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, negotiationMode]); // Re-attach when UI switches

  useEffect(() => {
    // Only clear if showing language selection on mount
    if (showLanguageSelection) {
      setSystemCheckPassed(false);
    }
  }, [showLanguageSelection]);

  // Pick random subtopic from all topics
  const pickRandomSubtopic = (topicsList) => {
    const workingTopics = topicsList || topics;
    // console.log("pickRandomSubtopic called with:", workingTopics?.length, "topics");

    if (!workingTopics || workingTopics.length === 0) {
      // console.log("No topics to pick from");
      return;
    }

    // Flatten all subtopics from all topics
    const allSubtopics = [];
    workingTopics.forEach(topic => {
      topic.subtopics?.forEach(sub => {
        allSubtopics.push({
          topicId: topic._id,
          topicTitle: topic.title,
          subtopicId: sub._id,
          subtopicTitle: sub.title
        });
      });
    });

    // console.log("Total subtopics available:", allSubtopics.length);

    if (allSubtopics.length > 0) {
      const random = allSubtopics[Math.floor(Math.random() * allSubtopics.length)];
      // console.log("Selected random subtopic:", random.subtopicTitle);
      setSelectedTopic(random.topicId);
      setSelectedSubtopic(random.subtopicId);
    }
  };

  // Load topics for negotiation dynamically strictly bound against Language constraints!
  useEffect(() => {
    if (!selectedLanguage) return; // Do not fetch arbitrary topics until the user explicitly selects a region

    async function loadTopics() {
      try {
        const data = await apiGet(`/api/topics/enabled?language=${encodeURIComponent(selectedLanguage)}`);
        // console.log("Language Topics loaded:", data.topics);
        setTopics(data.topics);
        
        // Pick random subtopic exclusively generated off localized maps
        if (data.topics && data.topics.length > 0) {
          pickRandomSubtopic(data.topics);
        }
      } catch (e) {
        console.error("Failed to load localized topics:", e);
      }
    }
    loadTopics();
  }, [selectedLanguage]);

  // Auto-pick random topic when topics are loaded and no topic is selected
  useEffect(() => {
    if (topics && topics.length > 0 && !selectedTopic) {
      // console.log("Auto-picking random topic from useEffect", topics.length);
      pickRandomSubtopic(topics);
    }
  }, [topics, selectedTopic]);

  // Negotiation Helpers
  function claimTopic(topicId, subtopicId) {
    if (socketRef.current) {
      socketRef.current.emit("topic_claim", { topicId, subtopicId });
    }
  }

  function confirmTopic() {
    if (activeClaim && socketRef.current) {
      socketRef.current.emit("topic_selected", {
        topicId: activeClaim.topicId,
        subtopicId: activeClaim.subtopicId,
      });
      setTopicConfirmed(true);
    }
  }

  function selectRole(role) {
    if (socketRef.current) {
      setMyRole(role);
      socketRef.current.emit("role_selected", { role });
    }
  }

  function handleStartCall() {
    // console.log("🔵 handleStartCall clicked");
    // console.log("🔵 Socket connected:", !!socketRef.current);
    // Emit to server to notify both peers
    if (socketRef.current) {
      // console.log("🔵 Emitting call_start_initiated");
      socketRef.current.emit("call_start_initiated");
    } else {
      console.error("❌ No socket connection!");
    }
  }

  function triggerCountdown(countdownMs = 5000) {
    // console.log("🟢 triggerCountdown called, duration:", countdownMs);

    const localStartAt = Date.now() + countdownMs;
    const localEndAt = localStartAt + 20 * 60 * 1000;
    setCallEndTime(localEndAt);

    setShowCountdown(true);
    setCountdownValue(Math.round(countdownMs / 1000));

    // Tick the visual countdown every 250ms
    const displayInterval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((localStartAt - Date.now()) / 1000));
      setCountdownValue(remaining);
      if (remaining <= 0) clearInterval(displayInterval);
    }, 250);

    setTimeout(() => {
      clearInterval(displayInterval);
      setShowCountdown(false);
      setNegotiationMode(false);

      // Start Recording
      startCallRecording(callRef.current.callId);
    }, countdownMs);
  }

  function handleEndConversation() {
    if (confirm("Are you sure you want to end the conversation?")) {
      // Use 'hangup' event which is handled by backend to notify peer via 'call_ended'
      if (socketRef.current) {
        socketRef.current.emit("hangup");
      }

      // Reset State
      setNegotiationMode(false);
      setStatus("idle");
      setCallId(null);
      setTopicConfirmed(false);
      setMyRole(null);
      setPeerRole(null);
      setTopics([]); // Clear topics to force reload next time or keep them? maybe keep.

      // Go back to idle screen
      // navigate("/call"); // Already there
    }
  }

  // Feedback Handlers
  const handleJoinAnotherQueue = () => {
    setShowFeedback(false);
    findMatch();
  };

  const handleGoHome = () => {
    navigate("/dashboard");
  };

  // System Check Handlers
  const skipTest = () => {
    setSystemCheckPassed(true);
    if (selectedLanguage) addValidatedLanguage(selectedLanguage);
    setShowSystemCheck(false);
    connectSocket();
  };

  const handleSystemCheckComplete = () => {
    setSystemCheckPassed(true);
    if (selectedLanguage) addValidatedLanguage(selectedLanguage);
    setShowSystemCheck(false);
    connectSocket();
  };

  // Call Functions
  function log(s) {
    setStatus(s);
  }

  const getCurrentSampleRate = () => {
    return languageSampleRates[selectedLanguage] || 48000;
  };

  async function ensureLocalStream() {
    if (localStreamRef.current && localStreamRef.current.active) {
      return localStreamRef.current;
    }
    const rate = getCurrentSampleRate();
    localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: rate, channelCount: 1 } });
    return localStreamRef.current;
  }

  async function startCallRecording(activeCallId) {
    const socket = socketRef.current;
    const stream = localStreamRef.current;
    if (!socket || !stream || !activeCallId) return;

    if (workletNodeRef.current) return; // already recording

    const rate = getCurrentSampleRate();
    const audioCtx = new AudioContext({ sampleRate: rate });
    audioContextRef.current = audioCtx;
    
    await audioCtx.audioWorklet.addModule("/pcm-worklet.js");
    const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");
    workletNodeRef.current = workletNode;

    const source = audioCtx.createMediaStreamSource(stream);

    const startTime = Date.now();
    // Use the actual hardware stream sample rate. Because of a known bug in Chromium,
    // createMediaStreamSource ignores audioCtx.sampleRate and pumps the raw native hardware rate.
    // If we pass audioCtx.sampleRate (e.g. 22050), but the stream is 48000, FFmpeg stretches it 2.17x!
    const actualStreamRate = stream.getAudioTracks()[0].getSettings().sampleRate || audioCtx.sampleRate;
    socket.emit("record_start", { callId: activeCallId, mimeType: "audio/pcm", startTime, sampleRate: actualStreamRate });

    workletNode.port.onmessage = (e) => {
      const s2 = socketRef.current;
      if (s2) {
        s2.emit("record_chunk", e.data);
      }
    };

    const gain = audioCtx.createGain();
    gain.gain.value = 0;
    source.connect(workletNode);
    workletNode.connect(gain);
    gain.connect(audioCtx.destination);
  }

  function stopCallRecording() {
    const socket = socketRef.current;
    if (workletNodeRef.current) {
        workletNodeRef.current.disconnect();
        workletNodeRef.current = null;
    }
    if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
    }

    try { if (socket) socket.emit("record_stop"); } catch { }
  }

  async function createPeerConnection() {
    if (pcRef.current) return pcRef.current;

    const iceServers = await fetchIceServers();
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    pc.onicecandidate = (ev) => {
      const socket = socketRef.current;
      const { callId: activeCallId, peerId: activePeerId } = callRef.current;
      if (!ev.candidate || !socket || !activeCallId || !activePeerId) return;
      socket.emit("signal", {
        callId: activeCallId,
        to: activePeerId,
        data: { type: "ice", candidate: ev.candidate },
      });
    };

    pc.oniceconnectionstatechange = () => {
      // console.log("❄️ ICE Connection State:", pc.iceConnectionState);
      if (pc.iceConnectionState === "failed") {
        console.error("❌ ICE Connection Failed. Check TURN servers or network blocks.");
      }
    };

    pc.onconnectionstatechange = () => {
      // console.log("🔗 Peer Connection State:", pc.connectionState);
    };

    pc.ontrack = (ev) => {
      // console.log("🎧 Received remote track");
      const [stream] = ev.streams;
      if (stream) {
        // console.log("🎧 Setting remote stream to state");
        setRemoteStream(stream);
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          // console.log("🎧 Attached stream to audio element");
        }
      }

      setTimeout(async () => {
        try {
          const stats = await pc.getStats();
          stats.forEach((report) => {
            if (report.type === "inbound-rtp" && report.kind === "audio") {
              // console.log("🎧 Receiving Audio Codec:", report.codecId);
              stats.forEach((codecReport) => {
                if (codecReport.id === report.codecId) {
                  // console.log("📊 Codec Details:", {
                  //   mimeType: codecReport.mimeType,
                  //   clockRate: codecReport.clockRate,
                  //   channels: codecReport.channels,
                  //   sdpFmtpLine: codecReport.sdpFmtpLine,
                  // });
                  setStatus(`codec: ${codecReport.mimeType || "unknown"}`);
                }
              });
            }
          });
        } catch (e) {
          console.error("Failed to get codec stats:", e);
        }
      }, 2000);
    };

    const stream = await ensureLocalStream();
    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
    }

    return pc;
  }

  async function maybeMakeOffer(activeCallId, activePeerId, roleValue) {
    if (roleValue !== "offerer") return;

    const pc = await createPeerConnection();
    const offer = await pc.createOffer({ offerToReceiveAudio: true });

    if (offer.sdp) {
      offer.sdp = preferOpusCodec(offer.sdp);
    }

    await pc.setLocalDescription(offer);

    const socket = socketRef.current;
    socket.emit("signal", {
      callId: activeCallId,
      to: activePeerId,
      data: { type: "offer", sdp: pc.localDescription },
    });
  }

  function preferOpusCodec(sdp) {
    const sdpLines = sdp.split('\r\n');
    const mLineIndex = sdpLines.findIndex(line => line.startsWith('m=audio'));

    if (mLineIndex === -1) return sdp;

    const opusPayload = sdpLines.find(line =>
      line.includes('opus/48000') && line.startsWith('a=rtpmap:')
    );

    if (!opusPayload) return sdp;

    const opusPayloadType = opusPayload.split(':')[1].split(' ')[0];

    const mLineParts = sdpLines[mLineIndex].split(' ');
    const otherPayloads = mLineParts.slice(3).filter(p => p !== opusPayloadType);
    mLineParts.splice(3, mLineParts.length - 3, opusPayloadType, ...otherPayloads);
    sdpLines[mLineIndex] = mLineParts.join(' ');

    // console.log('🎵 Preferred Opus codec in SDP');
    return sdpLines.join('\r\n');
  }

  async function onSignal(data) {
    const pc = await createPeerConnection();

    const { callId: activeCallId, peerId: activePeerId } = callRef.current;

    if (data.type === "offer") {
      await pc.setRemoteDescription(data.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current.emit("signal", {
        callId: activeCallId,
        to: activePeerId,
        data: { type: "answer", sdp: pc.localDescription },
      });
      // Drain pending candidates
      for (const c of pendingCandidates.current) {
        try { await pc.addIceCandidate(c); } catch {}
      }
      pendingCandidates.current = [];
      return;
    }

    if (data.type === "answer") {
      await pc.setRemoteDescription(data.sdp);
      // Drain pending candidates
      for (const c of pendingCandidates.current) {
        try { await pc.addIceCandidate(c); } catch {}
      }
      pendingCandidates.current = [];
      return;
    }

    if (data.type === "ice") {
      if (pc.remoteDescription) {
        try { await pc.addIceCandidate(data.candidate); } catch { }
      } else {
        pendingCandidates.current.push(data.candidate);
      }
    }
  }

  function cleanupCallUi() {
    stopCallRecording();

    try {
      if (pcRef.current) pcRef.current.close();
    } catch { }
    pcRef.current = null;

    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    workletNodeRef.current = null;
    pendingCandidates.current = [];
    callRef.current = {
      callId: null,
      role: null,
      peerId: null,
      peerUserId: null,
      peerUsername: null,
    };

    setCallId(null);
    setRole(null);
    setPeerId(null);
    setPeerUserId(null);
    setPeerUsername(null);
    setPeerUsername(null);
    setCallEndTime(null);
  }

  async function connectSocket() {
    // Check if user is logged in (token is in HTTP-only cookie)
    const userInfo = getUserInfo();
    if (!userInfo) {
      navigate("/login");
      return;
    }

    // Socket will authenticate via cookies automatically
    const socket = io(BACKEND_URL, {
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      log("connected");
      const passed = getSystemCheckPassed();
      socket.emit("system_check_status", { passed });
    });

    socket.on("disconnect", () => {
      setConnected(false);
      log("disconnected");
      cleanupCallUi();
    });

    socket.on("force_logout", ({ reason }) => {
      alert("You have been logged out: " + reason);
      navigate("/login");
    });

    socket.on("queue", ({ status }) => {
      log(`queue: ${status}`);
    });

    socket.on("queue", ({ status }) => {
      log(`queue: ${status}`);
    });

    socket.on("matched", async (payload) => {
      setIsFindingMatch(false); // Stop loading animation
      callRef.current = {
        callId: payload.callId,
        role: payload.role,
        peerId: payload.peerId,
        peerUserId: payload.peerUserId,
        peerUsername: payload.peerUsername,
      };

      setCallId(payload.callId);
      setRole(payload.role);
      setPeerId(payload.peerId);
      setPeerUserId(payload.peerUserId);
      setPeerUsername(payload.peerUsername);

      setLastCall({
        callId: payload.callId,
        peerUserId: payload.peerUserId,
        peerUsername: payload.peerUsername,
      });

      log("matched");

      await ensureLocalStream();
      await createPeerConnection(); // Audio enabled immediately so they can talk

      // Check Negotiation Mode
      if (payload.negotiationMode) {
        setNegotiationMode(true);
        setNegotiationTimer(240);
        setTopicConfirmed(false);
        setActiveClaim(null);
        setSelectedTopic(null);
        setSelectedSubtopic(null);
        setMyRole(null);
        setPeerRole(null);

        // Timer logic for negotiation (local countdown)
        const interval = setInterval(() => {
          setNegotiationTimer((prev) => {
            if (prev <= 1) {
              clearInterval(interval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        // Ensure interval is cleared if component unmounts or call ends (cleanupCallUi logic handles nav away)
      } else {
        // Legacy/Fallback: Start immediatley if no negotiation mode
        await startCallRecording(payload.callId);
      }

      if (payload.role === "offerer") {
        await maybeMakeOffer(payload.callId, payload.peerId, payload.role);
      }
    });

    // Negotiation Events
    socket.on("topic_claimed", ({ topicId, subtopicId, instructions, byMe }) => {
      setActiveClaim({ topicId, subtopicId, mine: byMe });
      setCurrentInstructions(instructions || "");
      setShowInstructionModal(true);
    });

    socket.on("topic_selected", ({ topicId, subtopicId }) => {
      setSelectedTopic(topicId);
      setSelectedSubtopic(subtopicId);
      setTopicConfirmed(true);
      setActiveClaim(null);
    });

    socket.on("peer_role_selected", ({ role }) => {
      setPeerRole(role);
    });

    socket.on("roles_confirmed", ({ yourRole, peerRole, topicId, subtopicId }) => {
      setMyRole(yourRole);
      setPeerRole(peerRole);
      setSelectedTopic(topicId);
      setSelectedSubtopic(subtopicId);
      // Don't auto-start countdown - wait for manual "Start Call" button click
    });

    socket.on("negotiation_timeout", () => {
      alert("Negotiation time expired! Call disconnected.");
      setNegotiationMode(false);
      setStatus("idle");
      navigate("/call");
    });

    socket.on("call_start_initiated", () => {
      // console.log("🟡 Received call_start_initiated event");
      triggerCountdown(5000);
    });

    socket.on("signal", async ({ data }) => {
      try {
        await onSignal(data);
      } catch { }
    });

    socket.on("peer_left", ({ reason }) => {
      log(`peer_left: ${reason}`);
      cleanupCallUi();
    });

    socket.on("call_ended", ({ callId: endedId, reason, peerUserId: p }) => {
      log(`call_ended: ${reason}`);

      const wasInNegotiation = negotiationModeRef.current;
      const peerInfoBeforeCleanup = callRef.current;

      cleanupCallUi();
      try {
        socket.disconnect();
      } catch { }

      if (wasInNegotiation) {
        // If we were in negotiation, just reset to idle screen
        setNegotiationMode(false);
        setStatus("idle");
        setCallId(null);
        setTopicConfirmed(false);
        setMyRole(null);
        setPeerRole(null);
        // Force topics refresh or keep them
        navigate("/call");
      } else {
        // Active call ended -> Go to feedback
        if (endedId) {
          setLastCall({
            callId: endedId,
            peerUserId: p || peerInfoBeforeCleanup.peerUserId,
            peerUsername: peerInfoBeforeCleanup.peerUsername,
          });
        }
        setSystemCheckPassed(false);
        setShowFeedback(true);
      }
    });

    socket.on("error_message", ({ message, limit, count, language }) => {
      log(`error: ${message}`);
      setIsFindingMatch(false); // Reset on error
      if (message === "system_check_required") {
        setSystemCheckPassed(false);
        setShowSystemCheck(true);
      } else if (message === "daily_limit_exceeded") {
        const limitText = limit !== undefined ? limit : callLimit;
        alert(`Daily call limit exceeded! You have reached your daily limit of ${limitText} calls. Please try again tomorrow.`);
      } else if (message === "language_not_approved") {
        const langName = language || selectedLanguage || "this language";
        if (confirm(`You are not approved to call in "${langName}" yet.\n\nWould you like to apply now?`)) {
          navigate("/language-apply");
        } else {
          setShowLanguageSelection(true);
        }
      } else if (message === "user_not_found") {
        alert("User not found. Please login again.");
        navigate("/login");
      } else if (message === "server_error") {
        alert("Server error. Please try again later.");
      }
    });

  }

  useEffect(() => {
    return () => {
      try {
        if (socketRef.current) socketRef.current.disconnect();
      } catch { }
      cleanupCallUi();
      try {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => t.stop());
        }
      } catch { }
    };
  }, []);

  async function findMatch() {
    if (!socketRef.current || !connected) return;

    if (!getSystemCheckPassed() && !hasValidatedLanguage(selectedLanguage)) {
      setShowSystemCheck(true);
      return;
    }

    if (hasValidatedLanguage(selectedLanguage)) {
      setSystemCheckPassed(true);
    }

    try {
      await ensureLocalStream();
    } catch {
      setSystemCheckPassed(false);
      setShowSystemCheck(true);
      return;
    }

    socketRef.current.emit("system_check_status", {
      passed: true,
      language: selectedLanguage || 'english'
    });
    setIsFindingMatch(true); // Start loading animation
    socketRef.current.emit("find_match");
  }

  function hangup() {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("hangup");
    cleanupCallUi();
  }

  // Render Language Selection UI
  if (showLanguageSelection) {
    return (
      <>
        <Nav />
        <LanguageSelection
          onLanguageSelect={handleLanguageSelect}
          callCount={callCount}
          callLimit={callLimit}
        />
      </>
    );
  }

  // Render System Check UI
  if (showSystemCheck) {
    return (
      <>
        <Nav />
        <SystemCheck onComplete={handleSystemCheckComplete} onSkip={skipTest} />
      </>
    );
  }

  // Render Call UI
  return (
    <div className="min-h-screen bg-gradient-subtle pt-16 md:pt-0 md:pl-64">
      <Nav disabled={!!callId && !showFeedback} />
      <div className="max-w-full md:max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-8 w-full">
        {/* Call Interface */}
        {showFeedback ? (
          <FeedbackScreen onJoinAnotherQueue={handleJoinAnotherQueue} onGoHome={handleGoHome} />
        ) : !callId ? (
          // Idle State
          <IdleScreen
            connected={connected}
            status={status}
            onConnect={connectSocket}
            onFindMatch={findMatch}
            isFindingMatch={isFindingMatch}
          />
        ) : negotiationMode ? (
          // Negotiation Phase UI
          <NegotiationPhase
            negotiationTimer={negotiationTimer}
            peerUsername={peerUsername}
            topics={topics}
            activeClaim={activeClaim}
            selectedTopic={selectedTopic}
            selectedSubtopic={selectedSubtopic}
            topicConfirmed={topicConfirmed}
            myRole={myRole}
            peerRole={peerRole}
            showCountdown={showCountdown}
            countdownValue={countdownValue}
            remoteAudioRef={remoteAudioRef}
            onClaimTopic={claimTopic}
            onConfirmTopic={confirmTopic}
            onSelectRole={selectRole}
            onStartCall={handleStartCall}
            onEndConversation={handleEndConversation}
            showInstructionModal={showInstructionModal}
            currentInstructions={currentInstructions}
            onCloseInstructionModal={() => setShowInstructionModal(false)}
          />
        ) : (
          // Active Call State (Call in Progress)
          <ActiveCall
            peerUsername={peerUsername}
            callId={callId}
            role={role}
            callEndTime={callEndTime}
            remoteAudioRef={remoteAudioRef}
            remoteStream={remoteStream}
            localStreamRef={localStreamRef}
            onHangup={hangup}
            topics={topics}
            selectedTopic={selectedTopic}
            selectedSubtopic={selectedSubtopic}
          />
        )}
      </div>
    </div >
  );
}
