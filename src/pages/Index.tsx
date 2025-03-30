
import React from 'react';
import HeroSection from '../components/HeroSection';
import { useToast } from '@/components/ui/use-toast';
import { useEffect } from 'react';

const Index = () => {
  const { toast } = useToast();
  
  useEffect(() => {
    toast({
      title: "Welcome to the 3D Experience",
      description: "Click the microphone to interact",
      duration: 5000
    });
  }, [toast]);

  return (
    <main>
      <HeroSection />
    </main>
  );
};

export default Index;
