import { render } from "preact";
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
        </div>
      ))}
    </>
  );
}

render(<Page />, document.body);
