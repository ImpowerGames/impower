import {
  evaluate,
  format,
} from "../../../../../../../../../spark-evaluate/src";
import {
  Character,
  Chunk,
  IElement,
  SparkGame,
  SynthBuffer,
  Tone,
  Writer,
  clone,
  convertPitchNoteToHertz,
  transpose,
} from "../../../../../../../game";
import { Sound } from "../../../../../../../game/sound/types/Sound";
import { DisplayCommandData } from "./DisplayCommandData";

const hideChoices = (
  game: SparkGame,
  structName: string,
  writer: Writer | undefined
): void => {
  const choiceEls = game.ui.findAllUIElements(
    structName,
    writer?.target || "choice"
  );
  choiceEls.forEach((el) => {
    if (el) {
      el.onclick = null;
      el.replaceChildren();
      el.style["display"] = "none";
    }
  });
};

const isHidden = (content: string, hidden?: string): boolean => {
  if (!hidden) {
    return false;
  }
  if (hidden === content) {
    return true;
  }
  return new RegExp(hidden).test(content);
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

export const executeDisplayCommand = (
  game: SparkGame,
  data: DisplayCommandData,
  context?: {
    valueMap: Record<string, unknown>;
    typeMap: { [type: string]: Record<string, any> };
    instant?: boolean;
    debug?: boolean;
    preview?: boolean;
  },
  onFinished?: () => void,
  onClickChoice?: (...args: string[]) => void
): ((deltaMS: number) => void) | undefined => {
  const id = data.reference.id;
  const type = data.params.type;

  const valueMap = context?.valueMap;
  const typeMap = context?.typeMap;
  const structName = "display";

  const writerConfigs = typeMap?.["writer"] as Record<string, Writer>;
  const writerType =
    type === "action"
      ? "action_writer"
      : type === "dialogue"
      ? "dialogue_writer"
      : type === "scene"
      ? "scene_writer"
      : type === "transition"
      ? "transition_writer"
      : "";
  const writerConfig = writerConfigs?.[writerType];

  if (typeMap) {
    game.ui.loadUI(typeMap, structName);
  }
  const structEl = game.ui.findFirstUIElement(structName);

  if (structEl) {
    structEl.removeState("hidden");
  }

  const characterName = data?.params?.characterName || "";
  const characterParenthetical = data?.params?.characterParenthetical || "";
  const content = data?.params?.content;
  const autoAdvance = data?.params?.autoAdvance;
  const characterKey = characterName
    .replace(/([ ])/g, "_")
    .replace(/([.'"`])/g, "");

  const characterConfig = characterName
    ? ((typeMap?.["character"]?.[characterKey] ||
        typeMap?.["character"]?.[""]) as Character)
    : undefined;

  const validCharacterName =
    type === "dialogue" &&
    !isHidden(characterName, writerConfigs?.["character_name_writer"]?.hidden)
      ? characterConfig?.name || characterName || ""
      : "";
  const validCharacterParenthetical =
    type === "dialogue" &&
    !isHidden(
      characterParenthetical,
      writerConfigs?.["parenthetical_writer"]?.hidden
    )
      ? characterParenthetical || ""
      : "";

  const resolvedContent = content
    .filter(
      (c) =>
        // Only show content that have no prerequisites or have truthy prerequisites
        !c.prerequisite || Boolean(evaluate(c.prerequisite, valueMap))
    )
    .map((c) => {
      if (c.text) {
        // Substitute any {variables} in text
        const [formattedContent] = format(c.text, valueMap);
        const resolved = {
          ...c,
          text: formattedContent,
        };
        return resolved;
      }
      return { ...c };
    });

  if (resolvedContent.length === 0) {
    // No content to display
    return undefined;
  }

  const instant = context?.instant;
  const debug = context?.debug;
  const indicatorFadeDuration =
    writerConfigs?.["indicator_writer"]?.fade_duration || 0;

  const descriptionGroupEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["description_group_writer"]?.target || "description_group"
  );
  const dialogueGroupEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["dialogue_group_writer"]?.target || "dialogue_group"
  );
  const indicatorEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["indicator_writer"]?.target || "indicator"
  );
  const boxEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["box_writer"]?.target || "box"
  );

  // TODO: Instead of hardcoding whether or not a channel should replace old audio, check for defined Channel settings
  game.sound.stopChannel("writer");
  game.sound.stopChannel("voice");

  hideChoices(game, structName, writerConfigs?.["choice_writer"]);

  const changesBackdrop = resolvedContent.some(
    (p) => p.image && p.target === "backdrop"
  );
  const changesText = resolvedContent.some((p) => p.text);

  if (boxEl) {
    boxEl.style["display"] = changesText ? null : "none";
  }
  if (dialogueGroupEl) {
    dialogueGroupEl.style["display"] =
      changesText && type === "dialogue" ? null : "none";
  }
  if (descriptionGroupEl) {
    descriptionGroupEl.style["display"] =
      changesText && type !== "dialogue" ? null : "none";
  }

  const characterNameEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["character_name_writer"]?.target || "character_name"
  );
  const characterParentheticalEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["character_parenthetical_writer"]?.target ||
      "character_parenthetical"
  );
  const parentheticalEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["parenthetical_writer"]?.target || "parenthetical"
  );

  const portraitEl = game.ui.findFirstUIElement(structName, "portrait");
  const insertEl = game.ui.findFirstUIElement(structName, "insert");
  const backdropEl = game.ui.findFirstUIElement(structName, "backdrop");

  const contentElEntries = [
    {
      key: "dialogue",
      value: game.ui.findFirstUIElement(
        structName,
        writerConfigs?.["dialogue_writer"]?.target || "dialogue"
      ),
    },
    {
      key: "action",
      value: game.ui.findFirstUIElement(
        structName,
        writerConfigs?.["action_writer"]?.target || "action"
      ),
    },
    {
      key: "centered",
      value: game.ui.findFirstUIElement(
        structName,
        writerConfigs?.["centered_writer"]?.target || "centered"
      ),
    },
    {
      key: "scene",
      value: game.ui.findFirstUIElement(
        structName,
        writerConfigs?.["scene_writer"]?.target || "scene"
      ),
    },
    {
      key: "transition",
      value: game.ui.findFirstUIElement(
        structName,
        writerConfigs?.["transition_writer"]?.target || "transition"
      ),
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
  }

  const stalePortraits: IElement[] | undefined = portraitEl?.getChildren();
  const staleInserts: IElement[] | undefined = insertEl?.getChildren();
  let staleBackdrops: IElement[] | undefined = undefined;
  // TODO: Instead of hardcoding whether or not a layer should replace old images, check for defined Layer settings
  if (changesBackdrop) {
    staleBackdrops = backdropEl?.getChildren();
  }

  const phrases = game.writer.write(
    resolvedContent,
    writerConfig,
    characterConfig,
    instant,
    debug,
    () => game.ui.createElement("span")
  );

  const soundsToLoad: Sound[] = [];
  const soundEvents: (() => void)[] = [];

  const nextIndices: Record<string, number> = {};
  const layerImages: Record<string, IElement[]> = {};
  const layerElements = new Set<IElement>();

  contentElEntries.forEach(({ key, value }) => {
    if (value) {
      if (key === type) {
        value.replaceChildren();
        phrases.forEach((p) => {
          if (p.image) {
            const assetNames = p.image;
            const target = p.target || "portrait";
            const targetEl = game.ui.findFirstUIElement(structName, target);
            if (targetEl) {
              const imageSrcs: string[] = [];
              assetNames.forEach((assetName) => {
                if (assetName) {
                  const value = valueMap?.[assetName] as
                    | { name: string; src: string }
                    | { name: string; src: string }[]
                    | { assets: { name: string; src: string }[] };
                  const assets = Array.isArray(value)
                    ? value.map((a) => a)
                    : value && typeof value === "object" && "assets" in value
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
                    const prevImage = layerImages[target]?.at(-1);
                    if (prevImage) {
                      // fade out previous image on this layer before showing this image
                      prevImage.style["transition"] = instant
                        ? "none"
                        : `opacity 0s linear ${c.time}s`;
                    }
                    if (c.image) {
                      c.image.style["backgroundImage"] =
                        combinedBackgroundImage;
                      targetEl.appendChild(c.element);
                      c.element.appendChild(c.image);
                      layerImages[target] ??= [];
                      layerImages[target]!.push(c.image);
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
            const sounds: Sound[] = [];
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
                const value = valueMap?.[assetName] as
                  | { name: string; src: string }
                  | { name: string; src: string }[]
                  | {
                      assets: { name: string; src: string }[];
                      cues: number[];
                      loop: boolean;
                      volume: number;
                    };
                const assets = Array.isArray(value)
                  ? value.map((a) => a)
                  : value && typeof value === "object" && "assets" in value
                  ? value.assets.map((a) => a)
                  : [value];
                const cues =
                  value && typeof value === "object" && "cues" in value
                    ? value.cues
                    : undefined;
                const groupLoop =
                  value && typeof value === "object" && "loop" in value
                    ? value.loop
                    : undefined;
                const groupVolume =
                  value && typeof value === "object" && "volume" in value
                    ? value.volume ?? 1
                    : 1;
                const loop =
                  !trackNoloop && (trackLoop || groupLoop || channelLoop);
                const volume = groupVolume * trackVolume * trackMuteMultiplier;
                assets.forEach((asset) => {
                  if (asset) {
                    const audioId = asset.name || asset.src;
                    const audioData = asset.src;
                    const sound = {
                      id: audioId,
                      src: audioData,
                      cues: cues ?? [],
                      loop,
                      volume,
                    };
                    soundsToLoad.push(sound);
                    sounds.push(sound);
                  }
                });
              }
            });
            if (sounds.length > 0) {
              const groupId = assetNames.join("+");
              const scheduled = assetArgs?.includes("schedule");
              if (assetArgs?.includes("start")) {
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
              const writerType = p.target + "_writer";
              const writerConfig = writerConfigs?.[writerType];
              const targetClassName = writerConfig?.target || p.target;
              const index = nextIndices[targetClassName] ?? 0;
              const text = p.text || "";
              const hidden = isHidden(text, writerConfig?.hidden);
              if (!hidden) {
                const targetEls = game.ui.findAllUIElements(
                  structName,
                  targetClassName
                );
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
                              if (c.wrapper) {
                                el.appendChild(c.wrapper);
                                c.wrapper.appendChild(c.element);
                              } else {
                                el.appendChild(c.element);
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
                          layerElements.add(el);
                          if (p.tag === "choice") {
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
                }
              }

              nextIndices[targetClassName] = index + 1;
            } else {
              p.chunks?.forEach((c) => {
                if (c.element) {
                  if (c.wrapper) {
                    value.appendChild(c.wrapper);
                    c.wrapper.appendChild(c.element);
                  } else {
                    value.appendChild(c.element);
                  }
                }
              });
            }
          }
        });
        value.style["display"] = null;
      } else {
        value.replaceChildren();
        value.style["display"] = "none";
      }
    }
  });
  if (indicatorEl) {
    if (data && !autoAdvance) {
      indicatorEl.style["transition"] = null;
      indicatorEl.style["opacity"] = instant ? "1" : "0";
      indicatorEl.style["display"] = null;
      indicatorEl.style["animation-play-state"] = "paused";
    } else {
      indicatorEl.style["display"] = "none";
    }
  }

  const doTransitions = () => {
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
    layerElements.forEach((layerEl) => {
      layerEl.style["display"] = "block";
      layerEl.style["opacity"] = "1";
    });
    // Transition in new elements
    allChunks.forEach((c) => {
      if (c.wrapper) {
        // Fade in wrapper
        c.wrapper.style["opacity"] = "1";
      }
      if (c.element) {
        // Fade in element
        c.element.style["opacity"] = "1";
      }
      if (c.image) {
        // Fade out images that have an out transition
        if (c.image.style["transition"]) {
          c.image.style["opacity"] = "0";
        }
      }
    });
  };

  const allChunks = phrases.flatMap((x) => x.chunks || []);
  const handleFinished = (): void => {
    doTransitions();
    if (indicatorEl) {
      indicatorEl.style[
        "transition"
      ] = `opacity ${indicatorFadeDuration}s linear`;
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
      const voiceSound = characterConfig?.synth;
      const clackSound = writerConfig?.synth;
      const beepSound = voiceSound || clackSound;
      const beepEnvelope = beepSound?.envelope;
      const beepDuration = beepEnvelope
        ? (beepEnvelope.attack ?? 0) +
          (beepEnvelope.decay ?? 0) +
          (beepEnvelope.sustain ?? 0) +
          (beepEnvelope.release ?? 0)
        : 0;
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
      allChunks.forEach((c) => {
        if (c.element) {
          c.element.style["display"] = null;
        }
      });
      // Start writer typing tones
      game.sound.start(
        { id, src: new SynthBuffer(tones) },
        "writer",
        0,
        0,
        () => {
          started = true;
        }
      );
      // Load and modulate ((sounds))
      game.sound.loadAll(soundsToLoad).then(() => {
        soundEvents.forEach((event) => {
          event?.();
        });
      });
    }
  }
  if (data) {
    if (indicatorEl && (!game || instant)) {
      indicatorEl.style["transition"] = null;
      indicatorEl.style["opacity"] = "1";
    }
  }
  let elapsedMS = 0;
  let finished = false;
  const totalDurationMS = allChunks.reduce((p, c) => p + c.duration * 1000, 0);
  const handleTick = (deltaMS: number): void => {
    if (deltaMS) {
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
    }
  };
  return handleTick;
};
