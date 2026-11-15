import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Sheet } from "../../src/components/dialog/Dialog";
import { WheelSheet, type WheelOption } from "../../src/components/wheel-picker/WheelPicker";

const OPTIONS: WheelOption[] = [
  { value: "happy", label: "Happy" },
  { value: "angry", label: "Angry" },
  { value: "sad", label: "Sad" },
];

const wheel = location.hash.slice(1) === "wheel";

function Page() {
  const region = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(wheel), []);
  return (
    <Sheet size="full" flush open onOpenChange={() => {}}>
      <section ref={region} data-region class="relative flex h-full min-h-0 flex-col">
        <div data-scroller class="grid min-h-0 flex-1 auto-rows-max content-start gap-5 overflow-y-auto pb-8">
          {Array.from({ length: 30 }, (_, index) => (
            <button key={index} type="button" data-control class="h-11">
              Control {index + 1}
            </button>
          ))}
        </div>
        <WheelSheet
          container={region}
          open={open}
          title="Face"
          options={OPTIONS}
          value="angry"
          onChoose={() => {}}
          onCancel={() => {}}
        />
      </section>
    </Sheet>
  );
}

render(<Page />, document.body);
