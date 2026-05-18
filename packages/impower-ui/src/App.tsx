import { useEffect, useRef, useState } from "preact/hooks";
import { renderToString } from "preact-render-to-string";
import "./components/icon/Icon.elem"; // registers <s-icon>
import * as Icons from "./components/icon/icons.generated";

const SAMPLE: Array<keyof typeof Icons> = [
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Check",
  "X",
  "Plus",
  "Menu",
  "Search",
  "ChevronDown",
  "ChevronRight",
  "DotsVertical",
  "Share",
  "Star",
  "StarFill",
  "AlertTriangle",
  "InfoCircle",
  "XOctagon",
  "Refresh",
  "DeviceFloppy",
  "Link",
  "Code",
  "Logo",
];

// Simulate the build pipeline: SSR the full <s-icon> element including its
// children. <s-icon> owns its own styling (via CSS in style.css), so the SSR'd
// HTML is self-rendering before JS upgrades it. On upgrade, preact-custom-element
// captures children, wipes innerHTML, re-renders the Icon component (a Fragment
// passthrough) — net result: same DOM, no extra wrapper.
const ssrIconHtml = renderToString(
  <s-icon class="text-3xl">
    <Icons.Check />
  </s-icon>,
);

export function App() {
  const ssrRef = useRef<HTMLDivElement>(null);
  const [liveDom, setLiveDom] = useState<string>("");

  useEffect(() => {
    if (!ssrRef.current) return;
    queueMicrotask(() => {
      if (ssrRef.current) setLiveDom(ssrRef.current.innerHTML);
    });
  }, []);

  return (
    <div class="min-h-screen w-full bg-neutral-50 text-neutral-800 font-sans p-8">
      <header class="mb-8">
        <h1 class="text-2xl font-semibold mb-1">@impower/impower-ui</h1>
        <p class="text-sm text-neutral-500">
          Dev playground. Components ported so far:
        </p>
      </header>

      <section class="mb-10">
        <h2 class="text-lg font-medium mb-4">
          Direct use:{" "}
          <code class="font-mono text-sm bg-neutral-200 px-2 py-0.5 rounded">
            &lt;Check /&gt;
          </code>
        </h2>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
          {SAMPLE.map((name) => {
            const IconCmp = Icons[name];
            return (
              <div
                key={name}
                class="flex flex-col items-center gap-2 p-3 rounded-md border border-neutral-200 bg-white"
              >
                <IconCmp width={28} height={28} />
                <span class="text-xs font-mono text-neutral-600">{name}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section class="mb-10">
        <h2 class="text-lg font-medium mb-4">
          As custom element:{" "}
          <code class="font-mono text-sm bg-neutral-200 px-2 py-0.5 rounded">
            &lt;s-icon class="text-2xl"&gt;&lt;Check /&gt;&lt;/s-icon&gt;
          </code>
        </h2>
        <div class="flex items-center gap-6">
          <s-icon class="text-base">
            <Icons.Check />
          </s-icon>
          <s-icon class="text-xl">
            <Icons.Check />
          </s-icon>
          <s-icon class="text-3xl">
            <Icons.Check />
          </s-icon>
          <s-icon class="text-5xl">
            <Icons.Check />
          </s-icon>
        </div>
      </section>

      <section>
        <h2 class="text-lg font-medium mb-4">SSR + Hydrate test</h2>
        <p class="text-sm text-neutral-600 mb-3">
          The HTML below is what the build pipeline will emit. On client load,
          preact-custom-element captures children as VNodes and the Icon
          component (a Fragment passthrough) re-renders them in place. The
          SSR'd HTML and the live DOM should be effectively identical.
        </p>

        <div class="flex items-center gap-6 mb-4">
          <span class="text-xs text-neutral-500">rendered:</span>
          <div ref={ssrRef} dangerouslySetInnerHTML={{ __html: ssrIconHtml }} />
        </div>

        <details class="text-xs" open>
          <summary class="cursor-pointer text-neutral-600 mb-2">
            DOM snapshots
          </summary>
          <div class="grid grid-cols-2 gap-4 mt-2">
            <div>
              <div class="text-neutral-500 mb-1">
                SSR'd HTML (server output)
              </div>
              <pre class="p-2 bg-neutral-100 rounded overflow-auto whitespace-pre-wrap">
                {ssrIconHtml}
              </pre>
            </div>
            <div>
              <div class="text-neutral-500 mb-1">
                Live DOM (post-hydrate)
              </div>
              <pre class="p-2 bg-neutral-100 rounded overflow-auto whitespace-pre-wrap">
                {liveDom || "(not yet captured)"}
              </pre>
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
