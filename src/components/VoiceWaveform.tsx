
import React from 'react';

type VoiceWaveformProps = {
  audioData: Uint8Array | null;
  isActive: boolean;
};

const VoiceWaveform: React.FC<VoiceWaveformProps> = ({ audioData, isActive }) => {
  // Component is now empty as we're removing the visual waves
  return null;
};

export default VoiceWaveform;
