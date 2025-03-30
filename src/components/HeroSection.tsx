
import React, { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import FloatingObjects from './FloatingObjects';
import MicrophoneButton from './MicrophoneButton';
import FadingText from './FadingText';
import TextTranscription from './TextTranscription';

const HeroSection: React.FC = () => {
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [audioData, setAudioData] = useState<Uint8Array | null>(null);
  const [transcribedText, setTranscribedText] = useState('');

  const handleMicToggle = (isActive: boolean) => {
    console.log('Microphone is', isActive ? 'active' : 'inactive');
    setMicrophoneActive(isActive);
    
    if (!isActive) {
      setTranscribedText('');
    }
  };

  const handleAudioData = (data: Uint8Array) => {
    setAudioData(new Uint8Array(data));
  };

  const simulateTranscription = () => {
    if (microphoneActive) {
      const dummyPhrases = [
        "I'm looking for information about...",
        "Can you tell me more about...",
        "I'd like to know about...",
        "How does this work?",
        "What's the best way to...",
        "Could you explain...",
        "I'm trying to understand...",
      ];
      
      const randomPhrase = dummyPhrases[Math.floor(Math.random() * dummyPhrases.length)];
      setTranscribedText(prev => {
        if (Math.random() > 0.7 || prev.length > 100) {
          return randomPhrase;
        }
        return prev + " " + randomPhrase.toLowerCase();
      });
    }
  };

  React.useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (microphoneActive) {
      interval = setInterval(simulateTranscription, 2000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [microphoneActive]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#221F26]">
      <div className="absolute inset-0">
        <Canvas camera={{ position: [0, 0, 1.5], fov: 50 }}>
          <Suspense fallback={null}>
            <FloatingObjects />
            <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} />
          </Suspense>
        </Canvas>
      </div>
      
      <TextTranscription isActive={microphoneActive} text={transcribedText} />
      
      <div className="relative h-full w-full flex flex-col items-center justify-center z-10">
        <MicrophoneButton onToggle={handleMicToggle} onAudioData={handleAudioData} />
        <FadingText text="Go ahead." />
      </div>
    </div>
  );
};

export default HeroSection;
