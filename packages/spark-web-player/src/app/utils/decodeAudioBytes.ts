const OPUS_RATE = 48000;

export interface OggOpusStream {
  channels: number;
  preSkip: number;
  outputGain: number;
  streamCount: number;
  coupledStreamCount: number;
  channelMappingTable: number[];
  packets: Uint8Array[];
  finalGranule: number;
}

const ascii = (bytes: Uint8Array, offset: number, text: string) => {
  if (offset + text.length > bytes.length) {
    return false;
  }
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) {
      return false;
    }
  }
  return true;
};

export const isOggOpus = (bytes: Uint8Array): boolean => {
  if (!ascii(bytes, 0, "OggS") || bytes.length < 27) {
    return false;
  }
  const segments = bytes[26]!;
  return ascii(bytes, 27 + segments, "OpusHead");
};

export const readOggOpus = (bytes: Uint8Array): OggOpusStream | null => {
  if (!isOggOpus(bytes)) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const packets: Uint8Array[] = [];
  let partial: Uint8Array[] = [];
  let serial: number | undefined;
  let finalGranule = 0;
  let offset = 0;
  while (offset + 27 <= bytes.length && ascii(bytes, offset, "OggS")) {
    const pageSerial = view.getUint32(offset + 14, true);
    const granule = Number(view.getBigInt64(offset + 6, true));
    const segments = bytes[offset + 26]!;
    let body = offset + 27 + segments;
    serial ??= pageSerial;
    for (let i = 0; i < segments; i++) {
      const length = bytes[offset + 27 + i]!;
      if (pageSerial === serial) {
        partial.push(bytes.subarray(body, body + length));
        if (length < 255) {
          packets.push(concat(partial));
          partial = [];
        }
      }
      body += length;
    }
    if (pageSerial === serial && granule >= 0) {
      finalGranule = granule;
    }
    offset = body;
  }
  const head = packets[0];
  if (!head || head.length < 19 || packets.length < 2) {
    return null;
  }
  const headView = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const channels = head[9]!;
  const family = head[18]!;
  const mapped = family !== 0 && head.length >= 21 + channels;
  return {
    channels,
    preSkip: headView.getUint16(10, true),
    outputGain: headView.getInt16(16, true),
    streamCount: mapped ? head[19]! : 1,
    coupledStreamCount: mapped ? head[20]! : channels - 1,
    channelMappingTable: mapped
      ? Array.from(head.subarray(21, 21 + channels))
      : channels === 1
        ? [0]
        : [0, 1],
    packets: packets.slice(2),
    finalGranule,
  };
};

const concat = (parts: Uint8Array[]): Uint8Array => {
  if (parts.length === 1) {
    return parts[0]!;
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
};

export const decodeOggOpus = async (
  stream: OggOpusStream,
  context: BaseAudioContext,
): Promise<AudioBuffer> => {
  const { OpusDecoder } = await import("opus-decoder");
  const decoder = new OpusDecoder({
    channels: stream.channels,
    preSkip: stream.preSkip,
    streamCount: stream.streamCount,
    coupledStreamCount: stream.coupledStreamCount,
    channelMappingTable: stream.channelMappingTable,
  });
  try {
    await decoder.ready;
    const decoded = decoder.decodeFrames(stream.packets);
    const expected = stream.finalGranule - stream.preSkip;
    const length =
      expected > 0
        ? Math.min(decoded.samplesDecoded, expected)
        : decoded.samplesDecoded;
    if (length <= 0) {
      throw new DOMException("Unable to decode audio data", "EncodingError");
    }
    const gain = Math.pow(10, stream.outputGain / (20 * 256));
    const buffer = context.createBuffer(
      decoded.channelData.length,
      length,
      OPUS_RATE,
    );
    decoded.channelData.forEach((samples, channel) => {
      const data = samples.subarray(0, length) as Float32Array<ArrayBuffer>;
      if (gain !== 1) {
        for (let i = 0; i < data.length; i++) {
          data[i] = data[i]! * gain;
        }
      }
      buffer.copyToChannel(data, channel);
    });
    return buffer;
  } finally {
    decoder.free();
  }
};

export const decodeAudioBytes = async (
  context: BaseAudioContext,
  bytes: ArrayBuffer,
): Promise<AudioBuffer> => {
  const opus = isOggOpus(new Uint8Array(bytes))
    ? new Uint8Array(bytes.slice(0))
    : null;
  try {
    return await context.decodeAudioData(bytes);
  } catch (error) {
    const stream = opus ? readOggOpus(opus) : null;
    if (!stream) {
      throw error;
    }
    return decodeOggOpus(stream, context);
  }
};
