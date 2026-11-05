import { Button, ChevronRight, Folder } from "@impower/impower-ui/components";
import { Fragment } from "preact";
import { breadcrumbSegments } from "../../utils/fileTree";

export type FileBreadcrumbProps = {
  scope: string;
  onNavigate: (path: string) => void;
  class?: string;
};

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
              variant="quiet"
              disabled={isLast}
              onClick={() => onNavigate(crumb.path)}
              class={`flex-none px-1.5 disabled:opacity-100 ${isLast ? "text-ink" : "text-muted"}`}
            >
              {crumb.name ?? <Folder class="size-4" aria-label="Root" />}
            </Button>
          </Fragment>
        );
      })}
    </nav>
  );
}
