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
  lerp,
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
import { StructPlayWidgetType } from "./StructPlayWidgetType";
import {
  getPresetPreviewClassName,
  StructPresetWidgetType,
} from "./StructPresetWidgetType";

const PREVIEW_HEIGHT = 64;
const PREVIEW_WIDTH = 200;
const ZOOM_MAX_OFFSET = 1000;
const MAX_SCALE = 10;
const X_AXIS_COLOR = "#ffffff";
const FREQUENCY_FILL_COLOR = "#5a3663B3";
const FREQUENCY_STROKE_COLOR = "#5a3663";
const REFERENCE_COLOR = "#d92662";
const AMPLITUDE_COLOR = "#3095cf";
const DEFAULT_COLOR = "#00000000";
const HOVER_COLOR = "#00000026";
const SLIDER_FILL_COLOR = "#2B83B7";
const SLIDER_BACKGROUND_COLOR = "#00000040";
const VISIBLE_WAVE_TYPES: ("sound" | "reference")[] = ["reference", "sound"];

const AUDIO_CONTEXT = new AudioContext();

let zoomOffset = 0;
let xOffset = 0;
let visibleIndex = 0;
let visible: "sound" | "reference" | "both" = "both";
let referenceBuffer: Float32Array | undefined;
let referenceFileName: string;

const throttle = <T extends (...args: unknown[]) => unknown>(
  func: T,
  timeFrame?: number
): ((...args: unknown[]) => void) => {
  let lastTime = 0;
  return (...args: unknown[]): void => {
    const now = Date.now();
    if (now - lastTime >= timeFrame) {
      func(...args);
      lastTime = now;
    }
  };
};

const clamp = (x: number, min: number, max: number): number => {
  if (x < min) {
    return min;
  }
  if (x > max) {
    return max;
  }
  return x;
};

const getMaxBufferLength = (...buffers: Float32Array[]): number => {
  return Math.max(...buffers.map((b) => b?.length || 0));
};

const getCurrentZoomLevel = (): number => {
  return zoomOffset / ZOOM_MAX_OFFSET;
};

const getCurrentScale = (): number => {
  return lerp(getCurrentZoomLevel(), 1, MAX_SCALE);
};

const getSampleIndex = (
  x: number,
  startX: number,
  endX: number,
  bufferLength: number
): number => {
  const timeProgress = (x - startX) / (endX - 1);
  return Math.floor(timeProgress * (bufferLength - 1));
};

const pan = (newXOffset: number): void => {
  xOffset = clamp(
    newXOffset,
    PREVIEW_WIDTH - PREVIEW_WIDTH * getCurrentScale(),
    0
  );
};

const zoom = (
  newZoomOffset: number,
  xFocus: number,
  width: number,
  bufferLength: number
): void => {
  const prevXOffset = xOffset;
  const prevWidth = width * getCurrentScale();
  const prevSampleIndex = getSampleIndex(
    xFocus,
    xOffset,
    prevWidth,
    bufferLength
  );
  zoomOffset = clamp(newZoomOffset, 0, ZOOM_MAX_OFFSET);
  const newWidth = width * getCurrentScale();
  const newSampleIndex = getSampleIndex(
    xFocus,
    xOffset,
    newWidth,
    bufferLength
  );
  const pixelsPerSample = newWidth / bufferLength;
  const sampleOffset = newSampleIndex - prevSampleIndex;
  const deltaX = sampleOffset * pixelsPerSample;
  pan(prevXOffset + deltaX);
};

const getDuration = (sound: Sound): number => {
  return (
    sound.amplitude.delay +
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

const playSound = (
  audioContext: AudioContext,
  soundBuffer: Float32Array,
  onFinished?: () => void
): void => {
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
    source.addEventListener("ended", () => {
      onFinished?.();
    });
  }
};
const loadAudioBytes = (
  audioContext: AudioContext,
  url: string
): Promise<Float32Array> => {
  return new Promise<Float32Array>((resolve) => {
    const request = new XMLHttpRequest();
    request.open("GET", url);
    request.responseType = "arraybuffer";
    request.onload = (): void => {
      const undecodedAudio = request.response;
      audioContext.decodeAudioData(undecodedAudio, (data) => {
        resolve(data.getChannelData(0));
      });
    };
    request.send();
  });
};

const getValue = (str: string): unknown => {
  if (str === "true") {
    return true;
  }
  if (str === "false") {
    return false;
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

const getOrCreateCanvas = (previewEl: HTMLElement): HTMLCanvasElement => {
  const existing = previewEl.getElementsByTagName("canvas")?.[0];
  if (existing) {
    return existing;
  }
  const newEl = document.createElement("canvas");
  previewEl.appendChild(newEl);
  return newEl;
};

const getOrCreateRangeInput = (previewEl: HTMLElement): HTMLInputElement => {
  const existing = Array.from(previewEl.getElementsByTagName("input")).find(
    (el) => el.type === "range"
  );
  if (existing) {
    return existing;
  }
  const containerEl = document.createElement("div");
  containerEl.style.backgroundColor = SLIDER_BACKGROUND_COLOR;
  containerEl.style.height = "10px";
  containerEl.style.position = "relative";
  containerEl.style.overflow = "hidden";
  const fillEl = document.createElement("div");
  fillEl.style.position = "absolute";
  fillEl.style.top = "0";
  fillEl.style.left = "0";
  fillEl.style.bottom = "0";
  fillEl.style.right = "10px";
  fillEl.style.transformOrigin = "left center";
  fillEl.style.transform = `translateX(0)`;
  const thumbEl = document.createElement("div");
  thumbEl.style.borderRadius = "50%";
  thumbEl.style.width = "10px";
  thumbEl.style.height = "10px";
  thumbEl.style.backgroundColor = SLIDER_FILL_COLOR;
  fillEl.appendChild(thumbEl);
  containerEl.appendChild(fillEl);
  const newEl = document.createElement("input");
  newEl.type = "range";
  newEl.min = "0";
  newEl.max = `${ZOOM_MAX_OFFSET}`;
  newEl.value = "0";
  newEl.defaultValue = "0";
  newEl.style.margin = "0";
  newEl.style.padding = "0";
  newEl.style.opacity = "0";
  newEl.style.cursor = "ew-resize";
  newEl.style.width = "100%";
  newEl.style.height = "100%";
  containerEl.appendChild(newEl);
  previewEl.appendChild(containerEl);
  return newEl;
};

const updateRangeFill = (rangeEl: HTMLElement): void => {
  const fillEl = rangeEl?.parentElement?.firstElementChild as HTMLElement;
  if (fillEl) {
    fillEl.style.transform = `translateX(${getCurrentZoomLevel() * 100}%)`;
  }
};

const getOrCreateDraggableArea = (previewEl: HTMLElement): HTMLSpanElement => {
  const existing = previewEl.getElementsByTagName("span")?.[0];
  if (existing) {
    return existing;
  }
  const newEl = document.createElement("span");
  newEl.style.border = "none";
  newEl.style.backgroundColor = "transparent";
  newEl.style.padding = "0";
  newEl.style.margin = "0";
  previewEl.appendChild(newEl);
  return newEl;
};

const updateFilenameElement = (el: HTMLElement): void => {
  if (el) {
    if (referenceBuffer && referenceFileName) {
      el.textContent = referenceFileName;
      el.style.cursor = "pointer";
      el.onmouseenter = (): void => {
        el.style.backgroundColor = HOVER_COLOR;
      };
      el.onmouseleave = (): void => {
        el.style.backgroundColor = DEFAULT_COLOR;
      };
      el.onclick = (): void => {
        playSound(AUDIO_CONTEXT, referenceBuffer);
      };
    } else {
      el.textContent = "";
      el.style.cursor = null;
      el.onmouseenter = null;
      el.onmouseleave = null;
      el.onclick = null;
    }
  }
};

const updateSwapElement = (el: HTMLElement): void => {
  if (el) {
    if (referenceBuffer && referenceFileName) {
      el.style.visibility = null;
    } else {
      el.style.visibility = "hidden";
    }
  }
};

const getOrCreateFileInput = (
  previewEl: HTMLElement,
  onSwapWaveClick?: () => void
): HTMLInputElement => {
  const existing = Array.from(previewEl.getElementsByTagName("input")).find(
    (el) => el.type === "file"
  );
  if (existing) {
    return existing;
  }
  const containerEl = document.createElement("div");
  containerEl.style.position = "relative";
  containerEl.style.display = "flex";
  containerEl.style.justifyContent = "space-between";
  containerEl.style.alignItems = "center";
  containerEl.style.color = AMPLITUDE_COLOR;
  const filenameEl = document.createElement("span");
  filenameEl.style.position = "absolute";
  filenameEl.style.top = "0";
  filenameEl.style.bottom = "0";
  filenameEl.style.left = "1.5rem";
  filenameEl.style.right = "1.5rem";
  filenameEl.style.fontSize = "12px";
  filenameEl.style.minWidth = "0";
  filenameEl.style.overflow = "hidden";
  filenameEl.style.display = "flex";
  filenameEl.style.justifyContent = "center";
  filenameEl.style.alignItems = "center";
  filenameEl.style.color = REFERENCE_COLOR;
  filenameEl.textContent = referenceFileName || "";
  containerEl.appendChild(filenameEl);
  const swapButtonEl = document.createElement("label");
  swapButtonEl.style.borderRadius = "4px";
  swapButtonEl.style.cursor = "pointer";
  swapButtonEl.style.position = "relative";
  swapButtonEl.style.display = "flex";
  swapButtonEl.style.justifyContent = "center";
  swapButtonEl.style.alignItems = "center";
  const swapEl = document.createElement("div");
  swapEl.style.height = "1.5rem";
  swapEl.style.minWidth = "1.5rem";
  swapEl.style.fontFamily = "inherit";
  swapEl.style.fontSize = "1rem";
  swapEl.style.fontWeight = "bold";
  swapEl.style.lineHeight = "1.5";
  swapEl.style.textAlign = "center";
  swapEl.appendChild(document.createTextNode("~"));
  swapButtonEl.appendChild(swapEl);
  containerEl.appendChild(swapButtonEl);
  swapButtonEl.onmouseenter = (): void => {
    swapButtonEl.style.backgroundColor = HOVER_COLOR;
  };
  swapButtonEl.onmouseleave = (): void => {
    swapButtonEl.style.backgroundColor = DEFAULT_COLOR;
  };
  swapButtonEl.onclick = (): void => {
    visible = VISIBLE_WAVE_TYPES[visibleIndex % VISIBLE_WAVE_TYPES.length];
    visibleIndex += 1;
    if (visible === "reference") {
      swapButtonEl.style.color = REFERENCE_COLOR;
    }
    if (visible === "sound") {
      swapButtonEl.style.color = AMPLITUDE_COLOR;
    }
    onSwapWaveClick?.();
  };
  const plusButtonEl = document.createElement("label");
  plusButtonEl.style.borderRadius = "4px";
  plusButtonEl.style.cursor = "pointer";
  plusButtonEl.style.position = "relative";
  plusButtonEl.style.display = "flex";
  plusButtonEl.style.justifyContent = "center";
  plusButtonEl.style.alignItems = "center";
  plusButtonEl.style.textAlign = "center";
  const plusEl = document.createElement("div");
  plusEl.style.height = "1.5rem";
  plusEl.style.minWidth = "1.5rem";
  plusEl.style.fontFamily = "inherit";
  plusEl.style.fontSize = "1rem";
  plusEl.style.fontWeight = "bold";
  plusEl.style.lineHeight = "1.5";
  plusEl.appendChild(document.createTextNode("+"));
  const newEl = document.createElement("input");
  newEl.type = "file";
  newEl.style.display = "none";
  plusButtonEl.appendChild(newEl);
  plusButtonEl.style.textAlign = "center";
  plusButtonEl.appendChild(plusEl);
  containerEl.appendChild(plusButtonEl);
  previewEl.appendChild(containerEl);
  plusButtonEl.onmouseenter = (): void => {
    plusButtonEl.style.backgroundColor = HOVER_COLOR;
  };
  plusButtonEl.onmouseleave = (): void => {
    plusButtonEl.style.backgroundColor = DEFAULT_COLOR;
  };
  updateFilenameElement(filenameEl);
  updateSwapElement(swapButtonEl);
  return newEl;
};

const drawWaveform = (
  ctx: CanvasRenderingContext2D | undefined,
  soundBuffer: Float32Array | undefined,
  pitchBuffer: Float32Array | undefined,
  pitchRange: [number, number] | undefined
): void => {
  if (!ctx) {
    return;
  }

  const width = PREVIEW_WIDTH;
  const height = PREVIEW_HEIGHT;

  const [minPitch, maxPitch] = pitchRange || [0, 0];

  const endX = width * getCurrentScale();
  const startX = xOffset;
  const startY = height / 2;

  const visibleStartX = 0;
  const visibleEndX = width;

  const bufferLength = getMaxBufferLength(soundBuffer, referenceBuffer);

  ctx.clearRect(0, 0, 500, 500);

  // Axis
  ctx.lineWidth = 1;
  ctx.strokeStyle = X_AXIS_COLOR;
  ctx.beginPath();
  ctx.moveTo(0, startY);
  ctx.lineTo(visibleEndX, startY);
  ctx.stroke();

  if (pitchBuffer) {
    // Frequency (Fill)
    ctx.lineWidth = 1;
    ctx.fillStyle = FREQUENCY_FILL_COLOR;
    ctx.beginPath();
    ctx.moveTo(startX, height);
    for (let x = visibleStartX; x < visibleEndX; x += 1) {
      const bufferIndex = getSampleIndex(x, startX, endX, bufferLength);
      if (bufferIndex >= 0) {
        const val = pitchBuffer[bufferIndex];
        const mag =
          maxPitch === minPitch
            ? 0.5
            : (val - minPitch) / (maxPitch - minPitch);
        const delta = mag * (height / 2);
        const y = startY - delta;
        ctx.lineTo(x, y);
      }
    }
    ctx.lineTo(endX, height);
    ctx.closePath();
    ctx.fill();
  }

  if (referenceBuffer && (visible === "both" || visible === "reference")) {
    // Reference Amplitude (Volume)
    ctx.lineWidth = 1;
    ctx.strokeStyle = REFERENCE_COLOR;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let x = visibleStartX; x < visibleEndX; x += 1) {
      const bufferIndex = getSampleIndex(x, startX, endX, bufferLength);
      if (bufferIndex >= 0) {
        const val = referenceBuffer[bufferIndex];
        const delta = val * 50;
        const y = startY + delta;
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  if (soundBuffer && (visible === "both" || visible === "sound")) {
    // Amplitude (Volume)
    ctx.lineWidth = 1;
    ctx.strokeStyle = AMPLITUDE_COLOR;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let x = visibleStartX; x < visibleEndX; x += 1) {
      const bufferIndex = getSampleIndex(x, startX, endX, bufferLength);
      if (bufferIndex >= 0) {
        const val = soundBuffer[bufferIndex];
        const delta = val * 50;
        const y = startY + delta;
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  if (pitchBuffer) {
    // Frequency (Stroke)
    ctx.lineWidth = 1;
    ctx.strokeStyle = FREQUENCY_STROKE_COLOR;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let x = visibleStartX; x < visibleEndX; x += 1) {
      const bufferIndex = getSampleIndex(x, startX, endX, bufferLength);
      if (bufferIndex >= 0) {
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
  }
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
        if (
          type.id === Type.StructColon ||
          type.id === Type.StructFieldName ||
          type.id === Type.StructFieldMark ||
          type.id === Type.StructFieldValue
        ) {
          const sampleRate = AUDIO_CONTEXT.sampleRate;
          let ctx: CanvasRenderingContext2D | undefined;
          let soundBuffer: Float32Array | undefined;
          let pitchBuffer: Float32Array | undefined;
          let pitchRange: [number, number] | undefined;

          const _draw = (): void => {
            drawWaveform(ctx, soundBuffer, pitchBuffer, pitchRange);
          };
          const draw = throttle(_draw, 50);

          const onUpdatePreview = (
            structName: string,
            structObj: unknown
          ): Float32Array => {
            const sound = structObj as Sound;
            const length = getLength(sound, sampleRate);
            soundBuffer = new Float32Array(length);
            pitchBuffer = new Float32Array(length);
            pitchRange = [Number.MAX_SAFE_INTEGER, 0];
            synthesizeSound(
              sound,
              false,
              false,
              sampleRate,
              0,
              length,
              soundBuffer,
              pitchBuffer,
              pitchRange
            );
            const structPreview = getElement(
              getPresetPreviewClassName(structName)
            );
            structPreview.style.minWidth = `${PREVIEW_WIDTH}px`;
            const rangeInput = getOrCreateRangeInput(structPreview);
            updateRangeFill(rangeInput);
            const draggableArea = getOrCreateDraggableArea(structPreview);
            const fileInput = getOrCreateFileInput(structPreview, draw);
            draggableArea.style.height = `${PREVIEW_HEIGHT}px`;
            draggableArea.style.cursor = zoomOffset > 0 ? "grab" : "zoom-in";
            const canvas = getOrCreateCanvas(draggableArea);
            canvas.width = PREVIEW_WIDTH;
            canvas.height = PREVIEW_HEIGHT;
            ctx = canvas.getContext("2d");
            draw();

            const onRangePointerMove = (): void => {
              const width = PREVIEW_WIDTH;
              const x = width * 0.5;
              const bufferLength = getMaxBufferLength(
                soundBuffer,
                referenceBuffer
              );
              zoom(Number(rangeInput.value), x, width, bufferLength);
              updateRangeFill(rangeInput);
              draw();
              draggableArea.style.cursor = zoomOffset > 0 ? "grab" : "zoom-in";
            };
            const onRangePointerUp = (): void => {
              const width = PREVIEW_WIDTH;
              const x = width * 0.5;
              const bufferLength = getMaxBufferLength(
                soundBuffer,
                referenceBuffer
              );
              zoom(Number(rangeInput.value), x, width, bufferLength);
              updateRangeFill(rangeInput);
              draw();
              draggableArea.style.cursor = zoomOffset > 0 ? "grab" : "zoom-in";
              window.removeEventListener("pointermove", onRangePointerMove);
            };
            rangeInput.onpointerdown = (): void => {
              const width = PREVIEW_WIDTH;
              const x = width * 0.5;
              const bufferLength = getMaxBufferLength(
                soundBuffer,
                referenceBuffer
              );
              zoom(Number(rangeInput.value), x, width, bufferLength);
              updateRangeFill(rangeInput);
              draw();
              draggableArea.style.cursor = zoomOffset > 0 ? "grab" : "zoom-in";
              window.addEventListener("pointermove", onRangePointerMove);
              window.addEventListener("pointerup", onRangePointerUp, {
                once: true,
              });
            };
            fileInput.onchange = (e: InputEvent): void => {
              const file = (e.target as HTMLInputElement)?.files?.[0];
              const filenameEl =
                fileInput?.parentElement?.parentElement?.getElementsByTagName(
                  "span"
                )?.[0];
              const swapLabelEl =
                fileInput?.parentElement?.parentElement?.getElementsByTagName(
                  "label"
                )?.[0];
              if (file) {
                const fileUrl = URL.createObjectURL(file);
                loadAudioBytes(AUDIO_CONTEXT, fileUrl).then(
                  (value: Float32Array) => {
                    referenceFileName = file.name;
                    referenceBuffer = value;
                    updateFilenameElement(filenameEl);
                    updateSwapElement(swapLabelEl);
                    draw();
                  }
                );
              } else {
                referenceFileName = "";
                referenceBuffer = undefined;
                updateFilenameElement(filenameEl);
                updateSwapElement(swapLabelEl);
                draw();
              }
            };
            let startX: number | undefined;
            let prevXOffset: number | undefined;
            const onPreviewPointerMove = (e: MouseEvent): void => {
              const deltaX = e.clientX - startX;
              pan(prevXOffset + deltaX);
              draw();
            };
            const onPreviewPointerUp = (): void => {
              document.documentElement.style.cursor = null;
              draggableArea.style.cursor = zoomOffset > 0 ? "grab" : "zoom-in";
              draggableArea.style.backgroundColor = HOVER_COLOR;
              startX = undefined;
              window.removeEventListener("pointermove", onPreviewPointerMove);
            };
            draggableArea.onpointerdown = (e: PointerEvent): void => {
              startX = e.clientX;
              prevXOffset = xOffset;
              if (zoomOffset <= 0) {
                const el = e.target as HTMLElement;
                const rect = el.getBoundingClientRect();
                const width = rect.width;
                const x = e.clientX - rect.left;
                const bufferLength = getMaxBufferLength(
                  soundBuffer,
                  referenceBuffer
                );
                zoom(ZOOM_MAX_OFFSET * 0.5, x, width, bufferLength);
                updateRangeFill(rangeInput);
                draw();
                if (rangeInput) {
                  rangeInput.value = `${zoomOffset}`;
                }
              } else {
                document.documentElement.style.cursor = "grabbing";
                draggableArea.style.cursor = "grabbing";
              }
              window.addEventListener("pointermove", onPreviewPointerMove);
              window.addEventListener("pointerup", onPreviewPointerUp, {
                once: true,
              });
            };
            draggableArea.onwheel = (e: WheelEvent): void => {
              e.stopPropagation();
              e.preventDefault();
              const el = e.target as HTMLElement;
              const rect = el.getBoundingClientRect();
              const width = rect.width;
              const x = e.clientX - rect.left;
              const bufferLength = getMaxBufferLength(
                soundBuffer,
                referenceBuffer
              );
              zoom(zoomOffset - e.deltaY, x, width, bufferLength);
              updateRangeFill(rangeInput);
              draw();
              if (rangeInput) {
                rangeInput.value = `${zoomOffset}`;
              }
              draggableArea.style.cursor = zoomOffset > 0 ? "grab" : "zoom-in";
            };
            return soundBuffer;
          };
          if (type.id === Type.StructColon) {
            const struct = getStruct(view, from);
            if (struct) {
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
                  if (struct) {
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
                    const soundBuffer = onUpdatePreview(
                      struct.name,
                      randomizedObj
                    );
                    playSound(AUDIO_CONTEXT, soundBuffer);
                  }
                },
              }));
              if (options?.length > 0) {
                widgets.push(
                  Decoration.widget({
                    widget: new StructPresetWidgetType(
                      struct.name,
                      options,
                      () => {
                        const struct = getStruct(view, from);
                        if (struct) {
                          const structObj = construct(
                            validation,
                            struct.fields
                          );
                          onUpdatePreview(struct.name, structObj);
                        }
                      }
                    ),
                    side: 0,
                  }).range(to)
                );
              }
              widgets.push(
                Decoration.widget({
                  widget: new StructPlayWidgetType(struct.name, () => {
                    const struct = getStruct(view, from);
                    if (struct) {
                      const structObj = construct(validation, struct.fields);
                      const soundBuffer = onUpdatePreview(
                        struct.name,
                        structObj
                      );
                      playSound(AUDIO_CONTEXT, soundBuffer);
                    }
                  }),
                  side: 0,
                }).range(to)
              );
            }
          }
          if (
            type.id === Type.StructFieldName ||
            type.id === Type.StructFieldMark
          ) {
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
              const id = `${structName}${structFieldToken.id}`;
              widgets.push(
                Decoration.widget({
                  widget: new StructFieldNameWidgetType(id),
                }).range(from)
              );
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
              if (struct) {
                const structField = struct.fields[structFieldToken.id];
                const startValue = structField?.value;
                const structType = struct?.type;
                const validation = sparkValidations[structType];
                const requirements = getAllProperties(validation);
                const requirement = requirements[structFieldToken.id];
                const range = requirement?.[1];
                const step = requirement?.[2]?.[0];
                const id = `${structName}${structFieldToken.id}`;
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
                    if (struct) {
                      const structObj = construct(validation, struct.fields);
                      setProperty(structObj, structFieldToken.id, newValue);
                      onUpdatePreview(struct.name, structObj);
                    }
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
                    if (struct) {
                      const structObj = construct(validation, struct.fields);
                      setProperty(structObj, structFieldToken.id, newValue);
                      const soundBuffer = onUpdatePreview(
                        struct.name,
                        structObj
                      );
                      playSound(AUDIO_CONTEXT, soundBuffer);
                    }
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
