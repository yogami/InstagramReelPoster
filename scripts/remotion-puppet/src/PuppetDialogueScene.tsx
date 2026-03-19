import React from "react";
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, staticFile, Img } from "remotion";
import { CharacterPuppet } from "./CharacterPuppet";

interface DialogueTurn {
  speaker: "marco" | "luna";
  line: string;
  audioFile: string;
  startFrame: number;
  durationFrames: number;
}

interface PortraitFiles {
  marco_open: string;
  marco_closed: string;
  luna_open: string;
  luna_closed: string;
}

interface PuppetDialogueProps {
  timeline: DialogueTurn[];
  backgroundUrl: string;
  characterMode?: "flux-portraits" | "svg";
  portraits?: PortraitFiles;
}

export const PuppetDialogueScene: React.FC<PuppetDialogueProps> = ({
  timeline,
  backgroundUrl,
  characterMode,
  portraits,
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

  const usePortraits = characterMode === "flux-portraits" && portraits;

  return (
    <AbsoluteFill>
      {/* === ROOT LEVEL AUDIO === */}
      {timeline.map((turn, i) => (
        <Sequence key={`audio-${i}`} from={turn.startFrame} durationInFrames={turn.durationFrames + 10}>
          <Audio src={staticFile(turn.audioFile)} />
        </Sequence>
      ))}

      {/* === BACKGROUND === */}
      {backgroundUrl ? (
        <Img
          src={staticFile(backgroundUrl)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        <div style={{
          width: "100%", height: "100%",
          background: "linear-gradient(180deg, #2d2820 0%, #3d3530 60%, #3d3427 100%)",
        }} />
      )}

      {/* === Dark overlay for character contrast === */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.7) 100%)",
      }} />

      {/* === MARCO (left side) === */}
      {marcoTurns.map((turn, i) => (
        <Sequence key={`marco-puppet-${i}`} from={turn.startFrame} durationInFrames={turn.durationFrames}>
          <CharacterPuppet
            baseX={20}
            baseY={usePortraits ? 700 : 770}
            isFlipped={false}
            audioSrc={staticFile(turn.audioFile)}
            audioStartFrame={0}
            character="marco"
            portraitOpen={usePortraits ? portraits.marco_open : undefined}
            portraitClosed={usePortraits ? portraits.marco_closed : undefined}
          />
        </Sequence>
      ))}
      {/* Marco idle */}
      <div style={{
        position: "absolute", left: 20, bottom: usePortraits ? 700 : 770,
        width: usePortraits ? 400 : 350, height: usePortraits ? 500 : 450,
        opacity: activeSpeaker === "marco" ? 0 : 1,
      }}>
        <CharacterPuppet
          baseX={0} baseY={0} isFlipped={false}
          audioSrc={marcoTurns[0]?.audioFile ? staticFile(marcoTurns[0].audioFile) : ""}
          audioStartFrame={99999}
          character="marco"
          portraitOpen={usePortraits ? portraits.marco_open : undefined}
          portraitClosed={usePortraits ? portraits.marco_closed : undefined}
        />
      </div>

      {/* === LUNA (right side) === */}
      {lunaTurns.map((turn, i) => (
        <Sequence key={`luna-puppet-${i}`} from={turn.startFrame} durationInFrames={turn.durationFrames}>
          <CharacterPuppet
            baseX={usePortraits ? 660 : 680}
            baseY={usePortraits ? 700 : 770}
            isFlipped={false}
            audioSrc={staticFile(turn.audioFile)}
            audioStartFrame={0}
            character="luna"
            portraitOpen={usePortraits ? portraits.luna_open : undefined}
            portraitClosed={usePortraits ? portraits.luna_closed : undefined}
          />
        </Sequence>
      ))}
      {/* Luna idle */}
      <div style={{
        position: "absolute", left: usePortraits ? 660 : 680, bottom: usePortraits ? 700 : 770,
        width: usePortraits ? 400 : 350, height: usePortraits ? 500 : 450,
        opacity: activeSpeaker === "luna" ? 0 : 1,
      }}>
        <CharacterPuppet
          baseX={0} baseY={0} isFlipped={false}
          audioSrc={lunaTurns[0]?.audioFile ? staticFile(lunaTurns[0].audioFile) : ""}
          audioStartFrame={99999}
          character="luna"
          portraitOpen={usePortraits ? portraits.luna_open : undefined}
          portraitClosed={usePortraits ? portraits.luna_closed : undefined}
        />
      </div>

      {/* === SPEAKER HIGHLIGHT === */}
      {activeSpeaker === "marco" && (
        <div style={{
          position: "absolute", left: 20, bottom: usePortraits ? 700 : 770,
          width: usePortraits ? 400 : 350, height: usePortraits ? 500 : 450,
          background: "radial-gradient(circle at 50% 30%, rgba(126,214,223,0.15) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
      )}
      {activeSpeaker === "luna" && (
        <div style={{
          position: "absolute", left: usePortraits ? 660 : 680, bottom: usePortraits ? 700 : 770,
          width: usePortraits ? 400 : 350, height: usePortraits ? 500 : 450,
          background: "radial-gradient(circle at 50% 30%, rgba(248,165,194,0.15) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
      )}

      {/* === SPEAKER NAME TAG === */}
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
