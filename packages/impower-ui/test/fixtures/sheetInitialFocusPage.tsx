import { render } from "preact";
import { useRef, useState } from "preact/hooks";
import { DialogTitle, Sheet } from "../../src/components/dialog/Dialog";
import { DropdownContent, DropdownRadioGroup, DropdownRadioItem, DropdownRoot, DropdownTrigger } from "../../src/components/dropdown/Dropdown";

function Page() {
  const [mode, setMode] = useState("novel");
  const [open, setOpen] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  return (
    <div class="flex flex-col gap-2 p-2">
      <DropdownRoot>
        <DropdownTrigger asChild>
          <button type="button" data-menu-trigger class="h-11 w-24">
            Mode
          </button>
        </DropdownTrigger>
        <DropdownContent class="w-[340px]">
          <DropdownRadioGroup label="Viewing mode" value={mode} onValueChange={setMode}>
            <DropdownRadioItem value="novel">Visual Novel</DropdownRadioItem>
            <DropdownRadioItem value="fiction">Interactive Fiction</DropdownRadioItem>
            <DropdownRadioItem value="screenplay">Screenplay</DropdownRadioItem>
          </DropdownRadioGroup>
        </DropdownContent>
      </DropdownRoot>
      <button type="button" data-sheet-trigger class="h-11 w-24" onClick={() => setOpen(true)}>
        Details
      </button>
      <Sheet open={open} onOpenChange={setOpen} initialFocus={close}>
        <DialogTitle>Details</DialogTitle>
        <button type="button" ref={close} data-sheet-close class="h-11 w-24" onClick={() => setOpen(false)}>
          Close
        </button>
      </Sheet>
    </div>
  );
}

render(<Page />, document.body);
