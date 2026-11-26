import { afterEach, describe, expect, test } from "vitest";
import { LayoutMotionMessage } from "../../../../spark-engine/src/game/modules/ui/classes/messages/LayoutMotionMessage";
import { AudioClock } from "../../app/AudioClock";
import UIManager from "../../app/managers/UIManager";
import { flushMicrotasks } from "./domTestHarness";

const makePage = () => {
  const overlay = document.createElement("div");
  overlay.innerHTML = `<div class="action"></div>`;
  document.body.appendChild(overlay);
  const box = overlay.querySelector(".action") as any;
  box.__sdId = "e-action";
  const app: any = {
    overlay,
    audioClock: new AudioClock(0, () => 0),
    emit: () => {},
  };
  const ui = new UIManager(app);
  let end!: () => void;
  const motion = {
    moving: [] as HTMLElement[],
    finishedCalls: 0,
    settled: 0,
  };
  (ui as any)._layoutMotion = {
    moving: () => motion.moving,
    finished: () => {
      motion.finishedCalls += 1;
      return new Promise<void>((resolve) => {
        end = resolve;
      });
    },
    settle: () => {
      motion.settled += 1;
    },
    measure: () => undefined,
    play: () => {},
  };
  const ask = (params: { settle?: boolean } = {}) => {
    const replies: string[][] = [];
    void (ui.onReceiveRequest(LayoutMotionMessage.type.request(params)) as Promise<any>).then(
      (reply) => {
        replies.push(reply?.result);
      },
      (error) => {
        replies.push([`failed: ${error}`]);
      },
    );
    return replies;
  };
  return { box, motion, ask, end: () => end() };
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the player reports when a beat's layout moves have ended (#2739)", () => {
  test("answers once, with the elements that moved, when their moves end", async () => {
    const page = makePage();
    page.motion.moving = [page.box];
    const replies = page.ask();
    await flushMicrotasks(10);
    expect(page.motion.finishedCalls).toBe(1);
    expect(replies).toEqual([]);
    page.end();
    await flushMicrotasks(10);
    expect(replies).toEqual([["e-action"]]);
    await flushMicrotasks(10);
    expect(replies).toHaveLength(1);
  });

  test("answers at once with nothing when the beat started no move", async () => {
    const page = makePage();
    const replies = page.ask();
    await flushMicrotasks(10);
    expect(replies).toEqual([[]]);
    expect(page.motion.finishedCalls).toBe(0);
  });

  test("settles every move and answers at once when asked to settle", async () => {
    const page = makePage();
    page.motion.moving = [page.box];
    const replies = page.ask({ settle: true });
    await flushMicrotasks(10);
    expect(page.motion.settled).toBe(1);
    expect(replies).toEqual([[]]);
  });
});
