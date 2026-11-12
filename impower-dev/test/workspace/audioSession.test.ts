import { describe, expect, it } from "vitest";
import AudioSession, {
  type SessionAudio,
} from "../../src/modules/spark-editor/workspace/AudioSession";

class FakeAudio extends EventTarget implements SessionAudio {
  src = "";
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  refuse: Error | null = null;
  readonly log: string[] = [];

  async play() {
    this.log.push(`play ${this.src} at ${this.currentTime}`);
    await Promise.resolve();
    if (this.refuse) {
      throw this.refuse;
    }
    this.paused = false;
    this.emit("playing");
  }

  pause() {
    this.log.push(`pause ${this.src}`);
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

  it("stops the sound playing when its own button is pressed again, and the next press plays it from the start", async () => {
    const { session, audio } = setup();
    session.toggle(door);
    await flush();
    audio.meta(90);
    audio.progress(12.5);
    expect(session.time.value).toBe(12.5);
    expect(session.playback.value?.duration).toBe(90);
    session.toggle(door);
    expect(session.playback.value).toBeNull();
    expect(session.time.value).toBe(0);
    session.toggle(door);
    await flush();
    expect(session.playback.value?.status).toBe("playing");
    expect(audio.log.at(-1)).toBe("play blob:door at 0");
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

  it("lets go when a sound ends, and when something else pauses it", async () => {
    const { session, audio } = setup();
    session.toggle(door);
    await flush();
    audio.progress(4);
    audio.paused = true;
    audio.emit("ended");
    expect(session.playback.value).toBeNull();
    session.toggle(rain);
    await flush();
    audio.pause();
    expect(session.playback.value).toBeNull();
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
