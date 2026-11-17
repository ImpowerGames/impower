import { render } from "preact";
import { DropdownContent, DropdownItem, DropdownRoot, DropdownTrigger } from "../../src/components/dropdown/Dropdown";

const edgeGap = location.hash === "#flush" ? 0 : undefined;

function Page() {
  return (
    <div class="flex h-14 w-full items-center justify-end pr-2.5">
      <DropdownRoot>
        <DropdownTrigger asChild>
          <button type="button" data-trigger class="size-11">
            Cog
          </button>
        </DropdownTrigger>
        <DropdownContent align="end" sideOffset={4} edgeGap={edgeGap} class="w-[340px]">
          <DropdownItem>Reduce motion</DropdownItem>
          <DropdownItem>Sound</DropdownItem>
        </DropdownContent>
      </DropdownRoot>
    </div>
  );
}

render(<Page />, document.body);
