import {
  Game,
  Phrase,
  Sound,
  Synth,
  Tone,
  convertPitchNoteToHertz,
  transpose,
} from "../../../../../game";
import { DisplayCommandData } from "../DisplayCommandData";
import { DisplayContentItem } from "../DisplayCommandParams";

// Helpers

const getSound = (asset: unknown, game: Game): Required<Sound> | null => {
  if (!asset) {
    return null;
  }
  if (typeof asset !== "object") {
    return null;
  }
  const sound: Required<Sound> = {
    id: "",
    src: "",
    cues: [],
    volume: 1,
    loop: false,
  };
  if ("src" in asset && typeof asset.src === "string") {
    sound.id = asset.src;
    sound.src = asset.src;
  }
  if ("shape" in asset && typeof asset.shape === "string") {
    sound.id = game.uuid.generate();
    sound.src = game.sound.synthesize([{ synth: asset as Synth }]);
  }
  if ("cues" in asset && Array.isArray(asset.cues)) {
    sound.cues = asset.cues;
  }
  if ("volume" in asset && typeof asset.volume === "number") {
    sound.volume = asset.volume;
  }
  if ("loop" in asset && typeof asset.loop === "boolean") {
    sound.loop = asset.loop;
  }
  if (sound.src) {
    return sound;
  }
  return null;
};

const getAssetSounds = (compiled: unknown, game: Game): Required<Sound>[] => {
  if (!compiled) {
    return [];
  }
  if (typeof compiled !== "object") {
    return [];
  }
  if (Array.isArray(compiled)) {
    const sounds: Required<Sound>[] = [];
    compiled.forEach((asset) => {
      const sound = getSound(asset, game);
      if (sound) {
        sounds.push(sound);
      }
    });
    return sounds;
  }
  if ("assets" in compiled && Array.isArray(compiled.assets)) {
    const sounds: Required<Sound>[] = [];
    compiled.assets.forEach((asset) => {
      const sound = getSound(asset, game);
      if (sound) {
        if ("cues" in compiled && Array.isArray(compiled.cues)) {
          sound.cues = sound.cues?.length ? sound.cues : compiled.cues;
        }
        if ("volume" in compiled && typeof compiled.volume === "number") {
          sound.volume = sound.volume * compiled.volume;
        }
        if ("loop" in compiled && typeof compiled.loop === "boolean") {
          sound.loop = compiled.loop;
        }
        sounds.push(sound);
      }
    });
    return sounds;
  }
  if ("src" in compiled) {
    const sound = getSound(compiled, game);
    if (sound) {
      return [sound];
    }
  }
  if ("shape" in compiled) {
    const sound = getSound(compiled, game);
    if (sound) {
      return [sound];
    }
  }
  return [];
};

export const executeDisplayCommand = (
  game: Game,
  data: DisplayCommandData,
  options?: { instant?: boolean; preview?: boolean },
  onFinished?: () => void,
  onClickButton?: (content: DisplayContentItem) => void
): { onTick?: (deltaMS: number) => void; displayed?: DisplayContentItem[] } => {
  const id = data.id;
  const type = data.params.type;
  const characterKey = data?.params?.characterKey || "";
  const content = data?.params?.content;
  const autoAdvance = data?.params?.autoAdvance;

  const uiName = "display";

  const context = game.context;

  let targetsCharacterName = false;
  const displayed: Phrase[] = [];
  content.forEach((c) => {
    // Override first instance of character_name with character's display name
    if (!targetsCharacterName && c.target === "character_name") {
      targetsCharacterName = true;
      c.text = context?.["character"]?.[characterKey]?.name || c.text;
    }
    // Only display content without prerequisites or that have truthy prerequisites
    if (!c.prerequisite || Boolean(game.logic.evaluate(c.prerequisite))) {
      const r: Phrase = {
        ...c,
      };
      if (r.text) {
        // Substitute any {variables} in text
        r.text = game.logic.format(r.text);
      }
      if (!r.target) {
        r.target = type;
      }
      displayed.push(r);
    }
  });

  if (displayed.length === 0) {
    // No content to display
    return {};
  }

  // Stop stale sounds
  game.sound.stopChannel("writer");
  game.sound.stopChannel("voice");

  // Clear stale text
  game.ui.text.getTargets(uiName).forEach((target) => {
    const textLayer = context?.["text_layer"]?.[target];
    if (!textLayer?.preserve) {
      game.ui.style.update(uiName, target, { display: "none" });
      game.ui.text.clear(uiName, target);
    }
  });

  // Clear stale images
  game.ui.image.getTargets(uiName).forEach((target) => {
    const imageLayer = context?.["image_layer"]?.[target];
    if (!imageLayer?.preserve) {
      game.ui.style.update(uiName, target, { display: "none" });
      game.ui.image.clear(uiName, target);
    }
  });

  const instant = options?.instant;
  const previewing = options?.preview;
  const debugging = game.debug.state.debugging;

  const sequence = game.writer.write(displayed, {
    character: characterKey,
    instant,
    debug: debugging,
  });

  const soundsToLoad: Sound[] = [];
  const soundEvents: (() => void)[] = [];

  Object.entries(sequence.audio).forEach(([k, events]) => {
    const target = k || "voice";
    events.forEach((e) => {
      const assetNames = e.audio;
      const sounds: Required<Sound>[] = [];
      const channelLoop = target === "music";
      const scheduled = e.params?.schedule;
      const trackLoop = e.params?.loop;
      const trackNoloop = e.params?.noloop;
      const trackVolume = e.params?.volume ?? 1;
      const trackMuteMultiplier = e.params?.mute ? 0 : 1;
      const after = (e.enter ?? 0) + (e.params?.after ?? 0);
      const over = e.params?.over;
      assetNames.forEach((assetName) => {
        if (assetName) {
          const value =
            context?.["audio"]?.[assetName] ||
            context?.["audio_group"]?.[assetName] ||
            context?.["array"]?.[assetName];
          const assetSounds = getAssetSounds(value, game);
          assetSounds.forEach((asset) => {
            const sound = {
              id: asset.id,
              src: asset.src,
              volume: asset.volume * trackVolume * trackMuteMultiplier,
              loop: !trackNoloop && (trackLoop || asset.loop || channelLoop),
              cues: asset.cues,
            };
            soundsToLoad.push(sound);
            sounds.push(sound);
          });
        }
      });
      if (sounds.length > 0) {
        const groupId = assetNames.join("+");
        if (
          e.params?.start ||
          (!e.params?.start &&
            !e.params?.stop &&
            !e.params?.mute &&
            !e.params?.unmute &&
            !e.params?.volume)
        ) {
          soundEvents.push(() =>
            game.sound.startAll(sounds, target, groupId, after, over)
          );
        } else if (e.params?.stop) {
          soundEvents.push(() =>
            game.sound.stopAll(sounds, target, groupId, after, over, scheduled)
          );
        } else {
          soundEvents.push(() =>
            game.sound.fadeAll(sounds, target, groupId, after, over, scheduled)
          );
        }
      }
    });
  });

  // Display indicator
  const indicatorStyle: Record<string, string | null> = {};
  if (data && !autoAdvance) {
    indicatorStyle["transition"] = "none";
    indicatorStyle["opacity"] = instant ? "1" : "0";
    indicatorStyle["animation-play-state"] = "paused";
    indicatorStyle["display"] = null;
  } else {
    indicatorStyle["display"] = "none";
  }
  game.ui.style.update(uiName, "indicator", indicatorStyle);

  // Display buttons
  Object.entries(sequence.button).forEach(([k, events]) => {
    const target = k || "choice";
    events.forEach((e) => {
      const instanceName = game.ui.instance.get(uiName, target, e.instance);
      if (instanceName) {
        const handleClick = (event?: {
          stopPropagation?: () => void;
        }): void => {
          event?.stopPropagation?.();
          onClickButton?.(e);
          game.ui.style.update(uiName, target, { display: "none" });
          game.ui.text.clear(uiName, target);
          game.ui.setOnClick(uiName, target, null);
        };
        game.ui.setOnClick(uiName, instanceName, handleClick);
      }
    });
  });

  // Display new text
  const textTransitions: (() => void)[] = [];
  Object.entries(sequence.text).forEach(([target, events]) => {
    const transition = game.ui.text.write(uiName, target, events, instant);
    textTransitions.push(transition);
    game.ui.style.update(uiName, target, { display: null });
  });

  // Display new images
  const imageTransitions: (() => void)[] = [];
  Object.entries(sequence.image).forEach(([target, imageEvents]) => {
    const transition = game.ui.image.write(
      uiName,
      target,
      imageEvents,
      instant
    );
    imageTransitions.push(transition);
    game.ui.style.update(uiName, target, { display: null });
  });

  game.ui.showUI(uiName);

  const doTransitions = () => {
    textTransitions.forEach((transition) => {
      transition();
    });
    imageTransitions.forEach((transition) => {
      transition();
    });
  };

  const handleFinished = (): void => {
    doTransitions();
    const indicatorStyle: Record<string, string | null> = {};
    indicatorStyle["transition"] = null;
    indicatorStyle["opacity"] = "1";
    indicatorStyle["animation-play-state"] = previewing ? "paused" : "running";
    game.ui.style.update(uiName, "indicator", indicatorStyle);
    onFinished?.();
  };

  let started = false;

  if (game) {
    if (instant) {
      handleFinished();
    } else {
      const tones: Tone[] = [];
      Object.entries(sequence.synth).forEach(([_, events]) => {
        events.forEach((e) => {
          e.synth.forEach((s) => {
            const beep: Tone = {
              synth: context?.["synth"]?.[s],
              time: e.enter ?? 0,
              duration: e.params?.duration ?? 0,
            };
            const freq = convertPitchNoteToHertz(
              beep.synth?.pitch?.frequency || "A4"
            );
            // Transpose waves according to stress contour
            beep.pitchHertz = transpose(freq, e.params?.pitch ?? 0);
            tones.push(beep);
          });
        });
      });
      // Load and modulate ((sounds))
      game.sound.loadAll(soundsToLoad).then(() => {
        soundEvents.forEach((event) => {
          event?.();
        });
      });
      // Start writer typing tones
      if (tones.length > 0) {
        game.sound.start(
          { id, src: game.sound.synthesize(tones) },
          "writer",
          0,
          0,
          () => {
            started = true;
          }
        );
      } else {
        started = true;
      }
    }
  }
  if (data) {
    if (!game || instant) {
      const indicatorStyle: Record<string, string | null> = {};
      indicatorStyle["transition"] = "none";
      indicatorStyle["opacity"] = "1";
      game.ui.style.update(uiName, "indicator", indicatorStyle);
    }
  }
  let elapsedMS = 0;
  let finished = false;
  const totalDurationMS = (sequence.end ?? 0) * 1000;
  const handleTick = (deltaMS: number): void => {
    if (started && !finished) {
      if (elapsedMS === 0) {
        doTransitions();
      }
      elapsedMS += deltaMS;
      if (elapsedMS >= totalDurationMS) {
        finished = true;
        handleFinished();
      }
    }
  };
  return { onTick: handleTick, displayed };
};
