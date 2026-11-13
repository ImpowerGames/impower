import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import AddUrlDialog from "../../src/modules/spark-editor/components/assets/AddUrlDialog";

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

describe("Add URL's fields", () => {
  it("opens the URL keyboard for the address and an exact-typing keyboard for the name, each labelled", async () => {
    const { url, name } = await mount(() => {});
    expect(url.type).toBe("text");
    expect(url.getAttribute("inputmode")).toBe("url");
    expect(url.getAttribute("enterkeyhint")).toBe("go");
    expect(url.getAttribute("autocapitalize")).toBe("off");
    expect(url.getAttribute("autocomplete")).toBe("off");
    expect(url.labels?.[0]?.textContent?.trim()).toBe("URL");
    expect(name.type).toBe("text");
    expect(name.getAttribute("enterkeyhint")).toBe("done");
    expect(name.getAttribute("autocapitalize")).toBe("off");
    expect(name.labels?.[0]?.textContent?.trim()).toBe("Name");
  });

  it("still derives the name from the address and adds on Enter", async () => {
    const onSubmit = vi.fn();
    const { url, name } = await mount(onSubmit);
    await act(async () => {
      url.value = "https://cdn.example.com/art/backdrop.png";
      url.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(name.value).toBe("backdrop");
    await act(async () => {
      url.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(onSubmit).toHaveBeenCalledWith("https://cdn.example.com/art/backdrop.png", "backdrop");
  });
});
