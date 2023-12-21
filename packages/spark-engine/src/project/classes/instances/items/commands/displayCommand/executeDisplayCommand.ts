import {
  Character,
  Chunk,
  IElement,
  Phrase,
  SparkGame,
  Synth,
  Tone,
  Writer,
  clone,
  convertPitchNoteToHertz,
  transpose,
} from "../../../../../../game";
import { Sound } from "../../../../../../game/sound/types/Sound";
import Matcher from "../../../../../../game/writer/classes/Matcher";
import { CommandContext } from "../../command/CommandRunner";
import { DisplayCommandData } from "./DisplayCommandData";

const hideChoices = (game: SparkGame, structName: string): void => {
  const choiceEls = game.ui.findAllUIElements(structName, "choice");
  choiceEls.forEach((el) => {
    if (el) {
      el.onclick = null;
      el.replaceChildren();
      el.style["display"] = "none";
    }
  });
};

const isSkipped = (content: string, matcher?: Matcher): boolean => {
  if (!matcher) {
    return false;
  }
  return matcher.test(content);
};

const getArgumentValue = (args: string[], name: string): number | undefined => {
  const argIndex = args.indexOf(name);
  if (argIndex < 0) {
    return undefined;
  }
  const numValue = Number(args[argIndex + 1]);
  if (Number.isNaN(numValue)) {
    return undefined;
  }
  return numValue;
};

const getSound = (asset: unknown, game: SparkGame): Required<Sound> | null => {
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

const getAssetSounds = (
  compiled: unknown,
  game: SparkGame
): Required<Sound>[] => {
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
  game: SparkGame,
  data: DisplayCommandData,
  context?: CommandContext,
  onFinished?: () => void,
  onClickChoice?: (...args: string[]) => void
): ((deltaMS: number) => void) | undefined => {
  const id = data.reference.id;
  const type = data.params.type;
  const characterKey = data?.params?.characterKey || "";
  const characterName = data?.params?.characterName || "";
  const characterParenthetical = data?.params?.characterParenthetical || "";
  const content = data?.params?.content;
  const autoAdvance = data?.params?.autoAdvance;

  const displayedContent: Phrase[] = [];
  content.forEach((c) => {
    // Only display content without prerequisites or that have truthy prerequisites
    if (!c.prerequisite || Boolean(game.logic.evaluate(c.prerequisite))) {
      const r: Phrase = {
        ...c,
      };
      if (r.text) {
        // Substitute any {variables} in text
        r.text = game.logic.format(r.text);
      }
      displayedContent.push(r);
    }
  });

  if (displayedContent.length === 0) {
    // No content to display
    return undefined;
  }

  const structName = "display";

  const valueMap = game.logic.valueMap;

  const actionWriter = valueMap?.["writer"]?.["action"];
  const dialogueWriter = valueMap?.["writer"]?.["dialogue"];
  const sceneWriter = valueMap?.["writer"]?.["scene"];
  const transitionWriter = valueMap?.["writer"]?.["transition"];
  const characterNameWriter = valueMap?.["writer"]?.["character_name"];
  const characterParentheticalWriter =
    valueMap?.["writer"]?.["character_parenthetical"];

  const writer: Writer =
    type === "action"
      ? actionWriter
      : type === "dialogue"
      ? dialogueWriter
      : type === "scene"
      ? sceneWriter
      : type === "transition"
      ? transitionWriter
      : valueMap?.["writer"]?.["default"];

  const structEl = game.ui.findFirstUIElement(structName);

  if (structEl) {
    structEl.removeState("hidden");
  }

  const character: Character | undefined = characterKey
    ? valueMap?.["character"]?.[characterKey]
    : undefined;

  const characterSynth: Synth | undefined =
    valueMap?.["synth"]?.[characterKey] ?? valueMap?.["synth"]?.["character"];

  const writerSynth: Synth | undefined =
    valueMap?.["synth"]?.[type] ?? valueMap?.["synth"]?.["writer"];

  const characterNameSkippedMatcher = new Matcher(characterNameWriter?.skipped);
  const characterParentheticalSkippedMatcher = new Matcher(
    characterParentheticalWriter?.skipped
  );

  const characterDisplayName = character?.name || characterName || "";

  const validCharacterName =
    type === "dialogue" &&
    !isSkipped(characterDisplayName, characterNameSkippedMatcher)
      ? characterDisplayName
      : "";
  const validCharacterParenthetical =
    type === "dialogue" &&
    !isSkipped(characterParenthetical, characterParentheticalSkippedMatcher)
      ? characterParenthetical || ""
      : "";

  const instant = context?.instant;
  const debug = context?.debug;

  const indicatorEl = game.ui.findFirstUIElement(structName, "indicator");
  const boxEl = game.ui.findFirstUIElement(structName, "box");

  // TODO: Instead of hardcoding whether or not a channel should replace old audio, check defined audio_channel settings
  game.sound.stopChannel("writer");
  game.sound.stopChannel("voice");

  hideChoices(game, structName);

  const changesBackdrop = content.some(
    (p) => p.image && p.target === "backdrop"
  );
  const changesText = content.some((p) => p.text);

  if (boxEl) {
    boxEl.style["display"] = changesText ? null : "none";
  }

  const characterNameEl = game.ui.findFirstUIElement(
    structName,
    "character_name"
  );
  const characterParentheticalEl = game.ui.findFirstUIElement(
    structName,
    "character_parenthetical"
  );
  const parentheticalEl = game.ui.findFirstUIElement(
    structName,
    "parenthetical"
  );

  const portraitEl = game.ui.findFirstUIElement(structName, "portrait");
  const insertEl = game.ui.findFirstUIElement(structName, "insert");
  const backdropEl = game.ui.findFirstUIElement(structName, "backdrop");

  const contentElEntries = [
    {
      key: "dialogue",
      parent: game.ui.findFirstUIElement(structName, "dialogue"),
    },
    {
      key: "action",
      parent: game.ui.findFirstUIElement(structName, "action"),
    },
    {
      key: "scene",
      parent: game.ui.findFirstUIElement(structName, "scene"),
    },
    {
      key: "transition",
      parent: game.ui.findFirstUIElement(structName, "transition"),
    },
  ];

  if (characterNameEl) {
    characterNameEl.style["display"] = validCharacterName ? null : "none";
    characterNameEl.textContent = validCharacterName;
  }
  if (characterParentheticalEl) {
    characterParentheticalEl.style["display"] = validCharacterParenthetical
      ? null
      : "none";
    characterParentheticalEl.textContent = validCharacterParenthetical;
  }
  if (parentheticalEl) {
    parentheticalEl.style["display"] = "none";
    parentheticalEl.replaceChildren();
  }

  const stalePortraits: IElement[] | undefined = portraitEl?.getChildren();
  const staleInserts: IElement[] | undefined = insertEl?.getChildren();
  let staleBackdrops: IElement[] | undefined = undefined;
  // TODO: Instead of hardcoding whether or not a layer should replace old images, check defined image_layer settings
  if (changesBackdrop) {
    staleBackdrops = backdropEl?.getChildren();
  }

  const clackSound = writerSynth;
  const beepSound = characterKey ? characterSynth : writerSynth;
  const beepEnvelope = beepSound?.envelope;
  const beepDuration = beepEnvelope
    ? (beepEnvelope.attack ?? 0) +
      (beepEnvelope.decay ?? 0) +
      (beepEnvelope.sustain ?? 0) +
      (beepEnvelope.release ?? 0)
    : 0;

  const phrases = game.writer.write(displayedContent, {
    syllableDuration: beepDuration,
    writer,
    character,
    instant,
    debug,
  });

  const soundsToLoad: Sound[] = [];
  const soundEvents: (() => void)[] = [];

  const nextIndices: Record<string, number> = {};
  const stackedElements = new Set<IElement>();

  const inElements: IElement[] = [];
  const outElements: IElement[] = [];

  contentElEntries.forEach(({ key, parent }) => {
    if (parent) {
      if (key === type) {
        // TODO: Instead of hardcoding whether or not a layer should replace old text, check defined text_layer settings
        parent.replaceChildren();
        phrases.forEach((p) => {
          if (p.image) {
            const assetNames = p.image;
            const target = p.target || "portrait";
            const targetEl = game.ui.findFirstUIElement(structName, target);
            if (targetEl) {
              const imageSrcs: string[] = [];
              assetNames.forEach((assetName) => {
                if (assetName) {
                  const value = (valueMap?.["image"]?.[assetName] ||
                    valueMap?.["image_group"]?.[assetName] ||
                    valueMap?.["array"]?.[assetName]) as
                    | { name: string; src: string }
                    | { assets: { name: string; src: string }[] };
                  const assets =
                    value && typeof value === "object" && "assets" in value
                      ? value.assets.map((a) => a)
                      : [value];
                  assets.forEach((asset) => {
                    if (asset) {
                      imageSrcs.push(asset.src);
                    }
                  });
                }
              });
              const combinedBackgroundImage = imageSrcs
                .map((src) => `url("${src}")`)
                .join(", ");
              if (imageSrcs.length > 0) {
                p.chunks?.forEach((c) => {
                  if (c.element) {
                    const element = game.ui
                      .createElement("span")
                      .init(c.element);
                    targetEl.appendChild(element);
                    inElements.push(element);
                    if (c.image) {
                      c.image.style ??= {};
                      c.image.style["backgroundImage"] =
                        combinedBackgroundImage;
                      const image = game.ui.createElement("span").init(c.image);
                      element.appendChild(image);
                      outElements.push(image);
                    }
                  }
                });
              }
            }
          }
          if (p.audio) {
            const chunkOffset = p.chunks?.[0]?.time ?? 0;
            const target = p.target || "voice";
            const assetNames = p.audio;
            const assetArgs = p.args || [];
            const sounds: Required<Sound>[] = [];
            const channelLoop = target === "music";
            const trackLoop = assetArgs.includes("loop");
            const trackNoloop = assetArgs.includes("noloop");
            const trackVolume = getArgumentValue(assetArgs, "volume") ?? 1;
            const trackMuteMultiplier = assetArgs?.includes("mute") ? 0 : 1;
            const after =
              chunkOffset + (getArgumentValue(assetArgs, "after") ?? 0);
            const over = getArgumentValue(assetArgs, "over");
            assetNames.forEach((assetName) => {
              if (assetName) {
                const value =
                  valueMap?.["audio"]?.[assetName] ||
                  valueMap?.["audio_group"]?.[assetName] ||
                  valueMap?.["array"]?.[assetName];
                const assetSounds = getAssetSounds(value, game);
                assetSounds.forEach((asset) => {
                  const sound = {
                    id: asset.id,
                    src: asset.src,
                    volume: asset.volume * trackVolume * trackMuteMultiplier,
                    loop:
                      !trackNoloop && (trackLoop || asset.loop || channelLoop),
                    cues: asset.cues,
                  };
                  soundsToLoad.push(sound);
                  sounds.push(sound);
                });
              }
            });
            if (sounds.length > 0) {
              const groupId = assetNames.join("+");
              const scheduled = assetArgs?.includes("schedule");
              const controlKeywords = [
                "start",
                "mute",
                "unmute",
                "volume",
                "stop",
              ];
              if (
                assetArgs?.includes("start") ||
                !assetArgs.some((a) => controlKeywords.includes(a))
              ) {
                soundEvents.push(() =>
                  game.sound.startAll(sounds, target, groupId, after, over)
                );
              } else if (assetArgs?.includes("stop")) {
                soundEvents.push(() =>
                  game.sound.stopAll(
                    sounds,
                    target,
                    groupId,
                    after,
                    over,
                    scheduled
                  )
                );
              } else {
                soundEvents.push(() =>
                  game.sound.fadeAll(
                    sounds,
                    target,
                    groupId,
                    after,
                    over,
                    scheduled
                  )
                );
              }
            }
          }
          if (p.text) {
            if (p.target) {
              const target = p.target;
              const index = nextIndices[target] ?? 0;
              // TODO: instead of hardcoding, check if text_layer.stack is true
              if (target === "choice") {
                const targetEls = game.ui.findAllUIElements(structName, target);
                const lastContentEl = targetEls?.at(-1);
                if (lastContentEl) {
                  const parentEl = game.ui.getParent(lastContentEl);
                  if (parentEl) {
                    for (
                      let i = 0;
                      i < Math.max(targetEls.length, index + 1);
                      i += 1
                    ) {
                      const el =
                        targetEls?.[i] ||
                        parentEl?.cloneChild(targetEls.length - 1);
                      if (el) {
                        if (index === i) {
                          el.replaceChildren();
                          p.chunks?.forEach((c) => {
                            if (c.element) {
                              const element = game.ui
                                .createElement("span")
                                .init(c.element);
                              if (c.wrapper) {
                                const wrapper = game.ui
                                  .createElement("span")
                                  .init(c.wrapper);
                                el.appendChild(wrapper);
                                inElements.push(wrapper);
                                wrapper.appendChild(element);
                                inElements.push(element);
                              } else {
                                el.appendChild(element);
                                inElements.push(element);
                              }
                            }
                          });
                          const firstChunk = p.chunks?.[0];
                          if (firstChunk) {
                            el.style["opacity"] = "0";
                            el.style["transition"] = instant
                              ? "none"
                              : `opacity 0s linear ${firstChunk.time}s`;
                          }
                          el.style["pointerEvents"] = "auto";
                          el.style["display"] = "block";
                          stackedElements.add(el);
                          if (p.target === "choice") {
                            const handleClick = (e?: {
                              stopPropagation: () => void;
                            }): void => {
                              if (e) {
                                e.stopPropagation();
                              }
                              targetEls.forEach((targetEl) => {
                                if (targetEl) {
                                  targetEl.replaceChildren();
                                  targetEl.style["pointerEvents"] = null;
                                  targetEl.style["display"] = "none";
                                }
                              });
                              onClickChoice?.(...(p.args || []));
                            };
                            el.onclick = handleClick;
                          }
                        }
                      }
                    }
                  }

                  nextIndices[target] = index + 1;
                }
              } else {
                const targetEl = game.ui.findFirstUIElement(structName, target);
                if (targetEl) {
                  targetEl.style["display"] = "block";
                  p.chunks?.forEach((c) => {
                    if (c.element) {
                      const element = game.ui
                        .createElement("span")
                        .init(c.element);
                      if (c.wrapper) {
                        const wrapper = game.ui
                          .createElement("span")
                          .init(c.wrapper);
                        targetEl.appendChild(wrapper);
                        inElements.push(wrapper);
                        wrapper.appendChild(element);
                        inElements.push(element);
                      } else {
                        targetEl.appendChild(element);
                        inElements.push(element);
                      }
                    }
                  });
                }
              }
            } else {
              p.chunks?.forEach((c) => {
                if (c.element) {
                  const element = game.ui.createElement("span").init(c.element);
                  if (c.wrapper) {
                    const wrapper = game.ui
                      .createElement("span")
                      .init(c.wrapper);
                    parent.appendChild(wrapper);
                    inElements.push(wrapper);
                    wrapper.appendChild(element);
                    inElements.push(element);
                  } else {
                    parent.appendChild(element);
                    inElements.push(element);
                  }
                }
              });
            }
          }
        });
        parent.style["display"] = null;
      } else {
        // TODO: Instead of hardcoding whether or not text layers that are mutually exclusive, check defined text_layer settings
        parent.style["display"] = "none";
      }
    }
  });
  if (indicatorEl) {
    if (data && !autoAdvance) {
      indicatorEl.style["transition"] = "none";
      indicatorEl.style["opacity"] = instant ? "1" : "0";
      indicatorEl.style["display"] = null;
      indicatorEl.style["animation-play-state"] = "paused";
    } else {
      indicatorEl.style["display"] = "none";
    }
  }

  const doTransitions = () => {
    // TODO: Instead of hardcoding whether or not a layer should replace stale elements, check defined text_layer and image_layer settings
    // To prevent flickers, wait until the last possible second to remove old images
    if (portraitEl) {
      stalePortraits?.forEach((p) => {
        portraitEl.removeChild(p);
      });
    }
    if (insertEl) {
      staleInserts?.forEach((p) => {
        insertEl.removeChild(p);
      });
    }
    if (backdropEl) {
      staleBackdrops?.forEach((p) => {
        backdropEl.removeChild(p);
      });
    }
    stackedElements.forEach((layerEl) => {
      layerEl.style["display"] = "block";
      layerEl.style["opacity"] = "1";
    });
    // Transition in new elements
    inElements.forEach((e) => {
      e.style["opacity"] = "1";
    });
    // Transition out elements that are hidden after a delay
    outElements.forEach((e) => {
      if (e.style["transition"]) {
        e.style["opacity"] = "0";
      }
    });
  };

  const handleFinished = (): void => {
    doTransitions();
    if (indicatorEl) {
      indicatorEl.style["transition"] = null;
      indicatorEl.style["opacity"] = "1";
      indicatorEl.style["animation-play-state"] = context?.preview
        ? "paused"
        : "running";
    }
    onFinished?.();
  };

  let started = false;

  if (game) {
    if (instant) {
      handleFinished();
    } else {
      const tones: Tone[] = phrases.flatMap((phrase): Tone[] => {
        let lastCharacterBeep:
          | ({
              time: number;
            } & Chunk &
              Partial<Tone>)
          | undefined = undefined;
        const phraseBeeps: ({
          time: number;
        } & Chunk &
          Partial<Tone>)[] = (phrase.chunks || []).flatMap((c) => {
          if (!c.duration) {
            return [];
          }
          if (c.startOfSyllable || c.punctuated) {
            const sound = c.punctuated ? clone(clackSound) : clone(beepSound);
            lastCharacterBeep = {
              ...c,
              synth: sound,
              time: c.time || 0,
              duration: c.duration || 0,
            };
            return [lastCharacterBeep];
          }
          if (lastCharacterBeep) {
            lastCharacterBeep.duration += c.duration;
          }
          return [];
        });

        if (phraseBeeps.length === 0) {
          return [];
        }

        for (let i = phraseBeeps.length - 1; i >= 0; i -= 1) {
          const b = phraseBeeps[i];
          if (b) {
            b.duration = b.sustained ? b.duration : beepDuration / b.speed;
            if (b.synth) {
              const freq = convertPitchNoteToHertz(
                b.pitchHertz || b.synth.pitch?.frequency || "A4"
              );
              // Transpose waves according to stress contour
              b.pitchHertz = transpose(freq, b.pitch || 0);
            }
          }
        }

        return phraseBeeps as Tone[];
      });
      // Load all chunks in their default state
      inElements.forEach((e) => {
        if (e) {
          e.style["display"] = null;
        }
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
    if (indicatorEl && (!game || instant)) {
      indicatorEl.style["transition"] = "none";
      indicatorEl.style["opacity"] = "1";
    }
  }
  let elapsedMS = 0;
  let finished = false;
  const lastChunk = phrases.at(-1)?.chunks?.at(-1);
  const totalDurationMS = (lastChunk?.time ?? 0) + (lastChunk?.duration ?? 0);
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
  return handleTick;
};
