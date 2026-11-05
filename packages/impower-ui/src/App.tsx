import { useState } from "preact/hooks";
import { layoutMinWidths } from "./layout/breakpoints";
import {
  Bolt,
  BoltFill,
  Button,
  Download,
  LoadingBar,
  Photo,
  PhotoFill,
  Share,
  ShareFill,
  SplitPane,
  Tab,
  Tabs,
  X,
} from "./components";

export function App() {
  const [pane, setPane] = useState<string>("logic");
  const [subPanel, setSubPanel] = useState<string>("main");
  const [splitActive, setSplitActive] = useState<"start" | "end">("start");
  return (
    <div class="min-h-screen w-full bg-background text-foreground font-sans p-8">
      <header class="mb-6">
        <h1 class="text-2xl font-semibold mb-1">@impower/impower-ui</h1>
        <p class="text-sm text-neutral-400">Component showcase (rebuild).</p>
      </header>

      <section class="space-y-4">
        <h2 class="text-lg font-medium">
          <code class="font-mono text-sm bg-surface px-2 py-0.5 rounded">
            &lt;LoadingBar&gt;
          </code>
        </h2>
        <Row label="Default (text-primary, full width)">
          <div class="w-96">
            <LoadingBar />
          </div>
        </Row>
        <Row label="Success color (text-success)">
          <div class="w-96">
            <LoadingBar class="text-success" />
          </div>
        </Row>
        <Row label="Danger color (text-danger)">
          <div class="w-96">
            <LoadingBar class="text-danger" />
          </div>
        </Row>
        <Row label="Constrained width">
          <LoadingBar class="w-40 text-warning" />
        </Row>
        <Row label="Thicker bar (h-1)">
          <div class="w-96">
            <LoadingBar class="h-1" />
          </div>
        </Row>
      </section>

      <section class="mt-10 space-y-4">
        <h2 class="text-lg font-medium">
          <code class="font-mono text-sm bg-surface px-2 py-0.5 rounded">
            &lt;Button&gt;
          </code>
        </h2>
        <Row label="Variants (default size)">
          <div class="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
        </Row>
        <Row label="Sizes (primary variant)">
          <div class="flex flex-wrap items-center gap-3">
            <Button size="xs">Extra small</Button>
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Close"><X /></Button>
          </div>
        </Row>
        <Row label="With icons and disabled state">
          <div class="flex flex-wrap items-center gap-3">
            <Button>
              <Download class="size-4" /> Download
            </Button>
            <Button variant="outline" disabled>
              Disabled
            </Button>
          </div>
        </Row>
        <Row label="asChild — styles applied to an anchor instead">
          <Button asChild variant="link">
            <a href="https://impower.dev" target="_blank" rel="noreferrer">
              Visit impower.dev
            </a>
          </Button>
        </Row>
      </section>

      <section class="mt-10 space-y-4">
        <h2 class="text-lg font-medium">
          <code class="font-mono text-sm bg-surface px-2 py-0.5 rounded">
            &lt;Tabs&gt; / &lt;Tab&gt;
          </code>
        </h2>
        <Row label="Top sub-tabs (underline indicator, plain labels)">
          <div class="w-[480px] bg-surface border border-surface-border rounded">
            <Tabs value={subPanel} onChange={setSubPanel}>
              <Tab value="main">Main</Tab>
              <Tab value="scripts">Scripts</Tab>
            </Tabs>
            <div class="p-4 text-sm text-neutral-300">
              Active sub-panel: <strong>{subPanel}</strong>
            </div>
          </div>
        </Row>
        <Row label="Bottom nav (icons + active-icon swap, no indicator)">
          <div class="w-[480px] bg-popup text-foreground border border-surface-border rounded">
            <Tabs value={pane} onChange={setPane} indicator="none" class="py-2">
              <Tab value="logic" icon={Bolt} activeIcon={BoltFill}>
                Logic
              </Tab>
              <Tab value="assets" icon={Photo} activeIcon={PhotoFill}>
                Assets
              </Tab>
              <Tab value="share" icon={Share} activeIcon={ShareFill}>
                Share
              </Tab>
            </Tabs>
          </div>
        </Row>
      </section>

      <section class="mt-10 space-y-4">
        <h2 class="text-lg font-medium">
          <code class="font-mono text-sm bg-surface px-2 py-0.5 rounded">
            &lt;SplitPane&gt;
          </code>
        </h2>
        <Row
          label={`Drag the divider to resize. Resize browser below ${layoutMinWidths.compact}px, the phone layout cut, to test responsive collapse.`}
        >
          <div class="flex items-center gap-3 mb-2">
            <span class="text-xs text-neutral-400">Mobile-active pane:</span>
            <button
              type="button"
              class={`px-3 py-1 text-xs rounded ${
                splitActive === "start"
                  ? "bg-primary text-white"
                  : "bg-surface"
              }`}
              onClick={() => setSplitActive("start")}
            >
              Start
            </button>
            <button
              type="button"
              class={`px-3 py-1 text-xs rounded ${
                splitActive === "end"
                  ? "bg-primary text-white"
                  : "bg-surface"
              }`}
              onClick={() => setSplitActive("end")}
            >
              End
            </button>
          </div>
          <div class="w-full h-72 border border-surface-border rounded overflow-hidden">
            <SplitPane
              activePanel={splitActive}
              start={
                <div class="flex h-full items-center justify-center bg-surface text-foreground">
                  Start panel (e.g. editor)
                </div>
              }
              end={
                <div class="flex h-full items-center justify-center bg-popup text-foreground">
                  End panel (e.g. preview)
                </div>
              }
            />
          </div>
        </Row>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: any }) {
  return (
    <div>
      <div class="text-xs text-neutral-400 mb-1.5">{label}</div>
      {children}
    </div>
  );
}
