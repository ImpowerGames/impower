import { render } from "preact";
import Button from "../../src/components/button/Button";
import { caretColorChipVariants } from "../../src/components/caret-color-chip/CaretColorChip";
import { jumpChipVariants } from "../../src/components/jump-chips/JumpChips";
import { keysChipVariants } from "../../src/components/keys-chip/KeysChip";
import PlayButton from "../../src/components/play-button/PlayButton";
import Select from "../../src/components/select/Select";
import Switch from "../../src/components/switch/Switch";
import TextField from "../../src/components/text-field/TextField";

const SURFACES = ["bg-bg", "bg-panel", "bg-paper"] as const;

function Page() {
  return (
    <>
      {SURFACES.map((surface) => (
        <div key={surface} data-surface={surface} class={`${surface} flex items-center gap-4 p-4`}>
          <TextField data-field="text field" aria-label="Search scripts" placeholder="Search scripts" />
          <Select data-field="select" aria-label="Indent guides" value="a" options={[{ value: "a", label: "Always" }]} />
          <Switch data-field="switch" aria-label="Sound" />
          <Button data-button="outlined button">New</Button>
          <Button data-button="field button" variant="field">
            Pick
          </Button>
          <PlayButton data-button="play button" name="scene" />
          <span data-button="jump chip" class={jumpChipVariants()}>
            A
          </span>
          <span data-button="keys chip" class={keysChipVariants({ state: "keys" })}>
            Ctrl
          </span>
          <span data-button="unassigned keys chip" class={keysChipVariants({ state: "none" })}>
            None
          </span>
          <span data-button="caret color chip" class={caretColorChipVariants()}>
            Accent
          </span>
        </div>
      ))}
    </>
  );
}

render(<Page />, document.body);
