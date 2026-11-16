import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/spark-editor/components/main-window/MainWindow", () => ({ default: () => null }));
vi.mock("../../src/modules/spark-editor/components/trash-panel/TrashPanel", () => ({ default: () => null }));
vi.mock("../../src/modules/spark-editor/components/conflict-dialog/ConflictDialogHost", () => ({ default: () => null }));
vi.mock("../../src/modules/spark-editor/components/snackbar-host/SnackbarHost", () => ({ default: () => null }));
vi.mock("../../src/modules/spark-editor/components/drive-sync", () => ({ SyncConflictDialog: () => null }));
vi.mock("../../src/modules/spark-editor/components/problems", () => ({ ProblemsDialog: () => null }));
vi.mock("../../src/modules/spark-editor/components/preview-route", () => ({ RouteSheet: () => null }));
vi.mock("../../src/modules/spark-editor/components/replace-project", () => ({ ReplaceProjectDialog: () => null }));

import SparkEditor from "../../src/modules/spark-editor/main/SparkEditor";

describe("the editor root", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("publishes the scrollbar gutter's width before any page opens, so every pr-gutter padding gives it back", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(90);
    const host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(h(SparkEditor, null), host));
    expect(document.documentElement.style.getPropertyValue("--scrollbar-size")).toBe("10px");
    await act(async () => render(null, host));
  });
});
