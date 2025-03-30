
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
import VoiceWaveform from './VoiceWaveform';
import WrenchIcon from './WrenchIcon';

const HeroSection: React.FC = () => {
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [audioData, setAudioData] = useState<Uint8Array | null>(null);
  const [transcribedText, setTranscribedText] = useState('');
  const [showGoAhead, setShowGoAhead] = useState(false);
  const [hasTranscribedContent, setHasTranscribedContent] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Check if GROQ API key is configured
    if (!isGroqKeyConfigured()) {
      toast({
        title: "GROQ API Key Missing",
        description: "Please add your GROQ_API_KEY to the Supabase Edge Function secrets.",
        variant: "destructive",
        duration: 10000,
      });
    }
  }, [toast]);

  const handleMicToggle = (isActive: boolean) => {
    console.log('Microphone is', isActive ? 'active' : 'inactive');
    setMicrophoneActive(isActive);
    
    if (!isActive) {
      setTranscribedText('');
    } else {
      // Show audio collection started toast
      toast({
        title: "Audio Collection Started",
        description: "Speak clearly into your microphone.",
        duration: 3000,
      });
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
      console.log('New transcription chunk received in HeroSection:', text);
      setTranscribedText(text);
      // If we have any meaningful transcription content, show the wrench icon
      if (text.length > 3) {
        console.log('Setting hasTranscribedContent to true because we received text:', text);
        setHasTranscribedContent(true);
      }
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
      
      {/* Audio waveform visualization */}
      <VoiceWaveform isActive={microphoneActive} audioData={audioData} />
      
      {/* Display transcribed text as chat bubbles */}
      <TextTranscription isActive={microphoneActive} text={transcribedText} />
      
      {/* Wrench icon that appears after first transcription */}
      <WrenchIcon visible={hasTranscribedContent} />
      
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
