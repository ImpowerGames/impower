export interface WaveformConfig {
  width: number;
  height: number;

  maxZoomOffset: number;
  maxScale: number;

  xAxisColor?: string;
  frequencyFillColor?: string;
  volumeFillColor?: string;
  referenceColor?: string;
  waveColor?: string;
}

export interface WaveformContext extends WaveformConfig {
  soundBuffer?: Float32Array;
  volumeBuffer?: Float32Array;
  pitchBuffer?: Float32Array;
  referenceBuffer?: Float32Array;
  referenceFileName?: string;
  pitchRange?: [number, number];

  xOffset: number;
  zoomOffset: number;
  soundVisible?: boolean;
  referenceVisible?: boolean;
}

const DEFAULT_COLORS = {
  xAxisColor: "#ffffff",
  frequencyFillColor: "#5a3663CC",
  volumeFillColor: "#4090bf26",
  referenceColor: "#d92662",
  waveColor: "#42a0d7",
};

const EASE = { linear: (x: number) => x };
const interpolate = (
  t: number,
  a: number,
  b: number,
  ease = (t: number) => t,
) => {
  if (t <= 0) return a;
  if (!ease) return b;
  const p = t > 1 ? t - Math.floor(t) : t;
  return a * (1 - ease(p)) + b * ease(p);
};
const lerp = (percentage: number, min: number, max: number) =>
  interpolate(percentage, min, max, EASE.linear);

const getCurrentZoomLevel = (context: {
  zoomOffset: number;
  maxZoomOffset: number;
}) => context.zoomOffset / context.maxZoomOffset;

const getCurrentScale = (context: WaveformContext) =>
  lerp(getCurrentZoomLevel(context), 1, context.maxScale);

const getMaxBufferLength = (
  ...buffers: (Float32Array<ArrayBufferLike> | undefined)[]
) => Math.max(...buffers.map((b) => b?.length || 0));

const getSampleIndex = (
  x: number,
  startX: number,
  endX: number,
  bufferLength: number,
) => Math.floor(((x - startX) / (endX - 1)) * (bufferLength - 1));

export const drawSoundWaveform = (
  canvasContext: CanvasRenderingContext2D | null,
  context: WaveformContext,
) => {
  if (!canvasContext) return;
  const {
    width,
    height,
    xOffset,
    soundBuffer,
    volumeBuffer,
    pitchBuffer,
    pitchRange = [0, 0],
  } = context;
  const endX = width * getCurrentScale(context);
  const startX = xOffset;
  const startY = height / 2;
  const bufferLength = getMaxBufferLength(soundBuffer);
  const [minPitch, maxPitch] = pitchRange;

  canvasContext.clearRect(0, 0, width, height);

  const frequencyFillColor =
    context.frequencyFillColor ?? DEFAULT_COLORS.frequencyFillColor;
  const xAxisColor = context.xAxisColor ?? DEFAULT_COLORS.xAxisColor;
  const volumeFillColor =
    context.volumeFillColor ?? DEFAULT_COLORS.volumeFillColor;
  const waveColor = context.waveColor ?? DEFAULT_COLORS.waveColor;

  if (pitchBuffer) {
    canvasContext.fillStyle = frequencyFillColor;
    canvasContext.beginPath();
    canvasContext.moveTo(startX, height);
    for (let x = 0; x < width; x++) {
      const i = getSampleIndex(x, startX, endX, bufferLength);
      if (i >= 0 && i < bufferLength) {
        const mag =
          maxPitch === minPitch
            ? 0.5
            : (pitchBuffer[i] - minPitch) / (maxPitch - minPitch);
        canvasContext.lineTo(x, height - mag * height);
      }
    }
    canvasContext.lineTo(endX, height);
    canvasContext.closePath();
    canvasContext.fill();
  }

  canvasContext.lineWidth = 1;
  canvasContext.strokeStyle = xAxisColor;
  canvasContext.beginPath();
  canvasContext.moveTo(0, startY);
  canvasContext.lineTo(width, startY);
  canvasContext.stroke();

  if (volumeBuffer) {
    canvasContext.fillStyle = volumeFillColor;
    canvasContext.beginPath();
    canvasContext.moveTo(startX, startY);
    for (let x = 0; x < width; x++) {
      const i = getSampleIndex(x, startX, endX, bufferLength);
      if (i >= 0 && i < bufferLength)
        canvasContext.lineTo(x, startY - (volumeBuffer[i] || 0) * (height / 2));
    }
    for (let x = width - 1; x >= 0; x--) {
      const i = getSampleIndex(x, startX, endX, bufferLength);
      if (i >= 0 && i < bufferLength)
        canvasContext.lineTo(x, startY + (volumeBuffer[i] || 0) * (height / 2));
    }
    canvasContext.closePath();
    canvasContext.fill();
  }

  if (soundBuffer) {
    canvasContext.lineWidth = 2;
    canvasContext.strokeStyle = waveColor;
    canvasContext.beginPath();
    canvasContext.moveTo(startX, startY);
    for (let x = 0; x < width; x++) {
      const i = getSampleIndex(x, startX, endX, bufferLength);
      if (i >= 0 && i < bufferLength)
        canvasContext.lineTo(x, startY - (soundBuffer[i] || 0) * (height / 2));
    }
    canvasContext.stroke();
  }
};
