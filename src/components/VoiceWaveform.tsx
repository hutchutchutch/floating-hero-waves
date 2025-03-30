
import React, { useRef, useEffect, useState } from 'react';

type VoiceWaveformProps = {
  audioData: Uint8Array | null;
  isActive: boolean;
};

interface WaveParticle {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  speed: number;
  opacity: number;
}

const VoiceWaveform: React.FC<VoiceWaveformProps> = ({ audioData, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [particles, setParticles] = useState<WaveParticle[]>([]);
  const animationRef = useRef<number | null>(null);
  
  // Create particles based on audio data
  useEffect(() => {
    if (!isActive) return;
    
    // Generate new particles based on audio data
    if (audioData) {
      const newParticles: WaveParticle[] = [];
      const screenWidth = window.innerWidth;
      
      // Create particles at the bottom of the screen
      for (let i = 0; i < 10; i++) {
        const randomX = Math.random() * screenWidth;
        const randomWidth = 5 + Math.random() * 15;
        const randomHeight = 5 + (audioData[i % audioData.length] / 10);
        const randomSpeed = 0.5 + Math.random() * 1.5;
        
        newParticles.push({
          x: randomX,
          y: window.innerHeight - 50, // Start at bottom of screen
          width: randomWidth,
          height: randomHeight,
          color: 'rgba(255, 255, 255, 0.8)',
          speed: randomSpeed,
          opacity: 1.0
        });
      }
      
      setParticles(prev => [...prev, ...newParticles]);
    }
  }, [audioData, isActive]);
  
  // Animation loop
  useEffect(() => {
    if (!isActive) {
      setParticles([]);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }
    
    const animate = () => {
      setParticles(prev => 
        prev
          .map(particle => {
            // Move particles upward
            const newY = particle.y - particle.speed;
            
            // Calculate opacity based on position (fade out as they move up)
            // Fully visible at bottom, completely transparent at 40% of screen height
            const maxVisibleHeight = window.innerHeight * 0.6;
            const opacity = Math.max(0, (window.innerHeight - newY) / maxVisibleHeight);
            
            return {
              ...particle,
              y: newY,
              opacity
            };
          })
          .filter(particle => particle.opacity > 0) // Remove completely faded particles
      );
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isActive]);
  
  // Draw particles on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas dimensions to match window
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw all particles
    particles.forEach(particle => {
      ctx.fillStyle = particle.color.replace('0.8', particle.opacity.toString());
      ctx.beginPath();
      ctx.roundRect(particle.x, particle.y, particle.width, particle.height, 2);
      ctx.fill();
    });
  }, [particles]);
  
  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  if (!isActive) return null;
  
  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 w-full h-full pointer-events-none z-0"
    />
  );
};

export default VoiceWaveform;
