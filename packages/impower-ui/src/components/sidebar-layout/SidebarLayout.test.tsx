import { render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import SidebarLayout from "./SidebarLayout";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const changes: (number | undefined)[] = [];

function Harness({ initial, reserve }: { initial?: number; reserve?: number }) {
  const [width, setWidth] = useState(initial);
  return (
    <SidebarLayout
      width={width}
      defaultWidth={232}
      minWidth={180}
      maxWidth={420}
      collapsedWidth={76}
      reserve={reserve}
      onWidthChange={(next) => {
        changes.push(next);
        setWidth(next);
      }}
      resizeLabel="Resize sidebar"
      header={<div data-testid="header" />}
      sidebar={<nav data-testid="rail" />}
    >
      <main />
    </SidebarLayout>
  );
}

const mount = async (initial?: number, reserve?: number) => {
  changes.length = 0;
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(<Harness initial={initial} reserve={reserve} />, host!),
  );
  const root = host.firstElementChild as HTMLElement;
  const separator = host.querySelector<HTMLElement>('[role="separator"]')!;
  return { root, separator };
};

const pointer = (type: string, clientX: number) =>
  new PointerEvent(type, { bubbles: true, button: 0, clientX, pointerId: 1 });

describe("SidebarLayout", () => {
  it("starts at the default width and exposes it to the header and sidebar", async () => {
    const { root, separator } = await mount();
    expect(root.style.getPropertyValue("--sidebar-width")).toBe("232px");
    expect(root.dataset["sidebar"]).toBe("expanded");
    expect(separator.getAttribute("aria-valuenow")).toBe("232");
    expect(separator.getAttribute("aria-label")).toBe("Resize sidebar");
  });

  it("snaps a drag to 150px to the icon rail and commits it once on release", async () => {
    const { root, separator } = await mount();
    await act(async () => {
      separator.dispatchEvent(pointer("pointerdown", 232));
    });
    await act(async () => {
      separator.dispatchEvent(pointer("pointermove", 150));
    });
    expect(root.style.getPropertyValue("--sidebar-width")).toBe("76px");
    expect(changes).toEqual([]);
    await act(async () => {
      separator.dispatchEvent(pointer("pointerup", 150));
    });
    expect(changes).toEqual([76]);
    expect(root.dataset["sidebar"]).toBe("collapsed");
  });

  it("clamps a drag to 500px at 420", async () => {
    const { root, separator } = await mount();
    await act(async () => {
      separator.dispatchEvent(pointer("pointerdown", 232));
      separator.dispatchEvent(pointer("pointermove", 500));
    });
    await act(async () => {
      separator.dispatchEvent(pointer("pointerup", 500));
    });
    expect(changes).toEqual([420]);
    expect(root.style.getPropertyValue("--sidebar-width")).toBe("420px");
  });

  it("never grows so wide that less than the reserve is left beside it", async () => {
    const width = vi
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(1000);
    try {
      const { root, separator } = await mount(420, 624);
      expect(root.style.getPropertyValue("--sidebar-width")).toBe("376px");
      expect(separator.getAttribute("aria-valuemax")).toBe("376");
    } finally {
      width.mockRestore();
    }
  });

  it("resets to the default on double-click and on Enter", async () => {
    const { root, separator } = await mount(300);
    expect(root.style.getPropertyValue("--sidebar-width")).toBe("300px");
    await act(async () => {
      separator.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(changes).toEqual([undefined]);
    expect(root.style.getPropertyValue("--sidebar-width")).toBe("232px");
    await act(async () => {
      separator.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(root.style.getPropertyValue("--sidebar-width")).toBe("248px");
    await act(async () => {
      separator.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(changes).toEqual([undefined, 248, undefined]);
    expect(root.style.getPropertyValue("--sidebar-width")).toBe("232px");
  });
});
