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
import {
  SYNTH_DEFAULTS,
  SynthBuffer,
  clone,
  type AudioGroup,
  type Synth,
} from "../../../spark-engine/src";
import {
  SYNTH_RANDOMIZATIONS,
  SYNTH_VALIDATION,
  randomize,
} from "../../../spark-engine/src/inspector";
import { SparkProgram } from "../../../sparkdown/src/index";
import yamlStringify from "../../../sparkdown/src/utils/yamlStringify";
import { FileSystemReader } from "../cm-language-client/types/FileSystemReader";
import StructPlayWidgetType, {
  STRUCT_PLAY_BUTTON_CLASS_NAME,
} from "./classes/StructPlayWidgetType";
import StructPresetWidgetType, {
  StructPresetOption,
} from "./classes/StructPresetWidgetType";
import { PreviewConfig } from "./types/PreviewConfig";
import { WaveformConfig } from "./types/WaveformConfig";
import { getAudioBuffer } from "./utils/getAudioBuffer";
import { updateWaveformElement } from "./utils/updateWaveformElement";

export interface VariableWidgetsConfiguration {
  fileSystemReader?: FileSystemReader;
  waveformSettings?: WaveformConfig;
  previewSettings?: PreviewConfig;
  programContext?: { program?: SparkProgram };
}

interface VariableWidgetContext {
  audioContext?: AudioContext;
  audioPlayers: SparkDOMAudioPlayer[];
  audioPlayingButton?: HTMLElement | null;
}

const VARIABLE_WIDGET_CONTEXT: VariableWidgetContext = {
  audioContext: undefined,
  audioPlayers: [],
  audioPlayingButton: undefined,
};

const getPlayButton = (dom: HTMLElement, variableName: string) => {
  const rootEl = dom.getRootNode().firstChild as HTMLElement;
  return rootEl?.querySelector<HTMLElement>(
    `.${STRUCT_PLAY_BUTTON_CLASS_NAME}.${variableName}`
  );
};

const playAudio = async (
  context: VariableWidgetContext,
  button: HTMLElement,
  getPlayers: () => SparkDOMAudioPlayer[] | Promise<SparkDOMAudioPlayer[]>,
  duration?: number,
  offset: number = 0
) => {
  // TODO: Retain play button state even on editor teardown.
  context.audioContext ??= new AudioContext();
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
      const players = await getPlayers();
      if (context.audioPlayingButton === button) {
        const currentTime = context.audioContext.currentTime + 0.025;
        players.forEach((player) => {
          player.addEventListener("ended", () => {
            if (context.audioPlayingButton === button) {
              button.innerHTML = PlayButtonIcon;
              context.audioPlayingButton = undefined;
            }
          });
          player.start(currentTime, 0, offset, duration);
          context.audioPlayers.push(player);
        });
        button.innerHTML = StopButtonIcon;
      }
    }
  }
};

const playAudioGroupVariable = async (
  audioGroup: AudioGroup,
  fileSystemReader: FileSystemReader,
  context: VariableWidgetContext,
  button: HTMLElement,
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
          loop: audioGroup.loop,
          volume: audioGroup.volume,
          cues: audioGroup.cues,
        });
        return player;
      })
    );
  playAudio(context, button, getPlayers, duration, offset);
};

const playSynthVariable = async (
  synth: Synth,
  context: VariableWidgetContext,
  button: HTMLElement
) => {
  context.audioContext ??= new AudioContext();
  const audioContext = context.audioContext;
  const getPlayers = () => {
    const buffer = createSynthBuffer(synth, context);
    return [new SparkDOMAudioPlayer(buffer, audioContext)];
  };
  playAudio(context, button, getPlayers);
};

const createSynthBuffer = (synth: Synth, context: VariableWidgetContext) => {
  context.audioContext ??= new AudioContext();
  const audioContext = context.audioContext;
  const duration =
    synth.envelope.attack +
    synth.envelope.decay +
    synth.envelope.sustain +
    synth.envelope.release;
  return new SynthBuffer(
    [
      {
        instrument: 0,
        synth,
        time: 0,
        duration,
      },
    ],
    audioContext.sampleRate
  );
};

const updateSynthWaveform = (
  previewEl: HTMLElement,
  synth: Synth,
  context: VariableWidgetContext,
  config: Required<VariableWidgetsConfiguration>
) => {
  context.audioContext ??= new AudioContext();
  const synthBuffer = createSynthBuffer(synth, context);
  updateWaveformElement(
    {
      ...config.waveformSettings,
      xOffset: 0,
      zoomOffset: 0,
      visible: "both",
      visibleIndex: 0,
      soundBuffer: synthBuffer.soundBuffer,
      volumeBuffer: synthBuffer.volumeBuffer,
      pitchBuffer: synthBuffer.pitchBuffer,
      pitchRange: synthBuffer.pitchRange,
    },
    config.previewSettings,
    context.audioContext,
    previewEl
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
  const widgetLine = view.state.doc.lineAt(structWidgetPos);
  const indentCols =
    widgetLine.text.length - widgetLine.text.trimStart().length;
  const indent = widgetLine.text.slice(0, indentCols);
  const valueFromLine = getFirstIndentedLine(
    view.state,
    widgetLine.number,
    indent
  );
  const valueToLine = getNextUnindentedLine(
    view.state,
    widgetLine.number,
    indent
  );
  if (valueFromLine && valueToLine) {
    const indentSize = getIndentUnit(view.state);
    const indentStr = indentString(view.state, indentSize);
    const indentedPrefix = indent + indentStr;
    return {
      from: valueFromLine.from,
      to: Math.min(view.state.doc.length, valueToLine.to),
      indent: indentedPrefix,
    };
  }
  return null;
};

const overwriteStructValue = (
  view: EditorView,
  structWidgetPos: number,
  structObj: unknown
): boolean => {
  const structValueRange = getStructValueRange(view, structWidgetPos);
  if (structValueRange) {
    const newline = view.state.lineBreak;
    const lineSeparator = `${newline}${structValueRange.indent}`;
    let insert =
      structValueRange.indent + yamlStringify(structObj, lineSeparator);
    const changes = {
      from: structValueRange.from,
      to: structValueRange.to,
      insert,
    };
    view.dispatch({ changes });
    return true;
  }
  return false;
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

const updateVariableDecorationsEffect = StateEffect.define<{}>();

export const updateVariableWidgets = (): TransactionSpec => {
  const effects: StateEffect<unknown>[] = [];
  effects.push(updateVariableDecorationsEffect.of({}));
  return { effects };
};

const getSynthVariableWidgets = (
  view: EditorView,
  widgetPos: number,
  variableName: string,
  compiled: Synth
) => {
  const config = view.state.facet(variableWidgetsConfig);
  const context = VARIABLE_WIDGET_CONTEXT;
  const widgetRanges: Range<Decoration>[] = [];
  const defaultObj = SYNTH_DEFAULTS[""];
  const validation = SYNTH_VALIDATION;
  const options: StructPresetOption[] = Object.entries({
    default: defaultObj,
    ...(SYNTH_RANDOMIZATIONS || {}),
  }).map(([label, randomization]) => {
    let validLabel = label;
    let validInnerHTML = "";
    const option: StructPresetOption = {
      label: validLabel,
      innerHTML: validInnerHTML,
      onClick: (_e, previewEl, dom): void => {
        const preset = randomization ? {} : defaultObj;
        if (randomization) {
          const cullProp =
            label?.toLowerCase() !== "default" ? "on" : undefined;
          randomize(preset, validation, randomization, cullProp);
        }
        if (overwriteStructValue(view, view.posAtDOM(dom), preset)) {
          const randomizedObj = clone(defaultObj, preset);
          updateSynthWaveform(previewEl, randomizedObj, context, config);
          const button = getPlayButton(dom, variableName);
          if (button) {
            playSynthVariable(randomizedObj, context, button);
          }
        }
      },
    };
    return option;
  });
  const presetWidget = Decoration.widget({
    side: 1,
    widget: new StructPresetWidgetType(
      variableName,
      options,
      async (previewEl) => {
        updateSynthWaveform(previewEl, compiled, context, config);
      }
    ),
  });
  const playWidget = Decoration.widget({
    side: 1,
    id: variableName,
    widget: new StructPlayWidgetType(variableName, PlayButtonIcon, (button) => {
      playSynthVariable(compiled, context, button);
    }),
  });
  widgetRanges.push(presetWidget.range(widgetPos));
  widgetRanges.push(playWidget.range(widgetPos));
  return widgetRanges;
};

const getAudioGroupVariableWidgets = (
  view: EditorView,
  widgetPos: number,
  variableName: string,
  compiled: AudioGroup,
  fields:
    | { from: number; to: number; path: string; key: string; compiled: any }[]
    | undefined
) => {
  const config = view.state.facet(variableWidgetsConfig);
  const context = VARIABLE_WIDGET_CONTEXT;
  const widgetRanges: Range<Decoration>[] = [];
  // TODO: Allow editing cues with visual waveform sliders
  const playWidget = Decoration.widget({
    side: 1,
    id: variableName,
    widget: new StructPlayWidgetType(variableName, PlayButtonIcon, (button) =>
      playAudioGroupVariable(compiled, config.fileSystemReader, context, button)
    ),
  });
  widgetRanges.push(playWidget.range(widgetPos));
  if (fields) {
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i]!;
      const nextField = fields[i + 1];
      const timeFrom = field.compiled;
      const timeTo = nextField?.compiled;
      if (
        field.path === "cues" &&
        typeof timeFrom === "number" &&
        (timeTo === undefined || typeof timeTo === "number")
      ) {
        const offset = timeFrom;
        const duration = timeTo != null ? timeTo - timeFrom : undefined;
        const fieldId = variableName + "." + field.path + "." + field.key;
        const fieldPlayWidget = Decoration.widget({
          side: 1,
          id: fieldId,
          widget: new StructPlayWidgetType(fieldId, PlayButtonIcon, (button) =>
            playAudioGroupVariable(
              compiled,
              config.fileSystemReader,
              context,
              button,
              duration,
              offset
            )
          ),
        });
        widgetRanges.push(fieldPlayWidget.range(field.to));
      }
    }
  }
  return widgetRanges;
};

const createVariableWidgets = (view: EditorView) => {
  const config = view.state.facet(variableWidgetsConfig);
  const widgetRanges: Range<Decoration>[] = [];
  const program = config.programContext.program;
  if (program?.variables) {
    Object.values(program.variables).forEach((variable) => {
      const to = variable.ranges?.name?.to;
      if (to != null) {
        if (variable.type === "synth" && !variable.implicit) {
          widgetRanges.push(
            ...getSynthVariableWidgets(
              view,
              to,
              variable.name,
              variable.compiled
            )
          );
        }
        if (variable.type === "audio_group") {
          widgetRanges.push(
            ...getAudioGroupVariableWidgets(
              view,
              to,
              variable.name,
              variable.compiled,
              variable.fields
            )
          );
        }
      }
    });
  }
  return Decoration.set(widgetRanges);
};

const variableWidgetsChanged = (update: ViewUpdate): boolean => {
  return update.transactions.some((t) =>
    t.effects.some((e) => e.is(updateVariableDecorationsEffect))
  );
};

const variablePresetWidgetsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = createVariableWidgets(view);
    }
    update(update: ViewUpdate) {
      if (variableWidgetsChanged(update)) {
        this.decorations = createVariableWidgets(update.view);
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
