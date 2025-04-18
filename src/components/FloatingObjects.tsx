
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils } from 'three';
import * as THREE from 'three';
import { useGLTF, SpotLight } from '@react-three/drei';
import { useIsMobile } from '../hooks/use-mobile';

type ObjectProps = {
  position: [number, number, number];
  scale: number;
  rotationSpeed: [number, number, number];
  floatSpeed: number;
  maxY: number;
};

const FloatingObject: React.FC<ObjectProps> = ({ 
  position, 
  scale, 
  rotationSpeed, 
  floatSpeed,
  maxY
}) => {
  const group = useRef<THREE.Group>(null!);
  const { scene } = useGLTF('/garlic.glb');
  
  // Create a clone of the scene to avoid sharing materials across instances
  const garlicScene = useMemo(() => {
    const clonedScene = scene.clone();
    return clonedScene;
  }, [scene]);
  
  useFrame(() => {
    if (group.current) {
      // Rotate the object (slower rotation)
      group.current.rotation.x += rotationSpeed[0];
      group.current.rotation.y += rotationSpeed[1];
      group.current.rotation.z += rotationSpeed[2];
      
      // Move upward (slower floating)
      group.current.position.y += floatSpeed;
      
      // Reset position when it goes too high, ensuring no garlics touch the camera (z > 0.5)
      if (group.current.position.y > maxY) {
        group.current.position.y = -10;
        group.current.position.x = MathUtils.randFloatSpread(6);
        group.current.position.z = -MathUtils.randFloat(0.5, 3); // Always in front of camera but not touching
      }
    }
  });

  return (
    <group ref={group} position={position} scale={[scale, scale, scale]}>
      <primitive object={garlicScene} />
    </group>
  );
};

// Spotlight component positioned just above the camera
const MainSpotlight = () => {
  const isMobile = useIsMobile();
  
  return (
    <SpotLight
      position={[0, 0.5, 0]} // Just above the camera
      angle={0.6}
      penumbra={0.5}
      intensity={isMobile ? 2.5 : 5} // Half intensity on mobile
      color="#FEF7CD"
      castShadow
      attenuation={5}
      anglePower={5}
    />
  );
};

const FloatingObjects: React.FC = () => {
  const objects = useMemo(() => {
    const items = [];
    
    for (let i = 0; i < 18; i++) { // Keeping the same number of garlic objects
      items.push({
        position: [
          MathUtils.randFloatSpread(6),  // x (narrower spread)
          MathUtils.randFloatSpread(10) - 15,  // y (start below screen)
          -MathUtils.randFloat(0.5, 3),   // z (in front of camera, not touching)
        ] as [number, number, number],
        scale: MathUtils.randFloat(1.2, 1.8),  // Same scale
        rotationSpeed: [
          MathUtils.randFloat(0.0002, 0.0005) * (Math.random() > 0.5 ? 1 : -1),
          MathUtils.randFloat(0.0002, 0.0005) * (Math.random() > 0.5 ? 1 : -1),
          MathUtils.randFloat(0.0002, 0.0005) * (Math.random() > 0.5 ? 1 : -1),
        ] as [number, number, number],
        floatSpeed: MathUtils.randFloat(0.002, 0.005), // Same float speed
        maxY: 15
      });
    }
    
    return items;
  }, []);

  // Preload the garlic model
  useGLTF.preload('/garlic.glb');

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <MainSpotlight />
      {objects.map((props, i) => (
        <FloatingObject key={i} {...props} />
      ))}
    </>
  );
};

export default FloatingObjects;
