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

describe.each([
  ["Switch", (ref: { current: HTMLInputElement | null }) => <Switch aria-label="On" ref={ref} />],
  ["TextField", (ref: { current: HTMLInputElement | null }) => <TextField aria-label="Name" ref={ref} />],
])("%s ref object", (_name, control) => {
  it("moves the element from the old ref object to the new one when the caller swaps them", async () => {
    host = document.body.appendChild(document.createElement("div"));
    const first: { current: HTMLInputElement | null } = { current: null };
    const second: { current: HTMLInputElement | null } = { current: null };
    await act(async () => render(control(first), host!));
    const input = host.querySelector("input");
    expect(first.current).toBe(input);
    await act(async () => render(control(second), host!));
    expect(first.current).toBeNull();
    expect(second.current).toBe(input);
    await act(async () => render(null, host!));
    expect(second.current).toBeNull();
  });
});
