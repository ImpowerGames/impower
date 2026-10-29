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
      class="sv-field"
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

export interface StartingValuesTabProps {
  state: StartingValuesViewState;
  events: StartingValuesEvents;
}

export function StartingValuesTab({ state, events }: StartingValuesTabProps) {
  const groups = valueGroups(state);
  return (
    <div class="sv-tab" role="tabpanel" aria-label="Starting values">
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
                <span class="sv-name" title={row.name}>
                  <span class="sv-name-text">{row.name}</span>
                  {row.line !== undefined ? (
                    <span class="sv-line">{`· ${row.line}`}</span>
                  ) : null}
                </span>
                <ValueField row={row} events={events} />
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
              </div>
            ))}
          </section>
        ))}
      </div>
      <div class="sv-status" role="status">
        {valuesStatus(state)}
      </div>
      <footer class="sv-foot">
        <button
          type="button"
          class="sv-reset"
          disabled={valuesSet(state) === 0}
          onClick={events.onResetAll}
        >
          Reset all
        </button>
      </footer>
    </div>
  );
}
