import { signal } from "@preact/signals";
import { describe, expect, it, vi } from "vitest";
import { createAspectRatioSync } from "../../src/modules/spark-editor/components/preview-game/aspectRatioSync";
import type { ProjectSettings } from "../../src/modules/spark-editor/workspace/settings/settingsSchema";

const settingsOf = (previewAspectRatio: ProjectSettings["previewAspectRatio"]) =>
  signal({ previewAspectRatio, previewPanelHeight: 44 });

describe("createAspectRatioSync", () => {
  it("sends nothing before the player is initialized, then the current ratio", () => {
    const settings = settingsOf("9:16");
    const request = vi.fn();
    const sync = createAspectRatioSync(settings, request);
    settings.value = { ...settings.value, previewAspectRatio: "4:3" };
    expect(request).not.toHaveBeenCalled();
    sync.initialized();
    expect(request.mock.calls).toEqual([["4:3"]]);
    sync.dispose();
  });

  it("sends each new ratio once and ignores other settings", () => {
    const settings = settingsOf("auto");
    const request = vi.fn();
    const sync = createAspectRatioSync(settings, request);
    sync.initialized();
    settings.value = { ...settings.value, previewPanelHeight: 300 };
    settings.value = { ...settings.value, previewAspectRatio: "9:16" };
    settings.value = { ...settings.value, previewAspectRatio: "9:16" };
    settings.value = { ...settings.value, previewAspectRatio: "auto" };
    expect(request.mock.calls).toEqual([["auto"], ["9:16"], ["auto"]]);
    sync.dispose();
  });

  it("sends the ratio again to a reloaded player and stops once disposed", () => {
    const settings = settingsOf("1:1");
    const request = vi.fn();
    const sync = createAspectRatioSync(settings, request);
    sync.initialized();
    sync.initialized();
    expect(request.mock.calls).toEqual([["1:1"], ["1:1"]]);
    sync.dispose();
    settings.value = { ...settings.value, previewAspectRatio: "16:9" };
    expect(request).toHaveBeenCalledTimes(2);
  });
});
