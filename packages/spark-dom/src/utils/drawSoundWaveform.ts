const X_AXIS_COLOR = "#ffffff";
const FREQUENCY_FILL_COLOR = "#5a3663CC";
const VOLUME_FILL_COLOR = "#4090bf26";
const REFERENCE_COLOR = "#d92662";
const WAVE_COLOR = "#42a0d7";

const getMaxBufferLength = (
  ...buffers: (Float32Array | undefined)[]
): number => {
  return Math.max(...buffers.map((b) => b?.length || 0));
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

const drawSoundWaveform = (
  ctx: CanvasRenderingContext2D | undefined,
  buffers: {
    soundBuffer?: Float32Array;
    referenceBuffer?: Float32Array;
    volumeBuffer?: Float32Array;
    pitchBuffer?: Float32Array;
    pitchRange?: [number, number];
  },
  options: {
    width: number;
    height: number;
    scale: number;
    xOffset: number;
    referenceColor: string;
    axisColor: string;
    frequencyColor: string;
    volumeColor: string;
    waveColor: string;
    visible: "both" | "reference" | "sound";
  }
): void => {
  if (!ctx) {
    return;
  }

  const soundBuffer = buffers.soundBuffer;
  const referenceBuffer = buffers.referenceBuffer;
  const volumeBuffer = buffers.volumeBuffer;
  const pitchBuffer = buffers.pitchBuffer;
  const pitchRange = buffers.pitchRange;

  const width = options.width;
  const height = options.height;
  const scale = options.scale;
  const xOffset = options.xOffset;
  const axisColor = options.axisColor ?? X_AXIS_COLOR;
  const frequencyColor = options.frequencyColor ?? FREQUENCY_FILL_COLOR;
  const volumeColor = options.volumeColor ?? VOLUME_FILL_COLOR;
  const referenceColor = options.referenceColor ?? REFERENCE_COLOR;
  const waveColor = options.waveColor ?? WAVE_COLOR;
  const visible = options.visible ?? "both";

  const [minPitch, maxPitch] = pitchRange || [0, 0];

  const endX = width * scale;
  const startX = xOffset;
  const startY = height / 2;

  const visibleStartX = 0;
  const visibleEndX = width;

  const bufferLength = getMaxBufferLength(soundBuffer, referenceBuffer);

  ctx.clearRect(0, 0, 500, 500);

  // Axis
  ctx.lineWidth = 1;
  ctx.strokeStyle = axisColor;
  ctx.beginPath();
  ctx.moveTo(0, startY);
  ctx.lineTo(visibleEndX, startY);
  ctx.stroke();

  if (pitchBuffer) {
    // Frequency
    ctx.lineWidth = 1;
    ctx.fillStyle = frequencyColor;
    ctx.beginPath();
    ctx.moveTo(startX, height);
    for (let x = visibleStartX; x < visibleEndX; x += 1) {
      const bufferIndex = getSampleIndex(x, startX, endX, bufferLength);
      if (bufferIndex >= 0) {
        const val = pitchBuffer[bufferIndex]!;
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

  if (volumeBuffer) {
    // Volume
    ctx.lineWidth = 1;
    ctx.fillStyle = volumeColor;
    ctx.beginPath();
    ctx.moveTo(startX, height);
    for (let x = visibleStartX; x < visibleEndX; x += 1) {
      const bufferIndex = getSampleIndex(x, startX, endX, bufferLength);
      if (bufferIndex >= 0) {
        const val = volumeBuffer[bufferIndex]!;
        const delta = val * (height / 2);
        const y = startY - delta;
        ctx.lineTo(x, y);
      }
    }
    ctx.lineTo(endX, height);
    ctx.closePath();
    ctx.fill();
  }

  if (referenceBuffer && (visible === "both" || visible === "reference")) {
    // Reference Wave
    ctx.lineWidth = 1;
    ctx.strokeStyle = referenceColor;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let x = visibleStartX; x < visibleEndX; x += 1) {
      const bufferIndex = getSampleIndex(x, startX, endX, bufferLength);
      if (bufferIndex >= 0) {
        const val = referenceBuffer[bufferIndex]!;
        const delta = val * 50;
        const y = startY + delta;
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  if (soundBuffer && (visible === "both" || visible === "sound")) {
    // Wave
    ctx.lineWidth = 1;
    ctx.strokeStyle = waveColor;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    for (let x = visibleStartX; x < visibleEndX; x += 1) {
      const bufferIndex = getSampleIndex(x, startX, endX, bufferLength);
      if (bufferIndex >= 0) {
        const val = soundBuffer[bufferIndex]!;
        const delta = val * 50;
        const y = startY + delta;
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
};

export default drawSoundWaveform;
