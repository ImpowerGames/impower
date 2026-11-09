import type { ShortcutSection } from "./shortcuts";
import { comboLabel } from "./shortcuts";

export type ShortcutsSheetProps = {
  sections: readonly ShortcutSection[] | null;
  mac: boolean;
};

export default function ShortcutsSheet({ sections, mac }: ShortcutsSheetProps) {
  if (!sections) {
    return <p class="p-4 text-[13px]/[1.5] text-muted">Reading the editor's keys…</p>;
  }
  return (
    <div tabIndex={0} data-shortcuts-sheet class="grid gap-5 p-4 outline-none">
      {sections
        .filter((section) => section.rows.length > 0)
        .map((section) => (
          <section key={section.group} aria-labelledby={`shortcuts-${section.group}`}>
            <h3
              id={`shortcuts-${section.group}`}
              class="mb-2 text-[12px]/[1.5] font-semibold text-muted"
            >
              {section.title}
            </h3>
            <dl class="m-0 grid gap-3 text-[13px]/[1.5]">
              {section.rows.map((row) => {
                const labels = [
                  ...new Set(row.keys.map((key) => comboLabel(key, mac))),
                ];
                return (
                  <div
                    key={row.id}
                    data-shortcut={row.id}
                    class="flex items-baseline justify-between gap-3.5"
                  >
                    <dt class="text-muted">{row.label}</dt>
                    <dd class="m-0 flex flex-wrap justify-end gap-1 text-right text-ink">
                      {labels.length ? (
                        labels.map((label) => (
                          <kbd
                            key={label}
                            class="rounded-[5px] border border-edge bg-paper px-1.5 font-sans text-[12px]/[1.6] whitespace-nowrap"
                          >
                            {label}
                          </kbd>
                        ))
                      ) : (
                        <span class="text-muted">None</span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
    </div>
  );
}
