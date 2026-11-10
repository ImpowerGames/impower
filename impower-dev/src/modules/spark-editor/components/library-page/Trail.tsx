import {
  BackIcon,
  Button,
  ChevronIcon,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
  TrashIcon,
} from "@impower/impower-ui/components";
import type { ComponentChildren } from "preact";
import { Fragment } from "preact";

const DROP_HIGHLIGHT = "bg-tint text-accent ring-2 ring-inset ring-accent";

export type TrailCrumb = { name: string; path: string };

export type TrailProps = {
  glyph?: "small" | "default";
  label: string;
  icon: ComponentChildren;
  summary: string;
  crumbs: readonly TrailCrumb[];
  root: string;
  parent: string;
  dropTarget?: string | null;
  dropAttribute?: string;
  onOpen: (path: string) => void;
};

const openTrash = () =>
  void import("../../workspace/Workspace").then(({ Workspace }) => Workspace.window.openTrash());

export default function Trail({
  label,
  icon,
  glyph,
  summary,
  crumbs,
  root,
  parent,
  dropTarget = null,
  dropAttribute,
  onOpen,
}: TrailProps) {
  const dropAt = (target: string) => (dropAttribute ? { [dropAttribute]: target } : {});
  if (!crumbs.length) {
    return (
      <nav aria-label="Folder path" class="flex min-w-0 items-center gap-0.5 text-[12px]">
        <DropdownRoot>
          <DropdownTrigger asChild>
            <Button variant="quiet" size="icon" aria-label={`${label} options`} class={glyph === "small" ? "flex-none text-muted [&_svg]:size-[17px]" : "flex-none text-muted"}>
              {icon}
            </Button>
          </DropdownTrigger>
          <DropdownContent align="start" class="min-w-[196px]">
            <DropdownItem onSelect={openTrash}>
              <TrashIcon class="text-muted" />
              Recycle bin
            </DropdownItem>
          </DropdownContent>
        </DropdownRoot>
        <span aria-current="location" class="min-w-0 pr-3.5 pl-2 font-medium [--fade:14px] fade-edge">
          {summary}
        </span>
      </nav>
    );
  }
  return (
    <nav aria-label="Folder path" class="flex min-w-0 items-center gap-0.5 overflow-x-clip text-[12px] [&>svg]:size-3 [&>svg]:flex-none [&>svg]:text-muted">
      <Button
        variant="quiet"
        size="icon"
        aria-label="Parent folder"
        {...dropAt(parent)}
        class={dropTarget === parent ? `flex-none text-muted ${DROP_HIGHLIGHT}` : "flex-none text-muted"}
        onClick={() => onOpen(parent)}
      >
        <BackIcon />
      </Button>
      <Button
        variant="quiet"
        size="icon"
        aria-label={label}
        {...dropAt(root)}
        class={dropTarget === root ? `flex-none text-muted ${DROP_HIGHLIGHT}` : "flex-none text-muted"}
        onClick={() => onOpen(root)}
      >
        {icon}
      </Button>
      {crumbs.map((crumb, i) =>
        i === crumbs.length - 1 ? (
          <Fragment key={crumb.path}>
            <ChevronIcon />
            <span
              aria-current="location"
              title={crumb.path}
              class="min-w-7 pr-3.5 pl-2 font-medium [--fade:14px] fade-edge"
            >
              {crumb.name}
            </span>
          </Fragment>
        ) : (
          <Fragment key={crumb.path}>
            <ChevronIcon />
            <Button
              variant="quiet"
              size="compact"
              {...dropAt(crumb.path)}
              class={dropTarget === crumb.path ? `max-w-40 text-muted [--fade:14px] fade-edge ${DROP_HIGHLIGHT}` : "max-w-40 text-muted [--fade:14px] fade-edge"}
              onClick={() => onOpen(crumb.path)}
            >
              {crumb.name}
            </Button>
          </Fragment>
        ),
      )}
    </nav>
  );
}
