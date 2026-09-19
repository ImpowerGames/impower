const readOffset = (keyframe: unknown): number | null => {
  const raw = (keyframe as { offset?: unknown } | null)?.offset;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 1
    ? raw
    : null;
};

/**
 * Every keyframe's position from 0 to 1. Authored offsets are kept; the first
 * and last keyframes default to 0 and 1, and the rest are spaced evenly between
 * the authored positions around them. This is the Web Animations rule
 * `animation` keyframes follow, so a list with omitted offsets, the same list
 * with every offset written, and the `from:`/`50%:`/`to:` spelling all
 * normalize to the same poses.
 */
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

/** The keyframes with every `offset` filled in by `resolveMorphKeyframeOffsets`. */
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
