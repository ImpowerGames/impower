import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { CloseIcon, DetourIcon, ErrorIcon, WarningIcon } from "../icon/icons.generated";
import PreviewStrip, {
  type PreviewStripHeight,
  type PreviewStripProps,
  type PreviewStripStatus,
} from "./PreviewStrip";

const THEMES = ["charcoal", "chalk"] as const;

const HEIGHTS: Record<Exclude<PreviewStripHeight, "fit">, string> = {
  regular: "104px",
  short: "91px",
};

const noop = () => {};

const problem: PreviewStripStatus = {
  key: "problem",
  tone: "error",
  icon: <ErrorIcon />,
  text: "There is no character called INSPECTER in this story, did you mean INSPECTOR?",
  onPress: noop,
};

const warning: PreviewStripStatus = {
  key: "problem",
  tone: "warning",
  icon: <WarningIcon />,
  text: "This sound is not in Assets yet",
  onPress: noop,
};

const forced: PreviewStripStatus = {
  key: "forced",
  tone: "warning",
  icon: <DetourIcon />,
  text: "Forced to reach this line",
  onPress: noop,
};

function Stage({ speaker, line }: { speaker?: string; line: string }) {
  return (
    <div class="flex h-full w-full flex-col items-center justify-end gap-3 bg-stage px-10 pb-16 text-center text-[30px]/[1.4] text-white">
      {speaker ? <b class="text-[34px] text-warning">{speaker}</b> : null}
      <span>{line}</span>
    </div>
  );
}

const STATES: { name: string; props: PreviewStripProps }[] = [
  {
    name: "Dialogue",
    props: {
      label: "IMANI",
      words: "Summer project, day one. We need a mystery, and we need it by lunch.",
      picture: <Stage speaker="IMANI" line="Summer project, day one." />,
    },
  },
  {
    name: "Choice",
    props: {
      label: "CHOOSE",
      words: "Where were you at nine?",
      picture: <Stage line="Where were you at nine?" />,
    },
  },
  {
    name: "Problem",
    props: {
      label: "INSPECTER",
      words: "Where were you at nine?",
      statuses: [problem],
      picture: <Stage speaker="INSPECTER" line="Where were you at nine?" />,
    },
  },
  {
    name: "Warning",
    props: {
      label: "ACTION",
      words: "The front door bangs open.",
      statuses: [warning],
      picture: <Stage line="The front door bangs open." />,
    },
  },
  {
    name: "Forced route",
    props: {
      label: "ACTION",
      words: "You found 4 clues.",
      statuses: [forced],
      picture: <Stage line="You found 4 clues." />,
    },
  },
  {
    name: "Problem and forced route",
    props: {
      label: "ACTION",
      words: "You found 4 clues, and every one of them points back to the jukebox.",
      statuses: [problem, forced],
      picture: <Stage line="You found 4 clues." />,
    },
  },
  {
    name: "Setup",
    props: {
      label: "STORY SETUP",
      words: "This line sets up your story.",
      symbol: "file",
      playDisabled: true,
    },
  },
  {
    name: "Empty",
    props: {
      label: "YOUR GAME",
      words: "Write a line and it appears here.",
      symbol: "pencil",
      playDisabled: true,
    },
  },
];

function Expandable() {
  const [expanded, setExpanded] = useState(false);
  return (
    <PreviewStrip
      height="regular"
      label="ACTION"
      words="Play expands this picture to the full view; Escape or the X brings it back."
      expanded={expanded}
      onPlay={() => setExpanded(true)}
      onCollapse={() => setExpanded(false)}
      picture={
        <div class="relative flex h-full w-full flex-col">
          <Stage line="The full view" />
          <button
            type="button"
            aria-label="Close the preview"
            class="absolute right-3 bottom-3 flex size-11 items-center justify-center text-muted"
            onClick={() => setExpanded(false)}
          >
            <CloseIcon />
          </button>
        </div>
      }
    />
  );
}

function PreviewStripDemo() {
  return (
    <div class="space-y-6">
      {THEMES.map((theme) => (
        <div key={theme} data-theme={theme} class="space-y-4 rounded-card bg-bg p-4 text-ink">
          {(Object.keys(HEIGHTS) as (keyof typeof HEIGHTS)[]).map((height) =>
            STATES.map(({ name, props }) => (
              <GalleryRow key={`${height}-${name}`} label={`${name}, ${HEIGHTS[height]}, ${theme}`}>
                <div class="max-w-[430px]">
                  <PreviewStrip height={height} onPlay={noop} {...props} />
                </div>
              </GalleryRow>
            )),
          )}
          <GalleryRow label={`Narrow (380px and below), ${theme}`}>
            <div class="max-w-[360px]">
              <PreviewStrip height="regular" onPlay={noop} {...STATES[0]!.props} />
            </div>
          </GalleryRow>
        </div>
      ))}
      <GalleryRow label="Press Play to expand the picture to the full view">
        <div class="max-w-[430px]">
          <Expandable />
        </div>
      </GalleryRow>
    </div>
  );
}

export const previewStripGallery: GalleryEntry = {
  title: "Preview strip",
  exports: ["PreviewStrip", "previewStripVariants", "previewStripStatusVariants"],
  Demo: PreviewStripDemo,
};
