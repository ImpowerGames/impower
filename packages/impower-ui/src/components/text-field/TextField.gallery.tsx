import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import TextField, { type TextFieldFont, type TextFieldSize, type TextFieldWidth } from "./TextField";

const SIZES: Record<TextFieldSize, string> = {
  default: "Default",
  tall: "Tall",
};

const WIDTHS: Record<TextFieldWidth, string> = {
  default: "Default width",
  wide: "Wide",
  short: "Short",
  full: "Full width",
};

const FONTS: Record<TextFieldFont, string> = {
  sans: "Interface type",
  mono: "Script type",
};

function TextFieldDemo() {
  const [name, setName] = useState("Backdrops");
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as TextFieldSize[]).map((size) => (
        <GalleryRow key={size} label={`${SIZES[size]} in every width`}>
          <div class="flex flex-wrap items-center gap-4">
            {(Object.keys(WIDTHS) as TextFieldWidth[]).map((width) => (
              <TextField
                key={width}
                size={size}
                width={width}
                aria-label={WIDTHS[width]}
                placeholder={WIDTHS[width]}
                data-gallery-control
              />
            ))}
          </div>
        </GalleryRow>
      ))}
      <GalleryRow label="Every font, then disabled">
        <div class="flex flex-wrap items-center gap-4">
          {(Object.keys(FONTS) as TextFieldFont[]).map((font) => (
            <TextField key={font} font={font} aria-label={FONTS[font]} defaultValue="(MORE)" data-gallery-control />
          ))}
          <TextField aria-label="Disabled" defaultValue="Disabled" disabled data-gallery-control />
        </div>
      </GalleryRow>
      <GalleryRow label={`Controlled: ${name}`}>
        <TextField aria-label="Folder" value={name} onValueChange={setName} />
      </GalleryRow>
    </div>
  );
}

export const textFieldGallery: GalleryEntry = {
  title: "TextField",
  exports: ["TextField", "textFieldVariants"],
  Demo: TextFieldDemo,
};
