import { Game, Phrase } from "../../../../../game";
import { DisplayCommandData } from "../DisplayCommandData";
import { DisplayContentItem } from "../DisplayCommandParams";

export const executeDisplayCommand = (
  game: Game,
  data: DisplayCommandData,
  options?: { instant?: boolean; preview?: boolean },
  onFinished?: () => void,
  onClickButton?: (content: DisplayContentItem) => void
): {
  onTick?: (deltaMS: number) => void;
  displayed?: DisplayContentItem[];
} => {
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
    if (
      !c.prerequisite ||
      Boolean(game.module.logic.evaluate(c.prerequisite))
    ) {
      const r: Phrase = {
        ...c,
      };
      if (r.text) {
        // Substitute any {variables} in text
        r.text = game.module.logic.format(r.text);
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
  game.module.audio.stopChannel("writer");
  game.module.audio.stopChannel("voice");

  // Clear stale text
  const textLayerMap = context?.["text_layer"];
  const preservedTextLayers = textLayerMap
    ? Object.keys(textLayerMap).filter(
        (layer) => textLayerMap?.[layer]?.preserve
      )
    : undefined;

  // Clear stale images
  const imageLayerMap = context?.["image_layer"];
  const preservedImageLayers = imageLayerMap
    ? Object.keys(imageLayerMap).filter(
        (layer) => imageLayerMap?.[layer]?.preserve
      )
    : undefined;

  const clearUI = () => {
    game.module.ui.text.clearAll(uiName, preservedTextLayers);
    game.module.ui.image.clearAll(uiName, preservedImageLayers);
  };
  clearUI();

  const instant = options?.instant;
  const previewing = options?.preview;
  const debugging = context.system.debugging;

  const sequence = game.module.writer.write(displayed, {
    character: characterKey,
    instant,
    debug: debugging,
  });

  // Display indicator
  const indicatorStyle: Record<string, string | null> = {};
  if (autoAdvance) {
    indicatorStyle["display"] = "none";
  } else {
    indicatorStyle["transition"] = "none";
    indicatorStyle["opacity"] = instant ? "1" : "0";
    indicatorStyle["animation-play-state"] = "paused";
    indicatorStyle["display"] = null;
  }
  game.module.ui.style.update(uiName, "indicator", indicatorStyle);

  // Process buttons
  const buttonTransitionIds = Object.entries(sequence.button).flatMap(
    ([target, events]) =>
      events.map((e) => {
        const id = game.module.ui.instance.get(uiName, target, e.instance);
        const handleClick = (): void => {
          clearUI();
          game.module.ui.unobserve("click", uiName, target);
          onClickButton?.(e);
        };
        game.module.ui.observe(
          "click",
          uiName,
          target + " " + e.instance,
          handleClick
        );
        return id;
      })
  );
  // Process text
  const textTransitionIds = Object.entries(sequence.text).map(
    ([target, events]) =>
      game.module.ui.text.write(uiName, target, events, instant)
  );
  // Process images
  const imageTransitionIds = Object.entries(sequence.image).map(
    ([target, events]) =>
      game.module.ui.image.write(uiName, target, events, instant)
  );
  // Process audio
  const audioTransitionIds = Object.entries(sequence.audio).map(
    ([channel, events]) => game.module.audio.queue(channel, events, instant)
  );

  const handleFinished = (): void => {
    const indicatorStyle: Record<string, string | null> = {};
    indicatorStyle["transition"] = null;
    indicatorStyle["opacity"] = "1";
    indicatorStyle["animation-play-state"] = previewing ? "paused" : "running";
    game.module.ui.style.update(uiName, "indicator", indicatorStyle);
    onFinished?.();
  };

  game.module.ui.showUI(uiName);

  if (instant) {
    handleFinished();
    const indicatorStyle: Record<string, string | null> = {};
    indicatorStyle["transition"] = "none";
    indicatorStyle["opacity"] = "1";
    game.module.ui.style.update(uiName, "indicator", indicatorStyle);
  }

  let elapsedMS = 0;
  let ready = false;
  let finished = false;
  const totalDurationMS = (sequence.end ?? 0) * 1000;
  const handleTick = (deltaMS: number): void => {
    if (!ready) {
      if (
        audioTransitionIds.every((n) => game.module.audio.isReady(n)) &&
        buttonTransitionIds.every((n) => game.module.ui.isReady(n)) &&
        textTransitionIds.every((n) => game.module.ui.isReady(n)) &&
        imageTransitionIds.every((n) => game.module.ui.isReady(n))
      ) {
        ready = true;
        game.module.audio.triggerAll(audioTransitionIds);
        game.module.ui.triggerAll(textTransitionIds);
        game.module.ui.triggerAll(imageTransitionIds);
      }
    }
    if (ready && !finished) {
      elapsedMS += deltaMS;
      if (elapsedMS >= totalDurationMS) {
        finished = true;
        handleFinished();
      }
    }
  };
  return { onTick: handleTick, displayed };
};
