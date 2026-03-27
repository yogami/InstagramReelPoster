import React from 'react';
import { Composition, Sequence, Audio, Video, Img, useVideoConfig, useCurrentFrame, AbsoluteFill, interpolate } from 'remotion';
import { KundaliniScript } from '../../domain/services/video/KundaliniCrisisScript';

// Kova Typography System Implementation
const ChunkyTitle = ({ text }: { text: string }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  
  return (
    <div style={{
      fontFamily: 'Impact, sans-serif',
      fontSize: '120px',
      fontWeight: 900,
      color: '#fff',
      textTransform: 'uppercase',
      textAlign: 'center',
      textShadow: '0 0 20px rgba(255, 100, 0, 0.8), 0 0 40px rgba(255, 0, 0, 0.6)',
      opacity
    }}>
      {text}
    </div>
  );
};

const WordByWordCaption = ({ text, startFrame, endFrame }: { text: string, startFrame: number, endFrame: number }) => {
  const frame = useCurrentFrame();
  const words = text.split(" ");
  const framesPerWord = (endFrame - startFrame) / words.length;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', width: '80%', padding: '20px' }}>
      {words.map((word, i) => {
        const wordStart = startFrame + (i * framesPerWord);
        const isActive = frame >= Math.floor(wordStart);
        
        return (
          <span key={i} style={{
            fontFamily: 'Arial, sans-serif',
            fontSize: '80px',
            fontWeight: 'bold',
            color: isActive ? '#facc15' : '#ffffff', // Yellow highlight
            backgroundColor: isActive ? 'rgba(0,0,0,0.8)' : 'transparent',
            padding: '5px 15px',
            margin: '5px',
            borderRadius: '10px',
            transition: 'all 0.1s ease',
            textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
          }}>
            {word}
          </span>
        );
      })}
    </div>
  );
};

export const KundaliniCrisisComposition: React.FC = () => {
    const { fps, durationInFrames } = useVideoConfig(); // Mock config in raw file
    
    // Mock timing data (In production, this comes from the exact TTS word-level stamps calculated via builder)
    const act1Duration = 3 * fps;
    const act2Duration = 9 * fps;
    const act3Duration = 23 * fps;
    const act4FailDuration = 5 * fps;
    const act4FixDuration = 15 * fps;
    const act5Duration = 10 * fps;

    // Calculate start frames
    const act2Start = act1Duration;
    const act3Start = act2Start + act2Duration;
    const act4FailStart = act3Start + act3Duration;
    const act4FixStart = act4FailStart + act4FailDuration;
    const act5Start = act4FixStart + act4FixDuration;

    return (
        <AbsoluteFill style={{ backgroundColor: 'black', fontFamily: 'sans-serif' }}>
            
            {/* Act 1: The Hook (0-3s) - No preamble, just the visual hit */}
            <Sequence from={0} durationInFrames={act1Duration}>
                <div style={{color:'white', padding: '50px', fontSize: 40}}>ACT 1 [Visual Hook]: {KundaliniScript[0].visualPrompt}</div>
            </Sequence>

            {/* Act 2: Conflict & Stakes */}
            <Sequence from={act2Start} durationInFrames={act2Duration}>
                <div style={{color:'white', padding: '50px', fontSize: 40}}>ACT 2 [Dark RGB Room]: {KundaliniScript[1].visualPrompt}</div>
                <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: '150px' }}>
                    <WordByWordCaption text={KundaliniScript[1].narration} startFrame={0} endFrame={act2Duration} />
                </AbsoluteFill>
            </Sequence>

            {/* Act 3: The Build */}
            <Sequence from={act3Start} durationInFrames={act3Duration}>
                 <div style={{color:'white', padding: '50px', fontSize: 40}}>ACT 3 [Macro Shots intercut with Headers]: {KundaliniScript[2].visualPrompt}</div>
                 <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
                     <ChunkyTitle text="THE KUNDALINI CRISIS" />
                 </AbsoluteFill>
                 <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: '150px' }}>
                    <WordByWordCaption text={KundaliniScript[2].narration} startFrame={0} endFrame={act3Duration/3} />
                </AbsoluteFill>
            </Sequence>

            {/* Act 4: Failure State (The Hard Audio Cut) */}
            <Sequence from={act4FailStart} durationInFrames={act4FailDuration}>
                <div style={{color:'gray', padding: '50px', backgroundColor: '#111', fontSize: 40}}>ACT 4 (FAIL) [Complete Darkness/Flicker]: {KundaliniScript[5].visualPrompt}</div>
                 <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: '150px' }}>
                    <WordByWordCaption text={KundaliniScript[5].narration} startFrame={0} endFrame={act4FailDuration} />
                </AbsoluteFill>
            </Sequence>

            {/* Act 4: The Fix (The Beat Drop) */}
            <Sequence from={act4FixStart} durationInFrames={act4FixDuration}>
                <div style={{color:'black', padding: '50px', backgroundColor: '#fdf6e3', fontSize: 40}}>ACT 4 (FIX) [Bright Natural Light / Oak Floors]: {KundaliniScript[6].visualPrompt}</div>
                <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: '150px' }}>
                    <WordByWordCaption text={KundaliniScript[6].narration} startFrame={0} endFrame={act4FixDuration} />
                </AbsoluteFill>
            </Sequence>

             {/* Act 5: CTA */}
             <Sequence from={act5Start} durationInFrames={act5Duration}>
                <div style={{color:'white', padding: '50px', fontSize: 40}}>ACT 5 [Calm Blue RGB]: {KundaliniScript[7].visualPrompt}</div>
                <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: '150px' }}>
                    <WordByWordCaption text={KundaliniScript[7].narration} startFrame={0} endFrame={act5Duration} />
                </AbsoluteFill>
            </Sequence>

        </AbsoluteFill>
    );
};
