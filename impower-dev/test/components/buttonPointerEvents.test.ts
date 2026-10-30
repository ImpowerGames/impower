import { compile, optimize } from "@tailwindcss/node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buttonVariants } from "../../../packages/impower-ui/src/components/button/Button";

vi.mock("@radix-ui/react-slot", () => ({ Slot: () => null }));

const escapeClass = (name: string) =>
  name.replace(/[^A-Za-z0-9_-]/g, (c) => `\\${c}`);

const splitClasses = (value: string) => value.split(/\s+/).filter(Boolean);

const installCss = async (classes: string[]) => {
  const compiler = await compile('@import "tailwindcss/utilities";', {
    base: process.cwd(),
    onDependency: () => {},
  });
  let css = optimize(compiler.build(classes), { minify: false }).code;
  const aliases = new Map<string, string>();
  classes.forEach((name, i) => {
    if (name.includes("&")) {
      const alias = `jsdom-alias-${i}`;
      css = css.split(`.${escapeClass(name)}`).join(`.${alias}`);
      aliases.set(name, alias);
    }
  });
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  return (value: string) =>
    splitClasses(value)
      .map((name) => aliases.get(name) ?? name)
      .join(" ");
};

const renderInWrapper = async (wrapperClass: string, innerClass: string) => {
  const buttonClass = buttonVariants({ variant: "fab", size: "fab" });
  const classFor = await installCss([
    ...splitClasses(wrapperClass),
    ...splitClasses(innerClass),
    ...splitClasses(buttonClass),
  ]);
  const wrapper = document.createElement("div");
  wrapper.className = classFor(wrapperClass);
  const inner = document.createElement("div");
  inner.className = classFor(innerClass);
  const button = document.createElement("button");
  button.className = classFor(buttonClass);
  inner.append(button);
  wrapper.append(inner);
  document.body.append(wrapper);
  return button;
};

describe("a Button inside a pass-through pointer-events-none wrapper", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("inherits none when nothing opts it back in", async () => {
    const button = await renderInWrapper(
      "pointer-events-none absolute inset-x-0 bottom-0 h-24",
      "opacity-0",
    );

    expect(getComputedStyle(button).pointerEvents).toBe("none");
  });

  it("receives events when the wrapper opts its buttons in", async () => {
    const button = await renderInWrapper(
      "pointer-events-none absolute inset-x-0 bottom-0 h-24",
      "opacity-100 [&_button]:pointer-events-auto",
    );

    expect(getComputedStyle(button).pointerEvents).toBe("auto");
  });
});
