import { describe, expect, it } from "vitest";
import AudioSession, { type SessionAudio } from "../../src/modules/spark-editor/workspace/AudioSession";
import WorkspaceAudition from "../../src/modules/spark-editor/workspace/WorkspaceAudition";

const setup = () => {
  const log: string[] = [];
  const audio = Object.assign(new EventTarget(), {
    src: "",
    currentTime: 0,
    duration: Number.NaN,
    paused: true,
    play: async () => {
      log.push(`play ${audio.src}`);
    },
    pause: () => {
      log.push(`pause at ${audio.currentTime}`);
    },
    load: () => {
      audio.currentTime = 0;
    },
    removeAttribute: () => {
      audio.src = "";
    },
  }) satisfies SessionAudio;
  const session = new AudioSession({ audio: () => audio, maxBytes: Number.POSITIVE_INFINITY });
  const audition = new WorkspaceAudition({
    preview: async (filename, shown) => {
      log.push(shown ? `show ${filename} ${shown.construct} ${shown.name}` : `revert ${filename}`);
    },
    session,
  });
  return { audition, audio, log, session };
};

describe("the audition controller", () => {
  it("shows a picture on the stage and reverts it through the same call", async () => {
    const { audition, log } = setup();
    audition.show({ kind: "picture", filename: "main.sd", construct: "backdrop", name: "beach" });
    audition.show({ kind: "picture", filename: "main.sd", construct: "backdrop", name: "beach@night" });
    audition.revert();
    audition.revert();
    expect(log).toEqual([
      "show main.sd backdrop beach",
      "show main.sd backdrop beach@night",
      "revert main.sd",
    ]);
  });

  it("stops a sound when another starts and when it is reverted, and plays each from its start", async () => {
    const { audition, audio, log } = setup();
    audition.show({ kind: "sound", src: "blob:door" });
    audio.currentTime = 1.5;
    audition.show({ kind: "sound", src: "blob:click" });
    expect(audio.currentTime).toBe(0);
    audio.currentTime = 0.25;
    audition.revert();
    expect(log).toEqual(["play blob:door", "pause at 1.5", "play blob:click", "pause at 0.25"]);
    expect(audio.currentTime).toBe(0);
  });

  it("reverts a picture when a sound starts, and stops a sound when a picture is shown", async () => {
    const { audition, log } = setup();
    audition.show({ kind: "picture", filename: "main.sd", construct: "portrait", name: "imani:happy" });
    audition.show({ kind: "sound", src: "blob:door" });
    audition.show({ kind: "picture", filename: "main.sd", construct: "backdrop", name: "beach" });
    expect(log).toEqual([
      "show main.sd portrait imani:happy",
      "revert main.sd",
      "play blob:door",
      "pause at 0",
      "show main.sd backdrop beach",
    ]);
  });

  it("leaves a committed picture for the insert to end, and stops a committed sound", async () => {
    const { audition, log } = setup();
    audition.show({ kind: "picture", filename: "main.sd", construct: "backdrop", name: "beach" });
    audition.commit();
    audition.revert();
    audition.show({ kind: "sound", src: "blob:door" });
    audition.commit();
    audition.revert();
    expect(log).toEqual(["show main.sd backdrop beach", "play blob:door", "pause at 0"]);
  });

  it("shares the editor's one audio session: a sound played elsewhere stops the audition's, and the audition's stops it", async () => {
    const { audition, session, log } = setup();
    audition.show({ kind: "sound", src: "blob:door" });
    session.play({ owner: "Audio/rain.ogg", src: "blob:rain" });
    expect(session.playback.value?.owner).toBe("Audio/rain.ogg");
    audition.revert();
    expect(session.playback.value?.owner).toBe("Audio/rain.ogg");
    audition.show({ kind: "sound", src: "blob:click" });
    expect(session.playback.value).toMatchObject({ owner: "audition", src: "blob:click" });
    expect(log).toEqual(["play blob:door", "pause at 0", "play blob:rain", "pause at 0", "play blob:click"]);
  });

  it("reports what it is auditioning", () => {
    const { audition } = setup();
    expect(audition.current.value).toBeNull();
    const target = { kind: "sound", src: "blob:door" } as const;
    audition.show(target);
    expect(audition.current.value).toEqual(target);
    audition.revert();
    expect(audition.current.value).toBeNull();
  });
});
