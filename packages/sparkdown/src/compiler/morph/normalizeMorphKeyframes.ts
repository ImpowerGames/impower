const readOffset = (keyframe: unknown): number | null => {
  const raw = (keyframe as { offset?: unknown } | null)?.offset;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 1
    ? raw
    : null;
};

export function resolveMorphKeyframeOffsets(
  keyframes: readonly unknown[],
): number[] {
  const max = keyframes.length - 1;
  if (max < 0) return [];
  if (max === 0) return [readOffset(keyframes[0]) ?? 1];
  const resolved = keyframes.map(readOffset);
  resolved[0] ??= 0;
  resolved[max] ??= 1;
  let anchor = 0;
  for (let i = 1; i <= max; i++) {
    if (resolved[i] == null) continue;
    const span = i - anchor;
    if (span > 1) {
      const from = resolved[anchor]!;
      const step = (resolved[i]! - from) / span;
      for (let j = anchor + 1; j < i; j++) {
        resolved[j] = from + step * (j - anchor);
      }
    }
    anchor = i;
  }
  return resolved as number[];
}

export function normalizeMorphKeyframes(
  keyframes: readonly unknown[],
): Record<string, unknown>[] {
  const offsets = resolveMorphKeyframeOffsets(keyframes);
  return keyframes.map((keyframe, i) => ({
    ...(keyframe && typeof keyframe === "object" && !Array.isArray(keyframe)
      ? (keyframe as Record<string, unknown>)
      : {}),
    offset: offsets[i]!,
  }));
}
