
import React, { useRef, useEffect } from 'react';
import { AudioLines, Volume2, VolumeX } from 'lucide-react';

type VoiceWaveformProps = {
  audioData: Uint8Array | null;
  isActive: boolean;
};

const VoiceWaveform: React.FC<VoiceWaveformProps> = ({ audioData, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformColorsRef = useRef<string[]>([
    '#9b87f5', '#8B5CF6', '#7E69AB', '#6E59A5', '#D6BCFA'
  ]);

  // Draw waveform visualization on canvas
  useEffect(() => {
    if (!isActive || !audioData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate bar width and spacing
    const bufferLength = audioData.length;
    const barWidth = Math.ceil(canvas.width / bufferLength) * 2;
    const barSpacing = 2;
    const scaleFactor = 2.5; // Amplify the visualization

    // Draw the waveform bars
    let x = 0;
    for (let i = 0; i < bufferLength; i += 2) {
      // Get audio data and normalize to canvas height
      const amplitude = audioData[i] / 255.0; // Normalize to 0-1 range
      const barHeight = Math.max(3, amplitude * canvas.height * scaleFactor);
      
      // Calculate gradient color based on amplitude
      const colorIndex = Math.min(
        Math.floor(amplitude * waveformColorsRef.current.length),
        waveformColorsRef.current.length - 1
      );
      
      // Create gradient
      const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
      gradient.addColorStop(0, waveformColorsRef.current[colorIndex]);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0.2)');
      
      // Set fill style and draw bar
      ctx.fillStyle = gradient;
      
      // Draw mirrored bars (top and bottom)
      const centerY = canvas.height / 2;
      ctx.fillRect(
        x, 
        centerY - barHeight / 2, 
        barWidth, 
        barHeight
      );
      
      // Add glow effect
      ctx.shadowColor = waveformColorsRef.current[colorIndex];
      ctx.shadowBlur = 10;
      
      x += barWidth + barSpacing;
    }

    // Add pulse effect to the canvas
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = 'rgba(155, 135, 245, 0.1)';
    ctx.beginPath();
    const pulseFactor = 0.5 + Math.sin(Date.now() / 500) * 0.2;
    ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width * pulseFactor / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

  }, [audioData, isActive]);

  // Handle window resize effect
  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current) return;
      canvasRef.current.width = canvasRef.current.offsetWidth * window.devicePixelRatio;
      canvasRef.current.height = canvasRef.current.offsetHeight * window.devicePixelRatio;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isActive) return null;

  return (
    <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden pointer-events-none">
      <div className="relative w-full max-w-2xl px-4">
        {/* Audio indicator icon */}
        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 text-white/70 animate-pulse">
          {audioData && Math.max(...audioData) > 20 ? (
            <AudioLines size={24} className="text-[#9b87f5]" />
          ) : (
            <Volume2 size={24} className="text-white/50" />
          )}
        </div>
        
        {/* Canvas for audio visualization */}
        <canvas 
          ref={canvasRef} 
          className="w-full h-24 rounded-lg glass-morphism"
          style={{
            boxShadow: '0 4px 20px rgba(155, 135, 245, 0.3)',
          }}
        />
        
        {/* Floating particles for visual enhancement */}
        <div className="absolute -top-4 -left-4 w-8 h-8 rounded-full bg-purple-500/30 animate-[pulse_4s_ease-in-out_infinite]" />
        <div className="absolute -bottom-6 -right-4 w-6 h-6 rounded-full bg-blue-500/20 animate-[pulse_3s_ease-in-out_infinite]" />
      </div>
    </div>
  );
};

export default VoiceWaveform;
