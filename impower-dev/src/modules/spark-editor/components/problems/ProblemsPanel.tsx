import {
  ClearIcon,
  CopyIcon,
  DownloadIcon,
  ErrorIcon,
  FilterChip,
  InfoIcon,
  MESSAGE_ENTRY_ROW_HEIGHT,
  MessageEntry,
  PANEL_CARD_HEIGHT,
  PanelCardAction,
  PanelCardHead,
  PanelCardRow,
  UndoIcon,
  VirtualList,
  WarningIcon,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useEffect, useMemo } from "preact/hooks";
import {
  CARD_TITLE,
  CONSOLE_SEVERITIES,
  consoleLocation,
  countBySeverity,
  filterChip,
  headCount,
  isChoiceLive,
  lineLink,
  panelRows,
  PLAYED_PREFIX,
  playedMessages,
  SCRIPT_PREFIX,
  type ConsoleSeverity,
  type PanelRow,
  type PlayedEntry,
  type Problem,
} from "../../workspace/problems/problemEntries";
import problems from "../../workspace/problems/ProblemsStore";

export const PROBLEMS_PANEL_ID = "problems-panel";

const PANEL_LABEL = "Problems and playback messages";

const GLYPHS: Record<ConsoleSeverity, typeof ErrorIcon> = {
  error: ErrorIcon,
  warning: WarningIcon,
  info: InfoIcon,
};

const HEADING_HEIGHT = 32;

const EMPTY_HEIGHT = 52;

const rowHeight = (row: PanelRow) => {
  switch (row.kind) {
    case "head":
      return PANEL_CARD_HEIGHT.head;
    case "end":
      return PANEL_CARD_HEIGHT.end;
    case "heading":
      return HEADING_HEIGHT;
    case "empty":
      return EMPTY_HEIGHT;
    case "problem":
      return row.problem.message
        ? MESSAGE_ENTRY_ROW_HEIGHT.message
        : MESSAGE_ENTRY_ROW_HEIGHT.plain;
    case "played":
      return row.entry.title && row.entry.message
        ? MESSAGE_ENTRY_ROW_HEIGHT.message
        : MESSAGE_ENTRY_ROW_HEIGHT.plain;
  }
};

const rowKey = (row: PanelRow) => {
  switch (row.kind) {
    case "head":
    case "end":
    case "empty":
      return `${row.kind}:${row.card}`;
    case "heading":
      return `heading:${row.path}`;
    case "problem":
      return `problem:${row.problem.key}`;
    case "played":
      return `played:${row.entry.id}`;
  }
};

const playedTime = (time: number) => ({
  label: new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }),
  dateTime: new Date(time).toISOString(),
});

function ProblemRow({ problem }: { problem: Problem }) {
  return (
    <MessageEntry
      fit="row"
      severity={problem.severity}
      prefix={SCRIPT_PREFIX[problem.severity]}
      title={problem.title}
      message={problem.message}
      location={lineLink(problem.line)}
      locationLabel={`Open ${problem.script} at line ${problem.line}`}
      onJump={() =>
        void problems.jump({
          uri: problem.uri,
          line: problem.line,
          character: problem.range.start.character,
        })
      }
    />
  );
}

const GO_BACK_LABEL = "Go back to this choice";

function PlayedRow({
  entry,
  played,
}: {
  entry: PlayedEntry;
  played: readonly PlayedEntry[];
}) {
  const location = consoleLocation(entry);
  const run = useComputed(() => problems.run.value).value;
  const goBack =
    entry.checkpoint != null && isChoiceLive(entry, played, run)
      ? () => void problems.goBackToChoice(entry.checkpoint!)
      : undefined;
  return (
    <MessageEntry
      fit="row"
      severity={entry.severity}
      prefix={PLAYED_PREFIX[entry.severity]}
      title={entry.title ?? entry.message}
      message={entry.title ? entry.message : undefined}
      location={location || undefined}
      locationLabel={location ? `Open ${location}` : undefined}
      onJump={
        entry.path
          ? () => void problems.jump({ path: entry.path, line: entry.line ?? 1 })
          : undefined
      }
      time={playedTime(entry.time)}
      onActivate={goBack}
      actions={
        goBack ? (
          <PanelCardAction
            label={GO_BACK_LABEL}
            icon={<UndoIcon />}
            class="pointer-coarse:size-11"
            onClick={goBack}
          />
        ) : undefined
      }
    />
  );
}

function PlayedActions() {
  const played = useComputed(() => problems.played.value.length).value;
  const visible = useComputed(() => problems.visiblePlayed.value.length).value;
  return (
    <>
      <PanelCardAction
        label="Clear the played messages"
        icon={<ClearIcon />}
        disabled={!played}
        onClick={() => problems.clearPlayed()}
      />
      <PanelCardAction
        label="Copy the played messages"
        icon={<CopyIcon />}
        disabled={!visible}
        onClick={() => void problems.copyPlayed()}
      />
      <PanelCardAction
        label="Save the played messages as a text file"
        icon={<DownloadIcon />}
        disabled={!visible}
        onClick={() => problems.savePlayed()}
      />
    </>
  );
}

function Row({ row, all, played }: { row: PanelRow; all: readonly Problem[]; played: readonly PlayedEntry[] }) {
  const open = problems.cards.value;
  switch (row.kind) {
    case "head":
      return (
        <PanelCardHead
          title={CARD_TITLE[row.card]}
          count={headCount(row.card === "script" ? all : playedMessages(played))}
          open={open[row.card]}
          onOpenChange={(next) => problems.setCardOpen(row.card, next)}
          actions={row.card === "played" ? <PlayedActions /> : undefined}
        />
      );
    case "end":
      return <PanelCardRow part="end" />;
    case "heading":
      return (
        <PanelCardRow part="body">
          <h3 class="m-0 flex items-baseline gap-2 px-2 pt-3 pb-1 text-[12px]/[1.4] font-semibold text-ink">
            <span class="flex-none">{row.script}</span>
            <small class="min-w-0 flex-1 text-[11px] font-normal text-muted [--fade:24px] fade-edge">
              {row.path}
            </small>
          </h3>
        </PanelCardRow>
      );
    case "empty":
      return (
        <PanelCardRow part="body">
          <p class="m-0 px-2 py-4 text-[13px]/[1.5] text-muted">{row.text}</p>
        </PanelCardRow>
      );
    case "problem":
      return (
        <PanelCardRow part="body">
          <ProblemRow problem={row.problem} />
        </PanelCardRow>
      );
    case "played":
      return (
        <PanelCardRow part="body">
          <PlayedRow entry={row.entry} played={played} />
        </PanelCardRow>
      );
  }
}

export default function ProblemsPanel() {
  const all = useComputed(() => problems.problems.value).value;
  const played = useComputed(() => problems.played.value).value;
  const shown = useComputed(() => problems.shown.value).value;
  const cards = useComputed(() => problems.cards.value).value;
  const reveal = useComputed(() => problems.reveal.value).value;

  useEffect(
    () => () => {
      problems.reveal.value = null;
    },
    [],
  );

  const rows = useMemo(
    () => panelRows({ problems: all, played, shown, open: cards }),
    [all, played, shown, cards],
  );
  const counts = useMemo(
    () => countBySeverity([...all, ...playedMessages(played)]),
    [all, played],
  );
  const revealIndex = useMemo(() => {
    if (!reveal) {
      return undefined;
    }
    if (reveal.card === "script") {
      return 0;
    }
    let last = -1;
    rows.forEach((row, index) => {
      if (row.kind === "played" || (row.kind === "head" && row.card === "played") || (row.kind === "end" && row.card === "played")) {
        last = index;
      }
    });
    return last;
  }, [reveal, rows]);

  return (
    <section
      id={PROBLEMS_PANEL_ID}
      aria-label={PANEL_LABEL}
      class="flex h-full min-h-0 flex-col"
    >
      <div
        role="group"
        aria-label="Show or hide each kind"
        class="flex flex-none items-center gap-0.5 border-t border-solid border-edge px-2.5 py-1"
      >
        {CONSOLE_SEVERITIES.map((severity) => {
          const chip = filterChip(severity, counts[severity], shown[severity]);
          const Glyph = GLYPHS[severity];
          return (
            <FilterChip
              key={severity}
              tone={severity}
              icon={<Glyph />}
              pressed={shown[severity]}
              aria-label={chip.label}
              title={chip.title}
              onPressedChange={(next) => problems.setShown(severity, next)}
            >
              {chip.text}
            </FilterChip>
          );
        })}
      </div>
      <VirtualList
        size="compact"
        label={PANEL_LABEL}
        class="min-h-0 flex-1 px-2.5"
        items={rows}
        getKey={rowKey}
        itemHeight={rowHeight}
        revealIndex={revealIndex}
        revealRequest={reveal?.serial}
        renderItem={(row) => <Row row={row} all={all} played={played} />}
      />
    </section>
  );
}
