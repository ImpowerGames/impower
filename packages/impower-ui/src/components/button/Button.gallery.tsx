import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { Download, Plus, X } from "../icon/icons.generated";
import Button, { type ButtonSize, type ButtonVariant } from "./Button";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "Primary",
  secondary: "Secondary",
  outline: "Outline",
  ghost: "Ghost",
  link: "Link",
  destructive: "Destructive",
  fab: "Fab",
};

const SIZES: Record<ButtonSize, string> = {
  default: "Default",
  sm: "Small",
  xs: "Extra small",
  lg: "Large",
  icon: "Icon",
  "icon-lg": "Large icon",
  fab: "Fab",
};

const variants = Object.keys(VARIANTS) as ButtonVariant[];
const sizes = Object.keys(SIZES) as ButtonSize[];

function Cell({ variant, size }: { variant: ButtonVariant; size: ButtonSize }) {
  if (size === "icon" || size === "icon-lg") {
    return (
      <Button variant={variant} size={size} aria-label={`${VARIANTS[variant]} ${SIZES[size]}`}>
        <Plus class="size-5" />
      </Button>
    );
  }
  return (
    <Button variant={variant} size={size}>
      {VARIANTS[variant]}
    </Button>
  );
}

function ButtonDemo() {
  return (
    <div class="space-y-6">
      <GalleryRow label="Every variant (columns) in every size (rows)">
        <div class="overflow-x-auto">
          <table class="border-separate border-spacing-3">
            <thead>
              <tr>
                <th />
                {variants.map((variant) => (
                  <th key={variant} class="text-left text-xs font-normal text-foreground/60">
                    {variant}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sizes.map((size) => (
                <tr key={size}>
                  <th class="text-left text-xs font-normal text-foreground/60">{size}</th>
                  {variants.map((variant) => (
                    <td key={variant} class={size === "fab" ? "w-40" : undefined}>
                      <Cell variant={variant} size={size} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GalleryRow>
      <GalleryRow label="Disabled, every variant">
        <div class="flex flex-wrap items-center gap-3">
          {variants.map((variant) => (
            <Button key={variant} variant={variant} disabled>
              {VARIANTS[variant]}
            </Button>
          ))}
        </div>
      </GalleryRow>
      <GalleryRow label="Leading icon and icon-only">
        <div class="flex flex-wrap items-center gap-3">
          <Button>
            <Download class="size-4" /> Download
          </Button>
          <Button variant="ghost" size="icon" aria-label="Close">
            <X class="size-5" />
          </Button>
        </div>
      </GalleryRow>
      <GalleryRow label="asChild: the classes land on an anchor">
        <Button asChild variant="outline">
          <a href="#Button">Link styled as an outline Button</a>
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
