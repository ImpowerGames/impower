import { LoadingBar } from "./components";

export function App() {
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
