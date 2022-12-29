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
const ZOOM_SPEED = 0.001;
const REFERENCE_COLOR = "#d92662";
const AMPLITUDE_COLOR = "#3095cf";
const DEFAULT_COLOR = "#00000000";
const HOVER_COLOR = "#00000026";
const TAP_COLOR = "#00000080";
const VISIBLE_WAVE_TYPES: ("sound" | "reference")[] = ["reference", "sound"];

let ctx: CanvasRenderingContext2D | undefined;
let zoomLevel = 0;
let xOffset = 0;
let visibleIndex = 0;
let visible: "sound" | "reference" | "both" = "both";

const audioContext = new AudioContext();

let soundBuffer: Float32Array | undefined;
let pitchBuffer: Float32Array | undefined;
let pitchRange: [number, number] = [0, 0];
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

const getEndX = (
  sampleRate: number,
  zoomLevel: number,
  width: number,
  totalLength: number
): number => {
  const fundamentalFrequency = 1760;
  const periodLength = sampleRate / fundamentalFrequency;
  const minNumOfVisiblePeriods = 3;
  const minZoom = 1;
  const maxZoom = totalLength / (minNumOfVisiblePeriods * periodLength);
  return width * (minZoom + zoomLevel * maxZoom);
};

const drawWaveform = (): void => {
  if (!ctx) {
    return;
  }

  const width = PREVIEW_WIDTH;
  const height = PREVIEW_HEIGHT;

  const sampleRate = audioContext.sampleRate;

  const [minPitch, maxPitch] = pitchRange;

  const totalLength = Math.max(
    soundBuffer?.length || 0,
    referenceBuffer?.length || 0
  );

  const startX = xOffset;
  const startY = height / 2;
  const endX = getEndX(sampleRate, zoomLevel, width, totalLength);

  const visibleStartX = 0;
  const visibleEndX = width;

  ctx.clearRect(0, 0, 500, 500);

  // Axis
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, startY);
  ctx.lineTo(visibleEndX, startY);
  ctx.stroke();

  if (pitchBuffer) {
    // Frequency (Fill)
    ctx.lineWidth = 1;
    ctx.fillStyle = "#5a3663B3";
    ctx.beginPath();
    ctx.moveTo(startX, height);
    for (let x = visibleStartX; x < visibleEndX; x += 1) {
      const timeProgress = (x - startX) / (endX - 1);
      const bufferIndex = Math.round(timeProgress * (totalLength - 1));
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
      const timeProgress = (x - startX) / (endX - 1);
      const bufferIndex = Math.round(timeProgress * (totalLength - 1));
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
      const timeProgress = (x - startX) / (endX - 1);
      const bufferIndex = Math.round(timeProgress * (totalLength - 1));
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
    ctx.strokeStyle = "#5a3663";
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let x = visibleStartX; x < visibleEndX; x += 1) {
      const timeProgress = (x - startX) / (endX - 1);
      const bufferIndex = Math.round(timeProgress * (totalLength - 1));
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

const draw = throttle((): void => {
  drawWaveform();
}, 50);

const playSound = (soundBuffer: Float32Array): void => {
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
const loadAudioBytes = (url: string): Promise<Float32Array> => {
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
  const newEl = document.createElement("input");
  newEl.type = "range";
  newEl.min = "0";
  newEl.max = "100";
  newEl.value = "0";
  newEl.defaultValue = "0";
  newEl.style.margin = "0";
  newEl.style.padding = "0";
  newEl.style.appearance = "none";
  newEl.style.background = "transparent";
  newEl.style.cursor = "pointer";
  newEl.style.backgroundColor = "#00000040";
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
        playSound(referenceBuffer);
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

const getOrCreateFileInput = (previewEl: HTMLElement): HTMLInputElement => {
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
    draw();
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

const getOrCreateButton = (previewEl: HTMLElement): HTMLButtonElement => {
  const existing = previewEl.getElementsByTagName("button")?.[0];
  if (existing) {
    return existing;
  }
  const newEl = document.createElement("button");
  newEl.style.border = "none";
  newEl.style.backgroundColor = "transparent";
  newEl.style.padding = "0";
  newEl.style.margin = "0";
  previewEl.appendChild(newEl);
  return newEl;
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
        const onUpdatePreview = (
          structName: string,
          structObj: unknown
        ): Float32Array => {
          const structPreview = getElement(
            getPresetPreviewClassName(structName)
          );
          structPreview.style.minWidth = `${PREVIEW_WIDTH}px`;
          const rangeInput = getOrCreateRangeInput(structPreview);
          const button = getOrCreateButton(structPreview);
          const fileInput = getOrCreateFileInput(structPreview);
          button.style.height = `${PREVIEW_HEIGHT}px`;
          const sound = structObj as Sound;
          const sampleRate = audioContext.sampleRate;
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
          const canvas = getOrCreateCanvas(button);
          canvas.width = PREVIEW_WIDTH;
          canvas.height = PREVIEW_HEIGHT;
          ctx = canvas.getContext("2d");
          draw();
          rangeInput.oninput = (e: InputEvent): void => {
            const inputEl = e.target as HTMLInputElement;
            zoomLevel = Number(inputEl.value) / 100;
            draw();
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
              loadAudioBytes(fileUrl).then((value: Float32Array) => {
                referenceFileName = file.name;
                referenceBuffer = value;
                updateFilenameElement(filenameEl);
                updateSwapElement(swapLabelEl);
                draw();
              });
            } else {
              referenceFileName = "";
              referenceBuffer = undefined;
              updateFilenameElement(filenameEl);
              updateSwapElement(swapLabelEl);
              draw();
            }
          };
          let startX: number | undefined;
          let startXOffset: number | undefined;
          let clicked = false;
          const getMaxX = (): number => {
            return getEndX(
              audioContext.sampleRate,
              zoomLevel,
              PREVIEW_WIDTH,
              Math.max(length, referenceBuffer?.length || 0)
            );
          };
          const onPointerMove = (e: MouseEvent): void => {
            const deltaX = e.clientX - startX;
            if (Math.abs(deltaX) > 0) {
              clicked = false;
            }
            xOffset = clamp(
              startXOffset + deltaX,
              PREVIEW_WIDTH - getMaxX(),
              0
            );
            draw();
          };
          const onPointerUp = (e: MouseEvent): void => {
            const deltaX = e.clientX - startX;
            button.style.backgroundColor = HOVER_COLOR;
            startX = undefined;
            xOffset = clamp(
              startXOffset + deltaX,
              PREVIEW_WIDTH - getMaxX(),
              0
            );
            window.removeEventListener("pointermove", onPointerMove);
            if (clicked) {
              playSound(soundBuffer);
            }
            draw();
          };
          button.onpointerdown = (e: PointerEvent): void => {
            button.style.backgroundColor = TAP_COLOR;
            startX = e.clientX;
            startXOffset = xOffset;
            clicked = true;
            window.addEventListener("pointermove", onPointerMove);
            window.addEventListener("pointerup", onPointerUp, { once: true });
            draw();
          };
          button.onmouseenter = (): void => {
            button.style.backgroundColor = HOVER_COLOR;
          };
          button.onmouseleave = (): void => {
            button.style.backgroundColor = DEFAULT_COLOR;
          };
          button.onwheel = (e: WheelEvent): void => {
            e.stopPropagation();
            e.preventDefault();
            zoomLevel = clamp(zoomLevel - ZOOM_SPEED * e.deltaY, 0, 1);
            if (rangeInput) {
              rangeInput.value = `${zoomLevel * 100}`;
            }
            xOffset = clamp(xOffset, PREVIEW_WIDTH - getMaxX(), 0);
            draw();
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
                  playSound(soundBuffer);
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
                        const structObj = construct(validation, struct.fields);
                        const soundBuffer = onUpdatePreview(
                          struct.name,
                          structObj
                        );
                        playSound(soundBuffer);
                      }
                    }
                  ),
                  side: 0,
                }).range(to)
              );
            }
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
                    const soundBuffer = onUpdatePreview(struct.name, structObj);
                    playSound(soundBuffer);
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
