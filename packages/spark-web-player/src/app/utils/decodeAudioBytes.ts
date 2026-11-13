const OPUS_RATE = 48000;
const BEGINNING_OF_STREAM = 2;
const END_OF_STREAM = 4;

const WEB_AUDIO_ORDER_FROM_VORBIS_ORDER: Record<number, number[]> = {
  3: [0, 2, 1],
  5: [0, 2, 1, 3, 4],
  6: [0, 2, 1, 5, 3, 4],
  7: [0, 2, 1, 6, 5, 3, 4],
  8: [0, 2, 1, 7, 5, 6, 3, 4],
};

export interface OggOpusLink {
  channels: number;
  preSkip: number;
  outputGain: number;
  family: number;
  streamCount: number;
  coupledStreamCount: number;
  channelMappingTable: number[];
  packets: Uint8Array[];
  origin: number;
  finalGranule: number;
}

interface OggPage {
  flags: number;
  granule: number;
  completed: number[];
}

interface OggLogicalStream {
  serial: number;
  group: number;
  partial: Uint8Array[];
  packets: Uint8Array[];
  pages: OggPage[];
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

export const isOggOpus = (bytes: Uint8Array): boolean => {
  if (bytes.length < 27 || !ascii(bytes, 0, "OggS")) {
    return false;
  }
  return ascii(bytes, 27 + bytes[26]!, "OpusHead");
};

const opusPacketSamples = (packet: Uint8Array): number => {
  if (packet.length === 0) {
    return 0;
  }
  const config = packet[0]! >> 3;
  const frameSize =
    config < 12
      ? [480, 960, 1920, 2880][config % 4]!
      : config < 16
        ? [480, 960][config % 2]!
        : [120, 240, 480, 960][config % 4]!;
  const code = packet[0]! & 3;
  const frames =
    code === 0 ? 1 : code !== 3 ? 2 : packet.length > 1 ? packet[1]! & 0x3f : 0;
  return frameSize * frames;
};

const readOggStreams = (bytes: Uint8Array): OggLogicalStream[] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const streams: OggLogicalStream[] = [];
  const current = new Map<number, OggLogicalStream>();
  let group = 0;
  let groupHasData = false;
  let offset = 0;
  while (offset + 27 <= bytes.length && ascii(bytes, offset, "OggS")) {
    const flags = bytes[offset + 5]!;
    const granule = Number(view.getBigInt64(offset + 6, true));
    const serial = view.getUint32(offset + 14, true);
    const segments = bytes[offset + 26]!;
    if (flags & BEGINNING_OF_STREAM) {
      if (groupHasData) {
        group++;
        groupHasData = false;
      }
      const stream: OggLogicalStream = {
        serial,
        group,
        partial: [],
        packets: [],
        pages: [],
      };
      streams.push(stream);
      current.set(serial, stream);
    } else {
      groupHasData = true;
    }
    const stream = current.get(serial);
    const page: OggPage = { flags, granule, completed: [] };
    let body = offset + 27 + segments;
    for (let i = 0; i < segments; i++) {
      const length = bytes[offset + 27 + i]!;
      if (stream && body + length <= bytes.length) {
        stream.partial.push(bytes.subarray(body, body + length));
        if (length < 255) {
          page.completed.push(stream.packets.length);
          stream.packets.push(concat(stream.partial));
          stream.partial = [];
        }
      }
      body += length;
    }
    stream?.pages.push(page);
    offset = body;
  }
  return streams;
};

const readLink = (stream: OggLogicalStream): OggOpusLink | null => {
  const head = stream.packets[0];
  if (!head || head.length < 19 || !ascii(head, 0, "OpusHead")) {
    return null;
  }
  const headView = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const channels = head[9]!;
  const family = head[18]!;
  const mapped = family !== 0 && head.length >= 21 + channels;
  const preSkip = headView.getUint16(10, true);
  const firstAudioPage = stream.pages.find((page) =>
    page.completed.some((index) => index >= 2),
  );
  let origin = 0;
  if (firstAudioPage && !(firstAudioPage.flags & END_OF_STREAM)) {
    const samples = firstAudioPage.completed
      .filter((index) => index >= 2)
      .reduce((sum, index) => sum + opusPacketSamples(stream.packets[index]!), 0);
    origin = Math.max(0, firstAudioPage.granule - samples);
  }
  let finalGranule = 0;
  for (const page of stream.pages) {
    if (page.granule >= 0 && page.completed.length > 0) {
      finalGranule = page.granule;
    }
  }
  return {
    channels,
    preSkip,
    outputGain: headView.getInt16(16, true),
    family,
    streamCount: mapped ? head[19]! : 1,
    coupledStreamCount: mapped ? head[20]! : channels - 1,
    channelMappingTable: mapped
      ? Array.from(head.subarray(21, 21 + channels))
      : channels === 1
        ? [0]
        : [0, 1],
    packets: stream.packets.slice(2),
    origin,
    finalGranule,
  };
};

export const readOggOpus = (bytes: Uint8Array): OggOpusLink[] => {
  if (!isOggOpus(bytes)) {
    return [];
  }
  const links: OggOpusLink[] = [];
  const decodedGroups = new Set<number>();
  for (const stream of readOggStreams(bytes)) {
    if (decodedGroups.has(stream.group)) {
      continue;
    }
    const link = readLink(stream);
    if (link && link.packets.length > 0) {
      links.push(link);
      decodedGroups.add(stream.group);
    }
  }
  return links;
};

const decodeLink = async (link: OggOpusLink): Promise<Float32Array[]> => {
  const { OpusDecoder } = await import("opus-decoder");
  const decoder = new OpusDecoder({
    channels: link.channels,
    preSkip: link.preSkip,
    streamCount: link.streamCount,
    coupledStreamCount: link.coupledStreamCount,
    channelMappingTable: link.channelMappingTable,
  });
  try {
    await decoder.ready;
    const decoded = decoder.decodeFrames(link.packets);
    const expected = link.finalGranule - link.origin - link.preSkip;
    const length =
      expected > 0
        ? Math.min(decoded.samplesDecoded, expected)
        : decoded.samplesDecoded;
    const order =
      link.family === 1
        ? WEB_AUDIO_ORDER_FROM_VORBIS_ORDER[decoded.channelData.length]
        : undefined;
    const gain = Math.pow(10, link.outputGain / (20 * 256));
    return (order ?? decoded.channelData.map((_, i) => i)).map((source) => {
      const samples = decoded.channelData[source]!.slice(0, Math.max(0, length));
      if (gain !== 1) {
        for (let i = 0; i < samples.length; i++) {
          samples[i] = samples[i]! * gain;
        }
      }
      return samples;
    });
  } finally {
    decoder.free();
  }
};

export const decodeOggOpus = async (
  links: OggOpusLink[],
  context: BaseAudioContext,
): Promise<AudioBuffer> => {
  const decoded: Float32Array[][] = [];
  for (const link of links) {
    decoded.push(await decodeLink(link));
  }
  const channels = Math.max(0, ...decoded.map((link) => link.length));
  const length = decoded.reduce((sum, link) => sum + (link[0]?.length ?? 0), 0);
  if (channels === 0 || length === 0) {
    throw new DOMException("Unable to decode audio data", "EncodingError");
  }
  const buffer = context.createBuffer(channels, length, OPUS_RATE);
  const output = Array.from({ length: channels }, () => new Float32Array(length));
  let offset = 0;
  for (const link of decoded) {
    for (let channel = 0; channel < channels; channel++) {
      const samples = link.length === 1 ? link[0] : link[channel];
      if (samples) {
        output[channel]!.set(samples, offset);
      }
    }
    offset += link[0]?.length ?? 0;
  }
  output.forEach((samples, channel) =>
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, channel),
  );
  return buffer;
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
    const links = opus ? readOggOpus(opus) : [];
    if (links.length === 0) {
      throw error;
    }
    return decodeOggOpus(links, context);
  }
};
