# How to add a surface

A surface is anything the editor shows: a row, a page section, a menu, a dialog, a
sheet. Every surface is composed from `@impower/impower-ui`; a feature folder under
`impower-dev/src/modules/spark-editor/components/` arranges the parts and never draws
its own. The rules a new `impower-ui` component follows are in the
[package README](../../../packages/impower-ui/README.md); this page covers composing
the existing ones. The shell and the component map are in
[architecture.md](../architecture.md#the-shell-the-routes-and-the-layouts).

## Example: a settings row

A switch in Settings, Script editor, Script appearance:

1. Declare the preference in
   `impower-dev/src/modules/spark-editor/workspace/settings/settingsSchema.ts`, beside
   its neighbours, with its default (`wrapLongLines` stands for the new key):

   ```ts
   wrapLongLines: setting(false),
   ```

   A choice takes `choice(default, CHOICES)`, a text value `setting("", { maxLength })`.
   The type of the preference, its stored value and its reset all follow from this
   line.

2. Add the row to its section. `components/settings/ScriptEditorSection.tsx` lists
   its switches as specs (`APPEARANCE_SWITCHES`, `ASSISTANCE_SWITCHES`), and each spec renders as a `SwitchRow`:

   ```ts
   { key: "wrapLongLines", name: "Wrap long lines", detail: "Wrap a line that is wider than the editor." },
   ```

   A row elsewhere uses the kit directly: `SettingsSection`, `SettingsGroup` and
   `SettingsList` frame it, and `SwitchRow`, `SelectRow`, `TextRow`, `SliderRow`,
   `ChoiceRow` and `FactRow` are the rows
   (`packages/impower-ui/src/components/settings/Settings.tsx`). A row reads its value
   from `useSettings().preferences` and writes it with `setPreference(key, value)`;
   it never touches storage.

3. Where the editor reads the value, read it from `workspaceSettings`
   (`workspace/settings/WorkspaceSettings.ts`); script appearance values are gathered
   in its `scriptAppearance` signal.

4. Typecheck with `npm run typecheck -- impower-dev/` and look at the row with the
   driver: `node .agents/skills/drive-web-editor/driver.mjs screenshot row --step settings=editor-preferences --viewport desktop`.

A section is added the same way: its id, label and title in
`components/settings/sections.ts`, its component beside the others, and its entry in
`SECTION_BODIES` in `SettingsPage.tsx`. `#project?section=<id>` opens it.

## Rows and lists

`ListRow` (`packages/impower-ui/src/components/list-row/`) is the row of every list:
the Scripts and Assets pages, the Add menu and its pickers, and the Outline. Long
lists render through `VirtualList`. A row is at least 44px tall, and every action it
offers is also in its menu, so nothing depends on hover.

## Dialogs, sheets and menus

- `Dialog`, with `DialogTitle`, `DialogDescription` and `DialogActions`, for a question
  that blocks the page (`packages/impower-ui/src/components/dialog/Dialog.tsx`).
- `Sheet`, from the same file, for a modal panel that rises from the bottom edge.
- `ActionSheet` (`components/action-sheet/`) for a short list of actions on phones.
- `DropdownRoot`, `DropdownTrigger`, `DropdownContent` and its items
  (`components/dropdown/`) for a menu, and `Popover` for anything else anchored to a
  control.

No route draws its own backdrop, menu, popover, dialog, sheet, toast or list row, and
no file outside `packages/impower-ui` imports `@radix-ui/*`. Each component owns its
enter and exit motion, removed under `prefers-reduced-motion`.

## Icons

Icons are SVG files in `packages/impower-ui/src/icons/svg/`, one per icon, named in
kebab case on a 24 by 24 viewBox with `stroke="currentColor"`. After adding one, run

```sh
npm --prefix packages/impower-ui run gen:icons
```

to regenerate `components/icon/icons.generated.tsx` (one `<Name>Icon` component each)
and `components/icon/icon-masks.generated.ts` (the same icons as CSS masks). Import
the component from `@impower/impower-ui/icons`. Commit the SVG and both generated
files together.

## Variables

Colours are CSS custom properties in three tiers: primitive (a palette value),
semantic (`--surface`, `--ink`, `--accent`, `--divider`, the problem colours) and
component (a control's own edge or band). Themes override the semantic tier under
`[data-theme="<id>"]` on the root (`packages/impower-ui/src/theme.css`), and Tailwind
reads them through `@theme inline` (`packages/impower-ui/src/style.css`). A surface
uses semantic utilities only, such as `bg-surface`, `text-ink` and `border-divider`:
never a palette utility, a hex value or a colour chosen in JavaScript. The values and
their contrast are in [tokens.md](./tokens.md).

Width decides the layout and the pointer decides touch affordances, through
`useLayout` and `useCoarsePointer` or the root's `data-layout` and `data-pointer`
attributes; a surface that must fit its pane uses a container query on the pane.

## Driver steps

A surface the driver should open gets a named step in
`.agents/skills/drive-web-editor/steps.mjs` (`NAMED_STEPS`: what it does, and the
selector of the surface it waits for) and its body in `NAMED_STEP_BODIES` in
`driver.mjs`. A step whose surface is in the preview pane sets `reveals: "preview"`.
The step list in the
[drive-web-editor skill](../../../.agents/skills/drive-web-editor/SKILL.md#named-steps)
names each step and its surface; add the new one there.
