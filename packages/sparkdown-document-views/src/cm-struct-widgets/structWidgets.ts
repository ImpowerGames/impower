import {
  Facet,
  Range,
  StateEffect,
  StateField,
  Transaction,
  TransactionSpec,
  combineConfig,
} from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { SparkDOMAudioPlayer } from "../../../spark-dom/src/classes/SparkDOMAudioPlayer";
import type { AudioGroup } from "../../../spark-engine/src";
import { SparkStruct } from "../../../sparkdown/src/index";
import { FileSystemReader } from "../cm-language-client/types/FileSystemReader";
import StructPlayWidgetType from "./classes/StructPlayWidgetType";
import { PreviewConfig } from "./types/PreviewConfig";
import { WaveformConfig } from "./types/WaveformConfig";
import { getAudioBuffer } from "./utils/getAudioBuffer";

interface StructWidgetContext {
  audioContext: AudioContext;
  audioPlayers: SparkDOMAudioPlayer[];
  audioPlayingButton?: HTMLElement | null;
}

const STRUCT_WIDGET_CONTEXT: StructWidgetContext = {
  audioContext: new AudioContext(),
  audioPlayers: [],
  audioPlayingButton: undefined,
};

const playAudioGroupStruct = async (
  struct: SparkStruct,
  fileSystemReader: FileSystemReader,
  button: HTMLElement,
  offset?: number,
  duration?: number
) => {
  // TODO: Retain play button state even on editor teardown.
  const context = STRUCT_WIDGET_CONTEXT;
  const audioGroup = struct.compiled as AudioGroup;
  const toggleOffAudio = context.audioPlayingButton === button;
  if (context.audioPlayingButton && context.audioPlayingButton !== button) {
    context.audioPlayingButton.innerHTML = PlayButtonIcon;
  }
  context.audioPlayingButton = button;
  button.innerHTML = LoadingButtonIcon;
  await Promise.all(context.audioPlayers.map((p) => p.stopAsync(0)));
  if (context.audioPlayingButton === button) {
    context.audioPlayers.length = 0;
    if (toggleOffAudio) {
      button.innerHTML = PlayButtonIcon;
      context.audioPlayingButton = undefined;
    } else {
      const players = await Promise.all(
        audioGroup?.assets?.map(async (a) => {
          const url = await fileSystemReader.url(a.src);
          const buffer = url
            ? await getAudioBuffer(url, context.audioContext)
            : new Float32Array(0);
          const player = new SparkDOMAudioPlayer(buffer, context.audioContext, {
            loop: audioGroup.loop,
            volume: audioGroup.volume,
            cues: audioGroup.cues,
          });
          return player;
        })
      );
      if (context.audioPlayingButton === button) {
        const currentTime = context.audioContext.currentTime + 0.025;
        players.forEach((player) => {
          player.start(currentTime, 0, offset, duration);
          context.audioPlayers.push(player);
        });
        button.innerHTML = StopButtonIcon;
      }
    }
  }
};

const PlayButtonIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d='M 5.7 4.8 C 5.8 3.8 6.8 3.2 7.7 3.6 C 8.8 4 11.2 5.1 14.2 6.9 C 17.2 8.6 19.3 10.1 20.2 10.8 C 21 11.4 21 12.6 20.2 13.2 C 19.3 13.9 17.2 15.4 14.2 17.1 C 11.1 18.9 8.8 20 7.7 20.4 C 6.8 20.8 5.8 20.2 5.7 19.2 C 5.5 18.1 5.3 15.5 5.3 12 C 5.3 8.5 5.5 5.9 5.7 4.8 Z'></path></svg>`;

const LoadingButtonIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg>`;

const StopButtonIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d='M 4 6 C 4 4.9 4.9 4 6 4 L 18 4 C 19.1 4 20 4.9 20 6 L 20 18 C 20 19.1 19.1 20 18 20 L 6 20 C 4.9 20 4 19.1 4 18 L 4 6 Z'></path></svg>`;

const clearStructDecorationsEffect = StateEffect.define<{}>();

const addStructDecorationEffect = StateEffect.define<{
  struct: SparkStruct;
  from: number;
  to: number;
}>({
  map: ({ struct, from, to }, change) => ({
    struct,
    from: change.mapPos(from),
    to: change.mapPos(to),
  }),
});

export interface StructWidgetsConfiguration {
  fileSystemReader?: FileSystemReader;
  waveformSettings?: WaveformConfig;
  previewSettings?: PreviewConfig;
}

const structWidgetsConfig = Facet.define<
  StructWidgetsConfiguration,
  Required<StructWidgetsConfiguration>
>({
  combine(configs) {
    return combineConfig(configs, {
      fileSystemReader: {
        scheme: "",
        url: (uri: string) => {
          return uri;
        },
      },
      waveformSettings: {
        width: 200,
        height: 64,
        xAxisColor: "#ffffff",
        frequencyFillColor: "#5a3663CC",
        volumeFillColor: "#4090bf26",
        referenceColor: "#d92662",
        waveColor: "#42a0d7",
        maxZoomOffset: 1000,
        maxScale: 10,
      },
      previewSettings: {
        tapColor: "#00000040",
        hoverColor: "#00000026",
        sliderBackgroundColor: "#00000040",
        sliderFillColor: "#2B83B7",
      },
    });
  },
});

const structDecorationsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations: DecorationSet, tr: Transaction) {
    const config = tr.state.facet(structWidgetsConfig);
    decorations = decorations.map(tr.changes);
    for (let e of tr.effects) {
      if (e.is(clearStructDecorationsEffect)) {
        decorations = Decoration.none;
      }
      if (e.is(addStructDecorationEffect)) {
        const struct = e.value.struct;
        const to = e.value.to;
        if (struct.type === "audio_group") {
          // TODO: Allow editing cues with visual waveform sliders
          // const presetWidget = Decoration.widget({
          //   widget: new StructPresetWidgetType(
          //     struct.name,
          //     [],
          //     async (previewEl) => {
          //       const audioGroup = struct.compiled as AudioGroup;
          //       const firstAudioSrc = audioGroup.assets?.[0]?.src;
          //       if (firstAudioSrc) {
          //         const url = await config.fileSystemReader.url(firstAudioSrc);
          //         if (url) {
          //           const soundBuffer = await loadAudioBytes(
          //             url,
          //             context.audioContext
          //           );
          //           updateWaveformElement(
          //             {
          //               ...config.waveformSettings,
          //               xOffset: 0,
          //               zoomOffset: 0,
          //               visible: "both",
          //               visibleIndex: 0,
          //               soundBuffer,
          //             },
          //             config.previewSettings,
          //             context.audioContext,
          //             previewEl
          //           );
          //         }
          //       }
          //     }
          //   ),
          // });
          const playWidgetRanges: Range<Decoration>[] = [];
          playWidgetRanges.push(
            Decoration.widget({
              widget: new StructPlayWidgetType(
                struct.id,
                PlayButtonIcon,
                (button) =>
                  playAudioGroupStruct(struct, config.fileSystemReader, button)
              ),
              id: struct.id,
            }).range(to)
          );
          if (struct.fields) {
            for (let i = 0; i < struct.fields.length; i += 1) {
              const field = struct.fields[i]!;
              const nextField = struct.fields[i + 1];
              const from = field.compiled;
              const to = nextField?.compiled;
              if (
                field.path === "cues" &&
                typeof from === "number" &&
                (to === undefined || typeof to === "number")
              ) {
                const offset = from;
                const duration = to != null ? to - from : undefined;
                playWidgetRanges.push(
                  Decoration.widget({
                    widget: new StructPlayWidgetType(
                      struct.id,
                      PlayButtonIcon,
                      (button) =>
                        playAudioGroupStruct(
                          struct,
                          config.fileSystemReader,
                          button,
                          offset,
                          duration
                        )
                    ),
                    id: struct.id,
                  }).range(field.to)
                );
              }
            }
          }
          decorations = decorations.update({
            add: playWidgetRanges,
          });
        }
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const updateStructWidgets = (
  structs: Record<string, SparkStruct>
): TransactionSpec => {
  const effects: StateEffect<unknown>[] = [];
  effects.push(clearStructDecorationsEffect.of({}));
  Object.values(structs).forEach((struct) => {
    const from = struct.ranges?.name?.from;
    const to = struct.ranges?.name?.to;
    if (from != null && to != null) {
      effects.push(
        addStructDecorationEffect.of({
          struct,
          from,
          to,
        })
      );
    }
  });
  return { effects };
};

export const structWidgets = (options: StructWidgetsConfiguration = {}) => [
  structWidgetsConfig.of(options),
  structDecorationsField,
];
