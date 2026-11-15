import { render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import SidebarLayout, { useSidebarCollapsed } from "./SidebarLayout";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const changes: (number | undefined)[] = [];

function Content() {
  return <main data-rail-collapsed={String(useSidebarCollapsed())} />;
}

function Harness({
  initial,
  reserve,
  defaultWidth = 232,
}: {
  initial?: number;
  reserve?: number;
  defaultWidth?: number;
}) {
  const [width, setWidth] = useState(initial);
  return (
    <SidebarLayout
      width={width}
      defaultWidth={defaultWidth}
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
      <Content />
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
    expect(host!.querySelector("main")!.dataset["railCollapsed"]).toBe("false");
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
    expect(host!.querySelector("main")!.dataset["railCollapsed"]).toBe("true");
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

  it("follows a new default after a reset with nothing saved", async () => {
    const { root, separator } = await mount();
    await act(async () => {
      separator.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(changes).toEqual([undefined]);
    expect(root.style.getPropertyValue("--sidebar-width")).toBe("232px");
    await act(async () =>
      render(<Harness defaultWidth={190} />, host!),
    );
    expect(root.style.getPropertyValue("--sidebar-width")).toBe("190px");
  });

  it("hides the sidebar and its handle without replacing the content when the sidebar is hidden", async () => {
    host = document.body.appendChild(document.createElement("div"));
    const frame = (sidebarHidden: boolean) => (
      <SidebarLayout
        defaultWidth={232}
        minWidth={180}
        maxWidth={420}
        collapsedWidth={76}
        onWidthChange={() => {}}
        resizeLabel="Resize sidebar"
        sidebar={<nav data-testid="rail" />}
        sidebarHidden={sidebarHidden}
        footer={sidebarHidden && <footer data-testid="footer" />}
      >
        <main />
      </SidebarLayout>
    );
    await act(async () => render(frame(false), host!));
    const root = host.firstElementChild as HTMLElement;
    const main = host.querySelector("main");
    const separator = host.querySelector<HTMLElement>('[role="separator"]')!;
    expect(root.dataset["sidebar"]).toBe("expanded");
    expect(separator.hidden).toBe(false);
    expect(host.querySelector('[data-testid="footer"]')).toBeNull();

    await act(async () => render(frame(true), host!));
    expect(root.dataset["sidebar"]).toBeUndefined();
    expect(root.style.getPropertyValue("--sidebar-width")).toBe("0px");
    expect(separator.hidden).toBe(true);
    expect(
      host.querySelector('[data-testid="rail"]')!.parentElement!.hidden,
    ).toBe(true);
    expect(host.querySelector('[data-testid="footer"]')).not.toBeNull();
    expect(host.querySelector("main")).toBe(main);
  });
});
