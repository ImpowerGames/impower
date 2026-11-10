import {
  BranchIcon,
  Button,
  ChevronDownIcon,
  ChevronIcon,
  ChooseIcon,
  ErrorIcon,
  FileIcon,
  ListRow,
  ListRowBadge,
  SceneIcon,
  WarningIcon,
  type ListRowSize,
  type ListRowTone,
} from "@impower/impower-ui/components";
import { computed } from "@preact/signals";
import {
  problemSummary as scopeSummary,
  severityOf,
} from "../../workspace/problems/problemEntries";
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

function RowBadge({
  uri,
  row,
  size,
}: {
  uri: string;
  row: OutlineRow;
  size?: ListRowSize;
}) {
  const summary = scopeSummary(
    row.diagnostics.map((d) => ({ severity: severityOf(d) })),
  );
  const label = `${row.kind === "scene" ? "Scene total: " : ""}${summary} in ${rowName(row)}`;
  return (
    <ListRowBadge
      size={size}
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

function Disclosure({ uri, row }: { uri: string; row: OutlineRow }) {
  const label = `${row.expanded ? "Collapse" : "Expand"} scene ${row.label}`;
  return (
    <Button
      variant="quiet"
      size="icon"
      class="text-muted [&_svg]:size-3.5"
      aria-expanded={row.expanded}
      aria-label={label}
      title={label}
      onClick={() =>
        withWindow((win) =>
          win.setOutlineSceneCollapsed(uri, row.scene!, !!row.expanded),
        )
      }
    >
      {row.expanded ? <ChevronDownIcon /> : <ChevronIcon />}
    </Button>
  );
}

export default function OutlineListRow({
  uri,
  row,
  size,
  tone,
  collapsible = true,
  onOpen,
}: {
  uri: string;
  row: OutlineRow;
  size?: ListRowSize;
  tone?: ListRowTone;
  collapsible?: boolean;
  onOpen: (row: OutlineRow) => void;
}) {
  const badged = !!(row.problems.errors || row.problems.warnings);
  const opensScope = row.kind === "setup" && row.diagnostics.length > 0;
  return (
    <ListRow
      size={size}
      tone={tone}
      depth={row.depth}
      current={row.current === "self" ? "location" : false}
      containsCurrent={row.current === "ancestor"}
      overflow={row.kind === "choose" ? "clamp" : "fade"}
      leading={badged ? <RowBadge uri={uri} row={row} size={size} /> : undefined}
      icon={badged ? undefined : <RowIcon row={row} />}
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
        collapsible && row.expanded !== undefined ? (
          <Disclosure uri={uri} row={row} />
        ) : undefined
      }
    />
  );
}
