import { render, type ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { useId, useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import Button from "../src/components/button/Button";
import { DropdownRoot, DropdownTrigger } from "../src/components/dropdown/Dropdown";
import FixMenu from "../src/components/fix-menu/FixMenu";

let setOuter: (n: number) => void = () => {};
let setInner: (show: boolean) => void = () => {};
let setPortal: (show: boolean) => void = () => {};

function Outer({ children }: { children: ComponentChildren }) {
  const [count, set] = useState(0);
  setOuter = set;
  return <div data-count={count}>{children}</div>;
}

function Inner({ late }: { late: ComponentChildren }) {
  const [show, set] = useState(false);
  setInner = set;
  return <p>{show && late}</p>;
}

function LatePortal({ late, into }: { late: ComponentChildren; into: HTMLElement }) {
  const [show, set] = useState(false);
  setPortal = set;
  return createPortal(<section>{show && late}</section>, into);
}

function Labelled() {
  return <span id={useId()} />;
}

function RowMenu({ name }: { name: string }) {
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button aria-label={`Options for ${name}`} />
      </DropdownTrigger>
    </DropdownRoot>
  );
}

function duplicateIds() {
  const seen = new Map<string, number>();
  for (const el of Array.from(document.querySelectorAll("[id]"))) {
    seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
  }
  return [...seen].filter(([, count]) => count > 1).map(([id]) => id);
}

const hosts: HTMLElement[] = [];

function host() {
  const el = document.body.appendChild(document.createElement("div"));
  hosts.push(el);
  return el;
}

afterEach(() => {
  for (const el of hosts.splice(0)) {
    act(() => render(null, el));
    el.remove();
  }
});

function mountBelowRerenderedWrapper(late: ComponentChildren, early: ComponentChildren) {
  act(() => {
    render(
      <>
        {early}
        <Outer>
          <section>
            <Inner late={late} />
          </section>
        </Outer>
      </>,
      host(),
    );
  });
  act(() => setOuter(1));
  act(() => setInner(true));
}

function triggerId(label: string) {
  return document.querySelector(`[aria-label="${label}"]`)?.id;
}

describe("ids made by useId", () => {
  it("stay unique when a component mounts below a wrapper that re-rendered around unchanged children", () => {
    mountBelowRerenderedWrapper(<Labelled />, <Labelled />);

    expect(document.querySelectorAll("span[id]")).toHaveLength(2);
    expect(duplicateIds()).toEqual([]);
  });

  it("give a row menu's trigger an id no earlier trigger holds", () => {
    mountBelowRerenderedWrapper(<RowMenu name="orphan.sd" />, <RowMenu name="Sort by name" />);

    expect(triggerId("Options for orphan.sd")).toBeTruthy();
    expect(triggerId("Options for orphan.sd")).not.toBe(triggerId("Options for Sort by name"));
    expect(duplicateIds()).toEqual([]);
  });

  it("stay unique across separately rendered roots", () => {
    act(() => render(<RowMenu name="Sort by name" />, host()));
    act(() => render(<FixMenu actions={[{ name: "First fix" }, { name: "Second fix" }]} onChoose={() => {}} />, host()));
    act(() => render(<FixMenu actions={[{ name: "Third fix" }, { name: "Fourth fix" }]} onChoose={() => {}} />, host()));

    expect(document.querySelectorAll("button[id]").length).toBeGreaterThanOrEqual(3);
    expect(duplicateIds()).toEqual([]);
  });

  it("stay unique for a trigger mounted later inside an existing portal", () => {
    const into = host();
    act(() => {
      render(
        <>
          <RowMenu name="Sort by name" />
          <LatePortal into={into} late={<RowMenu name="orphan.sd" />} />
        </>,
        host(),
      );
    });
    act(() => setPortal(true));

    expect(triggerId("Options for orphan.sd")).toBeTruthy();
    expect(triggerId("Options for orphan.sd")).not.toBe(triggerId("Options for Sort by name"));
    expect(duplicateIds()).toEqual([]);
  });
});
