import { Fragment, render } from "preact";
import { useRef, useState } from "preact/hooks";
import { DropdownContent, DropdownItem, DropdownRoot, DropdownSeparator, DropdownTrigger } from "../../src/components/dropdown/Dropdown";
import { DialogTitle, Sheet } from "../../src/components/dialog/Dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../../src/components/popover/Popover";
import type { KeepClear } from "../../src/utils/keepClear";
import { useTapOutside } from "../../src/utils/swallowNextClick";

const options = new Set(location.hash.slice(1).split(","));
const rows = options.has("long")
  ? Array.from({ length: 30 }, (_, index) => `Row ${index + 1}`)
  : options.has("wide")
    ? ["happy", "an extremely long but valid user named expression for the character portrait", "an_unbroken_expression_name_with_no_spaces_that_is_wider_than_any_phone_window_and_wider_than_the_narrowest_tablet_window_by_a_long_way_too"]
    : ["New project", "Open project", "Save a copy", "Settings", "Report a bug"];

function Menu({ keepClear }: { keepClear?: KeepClear }) {
  return (
    <DropdownRoot sheetOn={options.has("touch-sheet") ? "phone-or-touch" : "phone"}>
      <DropdownTrigger asChild>
        <button type="button" data-trigger class="h-11 w-24 shrink-0">
          Menu
        </button>
      </DropdownTrigger>
      <DropdownContent keepClear={keepClear} class={options.has("wide") ? "min-w-[196px]" : "w-[340px] max-w-[calc(100cqi-24px)]"}>
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

function Panel() {
  const [open, setOpen] = useState(false);
  useTapOutside(open, (target) => !!target.closest("[data-panel]"), () => setOpen(false));
  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button type="button" data-trigger class="h-11 w-24 shrink-0">
          Panel
        </button>
      </PopoverTrigger>
      <PopoverContent data-panel aria-label="Panel">
        <button type="button" data-panel-row class="h-11 w-40">
          Row
        </button>
      </PopoverContent>
    </Popover>
  );
}

function Page() {
  const picture = useRef<HTMLDivElement>(null);
  const bar = (menu: boolean) => (
    <div data-bar class="flex h-14 w-full items-center justify-between px-2">
      <button type="button" data-left class="h-11 w-24">
        Left
      </button>
      {menu ? options.has("panel") ? <Panel /> : <Menu keepClear={options.has("clear") ? picture : undefined} /> : null}
      <button type="button" data-right class="h-11 w-24">
        Right
      </button>
    </div>
  );
  const bottom = options.has("bottom");
  if (options.has("plain")) {
    return (
      <Sheet open flush onOpenChange={() => {}}>
        <DialogTitle class="p-4">Inspector</DialogTitle>
        <div data-plain-sheet class="p-4">A sheet that is not a menu</div>
      </Sheet>
    );
  }
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
