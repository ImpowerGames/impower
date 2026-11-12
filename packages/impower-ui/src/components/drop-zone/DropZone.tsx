import { cva, type VariantProps } from "class-variance-authority";
import { UploadIcon } from "../icon/icons.generated";
import { cn } from "../../utils/cn";

export const dropZoneVariants = cva(
  "pointer-events-none border-2 border-dashed border-accent bg-accent/6",
  {
    variants: {
      scope: {
        pane: "absolute inset-0 z-[5] rounded-[12px]",
        window: "fixed inset-2 z-[400] rounded-[14px]",
      },
    },
    defaultVariants: { scope: "pane" },
  },
);

export const dropZoneNoteVariants = cva(
  [
    "absolute left-1/2 flex max-w-[calc(100%_-_32px)] -translate-x-1/2 rounded-[20px]",
    "bg-accent text-accent-ink text-[13px]/[1.4]",
  ],
  {
    variants: {
      scope: {
        pane: "bottom-4 items-center gap-2 px-4 py-2.5 font-semibold whitespace-nowrap shadow-float [&_svg]:size-4 [&_svg]:flex-none",
        window: "bottom-6 flex-col items-center gap-0.5 px-5 py-3 text-center",
      },
    },
    defaultVariants: { scope: "pane" },
  },
);

export type DropZoneScope = NonNullable<VariantProps<typeof dropZoneVariants>["scope"]>;

export type DropZoneProps = VariantProps<typeof dropZoneVariants> & {
  title: string;
  detail?: string;
  class?: string;
};

export default function DropZone({ title, detail, scope, class: className }: DropZoneProps) {
  return (
    <div aria-hidden="true" class={cn(dropZoneVariants({ scope }), className)} data-drop-zone={scope ?? "pane"}>
      <span class={dropZoneNoteVariants({ scope })}>
        {scope === "window" ? (
          <>
            <strong class="font-semibold">{title}</strong>
            {detail && <span class="text-[12px] opacity-85">{detail}</span>}
          </>
        ) : (
          <>
            <UploadIcon />
            <span class="min-w-0 truncate">{title}</span>
          </>
        )}
      </span>
    </div>
  );
}
