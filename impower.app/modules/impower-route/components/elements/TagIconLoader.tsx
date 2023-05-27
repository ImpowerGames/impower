import { useContext, useEffect } from "react";
import ConfigCache from "../../../impower-config/classes/configCache";
import { IconLibraryContext, iconLibraryRegister } from "../../../impower-icon";

const TagIconLoader = (): JSX.Element => {
  const [, iconLibraryDispatch] = useContext(IconLibraryContext);

  useEffect(() => {
    const loadAllTagIcons = async (): Promise<void> => {
      const logInfo = (await import(`../../../impower-logger/utils/logInfo`))
        .default;
      const logInfoEnd = (
        await import(`../../../impower-logger/utils/logInfoEnd`)
      ).default;
      const needsLoad =
        !ConfigCache.instance.icons ||
        !ConfigCache.instance.params?.tagIconNames ||
        !ConfigCache.instance.params?.tagDisambiguations;
      if (needsLoad) {
        logInfo("Route", "LOADING TAG ICONS");
      }
      if (!ConfigCache.instance.icons) {
        ConfigCache.instance.icons = (
          await import(`../../../../resources/json/tagIcons.json`)
        ).default;
        if (ConfigCache.instance.icons) {
          iconLibraryDispatch(
            iconLibraryRegister("solid", ConfigCache.instance.icons)
          );
        }
      }
      if (!ConfigCache.instance.params?.tagIconNames) {
        const tagIconNames = (
          await import(`../../../../resources/json/tagIconNames.json`)
        ).default;
        if (tagIconNames) {
          ConfigCache.instance.set({ tagIconNames });
        }
      }
      if (!ConfigCache.instance.params?.tagDisambiguations) {
        const tagDisambiguations = (
          await import(`../../../../resources/json/en/tagDisambiguations.json`)
        ).default;
        if (tagDisambiguations) {
          ConfigCache.instance.set({ tagDisambiguations });
        }
      }
      const Config = (await import("../../../impower-config/classes/config"))
        .default;
      const params = Config.instance.hydrate();
      ConfigCache.instance.set(params);
      if (needsLoad) {
        logInfoEnd("Route", "LOADING TAG ICONS");
      }
    };
    loadAllTagIcons();
  }, [iconLibraryDispatch]);

  return null;
};

export default TagIconLoader;
