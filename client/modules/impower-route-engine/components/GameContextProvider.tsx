import React, { useContext, useEffect, useRef, useState } from "react";
import {
  EngineSparkParser,
  FileData,
  generateStructObjects,
  getScriptAugmentations,
  loadStyles,
  loadUI,
  SparkContext,
  SparkContextConfig,
} from "../../../../spark-engine";
import { GameContext } from "../contexts/gameContext";
import { ProjectEngineContext } from "../contexts/projectEngineContext";

const createGame = (
  script: string,
  files: Record<string, FileData>,
  config?: Partial<SparkContextConfig>
): SparkContext => {
  const augmentations = getScriptAugmentations(files);
  const parsed = EngineSparkParser.instance.parse(script, { augmentations });
  return new SparkContext(parsed, config);
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

  const isFirstEditLoadRef = useRef(true);
  const isFirstScriptLoadRef = useRef(true);

  const gameRef = useRef<SparkContext>();
  const [game, setGame] = useState<SparkContext>();

  useEffect(() => {
    if (!isFirstEditLoadRef.current) {
      if (mode === "Edit") {
        gameRef.current = createGame(script, files, {
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
    }
    isFirstEditLoadRef.current = false;
  }, [files, mode, script, seed]);

  useEffect(() => {
    if (mode === "Test") {
      gameRef.current = createGame(script, files, {
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
    if (script && isFirstScriptLoadRef.current) {
      isFirstScriptLoadRef.current = false;
      const augmentations = getScriptAugmentations(files);
      const result = EngineSparkParser.instance.parse(script, {
        augmentations,
      });
      const objectMap = generateStructObjects(result?.structs);
      loadStyles(objectMap, ...Object.keys(objectMap?.style || {}));
      loadUI(objectMap, ...Object.keys(objectMap?.ui || {}));
    }
  }, [script, files]);

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
