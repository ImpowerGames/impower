import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import AddUrlDialog, { ADDRESS_REQUIRED_MESSAGE } from "../../src/modules/spark-editor/components/assets/AddUrlDialog";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const mount = async (onSubmit: (url: string, name: string) => void) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(AddUrlDialog, { open: true, onClose: () => {}, onSubmit }), host!));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const field = (id: string) => document.getElementById(id) as HTMLInputElement;
  return { url: field("add-url-address"), name: field("add-url-name") };
};

const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const press = (input: HTMLInputElement) =>
  act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });

const addButton = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find(
    (b) => b.textContent?.trim() === "Add link",
  )!;

describe("Add URL's fields", () => {
  it("opens the URL keyboard for the address and an exact-typing keyboard for the name, each labelled", async () => {
    const { url, name } = await mount(() => {});
    expect(url.type).toBe("text");
    expect(url.getAttribute("inputmode")).toBe("url");
    expect(url.getAttribute("enterkeyhint")).toBe("go");
    expect(url.getAttribute("autocapitalize")).toBe("off");
    expect(url.getAttribute("autocomplete")).toBe("off");
    expect(url.labels?.[0]?.textContent?.trim()).toBe("Address");
    expect(name.type).toBe("text");
    expect(name.getAttribute("enterkeyhint")).toBe("done");
    expect(name.getAttribute("autocapitalize")).toBe("off");
    expect(name.labels?.[0]?.textContent?.trim()).toBe("Name");
  });

  it("reads as the prototype's Add a link dialog", async () => {
    const { url, name } = await mount(() => {});
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector("h2")?.textContent).toBe("Add a link");
    expect(dialog.textContent).toContain("A link keeps a file that lives on the web");
    expect(url.placeholder).toBe("https://");
    expect(name.placeholder).toBe("");
    expect(name.parentElement?.textContent).toBe(".url");
    expect(addButton().disabled).toBe(false);
  });

  it("still derives the name from the address and adds on Enter", async () => {
    const onSubmit = vi.fn();
    const { url, name } = await mount(onSubmit);
    await type(url, "https://cdn.example.com/art/backdrop.png");
    expect(name.value).toBe("backdrop");
    await press(url);
    expect(onSubmit).toHaveBeenCalledWith("https://cdn.example.com/art/backdrop.png", "backdrop");
  });

  it("keeps a name the author typed when the address changes after it", async () => {
    const onSubmit = vi.fn();
    const { url, name } = await mount(onSubmit);
    await type(url, "https://cdn.example.com/a.png");
    await type(name, "harbor");
    await type(url, "https://cdn.example.com/b.png");
    expect(name.value).toBe("harbor");
    await press(name);
    expect(onSubmit).toHaveBeenCalledWith("https://cdn.example.com/b.png", "harbor");
  });

  it("falls back to the address's name when the author empties the name", async () => {
    const onSubmit = vi.fn();
    const { url, name } = await mount(onSubmit);
    await type(url, "https://cdn.example.com/horn.mp3");
    await type(name, "");
    await press(url);
    expect(onSubmit).toHaveBeenCalledWith("https://cdn.example.com/horn.mp3", "horn");
  });

  it.each(["", "cdn.example.com/a.png", "ftp://cdn.example.com/a.png"])(
    "refuses %j with the prototype's message and adds nothing",
    async (address) => {
      const onSubmit = vi.fn();
      const { url } = await mount(onSubmit);
      await type(url, address);
      await act(async () => addButton().click());
      expect(onSubmit).not.toHaveBeenCalled();
      expect(document.querySelector('[role="alert"]')?.textContent).toBe(ADDRESS_REQUIRED_MESSAGE);
    },
  );
});
