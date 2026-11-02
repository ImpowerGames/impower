import { RouteIconSvg } from "../route/RouteIcons";
import {
  SAVE_TEXT,
  saveDetail,
  saveGroups,
  savedAs,
  savedName,
  saveValueGroups,
  saveValuesStatus,
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

export function SaveIcon({ icon }: { icon: "saves" | "back" | "more" }) {
  return (
    <svg
      class="route-icon saves-icon"
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
      class="saves-button"
      aria-haspopup="menu"
      aria-expanded={state.open}
      title="Saves"
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
      class="saves-rename"
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
    <span class="saves-row-text">
      <span class="saves-row-name">{row.name}</span>
      <span class="saves-row-detail" data-gone={row.gone ? "" : undefined}>
        {row.gone ? (
          <>
            <RouteIconSvg icon="warning" />
            <span>{SAVE_TEXT.gone}</span>
          </>
        ) : (
          saveDetail(row)
        )}
      </span>
    </span>
  );
}

function SaveListRow({
  row,
  state,
  events,
}: {
  row: SaveRow;
  state: SavesViewState;
  events: SavesEvents;
}) {
  const menuOpen = state.rowMenu === row.id;
  return (
    <li class="saves-row" data-id={row.id} data-gone={row.gone ? "" : undefined}>
      {state.renaming === row.id ? (
        <span class="saves-row-text">
          <RenameField
            row={row}
            onRename={(name) => events.onRename(row.id, name)}
            onCancel={() => events.onRenaming(null)}
          />
        </span>
      ) : (
        <SaveRowLabel row={row} />
      )}
      <button
        type="button"
        class="saves-play"
        disabled={row.gone}
        onClick={() => events.onPlay(row.id)}
      >
        {SAVE_TEXT.playFromHere}
      </button>
      <button
        type="button"
        class="saves-more"
        aria-label={`More for ${row.name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => events.onRowMenu(menuOpen ? null : row.id)}
      >
        <SaveIcon icon="more" />
      </button>
      {menuOpen ? (
        <div class="saves-row-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => events.onEditValues(row.id)}
          >
            {SAVE_TEXT.editValues}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => events.onRenaming(row.id)}
          >
            {SAVE_TEXT.rename}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => events.onDelete(row.id)}
          >
            {SAVE_TEXT.delete}
          </button>
        </div>
      ) : null}
    </li>
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
    if (text === "" || text === (row.value ?? row.first ?? "")) {
      events.onValueDraft(row.key, null);
    } else if (row.badge?.status !== "error") {
      events.onValueDraft(row.key, null);
      events.onValueSet(row.key, text);
    }
  };
  const status = row.badge?.status;
  return (
    <span class="sv-field" data-status={status} data-set={row.differs ? "" : undefined}>
      <input
        type="text"
        class="sv-input"
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
      <span class="sv-slot">
        {row.badge ? (
          <span
            class="sv-badge"
            data-status={row.badge.status}
            tabIndex={0}
            aria-label={row.badge.message}
          >
            <RouteIconSvg icon={row.badge.status} />
            <span class="sv-popup" role="tooltip">
              <RouteIconSvg icon={row.badge.status} />
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
    <div class="saves-values sv-tab" aria-label={`Values of ${save.name}`}>
      <header class="saves-values-head">
        <button
          type="button"
          class="saves-back"
          aria-label="Back to the saves"
          title="Back"
          onClick={events.onBack}
        >
          <SaveIcon icon="back" />
        </button>
        <span class="saves-values-title">{save.name}</span>
        {save.name !== savedName(save.scene, save.line) ? (
          <span class="saves-values-place">{savedName(save.scene, save.line)}</span>
        ) : null}
      </header>
      <input
        type="search"
        class="sv-search"
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
            <h3 class="sv-group-head">
              <span>{group.label}</span>
            </h3>
            {group.rows.map((row) => (
              <div
                key={row.key}
                class="sv-row saves-value-row"
                data-key={row.key}
                data-set={row.differs ? "" : undefined}
                data-field={row.field ? "" : undefined}
              >
                <span class="sv-name" title={row.name}>
                  <span class="sv-name-text">{row.name}</span>
                  {row.line !== undefined ? (
                    <span class="sv-line">{`· ${row.line}`}</span>
                  ) : null}
                </span>
                <ValueField row={row} events={events} />
              </div>
            ))}
          </section>
        ))}
      </div>
      <div class="sv-status" role="status">
        {saveValuesStatus(values)}
      </div>
      <footer class="sv-foot saves-values-foot">
        <button
          type="button"
          class="saves-play"
          disabled={save.gone}
          onClick={() => events.onPlay(save.id)}
        >
          {SAVE_TEXT.playFromHere}
        </button>
        <button
          type="button"
          class="saves-delete"
          onClick={() => events.onDelete(save.id)}
        >
          {SAVE_TEXT.delete}
        </button>
      </footer>
    </div>
  );
}

export function SavesMenu({
  state,
  events,
}: {
  state: SavesViewState;
  events: SavesEvents;
}) {
  if (!state.open) {
    return null;
  }
  if (state.values) {
    return (
      <section class="saves-menu" aria-label="Saves">
        <SaveValuesPanel values={state.values} events={events} />
      </section>
    );
  }
  const groups = saveGroups(state.saves);
  return (
    <section class="saves-menu" role="menu" aria-label="Saves">
      <button
        type="button"
        role="menuitem"
        class="saves-here"
        disabled={!state.playing}
        onClick={events.onSaveHere}
      >
        <SaveIcon icon="saves" />
        <span>{SAVE_TEXT.saveHere}</span>
      </button>
      {groups.length === 0 ? (
        <p class="saves-none">{SAVE_TEXT.none}</p>
      ) : (
        groups.map((group) => (
          <section
            key={group.kind}
            class="saves-group"
            data-group={group.kind}
            aria-label={group.label}
          >
            <h3 class="saves-group-head">{group.label}</h3>
            <ul class="saves-rows">
              {group.rows.map((row) => (
                <SaveListRow key={row.id} row={row} state={state} events={events} />
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
    <div class="save-note" role="status" data-failed={note.failed ? "" : undefined}>
      {note.failed !== undefined ? (
        <>
          <RouteIconSvg icon="error" />
          <span>{`${SAVE_TEXT.notSaved}: ${note.failed}`}</span>
        </>
      ) : (
        <>
          <span>{savedAs(note.name)}</span>
          <button type="button" class="save-note-rename" onClick={events.onNoteRename}>
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
  const none = saves.length === 0;
  return (
    <span class="sv-load" title={none ? SAVE_TEXT.none : undefined}>
      <button
        type="button"
        class="sv-load-button"
        disabled={none}
        aria-haspopup="menu"
        aria-expanded={open && !none}
        onClick={() => onOpen(!open)}
      >
        {SAVE_TEXT.loadSave}
      </button>
      {open && !none ? (
        <div class="saves-menu sv-load-menu" role="menu" aria-label={SAVE_TEXT.loadSave}>
          {saveGroups(saves).map((group) => (
            <section
              key={group.kind}
              class="saves-group"
              data-group={group.kind}
              aria-label={group.label}
            >
              <h3 class="saves-group-head">{group.label}</h3>
              {group.rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  role="menuitem"
                  class="sv-load-row"
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
