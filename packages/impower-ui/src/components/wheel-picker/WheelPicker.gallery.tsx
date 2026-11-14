import { useRef, useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { KEEP_CLEAR_RULE } from "../../utils/keepClear";
import Button from "../button/Button";
import { WheelPicker, WheelSheet, type WheelOption, type WheelPickerSize } from "./WheelPicker";

const SIZES: WheelPickerSize[] = ["default"];

const FACES: WheelOption[] = [
  { value: "", label: "As is", hint: "Default" },
  { value: "happy", label: "Happy" },
  { value: "sad", label: "Sad" },
  { value: "cross", label: "Cross" },
  { value: "sleepy", label: "Sleepy" },
  { value: "shy", label: "Shy" },
];

function WheelPickerDemo() {
  const [value, setValue] = useState("happy");
  const [centre, setCentre] = useState("happy");
  const [open, setOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const clearFrame = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLDivElement | null>(null);
  const label = (picked: string) => FACES.find((face) => face.value === picked)?.label ?? picked;
  return (
    <div class="space-y-4">
      {SIZES.map((size) => (
        <GalleryRow key={size} label={`${size}: a wheel turned by scrolling, tapping or the arrow keys; at the centre: ${label(centre)}`}>
          <div class="w-64 rounded-card border border-edge bg-panel">
            <WheelPicker size={size} label="Face" options={FACES} value={value} onCentre={setCentre} onChoose={setValue} />
          </div>
        </GalleryRow>
      ))}
      <GalleryRow label={`In a sheet across the foot of the panel it belongs to, with Cancel and Done; chosen: ${label(value)}`}>
        <div ref={frame} class="relative flex h-[360px] w-72 items-start justify-center rounded-card border border-edge bg-bg p-4">
          <Button aria-haspopup="dialog" onClick={() => setOpen(true)}>
            Face: {label(value)}
          </Button>
        </div>
        <WheelSheet
          container={frame}
          open={open}
          title="Face"
          options={FACES}
          value={value}
          onChoose={(next) => {
            setValue(next);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      </GalleryRow>
      <GalleryRow label={`${KEEP_CLEAR_RULE} The wheel stays centred in what shows; chosen: ${label(value)}`}>
        <div ref={clearFrame} class="relative grid h-[360px] w-72 content-start gap-3 rounded-card border border-edge bg-bg p-4">
          <div ref={picture} class="grid h-40 place-items-center rounded-card bg-stage text-xs text-muted">
            Kept clear
          </div>
          <Button aria-haspopup="dialog" onClick={() => setClearOpen(true)}>
            Face: {label(value)}
          </Button>
        </div>
        <WheelSheet
          container={clearFrame}
          keepClear={picture}
          open={clearOpen}
          title="Face"
          options={FACES}
          value={value}
          onChoose={(next) => {
            setValue(next);
            setClearOpen(false);
          }}
          onCancel={() => setClearOpen(false)}
        />
      </GalleryRow>
    </div>
  );
}

export const wheelPickerGallery: GalleryEntry = {
  title: "WheelPicker",
  exports: ["WheelPicker", "WheelSheet", "wheelPickerVariants", "wheelSheetVariants", "wheelIndexAt", "WHEEL_ROW", "WHEEL_SHOWN"],
  Demo: WheelPickerDemo,
};
