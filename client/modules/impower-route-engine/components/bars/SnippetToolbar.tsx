import styled from "@emotion/styled";
import Divider from "@material-ui/core/Divider";
import Menu from "@material-ui/core/Menu";
import MenuItem from "@material-ui/core/MenuItem";
import ToggleButton from "@material-ui/core/ToggleButton";
import ToggleButtonGroup from "@material-ui/core/ToggleButtonGroup";
import React, { useCallback, useContext, useRef, useState } from "react";
import AlignCenterRegularIcon from "../../../../resources/icons/regular/align-center.svg";
import ArrowRightToBracketRegularIcon from "../../../../resources/icons/regular/arrow-right-to-bracket.svg";
import ArrowUpFromBracketRegularIcon from "../../../../resources/icons/regular/arrow-up-from-bracket.svg";
import BinaryRegularIcon from "../../../../resources/icons/regular/binary.svg";
import BoldRegularIcon from "../../../../resources/icons/regular/bold.svg";
import BracketsCurlyRegularIcon from "../../../../resources/icons/regular/brackets-curly.svg";
import CameraMovieRegularIcon from "../../../../resources/icons/regular/camera-movie.svg";
import ClapperboardRegularIcon from "../../../../resources/icons/regular/clapperboard.svg";
import FileAudioRegularIcon from "../../../../resources/icons/regular/file-audio.svg";
import FileImageRegularIcon from "../../../../resources/icons/regular/file-image.svg";
import FileLinesRegularIcon from "../../../../resources/icons/regular/file-lines.svg";
import FileVideoRegularIcon from "../../../../resources/icons/regular/file-video.svg";
import FilmRegularIcon from "../../../../resources/icons/regular/film.svg";
import HashtagRegularIcon from "../../../../resources/icons/regular/hashtag.svg";
import HouseRegularIcon from "../../../../resources/icons/regular/house.svg";
import ImageUserRegularIcon from "../../../../resources/icons/regular/image-user.svg";
import IslandTropicalRegularIcon from "../../../../resources/icons/regular/island-tropical.svg";
import ItalicRegularIcon from "../../../../resources/icons/regular/italic.svg";
import ListCheckRegularIcon from "../../../../resources/icons/regular/list-check.svg";
import ListUlRegularIcon from "../../../../resources/icons/regular/list-ul.svg";
import MessageDotsRegularIcon from "../../../../resources/icons/regular/message-dots.svg";
import PersonWalkingRegularIcon from "../../../../resources/icons/regular/person-walking.svg";
import ShareFromSquareBracketRegularIcon from "../../../../resources/icons/regular/share-from-square.svg";
import SplitRegularIcon from "../../../../resources/icons/regular/split.svg";
import UnderlineRegularIcon from "../../../../resources/icons/regular/underline.svg";
import VolumeRegularIcon from "../../../../resources/icons/regular/volume.svg";
import CaretDownSolidIcon from "../../../../resources/icons/solid/caret-down.svg";
import { FontIcon } from "../../../impower-icon";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { panelChangeEditorState } from "../../types/actions/panelActions";
import { SnippetCategoryType } from "../../types/state/panelState";

const categories: {
  type: SnippetCategoryType;
  name: string;
  icon: React.ReactNode;
}[] = [
  { type: "screenplay", name: "Screenplay", icon: <ClapperboardRegularIcon /> },
  { type: "world", name: "World", icon: <IslandTropicalRegularIcon /> },
  { type: "flow", name: "Flow", icon: <SplitRegularIcon /> },
  { type: "data", name: "Data", icon: <BinaryRegularIcon /> },
];

const StyledSnippetToolbar = styled.div`
  width: 100%;
  height: ${(props): string => props.theme.minHeight.navigationBar};
  max-height: ${(props): string => props.theme.minHeight.navigationBar};
  background-color: ${(props): string => props.theme.colors.darkForeground};
  pointer-events: auto;
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
`;

const StyledSnippetContent = styled.div`
  display: flex;
  width: 100%;
  height: 100%;
  color: white;
`;

const StyledToggleButton = styled(ToggleButton)`
  color: inherit;
  opacity: 1;
  font-size: 18px;
  padding: ${(props): string => props.theme.spacing(1)};

  &.Mui-selected {
    color: inherit;
    opacity: 1;
    background-color: rgba(0, 0, 0, 0.25);
  }

  &.Mui-selected:hover {
    background-color: rgba(0, 0, 0, 0.25);
  }

  &.Mui-disabled {
    color: inherit;
    opacity: 0.25;
  }

  border: none;
`;

const StyledTypeToggleButton = styled(StyledToggleButton)`
  padding-left: ${(props): string => props.theme.spacing(2)};
  min-width: ${(props): string => props.theme.spacing(4.5)};
`;

const StyledMainToggleButton = styled(StyledToggleButton)`
  flex: 1;
`;

const StyledToggleButtonGroup = styled(ToggleButtonGroup)`
  margin: ${(props): string => props.theme.spacing(0.5)};
  border: none;
  &.Mui-disabled {
    border: none;
  }
`;

const StyledMainToggleButtonGroup = styled(StyledToggleButtonGroup)`
  flex: 1;
`;

const StyledMenu = styled(Menu)`
  & .MuiPaper-root {
    background-color: ${(props): string => props.theme.colors.darkForeground};
    padding: ${(props): string => props.theme.spacing(1, 1, 0, 1)};
  }
`;

const StyledMenuLabel = styled.div`
  margin-left: ${(props): string => props.theme.spacing(2)};
`;

const StyledMenuItem = styled(MenuItem)`
  border-radius: ${(props): string => props.theme.spacing(1)};
  padding: ${(props): string => props.theme.spacing(1)};
  margin-bottom: ${(props): string => props.theme.spacing(1)};
  min-height: 0;
  color: ${(props): string =>
    props.theme.palette.getContrastText(props.theme.palette.primary.main)};

  &.Mui-selected {
    color: ${(props): string => props.theme.palette.primary.main};
    background-color: ${(props): string => props.theme.colors.selected};
  }

  &.Mui-selected:hover {
    color: ${(props): string => props.theme.palette.primary.main};
    background-color: ${(props): string => props.theme.colors.selected};
  }
`;

interface FormattingToolbarProps {
  onPointerDown?: (e: React.MouseEvent) => void;
  onChange?: (e: React.MouseEvent, value: string) => void;
}

const FormattingToolbar = React.memo(
  (props: FormattingToolbarProps): JSX.Element => {
    const { onPointerDown, onChange } = props;
    return (
      <StyledMainToggleButtonGroup
        size="small"
        exclusive
        onPointerDown={onPointerDown}
        onChange={onChange}
      >
        <StyledMainToggleButton value="bold" aria-label="bold">
          <FontIcon aria-label={`bold`}>
            <BoldRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
        <StyledMainToggleButton value="italic" aria-label="italic">
          <FontIcon aria-label={`italic`}>
            <ItalicRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
        <StyledMainToggleButton value="underline" aria-label="underline">
          <FontIcon aria-label={`underline`}>
            <UnderlineRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
        <StyledMainToggleButton value="center" aria-label="center">
          <FontIcon aria-label={`align-center`}>
            <AlignCenterRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
        <StyledMainToggleButton value="dynamic" aria-label="dynamic">
          <FontIcon aria-label={`dynamic`}>
            <BracketsCurlyRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </StyledMainToggleButtonGroup>
    );
  }
);

interface ScreenplayToolbarProps {
  onPointerDown?: (e: React.MouseEvent) => void;
  onChange?: (e: React.MouseEvent, value: string) => void;
}

const ScreenplayToolbar = React.memo(
  (props: ScreenplayToolbarProps): JSX.Element => {
    const { onPointerDown, onChange } = props;
    return (
      <StyledMainToggleButtonGroup
        size="small"
        exclusive
        onPointerDown={onPointerDown}
        onChange={onChange}
      >
        <StyledMainToggleButton value="section" aria-label="section">
          <FontIcon aria-label={`section`}>
            <HashtagRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
        <StyledMainToggleButton value="scene" aria-label="scene">
          <FontIcon aria-label={`scene`}>
            <HouseRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
        <StyledMainToggleButton value="dialogue" aria-label="dialogue">
          <FontIcon aria-label={`dialogue`}>
            <MessageDotsRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
        <StyledMainToggleButton value="action" aria-label="action">
          <FontIcon aria-label={`action`}>
            <PersonWalkingRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
        <StyledMainToggleButton value="transition" aria-label="transition">
          <FontIcon aria-label={`transition`}>
            <FilmRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </StyledMainToggleButtonGroup>
    );
  }
);

interface WorldToolbarProps {
  onPointerDown?: (e: React.MouseEvent) => void;
  onChange?: (e: React.MouseEvent, value: string) => void;
}

const WorldToolbar = React.memo((props: WorldToolbarProps): JSX.Element => {
  const { onPointerDown, onChange } = props;
  return (
    <StyledMainToggleButtonGroup
      size="small"
      exclusive
      onPointerDown={onPointerDown}
      onChange={onChange}
    >
      <StyledMainToggleButton value="image" aria-label="image">
        <FontIcon aria-label={`image`}>
          <ImageUserRegularIcon />
        </FontIcon>
      </StyledMainToggleButton>
      <StyledMainToggleButton value="audio" aria-label="audio">
        <FontIcon aria-label={`audio`}>
          <VolumeRegularIcon />
        </FontIcon>
      </StyledMainToggleButton>
      <StyledMainToggleButton value="camera" aria-label="camera">
        <FontIcon aria-label={`camera`}>
          <CameraMovieRegularIcon />
        </FontIcon>
      </StyledMainToggleButton>
    </StyledMainToggleButtonGroup>
  );
});

interface FlowToolbarProps {
  onPointerDown?: (e: React.MouseEvent) => void;
  onChange?: (e: React.MouseEvent, value: string) => void;
}

const FlowToolbar = React.memo((props: FlowToolbarProps): JSX.Element => {
  const { onPointerDown, onChange } = props;
  return (
    <StyledMainToggleButtonGroup
      size="small"
      exclusive
      onPointerDown={onPointerDown}
      onChange={onChange}
    >
      <StyledMainToggleButton value="choice" aria-label="choice">
        <FontIcon aria-label={`choice`}>
          <ListUlRegularIcon />
        </FontIcon>
      </StyledMainToggleButton>
      <StyledMainToggleButton value="condition" aria-label="condition">
        <FontIcon aria-label={`condition`}>
          <ListCheckRegularIcon />
        </FontIcon>
      </StyledMainToggleButton>
      <StyledMainToggleButton value="go" aria-label="go">
        <FontIcon aria-label={`go`}>
          <ArrowRightToBracketRegularIcon />
        </FontIcon>
      </StyledMainToggleButton>
      <StyledMainToggleButton value="jump" aria-label="jump">
        <FontIcon aria-label={`jump`}>
          <ArrowUpFromBracketRegularIcon />
        </FontIcon>
      </StyledMainToggleButton>
      <StyledMainToggleButton value="return" aria-label="return">
        <FontIcon aria-label={`return`} style={{ transform: "scaleX(-1)" }}>
          <ShareFromSquareBracketRegularIcon />
        </FontIcon>
      </StyledMainToggleButton>
    </StyledMainToggleButtonGroup>
  );
});

interface DataToolbarProps {
  onPointerDown?: (e: React.MouseEvent) => void;
  onChange?: (e: React.MouseEvent, value: string) => void;
}

const DataToolbar = React.memo((props: DataToolbarProps): JSX.Element => {
  const { onPointerDown, onChange } = props;
  return (
    <StyledMainToggleButtonGroup
      size="small"
      exclusive
      onPointerDown={onPointerDown}
      onChange={onChange}
    >
      <StyledMainToggleButton value="variable" aria-label="variable">
        <FontIcon aria-label={`variable`}>{`𝑥`}</FontIcon>
      </StyledMainToggleButton>
      <StyledMainToggleButton value="tag" aria-label="tag">
        <FontIcon aria-label={`tag`}>{`𝑡`}</FontIcon>
      </StyledMainToggleButton>
      <StyledMainToggleButton value="image" aria-label="image">
        <FontIcon aria-label={`image`}>
          <FileImageRegularIcon />
        </FontIcon>
      </StyledMainToggleButton>
      <StyledMainToggleButton value="audio" aria-label="audio">
        <FontIcon aria-label={`audio`}>
          <FileAudioRegularIcon />
        </FontIcon>
      </StyledMainToggleButton>
      <StyledMainToggleButton value="video" aria-label="video">
        <FontIcon aria-label={`video`}>
          <FileVideoRegularIcon />
        </FontIcon>
      </StyledMainToggleButton>
      <StyledMainToggleButton value="text" aria-label="text">
        <FontIcon aria-label={`text`}>
          <FileLinesRegularIcon />
        </FontIcon>
      </StyledMainToggleButton>
    </StyledMainToggleButtonGroup>
  );
});

interface CategoryToolbarProps {
  type: string;
  onPointerDown?: (e: React.MouseEvent) => void;
  onChange?: (e: React.MouseEvent, value: string) => void;
}

const CategoryToolbar = React.memo(
  (props: CategoryToolbarProps): JSX.Element => {
    const { type, onPointerDown, onChange } = props;
    if (type === "screenplay") {
      return (
        <ScreenplayToolbar onPointerDown={onPointerDown} onChange={onChange} />
      );
    }
    if (type === "world") {
      return <WorldToolbar onPointerDown={onPointerDown} onChange={onChange} />;
    }
    if (type === "flow") {
      return <FlowToolbar onPointerDown={onPointerDown} onChange={onChange} />;
    }
    if (type === "data") {
      return <DataToolbar onPointerDown={onPointerDown} onChange={onChange} />;
    }
    return null;
  }
);

const SnippetToolbar = React.memo((): JSX.Element => {
  const [state, dispatch] = useContext(ProjectEngineContext);
  const windowType = state?.window?.type;
  const selected = state?.panel?.panels?.[windowType]?.editorState?.selected;
  const category =
    state?.panel?.panels?.[windowType]?.editorCategory || "screenplay";

  const [anchorEl, setAnchorEl] = useState(null);
  const canCloseRef = useRef(false);

  const open = Boolean(anchorEl);

  const handleRestoreFocus = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    const editor = document.querySelector<HTMLElement>(".cm-content");
    if (editor) {
      editor.focus();
    }
  }, []);
  const handlePointerDownBackground = useCallback(
    (e: React.MouseEvent): void => {
      handleRestoreFocus(e);
    },
    [handleRestoreFocus]
  );
  const handlePointerDownMenuButton = useCallback(
    (e: React.MouseEvent): void => {
      canCloseRef.current = false;
      handleRestoreFocus(e);
      setAnchorEl(e.currentTarget);
      window.setTimeout(() => {
        canCloseRef.current = true;
      }, 100);
    },
    [handleRestoreFocus]
  );
  const handleClickMenuButton = useCallback(
    (e: React.MouseEvent): void => {
      handleRestoreFocus(e);
    },
    [handleRestoreFocus]
  );
  const handlePointerDownMenu = useCallback(
    (e: React.MouseEvent): void => {
      handleRestoreFocus(e);
    },
    [handleRestoreFocus]
  );
  const handleCloseMenu = useCallback(
    (e: React.MouseEvent): void => {
      if (canCloseRef.current) {
        handleRestoreFocus(e);
        setAnchorEl(null);
      }
    },
    [handleRestoreFocus]
  );
  const handlePointerDownMenuItem = useCallback(
    (e: React.MouseEvent): void => {
      handleRestoreFocus(e);
    },
    [handleRestoreFocus]
  );
  const handleClickMenuItem = useCallback(
    (e: React.MouseEvent, value: SnippetCategoryType): void => {
      handleRestoreFocus(e);
      setAnchorEl(null);
      const editorChange = {
        category: value,
      };
      dispatch(panelChangeEditorState(windowType, editorChange));
    },
    [dispatch, handleRestoreFocus, windowType]
  );
  const handlePointerDownGroup = useCallback(
    (e: React.MouseEvent): void => {
      handleRestoreFocus(e);
    },
    [handleRestoreFocus]
  );
  const handleChangeGroup = useCallback(
    (e: React.MouseEvent, value: string): void => {
      handleRestoreFocus(e);
      const editorChange = {
        category,
        action: value,
      };
      dispatch(panelChangeEditorState(windowType, editorChange));
    },
    [category, dispatch, handleRestoreFocus, windowType]
  );

  return (
    <StyledSnippetToolbar
      className="snippet-toolbar"
      onPointerDown={handlePointerDownBackground}
    >
      <StyledSnippetContent>
        {!selected && (
          <>
            <StyledTypeToggleButton
              value="category"
              aria-label="category"
              onPointerDown={handlePointerDownMenuButton}
              onClick={handleClickMenuButton}
            >
              <FontIcon aria-label={`category`}>
                {categories.find((x) => x.type === category)?.icon}
              </FontIcon>
              <FontIcon
                aria-label={`dropdown`}
                size={8}
                style={{ marginLeft: 2 }}
              >
                <CaretDownSolidIcon />
              </FontIcon>
            </StyledTypeToggleButton>
            <Divider flexItem orientation="vertical" sx={{ mx: 0.5, my: 1 }} />
            <StyledMenu
              anchorEl={anchorEl}
              open={open}
              disableAutoFocus
              disableAutoFocusItem
              disableEnforceFocus
              disableRestoreFocus
              anchorOrigin={{
                vertical: "top",
                horizontal: "left",
              }}
              transformOrigin={{
                vertical: "bottom",
                horizontal: "left",
              }}
              marginThreshold={0}
              onClose={handleCloseMenu}
              onPointerDown={handlePointerDownMenu}
            >
              {categories.map(({ type, name, icon }) => (
                <StyledMenuItem
                  key={type}
                  selected={category === type}
                  onPointerDown={handlePointerDownMenuItem}
                  onClick={(e): void => handleClickMenuItem(e, type)}
                >
                  <FontIcon aria-label={type}>{icon}</FontIcon>
                  <StyledMenuLabel>{name}</StyledMenuLabel>
                </StyledMenuItem>
              ))}
            </StyledMenu>
          </>
        )}
        <>
          {selected ? (
            <FormattingToolbar
              onPointerDown={handlePointerDownGroup}
              onChange={handleChangeGroup}
            />
          ) : (
            <CategoryToolbar
              type={category}
              onPointerDown={handlePointerDownGroup}
              onChange={handleChangeGroup}
            />
          )}
        </>
      </StyledSnippetContent>
    </StyledSnippetToolbar>
  );
});

export default SnippetToolbar;
