import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
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
      <GalleryRow label={`In a sheet with Cancel and Done; chosen: ${label(value)}`}>
        <Button aria-haspopup="dialog" onClick={() => setOpen(true)}>
          Face: {label(value)}
        </Button>
        <WheelSheet
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
    </div>
  );
}

export const wheelPickerGallery: GalleryEntry = {
  title: "WheelPicker",
  exports: ["WheelPicker", "WheelSheet", "wheelPickerVariants", "wheelIndexAt", "WHEEL_ROW", "WHEEL_SHOWN"],
  Demo: WheelPickerDemo,
};
