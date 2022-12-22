import { syntaxTree } from "@codemirror/language";
import { Extension, Facet } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import {
  construct,
  create,
  getAllProperties,
  randomize,
  setProperty,
  Sound,
} from "../../../../spark-engine";
import { synthesizeSound } from "../../../../spark-engine/src/game/synth/utils/synthesizeSound";
import { randomizer } from "../../../../spark-evaluate";
import {
  SparkParseResult,
  SparkStruct,
  SparkStructToken,
  yamlStringify,
} from "../../../../sparkdown";
import { Type } from "../types/type";
import { sparkRandomizations } from "../utils/sparkRandomizations";
import { sparkValidations } from "../utils/sparkValidations";
import { StructPresetWidgetType } from "./StructPresetWidgetType";

const PREVIEW_WIDTH = 200;
const PREVIEW_HEIGHT = 64;

const audioContext = new AudioContext();

const getDuration = (sound: Sound): number => {
  return (
    sound.amplitude.attack +
    sound.amplitude.decay +
    sound.amplitude.sustain +
    sound.amplitude.release
  );
};

const getLength = (sound: Sound, sampleRate: number): number => {
  const duration = getDuration(sound);
  return Math.max(1, sampleRate * duration);
};

const getOrCreateCanvas = (previewEl: HTMLElement): HTMLCanvasElement => {
  const existing = previewEl.getElementsByTagName("canvas")?.[0];
  if (existing) {
    return existing;
  }
  const newEl = document.createElement("canvas");
  previewEl.appendChild(newEl);
  return newEl;
};

const drawWaveform = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  soundBuffer: Float32Array,
  pitchBuffer: Float32Array,
  minPitch: number,
  maxPitch: number
): void => {
  const endX = width;
  const startX = 0;
  const startY = height / 2;

  const waveStartY = startY + soundBuffer[0];

  ctx.lineWidth = 1;
  ctx.strokeStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.moveTo(startX, waveStartY);
  ctx.lineTo(endX, waveStartY);
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.strokeStyle = "#2B83B7";
  ctx.beginPath();
  ctx.moveTo(startX, waveStartY);
  if (soundBuffer) {
    for (let x = startX; x < endX; x += 1) {
      const timeProgress = (x - startX) / (endX - 1);
      const bufferIndex = Math.floor(timeProgress * (soundBuffer.length - 1));
      const val = soundBuffer[bufferIndex];
      const delta = val * 50;
      const y = waveStartY + delta;
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }

  ctx.lineWidth = 1;
  ctx.strokeStyle = "#782bb7";
  ctx.beginPath();
  ctx.moveTo(startX, waveStartY);
  if (pitchBuffer) {
    for (let x = startX; x < endX; x += 1) {
      const timeProgress = (x - startX) / (endX - 1);
      const bufferIndex = Math.floor(timeProgress * (pitchBuffer.length - 1));
      const val = pitchBuffer[bufferIndex];
      if (val === 0) {
        ctx.moveTo(x, waveStartY);
      } else {
        const mag =
          maxPitch === minPitch
            ? 0.5
            : (val - minPitch) / (maxPitch - minPitch);
        const delta = mag * (height / 2);
        const y = waveStartY - delta;
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
  }
};

const playSound = (sound: Sound, previewEl: HTMLElement): void => {
  const duration = getDuration(sound);
  const sampleRate = audioContext.sampleRate;
  const length = getLength(sound, sampleRate);
  const soundBuffer = new Float32Array(length);
  const pitchBuffer = new Float32Array(length);
  const { minPitch, maxPitch } = synthesizeSound(
    sound,
    false,
    false,
    sampleRate,
    0,
    length,
    soundBuffer,
    pitchBuffer
  );
  const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  buffer.copyToChannel(soundBuffer, 0);
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start(audioContext.currentTime + 0.025, 0, duration);

  const canvas = getOrCreateCanvas(previewEl);
  canvas.width = PREVIEW_WIDTH;
  canvas.height = PREVIEW_HEIGHT;
  const renderContext = canvas.getContext("2d");
  renderContext.clearRect(0, 0, 500, 500);
  drawWaveform(
    renderContext,
    PREVIEW_WIDTH,
    PREVIEW_HEIGHT,
    soundBuffer,
    pitchBuffer,
    minPitch,
    maxPitch
  );
};

const rng = randomizer("");

const parseContextState = Facet.define<{ result?: SparkParseResult }>({});

const getStruct = (view: EditorView, from: number): SparkStruct => {
  const [parseContext] = view.state.facet(parseContextState);
  const result = parseContext.result;
  const line = view.state.doc.lineAt(from);
  const tokenIndex = result.tokenLines[line.number];
  const structToken = result.tokens[tokenIndex] as SparkStructToken;
  const structName = structToken?.name;
  return result.structs[structName || ""];
};

const autofillStruct = (
  view: EditorView,
  from: number,
  to: number,
  obj: Record<string, unknown>
): boolean => {
  const line = view.state.doc.lineAt(from);
  const indent = line.text.length - line.text.trimStart().length;
  const struct = getStruct(view, from);
  const props = getAllProperties(obj);
  const newFields = {};
  from = line.to;
  to = from;
  Object.values(struct.fields).forEach((f) => {
    if (f.to > from) {
      to = f.to;
    }
  });
  Object.entries(props).forEach(([p, v]) => {
    setProperty(newFields, p, v);
  });
  const lineSeparator = `\n${"".padEnd(indent + 2, " ")}`;
  let insert = lineSeparator;
  insert += yamlStringify(newFields, lineSeparator);
  const changes = { from, to, insert };
  view.dispatch({ changes });
  return true;
};

const structPresetDecorations = (view: EditorView): DecorationSet => {
  const widgets = [];
  view.visibleRanges.forEach(({ from, to }) => {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const type = node?.type;
        const to = node?.to;
        if (type.id === Type.StructColon) {
          const struct = getStruct(view, from);
          const structType = struct?.type;
          const defaultValidation = sparkValidations[structType];
          const structObj = construct(defaultValidation, struct.fields);
          const onUpdatePreview = (
            preview: HTMLElement,
            preset: unknown
          ): void => {
            preview.style.minWidth = `${PREVIEW_WIDTH}px`;
            preview.style.height = `${PREVIEW_HEIGHT}px`;
            if (structType === "sound") {
              const sound = preset as Sound;
              playSound(sound, preview);
            }
          };
          const defaultOptions = [
            {
              label: "default",
              onClick: (e: PointerEvent, preview: HTMLElement): void => {
                const preset =
                  create<Record<string, unknown>>(defaultValidation);
                onUpdatePreview(preview, preset);
                autofillStruct(view, from, to, preset);
              },
            },
          ];
          const randomizations = sparkRandomizations[structType];
          const randomizerOptions = Object.entries(randomizations).map(
            ([label, randomization]) => ({
              label,
              onClick: (e: PointerEvent, preview: HTMLElement): void => {
                const preset = randomize<Record<string, unknown>>(
                  defaultValidation,
                  randomization,
                  rng
                );
                onUpdatePreview(preview, preset);
                autofillStruct(view, from, to, preset);
              },
            })
          );
          const options = [...defaultOptions, ...randomizerOptions];
          if (options?.length > 0) {
            widgets.push(
              Decoration.widget({
                widget: new StructPresetWidgetType(
                  struct.name,
                  options,
                  (preview) => onUpdatePreview(preview, structObj)
                ),
                side: 0,
              }).range(to)
            );
          }
        }
      },
    });
  });
  return Decoration.set(widgets);
};

export const structPresetPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = structPresetDecorations(view);
    }

    update(update: ViewUpdate): void {
      this.decorations = structPresetDecorations(update.view);
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

export const structPresetWidget = (
  options: {
    parseContext?: {
      result: SparkParseResult;
    };
  } = {}
): Extension => {
  return [parseContextState.of(options.parseContext), structPresetPlugin];
};
