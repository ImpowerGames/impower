// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  WARM_CONTAINER_ID,
  createDomAssetCacheDeps,
  cssUrl,
} from "./domAssetCacheDeps";

describe("createDomAssetCacheDeps", () => {
  it("holds each warmed image as a CSS background in one hidden container", () => {
    const deps = createDomAssetCacheDeps(document);
    const a = deps.warmImage!("/file:/local/assets/a.svg?v=1&filters=x")!;
    const b = deps.warmImage!('/file:/local/assets/b "quoted".png')!;
    const container = document.getElementById(WARM_CONTAINER_ID)!;
    expect(container).not.toBeNull();
    expect(container.parentElement).toBe(document.body);
    expect(container.getAttribute("aria-hidden")).toBe("true");
    // Hidden by opacity, never by `display`, which would load nothing.
    expect(container.style.display).toBe("");
    expect(container.style.opacity).toBe("0");
    expect(container.style.pointerEvents).toBe("none");
    expect(container.children).toHaveLength(2);
    const [first, second] = Array.from(container.children) as HTMLElement[];
    expect(first!.style.backgroundImage).toContain("a.svg?v=1&filters=x");
    expect(second!.style.backgroundImage).toContain("quoted");
    a.remove();
    expect(container.children).toHaveLength(1);
    b.remove();
    expect(container.children).toHaveLength(0);
    // The container stays for the next image, and is reused rather than
    // duplicated.
    deps.warmImage!("/c.png");
    expect(document.querySelectorAll(`#${WARM_CONTAINER_ID}`)).toHaveLength(1);
    expect(container.children).toHaveLength(1);
  });

  it("uses the root element before the body exists, and says so when there is neither", () => {
    const bare = document.implementation.createHTMLDocument("");
    bare.documentElement.removeChild(bare.body);
    const deps = createDomAssetCacheDeps(bare);
    const handle = deps.warmImage!("/a.png");
    expect(handle).toBeDefined();
    const container = bare.getElementById(WARM_CONTAINER_ID)!;
    expect(container.parentElement).toBe(bare.documentElement);
    expect(container.children).toHaveLength(1);
    // A document with no root at all has nowhere to hold a picture: no
    // handle, so the cache knows the picture is not in the document.
    const empty = document.implementation.createDocument(null, null);
    const none = createDomAssetCacheDeps(empty as unknown as Document);
    expect(none.warmImage!("/a.png")).toBeUndefined();
  });

  it("writes a url the CSS parser reads back whole", () => {
    expect(cssUrl("/file:/a b.png?v=1&filters=%7B%22i%22%7D")).toBe(
      'url("/file:/a b.png?v=1&filters=%7B%22i%22%7D")',
    );
    expect(cssUrl('/x"y\\z.png')).toBe('url("/x\\"y\\\\z.png")');
    expect(cssUrl("/a\nb.png")).toBe('url("/ab.png")');
  });

  it("offers no warming without a document", () => {
    const deps = createDomAssetCacheDeps(null);
    expect(deps.warmImage).toBeUndefined();
    expect(typeof deps.createImage).toBe("function");
  });
});
