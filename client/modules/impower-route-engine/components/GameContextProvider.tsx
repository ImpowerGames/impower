import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { SparkElement } from "../../../../spark-dom";
import {
  EngineSparkParser,
  FileData,
  getScriptAugmentations,
  IElement,
  SparkContext,
  SparkContextConfig,
} from "../../../../spark-engine";
import { GameContext } from "../contexts/gameContext";
import { ProjectEngineContext } from "../contexts/projectEngineContext";

const createSparkContext = (
  root: SparkElement,
  script: string,
  files: Record<string, FileData>,
  config?: Partial<SparkContextConfig>
): SparkContext => {
  const augmentations = getScriptAugmentations(files);
  const parsed = EngineSparkParser.instance.parse(script, { augmentations });
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
  const files = project?.files;
  const seed =
    project?.instances?.configs?.data?.DebugConfig?.randomizationSeed;
  const mode = state?.test?.mode;
  const debugging = state?.test?.debug;
  const activeLine = state?.panel?.panels?.logic?.cursor?.fromLine || 1;

  const scriptRef = useRef(script);
  scriptRef.current = script;

  const filesRef = useRef(files);
  filesRef.current = files;

  const seedRef = useRef(seed);
  seedRef.current = seed;

  const modeRef = useRef(mode);
  modeRef.current = mode;

  const debuggingRef = useRef(debugging);
  debuggingRef.current = debugging;

  const activeLineRef = useRef(activeLine);
  activeLineRef.current = activeLine;

  const sparkContextRef = useRef<SparkContext>();
  const [sparkContext, setSparkContext] = useState<SparkContext>();

  const rootElement = document.getElementById("spark-root");
  const root = useMemo(
    () => (rootElement ? new SparkElement(rootElement) : undefined),
    [rootElement]
  );

  useEffect(() => {
    if (root && script && files !== undefined) {
      if (!sparkContextRef.current) {
        // Initialize SparkContext
        sparkContextRef.current = createSparkContext(
          root,
          script,
          files?.data,
          {
            editable: modeRef.current === "Edit",
            activeLine: activeLineRef.current,
            state: {
              debug: {
                debugging: debuggingRef.current,
              },
              random: {
                seed: seedRef.current,
              },
            },
          }
        );
        const objectMap = sparkContextRef.current.game.struct.config.objectMap;
        sparkContextRef.current.game.ui.loadStyles(objectMap);
        sparkContextRef.current.game.ui.loadUI(
          objectMap,
          ...Object.keys(objectMap?.ui || {})
        );
        setSparkContext(sparkContextRef.current);
      }
    }
  }, [root, script, files]);

  const isInitialized = Boolean(sparkContextRef.current);

  useEffect(() => {
    if (isInitialized && mode && root) {
      sparkContextRef.current = createSparkContext(
        root,
        scriptRef.current,
        filesRef.current?.data,
        {
          editable: mode === "Edit",
          activeLine: activeLineRef.current,
          state: {
            debug: {
              debugging: debuggingRef.current,
            },
            random: {
              seed: seedRef.current,
            },
          },
        }
      );
      setSparkContext(sparkContextRef.current);
    }
  }, [isInitialized, mode, root]);

  useEffect(() => {
    if (sparkContextRef.current) {
      if (debugging) {
        sparkContextRef.current.game.debug.startDebugging();
      } else {
        sparkContextRef.current.game.debug.stopDebugging();
      }
    }
  }, [debugging]);

  return (
    <GameContext.Provider value={sparkContext}>{children}</GameContext.Provider>
  );
});

export default GameContextProvider;
