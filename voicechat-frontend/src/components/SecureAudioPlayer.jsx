import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Loader2, DownloadCloud } from 'lucide-react';
import { motion } from 'framer-motion';
import { fetchAndConvertToWav } from '../lib/audioToWav.js';

export default function SecureAudioPlayer({ url }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  // Handle auto-play once the blob is loaded and audio ref is attached
  useEffect(() => {
    if (blobUrl && shouldAutoPlay && audioRef.current) {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch((e) => {
            console.error("Autoplay failed:", e);
            setIsPlaying(false);
          });
      } else {
        setIsPlaying(true);
      }
      setShouldAutoPlay(false);
    }
  }, [blobUrl, shouldAutoPlay]);

  const loadAudio = async () => {
    if (loading || blobUrl) return;
    try {
      setLoading(true);
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
      const blob = await fetchAndConvertToWav(BACKEND_URL + url);
      const objectUrl = URL.createObjectURL(blob);
      setBlobUrl(objectUrl);
      setShouldAutoPlay(true);
      setLoading(false);
    } catch (err) {
      console.error("Failed to load secure audio:", err);
      setLoading(false);
      alert("Failed to load audio: " + err.message);
    }
  };

  const togglePlay = () => {
    if (!blobUrl) {
      loadAudio();
      return;
    }
    
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => setIsPlaying(true))
            .catch((e) => {
              console.error("Audio playback failed:", e);
              setIsPlaying(false);
              alert("Playback failed. The audio format may not be supported by your browser.");
            });
        } else {
          setIsPlaying(true);
        }
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      const duration = audioRef.current.duration;
      setProgress((current / duration) * 100 || 0);
    }
  };

  const handleSeek = (e) => {
    if (audioRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      audioRef.current.currentTime = percentage * audioRef.current.duration;
    }
  };

  return (
    <div 
      className="flex items-center gap-4 bg-neutral-100 dark:bg-neutral-800 p-4 rounded-xl shadow-inner select-none"
      onContextMenu={(e) => e.preventDefault()} // Block right-click
    >
      {blobUrl && (
        <audio 
          ref={audioRef} 
          src={blobUrl} 
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          className="hidden" // Hides native controls
        />
      )}
      
      <motion.button
        whileHover={{ scale: loading ? 1 : 1.1 }}
        whileTap={{ scale: loading ? 1 : 0.95 }}
        onClick={togglePlay}
        disabled={loading}
        className={`w-12 h-12 flex flex-shrink-0 items-center justify-center rounded-full text-white ${
          loading ? 'bg-neutral-400' : 'bg-primary-600 hover:bg-primary-500'
        } transition-colors`}
        title={!blobUrl ? "Load and Play" : isPlaying ? "Pause" : "Play"}
      >
        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : !blobUrl ? (
          <DownloadCloud className="w-5 h-5 ml-0.5" />
        ) : isPlaying ? (
          <Pause className="w-6 h-6" />
        ) : (
          <Play className="w-6 h-6 ml-1" />
        )}
      </motion.button>
      
      <div 
        className={`flex-1 h-3 rounded-full relative overflow-hidden ${blobUrl ? 'bg-neutral-300 dark:bg-neutral-700 cursor-pointer' : 'bg-neutral-200 dark:bg-neutral-800 opacity-50'}`}
        onClick={blobUrl ? handleSeek : undefined}
      >
        {blobUrl && (
          <motion.div 
            className="absolute top-0 left-0 bottom-0 bg-primary-500"
            style={{ width: `${progress}%` }}
          />
        )}
      </div>
    </div>
  );
}
