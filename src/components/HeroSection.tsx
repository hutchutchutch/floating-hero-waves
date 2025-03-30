
import React, { Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import FloatingObjects from './FloatingObjects';
import MicrophoneButton from './MicrophoneButton';
import FadingText from './FadingText';
import TextTranscription from './TextTranscription';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { useToast } from "@/components/ui/use-toast";
import { isGroqKeyConfigured } from '../config/apiKeys';

const HeroSection: React.FC = () => {
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [audioData, setAudioData] = useState<Uint8Array | null>(null);
  const [transcribedText, setTranscribedText] = useState('');
  const [showGoAhead, setShowGoAhead] = useState(false);
  const { toast } = useToast();

  const handleMicToggle = (isActive: boolean) => {
    console.log('Microphone is', isActive ? 'active' : 'inactive');
    setMicrophoneActive(isActive);
    
    if (!isActive) {
      setTranscribedText('');
    }
  };

  const handleAudioData = (data: Uint8Array) => {
    // Log audio data size without spamming the console
    if (Math.random() < 0.02) { // Only log ~2% of audio packets
      console.log(`Audio data received: ${data.length} bytes, max amplitude: ${Math.max(...data)}`);
    }
    setAudioData(new Uint8Array(data));
  };

  const handleTranscription = (text: string) => {
    if (text.trim()) {
      console.log('Transcription received in HeroSection:', text);
      setTranscribedText(text);
    } else {
      console.log('Empty transcription received');
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowGoAhead(true);
    }, 5000);
    
    return () => clearTimeout(timer);
  }, []);

  // Log when transcribed text changes
  useEffect(() => {
    if (transcribedText) {
      console.log('Transcribed text updated:', transcribedText);
    }
  }, [transcribedText]);

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
        <div className="flex flex-col items-center">
          <MicrophoneButton 
            onToggle={handleMicToggle} 
            onAudioData={handleAudioData} 
            onTranscription={handleTranscription}
          />
          {showGoAhead && (
            <div className="h-4 mt-4 transition-opacity duration-[2000ms] ease-in-out animate-fade-in">
              <TextShimmer
                className="text-xs font-medium [--base-color:rgba(239,238,226,0.1)] [--base-gradient-color:#efeee2]"
                duration={3}
              >
                Go ahead
              </TextShimmer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
