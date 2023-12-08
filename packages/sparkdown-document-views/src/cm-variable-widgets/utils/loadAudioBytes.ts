export const loadAudioBytes = async (
  url: string,
  audioContext: AudioContext
): Promise<Float32Array> => {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const decoded = await audioContext.decodeAudioData(buffer);
  return decoded.getChannelData(0);
};
