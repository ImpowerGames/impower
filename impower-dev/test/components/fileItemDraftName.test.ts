import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import FileItem from "../../src/modules/spark-editor/components/file-list/FileItem";

vi.mock("@impower/impower-ui/components", () => {
  const Pass = ({ children }: { children?: unknown }) =>
    h("div", null, children as never);
  const Empty = () => null;
  const wrappers = new Set(["Button", "DropdownRoot", "DropdownTrigger"]);
  return new Proxy(
    {},
    {
      has: (_, key) => key !== "then",
      get: (_, key) =>
        key === "then"
          ? undefined
          : wrappers.has(String(key))
            ? Pass
            : Empty,
    },
  );
});

const mount = () => {
  const host = document.createElement("div");
  document.body.append(host);
  return host;
};

describe("FileItem draft row name", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the name and extension it is given instead of parsing the path", () => {
    const host = mount();
    render(
      h(FileItem, {
        path: "assets/new.png",
        displayName: "",
        displayExt: "png",
      }),
      host,
    );

    expect(host.querySelector(".font-semibold")?.textContent).toBe("");
    expect(host.textContent).not.toContain("new");
    expect(host.textContent).toContain(".png");
  });

  it("opens the draft's rename input empty", async () => {
    const host = mount();
    await act(async () => {
      render(
        h(FileItem, {
          path: "assets/new.png",
          isNew: true,
          isDraft: true,
          displayName: "",
          displayExt: "png",
        }),
        host,
      );
    });

    const input = host.querySelector("input");
    expect(input?.value).toBe("");
    expect(host.textContent).not.toContain("new");
  });
});
