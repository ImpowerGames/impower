import { render } from "preact";
import { useRef } from "preact/hooks";
import {
  DropdownContent,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownRoot,
  DropdownTrigger,
} from "../../src/components/dropdown/Dropdown";

const tall = location.hash.includes("tall");
const long = location.hash.includes("long");
const faces = long ? Array.from({ length: 20 }, (_, index) => `face-${index + 1}`) : ["happy", "angry", "sad"];
const chosen = long ? faces[faces.length - 1]! : "happy";

function Page() {
  const picture = useRef<HTMLDivElement>(null);
  const preview = (value: string) => document.body.setAttribute("data-previewed", value);
  return (
    <div class="relative w-full">
      <div ref={picture} data-picture class={tall ? "h-[440px] bg-accent" : "h-[372px] bg-accent"}>
        <button type="button" data-picture-button class="m-4 h-11 w-24">
          Zoom
        </button>
      </div>
      <DropdownRoot onOpenChange={(open) => document.body.setAttribute("data-open", String(open))}>
        <DropdownTrigger asChild>
          <button type="button" data-face class="h-11 w-[180px]">
            Happy
          </button>
        </DropdownTrigger>
        <DropdownContent keepClear={picture}>
          <DropdownRadioGroup value={chosen} label="Face">
            {faces.map((face) => (
              <DropdownRadioItem
                key={face}
                value={face}
                indicator="end"
                size="small"
                onFocus={() => preview(face)}
                onPointerEnter={() => preview(face)}
              >
                {face}
              </DropdownRadioItem>
            ))}
          </DropdownRadioGroup>
        </DropdownContent>
      </DropdownRoot>
    </div>
  );
}

render(<Page />, document.body);
