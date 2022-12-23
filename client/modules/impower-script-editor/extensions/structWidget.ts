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
  augment,
  construct,
  create,
  getAllProperties,
  randomize,
  setProperty,
  Sound,
} from "../../../../spark-engine";
import { synthesizeSound } from "../../../../spark-engine/src/game/synth/utils/synthesizeSound";
import {
  SparkParseResult,
  SparkStruct,
  SparkStructFieldToken,
  yamlStringify,
} from "../../../../sparkdown";
import { Type } from "../types/type";
import { sparkRandomizations } from "../utils/sparkRandomizations";
import { sparkValidations } from "../utils/sparkValidations";
import { StructFieldNameWidgetType } from "./StructFieldNameWidgetType";
import { StructFieldValueWidgetType } from "./StructFieldValueWidgetType";
import {
  getPresetPreviewClassName,
  StructPresetWidgetType,
} from "./StructPresetWidgetType";

const PREVIEW_WIDTH = 200;
const PREVIEW_HEIGHT = 64;

const audioContext = new AudioContext();

const getValue = (str: string): unknown => {
  if (str === "true" || str === "false") {
    return Boolean(str);
  }
  const num = Number(str);
  if (!Number.isNaN(num)) {
    return num;
  }
  const first = str[0];
  const last = str[str.length - 1];
  const isQuoted = first === last && ["'", '"', "`"].includes(first);
  if (isQuoted) {
    return str.slice(1, -1);
  }
  return undefined;
};

const getElement = (className: string): HTMLElement => {
  const elements = document.getElementsByClassName(className);
  return elements?.[elements.length - 1] as HTMLElement;
};

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

  ctx.clearRect(0, 0, 500, 500);

  // Frequency (Fill)
  ctx.lineWidth = 1;
  ctx.fillStyle = "#5a3663B3";
  ctx.beginPath();
  ctx.moveTo(startX, height);
  if (pitchBuffer) {
    for (let x = startX; x < endX; x += 1) {
      const timeProgress = (x - startX) / (endX - 1);
      const bufferIndex = Math.floor(timeProgress * (pitchBuffer.length - 1));
      const val = pitchBuffer[bufferIndex];
      const mag =
        maxPitch === minPitch ? 0.5 : (val - minPitch) / (maxPitch - minPitch);
      const delta = mag * (height / 2);
      const y = startY - delta;
      ctx.lineTo(x, y);
    }
  }
  ctx.lineTo(endX, height);
  ctx.closePath();
  ctx.fill();

  const waveStartY = startY + soundBuffer[0];

  // Amplitude (Volume)
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#3095cf";
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

  // Frequency (Stroke)
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#5a3663";
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  if (pitchBuffer) {
    for (let x = startX; x < endX; x += 1) {
      const timeProgress = (x - startX) / (endX - 1);
      const bufferIndex = Math.floor(timeProgress * (pitchBuffer.length - 1));
      const val = pitchBuffer[bufferIndex];
      if (val === 0) {
        ctx.moveTo(x, startY);
      } else {
        const mag =
          maxPitch === minPitch
            ? 0.5
            : (val - minPitch) / (maxPitch - minPitch);
        const delta = mag * (height / 2);
        const y = startY - delta;
        ctx.lineTo(x, y);
      }
    }
  }
  ctx.stroke();
};

const parseContextState = Facet.define<{ result?: SparkParseResult }>({});

const getStruct = (view: EditorView, from: number): SparkStruct => {
  const [parseContext] = view.state.facet(parseContextState);
  const result = parseContext.result;
  const line = view.state.doc.lineAt(from);
  const tokenIndex = result.tokenLines[line.number];
  const structToken = result.tokens[tokenIndex] as {
    struct?: string;
    name?: string;
  };
  const structName = structToken?.struct || structToken?.name;
  return result.structs[structName || ""];
};

const autofillStruct = (
  view: EditorView,
  from: number,
  to: number,
  structObj: unknown
): boolean => {
  const line = view.state.doc.lineAt(from);
  const indent = line.text.length - line.text.trimStart().length;
  const lineSeparator = `\n${"".padEnd(indent + 2, " ")}`;
  let insert = lineSeparator;
  insert += yamlStringify(structObj, lineSeparator);
  const changes = { from, to: Math.min(view.state.doc.length, to), insert };
  view.dispatch({ changes });
  return true;
};

const structDecorations = (view: EditorView): DecorationSet => {
  const widgets = [];
  view.visibleRanges.forEach(({ from, to }) => {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const type = node?.type;
        const from = node?.from;
        const to = node?.to;
        const onPlaySound = (soundBuffer: Float32Array): void => {
          if (soundBuffer?.length > 0) {
            const buffer = audioContext.createBuffer(
              1,
              soundBuffer.length,
              audioContext.sampleRate
            );
            buffer.copyToChannel(soundBuffer, 0);
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);
            source.start(
              audioContext.currentTime,
              0,
              soundBuffer.length / audioContext.sampleRate
            );
          }
        };
        const onUpdatePreview = (structObj: unknown): Float32Array => {
          const struct = getStruct(view, from);
          const structPreview = getElement(
            getPresetPreviewClassName(struct.name)
          );
          structPreview.style.minWidth = `${PREVIEW_WIDTH}px`;
          structPreview.style.height = `${PREVIEW_HEIGHT}px`;
          const sound = structObj as Sound;
          const draw = (): Float32Array => {
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
            const canvas = getOrCreateCanvas(structPreview);
            canvas.width = PREVIEW_WIDTH;
            canvas.height = PREVIEW_HEIGHT;
            const renderContext = canvas.getContext("2d");
            const pitch = sound.frequency.pitch;
            const visibleMinPitch = sound.arpeggio.on ? minPitch : pitch;
            const visibleMaxPitch = sound.arpeggio.on ? maxPitch : pitch + 0.01;
            drawWaveform(
              renderContext,
              PREVIEW_WIDTH,
              PREVIEW_HEIGHT,
              soundBuffer,
              pitchBuffer,
              visibleMinPitch,
              visibleMaxPitch
            );
            return soundBuffer;
          };
          const soundBuffer = draw();
          structPreview.style.cursor = "pointer";
          const defaultColor = "#00000000";
          const hoverColor = "#00000026";
          const tapColor = "#00000080";
          structPreview.onmouseenter = (): void => {
            structPreview.style.backgroundColor = hoverColor;
          };
          structPreview.onmouseleave = (): void => {
            structPreview.style.backgroundColor = defaultColor;
          };
          structPreview.onpointerdown = (): void => {
            structPreview.style.backgroundColor = tapColor;
          };
          structPreview.onpointerup = (): void => {
            structPreview.style.backgroundColor = hoverColor;
          };
          structPreview.onclick = (): void => {
            onPlaySound(soundBuffer);
          };
          return soundBuffer;
        };
        if (type.id === Type.StructColon) {
          const struct = getStruct(view, from);
          const structType = struct?.type;
          const validation = sparkValidations[structType];
          const randomizations = sparkRandomizations[structType] || {};
          const options = Object.entries({
            default: validation,
            ...randomizations,
          }).map(([label, randomization]) => ({
            label,
            onClick: (): void => {
              const struct = getStruct(view, from);
              let structTo = to;
              Object.values(struct.fields || {}).forEach((f) => {
                if (f.to > structTo) {
                  structTo = f.to;
                }
              });
              const isDefault = label?.toLowerCase() === "default";
              const preset = isDefault ? create(validation) : {};
              if (!isDefault) {
                randomize(preset, validation, randomization, "on");
              }
              autofillStruct(view, from + 1, structTo, preset);
              const randomizedObj = create(validation);
              augment(randomizedObj, preset);
              const soundBuffer = onUpdatePreview(randomizedObj);
              onPlaySound(soundBuffer);
            },
          }));
          if (options?.length > 0) {
            widgets.push(
              Decoration.widget({
                widget: new StructPresetWidgetType(struct.name, options, () => {
                  const struct = getStruct(view, from);
                  const structObj = construct(validation, struct.fields);
                  const soundBuffer = onUpdatePreview(structObj);
                  onPlaySound(soundBuffer);
                }),
                side: 0,
              }).range(to)
            );
          }
        }
        if (type.id === Type.StructFieldName) {
          const from = node?.from;
          const to = node?.to;
          const [parseContext] = view.state.facet(parseContextState);
          const line = view.state.doc.lineAt(to);
          const result = parseContext.result;
          const tokenIndex = result.tokenLines[line.number];
          const structFieldToken = result.tokens[
            tokenIndex
          ] as SparkStructFieldToken;
          if (structFieldToken) {
            const structName = structFieldToken?.struct;
            const struct = result.structs[structName || ""];
            const structType = struct?.type;
            const validation = sparkValidations[structType];
            const requirements = getAllProperties(validation);
            const requirement = requirements[structFieldToken.id];
            const defaultName = requirement?.[0];
            const id = `${structName}${structFieldToken.id}`;
            if (["number", "string", "boolean"].includes(typeof defaultName)) {
              widgets.push(
                Decoration.widget({
                  widget: new StructFieldNameWidgetType(id),
                }).range(from)
              );
            }
          }
        }
        if (type.id === Type.StructFieldValue) {
          const from = node?.from;
          const to = node?.to;
          const [parseContext] = view.state.facet(parseContextState);
          const line = view.state.doc.lineAt(to);
          const result = parseContext.result;
          const tokenIndex = result.tokenLines[line.number];
          const structFieldToken = result.tokens[
            tokenIndex
          ] as SparkStructFieldToken;
          if (structFieldToken) {
            const structName = structFieldToken?.struct;
            const struct = result.structs[structName || ""];
            const structField = struct.fields[structFieldToken.id];
            const startValue = structField?.value;
            const structType = struct?.type;
            const validation = sparkValidations[structType];
            const requirements = getAllProperties(validation);
            const requirement = requirements[structFieldToken.id];
            const defaultValue = requirement?.[0];
            const range = requirement?.[1];
            const step = requirement?.[2]?.[0];
            const id = `${structName}${structFieldToken.id}`;
            if (["number", "string", "boolean"].includes(typeof defaultValue)) {
              const onDragging = (
                e: MouseEvent,
                startX: number,
                x: number,
                fieldPreviewTextContent: string
              ): void => {
                const valueEl = getElement(id);
                const from = view.posAtDOM(valueEl);
                const insert = fieldPreviewTextContent;
                const newValue = getValue(insert);
                if (newValue !== undefined) {
                  const struct = getStruct(view, from);
                  const structObj = construct(validation, struct.fields);
                  setProperty(structObj, structFieldToken.id, newValue);
                  onUpdatePreview(structObj);
                }
              };
              const onDragEnd = (
                e: MouseEvent,
                startX: number,
                x: number,
                fieldPreviewTextContent: string
              ): void => {
                const valueEl = getElement(id);
                const from = view.posAtDOM(valueEl);
                const insert = fieldPreviewTextContent;
                const to = view.state.doc.lineAt(from).to;
                const changes = { from, to, insert };
                view.dispatch({ changes });
                const newValue = getValue(insert);
                if (newValue !== undefined) {
                  const struct = getStruct(view, from);
                  const structObj = construct(validation, struct.fields);
                  setProperty(structObj, structFieldToken.id, newValue);
                  const soundBuffer = onUpdatePreview(structObj);
                  onPlaySound(soundBuffer);
                }
              };
              widgets.push(
                Decoration.widget({
                  widget: new StructFieldValueWidgetType(
                    id,
                    view.state.doc.sliceString(from, to),
                    startValue,
                    range,
                    step,
                    { onDragging, onDragEnd }
                  ),
                }).range(from),
                Decoration.mark({ class: id }).range(from, to)
              );
            }
          }
        }
      },
    });
  });
  return Decoration.set(widgets);
};

export const structWidgetPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = structDecorations(view);
    }

    update(update: ViewUpdate): void {
      this.decorations = structDecorations(update.view);
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

export const structWidget = (
  options: {
    parseContext?: {
      result: SparkParseResult;
    };
  } = {}
): Extension => {
  return [parseContextState.of(options.parseContext), structWidgetPlugin];
};
