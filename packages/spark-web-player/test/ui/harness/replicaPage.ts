import { replicate } from "../../../src/app/utils/replicate";
import { replicaCss } from "../../../src/app/utils/replicaStyles";

const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const PAGE = `
<style>
@keyframes turn { to { transform: rotate(1turn); } }
#frame { position: relative; margin-left: 3.3px; margin-top: 5.7px; width: 600px; height: 300px; container-type: size; }
#stage { position: absolute; left: 13.3px; top: 7.6px; width: 400px; height: 200px; }
.row { display: flex; width: 400px; height: 60px; }
.gone { flex: none; width: 100px; height: 50px; overflow: auto; animation: turn 10s linear infinite; transition: opacity 5s linear; opacity: 1; }
.gone.faded { opacity: 0.2; }
.inner { height: 200px; animation: turn 10s linear infinite; }
.sibling { flex: 1; height: 50px; animation: turn 10s linear infinite; transition: opacity 5s linear; }
.row:has(> .gone) .sibling { opacity: 0.5; }
.row > .sibling:first-child { height: 30px; }
.text { width: 120px; font: 16px/20px sans-serif; }
.below { height: 10px; }
</style>
<div id="frame"><div id="stage">
  <div class="row"><div class="gone"><div class="inner"></div><input class="field"><video class="clip" preload="none" muted></video></div><div class="sibling"></div></div>
  <div class="text">short</div>
  <div class="below"></div>
</div></div>`;

async function measure(scoped: boolean) {
  document.body.innerHTML = PAGE;
  const scope = document.getElementById("frame") as HTMLElement;
  const stage = document.getElementById("stage") as HTMLElement;
  const gone = stage.querySelector(".gone") as HTMLElement;
  const sibling = stage.querySelector(".sibling") as HTMLElement;
  const field = stage.querySelector(".field") as HTMLInputElement;
  const clip = stage.querySelector(".clip") as HTMLVideoElement;
  const media: string[] = [];
  for (const type of ["emptied", "abort", "loadstart", "suspend", "pause"]) clip.addEventListener(type, () => media.push(type));
  await frame();
  gone.classList.add("faded");
  void gone.offsetWidth;
  field.focus();
  gone.scrollTop = 30;
  await frame();
  const animationsOf = () => [...gone.getAnimations({ subtree: true }), ...sibling.getAnimations()];
  const before = animationsOf();
  const times = before.map((animation) => Number(animation.currentTime));
  const scroll = gone.scrollTop;
  const style = stage.outerHTML;
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((list) => records.push(...list));
  observer.observe(stage, { subtree: true, childList: true, attributes: true, characterData: true });
  const replica = replicate(stage, scoped ? { carried: [], scope: { element: scope, attribute: "data-probe-replica" } } : { carried: [] });
  const originals = [stage, ...Array.from(stage.querySelectorAll<HTMLElement>("*"))];
  const still = (el: Element) => {
    for (let at: Element | null = el; at; at = at.parentElement) if (at.getAnimations().length > 0) return false;
    return true;
  };
  const mismatch = Math.max(
    ...originals.flatMap((original) => {
      const twin = replica.of(original)!;
      const a = original.getBoundingClientRect();
      const b = twin.getBoundingClientRect();
      const boxes = [
        original.offsetLeft - twin.offsetLeft,
        original.offsetTop - twin.offsetTop,
        original.offsetWidth - twin.offsetWidth,
        original.offsetHeight - twin.offsetHeight,
        original.scrollTop - twin.scrollTop,
      ];
      const placed = still(original) ? [a.left - b.left, a.top - b.top, a.width - b.width, a.height - b.height] : [];
      return [...boxes, ...placed].map(Math.abs);
    }),
  );
  const twinSibling = replica.of(sibling)!;
  const twinBelow = replica.of(stage.querySelector(".below")!)!;
  const belowBefore = twinBelow.offsetTop;
  replica.of(gone)!.remove();
  replica.of(stage.querySelector(".text")!)!.textContent = "a much longer line of text that wraps onto several lines";
  const unsettled = Number(getComputedStyle(twinSibling).opacity);
  for (const animation of replica.root.getAnimations({ subtree: true })) animation.cancel();
  const measured = {
    width: twinSibling.offsetWidth,
    height: twinSibling.offsetHeight,
    unsettled,
    opacity: Number(getComputedStyle(twinSibling).opacity),
    reflowed: twinBelow.offsetTop - belowBefore,
    twinMedia: [replica.of(clip)!.getAttribute("src"), (replica.of(clip) as HTMLVideoElement).networkState],
  };
  const realWidth = sibling.offsetWidth;
  replica.dispose();
  records.push(...observer.takeRecords());
  observer.disconnect();
  await frame();
  const after = animationsOf();
  return {
    mismatch,
    ...measured,
    realWidth,
    animations: before.length,
    kept: before.filter((animation) => after.includes(animation) && animation.playState === "running").length,
    restarted: after.filter((animation, index) => !before.includes(animation) || Number(animation.currentTime) < times[index]!).length,
    transitions: before.filter((animation) => animation.constructor.name === "CSSTransition").length,
    focused: document.activeElement === field,
    scroll: [scroll, gone.scrollTop],
    media,
    mutations: records.length,
    unchanged: stage.outerHTML === style,
    left: stage.nextElementSibling === null && scope.nextElementSibling === null,
  };
}

function rewrite() {
  const css = [
    "spark-web-player #game .card, .badge:is(.a, .b) { width: 10px; }",
    "spark-web-player #game { --reach: 2; }",
    "@media (min-width: 1px) { .plate > .image { height: 5px; } }",
    "@keyframes pulse { from { scale: 1; } to { scale: 2; } }",
    '@property --size { syntax: "<length>"; inherits: false; initial-value: 0px; }',
    "@font-face { font-family: probe; src: local(Arial); }",
  ].join("\n");
  return replicaCss(css, document, { scope: "spark-web-player #game", replica: "spark-web-player [data-probe]", keyframes: "probe-" });
}

(window as unknown as { replicaProbe: unknown }).replicaProbe = { measure, rewrite };
