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
    writer?.className || "Choice"
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

const getSpanId = (phraseIndex: number, chunkIndex: number) => {
  const phraseKey = phraseIndex.toString().padStart(8, "0");
  const chunkKey = chunkIndex.toString().padStart(8, "0");
  return `span_${phraseKey}_${chunkKey}`;
};

export const executeDisplayCommand = (
  game: SparkGame,
  data: DisplayCommandData,
  context?: {
    valueMap: Record<string, unknown>;
    typeMap: { [type: string]: Record<string, any> };
    instant?: boolean;
    debug?: boolean;
  },
  onFinished?: () => void,
  onClickChoice?: (...args: string[]) => void,
  preview?: boolean
): ((deltaMS: number) => void) | undefined => {
  const id = data.reference.id;
  const type = data.params.type;

  const valueMap = context?.valueMap;
  const typeMap = context?.typeMap;
  const structName = "Display";

  const writerConfigs = typeMap?.["Writer"] as Record<string, Writer>;
  const writerType =
    type === "action"
      ? "ActionWriter"
      : type === "dialogue"
      ? "DialogueWriter"
      : type === "centered"
      ? "CenteredWriter"
      : type === "scene"
      ? "SceneWriter"
      : type === "transition"
      ? "TransitionWriter"
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
  const overwriteText = data?.params?.overwriteText;
  const characterKey = characterName
    .replace(/([ ])/g, "_")
    .replace(/([.'"`])/g, "");

  const characterConfig = characterName
    ? ((typeMap?.["Character"]?.[characterKey] ||
        typeMap?.["Character"]?.[""]) as Character)
    : undefined;

  const validCharacterName =
    type === "dialogue" &&
    !isHidden(characterName, writerConfigs?.["CharacterNameWriter"]?.hidden)
      ? characterConfig?.name || characterName || ""
      : "";
  const validCharacterParenthetical =
    type === "dialogue" &&
    !isHidden(
      characterParenthetical,
      writerConfigs?.["ParentheticalWriter"]?.hidden
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
    writerConfigs?.["IndicatorWriter"]?.fadeDuration || 0;

  const descriptionGroupEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["DescriptionGroupWriter"]?.className || "DescriptionGroup"
  );
  const dialogueGroupEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["DialogueGroupWriter"]?.className || "DialogueGroup"
  );
  const indicatorEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["IndicatorWriter"]?.className || "Indicator"
  );
  const boxEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["BoxWriter"]?.className || "Box"
  );

  hideChoices(game, structName, writerConfigs?.["ChoiceWriter"]);

  if (dialogueGroupEl) {
    dialogueGroupEl.style["display"] = "none";
  }
  if (descriptionGroupEl) {
    descriptionGroupEl.style["display"] = "none";
  }
  if (boxEl) {
    boxEl.style["display"] = "none";
  }

  const characterNameEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["CharacterNameWriter"]?.className || "CharacterName"
  );
  const characterParentheticalEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["CharacterParentheticalWriter"]?.className ||
      "CharacterParenthetical"
  );
  const parentheticalEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["ParentheticalWriter"]?.className || "Parenthetical"
  );

  const portraitEl = game.ui.findFirstUIElement(structName, "Portrait");
  const insertEl = game.ui.findFirstUIElement(structName, "Insert");

  const contentElEntries = [
    {
      key: "dialogue",
      value: game.ui.findFirstUIElement(
        structName,
        writerConfigs?.["DialogueWriter"]?.className || "Dialogue"
      ),
    },
    {
      key: "action",
      value: game.ui.findFirstUIElement(
        structName,
        writerConfigs?.["ActionWriter"]?.className || "Action"
      ),
    },
    {
      key: "centered",
      value: game.ui.findFirstUIElement(
        structName,
        writerConfigs?.["CenteredWriter"]?.className || "Centered"
      ),
    },
    {
      key: "scene",
      value: game.ui.findFirstUIElement(
        structName,
        writerConfigs?.["SceneWriter"]?.className || "Scene"
      ),
    },
    {
      key: "transition",
      value: game.ui.findFirstUIElement(
        structName,
        writerConfigs?.["TransitionWriter"]?.className || "Transition"
      ),
    },
  ];

  if (characterNameEl) {
    const span = game.ui.createElement("span");
    span.textContent = validCharacterName;
    characterNameEl.replaceChildren(span);
    characterNameEl.style["display"] = validCharacterName ? null : "none";
  }
  if (characterParentheticalEl) {
    const span = game.ui.createElement("span");
    span.textContent = validCharacterParenthetical;
    characterParentheticalEl.replaceChildren(span);
    characterParentheticalEl.style["display"] = validCharacterParenthetical
      ? null
      : "none";
  }
  if (parentheticalEl) {
    parentheticalEl.style["display"] = "none";
  }

  const oldPortraits = portraitEl?.getChildren();
  const oldInserts = insertEl?.getChildren();

  game.sound.stopLayer("Voice");

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
        if (overwriteText) {
          value.replaceChildren();
        }
        phrases.forEach((p, phraseIndex) => {
          if (p.image) {
            const assetNames = p.image;
            const layer = p.layer || "Portrait";
            const targetEl = game.ui.findFirstUIElement(structName, layer);
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
                p.chunks?.forEach((c, chunkIndex) => {
                  const imageEl = game.ui.createElement("span");
                  if (c.element) {
                    const prevImage = layerImages[layer]?.at(-1);
                    if (prevImage) {
                      // fade out previous image on this layer before showing this image
                      prevImage.style["transition"] = instant
                        ? "none"
                        : `opacity 0s linear ${c.time}s`;
                    }
                    imageEl.style["backgroundImage"] = combinedBackgroundImage;
                    imageEl.style["position"] = "absolute";
                    imageEl.style["inset"] = "0";
                    imageEl.style["width"] = "100%";
                    imageEl.style["height"] = "100%";
                    imageEl.style["backgroundSize"] = "auto 100%";
                    imageEl.style["backgroundPosition"] = "center";
                    imageEl.style["backgroundRepeat"] = "no-repeat";
                    imageEl.style["opacity"] = "1";
                    imageEl.style["pointerEvents"] = "none";
                    imageEl.style["willChange"] = "opacity";
                    c.element.id =
                      value.id + "." + getSpanId(phraseIndex, chunkIndex);
                    targetEl.appendChild(c.element);
                    c.element.appendChild(imageEl);
                    layerImages[layer] ??= [];
                    layerImages[layer]!.push(imageEl);
                  }
                });
              }
            }
          }
          if (p.audio) {
            const offset = p.chunks?.[0]?.time ?? 0;
            const layer = p.layer || "Voice";
            const assetNames = p.audio;
            const assetArgs = p.args;
            const sounds: Sound[] = [];
            const loopOverride = Boolean(
              layer === "Music" || assetArgs?.includes("loop")
            );
            const percentage = Number(
              assetArgs?.find((arg) => arg.endsWith("%"))?.split("%")?.[0]
            );
            const hasPercentageArg = !Number.isNaN(percentage);
            const percentageAsDecimal = hasPercentageArg ? 1 : percentage / 100;
            const volumeOverride = hasPercentageArg ? percentageAsDecimal : 1;
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
                      mute: boolean;
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
                const loop =
                  value && typeof value === "object" && "loop" in value
                    ? value.loop
                    : undefined;
                const volume =
                  value && typeof value === "object" && "volume" in value
                    ? value.volume
                    : undefined;
                assets.forEach((asset) => {
                  if (asset) {
                    const audioId = asset.name || asset.src;
                    const audioData = asset.src;
                    const sound = {
                      id: audioId,
                      src: audioData,
                      cues: cues ?? [],
                      loop: loop ?? loopOverride,
                      volume: volume ?? volumeOverride,
                      muted: assetArgs?.includes("mute"),
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
              if (assetArgs?.includes("stop")) {
                soundEvents.push(() =>
                  game.sound.stopAll(sounds, layer, groupId, offset, scheduled)
                );
              } else if (assetArgs?.includes("pause")) {
                if (assetArgs?.includes("start")) {
                  soundEvents.push(() =>
                    game.sound.startAll(sounds, layer, groupId, offset)
                  );
                }
                soundEvents.push(() =>
                  game.sound.pauseAll(sounds, layer, groupId, offset, scheduled)
                );
              } else if (assetArgs?.includes("unpause")) {
                if (assetArgs?.includes("start")) {
                  soundEvents.push(() =>
                    game.sound.startAll(sounds, layer, groupId, offset)
                  );
                }
                soundEvents.push(() =>
                  game.sound.unpauseAll(
                    sounds,
                    layer,
                    groupId,
                    offset,
                    scheduled
                  )
                );
              } else if (assetArgs?.includes("mute")) {
                if (assetArgs?.includes("start")) {
                  soundEvents.push(() =>
                    game.sound.startAll(sounds, layer, groupId, offset)
                  );
                }
                soundEvents.push(() =>
                  game.sound.muteAll(sounds, layer, groupId, offset, scheduled)
                );
              } else if (assetArgs?.includes("unmute")) {
                if (assetArgs?.includes("start")) {
                  soundEvents.push(() =>
                    game.sound.startAll(sounds, layer, groupId, offset)
                  );
                }
                soundEvents.push(() =>
                  game.sound.unmuteAll(
                    sounds,
                    layer,
                    groupId,
                    offset,
                    scheduled
                  )
                );
              } else {
                soundEvents.push(() =>
                  game.sound.startAll(sounds, layer, groupId, offset)
                );
              }
            }
          }
          if (p.text) {
            if (boxEl) {
              boxEl.style["display"] = null;
            }
            if (type === "dialogue" && dialogueGroupEl) {
              dialogueGroupEl.style["display"] = null;
            }
            if (type !== "dialogue" && descriptionGroupEl) {
              descriptionGroupEl.style["display"] = null;
            }
            if (p.layer) {
              const writerType = p.layer + "Writer";
              const writerConfig = writerConfigs?.[writerType];
              const targetClassName = writerConfig?.className || p.layer;
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
                          p.chunks?.forEach((c, chunkIndex) => {
                            if (c.element) {
                              c.element.id =
                                value.id +
                                "." +
                                getSpanId(phraseIndex, chunkIndex);
                              el.appendChild(c.element);
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
              p.chunks?.forEach((c, chunkIndex) => {
                if (c.element) {
                  c.element.id =
                    value.id + "." + getSpanId(phraseIndex, chunkIndex);
                  value.appendChild(c.element);
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
      oldPortraits?.forEach((p) => {
        portraitEl.removeChild(p);
      });
    }
    if (insertEl) {
      oldInserts?.forEach((p) => {
        insertEl.removeChild(p);
      });
    }
    layerElements.forEach((layerEl) => {
      layerEl.style["display"] = "block";
      layerEl.style["opacity"] = "1";
    });
    // Transition in new elements
    allChunks.forEach((chunk) => {
      if (chunk.element) {
        chunk.element.style["display"] = null;
        // Fade in wrapper
        chunk.element.style["opacity"] = "1";
        const child = chunk.element.getChildren()[0];
        if (child?.style["transition"]) {
          // Fade out content that has an out transition
          child.style["opacity"] = "0";
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
      indicatorEl.style["animation-play-state"] = preview
        ? "paused"
        : "running";
    }
    onFinished?.();
  };

  let started = false;

  if (game) {
    if (instant) {
      game.sound.stopLayer("Typewriter");
      handleFinished();
    } else {
      const voiceSound = characterConfig?.voiceSound;
      const clackSound = writerConfig?.clackSound;
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
      // Start playing beeps
      game.sound.start(
        { id, src: new SynthBuffer(tones) },
        "Typewriter",
        0,
        () => {
          doTransitions();
          started = true;
        }
      );
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
    if (started && !finished) {
      elapsedMS += deltaMS;
      if (elapsedMS >= totalDurationMS) {
        finished = true;
        handleFinished();
      }
    }
  };
  return handleTick;
};
