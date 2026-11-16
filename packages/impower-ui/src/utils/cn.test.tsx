import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("lets a later padding replace a gutter-giving right padding, as it replaces any right padding", () => {
    expect(cn("p-5 pr-gutter-5", "p-3")).toBe("p-3");
    expect(cn("pl-2 pr-gutter-[14px]", "pr-2")).toBe("pl-2 pr-2");
    expect(cn("pr-gutter-2.5", "px-4")).toBe("px-4");
  });

  it("keeps a gutter-giving right padding that follows the padding it narrows", () => {
    expect(cn("p-5 pr-gutter-5")).toBe("p-5 pr-gutter-5");
    expect(cn("p-[26px]", "pr-gutter-[26px]")).toBe("p-[26px] pr-gutter-[26px]");
  });
});
