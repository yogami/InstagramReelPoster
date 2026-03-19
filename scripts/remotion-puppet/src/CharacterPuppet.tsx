import React from "react";
import { useCurrentFrame } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";

/**
 * V5 BASELINE — SVG character puppet in 3/4 profile view facing RIGHT.
 * When isFlipped=true (CSS scaleX(-1)), the character faces LEFT.
 * Seated upper body only.
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
          /* ====== MARCO — 3/4 PROFILE facing RIGHT, seated ====== */
          <g id="marco-seated">
            {/* Torso — turned 3/4 right */}
            <g id="body">
              <path
                d="M 100 450 C 100 350, 130 310, 155 300 L 195 295 C 230 300, 280 340, 280 450 Z"
                fill="#2d3436" stroke="#1e272e" strokeWidth="2"
              />
              <line x1="200" y1="310" x2="205" y2="450" stroke="#636e72" strokeWidth="1.5" opacity="0.5" />
              <path d="M 145 305 Q 175 320, 205 300" fill="none" stroke="#636e72" strokeWidth="2" />
              <path
                d="M 250 370 Q 280 380, 300 390"
                fill="none" stroke="#dfe6e9" strokeWidth="16" strokeLinecap="round"
              />
            </g>

            {/* Head — 3/4 profile */}
            <g id="head" transform={`translate(0, ${headBob})`}>
              <rect x="170" y="255" width="35" height="50" rx="5" fill="#dfe6e9" stroke="#b2bec3" strokeWidth="1.5" />
              <ellipse cx="195" cy="170" rx="65" ry="85" fill="#dfe6e9" stroke="#b2bec3" strokeWidth="1.5" />
              {/* Hair */}
              <path
                d="M 130 170 C 130 60, 195 40, 215 45 C 250 50, 265 80, 260 140 C 258 110, 235 75, 200 70 C 170 70, 140 100, 130 170 Z"
                fill="#2d3436"
              />
              {/* Ear */}
              <ellipse cx="258" cy="175" rx="10" ry="16" fill="#dfe6e9" stroke="#b2bec3" strokeWidth="1.5" />

              {/* Right eye (closer, larger) */}
              <ellipse cx="220" cy="160" rx="9" ry="11" fill="white" />
              <circle cx="224" cy="160" r="5" fill="#2d3436" />
              {/* Left eye (further, smaller) */}
              <ellipse cx="170" cy="162" rx="7" ry="9" fill="white" />
              <circle cx="173" cy="162" r="4" fill="#2d3436" />

              {/* Eyebrows */}
              <line x1="210" y1="146" x2="234" y2="148" stroke="#2d3436" strokeWidth="3" strokeLinecap="round" />
              <line x1="160" y1="150" x2="178" y2="148" stroke="#2d3436" strokeWidth="2.5" strokeLinecap="round" />

              {/* Nose */}
              <path d="M 210 170 L 235 195 L 220 200" fill="none" stroke="#b2bec3" strokeWidth="2" strokeLinejoin="round" />

              {/* Stubble */}
              <ellipse cx="210" cy="230" rx="30" ry="12" fill="rgba(45,52,54,0.08)" />

              {/* Mouth */}
              {isTalking ? (
                <ellipse cx="215" cy="225" rx="10" ry="14" fill="#e17055" />
              ) : (
                <path d="M 205 225 Q 215 232, 228 225" fill="none" stroke="#e17055" strokeWidth="2.5" strokeLinecap="round" />
              )}
            </g>
          </g>
        ) : (
          /* ====== LUNA — 3/4 PROFILE facing RIGHT (flipped to face LEFT), seated ====== */
          <g id="luna-seated">
            {/* Torso — purple turtleneck */}
            <g id="body">
              <path
                d="M 110 450 C 110 355, 135 315, 158 305 L 192 300 C 225 305, 270 345, 270 450 Z"
                fill="#6c5ce7" stroke="#5f27cd" strokeWidth="2"
              />
              <path d="M 150 310 Q 175 325, 200 308" fill="#a29bfe" stroke="#6c5ce7" strokeWidth="2" />
              <path
                d="M 240 370 Q 270 380, 290 385"
                fill="none" stroke="#ffeaa7" strokeWidth="14" strokeLinecap="round"
              />
            </g>

            {/* Head */}
            <g id="head" transform={`translate(0, ${headBob})`}>
              <rect x="170" y="258" width="32" height="46" rx="5" fill="#ffeaa7" stroke="#fdcb6e" strokeWidth="1.5" />
              <ellipse cx="193" cy="172" rx="60" ry="82" fill="#ffeaa7" stroke="#fdcb6e" strokeWidth="1.5" />
              {/* Hair */}
              <path
                d="M 133 175 C 133 65, 190 42, 210 48 C 245 55, 258 85, 255 145 C 253 115, 232 78, 198 73 C 168 73, 142 105, 133 175 Z"
                fill="#e17055" stroke="#d63031" strokeWidth="1.5"
              />
              <path d="M 255 145 C 260 220, 270 330, 275 420" fill="none" stroke="#e17055" strokeWidth="22" strokeLinecap="round" />
              <path d="M 133 175 C 125 250, 115 350, 110 430" fill="none" stroke="#e17055" strokeWidth="20" strokeLinecap="round" />
              <path d="M 143 135 C 155 90, 185 70, 210 68 C 235 76, 250 100, 253 130" fill="#e17055" stroke="#d63031" strokeWidth="1.5" />

              {/* Ear + earring */}
              <ellipse cx="253" cy="178" rx="9" ry="14" fill="#ffeaa7" stroke="#fdcb6e" strokeWidth="1.5" />
              <circle cx="253" cy="196" r="3" fill="#fd79a8" />

              {/* Right eye (closer, larger) */}
              <ellipse cx="218" cy="162" rx="10" ry="12" fill="white" />
              <circle cx="222" cy="162" r="5" fill="#0984e3" />
              <circle cx="224" cy="160" r="1.5" fill="white" />
              {/* Left eye (further, smaller) */}
              <ellipse cx="168" cy="164" rx="7" ry="10" fill="white" />
              <circle cx="171" cy="164" r="4" fill="#0984e3" />
              <circle cx="173" cy="162" r="1" fill="white" />

              {/* Eyelashes */}
              <path d="M 207 152 L 204 146" stroke="#2d3436" strokeWidth="1.5" />
              <path d="M 213 150 L 211 144" stroke="#2d3436" strokeWidth="1.5" />
              <path d="M 160 155 L 158 150" stroke="#2d3436" strokeWidth="1.2" />

              {/* Eyebrows */}
              <path d="M 208 148 Q 218 140, 232 145" fill="none" stroke="#6d4c41" strokeWidth="2" strokeLinecap="round" />
              <path d="M 160 152 Q 168 146, 176 150" fill="none" stroke="#6d4c41" strokeWidth="1.5" strokeLinecap="round" />

              {/* Nose */}
              <path d="M 208 172 L 228 195 L 215 198" fill="none" stroke="#fdcb6e" strokeWidth="1.8" strokeLinejoin="round" />

              {/* Blush */}
              <ellipse cx="235" cy="195" rx="12" ry="7" fill="rgba(253,121,168,0.15)" />
              <ellipse cx="160" cy="197" rx="10" ry="6" fill="rgba(253,121,168,0.12)" />

              {/* Mouth */}
              {isTalking ? (
                <ellipse cx="213" cy="222" rx="9" ry="13" fill="#fd79a8" />
              ) : (
                <path d="M 203 222 Q 213 228, 224 222" fill="none" stroke="#fd79a8" strokeWidth="2" strokeLinecap="round" />
              )}
            </g>
          </g>
        )}
      </svg>
    </div>
  );
};
