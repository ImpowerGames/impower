import {
  cn,
  ListRow,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@impower/impower-ui/components";
import { useLayoutEffect, useRef } from "preact/hooks";
import { checkStartingValue } from "@impower/sparkdown/src/program/startingValueLiterals";
import { ROUTE_ICON_CLASS, RouteIconSvg } from "../route/RouteIcons";
import {
  TOOLBAR_BUTTON_CLASS,
  VALUE_FIELD_CLASS,
  VALUE_GROUP_HEAD_CLASS,
  VALUE_ROW_SET_CLASS,
  VALUE_SEARCH_CLASS,
  VALUE_SLOT_CLASS,
  VALUES_ACTION_CLASS,
  VALUES_FOOT_CLASS,
  VALUES_PANEL_CLASS,
  VALUES_STATUS_CLASS,
  ValueName,
  valueBadgeClass,
  valueInputClass,
} from "../route/routeViewParts";
import {
  SAVE_TEXT,
  saveDetail,
  saveGroups,
  savedAs,
  savedName,
  saveValueGroups,
  saveValuesStatus,
  SAVE_ROW_MENU_ATTRIBUTE,
  type SaveNoteState,
  type SaveRow,
  type SaveValueRow,
  type SaveValuesState,
  type SavesViewState,
} from "./savesView";

export interface SavesEvents {
  onOpen: (open: boolean) => void;
  onSaveHere: () => void;
  onPlay: (id: string) => void;
  onRowMenu: (id: string | null) => void;
  onEditValues: (id: string) => void;
  onRenaming: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
  onValueDraft: (key: string, text: string | null) => void;
  onValueSet: (key: string, value: string) => void;
  onValueSearch: (search: string) => void;
  onNoteRename: () => void;
}

const keepKeys = (e: KeyboardEvent) => e.stopPropagation();

const SAVES_ACTION_CLASS =
  "cursor-pointer whitespace-nowrap rounded-[3px] border-none bg-transparent px-1.5 py-0.5 text-accent font-semibold disabled:cursor-default disabled:text-muted pointer-fine:hover:not-disabled:bg-control-hover";

const SAVES_MENU_CLASS =
  "saves-menu pointer-events-auto box-border max-h-[var(--swp-saves-menu-max-height,calc(100cqh-12px))] w-[300px] max-w-[calc(100cqw-12px)] [overflow:auto] rounded-[6px] border border-solid border-edge bg-panel px-0 py-1 text-(length:--swp-toolbar-font-size) text-ink shadow-[0_4px_14px_rgba(0,0,0,0.45)]";

const SAVES_MENU_ROW_CLASS =
  "box-border flex w-full cursor-pointer flex-row items-center gap-1.5 border-none bg-transparent px-2 py-[5px] text-left text-inherit pointer-fine:hover:not-disabled:bg-control-hover";

const SAVES_GROUP_HEAD_CLASS =
  "saves-group-head mx-0 mt-1 mb-0 px-2 py-0.5 [font-size:inherit] font-semibold tracking-[0.04em] text-muted uppercase";

export function SaveIcon({ icon }: { icon: "saves" | "back" | "more" }) {
  return (
    <svg
      class={`${ROUTE_ICON_CLASS} saves-icon`}
      data-icon={icon}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {icon === "saves" ? (
        <path d="M4 2.5h8v11L8 10.5l-4 3z" />
      ) : icon === "back" ? (
        <path d="M13 8H3.5M7.5 4 3.5 8l4 4" />
      ) : (
        <>
          <circle cx="3.5" cy="8" r="0.8" fill="currentColor" />
          <circle cx="8" cy="8" r="0.8" fill="currentColor" />
          <circle cx="12.5" cy="8" r="0.8" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export function SavesButton({
  state,
  events,
}: {
  state: SavesViewState;
  events: SavesEvents;
}) {
  return (
    <button
      type="button"
      class={`saves-button gap-1 ${TOOLBAR_BUTTON_CLASS}`}
      aria-haspopup="menu"
      aria-expanded={state.open}
      title="Saves"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={keepKeys}
      onClick={() => events.onOpen(!state.open)}
    >
      <SaveIcon icon="saves" />
      <span class="saves-button-label">Saves</span>
    </button>
  );
}

function RenameField({
  row,
  onRename,
  onCancel,
}: {
  row: SaveRow;
  onRename: (name: string) => void;
  onCancel: () => void;
}) {
  const commit = (input: HTMLInputElement) => {
    const name = input.value.trim();
    if (name && name !== row.name) {
      onRename(name);
    } else {
      onCancel();
    }
  };
  return (
    <input
      type="text"
      class="saves-rename box-border h-[22px] w-full min-w-0 rounded-[3px] border border-solid border-accent bg-(--swp-route-field-background-color) px-1.5 py-0 text-inherit outline-none"
      aria-label={`Rename ${row.name}`}
      value={row.name}
      ref={(input) => {
        if (input && document.activeElement !== input) {
          input.focus();
          input.select();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit(e.currentTarget);
        } else if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
      onBlur={(e) => commit(e.currentTarget)}
    />
  );
}

export function SaveRowLabel({ row }: { row: SaveRow }) {
  return (
    <span class="saves-row-text flex min-w-0 flex-col">
      <span class="saves-row-name min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {row.name}
      </span>
      <span
        class={cn(
          "saves-row-detail flex min-w-0 flex-row items-center gap-1 whitespace-nowrap",
          row.gone ? "text-warning" : "text-muted",
        )}
        data-gone={row.gone ? "" : undefined}
      >
        {row.gone ? (
          <>
            <RouteIconSvg icon="warning" class="size-3" />
            <span>{SAVE_TEXT.gone}</span>
          </>
        ) : (
          saveDetail(row)
        )}
      </span>
    </span>
  );
}

const MENU_KEYS: Record<string, (index: number, count: number) => number> = {
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowUp: (index, count) => (index <= 0 ? count : index) - 1,
  Home: () => 0,
  End: (_, count) => count - 1,
};

const moveThroughMenu = (e: KeyboardEvent) => {
  e.stopPropagation();
  const step = MENU_KEYS[e.key];
  if (!step) {
    return;
  }
  const items = [
    ...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not(:disabled)',
    ),
  ];
  if (items.length === 0) {
    return;
  }
  e.preventDefault();
  items[step(items.indexOf(document.activeElement as HTMLElement), items.length)]?.focus();
};

const rowMenuItemClass =
  "relative control-overlay flex w-full cursor-pointer items-center px-2 py-[5px] text-left focus-inset";

function SaveRowMenu({
  row,
  events,
  trigger,
}: {
  row: SaveRow;
  events: SavesEvents;
  trigger: { current: HTMLButtonElement | null };
}) {
  return (
    <PopoverContent
      data-impower-ui
      container={trigger.current?.closest<HTMLElement>("spark-web-player")}
      role="menu"
      aria-label={`More for ${row.name}`}
      align="end"
      sideOffset={-2}
      alignOffset={4}
      class="min-w-[120px] py-1 text-[length:var(--list-row-compact-font-size)]"
      {...{ [SAVE_ROW_MENU_ATTRIBUTE]: "" }}
      onKeyDown={moveThroughMenu}
    >
      <button
        type="button"
        role="menuitem"
        class={rowMenuItemClass}
        onClick={() => events.onEditValues(row.id)}
      >
        {SAVE_TEXT.editValues}
      </button>
      <button
        type="button"
        role="menuitem"
        class={rowMenuItemClass}
        onClick={() => events.onRenaming(row.id)}
      >
        {SAVE_TEXT.rename}
      </button>
      <button
        type="button"
        role="menuitem"
        class={rowMenuItemClass}
        onClick={() => events.onDelete(row.id)}
      >
        {SAVE_TEXT.delete}
      </button>
    </PopoverContent>
  );
}

function SaveDetail({ row }: { row: SaveRow }) {
  return row.gone ? (
    <span class="inline-flex items-center gap-1 text-warning [&>svg]:size-3">
      <RouteIconSvg icon="warning" />
      <span>{SAVE_TEXT.gone}</span>
    </span>
  ) : (
    saveDetail(row)
  );
}

function SaveListRow({
  row,
  state,
  events,
  requested,
}: {
  row: SaveRow;
  state: SavesViewState;
  events: SavesEvents;
  requested: { current: string | undefined };
}) {
  const renaming = state.renaming === row.id;
  const menuOpen = state.rowMenu === row.id;
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <Popover
      open={menuOpen}
      onOpenChange={(next) => {
        if (next) {
          requested.current = row.id;
          queueMicrotask(() => events.onRowMenu(row.id));
        } else if (requested.current === row.id) {
          requested.current = undefined;
          queueMicrotask(() => events.onRowMenu(null));
        }
      }}
    >
      <PopoverAnchor asChild>
        <li
          data-save-row
          data-impower-ui
          data-id={row.id}
          data-gone={row.gone ? "" : undefined}
          data-renaming={renaming ? "" : undefined}
        >
          <ListRow
            size="compact"
            overflow={renaming ? "self" : "fade"}
            label={
              renaming ? (
                <RenameField
                  row={row}
                  onRename={(name) => events.onRename(row.id, name)}
                  onCancel={() => events.onRenaming(null)}
                />
              ) : (
                <span data-save-name>{row.name}</span>
              )
            }
            description={
              renaming ? undefined : (
                <span data-save-detail>
                  <SaveDetail row={row} />
                </span>
              )
            }
            actions={
              <span class="flex flex-none items-center gap-1.5 py-[var(--list-row-compact-padding-y)] pr-1">
                <button
                  type="button"
                  class={`saves-play ${SAVES_ACTION_CLASS}`}
                  disabled={row.gone}
                  onClick={() => events.onPlay(row.id)}
                >
                  {SAVE_TEXT.playFromHere}
                </button>
                <PopoverTrigger asChild>
                  <button
                    ref={trigger}
                    type="button"
                    class="relative control-overlay flex size-[var(--control-size)] flex-none cursor-pointer items-center justify-center rounded-control focus-inset aria-expanded:bg-tint"
                    data-save-more
                    aria-label={`More for ${row.name}`}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                  >
                    <SaveIcon icon="more" />
                  </button>
                </PopoverTrigger>
              </span>
            }
          />
        </li>
      </PopoverAnchor>
      <SaveRowMenu row={row} events={events} trigger={trigger} />
    </Popover>
  );
}

function ValueField({
  row,
  events,
}: {
  row: SaveValueRow;
  events: SavesEvents;
}) {
  const commit = (input: HTMLInputElement) => {
    const text = input.value.trim();
    const check = checkStartingValue(
      row.item ?? { key: row.key, group: "stores", name: row.name, first: "" },
      text,
    );
    if (text === "" || text === (row.value ?? row.first ?? "")) {
      events.onValueDraft(row.key, null);
    } else if (check.status !== "error") {
      events.onValueDraft(row.key, null);
      events.onValueSet(row.key, text);
    }
  };
  const status = row.badge?.status;
  return (
    <span class={VALUE_FIELD_CLASS} data-status={status} data-set={row.differs ? "" : undefined}>
      <input
        type="text"
        class={valueInputClass({ status, set: row.differs })}
        spellcheck={false}
        autocomplete="off"
        aria-label={row.name}
        aria-invalid={status === "error" ? true : undefined}
        value={row.text}
        onInput={(e) => events.onValueDraft(row.key, e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit(e.currentTarget);
          } else if (e.key === "Escape" && e.currentTarget.value !== (row.value ?? "")) {
            e.stopPropagation();
            events.onValueDraft(row.key, null);
          }
        }}
        onBlur={(e) => commit(e.currentTarget)}
      />
      <span class={VALUE_SLOT_CLASS}>
        {row.badge ? (
          <span
            class={cn(valueBadgeClass(row.badge.status), "group/badge")}
            data-status={row.badge.status}
            tabIndex={0}
            aria-label={row.badge.message}
          >
            <RouteIconSvg icon={row.badge.status} class="size-3.5" />
            <span
              class="sv-popup pointer-events-none invisible absolute -right-1 bottom-[calc(100%+6px)] z-2 flex w-max max-w-[280px] flex-row items-start gap-1.5 whitespace-normal rounded-[6px] border border-solid border-edge bg-panel px-2 py-1.5 leading-[1.4] text-ink shadow-[0_4px_14px_rgba(0,0,0,0.45)] group-hover/badge:visible group-focus/badge:visible"
              role="tooltip"
            >
              <RouteIconSvg icon={row.badge.status} class="size-3.5" />
              <span>{row.badge.message}</span>
            </span>
          </span>
        ) : null}
      </span>
    </span>
  );
}

function SaveValuesPanel({
  values,
  events,
}: {
  values: SaveValuesState;
  events: SavesEvents;
}) {
  const save = values.save;
  return (
    <div
      class={cn(VALUES_PANEL_CLASS, "saves-values pt-0")}
      aria-label={`Values of ${save.name}`}
    >
      <header class="saves-values-head flex min-w-0 flex-row items-center gap-1.5">
        <button
          type="button"
          class="saves-back flex size-[22px] cursor-pointer items-center justify-center rounded-[3px] border-none bg-transparent p-0 text-inherit pointer-fine:hover:bg-control-hover"
          aria-label="Back to the saves"
          title="Back"
          onClick={events.onBack}
        >
          <SaveIcon icon="back" />
        </button>
        <span class="saves-values-title min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold">
          {save.name}
        </span>
        {save.name !== savedName(save.scene, save.line) ? (
          <span class="saves-values-place flex-none text-muted">
            {savedName(save.scene, save.line)}
          </span>
        ) : null}
      </header>
      <input
        type="search"
        class={VALUE_SEARCH_CLASS}
        placeholder="Search values"
        aria-label="Search values"
        value={values.search}
        onInput={(e) => events.onValueSearch(e.currentTarget.value)}
      />
      <div class="sv-groups">
        {saveValueGroups(values).map((group) => (
          <section
            key={group.group}
            class="sv-group"
            data-group={group.group}
            aria-label={group.label}
          >
            <h3
              class={cn(
                VALUE_GROUP_HEAD_CLASS,
                group.group === "unresolved" ? "text-warning" : "text-muted",
              )}
            >
              <span>{group.label}</span>
            </h3>
            {group.rows.map((row) => (
              <div
                key={row.key}
                class={cn(
                  "sv-row saves-value-row relative [display:grid] h-(--list-row-compact-height) grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-2 pl-2",
                  row.differs && VALUE_ROW_SET_CLASS,
                )}
                data-key={row.key}
                data-set={row.differs ? "" : undefined}
                data-field={row.field ? "" : undefined}
              >
                <ValueName name={row.name} line={row.line} field={!!row.field} />
                <ValueField row={row} events={events} />
              </div>
            ))}
          </section>
        ))}
      </div>
      <div class={VALUES_STATUS_CLASS} role="status">
        {saveValuesStatus(values)}
      </div>
      <footer class={cn(VALUES_FOOT_CLASS, "saves-values-foot justify-between")}>
        <button
          type="button"
          class={`saves-play ${SAVES_ACTION_CLASS}`}
          disabled={save.gone}
          onClick={() => events.onPlay(save.id)}
        >
          {SAVE_TEXT.playFromHere}
        </button>
        <button
          type="button"
          class={cn("saves-delete", VALUES_ACTION_CLASS, "text-error")}
          onClick={() => events.onDelete(save.id)}
        >
          {SAVE_TEXT.delete}
        </button>
      </footer>
    </div>
  );
}

const useRequestedRowMenu = (rowMenu: string | undefined) => {
  const requested = useRef(rowMenu);
  const shown = useRef(rowMenu);
  if (shown.current !== rowMenu) {
    shown.current = rowMenu;
    requested.current = rowMenu;
  }
  return requested;
};

export function SavesMenu({
  state,
  events,
}: {
  state: SavesViewState;
  events: SavesEvents;
}) {
  const requested = useRequestedRowMenu(state.rowMenu);
  if (!state.open) {
    return null;
  }
  if (state.values) {
    return (
      <section class={SAVES_MENU_CLASS} aria-label="Saves" onKeyDown={keepKeys}>
        <SaveValuesPanel values={state.values} events={events} />
      </section>
    );
  }
  const groups = saveGroups(state.saves);
  return (
    <section class={SAVES_MENU_CLASS} role="menu" aria-label="Saves" onKeyDown={keepKeys}>
      <button
        type="button"
        role="menuitem"
        class={cn(
          "saves-here",
          SAVES_MENU_ROW_CLASS,
          "mb-0.5 border-b border-solid border-edge disabled:cursor-default disabled:text-muted",
        )}
        disabled={!state.playing}
        onClick={events.onSaveHere}
      >
        <SaveIcon icon="saves" />
        <span>{SAVE_TEXT.saveHere}</span>
      </button>
      {groups.length === 0 ? (
        <p class="saves-none m-0 px-2 py-1.5 text-muted">{SAVE_TEXT.none}</p>
      ) : (
        groups.map((group) => (
          <section
            key={group.kind}
            class="saves-group"
            data-group={group.kind}
            aria-label={group.label}
          >
            <h3 class={SAVES_GROUP_HEAD_CLASS}>{group.label}</h3>
            <ul class="saves-rows m-0 list-none p-0">
              {group.rows.map((row) => (
                <SaveListRow
                  key={row.id}
                  row={row}
                  state={state}
                  events={events}
                  requested={requested}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}

export function SaveNote({
  note,
  events,
}: {
  note: SaveNoteState | null;
  events: SavesEvents;
}) {
  if (!note) {
    return null;
  }
  return (
    <div
      class={cn(
        "save-note pointer-events-auto flex animate-[swp-save-note_4s_forwards] flex-row items-center gap-2 whitespace-nowrap rounded-[6px] border border-solid border-edge bg-panel py-1 pr-1.5 pl-2.5 text-(length:--swp-toolbar-font-size) text-ink shadow-[0_4px_14px_rgba(0,0,0,0.45)]",
        note.failed && "text-error",
      )}
      role="status"
      data-failed={note.failed ? "" : undefined}
      onKeyDown={keepKeys}
    >
      {note.failed !== undefined ? (
        <>
          <RouteIconSvg icon="error" class="size-3.5" />
          <span>{`${note.play ? SAVE_TEXT.notPlayed : SAVE_TEXT.notSaved}: ${note.failed}`}</span>
        </>
      ) : (
        <>
          <span>{savedAs(note.name)}</span>
          <button
            type="button"
            class={`save-note-rename ${SAVES_ACTION_CLASS}`}
            onClick={events.onNoteRename}
          >
            {SAVE_TEXT.rename}
          </button>
        </>
      )}
    </div>
  );
}

export interface LoadSaveProps {
  saves: SaveRow[];
  open: boolean;
  onOpen: (open: boolean) => void;
  onPick: (id: string) => void;
}

export function LoadSave({ saves, open, onOpen, onPick }: LoadSaveProps) {
  const root = useRef<HTMLSpanElement>(null);
  const none = saves.length === 0;
  const shown = open && !none;
  useLayoutEffect(() => {
    if (!shown) {
      return undefined;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node && root.current?.contains(target))) {
        onOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      onOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [shown, onOpen]);
  return (
    <span
      ref={root}
      class="sv-load relative mr-auto"
      title={none ? SAVE_TEXT.none : undefined}
    >
      <button
        type="button"
        class={`sv-load-button ${VALUES_ACTION_CLASS}`}
        disabled={none}
        aria-haspopup="menu"
        aria-expanded={open && !none}
        onClick={() => onOpen(!open)}
      >
        {SAVE_TEXT.loadSave}
      </button>
      {open && !none ? (
        <div
          class={cn(SAVES_MENU_CLASS, "sv-load-menu absolute bottom-[calc(100%+4px)] left-0 z-4 max-h-[240px]")}
          role="menu"
          aria-label={SAVE_TEXT.loadSave}
        >
          {saveGroups(saves).map((group) => (
            <section
              key={group.kind}
              class="saves-group"
              data-group={group.kind}
              aria-label={group.label}
            >
              <h3 class={SAVES_GROUP_HEAD_CLASS}>{group.label}</h3>
              {group.rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  role="menuitem"
                  class={`sv-load-row ${SAVES_MENU_ROW_CLASS}`}
                  data-id={row.id}
                  onClick={() => onPick(row.id)}
                >
                  <SaveRowLabel row={row} />
                </button>
              ))}
            </section>
          ))}
        </div>
      ) : null}
    </span>
  );
}
