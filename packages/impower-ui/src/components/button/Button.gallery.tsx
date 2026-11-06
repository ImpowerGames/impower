import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import {
  CheckIcon,
  ChevronLeftIcon,
  CloseIcon,
  DownloadIcon,
  PencilIcon,
  PlusIcon,
} from "../icon/icons.generated";
import Button, { type ButtonSize, type ButtonVariant } from "./Button";

const VARIANTS: Record<ButtonVariant, string> = {
  default: "Default",
  primary: "Primary",
  quiet: "Quiet",
  destructive: "Destructive",
  disclosure: "Disclosure",
  toggle: "Toggle",
};

const SIZES: Record<ButtonSize, string> = {
  default: "Text button",
  icon: "Icon button",
  glyph: "Small glyph button",
  pill: "Phone pill",
};

const variants = Object.keys(VARIANTS) as ButtonVariant[];
const sizes = Object.keys(SIZES) as ButtonSize[];

function Cell({
  variant,
  size,
  disabled,
}: {
  variant: ButtonVariant;
  size: ButtonSize;
  disabled?: boolean;
}) {
  if (size === "icon" || size === "glyph") {
    return (
      <Button
        variant={variant}
        size={size}
        disabled={disabled}
        aria-label={`${VARIANTS[variant]} ${SIZES[size]}`}
        data-gallery-control
      >
        {size === "glyph" ? <ChevronLeftIcon /> : <PlusIcon />}
      </Button>
    );
  }
  return (
    <Button variant={variant} size={size} disabled={disabled} data-gallery-control>
      {size === "pill" ? <PencilIcon /> : <DownloadIcon />}
      {VARIANTS[variant]}
    </Button>
  );
}

function ButtonDemo() {
  return (
    <div class="space-y-6">
      <GalleryRow label="Every variant (columns) in every kind (rows), then disabled">
        <div class="overflow-x-auto">
          <table class="border-separate border-spacing-3">
            <thead>
              <tr>
                <th />
                {variants.map((variant) => (
                  <th key={variant} class="text-left text-xs font-normal text-muted">
                    {variant}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sizes.flatMap((size) =>
                [false, true].map((disabled) => (
                  <tr key={`${size}-${disabled}`}>
                    <th class="text-left text-xs font-normal text-muted">
                      {SIZES[size]}
                      {disabled ? ", disabled" : ""}
                    </th>
                    {variants.map((variant) => (
                      <td key={variant}>
                        <Cell variant={variant} size={size} disabled={disabled} />
                      </td>
                    ))}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </GalleryRow>
      <GalleryRow label="A dialog's actions and a panel's close">
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="quiet">Cancel</Button>
          <Button variant="primary">
            <CheckIcon /> Save
          </Button>
          <Button variant="quiet" size="icon" aria-label="Close">
            <CloseIcon />
          </Button>
        </div>
      </GalleryRow>
      <GalleryRow label="A disclosure toggle, released and pressed">
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="disclosure" size="glyph" aria-label="Show line numbers" aria-pressed={false}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="disclosure" size="glyph" aria-label="Hide line numbers" aria-pressed={true}>
            <ChevronLeftIcon />
          </Button>
        </div>
      </GalleryRow>
      <GalleryRow label="A toggle, released and pressed">
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="toggle" size="glyph" aria-label="Match case" aria-pressed={false}>
            Aa
          </Button>
          <Button variant="toggle" size="glyph" aria-label="Whole words" aria-pressed={true}>
            <u>ab</u>
          </Button>
          <Button variant="toggle" size="glyph" aria-label="Regular expression" aria-pressed={false}>
            .*
          </Button>
        </div>
      </GalleryRow>
      <GalleryRow label="asChild: the classes land on an anchor">
        <Button asChild>
          <a href="#Button">Link drawn as a text button</a>
        </Button>
      </GalleryRow>
    </div>
  );
}

export const buttonGallery: GalleryEntry = {
  title: "Button",
  exports: ["Button", "buttonVariants"],
  Demo: ButtonDemo,
};
