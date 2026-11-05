import { render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import SidebarLayout, {
  sidebarWidth,
  sidebarWidthAfterKey,
  type SidebarLimits,
} from "./SidebarLayout";

const limits: SidebarLimits = { min: 180, max: 420, collapsed: 76 };

describe("sidebarWidth", () => {
  it("snaps a width below the minimum to the icon rail", () => {
    expect(sidebarWidth(150, limits)).toBe(76);
    expect(sidebarWidth(179, limits)).toBe(76);
    expect(sidebarWidth(10, limits)).toBe(76);
  });

  it("clamps a width past the maximum", () => {
    expect(sidebarWidth(500, limits)).toBe(420);
  });

  it("keeps a width inside the range", () => {
    expect(sidebarWidth(180, limits)).toBe(180);
    expect(sidebarWidth(300.4, limits)).toBe(300);
  });

  it("collapses when the room left is below the minimum", () => {
    expect(sidebarWidth(300, { ...limits, max: 150 })).toBe(76);
  });
});

describe("sidebarWidthAfterKey", () => {
  it("steps by 16px, or 64px with Shift", () => {
    expect(sidebarWidthAfterKey("ArrowRight", false, 232, limits)).toBe(248);
    expect(sidebarWidthAfterKey("ArrowLeft", true, 300, limits)).toBe(236);
  });

  it("goes from the icon rail to the minimum, and back below it", () => {
    expect(sidebarWidthAfterKey("ArrowRight", false, 76, limits)).toBe(180);
    expect(sidebarWidthAfterKey("ArrowLeft", false, 180, limits)).toBe(76);
  });

  it("collapses on Home and widens fully on End", () => {
    expect(sidebarWidthAfterKey("Home", false, 300, limits)).toBe(76);
    expect(sidebarWidthAfterKey("End", false, 300, limits)).toBe(420);
  });

  it("ignores other keys", () => {
    expect(sidebarWidthAfterKey("a", false, 300, limits)).toBeNull();
  });
});

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const changes: (number | undefined)[] = [];

function Harness({
  initial,
  reserve,
}: {
  initial?: number;
  reserve?: number;
}) {
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
