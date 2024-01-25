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
  game.audio.stopChannel("writer");
  game.audio.stopChannel("voice");

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
    game.ui.text.clearAll(uiName, preservedTextLayers);
    game.ui.image.clearAll(uiName, preservedImageLayers);
  };
  clearUI();

  const instant = options?.instant;
  const previewing = options?.preview;
  const debugging = game.debug.state.debugging;

  const sequence = game.writer.write(displayed, {
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
  game.ui.style.update(uiName, "indicator", indicatorStyle);

  // Process buttons
  const buttonTransitionIds = Object.entries(sequence.button).flatMap(
    ([target, events]) =>
      events.map((e) => {
        const id = game.ui.instance.get(uiName, target, e.instance);
        const handleClick = (event?: {
          stopPropagation?: () => void;
        }): void => {
          event?.stopPropagation?.();
          clearUI();
          game.ui.setOnClick(uiName, target, null);
          onClickButton?.(e);
        };
        game.ui.setOnClick(uiName, target + " " + e.instance, handleClick);
        return id;
      })
  );
  // Process text
  const textTransitionIds = Object.entries(sequence.text).map(
    ([target, events]) => game.ui.text.write(uiName, target, events, instant)
  );
  // Process images
  const imageTransitionIds = Object.entries(sequence.image).map(
    ([target, events]) => game.ui.image.write(uiName, target, events, instant)
  );
  // Process audio
  const audioTransitionIds = Object.entries(sequence.audio).map(
    ([channel, events]) => game.audio.queue(channel, events, instant)
  );

  const handleFinished = (): void => {
    const indicatorStyle: Record<string, string | null> = {};
    indicatorStyle["transition"] = null;
    indicatorStyle["opacity"] = "1";
    indicatorStyle["animation-play-state"] = previewing ? "paused" : "running";
    game.ui.style.update(uiName, "indicator", indicatorStyle);
    onFinished?.();
  };

  game.ui.showUI(uiName);

  if (instant) {
    handleFinished();
    const indicatorStyle: Record<string, string | null> = {};
    indicatorStyle["transition"] = "none";
    indicatorStyle["opacity"] = "1";
    game.ui.style.update(uiName, "indicator", indicatorStyle);
  }

  let elapsedMS = 0;
  let ready = false;
  let finished = false;
  const totalDurationMS = (sequence.end ?? 0) * 1000;
  const handleTick = (deltaMS: number): void => {
    if (!ready) {
      if (
        buttonTransitionIds.every((n) => game.ui.isReady(n)) &&
        textTransitionIds.every((n) => game.ui.isReady(n)) &&
        imageTransitionIds.every((n) => game.ui.isReady(n)) &&
        audioTransitionIds.every((n) => game.audio.isReady(n))
      ) {
        ready = true;
        game.ui.triggerAll(textTransitionIds);
        game.ui.triggerAll(imageTransitionIds);
        game.audio.triggerAll(audioTransitionIds);
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
