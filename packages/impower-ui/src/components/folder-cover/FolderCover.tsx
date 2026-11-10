import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/cn";
import { FolderIcon } from "../icon/icons.generated";
import Thumbnail from "../thumbnail/Thumbnail";

export const FOLDER_COVER_LIMIT = 4;

export const folderCoverVariants = cva(
  "relative grid size-full grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden bg-muted/16",
  {
    variants: {
      count: {
        0: "",
        1: "[&>[data-thumbnail]]:col-span-2 [&>[data-thumbnail]]:row-span-2",
        2: "[&>[data-thumbnail]]:row-span-2",
        3: "[&>[data-thumbnail]:first-child]:row-span-2",
        4: "",
      },
    },
    defaultVariants: { count: 0 },
  },
);

export type FolderCoverProps = {
  sources: readonly (string | undefined)[];
  class?: string;
};

export type FolderCoverCount = NonNullable<VariantProps<typeof folderCoverVariants>["count"]>;

export default function FolderCover({ sources, class: className }: FolderCoverProps) {
  const shown = sources.slice(0, FOLDER_COVER_LIMIT);
  const count = shown.length as FolderCoverCount;
  return (
    <span class={cn(folderCoverVariants({ count }), className)} data-folder-cover={count} aria-hidden="true">
      {shown.map((src, index) => (
        <Thumbnail key={index} size="fill" fit={count === 1 ? "cover" : "top"} src={src} />
      ))}
      {count === 0 ? (
        <FolderIcon class="col-span-2 row-span-2 size-[30px] place-self-center text-muted" />
      ) : (
        <span class="absolute bottom-1.5 left-1.5 flex size-6 items-center justify-center rounded-[7px] bg-media-badge text-media-badge-ink [&>svg]:size-3.5">
          <FolderIcon />
        </span>
      )}
    </span>
  );
}
