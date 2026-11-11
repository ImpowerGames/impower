import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import Switch from "../components/switch/Switch";
import TextField from "../components/text-field/TextField";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe.each([
  ["Switch", (ref: (element: HTMLInputElement | null) => void) => <Switch aria-label="On" ref={ref} />],
  ["TextField", (ref: (element: HTMLInputElement | null) => void) => <TextField aria-label="Name" ref={ref} />],
])("%s ref", (_name, control) => {
  it("is called with the element once on mount and null once on unmount, never on a re-render", async () => {
    host = document.body.appendChild(document.createElement("div"));
    const calls: (string | null)[] = [];
    const round = (n: number) =>
      control((element) => {
        calls.push(element ? `element ${n}` : `null ${n}`);
      });
    await act(async () => render(round(1), host!));
    await act(async () => render(round(2), host!));
    await act(async () => render(null, host!));
    expect(calls).toEqual(["element 1", "null 2"]);
  });
});
