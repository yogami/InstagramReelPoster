import { Composition, getInputProps } from "remotion";
import { DynamicReel, DynamicReelProps } from "./DynamicReel";

const inputProps = getInputProps() as DynamicReelProps;

// Provide a sensible default for Remotion Studio preview
const defaultProps: DynamicReelProps = {
    fps: 30,
    audioVolume: 1.0,
    musicVolume: 0.35,
    voiceover: "https://actions.google.com/sounds/v1/water/waves_crashing_on_rock_beach.ogg",
    music: "https://actions.google.com/sounds/v1/alarms/spaceship_alarm.ogg",
    captions: [
        { startSeconds: 0, endSeconds: 2, text: "Welcome to" },
        { startSeconds: 2, endSeconds: 5, text: "Dynamic Reel Generator" }
    ],
    segments: [
        {
            image: "https://raw.githubusercontent.com/remotion-dev/logo/main/animated-logo-white.png",
            durationSec: 5,
            zoomEffect: "slow_zoom_in"
        }
    ]
};

const finalProps = inputProps.segments && inputProps.segments.length > 0 ? inputProps : defaultProps;

const fps = finalProps.fps || 30;

const totalFrames = finalProps.segments.reduce((acc, segment) => {
    return acc + Math.ceil(segment.durationSec * fps);
}, 0);

export const RemotionRoot: React.FC = () => {
    return (
        <Composition
            id="DynamicReel"
            component={DynamicReel}
            durationInFrames={Math.max(1, totalFrames)}
            fps={fps}
            width={1080}
            height={1920}
            defaultProps={finalProps}
        />
    );
};
