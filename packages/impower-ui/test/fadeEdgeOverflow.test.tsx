import { compile, optimize } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../src");

const block = (css: string, opener: string) => {
  const start = css.indexOf(opener);
  expect(start, opener).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = start + opener.length - 1; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") depth -= 1;
    if (depth === 0) return css.slice(start + opener.length, i);
  }
  return "";
};

describe("fade-edge", () => {
  it("masks only while its text overflows where scroll timelines are supported, and always masks elsewhere", async () => {
    const compiler = await compile(readFileSync(join(SRC, "style.css"), "utf8"), { base: SRC, onDependency: () => {} });
    const css = optimize(compiler.build(["fade-edge"]), { minify: true }).code;
    const fallback = block(css, ".fade-edge{");
    const mask = fallback.split(";").find((declaration) => declaration.startsWith("mask-image:"))!;
    expect(mask).toContain("linear-gradient");
    const supported = block(block(css, "@supports (animation-timeline:scroll()){"), ".fade-edge{");
    expect(supported).toContain("mask-image:none");
    expect(supported).toContain("overflow:hidden");
    expect(supported).toContain("animation-timeline:scroll(self inline)");
    const name = supported.split("animation:")[1]!.split(";")[0]!.split(" ").at(-1)!;
    const frames = block(css, `@keyframes ${name}{`);
    expect(frames).toContain(mask);
  });
});
