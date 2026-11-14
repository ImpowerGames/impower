import { render } from "preact";
import { useRef } from "preact/hooks";
import {
  DropdownContent,
  DropdownItemText,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownRoot,
  DropdownTrigger,
} from "../../src/components/dropdown/Dropdown";

const hinted = !location.hash.includes("plain");

function Page() {
  const picture = useRef<HTMLDivElement>(null);
  return (
    <div class="relative w-[600px]">
      <div ref={picture} data-picture class="h-[414px] bg-stage" />
      <DropdownRoot>
        <DropdownTrigger asChild>
          <button type="button" data-face class="absolute top-[438px] h-11 w-[180px]">
            Happy
          </button>
        </DropdownTrigger>
        <DropdownContent align="start" keepClear={picture} class="min-w-[180px]">
          <DropdownRadioGroup value="happy" label="Face">
            <DropdownRadioItem value="happy" indicator="end" size="small">
              <DropdownItemText hint={hinted ? "Default" : undefined}>Happy</DropdownItemText>
            </DropdownRadioItem>
            <DropdownRadioItem value="angry" indicator="end" size="small">
              Angry
            </DropdownRadioItem>
            <DropdownRadioItem value="sad" indicator="end" size="small">
              Sad
            </DropdownRadioItem>
          </DropdownRadioGroup>
        </DropdownContent>
      </DropdownRoot>
    </div>
  );
}

render(<Page />, document.body);
