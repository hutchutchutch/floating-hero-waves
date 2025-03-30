
import React, { Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Sparkles } from 'lucide-react';
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
    } else if (!isGroqKeyConfigured()) {
      toast({
        title: "GROQ API Key Missing",
        description: "Please add VITE_GROQ_API_KEY to your .env file",
        variant: "destructive",
        duration: 5000
      });
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

  // Check API key on component mount
  useEffect(() => {
    if (!isGroqKeyConfigured()) {
      console.warn("GROQ API Key not configured. WebRTC streaming will not work.");
    }
  }, []);

  // Fade in "Go ahead" text after 5 seconds
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
      
      <TextTranscription isActive={microphoneActive} text={transcribedText} />
      
      <div className="relative h-full w-full flex flex-col items-center justify-center z-10">
        <div className="flex flex-col items-center">
          <MicrophoneButton onToggle={handleMicToggle} onAudioData={handleAudioData} />
          {showGoAhead && (
            <div className="h-4 mt-4 transition-opacity duration-[2000ms] ease-in-out animate-fade-in">
              <TextShimmer
                className="text-xl font-medium [--base-color:rgba(255,255,255,0.1)] [--base-gradient-color:#ffffff]"
                duration={3}
              >
                Go ahead <Sparkles className="w-5 h-5 inline-block ml-1" />
              </TextShimmer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
