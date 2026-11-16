import { Fragment, render } from "preact";
import { useRef } from "preact/hooks";
import { DropdownContent, DropdownItem, DropdownRoot, DropdownSeparator, DropdownTrigger } from "../../src/components/dropdown/Dropdown";
import type { KeepClear } from "../../src/utils/keepClear";

const options = new Set(location.hash.slice(1).split(","));
const rows = options.has("long")
  ? Array.from({ length: 30 }, (_, index) => `Row ${index + 1}`)
  : ["New project", "Open project", "Save a copy", "Settings", "Report a bug"];

function Menu({ keepClear }: { keepClear?: KeepClear }) {
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <button type="button" data-trigger class="h-11 w-24 shrink-0">
          Menu
        </button>
      </DropdownTrigger>
      <DropdownContent keepClear={keepClear} class="w-[340px] max-w-[calc(100cqi-24px)]">
        {rows.map((row, index) => (
          <Fragment key={row}>
            {index === 3 ? <DropdownSeparator /> : null}
            <DropdownItem>{row}</DropdownItem>
          </Fragment>
        ))}
      </DropdownContent>
    </DropdownRoot>
  );
}

function Page() {
  const picture = useRef<HTMLDivElement>(null);
  const bar = (menu: boolean) => (
    <div data-bar class="flex h-14 w-full items-center justify-between px-2">
      <button type="button" data-left class="h-11 w-24">
        Left
      </button>
      {menu ? <Menu keepClear={options.has("clear") ? picture : undefined} /> : null}
      <button type="button" data-right class="h-11 w-24">
        Right
      </button>
    </div>
  );
  const bottom = options.has("bottom");
  return (
    <div class="flex h-dvh w-full flex-col">
      {options.has("clear") ? <div ref={picture} data-picture class="h-[300px] w-full shrink-0 bg-accent" /> : null}
      {bar(!bottom)}
      <div class="flex-1" />
      {bottom ? bar(true) : null}
    </div>
  );
}

render(<Page />, document.body);
