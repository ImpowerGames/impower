import { useEffect, useRef, useState } from "preact/hooks";
import { renderToString } from "preact-render-to-string";
import "./components/icon/Icon.elem"; // registers <s-icon>
import Icon from "./components/icon/Icon";
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

// Simulate the build pipeline:
//   1. Render only the *children* of the component to a string (not the
//      component's outer wrapper — the custom-element tag IS the wrapper).
//   2. Wrap in <s-icon size="..."> with inline font-size for pre-hydrate sizing.
// On client load, <s-icon> upgrades, preact-custom-element captures children
// as VNodes, Icon wraps them in its own <span>. Net DOM: <s-icon><span><svg></span></s-icon>.
const SSR_SIZE = "2rem";
const ssrIconHtml = `<s-icon size="${SSR_SIZE}" style="font-size: ${SSR_SIZE}">${renderToString(
  <Icons.Check />,
)}</s-icon>`;

export function App() {
  const ssrRef = useRef<HTMLDivElement>(null);
  const [liveDom, setLiveDom] = useState<string>("");

  useEffect(() => {
    if (!ssrRef.current) return;
    // Capture the DOM after preact-custom-element has had a chance to upgrade.
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
          Wrapped:{" "}
          <code class="font-mono text-sm bg-neutral-200 px-2 py-0.5 rounded">
            &lt;Icon size="2rem"&gt;&lt;Check /&gt;&lt;/Icon&gt;
          </code>
        </h2>
        <div class="flex items-center gap-6">
          <Icon size="1rem">
            <Icons.Check />
          </Icon>
          <Icon size="1.5rem">
            <Icons.Check />
          </Icon>
          <Icon size="2rem">
            <Icons.Check />
          </Icon>
          <Icon size="3rem">
            <Icons.Check />
          </Icon>
        </div>
      </section>

      <section>
        <h2 class="text-lg font-medium mb-4">SSR + Hydrate test</h2>
        <p class="text-sm text-neutral-600 mb-3">
          The HTML below is the kind the build pipeline will emit: raw SSR'd
          markup with the custom-element tag wrapping the rendered children.
          When the <code class="font-mono text-xs">&lt;s-icon&gt;</code> custom
          element upgrades, preact-custom-element captures the existing
          children as VNodes and Icon wraps them in its own{" "}
          <code class="font-mono text-xs">&lt;span&gt;</code>.
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
