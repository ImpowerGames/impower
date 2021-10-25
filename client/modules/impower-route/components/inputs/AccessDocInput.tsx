import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import UserSolidIcon from "../../../../resources/icons/solid/user.svg";
import UsersSolidIcon from "../../../../resources/icons/solid/users.svg";
import {
  isStudioDocument,
  StudioDocument,
  UserDocument,
} from "../../../impower-data-store";
import Avatar from "../elements/Avatar";
import AutocompleteInput from "./AutocompleteInput";
import { StringInputProps } from "./StringInput";
import ValueFieldArea from "./ValueFieldArea";

const StyledAccessDocInput = styled.div``;

const StyledAvatarArea = styled.div`
  position: relative;
  min-width: ${(props): string => props.theme.spacing(5)};
  min-height: ${(props): string => props.theme.spacing(5)};
  width: ${(props): string => props.theme.spacing(5)};
  height: ${(props): string => props.theme.spacing(5)};
  margin-right: ${(props): string => props.theme.spacing(2)};
  border-radius: 50%;
`;

export interface AccessDocInputProps extends StringInputProps {
  spacing?: number;
  allowUserAccess?: boolean;
  allowEmailAccess?: boolean;
  allowStudioAccess?: boolean;
  value?: string | string[];
  fixedOptions?: string[];
  excludeDocsFromSearch?: string[];
  disableClearable?: boolean;
  onChange?: (e?: React.ChangeEvent, value?: string | string[]) => void;
  onDebouncedChange?: (value: string | string[]) => void;
}

const AccessDocInput = React.memo((props: AccessDocInputProps): JSX.Element => {
  const {
    variant,
    InputComponent,
    size,
    spacing,
    backgroundColor,
    disabled,
    label,
    placeholder,
    allowUserAccess,
    allowEmailAccess,
    allowStudioAccess,
    value,
    fixedOptions,
    excludeDocsFromSearch,
    disableClearable,
    debounceInterval,
    onChange,
    onDebouncedChange,
  } = props;

  const allSearchedDocs = useRef<{
    [id: string]: UserDocument | StudioDocument;
  }>({});
  const [searchedDocs, setSearchedDocs] = useState<{
    [id: string]: UserDocument | StudioDocument;
  }>({});
  const currentDocs = useRef<{
    [id: string]: UserDocument | StudioDocument;
  }>({});
  const [inputValue, setInputValue] = useState<string>("");
  const [, forceUpdate] = useState({});

  const theme = useTheme();

  const updateCurrentDocs = useCallback(
    async (value: string | string[]): Promise<void> => {
      const DataStoreRead = (
        await import("../../../impower-data-store/classes/dataStoreRead")
      ).default;
      if (value) {
        if (typeof value === "string") {
          if (!currentDocs.current[value]) {
            if (allowUserAccess) {
              const snapshot = await new DataStoreRead(
                "users",
                value
              ).get<UserDocument>();
              if (snapshot.exists()) {
                currentDocs.current[value] = snapshot.data();
              }
              forceUpdate({});
            }
            if (allowStudioAccess) {
              const snapshot = await new DataStoreRead(
                "studios",
                value
              ).get<StudioDocument>();
              if (snapshot.exists()) {
                currentDocs.current[value] = snapshot.data();
              }
              forceUpdate({});
            }
          }
        } else {
          const promises = [];
          value.forEach((id) => {
            if (!currentDocs.current[id]) {
              if (allowUserAccess) {
                promises.push(
                  new DataStoreRead("users", id)
                    .get<UserDocument>()
                    .then((snapshot) => {
                      if (snapshot.exists()) {
                        currentDocs.current[id] = snapshot.data();
                      }
                    })
                );
              }
              if (allowStudioAccess) {
                promises.push(
                  new DataStoreRead("studios", id)
                    .get<StudioDocument>()
                    .then((snapshot) => {
                      if (snapshot.exists()) {
                        currentDocs.current[id] = snapshot.data();
                      }
                    })
                );
              }
            }
            Promise.all(promises).then(() => forceUpdate({}));
          });
        }
      }
    },
    [allowStudioAccess, allowUserAccess]
  );

  useEffect(() => {
    updateCurrentDocs(value);
  }, [updateCurrentDocs, value]);

  const handleGetOptionLabel = useCallback(
    (option: string): string => {
      const optionDoc = currentDocs.current[option] || searchedDocs[option];
      return (optionDoc?.username || optionDoc?.slug || "") as string;
    },
    [searchedDocs]
  );

  const handleRenderOptionIcon = useCallback(
    (option: string): React.ReactNode => {
      const optionDoc = currentDocs.current[option] || searchedDocs[option];
      if (!optionDoc) {
        return null;
      }
      const { name } = optionDoc;
      const accessBackgroundColor = optionDoc.hex;
      const accessBackgroundImageSrc = optionDoc.icon
        ? optionDoc.icon.fileUrl
        : undefined;
      const icon = isStudioDocument(optionDoc) ? (
        <UsersSolidIcon />
      ) : (
        <UserSolidIcon />
      );
      return (
        <StyledAvatarArea>
          <Avatar
            backgroundColor={accessBackgroundColor}
            backgroundImageSrc={accessBackgroundImageSrc}
            name={name as string}
            icon={icon}
            fontSize={theme.fontSize.smallerIcon}
            style={{
              borderRadius: "inherit",
              width: "100%",
              height: "100%",
            }}
          />
        </StyledAvatarArea>
      );
    },
    [searchedDocs, theme.fontSize.smallerIcon]
  );

  const handleInputChange = useCallback(
    async (e: React.ChangeEvent, value: string): Promise<void> => {
      setInputValue(value);
    },
    []
  );

  const handleDebouncedInputChange = useCallback(
    async (value: string): Promise<void> => {
      const DataStoreQuery = (
        await import("../../../impower-data-store/classes/dataStoreQuery")
      ).default;
      setInputValue(value);
      if (!value) {
        setSearchedDocs({});
        return;
      }
      const newSearchedDocs: {
        [id: string]: UserDocument | StudioDocument;
      } = {};
      if (allowUserAccess) {
        const userQuery = allowUserAccess
          ? await new DataStoreQuery("users")
              .where(
                "terms",
                "array-contains",
                `username#${value.toLowerCase()}`
              )
              .limit(10)
              .get<UserDocument>()
          : undefined;
        const newUserDocs = userQuery?.docs || [];
        newUserDocs.forEach((d) => {
          if (!excludeDocsFromSearch.includes(d.id)) {
            newSearchedDocs[d.id] = d.data();
          }
        });
      }
      if (allowStudioAccess) {
        const studioQuery = allowStudioAccess
          ? await new DataStoreQuery("studios")
              .where("terms", "array-contains", `slug#${value.toLowerCase()}`)
              .limit(10)
              .get<StudioDocument>()
          : undefined;
        const newStudioDocs = studioQuery?.docs || [];
        newStudioDocs.forEach((d) => {
          if (!excludeDocsFromSearch.includes(d.id)) {
            newSearchedDocs[d.id] = d.data();
          }
        });
      }
      allSearchedDocs.current = {
        ...allSearchedDocs.current,
        ...newSearchedDocs,
      };
      setSearchedDocs(newSearchedDocs);
    },
    [allowStudioAccess, allowUserAccess, excludeDocsFromSearch]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent, option: string | string[]) => {
      if (!option) {
        return;
      }
      if (typeof option === "string") {
        if (searchedDocs[option]) {
          currentDocs.current[option] = searchedDocs[option];
        }
      } else {
        option.forEach((id) => {
          if (searchedDocs[id]) {
            currentDocs.current[id] = searchedDocs[id];
          }
        });
      }
      updateCurrentDocs(option);
      if (onChange) {
        onChange(e, option);
      }
      setSearchedDocs({});
      setInputValue("");
    },
    [onChange, searchedDocs, updateCurrentDocs]
  );

  const handleDebouncedChange = useCallback(
    (option: string | string[]) => {
      if (!option) {
        return;
      }
      if (typeof option === "string") {
        if (searchedDocs[option]) {
          currentDocs.current[option] = searchedDocs[option];
        }
      } else {
        option.forEach((id) => {
          if (searchedDocs[id]) {
            currentDocs.current[id] = searchedDocs[id];
          }
        });
      }
      updateCurrentDocs(option);
      if (onDebouncedChange) {
        onDebouncedChange(option);
      }
      setSearchedDocs({});
      if (value === "") {
        setInputValue("");
      }
    },
    [onDebouncedChange, searchedDocs, updateCurrentDocs, value]
  );

  const handleBlur = useCallback(() => {
    setSearchedDocs({});
    setInputValue("");
  }, []);

  const isOptionEqualToValue = (option: string, other: string): boolean => {
    return option === other;
  };

  const options = useMemo(
    () => [...(searchedDocs ? Object.keys(searchedDocs) : [])],
    [searchedDocs]
  );

  const handleGetValidValue = useCallback(
    (newValue: string) => {
      if (Array.isArray(newValue)) {
        if (!allowEmailAccess) {
          return newValue.filter((v) => Boolean(allSearchedDocs.current[v]));
        }
      } else if (!allowEmailAccess && !allSearchedDocs.current[newValue]) {
        return "";
      }
      return newValue;
    },
    [allowEmailAccess]
  );

  return (
    <StyledAccessDocInput className={StyledAccessDocInput.displayName}>
      <ValueFieldArea spacing={spacing}>
        <AutocompleteInput
          variant={variant}
          InputComponent={InputComponent}
          size={size}
          backgroundColor={backgroundColor}
          disabled={disabled}
          label={label}
          placeholder={placeholder}
          value={value}
          inputValue={inputValue}
          getOptionLabel={handleGetOptionLabel}
          isOptionEqualToValue={isOptionEqualToValue}
          options={options}
          fixedOptions={fixedOptions}
          getValidValue={handleGetValidValue}
          onInputChange={handleInputChange}
          onDebouncedInputChange={handleDebouncedInputChange}
          onChange={handleChange}
          onDebouncedChange={handleDebouncedChange}
          onBlur={handleBlur}
          renderOptionIcon={handleRenderOptionIcon}
          debounceInterval={debounceInterval}
          freeSolo
          clearOnBlur
          multiple={Array.isArray(value)}
          disableClearable={disableClearable}
        />
      </ValueFieldArea>
    </StyledAccessDocInput>
  );
});

export default AccessDocInput;
