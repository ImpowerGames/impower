import { PreviewConfig } from "../types/PreviewConfig";
import { WaveformContext } from "../types/WaveformContext";
import { drawSoundWaveform } from "./drawSoundWaveform";
import { getCurrentZoomLevel } from "./getCurrentZoomLevel";
import { getMaxBufferLength } from "./getMaxBufferLength";
import { loadAudioBytes } from "./loadAudioBytes";
import { panWaveform } from "./panWaveform";
import throttle from "./throttle";
import { zoomWaveform } from "./zoomWaveform";

const VISIBLE_WAVE_TYPES = ["both", "sound"] as const;

const getOrCreateCanvas = (previewEl: HTMLElement): HTMLCanvasElement => {
  const existing = previewEl.getElementsByTagName("canvas")?.[0];
  if (existing) {
    return existing;
  }
  const newEl = document.createElement("canvas");
  previewEl.appendChild(newEl);
  return newEl;
};

const getOrCreateRangeInput = (
  waveformContext: WaveformContext,
  previewContext: PreviewConfig,
  previewEl: HTMLElement
): HTMLInputElement => {
  const existing = Array.from(previewEl.getElementsByTagName("input")).find(
    (el) => el.type === "range"
  );
  if (existing) {
    return existing;
  }
  const containerEl = document.createElement("div");
  containerEl.style.backgroundColor = previewContext.sliderBackgroundColor;
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
  thumbEl.style.backgroundColor = previewContext.sliderFillColor;
  fillEl.appendChild(thumbEl);
  containerEl.appendChild(fillEl);
  const newEl = document.createElement("input");
  newEl.type = "range";
  newEl.min = "0";
  newEl.max = `${waveformContext.maxZoomOffset}`;
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

const updateFilenameElement = (
  waveformContext: WaveformContext,
  previewContext: PreviewConfig,
  el: HTMLElement,
  drawWaveform: () => void,
  playSound: (buffer: Float32Array) => void
): void => {
  if (el) {
    if (waveformContext.referenceBuffer && waveformContext.referenceFileName) {
      el.textContent = waveformContext.referenceFileName;
      el.style.cursor = "pointer";
      el.onmouseenter = (): void => {
        el.style.backgroundColor = previewContext.hoverColor;
      };
      el.onmouseleave = (): void => {
        el.style.backgroundColor = null as unknown as string;
      };
      el.onclick = (): void => {
        waveformContext.referenceVisible = true;
        waveformContext.soundVisible = true;
        drawWaveform?.();
        if (waveformContext.referenceBuffer) {
          playSound?.(waveformContext.referenceBuffer);
        }
      };
    } else {
      el.textContent = "";
      el.style.cursor = null as unknown as string;
      el.onmouseenter = null;
      el.onmouseleave = null;
      el.onclick = null;
    }
  }
};

const updateSwapElement = (
  waveformContext: WaveformContext,
  _previewContext: PreviewConfig,
  el: HTMLElement
): void => {
  if (el) {
    if (waveformContext.referenceBuffer && waveformContext.referenceFileName) {
      el.style.visibility = null as unknown as string;
    } else {
      el.style.visibility = "hidden";
    }
  }
};

const getOrCreateFileInput = (
  waveformContext: WaveformContext,
  previewContext: PreviewConfig,
  previewEl: HTMLElement,
  drawWaveform: () => void,
  playSound: (buffer: Float32Array) => void
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
  containerEl.style.color = waveformContext.waveColor;
  containerEl.style.borderBottom = "1px solid #FFFFFF26";
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
  filenameEl.textContent = waveformContext.referenceFileName || "";
  containerEl.appendChild(filenameEl);
  const swapButtonEl = document.createElement("label");
  swapButtonEl.style.borderRadius = "4px";
  swapButtonEl.style.cursor = "pointer";
  swapButtonEl.style.position = "relative";
  swapButtonEl.style.display = "flex";
  swapButtonEl.style.justifyContent = "center";
  swapButtonEl.style.alignItems = "center";
  swapButtonEl.style.color = waveformContext.referenceColor;
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
    swapButtonEl.style.backgroundColor = previewContext.hoverColor;
  };
  swapButtonEl.onmouseleave = (): void => {
    swapButtonEl.style.backgroundColor = null as unknown as string;
  };
  swapButtonEl.onpointerdown = (): void => {
    swapButtonEl.style.backgroundColor = previewContext.tapColor;
  };
  swapButtonEl.onpointerup = (): void => {
    swapButtonEl.style.backgroundColor = previewContext.hoverColor;
  };
  swapButtonEl.onclick = (): void => {
    if (waveformContext.referenceVisible) {
      swapButtonEl.style.color = waveformContext.waveColor;
      waveformContext.soundVisible = true;
      waveformContext.referenceVisible = false;
    } else {
      swapButtonEl.style.color = waveformContext.referenceColor;
      waveformContext.referenceVisible = true;
      waveformContext.soundVisible = false;
    }
    drawWaveform?.();
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
    plusButtonEl.style.backgroundColor = previewContext.hoverColor;
  };
  plusButtonEl.onmouseleave = (): void => {
    plusButtonEl.style.backgroundColor = null as unknown as string;
  };
  plusButtonEl.onpointerdown = (): void => {
    plusButtonEl.style.backgroundColor = previewContext.tapColor;
  };
  plusButtonEl.onpointerup = (): void => {
    plusButtonEl.style.backgroundColor = previewContext.hoverColor;
  };
  updateFilenameElement(
    waveformContext,
    previewContext,
    filenameEl,
    drawWaveform,
    playSound
  );
  updateSwapElement(waveformContext, previewContext, swapButtonEl);
  return newEl;
};

const updateRangeFill = (
  context: WaveformContext,
  rangeEl: HTMLElement
): void => {
  const fillEl = rangeEl?.parentElement?.firstElementChild as HTMLElement;
  if (fillEl) {
    fillEl.style.transform = `translateX(${
      getCurrentZoomLevel(context) * 100
    }%)`;
  }
};

export const updateWaveformElement = (
  waveformContext: WaveformContext,
  previewContext: PreviewConfig,
  audioContext: AudioContext,
  el: HTMLElement,
  playSound: (audioContext: AudioContext, buffer: Float32Array) => void
): void => {
  if (el) {
    const play = (buffer: Float32Array) => playSound?.(audioContext, buffer);
    const draw = () => drawSoundWaveform(canvasContext, waveformContext);

    el.style.minWidth = `${waveformContext.width}px`;

    const rangeInput = getOrCreateRangeInput(
      waveformContext,
      previewContext,
      el
    );
    updateRangeFill(waveformContext, rangeInput);
    const onRangePointerMove = throttle((): void => {
      const width = waveformContext.width;
      const x = width * 0.5;
      const bufferLength = getMaxBufferLength(
        waveformContext.soundBuffer,
        waveformContext.referenceBuffer
      );
      zoomWaveform(
        waveformContext,
        Number(rangeInput.value),
        x,
        width,
        bufferLength
      );
      updateRangeFill(waveformContext, rangeInput);
      draw();
      draggableArea.style.cursor = "grab";
    }, 100);
    const onRangePointerUp = (): void => {
      const width = waveformContext.width;
      const x = width * 0.5;
      const bufferLength = getMaxBufferLength(
        waveformContext.soundBuffer,
        waveformContext.referenceBuffer
      );
      zoomWaveform(
        waveformContext,
        Number(rangeInput.value),
        x,
        width,
        bufferLength
      );
      updateRangeFill(waveformContext, rangeInput);
      draw();
      draggableArea.style.cursor = "grab";
      window.removeEventListener("pointermove", onRangePointerMove);
    };
    rangeInput.onpointerdown = (): void => {
      const width = waveformContext.width;
      const x = width * 0.5;
      const bufferLength = getMaxBufferLength(
        waveformContext.soundBuffer,
        waveformContext.referenceBuffer
      );
      zoomWaveform(
        waveformContext,
        Number(rangeInput.value),
        x,
        width,
        bufferLength
      );
      updateRangeFill(waveformContext, rangeInput);
      draw();
      draggableArea.style.cursor = "grab";
      window.addEventListener("pointermove", onRangePointerMove);
      window.addEventListener("pointerup", onRangePointerUp, {
        once: true,
      });
    };

    const draggableArea = getOrCreateDraggableArea(el);
    draggableArea.style.height = `${waveformContext.height}px`;
    draggableArea.style.cursor = "grab";

    const canvas = getOrCreateCanvas(draggableArea);
    canvas.width = waveformContext.width;
    canvas.height = waveformContext.height;
    const canvasContext = canvas.getContext("2d");
    draw();

    if (waveformContext.referenceFileName != null) {
      const fileInput = getOrCreateFileInput(
        waveformContext,
        previewContext,
        el,
        draw,
        play
      );
      fileInput.onchange = (e: Event): void => {
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
          loadAudioBytes(fileUrl, audioContext).then((value: Float32Array) => {
            waveformContext.referenceFileName = file.name;
            waveformContext.referenceBuffer = value;
            if (filenameEl) {
              updateFilenameElement(
                waveformContext,
                previewContext,
                filenameEl,
                draw,
                play
              );
            }
            if (swapLabelEl) {
              updateSwapElement(waveformContext, previewContext, swapLabelEl);
            }
            drawSoundWaveform(canvasContext, waveformContext);
          });
        } else {
          waveformContext.referenceFileName = "";
          waveformContext.referenceBuffer = undefined;
          if (filenameEl) {
            updateFilenameElement(
              waveformContext,
              previewContext,
              filenameEl,
              draw,
              play
            );
          }
          if (swapLabelEl) {
            updateSwapElement(waveformContext, previewContext, swapLabelEl);
          }
          drawSoundWaveform(canvasContext, waveformContext);
        }
      };
    }

    let startX: number | undefined;
    let prevXOffset: number | undefined;
    let clicked = false;
    const onPreviewPointerMove = throttle((e: MouseEvent): void => {
      if (startX != null) {
        const deltaX = e.clientX - startX;
        if (Math.abs(deltaX) > 0) {
          clicked = false;
        }
        panWaveform(waveformContext, (prevXOffset ?? 0) + deltaX);
        drawSoundWaveform(canvasContext, waveformContext);
      }
    }, 100);
    const onPreviewPointerUp = (): void => {
      document.documentElement.style.cursor = null as unknown as string;
      draggableArea.style.cursor = "grab";
      draggableArea.style.backgroundColor = null as unknown as string;
      startX = undefined;
      if (clicked) {
        if (waveformContext.soundBuffer) {
          play?.(waveformContext.soundBuffer);
        }
      }
      window.removeEventListener("pointermove", onPreviewPointerMove);
    };
    draggableArea.onpointerup = (): void => {
      draggableArea.style.backgroundColor = previewContext.hoverColor;
    };
    draggableArea.onpointerdown = (e: PointerEvent): void => {
      clicked = true;
      startX = e.clientX;
      prevXOffset = waveformContext.xOffset;
      document.documentElement.style.cursor = "grabbing";
      draggableArea.style.cursor = "grabbing";
      draggableArea.style.backgroundColor = previewContext.tapColor;
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
        waveformContext.soundBuffer,
        waveformContext.referenceBuffer
      );
      zoomWaveform(
        waveformContext,
        waveformContext.zoomOffset - e.deltaY,
        x,
        width,
        bufferLength
      );
      updateRangeFill(waveformContext, rangeInput);
      drawSoundWaveform(canvasContext, waveformContext);
      if (rangeInput) {
        rangeInput.value = `${waveformContext.zoomOffset}`;
      }
      draggableArea.style.cursor = "grab";
    };
  }
};
