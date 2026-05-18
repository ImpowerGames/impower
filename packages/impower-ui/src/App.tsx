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

export function App() {
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

      <section>
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
        <p class="mt-8 text-xs text-neutral-500">
          Custom-element form (accepts slotted SVG):{" "}
          <code class="font-mono bg-neutral-200 px-1 py-0.5 rounded">
            &lt;s-icon&gt;&lt;svg.../&gt;&lt;/s-icon&gt;
          </code>
        </p>
      </section>
    </div>
  );
}
