import React from "react";
import { useCurrentFrame } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";

/**
 * V6 — Clean black sketch puppet on white background.
 * Minimalist line art, no color fills. Just black strokes.
 */
export const CharacterPuppet: React.FC<{
  baseX: number;
  baseY: number;
  isFlipped?: boolean;
  audioSrc: string;
  audioStartFrame: number;
  character?: "marco" | "luna";
}> = ({ baseX, baseY, isFlipped = false, audioSrc, audioStartFrame, character = "marco" }) => {
  const frame = useCurrentFrame();

  const audioData = useAudioData(audioSrc);
  let isTalking = false;
  if (audioData) {
    const audioFrame = frame - audioStartFrame;
    if (audioFrame >= 0) {
      const visualization = visualizeAudio({ fps: 30, frame: audioFrame, audioData, numberOfSamples: 16 });
      const avg = visualization.reduce((a, b) => a + b, 0) / visualization.length;
      if (avg > 0.05) isTalking = true;
    }
  }

  const breathY = Math.sin(frame / 18) * 1.5;
  const headBob = isTalking ? Math.sin(frame / 3) * 1.5 : 0;
  const isMale = character === "marco";

  // Shared style constants
  const LINE = "#1a1a1a";
  const THIN = 1.5;
  const MED = 2;
  const THICK = 2.5;

  return (
    <div
      style={{
        position: "absolute",
        left: baseX,
        bottom: baseY,
        transform: `scaleX(${isFlipped ? -1 : 1})`,
        width: 350,
        height: 450,
      }}
    >
      <svg
        viewBox="0 0 350 450"
        style={{
          width: "100%",
          height: "100%",
          transform: `translateY(${breathY}px)`,
        }}
      >
        {isMale ? (
          /* ====== MARCO — black line sketch, 3/4 profile ====== */
          <g id="marco-sketch">
            {/* Torso outline */}
            <path
              d="M 100 450 C 100 350, 130 310, 155 300 L 195 295 C 230 300, 280 340, 280 450 Z"
              fill="none" stroke={LINE} strokeWidth={MED}
            />
            {/* Shirt detail line */}
            <path d="M 145 305 Q 175 320, 205 300" fill="none" stroke={LINE} strokeWidth={THIN} />
            {/* Arm */}
            <path
              d="M 250 370 Q 280 380, 300 390"
              fill="none" stroke={LINE} strokeWidth={MED} strokeLinecap="round"
            />

            {/* Head */}
            <g id="head" transform={`translate(0, ${headBob})`}>
              {/* Neck */}
              <rect x="170" y="255" width="35" height="50" rx="5" fill="none" stroke={LINE} strokeWidth={THIN} />
              {/* Head shape */}
              <ellipse cx="195" cy="170" rx="65" ry="85" fill="white" stroke={LINE} strokeWidth={MED} />
              {/* Hair */}
              <path
                d="M 130 170 C 130 60, 195 40, 215 45 C 250 50, 265 80, 260 140 C 258 110, 235 75, 200 70 C 170 70, 140 100, 130 170 Z"
                fill={LINE} stroke={LINE} strokeWidth={THIN}
              />
              {/* Ear */}
              <ellipse cx="258" cy="175" rx="10" ry="16" fill="none" stroke={LINE} strokeWidth={THIN} />

              {/* Eyes — simple dots */}
              <circle cx="220" cy="160" r="4" fill={LINE} />
              <circle cx="170" cy="162" r="3" fill={LINE} />

              {/* Eyebrows */}
              <line x1="210" y1="148" x2="232" y2="150" stroke={LINE} strokeWidth={THICK} strokeLinecap="round" />
              <line x1="162" y1="152" x2="178" y2="150" stroke={LINE} strokeWidth={MED} strokeLinecap="round" />

              {/* Nose */}
              <path d="M 210 170 L 230 195 L 218 198" fill="none" stroke={LINE} strokeWidth={THIN} strokeLinejoin="round" />

              {/* Stubble dots */}
              <circle cx="200" cy="230" r="1" fill={LINE} opacity="0.3" />
              <circle cx="210" cy="235" r="1" fill={LINE} opacity="0.3" />
              <circle cx="220" cy="232" r="1" fill={LINE} opacity="0.3" />
              <circle cx="205" cy="238" r="1" fill={LINE} opacity="0.3" />
              <circle cx="215" cy="240" r="1" fill={LINE} opacity="0.3" />

              {/* Mouth */}
              {isTalking ? (
                <ellipse cx="215" cy="225" rx="8" ry="11" fill="none" stroke={LINE} strokeWidth={MED} />
              ) : (
                <path d="M 205 225 Q 215 230, 228 225" fill="none" stroke={LINE} strokeWidth={MED} strokeLinecap="round" />
              )}
            </g>
          </g>
        ) : (
          /* ====== LUNA — black line sketch, 3/4 profile ====== */
          <g id="luna-sketch">
            {/* Torso outline */}
            <path
              d="M 110 450 C 110 355, 135 315, 158 305 L 192 300 C 225 305, 270 345, 270 450 Z"
              fill="none" stroke={LINE} strokeWidth={MED}
            />
            {/* Neckline detail */}
            <path d="M 150 310 Q 175 325, 200 308" fill="none" stroke={LINE} strokeWidth={THIN} />
            {/* Arm */}
            <path
              d="M 240 370 Q 270 380, 290 385"
              fill="none" stroke={LINE} strokeWidth={MED} strokeLinecap="round"
            />

            {/* Head */}
            <g id="head" transform={`translate(0, ${headBob})`}>
              {/* Neck */}
              <rect x="170" y="258" width="32" height="46" rx="5" fill="none" stroke={LINE} strokeWidth={THIN} />
              {/* Head shape */}
              <ellipse cx="193" cy="172" rx="60" ry="82" fill="white" stroke={LINE} strokeWidth={MED} />
              {/* Hair — flowing lines */}
              <path
                d="M 133 175 C 133 65, 190 42, 210 48 C 245 55, 258 85, 255 145 C 253 115, 232 78, 198 73 C 168 73, 142 105, 133 175 Z"
                fill={LINE} stroke={LINE} strokeWidth={THIN}
              />
              {/* Long hair strands */}
              <path d="M 255 145 C 260 220, 270 330, 275 420" fill="none" stroke={LINE} strokeWidth="8" strokeLinecap="round" />
              <path d="M 133 175 C 125 250, 115 350, 110 430" fill="none" stroke={LINE} strokeWidth="7" strokeLinecap="round" />
              {/* Hair top */}
              <path d="M 143 135 C 155 90, 185 70, 210 68 C 235 76, 250 100, 253 130" fill={LINE} stroke={LINE} strokeWidth={THIN} />

              {/* Ear */}
              <ellipse cx="253" cy="178" rx="9" ry="14" fill="none" stroke={LINE} strokeWidth={THIN} />
              {/* Earring — small circle */}
              <circle cx="253" cy="196" r="3" fill="none" stroke={LINE} strokeWidth={THIN} />

              {/* Eyes — slightly larger with lash lines */}
              <circle cx="220" cy="162" r="4.5" fill={LINE} />
              <circle cx="170" cy="164" r="3.5" fill={LINE} />

              {/* Eyelashes */}
              <path d="M 207 153 L 204 147" stroke={LINE} strokeWidth={THIN} />
              <path d="M 213 151 L 211 145" stroke={LINE} strokeWidth={THIN} />
              <path d="M 160 156 L 158 151" stroke={LINE} strokeWidth="1.2" />

              {/* Eyebrows — arched */}
              <path d="M 208 149 Q 218 141, 232 146" fill="none" stroke={LINE} strokeWidth={MED} strokeLinecap="round" />
              <path d="M 160 153 Q 168 147, 176 151" fill="none" stroke={LINE} strokeWidth={THIN} strokeLinecap="round" />

              {/* Nose */}
              <path d="M 208 172 L 225 195 L 215 198" fill="none" stroke={LINE} strokeWidth={THIN} strokeLinejoin="round" />

              {/* Mouth */}
              {isTalking ? (
                <ellipse cx="213" cy="222" rx="7" ry="10" fill="none" stroke={LINE} strokeWidth={MED} />
              ) : (
                <path d="M 203 222 Q 213 228, 224 222" fill="none" stroke={LINE} strokeWidth={MED} strokeLinecap="round" />
              )}
            </g>
          </g>
        )}
      </svg>
    </div>
  );
};
