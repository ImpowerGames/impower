import {
  ArrowIcon,
  BookIcon,
  BracketsIcon,
  DownIcon,
  DuplicateIcon,
  KeyboardIcon,
  ListRow,
  PencilIcon,
  RedoIcon,
  SearchIcon,
  SelectIcon,
  TargetIcon,
  TextLinesIcon,
  UndoIcon,
  UpIcon,
} from "@impower/impower-ui/components";
import type { EditorCommand } from "@impower/spark-editor-protocol/src/protocols/editor/ExecuteEditorCommandMessage";
import type { WritingToolsView } from "@impower/spark-editor-protocol/src/types";
import type { ComponentChildren } from "preact";
import {
  definitionHint,
  type NameAtCaret,
} from "../../workspace/nameAtCaret";

export type NameAction = "rename" | "references" | "definition";

export type CommandRow = {
  command: EditorCommand;
  label: string;
  icon: ComponentChildren;
  closes: boolean;
  edits: boolean;
};

export const EDITOR_COMMAND_ROWS: readonly CommandRow[] = [
  { command: "search", label: "Find and replace", icon: <SearchIcon />, closes: true, edits: false },
  { command: "undo", label: "Undo", icon: <UndoIcon />, closes: false, edits: true },
  { command: "redo", label: "Redo", icon: <RedoIcon />, closes: false, edits: true },
  { command: "selectAll", label: "Select all", icon: <SelectIcon />, closes: true, edits: false },
  { command: "selectLine", label: "Select line", icon: <TextLinesIcon />, closes: true, edits: false },
  { command: "moveLineUp", label: "Move line up", icon: <UpIcon />, closes: false, edits: true },
  { command: "moveLineDown", label: "Move line down", icon: <DownIcon />, closes: false, edits: true },
  { command: "duplicateLine", label: "Duplicate line", icon: <DuplicateIcon />, closes: false, edits: true },
  { command: "toggleComment", label: "Toggle comment", icon: <BracketsIcon />, closes: false, edits: true },
];

export type WritingToolsMenuProps = {
  name: NameAtCaret | null;
  canEdit: boolean;
  coarse: boolean;
  phone: boolean;
  onView: (view: WritingToolsView) => void;
  onName: (action: NameAction) => void;
  onCommand: (row: CommandRow) => void;
};


function Row({
  icon,
  label,
  description,
  disabled,
  onClick,
  arrow = true,
  view,
}: {
  icon: ComponentChildren;
  label: string;
  description?: string;
  disabled?: boolean;
  onClick: () => void;
  arrow?: boolean;
  view?: string;
}) {
  return (
    <ListRow
      class="has-[button[aria-disabled=true]]:opacity-40 [&_svg:first-child]:text-accent!"
      icon={icon}
      label={<strong class="block font-semibold">{label}</strong>}
      description={description}
      trailing={arrow ? <ArrowIcon /> : undefined}
      aria-disabled={disabled ? "true" : undefined}
      data-writing-tools-view={view}
      onClick={() => {
        if (!disabled) onClick();
      }}
    />
  );
}

function Divider() {
  return <hr class="mx-2.5 my-1.5 border-0 border-t border-edge" />;
}

export default function WritingToolsMenu({
  name,
  canEdit,
  coarse,
  phone,
  onView,
  onName,
  onCommand,
}: WritingToolsMenuProps) {
  return (
    <div class="p-1.5" data-writing-tools-menu>
      {name && (
        <>
          <Row
            icon={<PencilIcon />}
            label={`Rename ${name.name}`}
            description={
              canEdit || !phone
                ? "Rename all uses and linked assets."
                : "Tap Edit to rename."
            }
            disabled={!canEdit}
            onClick={() => onName("rename")}
          />
          <Row
            icon={<SearchIcon />}
            label={`Find references to ${name.name}`}
            description="Show all uses and linked assets."
            onClick={() => onName("references")}
          />
          <Row
            icon={<TargetIcon />}
            label={`Go to definition for ${name.name}`}
            description={definitionHint(name.kind)}
            disabled={!name.definition}
            onClick={() => onName("definition")}
          />
          <Divider />
        </>
      )}
      <Row
        icon={<BookIcon />}
        label="Sparkdown guide"
        description="A quick reference while you write."
        view="guide"
        onClick={() => onView("guide")}
      />
      <Row
        icon={<KeyboardIcon />}
        label="Keyboard shortcuts"
        description="For a connected keyboard."
        view="shortcuts"
        onClick={() => onView("shortcuts")}
      />
      <div role="group" aria-label="Editor commands">
          <Divider />
          {EDITOR_COMMAND_ROWS.filter(
            (row) => coarse || row.command === "search",
          ).map((row) => (
            <Row
              key={row.command}
              icon={row.icon}
              label={row.label}
              arrow={false}
              disabled={!canEdit && row.edits}
              onClick={() => onCommand(row)}
            />
          ))}
      </div>
    </div>
  );
}
