'use client';

import React, { useMemo } from 'react';
import { useGLTF, OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';

interface MusclesAnatomy3DProps {
  muscleWork: Record<string, number>;
  onSelect?: (muscle: string | null) => void;
  selectedMuscle?: string | null;
}

function MusclesAnatomy3DModel({ muscleWork, onSelect, selectedMuscle }: MusclesAnatomy3DProps) {
  // Load the GLTF model
  // We use useGLTF to ensure it's cached and efficiently loaded
  const { nodes } = useGLTF('/body.glb');

  // Define muscle mappings (using substrings to match mesh names)
  // Mapping detailed muscle keys to 3D meshes
  const muscleGroups = {
    chest: ['pectoralis', 'serratus', 'subclavius', 'intercostal'],
    lats: ['latissimus'],
    traps: ['trapezius', 'rhomboid'],
    lower_back: ['erector', 'multifidus', 'quadratus lumborum'],
    back: ['teres', 'infraspinatus', 'supraspinatus', 'subscapularis'],
    shoulders: ['deltoid'],
    biceps: ['biceps brachii', 'brachialis', 'coracobrachialis'],
    triceps: ['triceps brachii', 'anconeus'],
    forearms: ['pronator', 'flexor carpi', 'extensor carpi', 'brachioradialis', 'supinator', 'palmaris', 'digitorum', 'pollicis', 'indici', 'minimi', 'lumbrical', 'interossei'],
    abs: ['rectus abdominis', 'transversus', 'pyramidalis', 'linea alba'],
    obliques: ['oblique'],
    glutes: ['gluteus', 'piriformis', 'gemellus', 'obturator'],
    quads: ['quadratus femoris', 'femoris', 'vastus', 'sartorius', 'pectineus'],
    hamstrings: ['semimembranosus', 'semitendinosus', 'biceps femoris'],
    calves: ['gastrocnemius', 'soleus', 'plantaris', 'popliteus'],
  };

  const getGroupForMesh = (meshName: string) => {
    const lowerName = meshName.toLowerCase();
    for (const [group, keywords] of Object.entries(muscleGroups)) {
      if (keywords.some(kw => lowerName.includes(kw))) {
        return group;
      }
    }
    return null;
  };

  // Helper to determine color based on fatigue/sets
  const getFatigueColor = (score: number, isSelected: boolean) => {
    if (isSelected) return new THREE.Color('#7c3aed'); // Accent purple if selected
    // 0 = Green, >15 = Red
    // Scale sets to a 0-1 range roughly capped at 20 sets
    if (score === 0) return new THREE.Color('#333333');
    const normalized = Math.min(score / 20, 1);
    const hue = Math.max(0, 120 - normalized * 120);
    return new THREE.Color(`hsl(${hue}, 80%, 50%)`);
  };

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, 10, -5]} intensity={0.5} />
      <Environment preset="city" />
      
      {/* Center the model (it might be large or off-center natively) */}
      <group position={[0, -1, 0]} scale={1.5} dispose={null}>
        {Object.keys(nodes).map((key) => {
          const node = nodes[key];
          if (node instanceof THREE.Mesh) {
            const groupName = getGroupForMesh(node.name);
            const score = groupName ? (muscleWork[groupName] || 0) : 0;
            const isSelected = selectedMuscle === groupName && groupName !== null;
            const color = getFatigueColor(score, isSelected);
            
            // Unmatched meshes (score 0 and unnamed) get a neutral gray to look clean
            const isUnmatched = !groupName && !node.name.toLowerCase().match(/muscle|head|part/);
            
            return (
              <mesh
                key={node.uuid}
                geometry={node.geometry}
                castShadow
                receiveShadow
                onClick={(e) => {
                  if (groupName && onSelect) {
                    e.stopPropagation();
                    onSelect(groupName);
                  }
                }}
              >
                <meshStandardMaterial 
                  color={isUnmatched ? new THREE.Color(0x555555) : color} 
                  roughness={0.4} 
                  metalness={0.2} 
                />
              </mesh>
            );
          }
          return null;
        })}
      </group>
      
      <ContactShadows position={[0, -1.1, 0]} opacity={0.4} scale={5} blur={2} />
      <OrbitControls 
        enablePan={false} 
        enableZoom={true} 
        minDistance={1} 
        maxDistance={5} 
        autoRotate={!selectedMuscle} // Stop rotating if a muscle is selected
        autoRotateSpeed={0.5}
        maxPolarAngle={Math.PI / 1.5}
      />
    </>
  );
}

export function MusclesAnatomy3D({ muscleWork, onSelect, selectedMuscle }: MusclesAnatomy3DProps) {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: 400, position: 'relative' }}>
      <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
        <MusclesAnatomy3DModel 
          muscleWork={muscleWork} 
          onSelect={onSelect} 
          selectedMuscle={selectedMuscle} 
        />
      </Canvas>
    </div>
  );
}
