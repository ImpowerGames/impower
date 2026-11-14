import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import TextField, {
  type TextFieldFont,
  type TextFieldFrame,
  type TextFieldPurpose,
  type TextFieldSize,
  type TextFieldWidth,
} from "./TextField";

const PURPOSES: Record<TextFieldPurpose, { label: string; example: string }> = {
  text: { label: "Words: a project title", example: "Night shift" },
  literal: { label: "Typed exactly: a name or value", example: "backdrop_day" },
  search: { label: "Search", example: "" },
  url: { label: "Web address", example: "https://cdn.example.com/image.png" },
};

const FRAMES: Record<TextFieldFrame, string> = {
  own: "Its own border",
  inset: "Inset in the page's frame",
};

const SIZES: Record<TextFieldSize, string> = {
  default: "Default",
  tall: "Tall",
  dialog: "Dialog form field",
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
      <GalleryRow label="Every purpose, each with its own keyboard and Enter key">
        <div class="flex flex-wrap items-center gap-4">
          {(Object.keys(PURPOSES) as TextFieldPurpose[]).map((purpose) => (
            <TextField
              key={purpose}
              purpose={purpose}
              width="wide"
              aria-label={PURPOSES[purpose].label}
              placeholder={PURPOSES[purpose].label}
              defaultValue={PURPOSES[purpose].example}
              data-gallery-control
            />
          ))}
        </div>
      </GalleryRow>
      <GalleryRow label="Every frame">
        <div class="flex flex-wrap items-center gap-4">
          {(Object.keys(FRAMES) as TextFieldFrame[]).map((frame) =>
            frame === "inset" ? (
              <label
                key={frame}
                class="flex h-9 w-[300px] items-center gap-2 rounded-control border border-edge px-2.5 focus-within:border-accent"
              >
                <TextField frame={frame} aria-label={FRAMES[frame]} placeholder={FRAMES[frame]} data-gallery-control />
                <span class="text-[13px] text-muted">.sd</span>
              </label>
            ) : (
              <TextField key={frame} frame={frame} aria-label={FRAMES[frame]} placeholder={FRAMES[frame]} data-gallery-control />
            ),
          )}
        </div>
      </GalleryRow>
      <GalleryRow label="With a suffix, in every size">
        <div class="flex flex-wrap items-center gap-4">
          {(Object.keys(SIZES) as TextFieldSize[]).map((size) => (
            <TextField
              key={size}
              size={size}
              width="wide"
              purpose="literal"
              suffix=".url"
              aria-label={`${SIZES[size]} with a suffix`}
              defaultValue="backdrop"
              data-gallery-control
            />
          ))}
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
  exports: ["TextField", "textFieldVariants", "textFieldPurposeAttributes"],
  Demo: TextFieldDemo,
};
