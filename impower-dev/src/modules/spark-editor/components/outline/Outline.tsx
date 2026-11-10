import {
  Button,
  ErrorIcon,
  SearchIcon,
  VirtualList,
  WarningIcon,
} from "@impower/impower-ui/components";
import type { ComponentChildren } from "preact";
import { projectPath } from "../../workspace/problems/problemEntries";
import problems from "../../workspace/problems/ProblemsStore";
import workspace from "../../workspace/WorkspaceStore";
import { openFind, SearchRail } from "../find-references-rename";
import OutlineListRow from "./OutlineListRow";
import { problemSummary } from "./outlineRows";
import useOutlineModel from "./useOutlineModel";
import { withWindow } from "./withWindow";

const scriptName = (uri: string) => {
  const fileName = uri.split("/").pop() ?? "";
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? fileName : fileName.slice(0, dot);
};

function Heading({
  title,
  action,
}: {
  title: string;
  action: ComponentChildren;
}) {
  return (
    <div class="flex h-11 flex-none items-center justify-between pr-1 pl-9">
      <h2 class="m-0 text-[14px]/[1.4] font-semibold text-ink">{title}</h2>
      {action}
    </div>
  );
}

export default function Outline() {
  const { uri, model } = useOutlineModel();
  const searching = workspace.search.value.open;

  const summary = problemSummary(model.problems);

  return (
    <>
      <nav
        aria-label="Outline"
        class="flex h-full min-h-0 flex-col pt-3 group-data-[sidebar=collapsed]/sidebar:hidden"
      >
        {searching ? (
          <SearchRail />
        ) : (
          <>
            <Heading
              title="Outline"
              action={
                <Button
                  variant="quiet"
                  size="icon"
                  class="text-muted"
                  aria-label="Search"
                  title="Search"
                  aria-expanded={false}
                  onClick={openFind}
                >
                  <SearchIcon />
                </Button>
              }
            />
            {model.rows.length && uri ? (
              <VirtualList
                key={uri}
                class="flex-1 pr-[14px] pb-3 pl-[26px]"
                label={`Scene outline in ${scriptName(uri)}`}
                size="compact"
                items={model.rows}
                getKey={(row) => row.key}
                revealIndex={model.currentIndex}
                renderItem={(row) => (
                  <OutlineListRow
                    uri={uri}
                    row={row}
                    size="compact"
                    tone="muted"
                    onOpen={(row) =>
                      withWindow((win) =>
                        win.openOutlineLocation(uri, row.selection),
                      )
                    }
                  />
                )}
              />
            ) : (
              <p class="m-0 py-2.5 pr-[14px] pl-9 text-[12px]/[1.6] text-muted">
                Scenes will appear here as you write them.
              </p>
            )}
          </>
        )}
      </nav>
      {summary && uri ? (
        <div class="hidden justify-center pt-3 group-data-[sidebar=collapsed]/sidebar:flex">
          <Button
            variant="quiet"
            size="icon"
            aria-label={`Outline: ${summary} in ${scriptName(uri)}`}
            title={`${summary} in ${scriptName(uri)}`}
            onClick={(event) => {
              const trigger = event.currentTarget as HTMLElement;
              problems.showProblems(() => trigger, projectPath(uri));
            }}
          >
            {model.problems.errors ? (
              <ErrorIcon class="text-error" />
            ) : (
              <WarningIcon class="text-warning" />
            )}
          </Button>
        </div>
      ) : null}
    </>
  );
}
