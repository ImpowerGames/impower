import { Fragment, render } from "preact";
import { DropdownContent, DropdownItem, DropdownRoot, DropdownSeparator, DropdownTrigger } from "../../src/components/dropdown/Dropdown";

const kind = location.hash.slice(1);
const rows =
  kind === "long"
    ? Array.from({ length: 30 }, (_, index) => `Row ${index + 1}`)
    : ["New project", "Open project", "Save a copy", "Settings", "Report a bug"];

function Page() {
  return (
    <div class="relative w-full">
      <DropdownRoot sheet={kind !== "menu"}>
        <DropdownTrigger asChild>
          <button type="button" data-trigger class="m-4 h-11 w-[180px]">
            Menu
          </button>
        </DropdownTrigger>
        <DropdownContent>
          {rows.map((row, index) => (
            <Fragment key={row}>
              {index === 3 ? <DropdownSeparator /> : null}
              <DropdownItem>{row}</DropdownItem>
            </Fragment>
          ))}
        </DropdownContent>
      </DropdownRoot>
    </div>
  );
}

render(<Page />, document.body);
