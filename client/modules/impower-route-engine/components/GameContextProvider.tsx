import React, { useContext, useEffect, useRef, useState } from "react";
import { SparkElement } from "../../../../spark-dom";
import {
  EngineSparkParser,
  FileData,
  generateStructObjects,
  getScriptAugmentations,
  IElement,
  loadStyles,
  loadUI,
  SparkContext,
  SparkContextConfig,
} from "../../../../spark-engine";
import { GameContext } from "../contexts/gameContext";
import { ProjectEngineContext } from "../contexts/projectEngineContext";

const createGame = (
  rootElement: HTMLElement,
  script: string,
  files: Record<string, FileData>,
  config?: Partial<SparkContextConfig>
): SparkContext => {
  const augmentations = getScriptAugmentations(files);
  const parsed = EngineSparkParser.instance.parse(script, { augmentations });
  const root = new SparkElement(rootElement);
  const createElement = (type: string): IElement => {
    return new SparkElement(document.createElement(type));
  };
  return new SparkContext(parsed, {
    ui: { root, createElement },
    ...(config || {}),
  });
};

interface GameContextProviderProps {
  children: React.ReactNode;
}

const GameContextProvider = React.memo((props: GameContextProviderProps) => {
  const { children } = props;

  const [state] = useContext(ProjectEngineContext);
  const project = state?.project?.data;
  const script = project?.scripts?.data?.logic;
  const files = project?.files?.data;
  const seed =
    project?.instances?.configs?.data?.DebugConfig?.randomizationSeed;
  const mode = state?.test?.mode;
  const debugging = state?.test?.debug;
  const activeLine = state?.panel?.panels?.logic?.cursor?.fromLine || 1;

  const debuggingRef = useRef(debugging);
  debuggingRef.current = debugging;

  const activeLineRef = useRef(activeLine);
  activeLineRef.current = activeLine;

  const isFirstScriptLoadRef = useRef(true);

  const gameRef = useRef<SparkContext>();
  const [game, setGame] = useState<SparkContext>();

  const rootElement = document.getElementById("spark-root");

  useEffect(() => {
    if (rootElement && mode === "Edit") {
      gameRef.current = createGame(rootElement, script, files, {
        editable: true,
        activeLine: activeLineRef.current,
        state: {
          debug: {
            debugging: debuggingRef.current,
          },
          random: {
            seed,
          },
        },
      });
      setGame(gameRef.current);
    }
  }, [files, mode, rootElement, script, seed]);

  useEffect(() => {
    if (rootElement && mode === "Test") {
      gameRef.current = createGame(rootElement, script, files, {
        editable: false,
        activeLine: activeLineRef.current,
        state: {
          debug: {
            debugging: debuggingRef.current,
          },
          random: {
            seed,
          },
        },
      });
      setGame(gameRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (script && game && isFirstScriptLoadRef.current) {
      isFirstScriptLoadRef.current = false;
      const augmentations = getScriptAugmentations(files);
      const result = EngineSparkParser.instance.parse(script, {
        augmentations,
      });
      const objectMap = generateStructObjects(result?.structs);
      loadStyles(game.game, objectMap, ...Object.keys(objectMap?.style || {}));
      loadUI(game.game, objectMap, ...Object.keys(objectMap?.ui || {}));
    }
  }, [script, files, game]);

  useEffect(() => {
    if (gameRef.current) {
      if (debugging) {
        gameRef.current.game.debug.startDebugging();
      } else {
        gameRef.current.game.debug.stopDebugging();
      }
    }
  }, [debugging]);

  return <GameContext.Provider value={game}>{children}</GameContext.Provider>;
});

export default GameContextProvider;
