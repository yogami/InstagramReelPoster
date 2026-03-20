import React from "react";
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, staticFile, interpolate, spring, useVideoConfig } from "remotion";
import { CharacterPuppet } from "./CharacterPuppet";

interface DialogueTurn {
  speaker: "marco" | "luna";
  line: string;
  audioFile: string;
  startFrame: number;
  durationFrames: number;
}

interface PuppetDialogueProps {
  timeline: DialogueTurn[];
  backgroundUrl: string;
  hook?: string;
}

const CafeTableScene: React.FC<{
  activeSpeaker: string | null;
  frame: number;
}> = ({ frame }) => {
  return (
    <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      {/* Floor */}
      <rect x="0" y="1300" width="1080" height="620" fill="#3d3427" />
      <rect x="0" y="1300" width="1080" height="4" fill="#5a4d3a" />

      {/* Wall art */}
      <rect x="400" y="200" width="280" height="200" rx="4" fill="#4a4035" stroke="#6b5d4d" strokeWidth="3" />
      <rect x="420" y="220" width="240" height="160" fill="#5a6e5a" />
      <circle cx="540" cy="300" r="40" fill="#7a9a7a" opacity="0.6" />

      {/* Pendant light */}
      <line x1="540" y1="0" x2="540" y2="480" stroke="#2a2520" strokeWidth="2" />
      <path d="M 500 480 Q 540 510, 580 480" fill="none" stroke="#c8a96e" strokeWidth="3" />
      <ellipse cx="540" cy="495" rx="15" ry="8" fill="#ffeaa7" opacity="0.8" />
      <ellipse cx="540" cy="520" rx="200" ry="120" fill="url(#lightGlow)" />

      {/* TABLE */}
      <g id="table">
        <ellipse cx="540" cy="1050" rx="220" ry="50" fill="#8b6f47" stroke="#6d5635" strokeWidth="3" />
        <rect x="525" y="1095" width="30" height="180" fill="#6d5635" />
        <ellipse cx="540" cy="1280" rx="60" ry="15" fill="#5a4a38" />
        {/* Coffee cups */}
        <ellipse cx="460" cy="1035" rx="18" ry="8" fill="#d4c5a9" stroke="#b8a88c" strokeWidth="2" />
        <rect x="445" y="1020" width="30" height="18" rx="3" fill="#d4c5a9" stroke="#b8a88c" strokeWidth="2" />
        <ellipse cx="620" cy="1035" rx="18" ry="8" fill="#d4c5a9" stroke="#b8a88c" strokeWidth="2" />
        <rect x="605" y="1020" width="30" height="18" rx="3" fill="#d4c5a9" stroke="#b8a88c" strokeWidth="2" />
      </g>

      {/* MARCO's CHAIR */}
      <g id="marco-chair">
        <rect x="120" y="900" width="200" height="350" rx="8" fill="#4a4035" stroke="#3a3025" strokeWidth="3" />
        <rect x="140" y="1100" width="160" height="40" rx="5" fill="#5a5045" />
        <rect x="130" y="1230" width="10" height="90" fill="#3a3025" />
        <rect x="300" y="1230" width="10" height="90" fill="#3a3025" />
      </g>

      {/* LUNA's CHAIR */}
      <g id="luna-chair">
        <rect x="760" y="900" width="200" height="350" rx="8" fill="#4a4035" stroke="#3a3025" strokeWidth="3" />
        <rect x="780" y="1100" width="160" height="40" rx="5" fill="#5a5045" />
        <rect x="770" y="1230" width="10" height="90" fill="#3a3025" />
        <rect x="940" y="1230" width="10" height="90" fill="#3a3025" />
      </g>

      <defs>
        <radialGradient id="lightGlow">
          <stop offset="0%" stopColor="#ffeaa7" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#ffeaa7" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
};

export const PuppetDialogueScene: React.FC<PuppetDialogueProps> = ({
  timeline,
  hook,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let activeSpeaker: string | null = null;
  let activeLine: string | null = null;
  let turnStartFrame = 0;
  for (const turn of timeline) {
    if (frame >= turn.startFrame && frame < turn.startFrame + turn.durationFrames) {
      activeSpeaker = turn.speaker;
      activeLine = turn.line;
      turnStartFrame = turn.startFrame;
      break;
    }
  }

  const marcoTurns = timeline.filter((t) => t.speaker === "marco");
  const lunaTurns = timeline.filter((t) => t.speaker === "luna");

  // === CAMERA ZOOM — subtle focus on active speaker, both stay in frame ===
  const zoomProgress = activeSpeaker
    ? spring({ frame: frame - turnStartFrame, fps, config: { damping: 80, stiffness: 60 } })
    : 0;

  const ZOOM_SCALE = 1.12; // Subtle zoom — both characters stay visible
  // Gentle shift toward speaker — not enough to cut the other person out
  const targetX = activeSpeaker === "marco" ? 60 : activeSpeaker === "luna" ? -60 : 0;
  const targetY = -50; // Slight upward to focus on face area

  const cameraScale = interpolate(zoomProgress, [0, 1], [1, ZOOM_SCALE]);
  const cameraX = interpolate(zoomProgress, [0, 1], [0, targetX]);
  const cameraY = interpolate(zoomProgress, [0, 1], [0, targetY]);

  return (
    <AbsoluteFill>
      {/* === CAMERA CONTAINER — zooms into active speaker === */}
      <div style={{
        position: "absolute", inset: 0,
        transform: `scale(${cameraScale}) translate(${cameraX}px, ${cameraY}px)`,
        transformOrigin: "center center",
        transition: !activeSpeaker ? "transform 0.5s ease-out" : undefined,
      }}>
      {/* === ROOT LEVEL AUDIO === */}
      {timeline.map((turn, i) => (
        <Sequence key={`audio-${i}`} from={turn.startFrame} durationInFrames={turn.durationFrames + 10}>
          <Audio src={staticFile(turn.audioFile)} />
        </Sequence>
      ))}

      {/* === BACKGROUND === */}
      <div style={{
        width: "100%", height: "100%",
        background: "linear-gradient(180deg, #2d2820 0%, #3d3530 60%, #3d3427 100%)",
      }} />

      {/* === CAFE TABLE SCENE SVG === */}
      <CafeTableScene activeSpeaker={activeSpeaker} frame={frame} />

      {/* === MARCO (sitting left, facing right) === */}
      {marcoTurns.map((turn, i) => (
        <Sequence key={`marco-puppet-${i}`} from={turn.startFrame} durationInFrames={turn.durationFrames}>
          <CharacterPuppet
            baseX={50}
            baseY={770}
            isFlipped={false}
            audioSrc={staticFile(turn.audioFile)}
            audioStartFrame={0}
            character="marco"
          />
        </Sequence>
      ))}
      {/* Marco idle */}
      <div style={{
        position: "absolute", left: 50, bottom: 770,
        width: 350, height: 450,
        opacity: activeSpeaker === "marco" ? 0 : 1,
      }}>
        <CharacterPuppet
          baseX={0} baseY={0} isFlipped={false}
          audioSrc={marcoTurns[0]?.audioFile ? staticFile(marcoTurns[0].audioFile) : ""}
          audioStartFrame={99999}
          character="marco"
        />
      </div>

      {/* === LUNA (sitting right, facing left) === */}
      {lunaTurns.map((turn, i) => (
        <Sequence key={`luna-puppet-${i}`} from={turn.startFrame} durationInFrames={turn.durationFrames}>
          <CharacterPuppet
            baseX={680}
            baseY={770}
            isFlipped={true}
            audioSrc={staticFile(turn.audioFile)}
            audioStartFrame={0}
            character="luna"
          />
        </Sequence>
      ))}
      {/* Luna idle */}
      <div style={{
        position: "absolute", left: 680, bottom: 770,
        width: 350, height: 450,
        opacity: activeSpeaker === "luna" ? 0 : 1,
      }}>
        <CharacterPuppet
          baseX={0} baseY={0} isFlipped={true}
          audioSrc={lunaTurns[0]?.audioFile ? staticFile(lunaTurns[0].audioFile) : ""}
          audioStartFrame={99999}
          character="luna"
        />
      </div>

      {/* === SPEAKER HIGHLIGHT === */}
      {activeSpeaker === "marco" && (
        <div style={{
          position: "absolute", left: 50, bottom: 770,
          width: 350, height: 450,
          background: "radial-gradient(circle at 50% 30%, rgba(126,214,223,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
      )}
      {activeSpeaker === "luna" && (
        <div style={{
          position: "absolute", left: 680, bottom: 770,
          width: 350, height: 450,
          background: "radial-gradient(circle at 50% 30%, rgba(248,165,194,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
      )}
      </div>{/* end camera container */}

      {/* === FIRST-FRAME HOOK TEXT OVERLAY === */}
      {hook && frame < 75 && (
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          pointerEvents: "none",
          opacity: interpolate(frame, [0, 5, 55, 75], [0, 1, 1, 0], { extrapolateRight: "clamp" }),
        }}>
          <div style={{
            transform: `scale(${spring({ frame, fps, config: { damping: 60, stiffness: 120 } })})`,
            padding: "20px 40px",
            maxWidth: "85%",
            textAlign: "center" as const,
          }}>
            <span style={{
              color: "#ffffff",
              fontSize: 58,
              fontFamily: "'Montserrat', 'Impact', 'Helvetica Neue', Arial, sans-serif",
              fontWeight: 900,
              textTransform: "uppercase" as const,
              letterSpacing: 2,
              lineHeight: 1.2,
              textShadow: "0 4px 12px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.9), 2px 2px 0px #000, -2px -2px 0px #000, 2px -2px 0px #000, -2px 2px 0px #000",
              WebkitTextStroke: "1px rgba(0,0,0,0.3)",
            }}>
              {hook}
            </span>
          </div>
        </div>
      )}

      {/* === SPEAKER NAME TAG (outside camera zoom so it stays readable) === */}
      {activeSpeaker && (
        <div style={{
          position: "absolute", bottom: 260, left: 0, right: 0,
          display: "flex", justifyContent: "center",
        }}>
          <div style={{
            backgroundColor: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(8px)",
            borderRadius: 20, padding: "6px 24px",
          }}>
            <span style={{
              color: activeSpeaker === "marco" ? "#7ed6df" : "#f8a5c2",
              fontSize: 26, fontFamily: "Arial, sans-serif", fontWeight: 700,
              textTransform: "uppercase" as const, letterSpacing: 3,
            }}>
              {activeSpeaker === "marco" ? "MARCO" : "LUNA"}
            </span>
          </div>
        </div>
      )}

      {/* === SUBTITLE === */}
      {activeLine && (
        <div style={{
          position: "absolute", bottom: 80, left: 40, right: 40,
          backgroundColor: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
          borderRadius: 16, padding: "16px 24px",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{
            color: "#ffffff", fontSize: 34, fontFamily: "Georgia, serif",
            fontWeight: 600, textAlign: "center" as const, lineHeight: 1.35,
            textShadow: "0 2px 4px rgba(0,0,0,0.5)",
          }}>
            {activeLine}
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};
