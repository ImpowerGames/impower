import {
  BackIcon,
  Button,
  ChevronIcon,
  cn,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
  TrashIcon,
} from "@impower/impower-ui/components";
import type { ComponentChildren } from "preact";
import { Fragment } from "preact";

const DROP_HIGHLIGHT = "bg-tint text-accent ring-2 ring-inset ring-accent";

const CRUMB = "max-w-[90px] pr-3.5 pl-[5px] text-[11px] text-muted [--fade:14px] fade-edge [:root[data-layout=desktop]_&]:max-w-40 [:root[data-layout=desktop]_&]:pl-[7px] [:root[data-layout=desktop]_&]:text-[12px]";

export type TrailCrumb = { name: string; path: string };

export type TrailProps = {
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
      <nav aria-label="Folder path" class="flex min-w-0 items-center gap-0.5 text-[11px] [:root[data-layout=desktop]_&]:text-[12px]">
        <DropdownRoot>
          <DropdownTrigger asChild>
            <Button variant="quiet" size="narrow" glyph="md" aria-label={`${label} options`} class="flex-none text-muted">
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
        <span aria-current="location" class="min-w-0 pr-3.5 pl-0.5 font-medium text-ink [--fade:14px] fade-edge">
          {summary}
        </span>
      </nav>
    );
  }
  return (
    <nav aria-label="Folder path" class="flex min-w-0 items-center gap-0.5 overflow-x-clip text-[11px] [:root[data-layout=desktop]_&]:text-[12px] [&>svg]:size-3 [&>svg]:flex-none [&>svg]:text-muted">
      <Button
        variant="quiet"
        size="icon"
        glyph="md"
        aria-label="Parent folder"
        {...dropAt(parent)}
        class={dropTarget === parent ? `flex-none text-muted ${DROP_HIGHLIGHT}` : "flex-none text-muted"}
        onClick={() => onOpen(parent)}
      >
        <BackIcon />
      </Button>
      <Button
        variant="quiet"
        size="narrow"
        glyph="md"
        aria-label={label}
        {...dropAt(root)}
        class={dropTarget === root ? `ml-0.5 flex-none text-muted ${DROP_HIGHLIGHT}` : "ml-0.5 flex-none text-muted"}
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
              class="min-w-7 pr-3.5 pl-[7px] font-medium text-ink [--fade:14px] fade-edge"
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
              class={cn(CRUMB, dropTarget === crumb.path && DROP_HIGHLIGHT)}
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
