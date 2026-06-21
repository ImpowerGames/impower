import { Button } from "@impower/impower-ui/components";
import { useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";

export const propDefaults = {};
export type DebugPanelProps = Partial<typeof propDefaults>;

// Debug panel shown below the game preview while suspended at a breakpoint/step.
// It renders the call stack + the four variable scopes (Vars/Temps/Lists/
// Defines) as a lazy-but-prefetched tree (children come pre-resolved in
// debug.session.childrenByRef so the panel is pure render — no channel access).
export default function DebugPanel(_props: DebugPanelProps) {
  const session = workspace.state.value.debug?.session;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Self-hide unless suspended.
  if (!session?.paused) {
    return null;
  }

  const childrenByRef = session.childrenByRef ?? {};
  const scopeOpen = (key: string) => expanded[key] ?? true; // scopes default open
  const varOpen = (key: string) => expanded[key] ?? false; // values default closed
  const setOpen = (key: string, open: boolean) =>
    setExpanded((e) => ({ ...e, [key]: open }));

  const onContinue = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.continueGame();
  };
  const onStep = async (traversal: "in" | "out" | "over") => {
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.stepGame(traversal);
  };
  const onFrameClick = async (location: any) => {
    if (!location?.uri || !location.range) {
      return;
    }
    const { Workspace } = await import("../../workspace/Workspace");
    Workspace.window.showDocument(location.uri, location.range, true);
  };

  const renderVar = (v: any, depth: number, keyPrefix: string) => {
    const key = `${keyPrefix}/${v.name}`;
    const ref = v.variablesReference;
    const children: any[] = ref > 0 ? childrenByRef[ref] ?? [] : [];
    const expandable = children.length > 0;
    const open = varOpen(key);
    return (
      <div key={key}>
        <div
          class="flex flex-row items-center gap-1 py-0.5 pr-2 text-xs hover:bg-engine-800"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={expandable ? () => setOpen(key, !open) : undefined}
        >
          <span class="w-3 shrink-0 text-foreground/40">
            {expandable ? (open ? "▾" : "▸") : ""}
          </span>
          <span class="text-sky-300">{v.name}</span>
          <span class="text-foreground/40">=</span>
          <span class="truncate text-foreground/80">{v.value}</span>
          {v.type ? (
            <span class="ml-1 shrink-0 text-foreground/30">{v.type}</span>
          ) : null}
        </div>
        {expandable && open
          ? children.map((c) => renderVar(c, depth + 1, key))
          : null}
      </div>
    );
  };

  const scopes: { label: string; vars: any[] | undefined }[] = [
    { label: "Vars", vars: session.scopes?.vars },
    { label: "Temps", vars: session.scopes?.temps },
    { label: "Lists", vars: session.scopes?.lists },
    { label: "Defines", vars: session.scopes?.defines },
  ];

  return (
    <div
      class="flex shrink-0 flex-col overflow-auto border-t border-engine-700 bg-engine-900 text-xs text-foreground"
      style={{ maxHeight: "40vh" }}
    >
      {/* Resume / step controls */}
      <div class="sticky top-0 z-[1] flex flex-row items-center gap-1 bg-engine-900 px-2 py-1">
        <Button variant="ghost" size="sm" onClick={onContinue}>
          ▶ Continue
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onStep("over")}>
          Step Over
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onStep("in")}>
          Step In
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onStep("out")}>
          Step Out
        </Button>
      </div>

      {/* Call stack */}
      <div class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-foreground/50">
        Call Stack
      </div>
      {(session.stackFrames ?? []).length === 0 ? (
        <div class="px-2 py-0.5 text-foreground/40">(no frames)</div>
      ) : (
        (session.stackFrames ?? []).map((f: any) => (
          <div
            key={f.id}
            class="flex cursor-pointer flex-row items-center gap-2 px-2 py-0.5 hover:bg-engine-800"
            onClick={() => onFrameClick(f.location)}
          >
            <span class="truncate text-foreground/90">{f.name}</span>
            <span class="shrink-0 text-foreground/30">
              {f.location?.uri
                ? `${shortUri(f.location.uri)}:${(f.location.range?.start?.line ?? 0) + 1}`
                : ""}
            </span>
          </div>
        ))
      )}

      {/* Variables */}
      <div class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-foreground/50">
        Variables
      </div>
      {scopes.map((s) => {
        const key = `scope/${s.label}`;
        const vars = s.vars ?? [];
        const open = scopeOpen(key);
        return (
          <div key={key}>
            <div
              class="flex flex-row items-center gap-1 px-2 py-0.5 hover:bg-engine-800"
              onClick={() => setOpen(key, !open)}
            >
              <span class="w-3 shrink-0 text-foreground/40">
                {vars.length > 0 ? (open ? "▾" : "▸") : ""}
              </span>
              <span class="text-foreground/70">{s.label}</span>
              <span class="text-foreground/30">({vars.length})</span>
            </div>
            {open ? vars.map((v) => renderVar(v, 1, key)) : null}
          </div>
        );
      })}
    </div>
  );
}

function shortUri(uri: string) {
  const i = uri.lastIndexOf("/");
  return i >= 0 ? uri.slice(i + 1) : uri;
}
