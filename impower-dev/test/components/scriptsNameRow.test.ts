import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import NameRow from "../../src/modules/spark-editor/components/scripts-page/NameRow";
import { availableName } from "../../src/modules/spark-editor/utils/fileListModel";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

const mount = async (props: { initial?: string; onCancel?: () => void }) => {
  host = document.body.appendChild(document.createElement("div"));
  const onCommit = vi.fn(async (name: string) => {
    availableName(name, ["intro.sd"], ".sd");
  });
  const onCancel = props.onCancel ?? vi.fn();
  await act(async () =>
    render(
      h(NameRow, {
        icon: null,
        label: "New script name",
        suffix: ".sd",
        initial: props.initial,
        onCommit,
        onCancel,
      }),
      host!,
    ),
  );
  const input = host.querySelector("input")!;
  return { input, onCommit, onCancel };
};

const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const press = async (input: HTMLInputElement, key: string) => {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
  await settle();
};

const alertText = () => host!.querySelector('[role="alert"]')?.textContent;

describe("the Scripts page's inline name field", () => {
  it("answers Enter on an empty or blank name with the empty-name message", async () => {
    const { input, onCancel } = await mount({});
    await press(input, "Enter");
    expect(alertText()).toBe("Enter a name.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    await type(input, "   ");
    await press(input, "Enter");
    expect(alertText()).toBe("Enter a name.");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("answers a reserved or taken name with its message, and keeps the field", async () => {
    const { input } = await mount({});
    await type(input, "con");
    await press(input, "Enter");
    expect(alertText()).toBe("Choose a different name. This name is reserved.");
    await type(input, "Intro");
    await press(input, "Enter");
    expect(alertText()).toBe("That name is already in use in this folder.");
    expect(host!.querySelector("input")).toBe(input);
  });

  it("cancels when an empty new name loses focus, and when Escape is pressed", async () => {
    const blurred = await mount({});
    await act(async () => {
      blurred.input.focus();
      blurred.input.blur();
    });
    await settle();
    expect(blurred.onCancel).toHaveBeenCalledTimes(1);
    expect(blurred.onCommit).not.toHaveBeenCalled();
    await act(async () => render(null, host!));
    const escaped = await mount({ initial: "intro" });
    await press(escaped.input, "Escape");
    expect(escaped.onCancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a new name", undefined],
    ["a rename", "intro"],
  ])("keeps %s cancelled by Escape when removing the field takes its focus", async (_case, initial) => {
    let field: HTMLInputElement | undefined;
    const onCancel = vi.fn(() => {
      field!.dispatchEvent(new FocusEvent("blur"));
      field!.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    const mounted = await mount({ initial, onCancel });
    field = mounted.input;
    await type(field, "Abandon");
    await press(field, "Escape");
    await settle();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(mounted.onCommit).not.toHaveBeenCalled();
  });

  it("commits a valid name", async () => {
    const { input, onCommit } = await mount({});
    await type(input, "chapter two");
    await press(input, "Enter");
    expect(onCommit).toHaveBeenCalledWith("chapter two");
    expect(alertText()).toBeUndefined();
  });
});
