import { describe, expect, it } from "vitest";
import AudioSession, {
  type SessionAudio,
} from "../../src/modules/spark-editor/workspace/AudioSession";

class FakeAudio extends EventTarget implements SessionAudio {
  src = "";
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  loop = false;
  refuse: Error | null = null;
  readonly log: string[] = [];
  protected starting: object | null = null;

  async play() {
    this.log.push(`play ${this.src} at ${this.currentTime}`);
    const start = {};
    this.starting = start;
    await Promise.resolve();
    if (this.refuse) {
      throw this.refuse;
    }
    if (this.starting !== start) {
      throw new DOMException("paused", "AbortError");
    }
    this.paused = false;
    this.emit("playing");
  }

  pause() {
    this.log.push(`pause ${this.src}`);
    this.starting = null;
    if (!this.paused) {
      this.paused = true;
      this.emit("pause");
    }
  }

  removeAttribute(name: string) {
    if (name === "src") {
      this.src = "";
    }
  }

  load() {
    this.emit("emptied");
  }

  emit(type: string) {
    this.dispatchEvent(new Event(type));
  }

  progress(seconds: number) {
    this.currentTime = seconds;
    this.emit("timeupdate");
  }

  meta(seconds: number) {
    this.duration = seconds;
    this.emit("loadedmetadata");
  }
}

const setup = (maxBytes = 1000) => {
  const audio = new FakeAudio();
  let made = 0;
  const session = new AudioSession({
    audio: () => {
      made += 1;
      return audio;
    },
    maxBytes,
  });
  return { session, audio, made: () => made };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const door = { owner: "Audio/door.mp3", src: "blob:door", size: 10 };
const rain = { owner: "Audio/rain.ogg", src: "blob:rain", size: 10 };

describe("the editor's audio session", () => {
  it("makes no audio element until something plays", () => {
    const { session, made } = setup();
    expect(session.playback.value).toBeNull();
    session.stop();
    expect(made()).toBe(0);
  });

  it("plays one sound at a time: starting another stops the first and starts from its beginning", async () => {
    const { session, audio } = setup();
    session.toggle(door);
    expect(session.playback.value).toMatchObject({ owner: door.owner, status: "loading" });
    await flush();
    expect(session.playback.value).toMatchObject({ owner: door.owner, status: "playing" });
    audio.progress(3);
    session.toggle(rain);
    await flush();
    expect(session.playback.value).toMatchObject({ owner: rain.owner, status: "playing" });
    expect(audio.log).toEqual(["play blob:door at 0", "pause blob:door", "play blob:rain at 0"]);
  });

  it("pauses the sound playing when its own button is pressed again, holding its place, and the next press resumes there", async () => {
    const { session, audio } = setup();
    session.toggle(door);
    await flush();
    audio.meta(90);
    audio.progress(12.5);
    expect(session.time.value).toBe(12.5);
    expect(session.playback.value?.duration).toBe(90);
    session.toggle(door);
    expect(session.playback.value).toMatchObject({ owner: door.owner, status: "paused", duration: 90 });
    expect(session.time.value).toBe(12.5);
    expect(audio.src).toBe("blob:door");
    session.toggle(door);
    expect(session.playback.value?.status).toBe("loading");
    await flush();
    expect(session.playback.value?.status).toBe("playing");
    expect(audio.log).toEqual(["play blob:door at 0", "pause blob:door", "play blob:door at 12.5"]);
  });

  it("pauses through its own command only the sound it is asked about, and a pause before the sound starts holds", async () => {
    const { session, audio } = setup();
    session.pause(door);
    expect(session.playback.value).toBeNull();
    session.play(door);
    session.pause(rain);
    expect(session.playback.value?.status).toBe("loading");
    session.pause(door);
    expect(session.playback.value?.status).toBe("paused");
    await flush();
    expect(session.playback.value?.status).toBe("paused");
    expect(audio.paused).toBe(true);
  });

  it("keeps a paused sound paused while it is scrubbed, and plays from the new place", async () => {
    const { session, audio } = setup();
    session.toggle(door);
    await flush();
    audio.meta(60);
    audio.progress(10);
    session.toggle(door);
    session.seek(door, 45);
    expect(session.playback.value?.status).toBe("paused");
    expect(session.time.value).toBe(45);
    session.seek(door, 5);
    expect(session.playback.value?.status).toBe("paused");
    expect(audio.log.filter((line) => line.startsWith("play"))).toEqual(["play blob:door at 0"]);
    session.toggle(door);
    await flush();
    expect(audio.log.at(-1)).toBe("play blob:door at 5");
  });

  it("restarts at the start: a playing sound goes on playing, a paused or cued one stays put there", async () => {
    const { session, audio } = setup();
    session.toggle(door);
    await flush();
    audio.meta(60);
    audio.progress(20);
    session.restart(door);
    expect(audio.currentTime).toBe(0);
    expect(session.time.value).toBe(0);
    expect(session.playback.value?.status).toBe("playing");
    audio.progress(8);
    session.toggle(door);
    session.restart(door);
    expect(session.playback.value?.status).toBe("paused");
    expect(session.time.value).toBe(0);
    session.restart(rain);
    expect(session.playback.value).toMatchObject({ owner: rain.owner, status: "ready" });
    expect(session.time.value).toBe(0);
    expect(audio.log.filter((line) => line.startsWith("play"))).toEqual(["play blob:door at 0"]);
  });

  it("loops a sound by its own default until told otherwise, on the element as it plays", async () => {
    const { session, audio } = setup();
    const theme = { owner: "Music/theme.ogg", src: "blob:theme", size: 10, loop: true };
    expect(session.loops(theme)).toBe(true);
    expect(session.loops(door)).toBe(false);
    session.toggle(theme);
    expect(audio.loop).toBe(true);
    await flush();
    session.setLoop(theme, false);
    expect(session.loops(theme)).toBe(false);
    expect(audio.loop).toBe(false);
    session.setLoop(door, true);
    expect(audio.loop).toBe(false);
    session.toggle(door);
    expect(audio.loop).toBe(true);
    session.toggle(theme);
    expect(audio.loop).toBe(false);
    expect(session.loops({ ...theme, owner: "Music/other.ogg" })).toBe(true);
  });

  it("goes on playing past the end with Loop on, and lets go at the end with it off", async () => {
    const { session, audio } = setup();
    const theme = { owner: "Music/theme.ogg", src: "blob:theme", size: 10, loop: true };
    session.toggle(theme);
    await flush();
    audio.meta(30);
    audio.progress(29.9);
    audio.progress(0.1);
    expect(session.playback.value?.status).toBe("playing");
    expect(session.time.value).toBe(0.1);
    session.setLoop(theme, false);
    audio.progress(30);
    audio.paused = true;
    audio.emit("pause");
    audio.emit("ended");
    expect(session.playback.value).toBeNull();
    expect(session.time.value).toBe(0);
  });

  it("seeks a playing sound, and cues a sound that is not playing at that place without playing it", async () => {
    const { session, audio } = setup();
    session.seek(door, 30);
    expect(session.playback.value).toMatchObject({ owner: door.owner, status: "ready" });
    expect(audio.src).toBe("blob:door");
    audio.meta(60);
    expect(audio.currentTime).toBe(30);
    expect(session.time.value).toBe(30);
    session.seek(door, 75);
    expect(audio.currentTime).toBe(60);
    session.seek(door, -4);
    expect(audio.currentTime).toBe(0);
    expect(audio.log.filter((line) => line.startsWith("play"))).toEqual([]);
    session.seek(door, 20);
    session.toggle(door);
    await flush();
    expect(audio.log.at(-1)).toBe("play blob:door at 20");
    session.seek(door, 40);
    expect(session.playback.value?.status).toBe("playing");
    expect(audio.currentTime).toBe(40);
  });

  it("lets go when a sound ends, and holds its place when something else pauses it", async () => {
    const { session, audio } = setup();
    session.toggle(door);
    await flush();
    audio.progress(4);
    audio.paused = true;
    audio.emit("ended");
    expect(session.playback.value).toBeNull();
    session.toggle(rain);
    await flush();
    audio.progress(3);
    audio.pause();
    expect(session.playback.value).toMatchObject({ owner: rain.owner, status: "paused" });
    expect(session.time.value).toBe(3);
  });

  it("marks a paused file that then fails as failed, and the next press tries again from the start", async () => {
    const { session, audio } = setup();
    session.toggle(door);
    await flush();
    audio.progress(6);
    session.toggle(door);
    audio.emit("error");
    expect(session.playback.value).toMatchObject({ status: "failed", failure: "unreadable" });
    session.toggle(door);
    expect(session.playback.value?.status).toBe("loading");
    expect(audio.log.at(-1)).toBe("play blob:door at 0");
  });

  it("keeps a paused sound paused when the browser refuses to resume it", async () => {
    const { session, audio } = setup();
    session.toggle(door);
    await flush();
    audio.progress(7);
    session.toggle(door);
    audio.refuse = new DOMException("gesture", "NotAllowedError");
    session.toggle(door);
    await flush();
    expect(session.playback.value?.status).toBe("paused");
    expect(session.time.value).toBe(7);
  });

  it("stops and lets go of its file, ignoring the events that follow", async () => {
    const { session, audio } = setup();
    session.toggle(door);
    await flush();
    session.stop();
    expect(session.playback.value).toBeNull();
    expect(audio.src).toBe("");
    audio.emit("error");
    audio.emit("playing");
    expect(session.playback.value).toBeNull();
  });

  it("stops only the sound it is asked about", async () => {
    const { session } = setup();
    session.toggle(door);
    await flush();
    session.stopUnless((owner) => owner === door.owner);
    expect(session.playback.value?.owner).toBe(door.owner);
    session.stopUnless((owner) => owner === rain.owner);
    expect(session.playback.value).toBeNull();
  });

  it("marks a file the browser cannot read as failed, and the next press tries again", async () => {
    const { session, audio } = setup();
    session.toggle(door);
    audio.emit("error");
    expect(session.playback.value).toMatchObject({ owner: door.owner, status: "failed", failure: "unreadable" });
    session.toggle(door);
    expect(session.playback.value?.status).toBe("loading");
  });

  it("marks a refused play as unreadable only when the browser says it cannot play the type", async () => {
    const { session, audio } = setup();
    audio.refuse = new DOMException("no", "NotSupportedError");
    session.toggle(door);
    await flush();
    expect(session.playback.value).toMatchObject({ status: "failed", failure: "unreadable" });
    audio.refuse = new DOMException("gesture", "NotAllowedError");
    session.toggle(rain);
    await flush();
    expect(session.playback.value).toMatchObject({ owner: rain.owner, status: "ready" });
  });

  it("refuses a file larger than its limit without loading it", () => {
    const { session, audio } = setup(100);
    session.toggle({ ...door, size: 101 });
    expect(session.playback.value).toMatchObject({ owner: door.owner, status: "failed", failure: "too_large" });
    expect(audio.log).toEqual([]);
  });

  it("names a sound's failure only from its own playback or its size, never another sound's", async () => {
    const { session, audio } = setup(100);
    expect(session.failureOf(door)).toBeNull();
    expect(session.failureOf({ ...door, size: 101 })).toBe("too_large");
    expect(session.failureOf({ ...door, size: undefined })).toBeNull();
    session.toggle(door);
    audio.emit("error");
    expect(session.failureOf(door)).toBe("unreadable");
    expect(session.failureOf(rain)).toBeNull();
    expect(session.failureOf({ ...door, src: "blob:door-replaced" })).toBeNull();
    session.toggle(door);
    expect(session.failureOf(door)).toBeNull();
  });
});
