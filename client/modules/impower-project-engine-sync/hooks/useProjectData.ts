import { useState, useEffect } from "react";
import { GameProjectData, ResourceProjectData } from "../../impower-game/data";
import { ProjectEngineSync } from "../types/classes/projectEngineSync";

export const useProjectData = <T extends ResourceProjectData | GameProjectData>(
  projectCollection: "resources" | "games",
  projectId: string,
  onLoad?: (doc: T) => void
): T => {
  const [data, setData] = useState<T>();

  useEffect(() => {
    if (projectCollection === undefined || projectId === undefined) {
      setData(undefined);
      return;
    }

    if (!projectCollection || !projectId) {
      setData(null);
      if (onLoad) {
        onLoad(null);
      }
      return;
    }

    setData(undefined);

    ProjectEngineSync.instance
      .loadData(projectCollection, projectId)
      .then((loadedData: T) => {
        setData(loadedData);
        if (onLoad) {
          onLoad(loadedData);
        }
      });
  }, [onLoad, projectCollection, projectId]);

  return data;
};
