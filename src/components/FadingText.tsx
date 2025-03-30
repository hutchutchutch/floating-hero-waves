
import React, { useState, useEffect } from 'react';

interface FadingTextProps {
  text: string;
  minInterval?: number; // minimum time between fades in ms
  invisibleDuration?: number; // how long text should stay invisible in ms
}

const FadingText: React.FC<FadingTextProps> = ({ 
  text, 
  minInterval = 7000, // default to 7 seconds minimum between fades
  invisibleDuration = 5000 // default to 5 seconds of invisibility
}) => {
  const [visible, setVisible] = useState(true);
  const [opacity, setOpacity] = useState(1);
  
  useEffect(() => {
    const scheduleNextFade = () => {
      // Random interval between minInterval and minInterval + 5000ms
      const nextFadeTime = minInterval + Math.random() * 5000;
      
      return setTimeout(() => {
        // Start fade out
        setOpacity(0);
        
        // After fade out completes, toggle visibility
        setTimeout(() => {
          setVisible(false);
          
          // Wait for invisibleDuration before starting to fade back in
          setTimeout(() => {
            setVisible(true);
            
            // Start fade in
            setTimeout(() => {
              setOpacity(1);
              
              // Schedule next fade after this one completes
              timeoutId = scheduleNextFade();
            }, 100);
          }, invisibleDuration);
        }, 500); // Match the duration in the CSS transition
      }, nextFadeTime);
    };
    
    let timeoutId = scheduleNextFade();
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [minInterval, invisibleDuration]);
  
  // Don't render anything when not visible
  if (!visible) return null;
  
  return (
    <p 
      className="text-white text-xl mt-4"
      style={{ 
        opacity: opacity,
        transition: 'opacity 0.5s ease-in-out'
      }}
    >
      {text}
    </p>
  );
};

export default FadingText;
