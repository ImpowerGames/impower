import { compile, optimize } from "@tailwindcss/node";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const mainWindowPath = resolve(
  "src/modules/spark-editor/components/main-window/MainWindow.tsx",
);

const readBottomNavClasses = (): string[] => {
  const source = readFileSync(mainWindowPath, "utf8");
  const match = source.match(/<div class="([^"]*\bh-\[60px\][^"]*)"/);
  if (!match) {
    throw new Error("bottom navigation container not found in MainWindow.tsx");
  }
  return match[1]!.split(/\s+/).filter(Boolean);
};

const escapeClass = (name: string) =>
  name.replace(/[^A-Za-z0-9_-]/g, (c) => `\\${c}`);

const renderBottomNav = async (): Promise<HTMLElement> => {
  const classes = readBottomNavClasses();
  const compiler = await compile('@import "tailwindcss/utilities";', {
    base: process.cwd(),
    onDependency: () => {},
  });
  let css = optimize(compiler.build(classes), { minify: false }).code;
  const elementClasses = classes.map((name, i) => {
    if (!name.includes("&")) {
      return name;
    }
    const alias = `jsdom-alias-${i}`;
    css = css.split(`.${escapeClass(name)}`).join(`.${alias}`);
    return alias;
  });
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  const nav = document.createElement("div");
  nav.className = elementClasses.join(" ");
  document.body.append(nav);
  return nav;
};

describe("bottom navigation while the keyboard toolbar is open", () => {
  afterEach(() => {
    document.documentElement.classList.remove("keyboard-open");
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("hides while the root is keyboard-open and returns when it is removed", async () => {
    const nav = await renderBottomNav();

    expect(getComputedStyle(nav).display).not.toBe("none");

    document.documentElement.classList.add("keyboard-open");
    expect(getComputedStyle(nav).display).toBe("none");

    document.documentElement.classList.remove("keyboard-open");
    expect(getComputedStyle(nav).display).not.toBe("none");
  });
});
