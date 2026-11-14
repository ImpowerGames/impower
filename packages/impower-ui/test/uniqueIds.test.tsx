import { render, type ComponentChildren } from "preact";
import { useId, useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { Button, DropdownRoot, DropdownTrigger } from "../src/components";

let setOuter: (n: number) => void = () => {};
let setInner: (show: boolean) => void = () => {};

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

function duplicateIds(root: ParentNode) {
  const seen = new Map<string, number>();
  for (const el of Array.from(root.querySelectorAll("[id]"))) {
    seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
  }
  return [...seen].filter(([, count]) => count > 1).map(([id]) => id);
}

let container: HTMLElement;

afterEach(() => {
  render(null, container);
  container.remove();
});

function mount(late: ComponentChildren, early: ComponentChildren) {
  container = document.createElement("div");
  document.body.appendChild(container);
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
      container,
    );
  });
  act(() => setOuter(1));
  act(() => setInner(true));
}

describe("ids made by useId", () => {
  it("stay unique when a component mounts below a wrapper that re-rendered around unchanged children", () => {
    mount(<Labelled />, <Labelled />);

    expect(container.querySelectorAll("span[id]")).toHaveLength(2);
    expect(duplicateIds(container)).toEqual([]);
  });

  it("give a row menu's trigger an id no earlier trigger holds", () => {
    mount(<RowMenu name="orphan.sd" />, <RowMenu name="Sort by name" />);

    const row = container.querySelector('[aria-label="Options for orphan.sd"]');
    const sort = container.querySelector('[aria-label="Options for Sort by name"]');
    expect(row?.id).toBeTruthy();
    expect(sort?.id).toBeTruthy();
    expect(row?.id).not.toBe(sort?.id);
    expect(duplicateIds(container)).toEqual([]);
  });
});
