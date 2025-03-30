
import React, { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import FloatingObjects from './FloatingObjects';
import MicrophoneButton from './MicrophoneButton';
import FadingText from './FadingText';
import VoiceWaveform from './VoiceWaveform';

const HeroSection: React.FC = () => {
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [audioData, setAudioData] = useState<Uint8Array | null>(null);

  const handleMicToggle = (isActive: boolean) => {
    console.log('Microphone is', isActive ? 'active' : 'inactive');
    setMicrophoneActive(isActive);
  };

  const handleAudioData = (data: Uint8Array) => {
    setAudioData(new Uint8Array(data));
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#221F26]">
      {/* 3D Canvas Background */}
      <div className="absolute inset-0">
        <Canvas camera={{ position: [0, 0, 1.5], fov: 50 }}>
          <Suspense fallback={null}>
            <FloatingObjects />
            <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} />
          </Suspense>
        </Canvas>
      </div>
      
      {/* Voice Waveform Visualization */}
      <VoiceWaveform audioData={audioData} isActive={microphoneActive} />
      
      {/* Central Content */}
      <div className="relative h-full w-full flex flex-col items-center justify-center z-10">
        <MicrophoneButton onToggle={handleMicToggle} onAudioData={handleAudioData} />
        <FadingText text="Go ahead." />
      </div>
    </div>
  );
};

export default HeroSection;
