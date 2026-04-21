import React, { useEffect, useRef, useState } from "react";

export default function AudioVisualizer({ url, audioRef }) {
    const canvasRef = useRef(null);
    const [peaks, setPeaks] = useState([]);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    // Generate waveform data
    useEffect(() => {
        if (!url) return;

        const loadWaveform = async () => {
            try {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                setDuration(audioBuffer.duration);

                const rawData = audioBuffer.getChannelData(0); // Use first channel
                const samples = 400; // Number of buckets/bars
                const blockSize = Math.floor(rawData.length / samples);
                const filteredData = [];

                for (let i = 0; i < samples; i++) {
                    let blockStart = blockSize * i;
                    let sum = 0;
                    for (let j = 0; j < blockSize; j++) {
                        sum = sum + Math.abs(rawData[blockStart + j]);
                    }
                    filteredData.push(sum / blockSize);
                }

                // Normalize
                const multiplier = Math.pow(Math.max(...filteredData), -1);
                setPeaks(filteredData.map(n => n * multiplier));
                
                audioCtx.close();
            } catch (e) {
                console.error("Waveform generation failed", e);
            }
        };

        loadWaveform();
    }, [url]);

    // Sync with audio element
    useEffect(() => {
        if (!audioRef) return;
        const audio = audioRef.current;
        if (!audio) return;

        const onTimeUpdate = () => setCurrentTime(audio.currentTime);
        audio.addEventListener("timeupdate", onTimeUpdate);
        return () => audio.removeEventListener("timeupdate", onTimeUpdate);
    }, [audioRef]);

    // Draw waveform
    useEffect(() => {
        if (!canvasRef.current || peaks.length === 0) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;
        const barWidth = width / peaks.length;

        ctx.clearRect(0, 0, width, height);

        peaks.forEach((peak, i) => {
            const x = i * barWidth;
            const barHeight = peak * height * 0.8; // Use 80% height
            const y = (height - barHeight) / 2;

            // Gradient for waveform
            const gradient = ctx.createLinearGradient(0, height, 0, 0);
            gradient.addColorStop(0, "#f97316"); // warning-500
            gradient.addColorStop(1, "#fbbf24"); // amber-400

            // Dim if already played
            const isPlayed = (i / peaks.length) < (currentTime / duration);
            ctx.fillStyle = isPlayed ? gradient : "#404040"; // neutral-600 for unplayed

            ctx.fillRect(x, y, barWidth - 1, barHeight);
        });

        // Draw playhead (vertical line)
        if (duration > 0) {
            const progressX = (currentTime / duration) * width;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(progressX - 1, 0, 2, height);
        }
    }, [peaks, currentTime, duration]);

    const handleSeek = (e) => {
        if (!canvasRef.current || !audioRef.current || duration === 0) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = x / rect.width;
        audioRef.current.currentTime = percentage * duration;
    };

    return (
        <div className="w-full bg-neutral-900 border border-neutral-700 rounded-xl p-4 mb-4 select-none">
            <div className="flex justify-between text-[10px] text-neutral-500 font-mono mb-2 uppercase tracking-widest">
                <span>00:00</span>
                <span>Click graph to seek</span>
                <span>{formatTime(duration)}</span>
            </div>
            <div className="relative group cursor-pointer" onClick={handleSeek}>
                <canvas
                    ref={canvasRef}
                    width={800}
                    height={120}
                    className="w-full h-16 md:h-24 bg-neutral-950/30 rounded-lg"
                />
                {/* Hover effect highlight */}
                <div className="absolute inset-y-0 w-px bg-white/20 opacity-0 group-hover:opacity-100 pointer-events-none" style={{ left: 'var(--hover-x)' }} />
            </div>
        </div>
    );
}

function formatTime(seconds) {
    if (!seconds) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
