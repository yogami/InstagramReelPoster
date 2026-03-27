import React from "react";
import {
    AbsoluteFill,
    Audio,
    Img,
    Sequence,
    useCurrentFrame,
    useVideoConfig,
    interpolate,
} from "remotion";

export type SegmentData = {
    image: string;
    durationSec: number;
    zoomEffect?: "slow_zoom_in" | "slow_zoom_out" | "ken_burns_left" | "ken_burns_right" | "static" | string;
};

export type CaptionData = {
    startSeconds: number;
    endSeconds: number;
    text: string;
};

export type DynamicReelProps = {
    fps: number;
    audioVolume: number;
    musicVolume: number;
    voiceover: string;
    music: string;
    segments: SegmentData[];
    captions: CaptionData[];
};

const KenBurnsImage: React.FC<{
    src: string;
    durationFrames: number;
    effect?: string;
}> = ({ src, durationFrames, effect }) => {
    const frame = useCurrentFrame();
    const progress = frame / Math.max(durationFrames, 1);

    // Default to a subtle zoom in
    let zoomStart = 1.0;
    let zoomEnd = 1.05;
    let panXStart = 0;
    let panXEnd = 0;
    let panYStart = 0;
    let panYEnd = 0;

    switch (effect) {
        case "slow_zoom_in":
            zoomStart = 1.0; zoomEnd = 1.08;
            break;
        case "slow_zoom_out":
            zoomStart = 1.08; zoomEnd = 1.0;
            break;
        case "ken_burns_left":
            zoomStart = 1.05; zoomEnd = 1.05;
            panXStart = 20; panXEnd = -20;
            break;
        case "ken_burns_right":
            zoomStart = 1.05; zoomEnd = 1.05;
            panXStart = -20; panXEnd = 20;
            break;
        case "static":
            zoomStart = 1.0; zoomEnd = 1.0;
            break;
    }

    const scale = interpolate(progress, [0, 1], [zoomStart, zoomEnd]);
    const panX = interpolate(progress, [0, 1], [panXStart, panXEnd]);
    const panY = interpolate(progress, [0, 1], [panYStart, panYEnd]);

    return (
        <AbsoluteFill>
            <Img
                src={src}
                style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: `scale(${scale}) translate(${panX}px, ${panY}px)`,
                }}
            />
        </AbsoluteFill>
    );
};

const GlotticCaptions: React.FC<{ captions: CaptionData[] }> = ({ captions }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    return (
        <AbsoluteFill>
            {captions.map((cap, i) => {
                const startFrame = Math.round(cap.startSeconds * fps);
                const endFrame = Math.round(cap.endSeconds * fps);

                // Only render if currently active
                if (frame < startFrame || frame > endFrame) return null;

                const words = cap.text.split(" ").filter(w => w.trim().length > 0);
                const durationFrames = endFrame - startFrame;
                const framesPerWord = durationFrames / Math.max(words.length, 1);

                // Relative frame within this caption's lifetime
                const localFrame = frame - startFrame;

                return (
                    <div
                        key={i}
                        style={{
                            position: "absolute",
                            bottom: 150,
                            left: 80,
                            right: 80,
                            textAlign: "center",
                            display: "flex",
                            flexWrap: "wrap",
                            justifyContent: "center",
                            gap: "8px",
                            padding: "20px",
                            background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
                            borderRadius: "16px",
                        }}
                    >
                        {words.map((word, j) => {
                            const wordStart = j * framesPerWord;
                            // Word lights up golden as it's spoken
                            const isActive = localFrame >= wordStart && localFrame < wordStart + framesPerWord;

                            // Pop effect on word start
                            const scale = interpolate(localFrame, [wordStart, wordStart + 3], [0.9, 1], {
                                extrapolateLeft: "clamp",
                                extrapolateRight: "clamp",
                            });

                            return (
                                <span
                                    key={j}
                                    style={{
                                        fontSize: 42,
                                        fontWeight: 800,
                                        fontFamily: "'Inter', sans-serif",
                                        color: isActive ? "#FFD700" : "#FFFFFF",
                                        textShadow: "0 4px 12px rgba(0,0,0,0.9), 0 0 24px rgba(0,0,0,0.6)",
                                        transform: `scale(${scale})`,
                                        transition: "color 0.1s ease",
                                    }}
                                >
                                    {word}
                                </span>
                            );
                        })}
                    </div>
                );
            })}
        </AbsoluteFill>
    );
};

export const DynamicReel: React.FC<DynamicReelProps> = ({
    fps = 30,
    audioVolume = 1.0,
    musicVolume = 0.35,
    voiceover = "",
    music = "",
    segments = [],
    captions = []
}) => {

    let cursor = 0;
    const mappedSegments = segments.map((segment, i) => {
        const durationFrames = Math.ceil(segment.durationSec * fps);
        const result = {
            segment,
            startFrame: cursor,
            durationFrames,
            index: i,
        };
        cursor += durationFrames;
        return result;
    });

    const totalDurationFrames = cursor;

    return (
        <AbsoluteFill style={{ backgroundColor: "#000" }}>
            {/* Global Music Track */}
            {music && music !== "" && (
                <Audio src={music} volume={musicVolume} loop />
            )}

            {/* Global Voiceover Track */}
            {voiceover && voiceover !== "" && (
                <Audio src={voiceover} volume={audioVolume} />
            )}

            {/* Visual Segments */}
            {mappedSegments.map(({ segment, startFrame, durationFrames, index }) => (
                <Sequence
                    key={index}
                    from={startFrame}
                    durationInFrames={Math.max(1, durationFrames)}
                >
                    {segment.image && (
                        <KenBurnsImage
                            src={segment.image}
                            durationFrames={durationFrames}
                            effect={segment.zoomEffect}
                        />
                    )}
                </Sequence>
            ))}

            {/* Global Text Overlay mapped to SRT timestamps */}
            {captions && captions.length > 0 && (
                <GlotticCaptions captions={captions} />
            )}

            {/* Cinematic Overlay */}
            <AbsoluteFill
                style={{
                    background:
                        "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)",
                    pointerEvents: "none",
                }}
            />
        </AbsoluteFill>
    );
};
