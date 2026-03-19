import React from "react";
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, staticFile } from "remotion";
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
}

export const PuppetDialogueScene: React.FC<PuppetDialogueProps> = ({
  timeline,
}) => {
  const frame = useCurrentFrame();

  let activeSpeaker: string | null = null;
  let activeLine: string | null = null;
  for (const turn of timeline) {
    if (frame >= turn.startFrame && frame < turn.startFrame + turn.durationFrames) {
      activeSpeaker = turn.speaker;
      activeLine = turn.line;
      break;
    }
  }

  const marcoTurns = timeline.filter((t) => t.speaker === "marco");
  const lunaTurns = timeline.filter((t) => t.speaker === "luna");

  return (
    <AbsoluteFill>
      {/* === ROOT LEVEL AUDIO === */}
      {timeline.map((turn, i) => (
        <Sequence key={`audio-${i}`} from={turn.startFrame} durationInFrames={turn.durationFrames + 10}>
          <Audio src={staticFile(turn.audioFile)} />
        </Sequence>
      ))}

      {/* === WHITE BACKGROUND === */}
      <div style={{ width: "100%", height: "100%", background: "#ffffff" }} />

      {/* === THIN DIVIDER LINE (table/separation between characters) === */}
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <line x1="540" y1="900" x2="540" y2="1350" stroke="#1a1a1a" strokeWidth="1.5" opacity="0.2" />
      </svg>

      {/* === MARCO (left side) === */}
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

      {/* === LUNA (right side, facing left) === */}
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

      {/* === SPEAKER NAME TAG === */}
      {activeSpeaker && (
        <div style={{
          position: "absolute", bottom: 260, left: 0, right: 0,
          display: "flex", justifyContent: "center",
        }}>
          <div style={{
            border: "1.5px solid #1a1a1a",
            borderRadius: 20, padding: "6px 24px",
            backgroundColor: "#ffffff",
          }}>
            <span style={{
              color: "#1a1a1a",
              fontSize: 24, fontFamily: "Georgia, serif", fontWeight: 700,
              textTransform: "uppercase" as const, letterSpacing: 4,
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
          borderTop: "1px solid #1a1a1a",
          padding: "20px 24px",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{
            color: "#1a1a1a", fontSize: 32, fontFamily: "Georgia, serif",
            fontWeight: 400, textAlign: "center" as const, lineHeight: 1.4,
            fontStyle: "italic",
          }}>
            {activeLine}
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};
