import { useTheme } from "@emotion/react";
import {
  AutocompleteGetTagProps,
  createFilterOptions,
  FilterOptionsState,
} from "@material-ui/core";
import dynamic from "next/dynamic";
import React, { useCallback, useContext, useMemo } from "react";
import { ConfigContext } from "../../../impower-config";
import ConfigCache from "../../../impower-config/classes/configCache";
import { DynamicIcon, FontIcon } from "../../../impower-icon";
import FadeAnimation from "../animations/FadeAnimation";
import DataField, { RenderPropertyProps } from "./DataField";
import TagChip from "./TagChip";

const TagIconLoader = dynamic(() => import("../elements/TagIconLoader"), {
  ssr: false,
});

export interface PageTagFieldProps extends RenderPropertyProps {
  lockedTags?: string[];
  onLockTag?: (tag: string) => void;
}

export const PageTagField = (props: PageTagFieldProps): JSX.Element | null => {
  const { lockedTags, onLockTag, getDisplayValue } = props;

  const [configState] = useContext(ConfigContext);

  const theme = useTheme();

  const tagIconNames =
    configState?.tagIconNames || ConfigCache.instance.params?.tagIconNames;
  const tagDisambiguations =
    configState?.tagDisambiguations ||
    ConfigCache.instance.params?.tagDisambiguations;

  const getValueIcon = useCallback(
    (option: string) => {
      return tagIconNames?.[option || ""] || "hashtag";
    },
    [tagIconNames]
  );

  const renderTagChips = useCallback(
    (tagValue: string[], getTagProps: AutocompleteGetTagProps) => {
      return tagValue.map((option, index) => {
        const tagIconName = tagIconNames?.[option || ""] || "hashtag";
        const locked = lockedTags?.includes(option);
        return (
          <FadeAnimation
            key={option}
            initial={0}
            animate={1}
            duration={0.15}
            ignoreContext
          >
            <TagChip
              color={locked ? "secondary" : "default"}
              icon={
                tagIconName && onLockTag && !locked ? (
                  <FontIcon
                    aria-label={option}
                    color={locked ? theme.colors.white80 : theme.colors.black40}
                    size={18}
                  >
                    <DynamicIcon icon={tagIconName} />
                  </FontIcon>
                ) : tagIconName ? (
                  <FontIcon
                    aria-label={option}
                    color={locked ? theme.colors.white80 : theme.colors.black40}
                    size={18}
                  >
                    <DynamicIcon icon={tagIconName} />
                  </FontIcon>
                ) : undefined
              }
              onClick={(e): void => {
                e.stopPropagation();
                e.preventDefault();
                if (onLockTag) {
                  onLockTag(option);
                }
              }}
              {...getTagProps({ index })}
              label={getDisplayValue(option)}
            />
          </FadeAnimation>
        );
      });
    },
    [
      getDisplayValue,
      lockedTags,
      onLockTag,
      tagIconNames,
      theme.colors.black40,
      theme.colors.white80,
    ]
  );

  const defaultFilterOptions = useMemo(
    () =>
      createFilterOptions<string>({
        matchFrom: "start",
      }),
    []
  );

  const handleFilterTagOptions = useCallback(
    (options: string[], state: FilterOptionsState<string>): string[] => {
      const { inputValue } = state;
      const disambiguations =
        tagDisambiguations?.[inputValue?.toLowerCase() || ""];
      const results = defaultFilterOptions(options, state);
      if (disambiguations) {
        disambiguations.forEach((d) => {
          if (!results.includes(d)) {
            results.push(d);
          }
        });
      }
      return results;
    },
    [defaultFilterOptions, tagDisambiguations]
  );

  return (
    <>
      <DataField
        {...props}
        renderProperty={undefined}
        renderChips={renderTagChips}
        getValueIcon={getValueIcon}
        filterOptions={handleFilterTagOptions}
      />
      <TagIconLoader />
    </>
  );
};

export default PageTagField;
