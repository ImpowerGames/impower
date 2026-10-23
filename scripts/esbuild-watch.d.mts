// Types for esbuild-watch.mjs, for the TypeScript build scripts that call it.
// The context is typed by the one method the helper calls rather than by
// esbuild's BuildContext: callers load different esbuild versions (the
// extension's own ^0.25, the hoisted 0.18 elsewhere).

export function watchBuild(
  ctx: {
    rebuild(): Promise<{ metafile?: { inputs: Record<string, unknown> } }>;
  },
  options?: {
    extraInputs?: () => Iterable<string>;
    onError?: (error: unknown) => void;
    debounceMs?: number;
    cwd?: string;
  },
): Promise<{ watched(): string[]; close(): void }>;
