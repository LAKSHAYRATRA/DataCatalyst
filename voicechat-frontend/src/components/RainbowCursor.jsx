import React, { useEffect, useState } from 'react';

export default function RainbowCursor() {
  const [particles, setParticles] = useState([]);
  const [enabled, setEnabled] = useState(() => localStorage.getItem("rainbowCursorEnabled") === "true");

  useEffect(() => {
    const handleToggle = () => setEnabled(localStorage.getItem("rainbowCursorEnabled") === "true");
    window.addEventListener("cursorToggle", handleToggle);
    return () => window.removeEventListener("cursorToggle", handleToggle);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setParticles([]);
      return;
    }

    // Only enable on non-touch devices
    if (window.matchMedia("(pointer: coarse)").matches) return;

    let particleArray = [];
    let animationFrameId;
    
    // Smooth rainbow color generator
    let hue = 0;

    const handlePointerMove = (e) => {
        hue = (hue + 2) % 360;
        const newParticle = {
            id: Date.now() + Math.random(),
            x: e.clientX,
            y: e.clientY,
            color: `hsl(${hue}, 100%, 60%)`,
            size: Math.random() * 8 + 8, // 8px to 16px initial
            opacity: 1,
            // slight random velocity for popping
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4
        };
        particleArray.push(newParticle);
    };

    const animateParticles = () => {
        // Update particles
        for (let i = 0; i < particleArray.length; i++) {
            let p = particleArray[i];
            p.x += p.vx;
            p.y += p.vy;
            p.opacity -= 0.02; // Fade out speed
            p.size -= 0.1; // Shrink speed
        }

        // Remove dead particles
        particleArray = particleArray.filter(p => p.opacity > 0 && p.size > 0);

        // Limit maximum array size so we don't blow up react render state
        if (particleArray.length > 50) {
            particleArray.shift();
        }

        setParticles([...particleArray]);
        animationFrameId = requestAnimationFrame(animateParticles);
    };

    window.addEventListener('pointermove', handlePointerMove);
    animateParticles();

    return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        cancelAnimationFrame(animationFrameId);
    };
  }, [enabled]);

  if (particles.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
        {particles.map(p => (
            <div
                key={p.id}
                style={{
                    position: 'absolute',
                    left: `${p.x}px`,
                    top: `${p.y}px`,
                    width: `${p.size}px`,
                    height: `${p.size}px`,
                    backgroundColor: p.color,
                    borderRadius: '50%',
                    opacity: p.opacity,
                    transform: 'translate(-50%, -50%)',
                    boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
                    willChange: 'transform, opacity, width, height'
                }}
            />
        ))}
    </div>
  );
}
