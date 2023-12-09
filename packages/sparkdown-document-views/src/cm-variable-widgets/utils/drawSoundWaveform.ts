import { WaveformContext } from "../types/WaveformContext";
import { getCurrentScale } from "./getCurrentScale";
import { getMaxBufferLength } from "./getMaxBufferLength";
import { getSampleIndex } from "./getSampleIndex";

export const drawSoundWaveform = (
  canvasContext: CanvasRenderingContext2D | null,
  context: WaveformContext
): void => {
  if (!canvasContext) {
    return;
  }

  const width = context.width;
  const height = context.height;
  const xOffset = context.xOffset;

  const soundBuffer = context.soundBuffer;
  const volumeBuffer = context.volumeBuffer;
  const pitchBuffer = context.pitchBuffer;
  const referenceBuffer = context.referenceBuffer;
  const pitchRange = context.pitchRange ?? [0, 0];

  const soundVisible = context?.soundVisible ?? true;
  const referenceVisible = context?.referenceVisible ?? true;

  const xAxisColor = context?.xAxisColor;
  const frequencyFillColor = context?.frequencyFillColor;
  const volumeFillColor = context?.volumeFillColor;
  const referenceColor = context?.referenceColor;
  const waveColor = context?.waveColor;

  const [minPitch, maxPitch] = pitchRange;

  const endX = width * getCurrentScale(context);
  const startX = xOffset;
  const startY = height / 2;

  const visibleStartX = 0;
  const visibleEndX = width;

  const bufferLength = getMaxBufferLength(soundBuffer, referenceBuffer);

  canvasContext.clearRect(0, 0, 500, 500);

  // Axis
  canvasContext.lineWidth = 1;
  canvasContext.strokeStyle = xAxisColor;
  canvasContext.beginPath();
  canvasContext.moveTo(0, startY);
  canvasContext.lineTo(visibleEndX, startY);
  canvasContext.stroke();

  if (pitchBuffer) {
    // Frequency
    canvasContext.lineWidth = 1;
    canvasContext.fillStyle = frequencyFillColor;
    canvasContext.beginPath();
    canvasContext.moveTo(startX, height);
    for (let x = visibleStartX; x < visibleEndX; x += 1) {
      const bufferIndex = getSampleIndex(x, startX, endX, bufferLength);
      if (bufferIndex >= 0) {
        const val = pitchBuffer[bufferIndex] ?? 0;
        const mag =
          maxPitch === minPitch
            ? 0.5
            : (val - minPitch) / (maxPitch - minPitch);
        const delta = mag * (height / 2);
        const y = startY - delta;
        canvasContext.lineTo(x, y);
      }
    }
    canvasContext.lineTo(endX, height);
    canvasContext.closePath();
    canvasContext.fill();
  }

  if (volumeBuffer) {
    // Volume
    canvasContext.lineWidth = 1;
    canvasContext.fillStyle = volumeFillColor;
    canvasContext.beginPath();
    canvasContext.moveTo(startX, height);
    for (let x = visibleStartX; x < visibleEndX; x += 1) {
      const bufferIndex = getSampleIndex(x, startX, endX, bufferLength);
      if (bufferIndex >= 0) {
        const val = volumeBuffer[bufferIndex] ?? 0;
        const delta = val * (height / 2);
        const y = startY - delta;
        canvasContext.lineTo(x, y);
      }
    }
    canvasContext.lineTo(endX, height);
    canvasContext.closePath();
    canvasContext.fill();
  }

  if (referenceBuffer && referenceVisible) {
    // Reference Wave
    canvasContext.lineWidth = 1;
    canvasContext.strokeStyle = referenceColor;
    canvasContext.beginPath();
    canvasContext.moveTo(startX, startY);
    for (let x = visibleStartX; x < visibleEndX; x += 1) {
      const bufferIndex = getSampleIndex(x, startX, endX, bufferLength);
      if (bufferIndex >= 0) {
        const val = referenceBuffer[bufferIndex] ?? 0;
        const delta = val * 50;
        const y = startY + delta;
        canvasContext.lineTo(x, y);
      }
    }
    canvasContext.stroke();
  }

  if (soundBuffer && soundVisible) {
    // Wave
    canvasContext.lineWidth = 1;
    canvasContext.strokeStyle = waveColor;
    canvasContext.beginPath();
    canvasContext.moveTo(startX, startY);
    for (let x = visibleStartX; x < visibleEndX; x += 1) {
      const bufferIndex = getSampleIndex(x, startX, endX, bufferLength);
      if (bufferIndex >= 0) {
        const val = soundBuffer[bufferIndex] ?? 0;
        const delta = val * 50;
        const y = startY + delta;
        canvasContext.lineTo(x, y);
      }
    }
    canvasContext.stroke();
  }
};
