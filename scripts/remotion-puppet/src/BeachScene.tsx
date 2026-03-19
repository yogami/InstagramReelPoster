import React from "react";
import { AbsoluteFill, Img, staticFile, Audio, Sequence, useCurrentFrame, OffthreadVideo } from "remotion";

// Hardcoded from timeline.json (measured via ffprobe)
const TIMELINE = [
  { speaker: "guy", file: "guy_line1.wav", video: "guy_line1_animated.mp4", line: "You know what I love about this place? No deadlines. No emails. Just the waves.", startFrame: 0, durationFrames: 209 },
  { speaker: "girl", file: "girl_line1.wav", video: "girl_line1_animated.mp4", line: "Mmm. I could stay here forever. Play me that song again, the one from last night.", startFrame: 221, durationFrames: 203 },
  { speaker: "guy", file: "guy_line2.wav", video: "guy_line2_animated.mp4", line: "This one? I actually wrote it this morning. Inspired by the sunrise.", startFrame: 436, durationFrames: 171 },
];

export const BeachScene: React.FC = () => {
  const frame = useCurrentFrame();

  // Determine who's speaking
  let activeSpeaker: string | null = null;
  let activeLine: string | null = null;
  for (const turn of TIMELINE) {
    if (frame >= turn.startFrame && frame < turn.startFrame + turn.durationFrames) {
      activeSpeaker = turn.speaker;
      activeLine = turn.line;
      break;
    }
  }

  const breathOffset = Math.sin(frame / 25) * 3;

  return (
    <AbsoluteFill>
      {/* === ROOT LEVEL AUDIO === */}
      {TIMELINE.map((turn, i) => (
        <Sequence key={`audio-${i}`} from={turn.startFrame} durationInFrames={turn.durationFrames + 10}>
          <Audio src={staticFile(turn.file)} />
        </Sequence>
      ))}

      {/* === BACKGROUND === */}
      <Img
        src={staticFile("beach_bg.png")}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />

      {/* === GIRL - Static base when NOT speaking, animated video when speaking === */}
      <div
        style={{
          position: "absolute",
          right: -30,
          bottom: 420 + breathOffset * -1,
          width: 700,
          height: 580,
          filter: activeSpeaker === "girl" ? "drop-shadow(0 0 30px rgba(255,200,50,0.95))" : "none",
        }}
      >
        {/* Static idle image as base */}
        <Img
          src={staticFile("girl_idle.png")}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>

      {/* Girl animated video clips overlaid when speaking */}
      {TIMELINE.filter(t => t.speaker === "girl").map((turn, i) => (
        <Sequence key={`girl-video-${i}`} from={turn.startFrame} durationInFrames={turn.durationFrames}>
          <div style={{
            position: "absolute",
            right: -30,
            bottom: 420 + breathOffset * -1,
            width: 700,
            height: 580,
            filter: "drop-shadow(0 0 30px rgba(255,200,50,0.95))",
          }}>
            <OffthreadVideo
              src={staticFile(turn.video)}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
              muted
            />
          </div>
        </Sequence>
      ))}

      {/* === GUY - Static base when NOT speaking, animated video when speaking === */}
      <div
        style={{
          position: "absolute",
          left: -20,
          bottom: 180 + breathOffset,
          width: 650,
          height: 650,
          filter: activeSpeaker === "guy" ? "drop-shadow(0 0 30px rgba(255,200,50,0.95))" : "none",
        }}
      >
        {/* Static idle image as base */}
        <Img
          src={staticFile("guy_idle.png")}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>

      {/* Guy animated video clips overlaid when speaking */}
      {TIMELINE.filter(t => t.speaker === "guy").map((turn, i) => (
        <Sequence key={`guy-video-${i}`} from={turn.startFrame} durationInFrames={turn.durationFrames}>
          <div style={{
            position: "absolute",
            left: -20,
            bottom: 180 + breathOffset,
            width: 650,
            height: 650,
            filter: "drop-shadow(0 0 30px rgba(255,200,50,0.95))",
          }}>
            <OffthreadVideo
              src={staticFile(turn.video)}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
              muted
            />
          </div>
        </Sequence>
      ))}

      {/* === SPEAKER NAME TAG === */}
      {activeSpeaker && (
        <div style={{
          position: "absolute", bottom: 230, left: 40,
          backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12, padding: "8px 18px",
        }}>
          <span style={{
            color: activeSpeaker === "guy" ? "#7ed6df" : "#f8a5c2",
            fontSize: 28, fontFamily: "Arial, sans-serif", fontWeight: 800,
            textTransform: "uppercase", letterSpacing: 2,
          }}>
            {activeSpeaker === "guy" ? "MARCO" : "LUNA"}
          </span>
        </div>
      )}

      {/* === SUBTITLE OVERLAY === */}
      {activeLine && (
        <div style={{
          position: "absolute", bottom: 80, left: 30, right: 30,
          backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 16, padding: "18px 28px",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{
            color: "#ffffff", fontSize: 38, fontFamily: "Georgia, serif",
            fontWeight: 600, textAlign: "center", lineHeight: 1.4,
            textShadow: "0 2px 6px rgba(0,0,0,0.6)",
          }}>
            {activeLine}
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};
