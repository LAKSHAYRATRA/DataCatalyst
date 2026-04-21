import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
// Native fetch will be used for Blob retrieval

export default function SecureAudioPlayer({ url }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    // Fetch auth token
    let token = null;
    const cookies = document.cookie.split(";").map((c) => c.trim());
    const vcCookie = cookies.find((c) => c.startsWith("vc_token="));
    if (vcCookie) token = vcCookie.split("=")[1];
    else token = localStorage.getItem("vc_token");
    
    async function loadAudio() {
      try {
        setLoading(true);
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
        const res = await fetch(BACKEND_URL + url, {
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error('Audio load failed');
        
        const blob = await res.blob();
        if (mounted) {
          const objectUrl = URL.createObjectURL(blob);
          setBlobUrl(objectUrl);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load secure audio:", err);
        if (mounted) setLoading(false);
      }
    }
    
    if (url) loadAudio();
    
    return () => {
      mounted = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [url]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
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
        disabled={loading || !blobUrl}
        className={`w-12 h-12 flex flex-shrink-0 items-center justify-center rounded-full text-white ${
          loading ? 'bg-neutral-400' : 'bg-primary-600 hover:bg-primary-500'
        } transition-colors`}
      >
        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-6 h-6" />
        ) : (
          <Play className="w-6 h-6 ml-1" />
        )}
      </motion.button>
      
      <div 
        className="flex-1 h-3 bg-neutral-300 dark:bg-neutral-700 rounded-full cursor-pointer relative overflow-hidden"
        onClick={handleSeek}
      >
        <motion.div 
          className="absolute top-0 left-0 bottom-0 bg-primary-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
