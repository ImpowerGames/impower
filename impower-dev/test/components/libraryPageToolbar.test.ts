import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { LibraryPage } from "../../src/modules/spark-editor/components/library-page";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("the shared library page toolbar", () => {
  it("pads its bottom 8px at phone and compact widths and 12px on desktop", async () => {
    host = document.body.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        h(LibraryPage<string>, {
          searchLabel: "Search scripts",
          query: "",
          onQueryChange: () => {},
          newMenu: null,
          bar: null,
          list: null,
        }),
        host!,
      ),
    );
    const toolbar = host.querySelector("input")!.closest(".flex-none")!;
    const classes = toolbar.className.split(/\s+/);
    expect(classes).toContain("pb-2");
    expect(classes).toContain("[:root[data-layout=desktop]_&]:pb-3");
  });
});
