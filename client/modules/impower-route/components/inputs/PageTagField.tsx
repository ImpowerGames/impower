import { useTheme } from "@emotion/react";
import {
  AutocompleteGetTagProps,
  createFilterOptions,
  FilterOptionsState,
} from "@material-ui/core";
import dynamic from "next/dynamic";
import { useCallback, useContext, useMemo } from "react";
import { ConfigContext } from "../../../impower-config";
import ConfigCache from "../../../impower-config/classes/configCache";
import { DynamicIcon, FontIcon } from "../../../impower-icon";
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
  const {
    lockedTags,
    onLockTag,
    getDisplayValue,
    getInspector,
    data,
    propertyPath,
    InputProps,
  } = props;

  const [configState] = useContext(ConfigContext);

  const theme = useTheme();

  const inspectedData = data?.[0];

  const inspector = useMemo(
    () => getInspector?.(inspectedData),
    [getInspector, inspectedData]
  );

  const tagDisambiguations =
    configState?.tagDisambiguations ||
    ConfigCache.instance.params?.tagDisambiguations;

  const getValueIcon = useCallback(
    (option: string) => {
      return inspector.getPropertyValueIcon(
        propertyPath,
        inspectedData,
        option
      );
    },
    [inspectedData, inspector, propertyPath]
  );

  const renderTagChips = useCallback(
    (tagValue: string[], getTagProps: AutocompleteGetTagProps) => {
      return tagValue.map((option, index) => {
        const tagIconName = getValueIcon(option);
        const locked = lockedTags?.includes(option);
        return (
          <TagChip
            key={option}
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
        );
      });
    },
    [
      getDisplayValue,
      lockedTags,
      onLockTag,
      getValueIcon,
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

  const TagInputProps = useMemo(
    () => ({
      ...(InputProps || {}),
      style: {
        ...(InputProps?.style || {}),
        minHeight: 102,
        alignItems: "flex-start",
      },
    }),
    [InputProps]
  );
  return (
    <>
      <DataField
        {...props}
        renderProperty={undefined}
        renderChips={renderTagChips}
        getValueIcon={getValueIcon}
        filterOptions={handleFilterTagOptions}
        InputProps={TagInputProps}
      />
      <TagIconLoader />
    </>
  );
};

export default PageTagField;
