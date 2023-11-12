import { format } from "../../../../../../../../../spark-evaluate/src";
import {
  Character,
  Chunk,
  clone,
  convertPitchNoteToHertz,
  SparkGame,
  SynthBuffer,
  Tone,
  transpose,
  Writer,
} from "../../../../../../../game";
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

const audioGroup: { id: string; data: string }[] = [];

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
  preview?: boolean
): ((deltaMS: number) => void) | undefined => {
  const id = data.reference.id;
  const type = data.params.type;

  const valueMap = context?.valueMap;
  const typeMap = context?.typeMap;
  const structName = "DISPLAY";

  const writerConfigs = typeMap?.["writer"] as Record<string, Writer>;
  const writerConfig = writerConfigs?.[type];

  audioGroup.length = 0;

  if (typeMap) {
    game.ui.loadUI(typeMap, structName);
  }
  const structEl = game.ui.findFirstUIElement(structName);

  if (structEl) {
    structEl.removeState("hidden");
  }

  const backgroundEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["background"]?.className || "Background"
  );

  // const assetsOnly = type === "assets";
  // if (assetsOnly) {
  //   assets.forEach((asset) => {
  //     const assetName = asset.name;
  //     const assetArgs = asset.args;
  //     const assetType = asset.type;
  //     const assetUrl = valueMap?.[assetName] as string;
  //     if (assetType === "image" && assetName && assetUrl) {
  //       if (backgroundEl) {
  //         backgroundEl.style["backgroundImage"] = `url("${assetUrl}")`;
  //         backgroundEl.style["backgroundRepeat"] = "no-repeat";
  //         backgroundEl.style["display"] = null;
  //       }
  //     }
  //     if (assetType === "audio" && assetName && assetUrl) {
  //       if (assetArgs.includes("stop")) {
  //         game.sound.stop(assetName);
  //       } else {
  //         audioGroup.push({ id: assetName, data: assetUrl });
  //       }
  //     }
  //   });
  //   if (audioGroup.length > 0) {
  //     game.sound.scheduleGroup("music", id, audioGroup, true);
  //   }
  //   return undefined;
  // }

  const character = data?.params?.characterName || "";
  const parenthetical = data?.params?.characterParenthetical || "";
  const content = data?.params?.content;
  const autoAdvance = data?.params?.autoAdvance;
  const characterKey = character
    .replace(/([ ])/g, "_")
    .replace(/([.'"`])/g, "");

  const characterConfig = character
    ? ((typeMap?.["character"]?.[characterKey] ||
        typeMap?.["character"]?.[type] ||
        typeMap?.["character"]?.[""]) as Character)
    : undefined;

  const validCharacter =
    type === "dialogue" &&
    !isHidden(character, writerConfigs?.["character"]?.hidden)
      ? characterConfig?.name || character || ""
      : "";
  const validParenthetical =
    type === "dialogue" &&
    !isHidden(parenthetical, writerConfigs?.["parenthetical"]?.hidden)
      ? parenthetical || ""
      : "";

  const resolvedContent = content.map((c) => {
    if (c.text) {
      const [formattedContent] = format(c.text, valueMap);
      const resolved = {
        ...c,
        text: formattedContent,
      };
      return resolved;
    }
    return { ...c };
  });

  const instant = context?.instant;
  const debug = context?.debug;
  const indicatorFadeDuration = writerConfigs?.["indicator"]?.fadeDuration || 0;

  const descriptionGroupEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["description_group"]?.className || "DescriptionGroup"
  );
  const dialogueGroupEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["dialogue_group"]?.className || "DialogueGroup"
  );
  const indicatorEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["indicator"]?.className || "Indicator"
  );

  const portraitEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["portrait"]?.className || "Portrait"
  );

  // if (portraitEl) {
  //   if (!assets.some((asset) => asset.type === "image")) {
  //     portraitEl.style["display"] = "none";
  //   }
  //   assets.forEach((asset) => {
  //     const assetName = asset.name;
  //     const assetArgs = asset.args;
  //     const assetType = asset.type;
  //     const assetUrl = valueMap?.[assetName] as string;
  //     if (assetType === "image" && assetName && assetUrl) {
  //       portraitEl.style["backgroundImage"] = `url("${assetUrl}")`;
  //       portraitEl.style["backgroundRepeat"] = "no-repeat";
  //       portraitEl.style["display"] = null;
  //     }
  //     if (assetType === "audio" && assetName && assetUrl) {
  //       if (assetArgs.includes("stop")) {
  //         game.sound.stop(assetName);
  //       } else {
  //         audioGroup.push({ id: assetName, data: assetUrl });
  //       }
  //     }
  //   });
  //   if (audioGroup.length > 0) {
  //     game.sound.scheduleGroup("voice", id, audioGroup, false);
  //   }
  // }

  hideChoices(game, structName, writerConfigs?.["choice"]);

  if (dialogueGroupEl) {
    dialogueGroupEl.style["display"] = type === "dialogue" ? null : "none";
  }
  if (descriptionGroupEl) {
    descriptionGroupEl.style["display"] = type !== "dialogue" ? null : "none";
  }

  const characterEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["character"]?.className || "Character"
  );
  const parentheticalEl = game.ui.findFirstUIElement(
    structName,
    writerConfigs?.["parenthetical"]?.className || "Parenthetical"
  );
  const contentElEntries = [
    {
      key: "dialogue",
      value: game.ui.findFirstUIElement(
        structName,
        writerConfigs?.["dialogue"]?.className || "Dialogue"
      ),
    },
    {
      key: "action",
      value: game.ui.findFirstUIElement(
        structName,
        writerConfigs?.["action"]?.className || "Action"
      ),
    },
    {
      key: "centered",
      value: game.ui.findFirstUIElement(
        structName,
        writerConfigs?.["centered"]?.className || "Centered"
      ),
    },
    {
      key: "scene",
      value: game.ui.findFirstUIElement(
        structName,
        writerConfigs?.["scene"]?.className || "Scene"
      ),
    },
    {
      key: "transition",
      value: game.ui.findFirstUIElement(
        structName,
        writerConfigs?.["transition"]?.className || "Transition"
      ),
    },
  ];

  if (characterEl) {
    characterEl.textContent = validCharacter;
    characterEl.style["display"] = validCharacter ? null : "none";
  }
  if (parentheticalEl) {
    parentheticalEl.textContent = validParenthetical;
    parentheticalEl.style["display"] = validParenthetical ? null : "none";
  }
  const phrases = game.writer.write(
    resolvedContent,
    writerConfig,
    characterConfig,
    instant,
    debug,
    () => game.ui.createElement("span")
  );
  const allChunks = phrases.flatMap((x) => x.chunks || []);
  contentElEntries.forEach(({ key, value }) => {
    if (value) {
      if (key === type) {
        value.replaceChildren();
        allChunks.forEach((c, i) => {
          if (c.element) {
            c.element.id = value.id + `.span${i.toString().padStart(8, "0")}`;
            value.appendChild(c.element);
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
  const handleFinished = (): void => {
    for (let i = 0; i < allChunks.length; i += 1) {
      const chunk = allChunks[i];
      if (chunk && chunk.element && chunk.element.style["display"] === "none") {
        chunk.element.style["display"] = null;
        chunk.element.style["opacity"] = "1";
      }
    }
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
      game.sound.stopAll("typewriter");
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
      game.sound.schedule(
        "typewriter",
        id,
        new SynthBuffer(tones),
        false,
        () => {
          // Start typing letters
          allChunks.forEach((c) => {
            if (c.element) {
              c.element.style["opacity"] = "1";
            }
          });
          started = true;
        }
      );
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
