import { getIndentUnit, indentString } from "@codemirror/language";
import {
  EditorState,
  Facet,
  Range,
  StateEffect,
  TransactionSpec,
  combineConfig,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { SparkDOMAudioPlayer } from "../../../spark-dom/src/classes/SparkDOMAudioPlayer";
import { Audio, type AudioGroup, type Synth } from "../../../spark-engine/src";
import { clone } from "../../../spark-engine/src/game/core/utils/clone";
import { SynthBuffer } from "../../../spark-engine/src/game/modules/audio/classes/SynthBuffer";
import { SYNTH_DEFAULTS } from "../../../spark-engine/src/game/modules/audio/specs/defaults/SYNTH_DEFAULTS";
import {
  SYNTH_RANDOMIZATIONS,
  SYNTH_VALIDATION,
  randomize,
} from "../../../spark-engine/src/inspector";
import { SparkProgram, SparkVariable } from "../../../sparkdown/src/index";
import structStringify from "../../../sparkdown/src/utils/structStringify";
import { FileSystemReader } from "../cm-language-client/types/FileSystemReader";
import StructKeyboardWidgetType from "./classes/StructKeyboardWidgetType";
import StructPlayWidgetType, {
  STRUCT_PLAY_BUTTON_CLASS_NAME,
} from "./classes/StructPlayWidgetType";
import StructPresetWidgetType, {
  STRUCT_PRESET_PREVIEW_CLASS_NAME,
  StructPresetOption,
} from "./classes/StructPresetWidgetType";
import { PreviewConfig } from "./types/PreviewConfig";
import { WaveformConfig } from "./types/WaveformConfig";
import { WaveformContext } from "./types/WaveformContext";
import { getAudioBuffer } from "./utils/getAudioBuffer";
import { updateWaveformElement } from "./utils/updateWaveformElement";

const updateVariableDecorationsEffect = StateEffect.define<{
  variables: Record<string, SparkVariable>;
}>({
  map: (value, change) => {
    const variables: Record<string, SparkVariable> = {};
    Object.entries(value.variables).forEach(([id, v]) => {
      const variable: SparkVariable = JSON.parse(JSON.stringify(v));
      variable.from = change.mapPos(variable.from);
      variable.to = change.mapPos(variable.to);
      Object.values(variable.ranges || {}).forEach((r) => {
        r.from = change.mapPos(r.from);
        r.to = change.mapPos(r.to);
      });
      variable.fields?.forEach((f) => {
        f.from = change.mapPos(f.from);
        f.to = change.mapPos(f.to);
        Object.values(f.ranges || {}).forEach((r) => {
          r.from = change.mapPos(r.from);
          r.to = change.mapPos(r.to);
        });
      });
      variables[id] = v;
    });
    return {
      variables,
    };
  },
});

export interface VariableWidgetsConfiguration {
  fileSystemReader?: FileSystemReader;
  waveformSettings?: WaveformConfig;
  previewSettings?: PreviewConfig;
  programContext?: { program?: SparkProgram };
}

interface VariableWidgetContext {
  audioContext?: AudioContext;
  audioPlayerGroups: Record<string, SparkDOMAudioPlayer[] | null>;
  waveforms: Record<string, WaveformContext>;
}

const VARIABLE_WIDGET_CONTEXT: VariableWidgetContext = {
  audioContext: undefined,
  audioPlayerGroups: {},
  waveforms: {},
};

const getPlayButton = (dom: HTMLElement, id: string) => {
  const rootEl = dom.getRootNode().firstChild as HTMLElement;
  return rootEl?.querySelector<HTMLElement>(
    `.${STRUCT_PLAY_BUTTON_CLASS_NAME}.${id.replaceAll(".", "-")}`
  );
};

const getPreviewElement = (
  dom: HTMLElement | EventTarget | null,
  id: string
) => {
  const rootEl = (dom as HTMLElement)?.getRootNode?.()
    ?.firstChild as HTMLElement;
  return rootEl?.querySelector?.<HTMLElement>(
    `.${STRUCT_PRESET_PREVIEW_CLASS_NAME}.${id.replaceAll(".", "-")}`
  );
};

const playAudio = async (
  context: VariableWidgetContext,
  playId: string,
  dom: HTMLElement,
  toggle: boolean,
  loadPlayers: () => Promise<SparkDOMAudioPlayer[]>,
  duration?: number,
  offset: number = 0,
  pitchBend: number = 0
) => {
  // TODO: Retain play button state even on editor teardown.
  context.audioContext ??= new AudioContext();
  const playButton = getPlayButton(dom, playId);
  const isPlaying = playButton?.dataset["action"] === "stop";
  const shouldQueue = !toggle || !isPlaying;
  Object.entries(context.audioPlayerGroups).forEach(([id, players]) => {
    delete context.audioPlayerGroups[id];
    if (players) {
      if (toggle || id !== playId) {
        players.forEach((player) => {
          player.stop();
        });
        const playButton = getPlayButton(dom, id);
        if (playButton) {
          playButton.dataset["action"] = "play";
          playButton.innerHTML = PlayButtonIcon;
        }
      }
    }
  });
  if (shouldQueue) {
    if (playButton) {
      playButton.dataset["action"] = "stop";
      playButton.innerHTML = LoadingButtonIcon;
    }
    context.audioPlayerGroups[playId] = null;
    const players = await loadPlayers();
    if (context.audioPlayerGroups[playId] === null) {
      // Loading wasn't interrupted, so we should play
      context.audioPlayerGroups[playId] = players;
      if (playButton) {
        playButton.dataset["action"] = "stop";
        playButton.innerHTML = StopButtonIcon;
      }
      const currentTime = context.audioContext.currentTime + 0.025;
      await Promise.all(
        players.map((player) => {
          return new Promise<void>((resolve) => {
            player.pitchBend = pitchBend;
            player.addEventListener("ended", () => {
              resolve();
            });
            player.start(currentTime, 0, offset, duration);
          });
        })
      );
      if (playButton) {
        playButton.dataset["action"] = "play";
        playButton.innerHTML = PlayButtonIcon;
      }
    }
  }
};

const playAudioVariable = async (
  audio: Audio,
  fileSystemReader: FileSystemReader,
  context: VariableWidgetContext,
  buttonId: string,
  dom: HTMLElement,
  toggle: boolean,
  duration?: number,
  offset?: number
) => {
  context.audioContext ??= new AudioContext();
  const audioContext = context.audioContext;
  const getPlayers = async () => {
    const url = await fileSystemReader.url(audio.src);
    const buffer = url
      ? await getAudioBuffer(url, audioContext)
      : new Float32Array(0);
    const player = new SparkDOMAudioPlayer(buffer, audioContext, {
      cues: audio.cues,
    });
    return [player];
  };
  playAudio(context, buttonId, dom, toggle, getPlayers, duration, offset);
};

const playAudioGroupVariable = async (
  audioGroup: AudioGroup,
  fileSystemReader: FileSystemReader,
  context: VariableWidgetContext,
  buttonId: string,
  dom: HTMLElement,
  toggle: boolean,
  duration?: number,
  offset?: number
) => {
  context.audioContext ??= new AudioContext();
  const audioContext = context.audioContext;
  const getPlayers = () =>
    Promise.all<SparkDOMAudioPlayer>(
      audioGroup?.assets?.map(async (a) => {
        const url = await fileSystemReader.url(a.src);
        const buffer = url
          ? await getAudioBuffer(url, audioContext)
          : new Float32Array(0);
        const player = new SparkDOMAudioPlayer(buffer, audioContext, {
          cues: audioGroup.cues,
        });
        return player;
      })
    );
  playAudio(context, buttonId, dom, toggle, getPlayers, duration, offset);
};

const playSynthVariable = async (
  synth: Synth,
  context: VariableWidgetContext,
  buttonId: string,
  dom: HTMLElement,
  toggle: boolean,
  pitchBend: number = 0
) => {
  context.audioContext ??= new AudioContext();
  const audioContext = context.audioContext;
  const getPlayers = async () => {
    const synthBuffer = createSynthBuffer(synth, context);
    const audioBuffer = audioContext.createBuffer(
      1,
      synthBuffer.soundBuffer.length,
      audioContext.sampleRate
    );
    audioBuffer.copyToChannel(synthBuffer.soundBuffer, 0);
    return [new SparkDOMAudioPlayer(audioBuffer, audioContext)];
  };
  playAudio(
    context,
    buttonId,
    dom,
    toggle,
    getPlayers,
    undefined,
    undefined,
    pitchBend
  );
};

const createSynthBuffer = (synth: Synth, context: VariableWidgetContext) => {
  context.audioContext ??= new AudioContext();
  const audioContext = context.audioContext;
  return new SynthBuffer(
    synth,
    [{ pitch: synth.pitch.frequency }],
    audioContext.sampleRate
  );
};

const updateSynthWaveform = (
  previewEl: HTMLElement,
  synth: Synth,
  context: VariableWidgetContext,
  variableId: string,
  config: Required<VariableWidgetsConfiguration>
) => {
  context.audioContext ??= new AudioContext();
  const synthBuffer = createSynthBuffer(synth, context);
  const waveform: WaveformContext = context.waveforms[variableId] ?? {
    ...config.waveformSettings,
    xOffset: 0,
    zoomOffset: 0,
    referenceFileName: "",
  };
  waveform.soundBuffer = synthBuffer.soundBuffer;
  waveform.volumeBuffer = synthBuffer.volumeBuffer;
  waveform.pitchBuffer = synthBuffer.pitchBuffer;
  waveform.pitchRange = synthBuffer.pitchRange;
  context.waveforms[variableId] = waveform;
  updateWaveformElement(
    waveform,
    config.previewSettings,
    context.audioContext,
    previewEl,
    (audioContext, buffer) => {
      const audioBuffer = audioContext.createBuffer(
        1,
        buffer.length,
        audioContext.sampleRate
      );
      audioBuffer.copyToChannel(buffer, 0);
      new SparkDOMAudioPlayer(audioBuffer, audioContext).start();
    }
  );
};

const getFirstIndentedLine = (
  state: EditorState,
  lineNumber: number,
  indentStr: string
) => {
  for (let n = lineNumber + 1; n < state.doc.lines; n += 1) {
    const line = state.doc.line(n);
    if (
      line.text.startsWith(indentStr + "  ") ||
      line.text.startsWith(indentStr + "\t")
    ) {
      return line;
    } else {
      return null;
    }
  }
  return null;
};

const getNextUnindentedLine = (
  state: EditorState,
  lineNumber: number,
  indentStr: string
) => {
  let prevLine = state.doc.line(lineNumber);
  for (let n = lineNumber + 1; n < state.doc.lines; n += 1) {
    const line = state.doc.line(n);
    if (
      !line.text.startsWith(indentStr + "  ") &&
      !line.text.startsWith(indentStr + "\t")
    ) {
      return prevLine;
    }
    prevLine = line;
  }
  return prevLine;
};

const getStructValueRange = (view: EditorView, structWidgetPos: number) => {
  // Use latest view state
  const state = view.state;
  const widgetLine = state.doc.lineAt(structWidgetPos);
  const indentCols =
    widgetLine.text.length - widgetLine.text.trimStart().length;
  const indent = widgetLine.text.slice(0, indentCols);
  const valueFromLine = getFirstIndentedLine(state, widgetLine.number, indent);
  const valueToLine = getNextUnindentedLine(state, widgetLine.number, indent);
  if (valueToLine) {
    const indentSize = getIndentUnit(state);
    const indentStr = indentString(state, indentSize);
    const indentedPrefix = indent + indentStr;
    return {
      from: valueFromLine?.from ?? widgetLine.to,
      to: Math.min(state.doc.length, valueToLine.to),
      indent: indentedPrefix,
    };
  }
  return null;
};

const getStructValueChanges = (
  view: EditorView,
  structWidgetPos: number,
  structObj: unknown
) => {
  // Use latest view state
  const state = view.state;
  const structValueRange = getStructValueRange(view, structWidgetPos);
  if (structValueRange) {
    const isEmptyStruct = structValueRange.from === structValueRange.to;
    const newline = state.lineBreak;
    const lineSeparator = `${newline}${structValueRange.indent}`;
    let insert = "";
    if (isEmptyStruct) {
      insert += newline;
    }
    insert +=
      structValueRange.indent + structStringify(structObj, lineSeparator);
    if (isEmptyStruct) {
      insert += newline;
    }
    const changes = {
      from: structValueRange.from,
      to: structValueRange.to,
      insert,
    };
    return changes;
  }
  return null;
};

const PlayButtonIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d='M 5.7 4.8 C 5.8 3.8 6.8 3.2 7.7 3.6 C 8.8 4 11.2 5.1 14.2 6.9 C 17.2 8.6 19.3 10.1 20.2 10.8 C 21 11.4 21 12.6 20.2 13.2 C 19.3 13.9 17.2 15.4 14.2 17.1 C 11.1 18.9 8.8 20 7.7 20.4 C 6.8 20.8 5.8 20.2 5.7 19.2 C 5.5 18.1 5.3 15.5 5.3 12 C 5.3 8.5 5.5 5.9 5.7 4.8 Z'></path></svg>`;

const LoadingButtonIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /></svg>`;

const StopButtonIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d='M 4 6 C 4 4.9 4.9 4 6 4 L 18 4 C 19.1 4 20 4.9 20 6 L 20 18 C 20 19.1 19.1 20 18 20 L 6 20 C 4.9 20 4 19.1 4 18 L 4 6 Z'></path></svg>`;

const variableWidgetsConfig = Facet.define<
  VariableWidgetsConfiguration,
  Required<VariableWidgetsConfiguration>
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

export const updateVariableWidgets = (value: {
  variables: Record<string, SparkVariable>;
}): TransactionSpec => {
  const effects: StateEffect<unknown>[] = [];
  effects.push(updateVariableDecorationsEffect.of(value));
  return { effects };
};

const getSynthVariableWidgets = (
  view: EditorView,
  state: EditorState,
  widgetPos: number,
  variableId: string,
  _variable: SparkVariable
) => {
  const config = state.facet(variableWidgetsConfig);
  const context = VARIABLE_WIDGET_CONTEXT;
  const widgetRanges: Range<Decoration>[] = [];
  const defaultObj = SYNTH_DEFAULTS["default"];
  const validation = SYNTH_VALIDATION;
  const options: StructPresetOption[] = Object.entries({
    default: null,
    ...(SYNTH_RANDOMIZATIONS || {}),
  }).map(([label, randomization]) => {
    let validLabel = label;
    let validInnerHTML = "";
    const option: StructPresetOption = {
      label: validLabel,
      innerHTML: validInnerHTML,
      onClick: (e): void => {
        const dom = e.target as HTMLElement;
        const preset = randomization ? {} : defaultObj;
        if (randomization) {
          const cullProp =
            label?.toLowerCase() !== "default" ? "on" : undefined;
          randomize(preset, validation, randomization, cullProp);
        }
        const structWidgetPos = view.posAtDOM(dom);
        const changes = getStructValueChanges(view, structWidgetPos, preset);
        if (changes) {
          const randomizedObj = clone(defaultObj, preset);
          const button = getPlayButton(dom, variableId);
          if (button) {
            playSynthVariable(
              randomizedObj,
              context,
              variableId,
              button,
              false
            );
          }
          const previewEl = getPreviewElement(e.target, variableId);
          if (previewEl) {
            updateSynthWaveform(
              previewEl,
              randomizedObj,
              context,
              variableId,
              config
            );
          }
          view.dispatch({ changes });
        } else {
          console.warn(
            `Could not overwrite struct at line ${
              state.doc.lineAt(structWidgetPos).number
            }`
          );
        }
      },
    };
    return option;
  });
  const presetWidget = Decoration.widget({
    side: 1,
    widget: new StructPresetWidgetType(variableId, options, async (e) => {
      const previewEl = getPreviewElement(e.target, variableId);
      if (previewEl) {
        const synth =
          config.programContext.program?.variables?.[variableId]?.compiled;
        if (synth) {
          updateSynthWaveform(previewEl, synth, context, variableId, config);
        }
      }
    }),
  });
  const playWidget = Decoration.widget({
    side: 1,
    id: variableId,
    widget: new StructPlayWidgetType(variableId, PlayButtonIcon, (e) => {
      const dom = e.target as HTMLElement;
      const synth =
        config.programContext.program?.variables?.[variableId]?.compiled;
      if (synth) {
        playSynthVariable(synth, context, variableId, dom, true);
      }
    }),
  });
  const keyboardWidget = Decoration.widget({
    side: 1,
    widget: new StructKeyboardWidgetType(
      variableId,
      (e: PointerEvent, semitones: number) => {
        const dom = e.target as HTMLElement;
        const previewEl = getPreviewElement(e.target, variableId);
        const synth =
          config.programContext.program?.variables?.[variableId]?.compiled;
        if (synth) {
          if (previewEl) {
            updateSynthWaveform(previewEl, synth, context, variableId, config);
          }
          playSynthVariable(synth, context, variableId, dom, false, semitones);
        }
      }
    ),
  });
  widgetRanges.push(presetWidget.range(widgetPos));
  widgetRanges.push(keyboardWidget.range(widgetPos));
  widgetRanges.push(playWidget.range(widgetPos));
  return widgetRanges;
};

const getAudioVariableWidgets = (
  _view: EditorView,
  state: EditorState,
  widgetPos: number,
  variableId: string,
  _variable: SparkVariable
) => {
  const config = state.facet(variableWidgetsConfig);
  const context = VARIABLE_WIDGET_CONTEXT;
  const widgetRanges: Range<Decoration>[] = [];
  // TODO: Allow editing cues with visual waveform sliders
  const playWidget = Decoration.widget({
    side: 1,
    id: variableId,
    widget: new StructPlayWidgetType(variableId, PlayButtonIcon, (e) => {
      const dom = e.target as HTMLElement;
      const audio =
        config.programContext.program?.variables?.[variableId]?.compiled;
      if (audio) {
        playAudioVariable(
          audio,
          config.fileSystemReader,
          context,
          variableId,
          dom,
          true
        );
      }
    }),
  });
  widgetRanges.push(playWidget.range(widgetPos));
  return widgetRanges;
};

const getAudioGroupVariableWidgets = (
  _view: EditorView,
  state: EditorState,
  widgetPos: number,
  variableId: string,
  variable: SparkVariable
) => {
  const config = state.facet(variableWidgetsConfig);
  const context = VARIABLE_WIDGET_CONTEXT;
  const widgetRanges: Range<Decoration>[] = [];
  // TODO: Allow editing cues with visual waveform sliders
  const playWidget = Decoration.widget({
    side: 1,
    id: variableId,
    widget: new StructPlayWidgetType(variableId, PlayButtonIcon, (e) => {
      const dom = e.target as HTMLElement;
      const audioGroup =
        config.programContext.program?.variables?.[variableId]?.compiled;
      if (audioGroup) {
        playAudioGroupVariable(
          audioGroup,
          config.fileSystemReader,
          context,
          variableId,
          dom,
          true
        );
      }
    }),
  });
  widgetRanges.push(playWidget.range(widgetPos));
  if (variable) {
    if (variable.fields) {
      for (let i = 0; i < variable.fields.length; i += 1) {
        const field = variable.fields[i]!;
        const nextField = variable.fields[i + 1];
        const timeFrom = field.compiled;
        const timeTo = nextField?.compiled;
        const index = Number(field.key);
        if (field.path === "assets" && !Number.isNaN(index)) {
          const fieldId = variableId + "." + field.path + "." + field.key;
          const fieldPlayWidget = Decoration.widget({
            side: 1,
            id: fieldId,
            widget: new StructPlayWidgetType(fieldId, PlayButtonIcon, (e) => {
              const dom = e.target as HTMLElement;
              const audioGroup =
                config.programContext.program?.variables?.[variableId]
                  ?.compiled;
              const audio = audioGroup?.["assets"]?.[index];
              if (audio) {
                playAudioVariable(
                  audio,
                  config.fileSystemReader,
                  context,
                  fieldId,
                  dom,
                  true
                );
              }
            }),
          });
          widgetRanges.push(fieldPlayWidget.range(field.to));
        }
        if (
          field.path === "cues" &&
          typeof timeFrom === "number" &&
          (timeTo === undefined || typeof timeTo === "number")
        ) {
          const offset = timeFrom;
          const duration = timeTo != null ? timeTo - timeFrom : undefined;
          const fieldId = variableId + "." + field.path + "." + field.key;
          const fieldPlayWidget = Decoration.widget({
            side: 1,
            id: fieldId,
            widget: new StructPlayWidgetType(fieldId, PlayButtonIcon, (e) => {
              const dom = e.target as HTMLElement;
              const audioGroup =
                config.programContext.program?.variables?.[variableId]
                  ?.compiled;
              if (audioGroup) {
                playAudioGroupVariable(
                  audioGroup,
                  config.fileSystemReader,
                  context,
                  fieldId,
                  dom,
                  true,
                  duration,
                  offset
                );
              }
            }),
          });
          widgetRanges.push(fieldPlayWidget.range(field.to));
        }
      }
    }
  }
  return widgetRanges;
};

const createVariableWidgets = (
  view: EditorView,
  state: EditorState,
  variables: Record<string, SparkVariable>
) => {
  const widgetRanges: Range<Decoration>[] = [];
  Object.entries(variables).forEach(([variableId, variable]) => {
    const to = variable.ranges?.name?.to;
    if (to != null && to < state.doc.length - 1) {
      if (variable.type === "synth" && !variable.implicit) {
        widgetRanges.push(
          ...getSynthVariableWidgets(view, state, to, variableId, variable)
        );
      }
      if (variable.type === "audio" && !variable.implicit) {
        widgetRanges.push(
          ...getAudioVariableWidgets(view, state, to, variableId, variable)
        );
      }
      if (variable.type === "audio_group" && !variable.implicit) {
        widgetRanges.push(
          ...getAudioGroupVariableWidgets(view, state, to, variableId, variable)
        );
      }
    }
  });
  return Decoration.set(widgetRanges, true);
};

const variablePresetWidgetsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;
    update(update: ViewUpdate) {
      for (let tr of update.transactions) {
        for (let e of tr.effects) {
          if (e.is(updateVariableDecorationsEffect)) {
            this.decorations = createVariableWidgets(
              update.view,
              update.state,
              e.value.variables
            );
            return;
          }
        }
      }
      if (update.docChanged) {
        this.decorations = this.decorations.map(update.changes);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

export const variableWidgets = (options: VariableWidgetsConfiguration = {}) => [
  variableWidgetsConfig.of(options),
  variablePresetWidgetsPlugin,
];
