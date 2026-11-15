import {
  BranchIcon,
  ChooseIcon,
  FileIcon,
  ListRow,
  ListRowBadge,
  SceneIcon,
  TreeToggle,
  type ListRowAfter,
  type ListRowBadgeProps,
  type ListRowIndent,
  type ListRowSize,
  type ListRowTone,
} from "@impower/impower-ui/components";
import { worstProblem } from "@impower/codemirror-vscode-lsp-client/src/symbolProblems";
import { computed } from "@preact/signals";
import { problemsIn } from "../../workspace/problems/problemEntries";
import problems from "../../workspace/problems/ProblemsStore";
import workspace from "../../workspace/WorkspaceStore";
import { outlineRows, type OutlineKind, type OutlineRow } from "./outlineRows";
import { withWindow } from "./withWindow";

const GLYPHS: Record<OutlineKind, typeof SceneIcon> = {
  setup: FileIcon,
  scene: SceneIcon,
  choose: ChooseIcon,
  branch: BranchIcon,
};

type ListRowBadgePlacement = NonNullable<ListRowBadgeProps["placement"]>;

const rowName =(row: OutlineRow) =>
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

function RowBadge({
  uri,
  row,
  placement,
}: {
  uri: string;
  row: OutlineRow;
  placement: ListRowBadgePlacement;
}) {
  const severity = worstProblem(row.problems)!;
  const label = `${row.kind === "scene" ? "Scene total: " : ""}${problemsIn(row.diagnostics, rowName(row))}`;
  return (
    <ListRowBadge
      placement={placement}
      label={label}
      title={row.kind === "scene" ? `${label}. Includes choices and branches.` : label}
      aria-haspopup="dialog"
      severity={severity}
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

export default function OutlineListRow({
  uri,
  row,
  size,
  tone,
  indent,
  after,
  badgePlacement,
  collapsible = true,
  onOpen,
}: {
  uri: string;
  row: OutlineRow;
  size?: ListRowSize;
  tone?: ListRowTone;
  indent?: ListRowIndent;
  after?: ListRowAfter;
  badgePlacement: ListRowBadgePlacement;
  collapsible?: boolean;
  onOpen: (row: OutlineRow) => void;
}) {
  const badge =
    worstProblem(row.problems) !== null ? (
      <RowBadge uri={uri} row={row} placement={badgePlacement} />
    ) : undefined;
  const gutter = badgePlacement === "gutter" ? badge : undefined;
  const trailing = badgePlacement === "trailing" ? badge : undefined;
  const toggle =
    collapsible && row.expanded !== undefined ? (
      <TreeToggle
        expanded={!!row.expanded}
        label={`${row.expanded ? "Collapse" : "Expand"} scene ${row.label}`}
        onToggle={() =>
          withWindow((win) =>
            win.setOutlineSceneCollapsed(uri, row.scene!, !!row.expanded),
          )
        }
      />
    ) : undefined;
  const opensScope = row.kind === "setup" && row.diagnostics.length > 0;
  return (
    <ListRow
      size={size}
      tone={tone}
      depth={row.depth}
      indent={indent}
      after={after}
      highlight="accent"
      current={row.current === "self" ? "location" : false}
      containsCurrent={row.current === "ancestor"}
      overflow={row.kind === "choose" ? "clamp" : "fade"}
      gutter={gutter}
      icon={<RowIcon row={row} />}
      label={row.label}
      aria-label={row.accessibleName}
      title={row.accessibleName}
      aria-haspopup={opensScope ? "dialog" : undefined}
      onClick={(event) =>
        opensScope
          ? openScope(uri, row, event.currentTarget as HTMLElement)
          : onOpen(row)
      }
      actions={
        trailing || toggle ? (
          <>
            {trailing}
            {toggle}
          </>
        ) : undefined
      }
    />
  );
}
