
import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import FloatingObjects from './FloatingObjects';
import MicrophoneButton from './MicrophoneButton';

const HeroSection: React.FC = () => {
  const handleMicToggle = (isActive: boolean) => {
    console.log('Microphone is', isActive ? 'active' : 'inactive');
    // Here you could add actual microphone functionality
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#221F26]">
      {/* 3D Canvas Background */}
      <div className="absolute inset-0">
        <Canvas camera={{ position: [0, 0, 3], fov: 50 }}>
          <Suspense fallback={null}>
            <FloatingObjects />
            <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} />
          </Suspense>
        </Canvas>
      </div>
      
      {/* Central Content */}
      <div className="relative h-full w-full flex flex-col items-center justify-center">
        <MicrophoneButton onToggle={handleMicToggle} />
        <p className="text-white text-xl mt-4 animate-pulse">what's up?</p>
      </div>
    </div>
  );
};

export default HeroSection;
