// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { WARM_CONTAINER_ID, createDomAssetCacheDeps } from "./domAssetCacheDeps";

describe("createDomAssetCacheDeps", () => {
  it("holds each warmed image as a CSS background in one hidden container", () => {
    const deps = createDomAssetCacheDeps(document);
    const a = deps.warmImage!("/file:/local/assets/a.svg?v=1&filters=x");
    const b = deps.warmImage!('/file:/local/assets/b "quoted".png');
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

  it("offers no warming without a document", () => {
    const deps = createDomAssetCacheDeps(null);
    expect(deps.warmImage).toBeUndefined();
    expect(typeof deps.createImage).toBe("function");
  });
});
