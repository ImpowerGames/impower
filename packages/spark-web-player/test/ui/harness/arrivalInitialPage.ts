import AnimationHold from "../../../../spark-dom/src/classes/AnimationHold";
import PresencePlayer from "../../../../spark-dom/src/classes/PresencePlayer";

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

const PAGE = `
<style>
@keyframes pulse { to { scale: 1.5; } }
.bubble { opacity: 1; transition-property: opacity, translate; transition-duration: 0.38s; transition-timing-function: linear; }
.bubble[data-presence="initial"] { opacity: 0; translate: 0 12px; }
.bubble[data-presence="show"] { transition-duration: 0.2s; }
.pulse[data-presence="initial"] { animation: pulse 10s linear infinite; }
</style>
<div id="stream"></div>`;

interface Arrival {
  marked: number[];
  shown: number[];
  settled: number;
  pulsing: string[];
}

async function arrive(reserved: boolean): Promise<Arrival> {
  document.body.innerHTML = PAGE;
  const player = new PresencePlayer(new AnimationHold(), () => false);
  const stream = document.getElementById("stream")!;
  const bubble = document.createElement("div");
  bubble.className = "bubble pulse";
  bubble.textContent = "maybe";
  if (reserved) {
    bubble.style.visibility = "hidden";
  }
  stream.appendChild(bubble);
  await frame();
  await frame();
  const settled = player.change(bubble, "initial");
  bubble.setAttribute("data-presence", "initial");
  settled();
  if (reserved) {
    bubble.style.removeProperty("visibility");
  }
  const marked: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    await frame();
    marked.push(Number(getComputedStyle(bubble).opacity));
  }
  const pulsing = bubble
    .getAnimations()
    .filter((animation) => "animationName" in animation)
    .map((animation) => animation.playState);
  const played = player.play(bubble, "show");
  const shown: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    await frame();
    shown.push(Number(getComputedStyle(bubble).opacity));
  }
  await played;
  return { marked, shown, settled: Number(getComputedStyle(bubble).opacity), pulsing };
}

(window as unknown as { arrivalProbe: unknown }).arrivalProbe = { arrive };
