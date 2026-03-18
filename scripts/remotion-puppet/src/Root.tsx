import { Composition } from "remotion";
import { BeachScene } from "./BeachScene";
import { PuppetDialogueScene } from "./PuppetDialogueScene";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="BeachScene"
        component={BeachScene}
        durationInFrames={620}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="PuppetDialogue"
        component={PuppetDialogueScene as any}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          timeline: [] as any[],
          backgroundUrl: "",
        }}
        calculateMetadata={({ props }: { props: any }) => {
          if (props.timeline && props.timeline.length > 0) {
            const lastTurn = props.timeline[props.timeline.length - 1];
            const totalFrames = lastTurn.startFrame + lastTurn.durationFrames + 30;
            return { durationInFrames: totalFrames };
          }
          return { durationInFrames: 900 };
        }}
      />
    </>
  );
};

