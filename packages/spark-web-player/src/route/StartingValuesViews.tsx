import {
  ListRow,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@impower/impower-ui/components";
import { useRef, useState } from "preact/hooks";
import { LoadSave, type LoadSaveProps } from "../saves/SavesViews";
import { loadedStatus, notLoadedStatus } from "../saves/savesView";
import { RouteIconSvg } from "./RouteIcons";
import {
  fieldChange,
  valueGroups,
  valuesSet,
  valuesStatus,
  valuesTabIcon,
  type StartingValuesViewState,
  type ValueRow,
} from "./startingValuesView";

export interface StartingValuesEvents {
  onSet: (key: string, value: string) => void;
  onClear: (key: string) => void;
  onDraft: (key: string, text: string | null) => void;
  onResetAll: () => void;
  onSearch: (search: string) => void;
  onUndoLoad?: () => void;
  load?: LoadSaveProps;
}

export interface StartingValuesTabLabelProps {
  state: StartingValuesViewState;
}

export function StartingValuesTabLabel({ state }: StartingValuesTabLabelProps) {
  const icon = valuesTabIcon(state);
  return (
    <>
      <span class="sv-tab-icon" data-icon={icon}>
        <RouteIconSvg icon={icon} />
      </span>
      <span>Starting values</span>
      <span class="route-tab-count">{valuesSet(state)}</span>
    </>
  );
}

function ValueField({
  row,
  events,
}: {
  row: ValueRow;
  events: StartingValuesEvents;
}) {
  const commit = (input: HTMLInputElement) => {
    const change = fieldChange(
      {
        values: row.value !== undefined ? { [row.key]: row.value } : {},
        drafts: {},
        unsaved: {},
        search: "",
      },
      row.key,
      input.value,
      row.item,
    );
    if (change.kind === "set") {
      events.onDraft(row.key, null);
      events.onSet(row.key, change.value);
    } else if (change.kind === "clear") {
      events.onDraft(row.key, null);
      events.onClear(row.key);
    } else if (change.kind === "keep") {
      events.onDraft(row.key, null);
    }
  };
  const status = row.badge?.status;
  const unsetParameter = !row.set && status === "warning" && !row.unresolved;
  return (
    <span
      class="sv-field flex-[1.5_1.5_0%]"
      data-status={status}
      data-set={row.set ? "" : undefined}
    >
      <input
        type="text"
        class={unsetParameter ? "sv-input unset" : "sv-input"}
        spellcheck={false}
        autocomplete="off"
        aria-label={row.name}
        aria-invalid={status === "error" ? true : undefined}
        value={row.text}
        placeholder={row.unresolved ? "" : row.first}
        readOnly={row.unresolved}
        onInput={(e) => events.onDraft(row.key, e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit(e.currentTarget);
          } else if (e.key === "Escape" && e.currentTarget.value !== (row.value ?? "")) {
            e.stopPropagation();
            events.onDraft(row.key, null);
          }
        }}
        onBlur={(e) => commit(e.currentTarget)}
      />
      <span class="sv-slot">
        {row.badge ? (
          <StatusBadge badge={row.badge} />
        ) : null}
      </span>
    </span>
  );
}

function StatusBadge({ badge }: { badge: NonNullable<ValueRow["badge"]> }) {
  const { status, message } = badge;
  const [open, setOpen] = useState(false);
  const hovering = useRef(false);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        hovering.current = false;
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          class="sv-badge"
          data-status={status}
          aria-label={message}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse" && !open) {
              hovering.current = true;
              setOpen(true);
            }
          }}
          onPointerLeave={() => {
            if (hovering.current) {
              hovering.current = false;
              setOpen(false);
            }
          }}
          onClick={(e) => {
            if (hovering.current) {
              hovering.current = false;
              e.preventDefault();
            }
          }}
        >
          <RouteIconSvg icon={status} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={6}
        alignOffset={-4}
        aria-label={message}
        class="sv-popup w-max max-w-[min(var(--popover-width),calc(100vw-24px))] flex-row items-start gap-1.5 px-2 py-1.5 text-[12px]/[1.4] [&>svg]:size-3.5 [&>svg]:flex-none"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <RouteIconSvg icon={status} />
        <span>{message}</span>
      </PopoverContent>
    </Popover>
  );
}

export interface StartingValuesTabProps {
  state: StartingValuesViewState;
  events: StartingValuesEvents;
}

export function StartingValuesTab({ state, events }: StartingValuesTabProps) {
  const groups = valueGroups(state);
  return (
    <div class="sv-tab">
      <input
        type="search"
        class="sv-search"
        placeholder="Search values"
        aria-label="Search values"
        value={state.search}
        onInput={(e) => events.onSearch(e.currentTarget.value)}
      />
      <div class="sv-groups">
        {groups.map((group) => (
          <section
            key={group.group}
            class="sv-group"
            data-group={group.group}
            aria-label={group.label}
          >
            <h3 class="sv-group-head">
              <span>{group.label}</span>
              {group.note ? <span class="sv-group-note">{group.note}</span> : null}
            </h3>
            {group.rows.map((row) => (
              <div
                key={row.key}
                class="sv-row"
                data-key={row.key}
                data-set={row.set && !row.unresolved ? "" : undefined}
                data-field={row.field ? "" : undefined}
                data-unresolved={row.unresolved ? "" : undefined}
              >
                <ListRow
                  size="compact"
                  overflow="self"
                  label={
                    <span class="sv-name" title={row.name}>
                      <span class="sv-name-text">{row.name}</span>
                      {row.line !== undefined ? (
                        <span class="sv-line">{`· ${row.line}`}</span>
                      ) : null}
                    </span>
                  }
                  trailing={<ValueField row={row} events={events} />}
                  actions={
                    <span class="sv-clear-slot flex w-(--swp-route-control-size) flex-none items-center">
                      <button
                        type="button"
                        class="sv-clear"
                        aria-label={`Clear ${row.name}`}
                        title="Clear"
                        style={row.set ? undefined : { visibility: "hidden" }}
                        tabIndex={row.set ? 0 : -1}
                        onClick={() => events.onClear(row.key)}
                      >
                        ×
                      </button>
                    </span>
                  }
                />
              </div>
            ))}
          </section>
        ))}
      </div>
      <div class="sv-status" role="status">
        {state.loaded?.failed ? (
          notLoadedStatus(state.loaded.name)
        ) : state.loaded ? (
          <>
            <span>{loadedStatus(state.loaded.count, state.loaded.name)}</span>
            <button type="button" class="sv-undo" onClick={events.onUndoLoad}>
              Undo
            </button>
          </>
        ) : (
          valuesStatus(state)
        )}
      </div>
      <footer class="sv-foot">
        {events.load ? <LoadSave {...events.load} /> : null}
        <button
          type="button"
          class="sv-reset"
          disabled={Object.keys(state.values).length === 0}
          onClick={events.onResetAll}
        >
          Reset all
        </button>
      </footer>
    </div>
  );
}
