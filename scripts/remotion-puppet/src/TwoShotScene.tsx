import React from "react";
import { AbsoluteFill, Img, staticFile, Audio, Sequence } from "remotion";
import { CharacterPuppet } from "./CharacterPuppet";

export const TwoShotScene: React.FC<{
  audioA: string;
  audioB: string;
}> = ({ audioA, audioB }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#F0EFEB" }}>
      {/* Root Level Audio Elements for Proper Mixdown */}
      <Sequence from={0}>
        <Audio src={audioA} />
      </Sequence>
      <Sequence from={120}>
        <Audio src={audioB} />
      </Sequence>

      {/* The Office Background */}
      <Img 
        src={staticFile("office_bg.png")} 
        style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.8 }} 
      />

      {/* Character A on the Left, unflipped directly facing right */}
      <CharacterPuppet 
        baseX={0} 
        baseY={100} 
        isFlipped={false} 
        audioSrc={audioA} 
        audioStartFrame={0}
      />

      {/* Character B on the Right, flipped to face left */}
      <CharacterPuppet 
        baseX={680} 
        baseY={100} 
        isFlipped={true} 
        audioSrc={audioB} 
        audioStartFrame={120}
      />
    </AbsoluteFill>
  );
};
