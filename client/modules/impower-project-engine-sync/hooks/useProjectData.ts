import { useEffect, useState } from "react";
import { GameProjectData, ResourceProjectData } from "../../impower-game/data";
import { ProjectEngineSync } from "../types/classes/projectEngineSync";

export const useProjectData = <T extends ResourceProjectData | GameProjectData>(
  projectId: string,
  onLoad?: (doc: T) => void
): T => {
  const [data, setData] = useState<T>();

  useEffect(() => {
    if (projectId === undefined) {
      setData(undefined);
      return;
    }

    if (!projectId) {
      setData(null);
      if (onLoad) {
        onLoad(null);
      }
      return;
    }

    setData(undefined);

    ProjectEngineSync.instance
      .loadData("projects", projectId)
      .then((loadedData: T) => {
        setData(loadedData);
        if (onLoad) {
          onLoad(loadedData);
        }
      });
  }, [onLoad, projectId]);

  return data;
};
