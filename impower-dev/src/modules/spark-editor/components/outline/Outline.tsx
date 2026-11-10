import {
  BranchIcon,
  Button,
  ChooseIcon,
  ErrorIcon,
  FileIcon,
  ListRow,
  ListRowBadge,
  SceneIcon,
  SearchIcon,
  TreeToggle,
  VirtualList,
  WarningIcon,
} from "@impower/impower-ui/components";
import type { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import { computed, useComputed } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useMemo } from "preact/hooks";
import type { Position, Range } from "vscode-languageserver-protocol";
import {
  problemSummary as scopeSummary,
  severityOf,
} from "../../workspace/problems/problemEntries";
import problems from "../../workspace/problems/ProblemsStore";
import workspace from "../../workspace/WorkspaceStore";
import { openFind, SearchRail } from "../find-references-rename";
import {
  outlineRows,
  problemSummary,
  type OutlineKind,
  type OutlineRow,
} from "./outlineRows";

type WorkspaceWindow =
  (typeof import("../../workspace/Workspace"))["Workspace"]["window"];

const withWindow = (act: (win: WorkspaceWindow) => unknown) =>
  void import("../../workspace/Workspace").then(({ Workspace }) =>
    act(Workspace.window),
  );

const GLYPHS: Record<OutlineKind, typeof SceneIcon> = {
  setup: FileIcon,
  scene: SceneIcon,
  choose: ChooseIcon,
  branch: BranchIcon,
};

const scriptName = (uri: string) => {
  const fileName = uri.split("/").pop() ?? "";
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? fileName : fileName.slice(0, dot);
};

const caretIn = (
  state: WorkspaceCache,
  uri: string | undefined,
): Position | undefined => {
  const logic = state.panes?.logic;
  if (!logic || !uri) {
    return undefined;
  }
  const current = logic.panels[logic.panel]?.activeEditor;
  const editor = current?.open
    ? current
    : Object.values(logic.panels).find((p) => p?.activeEditor?.open)
        ?.activeEditor;
  if (!editor?.filename || !uri.endsWith(`/${editor.filename}`)) {
    return undefined;
  }
  return editor.selectedRange?.start;
};

const rowName = (row: OutlineRow) =>
  row.kind === "setup" ? "Script setup" : row.label;

const scopeOf = (uri: string, key: string) =>
  computed(() => {
    const snapshot = workspace.outline.value;
    if (!snapshot || snapshot.uri !== uri) {
      return [];
    }
    return (
      outlineRows({
        symbols: snapshot.symbols,
        diagnostics: snapshot.diagnostics,
        firstContentLine: snapshot.firstContentLine,
      }).rows.find((row) => row.key === key)?.diagnostics ?? []
    );
  });

const openScope = (uri: string, row: OutlineRow, trigger: HTMLElement) =>
  problems.openDialog(
    {
      kind: "outline",
      uri,
      label: rowName(row),
      diagnostics: scopeOf(uri, row.key),
    },
    () => trigger,
  );

function RowBadge({ uri, row }: { uri: string; row: OutlineRow }) {
  const summary = scopeSummary(
    row.diagnostics.map((d) => ({ severity: severityOf(d) })),
  );
  const label = `${row.kind === "scene" ? "Scene total: " : ""}${summary} in ${rowName(row)}`;
  return (
    <ListRowBadge
      size="compact"
      label={label}
      title={row.kind === "scene" ? `${label}. Includes choices and branches.` : label}
      aria-haspopup="dialog"
      icon={
        row.problems.errors ? (
          <ErrorIcon class="text-error" />
        ) : (
          <WarningIcon class="text-warning" />
        )
      }
      onClick={(event) =>
        openScope(uri, row, event.currentTarget as HTMLElement)
      }
    />
  );
}

function RowIcon({ row }: { row: OutlineRow }) {
  const Glyph = GLYPHS[row.kind];
  return <Glyph />;
}

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
  const snapshot = workspace.outline.value;
  const uri = snapshot?.uri;
  const searching = workspace.search.value.open;
  const caret = useComputed(() =>
    caretIn(workspace.state.value, workspace.outline.value?.uri),
  ).value;
  const collapsed = useComputed(
    () =>
      workspace.state.value.outline?.collapsed?.[
        workspace.outline.value?.uri ?? ""
      ],
  ).value;
  const model = useMemo(
    () =>
      outlineRows({
        symbols: snapshot?.symbols ?? [],
        diagnostics: snapshot?.diagnostics ?? [],
        caret,
        collapsed,
        firstContentLine: snapshot?.firstContentLine,
      }),
    [snapshot, caret?.line, caret?.character, collapsed],
  );

  const open = (range: Range) => {
    if (uri) {
      withWindow((win) => win.openOutlineLocation(uri, range));
    }
  };

  const summary = problemSummary(model.problems);
  const firstProblem = snapshot?.diagnostics.find(
    (d) => (d.severity ?? 1) <= 2,
  );

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
                  <ListRow
                    size="compact"
                    tone="muted"
                    depth={row.depth}
                    current={row.current === "self" ? "location" : false}
                    containsCurrent={row.current === "ancestor"}
                    overflow={row.kind === "choose" ? "clamp" : "fade"}
                    leading={
                      row.problems.errors || row.problems.warnings ? (
                        <RowBadge uri={uri} row={row} />
                      ) : undefined
                    }
                    icon={
                      row.problems.errors || row.problems.warnings ? undefined : (
                        <RowIcon row={row} />
                      )
                    }
                    label={row.label}
                    aria-label={row.accessibleName}
                    title={row.accessibleName}
                    aria-haspopup={
                      row.kind === "setup" && row.diagnostics.length
                        ? "dialog"
                        : undefined
                    }
                    onClick={(event) =>
                      row.kind === "setup" && row.diagnostics.length
                        ? openScope(uri, row, event.currentTarget as HTMLElement)
                        : open(row.selection)
                    }
                    actions={
                      row.expanded === undefined ? undefined : (
                        <TreeToggle
                          expanded={row.expanded}
                          label={`${row.expanded ? "Collapse" : "Expand"} scene ${row.label}`}
                          onToggle={() =>
                            withWindow((win) =>
                              win.setOutlineSceneCollapsed(
                                uri,
                                row.scene!,
                                !!row.expanded,
                              ),
                            )
                          }
                        />
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
      {summary && uri && firstProblem ? (
        <div class="hidden justify-center pt-3 group-data-[sidebar=collapsed]/sidebar:flex">
          <Button
            variant="quiet"
            size="icon"
            aria-label={`Outline: ${summary} in ${scriptName(uri)}`}
            title={`${summary} in ${scriptName(uri)}`}
            onClick={() => open(firstProblem.range)}
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
