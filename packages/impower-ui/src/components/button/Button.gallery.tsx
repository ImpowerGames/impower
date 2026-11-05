import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { Check, Download, Edit, Plus, X } from "../icon/icons.generated";
import Button, { type ButtonSize, type ButtonVariant } from "./Button";

const VARIANTS: Record<ButtonVariant, string> = {
  default: "Default",
  primary: "Primary",
  quiet: "Quiet",
  destructive: "Destructive",
};

const SIZES: Record<ButtonSize, string> = {
  default: "Text button",
  icon: "Icon button",
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
  if (size === "icon") {
    return (
      <Button
        variant={variant}
        size={size}
        disabled={disabled}
        aria-label={`${VARIANTS[variant]} ${SIZES[size]}`}
        data-gallery-control
      >
        <Plus />
      </Button>
    );
  }
  return (
    <Button variant={variant} size={size} disabled={disabled} data-gallery-control>
      {size === "pill" ? <Edit /> : <Download />}
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
            <Check /> Save
          </Button>
          <Button variant="quiet" size="icon" aria-label="Close">
            <X />
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
