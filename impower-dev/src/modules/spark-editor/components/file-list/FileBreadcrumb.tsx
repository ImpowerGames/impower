import { Button, ChevronRight, Folder } from "@impower/impower-ui/components";
import { Fragment } from "preact";
import { breadcrumbSegments } from "../../utils/fileTree";

export type FileBreadcrumbProps = {
  /** Current dive-mode scope path (`""` = project root). */
  scope: string;
  /** Navigate to a folder path (`""` = root). */
  onNavigate: (path: string) => void;
  class?: string;
};

/**
 * Dive-mode breadcrumb: `[folder] › chapters › act1`. Every crumb except the
 * current (last) folder is tappable to scope back up; the root crumb is a folder
 * glyph. Horizontally scrollable (scrollbar hidden) so a deep trail scrolls
 * rather than clipping the current folder.
 */
export default function FileBreadcrumb({
  scope,
  onNavigate,
  class: className,
}: FileBreadcrumbProps) {
  const crumbs: { name: string | null; path: string }[] = [
    { name: null, path: "" },
    ...breadcrumbSegments(scope),
  ];
  return (
    <nav
      aria-label="Folder path"
      class={`flex flex-row items-center overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        className ?? ""
      }`}
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <Fragment key={crumb.path}>
            {i > 0 && (
              <ChevronRight
                class="size-3.5 flex-none opacity-40"
                aria-hidden="true"
              />
            )}
            <Button
              variant="ghost"
              disabled={isLast}
              onClick={() => onNavigate(crumb.path)}
              class={`h-auto flex-none gap-1 rounded px-1.5 py-0.5 text-sm disabled:cursor-default disabled:opacity-100 ${
                isLast
                  ? "font-medium text-foreground"
                  : "text-foreground/55 hover:text-foreground"
              }`}
            >
              {crumb.name ?? <Folder class="size-4" aria-label="Root" />}
            </Button>
          </Fragment>
        );
      })}
    </nav>
  );
}
