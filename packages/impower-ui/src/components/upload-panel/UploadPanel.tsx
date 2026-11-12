import { cva, type VariantProps } from "class-variance-authority";
import Button from "../button/Button";
import { CloseIcon } from "../icon/icons.generated";
import ProgressBar from "../progress-bar/ProgressBar";
import { cn } from "../../utils/cn";

export const uploadPanelVariants = cva([
  "flex-none overflow-y-auto overscroll-contain rounded-[12px] border border-solid border-edge bg-panel",
  "my-2 max-h-[40vh] px-3 pt-1.5 pb-3 text-ink",
]);

export const uploadRowVariants = cva(
  "grid grid-cols-[minmax(0,1fr)_minmax(80px,140px)] items-center gap-x-3 gap-y-0.5 text-[12px]/[1.4]",
  {
    variants: {
      state: {
        waiting: "[&_small]:text-muted",
        working: "[&_small]:text-muted",
        added: "[&_small]:text-muted",
        failed: "[&_small]:text-error",
      },
    },
    defaultVariants: { state: "waiting" },
  },
);

export type UploadRowState = NonNullable<VariantProps<typeof uploadRowVariants>["state"]>;

export type UploadPanelRow = {
  key: string;
  name: string;
  note: string;
  state: UploadRowState;
  progress?: number;
};

export type UploadPanelProps = {
  heading: string;
  rows: readonly UploadPanelRow[];
  onClose: () => void;
  closeLabel?: string;
  class?: string;
};

const progressOf = (row: UploadPanelRow): number | undefined =>
  row.state === "added" ? 1 : row.state === "working" ? row.progress : (row.progress ?? 0);

export default function UploadPanel({
  heading,
  rows,
  onClose,
  closeLabel = "Close uploads",
  class: className,
}: UploadPanelProps) {
  return (
    <section aria-label="Uploads" class={cn(uploadPanelVariants(), className)} data-upload-panel>
      <div class="flex items-center justify-between gap-2">
        <strong role="status" class="text-[13px] font-semibold">
          {heading}
        </strong>
        <Button variant="quiet" size="icon" class="-mr-2 text-muted" aria-label={closeLabel} onClick={onClose}>
          <CloseIcon />
        </Button>
      </div>
      <ul class="m-0 mt-0.5 grid list-none gap-2.5 p-0">
        {rows.map((row) => (
          <li key={row.key} class={uploadRowVariants({ state: row.state })} data-upload-row={row.state}>
            <span class="min-w-0 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,#000_calc(100%_-_20px),transparent)]">
              {row.name}
            </span>
            <ProgressBar value={progressOf(row)} label={row.name} tone={row.state === "failed" ? "faded" : "accent"} />
            <small class="col-span-full text-[11px]/[1.4]">{row.note}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
