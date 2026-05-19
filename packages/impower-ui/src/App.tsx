import { useState } from "preact/hooks";
import {
  Bolt,
  BoltFill,
  LoadingBar,
  Photo,
  PhotoFill,
  Share,
  ShareFill,
  Tab,
  Tabs,
} from "./components";

export function App() {
  const [pane, setPane] = useState<string>("logic");
  const [subPanel, setSubPanel] = useState<string>("main");
  return (
    <div class="min-h-screen w-full bg-neutral-50 text-neutral-800 font-sans p-8">
      <header class="mb-6">
        <h1 class="text-2xl font-semibold mb-1">@impower/impower-ui</h1>
        <p class="text-sm text-neutral-500">Component showcase (rebuild).</p>
      </header>

      <section class="space-y-4">
        <h2 class="text-lg font-medium">
          <code class="font-mono text-sm bg-neutral-200 px-2 py-0.5 rounded">
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
          <code class="font-mono text-sm bg-neutral-200 px-2 py-0.5 rounded">
            &lt;Tabs&gt; / &lt;Tab&gt;
          </code>
        </h2>
        <Row label="Top sub-tabs (underline indicator, plain labels)">
          <div class="w-[480px] bg-neutral-100 border border-neutral-200 rounded">
            <Tabs value={subPanel} onChange={setSubPanel}>
              <Tab value="main">Main</Tab>
              <Tab value="scripts">Scripts</Tab>
            </Tabs>
            <div class="p-4 text-sm text-neutral-600">
              Active sub-panel: <strong>{subPanel}</strong>
            </div>
          </div>
        </Row>
        <Row label="Bottom nav (icons + active-icon swap, no indicator)">
          <div class="w-[480px] bg-neutral-900 text-neutral-50 rounded">
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
    </div>
  );
}

function Row({ label, children }: { label: string; children: any }) {
  return (
    <div>
      <div class="text-xs text-neutral-500 mb-1.5">{label}</div>
      {children}
    </div>
  );
}
