# @impower/impower-ui

The component library the web editor (`impower-dev`) is built from. It holds every
primitive and every composed control; the editor's feature folders compose them and
never draw their own. Each rule below is one example from the existing `Button`
(`src/components/button/Button.tsx`) or `Dropdown`
(`src/components/dropdown/Dropdown.tsx`); follow the rule when adding or changing a
component.

## Commands

Run from the repository root:

| Task | Command |
|---|---|
| Gallery (every component, variant, size and state on one page) | `npm --prefix packages/impower-ui run dev`, then open the printed URL |
| Tests | `node scripts/test-suite.mjs run packages/impower-ui <test-file> [<test-file> ...] --wait <seconds>` |
| Whole package | the `packages/impower-ui` job of the Test Suite workflow, on every pull request that touches `packages/` (local whole-package runs are refused) |
| Typecheck | `npm run typecheck -- packages/impower-ui/` |
| Radix import boundary | `npm run lint:radix-boundary` |

## Rules

### One component per Radix primitive

A Radix primitive is wrapped once, here, and every caller uses the wrapper. `Dropdown`
is the only component that imports `@radix-ui/react-dropdown-menu`; it exports `DropdownRoot`,
`DropdownTrigger`, `DropdownContent`, `DropdownItem`, `DropdownCheckboxItem` and
`DropdownSeparator`, and the editor's menus are built from those parts.

No file outside `packages/impower-ui` imports `@radix-ui/*`. The root `eslint.config.js`
refuses a static import, re-export or `import x = require()` (`no-restricted-imports`) and a
literal `import()`, `require()` or `typeof import()` (`no-restricted-syntax`), CI runs it in the Typecheck workflow, and inline
`eslint-disable` comments cannot lift it. A primitive the editor needs and this
package lacks is a new component here, not a direct import.

### One folder per component

`src/components/<name>/` holds the component, its test and its gallery entry:

```
src/components/button/
  Button.tsx           the component
  Button.test.tsx      its test, run by this package's vitest harness
  Button.gallery.tsx   its gallery entry: every variant, size and state
```

A component is exported from `src/components/index.ts`, and its gallery entry is listed
in `galleryEntries` in `src/App.tsx`. `test/gallery.test.tsx` fails when an exported
component appears in no gallery entry, and `test/serverRender.test.tsx` renders every
entry through `preact-render-to-string`, so a new export without a gallery entry, or one
that cannot render on the server, fails the package's tests.

### Appearance is `cva` variants

Classes are chosen by `class-variance-authority` variants, not by conditionals in the
render. `buttonVariants` declares `variant` (`primary`, `secondary`, `outline`, `ghost`,
`link`, `destructive`, `fab`) and `size` (`default`, `sm`, `xs`, `lg`, `icon`,
`icon-lg`, `fab`), with `defaultVariants` for both.

Where a variant must override a size, use `compoundVariants` rather than a special case
in the component. A `link` Button sizes to its text whatever its size:

```ts
compoundVariants: [{ variant: "link", class: "size-auto p-0" }],
```

Export the variants function and the `VariantProps` type so callers can name a variant
without restating it:

```ts
export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;
```

The gallery entry keys its tables by these types (`Record<ButtonVariant, string>`), so a
new variant fails the typecheck until the gallery shows it.

### `className` is merged through `cn`

The caller's class is merged last through `cn` (`src/utils/cn.ts`: `clsx` then
`tailwind-merge`), so a caller's utility replaces the variant's conflicting one instead of
fighting it in the cascade:

```ts
const classes = cn(buttonVariants({ variant, size }), className);
```

`DropdownContent` does the same with `cn(dropdownContent(), className)`.

### No per-pixel props

A component's props say what it is (a variant, a size, a state), never how many pixels
it is. A page sets only what it must: a margin, a width in its own layout, a colour. The
editor writes `<Button variant="ghost" size="icon" class="ml-2">`, not a `padding` or
`height` prop, and not an inline `style` object for layout.

Colours are semantic utilities (`bg-surface`, `text-foreground`, `border-divider`), never
a raw palette utility such as `bg-neutral-800` or a hex value. Themes override the
semantic custom properties; the tokens are recorded in
[`impower-dev/docs/design/tokens.md`](../../impower-dev/docs/design/tokens.md).

### Shared hooks live here

A hook that both this package and the app need is exported from impower-ui, and the app
imports it rather than writing its own. Layout and pointer are decided by `useLayout`
and `useCoarsePointer` (exported from `@impower/impower-ui/layout`), which also set the
`data-layout` and `data-pointer` attributes on the root, never by user agent. `Dropdown`
reads `useLayout()` and opens as a bottom sheet in the `phone` layout and as a menu
otherwise.

### Motion belongs to the component

The component that moves owns its enter and exit motion; feature code never animates a
control itself. `DropdownContent` declares its own `data-[state=open]:anim-menu-in` and
`data-[state=closed]:anim-menu-out`, and `Button` its own colour transition. Motion uses
the durations and easings in the design reference's
[Motion section](../../impower-dev/docs/design/tokens.md#motion) and is gated so
`prefers-reduced-motion: reduce` removes it: write it as `motion-safe:` utilities, add a
`motion-reduce:` override, or declare it inside a `prefers-reduced-motion` media query.
`Button`'s transition and `Dropdown`'s menu and sheet motion are not gated yet; the slice
that next changes either one adds the gate.

### Pane width is a container query

A component that must fit the pane it sits in responds to the pane's width through a
container query (`@container` on the pane, `@md:` utilities inside), not to the viewport.
The viewport decides only the overall layout, through `useLayout`.

### Preact: an `asChild` child spreads its props and forwards its ref

This library runs Radix under `preact/compat`. With `asChild`, Radix's `Slot` merges the
wrapper's props and ref onto the single child, so a component passed as that child must
spread the props it receives onto its root element and forward its ref with
`forwardRef`. `Button` is such a child: `DropdownTrigger asChild` wraps it, and Button
forwards its ref to the `<button>` and spreads `...rest` onto it:

```tsx
<DropdownTrigger asChild>
  <Button variant="outline">Open menu</Button>
</DropdownTrigger>
```

A Radix primitive's open, close, focus and Escape behaviour is asserted in a test under
`preact/compat`, because some primitives (Dialog, Tooltip) have known compat failures.
`Button.test.tsx` asserts that `Button asChild` puts its classes on the slotted anchor
and forwards its ref to it.

## Tests

`vitest.config.ts` runs `src/**/*.test.tsx` and `test/**/*.test.tsx` under jsdom. It
compiles JSX with esbuild's `jsxImportSource: "preact"` rather than `@preact/preset-vite`,
whose plugin is typed for the workspace's Vite and not the Vite inside vitest. It aliases
`react` to `preact/compat` and inlines Radix so Radix uses the same Preact instance. A file that renders on the server sets
`// @vitest-environment node`, as `test/serverRender.test.tsx` does. Run tests only through
`node scripts/test-suite.mjs run packages/impower-ui ...`, which applies the repository's
memory limit and one-worker isolation.
