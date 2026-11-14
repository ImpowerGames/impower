import { describe, expect, test } from "vitest";
import { createStandInAudio } from "../worker/standInAudio";

const MUSIC = {
  key: "audio.theme",
  channel: "music",
  mixer: "music",
  loop: true,
} as any;

const pageOf = (previewing: boolean) => {
  const audio = createStandInAudio();
  const app: any = { previewing, emit: () => {} };
  const manager = audio.attach(app, () => {});
  return { audio, manager };
};

const startMusic = async (manager: any) => {
  await manager.loadAudioPlayer(MUSIC);
  await manager.updateAudioPlayers({
    channel: "music",
    updates: [{ control: "start", key: "audio.theme", loop: true, now: true }],
  });
};

describe("a sound that starts while the page's players are paused (#2258)", () => {
  test("in a game's page it plays, as before: the game's pause does not hold a sound started during it", async () => {
    const { audio, manager } = pageOf(false);
    manager.onPause();
    await startMusic(manager);
    const [theme] = audio.sourcesOf("audio.theme");
    expect(theme!.startedAt).toBeTypeOf("number");
    expect(theme!.playbackRate.value).toBe(1);
    expect(theme!.sounding).toBe(true);
  });

  test("in a preview page it starts paused and resumes when the players are resumed", async () => {
    const { audio, manager } = pageOf(true);
    manager.setPlaysAudio(true);
    manager.setOutputOpen(true);
    manager.pausePlayers();
    await startMusic(manager);
    const [theme] = audio.sourcesOf("audio.theme");
    expect(theme!.playbackRate.value).toBe(0);
    manager.unpausePlayers();
    expect(theme!.playbackRate.value).toBe(1);
    expect(theme!.sounding).toBe(true);
  });

  test("in a preview page with Play audio off no player starts at all", async () => {
    const { audio, manager } = pageOf(true);
    await startMusic(manager);
    expect(audio.sources).toEqual([]);
  });

  test("in a game's page a player starts whatever the preview flag says", async () => {
    const { audio, manager } = pageOf(false);
    manager.setPlaysAudio(false);
    await startMusic(manager);
    expect(audio.sourcesOf("audio.theme")).toHaveLength(1);
  });
});
