import { ChangeDesc, MapMode } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

export type BindingKind = "function" | "variable" | "const-variable" | "namespace";
export type Binding = { kind: BindingKind; fromStdlib: boolean };

type Site = { from: number; to: number; name: string };
type Declaration = Site & { scope: number; kind: BindingKind };
type Reference = Site & { scopes: number[]; declaration: boolean };

/** Scope identities are the starts of enclosing function definitions. Global
 * scope is -1. These are the same function-only scopes SemanticAnnotator uses. */
function scopesAt(node: SyntaxNode): number[] {
  const scopes: number[] = [];
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.name === "LuauFunctionDefinition") scopes.push(parent.from);
  }
  scopes.push(-1);
  return scopes;
}

/** Keeps resolved AND unresolved reference sites. A newly introduced binding
 * must be able to add a token where there was previously no annotation.
 * Declaration changes only re-resolve references indexed under the changed
 * names; neither syntax traversal nor other annotators' windows are widened. */
export class SemanticDependencies {
  private declarations: Declaration[] = [];
  private references = new Map<string, Reference[]>();
  private observedDeclarations: Declaration[] = [];
  private observedReferences: Reference[] = [];
  private changedNames = new Set<string>();

  begin() {
    this.observedDeclarations = [];
    this.observedReferences = [];
  }

  bind(node: SyntaxNode, name: string, kind: BindingKind) {
    this.observedDeclarations.push({
      from: node.from,
      to: node.to,
      name,
      kind,
      scope: scopesAt(node)[0]!,
    });
  }

  reference(node: SyntaxNode, name: string, declaration: boolean) {
    this.observedReferences.push({
      from: node.from,
      to: node.to,
      name,
      declaration,
      scopes: scopesAt(node),
    });
  }

  map(changes: ChangeDesc) {
    const mapSite = <T extends Site>(site: T): T | null => {
      const from = changes.mapPos(site.from, 1, MapMode.TrackDel);
      const to = changes.mapPos(site.to, -1, MapMode.TrackDel);
      return from == null || to == null || from > to ? null : { ...site, from, to };
    };
    const mapScope = (scope: number) =>
      scope < 0 ? scope : changes.mapPos(scope, 1);
    this.declarations = this.declarations.flatMap((site) => {
      const mapped = mapSite(site);
      if (!mapped) {
        this.changedNames.add(site.name);
        return [];
      }
      return [{ ...mapped, scope: mapScope(site.scope) }];
    });
    for (const [name, sites] of this.references) {
      const mapped = sites.flatMap((site) => {
        const next = mapSite(site);
        return next ? [{ ...next, scopes: site.scopes.map(mapScope) }] : [];
      });
      if (mapped.length) this.references.set(name, mapped);
      else this.references.delete(name);
    }
  }

  finish(
    from: number,
    to: number,
    stdlib: Map<string, Binding>,
    replace: (site: Reference, binding: Binding | undefined) => void,
  ) {
    const overlaps = (site: Site) => site.to >= from && site.from <= to;
    const previous = this.declarations.filter(overlaps);
    // `to` belongs to the owner node, which may extend across an entire
    // function. Changing only its end is not a change to the binding.
    const key = (site: Declaration) =>
      `${site.from}:${site.scope}:${site.name}:${site.kind}`;
    const oldKeys = new Set(previous.map(key));
    const newKeys = new Set(this.observedDeclarations.map(key));
    for (const site of previous) {
      if (!newKeys.has(key(site))) this.changedNames.add(site.name);
    }
    for (const site of this.observedDeclarations) {
      if (!oldKeys.has(key(site))) this.changedNames.add(site.name);
    }
    this.declarations = [
      ...this.declarations.filter((site) => !overlaps(site)),
      ...this.observedDeclarations,
    ].sort((a, b) => a.from - b.from);
    for (const [name, sites] of this.references) {
      const kept = sites.filter((site) => !overlaps(site));
      if (kept.length) this.references.set(name, kept);
      else this.references.delete(name);
    }
    for (const site of this.observedReferences) {
      const sites = this.references.get(site.name);
      if (sites) sites.push(site);
      else this.references.set(site.name, [site]);
    }
    const declarationsByName = new Map<string, Declaration[]>();
    for (const site of this.declarations) {
      if (!this.changedNames.has(site.name)) continue;
      const sites = declarationsByName.get(site.name);
      if (sites) sites.push(site);
      else declarationsByName.set(site.name, [site]);
    }
    for (const name of this.changedNames) {
      const refs = this.references.get(name);
      if (!refs || refs.every(overlaps)) continue;
      refs.sort((a, b) => a.from - b.from);
      const bindings = declarationsByName.get(name) ?? [];
      const visible = new Map<number, Binding>();
      const builtin = stdlib.get(name);
      if (builtin) visible.set(-1, builtin);
      let i = 0;
      for (const ref of refs) {
        while (i < bindings.length && bindings[i]!.from <= ref.from) {
          const binding = bindings[i++]!;
          visible.set(binding.scope, { kind: binding.kind, fromStdlib: false });
        }
        // The ordinary pass already emitted tokens inside its window.
        if (overlaps(ref)) continue;
        let binding: Binding | undefined;
        for (const scope of ref.scopes) {
          binding = visible.get(scope);
          if (binding) break;
        }
        replace(ref, binding);
      }
    }
    this.changedNames.clear();
    return this.declarations
      .filter((site) => site.scope === -1)
      .map(({ from: start, name, kind }) => ({ from: start, name, kind }));
  }
}
