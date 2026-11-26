import { keptScroll, outOfFlow } from "../../../src/app/utils/outOfFlow";

function detached(element: Element): () => void {
  const parent = element.parentNode!;
  const next = element.nextSibling;
  parent.removeChild(element);
  return () => {
    parent.insertBefore(element, next);
  };
}

const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const PAGE = `
<style>
@keyframes turn { to { transform: rotate(1turn); } }
#row { display: flex; width: 400px; height: 60px; }
#gone { flex: none; width: 100px; height: 50px; overflow: auto; animation: turn 10s linear infinite; transition: opacity 5s linear; opacity: 1; }
#gone.faded { opacity: 0.2; }
#inner { height: 200px; animation: turn 10s linear infinite; }
#sibling { flex: 1; height: 50px; animation: turn 10s linear infinite; transition: opacity 5s linear; }
#row:has(> #gone) #sibling { opacity: 0.5; }
</style>
<div id="row">
  <div id="gone"><div id="inner"></div><input id="field"><video id="clip" preload="none" muted></video></div>
  <div id="sibling"></div>
</div>`;

async function measure(kind: "out-of-flow" | "detached") {
  document.body.innerHTML = PAGE;
  const gone = document.getElementById("gone") as HTMLElement;
  const sibling = document.getElementById("sibling") as HTMLElement;
  const field = document.getElementById("field") as HTMLInputElement;
  const clip = document.getElementById("clip") as HTMLVideoElement;
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
  const take = kind === "out-of-flow" ? outOfFlow(gone) : detached(gone);
  const width = sibling.offsetWidth;
  take();
  void sibling.offsetWidth;
  await frame();
  const after = animationsOf();
  return {
    width,
    animations: before.length,
    kept: before.filter((animation) => after.includes(animation) && animation.playState === "running").length,
    restarted: after.filter((animation, index) => !before.includes(animation) || Number(animation.currentTime) < times[index]!).length,
    transitions: before.filter((animation) => animation.constructor.name === "CSSTransition").length,
    focused: document.activeElement === field,
    scroll: [scroll, gone.scrollTop],
    media,
    connected: gone.isConnected && gone.nextElementSibling === sibling,
    style: gone.getAttribute("style"),
  };
}

const SIBLING = `
<div id="pair" style="display:flex;width:400px">
  <div id="wide" style="flex:none;width:300px;height:50px"></div>
  <div id="panel" style="flex:1;height:50px;overflow:auto;font:16px/20px sans-serif">one two three four five six seven eight</div>
</div>`;

async function sibling(kept: boolean) {
  document.body.innerHTML = SIBLING;
  const wide = document.getElementById("wide") as HTMLElement;
  const panel = document.getElementById("panel") as HTMLElement;
  await frame();
  panel.scrollTop = panel.scrollHeight;
  const before = { scroll: panel.scrollTop, width: panel.offsetWidth };
  const scroll = kept ? keptScroll(document.body) : undefined;
  const take = outOfFlow(wide);
  const during = { scroll: panel.scrollTop, width: panel.offsetWidth };
  take();
  scroll?.();
  await frame();
  return { before, during, after: { scroll: panel.scrollTop, width: panel.offsetWidth } };
}

(window as unknown as { outOfFlowProbe: unknown }).outOfFlowProbe = { measure, sibling };
