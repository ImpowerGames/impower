import fs from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { ARTIFACTS_DIR, PIXEL } from "../parity.config";

export interface PixelResult {
  width: number;
  height: number;
  /** mismatched pixel count, or -1 on size mismatch. */
  mismatch: number;
  ratio: number;
  sizeMismatch?: { a: [number, number]; b: [number, number] };
  diff?: PNG;
}

/** Live A/B pixel comparison (§7). */
export function comparePixels(
  aBuf: Buffer,
  bBuf: Buffer,
  opts: { threshold?: number; includeAA?: boolean } = {},
): PixelResult {
  const a = PNG.sync.read(aBuf);
  const b = PNG.sync.read(bBuf);
  if (a.width !== b.width || a.height !== b.height) {
    return {
      width: 0,
      height: 0,
      mismatch: -1,
      ratio: 1,
      sizeMismatch: { a: [a.width, a.height], b: [b.width, b.height] },
    };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const mismatch = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: opts.threshold ?? PIXEL.threshold,
    includeAA: opts.includeAA ?? PIXEL.includeAA,
    alpha: 0.4,
    diffColor: [255, 0, 0],
  });
  return {
    width: a.width,
    height: a.height,
    mismatch,
    ratio: mismatch / (a.width * a.height),
    diff,
  };
}

/** Writes baseline.png / port.png / diff.png / meta.json for a checkpoint (§7, §12). */
export function writePixelArtifacts(
  scenario: string,
  checkpoint: string,
  aBuf: Buffer,
  bBuf: Buffer,
  res: PixelResult,
  extra: Record<string, unknown> = {},
): string {
  const dir = path.join(ARTIFACTS_DIR, scenario, checkpoint);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "baseline.png"), aBuf);
  fs.writeFileSync(path.join(dir, "port.png"), bBuf);
  if (res.diff) fs.writeFileSync(path.join(dir, "diff.png"), PNG.sync.write(res.diff));
  fs.writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify(
      {
        ratio: res.ratio,
        mismatchPixels: res.mismatch,
        width: res.width,
        height: res.height,
        sizeMismatch: res.sizeMismatch ?? null,
        ...extra,
      },
      null,
      2,
    ),
  );
  return dir;
}
