import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { byText, edgeTreatment } from "../../../packages/impower-ui/test/fadeEdge";

const actions = vi.hoisted(() => ({
  signInToGoogleDrive: vi.fn(),
  signOutOfGoogleDrive: vi.fn(),
  openProjectFromDrive: vi.fn(),
  setAppMenuOpen: vi.fn(),
  navigateTo: vi.fn(),
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { window: actions },
}));

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: AppMenu } =
  await import("../../src/modules/spark-editor/components/desktop-shell/AppMenu");

const account = {
  uid: "u",
  displayName: "Ada Writer",
  email: "ada@example.com",
  photoUrl: "https://example.com/ada.png",
  token: "t",
  expires: 0,
  scope: "",
  consented: true,
  offline: false,
};

const WAIT = { timeout: 2000, interval: 10 };

const waitFor = async <T>(name: string, find: () => T | null | undefined) =>
  vi.waitFor(() => {
    const found = find();
    if (found == null) {
      throw new Error(`${name} did not appear`);
    }
    return found;
  }, WAIT);

const waitForCall = (name: string, fn: ReturnType<typeof vi.fn>) =>
  vi.waitFor(() => {
    expect(fn, name).toHaveBeenCalledTimes(1);
  }, WAIT);

const items = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));

const item = (label: string) =>
  items().find((el) => el.textContent?.trim() === label);

const menuItem = (label: string) =>
  waitFor(`menu item "${label}"`, () => item(label));

const select = async (label: string) => {
  const el = await menuItem(label);
  await act(async () => {
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    el.click();
  });
};

let host: HTMLElement | undefined;

const mountOpen = async (
  projectId: string,
  status: "cached" | "synced",
  readyItem: string,
) => {
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: projectId },
    sync: { status },
    screen: { ...workspace.current.screen, appMenuOpen: true },
  };
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(AppMenu, null), host!));
  await menuItem(readyItem);
};

beforeEach(() => {
  Object.values(actions).forEach((fn) => fn.mockReset());
  workspace.account.value = null;
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("the app menu's Google Drive items", () => {
  it("offers the single sign-in item when signed out", async () => {
    await mountOpen("local", "cached", "Sync with Google Drive");
    expect(item("Open a project from Drive")).toBeUndefined();
    expect(item("Sign out")).toBeUndefined();
    await select("Sync with Google Drive");
    await waitForCall("signInToGoogleDrive", actions.signInToGoogleDrive);
  });

  it("shows the account row with Open a project from Drive and Sign out when signed in", async () => {
    workspace.account.value = account;
    await mountOpen("drive-file", "synced", "Open a project from Drive");
    await waitFor("account row", () =>
      document.body.textContent?.includes("Ada Writer") ? true : null,
    );
    const text = document.body.textContent ?? "";
    expect(text).toContain("Saved to Google Drive just now");
    expect(
      document.querySelector<HTMLImageElement>(
        'img[src="https://example.com/ada.png"]',
      ),
    ).not.toBeNull();
    expect(item("Sync with Google Drive")).toBeUndefined();

    await select("Open a project from Drive");
    await waitForCall("openProjectFromDrive", actions.openProjectFromDrive);
  });

  it("signs out from the menu", async () => {
    workspace.account.value = account;
    await mountOpen("drive-file", "synced", "Sign out");
    await select("Sign out");
    await waitForCall("signOutOfGoogleDrive", actions.signOutOfGoogleDrive);
  });
});

describe("the app menu's edge", () => {
  it("fades the project name, the account name and its status at their edge instead of cutting them to an ellipsis", async () => {
    workspace.account.value = account;
    await mountOpen("drive-file", "synced", "Open a project from Drive");
    await waitFor("account row", () => byText(document.body, "Ada Writer"));
    const lines = [
      host!.querySelector<HTMLElement>("button > span:nth-child(2)")!,
      document.querySelector<HTMLElement>('[aria-label="Close app menu"]')!.previousElementSibling!,
      byText(document.body, "Ada Writer")!,
      byText(document.body, "Saved to Google Drive just now")!,
    ];
    expect(lines.every(Boolean)).toBe(true);
    expect(await edgeTreatment(lines)).toEqual(
      lines.map((line) => ({ text: line.textContent, masked: true, ellipsis: false })),
    );
  });
});

const ALLOWED_IN_MENU = new Set([
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "group",
  "separator",
  "none",
  "presentation",
]);

const IMPLICIT_ROLE: Record<string, string> = {
  BUTTON: "button",
  INPUT: "textbox",
  SELECT: "combobox",
  TEXTAREA: "textbox",
};

const roleOf = (el: Element) =>
  el.getAttribute("role") ??
  (el.tagName === "A" && el.hasAttribute("href") ? "link" : IMPLICIT_ROLE[el.tagName]);

const disallowedInMenu = (menu: Element) =>
  Array.from(menu.querySelectorAll("*"))
    .filter((el) => !el.closest('[role^="menuitem"]') || el.matches('[role^="menuitem"]'))
    .map((el) => ({ el, role: roleOf(el) }))
    .filter(({ role }) => role !== undefined && !ALLOWED_IN_MENU.has(role))
    .map(({ el, role }) => `${role}: ${el.getAttribute("aria-label") ?? el.textContent?.trim()}`);

const tapTrigger = async () => {
  const trigger = host!.querySelector("button")!;
  await act(async () => {
    for (const type of ["pointerdown", "pointerup"]) {
      trigger.dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "touch", button: 0 }),
      );
    }
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
  });
};

describe("the app menu's children", () => {
  it.each([["signed out"], ["signed in"]])(
    "holds only menu items, groups and separators when opened as a menu, %s",
    async (state) => {
      if (state === "signed in") workspace.account.value = account;
      await mountOpen("drive-file", "synced", "Settings");
      const menu = await waitFor("menu", () => document.querySelector('[role="menu"]'));
      expect(disallowedInMenu(menu)).toEqual([]);
    },
  );

  it("holds only menu items, groups and separators when opened as a sheet by touch", async () => {
    workspace.account.value = account;
    actions.setAppMenuOpen.mockImplementation((open: boolean) => {
      workspace.current = {
        ...workspace.current,
        screen: { ...workspace.current.screen, appMenuOpen: open },
      };
    });
    workspace.current = {
      ...workspace.current,
      screen: { ...workspace.current.screen, appMenuOpen: false },
    };
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(h(AppMenu, null), host!));
    await tapTrigger();
    const menu = await waitFor("sheet menu", () =>
      document.querySelector('[role="dialog"] [role="menu"]'),
    );
    await menuItem("Settings");
    expect(disallowedInMenu(menu)).toEqual([]);
  });

  it("closes from its Close app menu item", async () => {
    await mountOpen("local", "cached", "Settings");
    const close = await waitFor("close item", () =>
      document.querySelector<HTMLElement>('[role="menuitem"][aria-label="Close app menu"]'),
    );
    await act(async () => {
      close.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      close.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      close.click();
    });
    await vi.waitFor(() => {
      expect(actions.setAppMenuOpen).toHaveBeenCalledWith(false);
    }, WAIT);
  });
});
