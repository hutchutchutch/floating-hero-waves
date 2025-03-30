
import React, { useRef, useEffect } from 'react';

type VoiceWaveformProps = {
  audioData: Uint8Array | null;
  isActive: boolean;
};

const VoiceWaveform: React.FC<VoiceWaveformProps> = ({ audioData, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!canvasRef.current || !isActive || !audioData) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw the waveform
    const barWidth = canvas.width / audioData.length;
    const centerY = canvas.height / 2;
    const scaling = canvas.height / 256; // Assuming 8-bit audio data (0-255)
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    
    for (let i = 0; i < audioData.length; i++) {
      const value = audioData[i] * scaling;
      const x = i * barWidth;
      ctx.fillRect(x, centerY - value / 2, barWidth - 1, value);
    }
  }, [audioData, isActive]);
  
  if (!isActive) return null;
  
  return (
    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center pointer-events-none">
      <div className="relative w-80 h-16 md:w-96 md:h-20">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          width={400}
          height={100}
        />
      </div>
    </div>
  );
};

export default VoiceWaveform;
