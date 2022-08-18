import styled from "@emotion/styled";
import Divider from "@material-ui/core/Divider";
import Menu from "@material-ui/core/Menu";
import MenuItem from "@material-ui/core/MenuItem";
import ToggleButton from "@material-ui/core/ToggleButton";
import ToggleButtonGroup from "@material-ui/core/ToggleButtonGroup";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import AlignCenterRegularIcon from "../../../../resources/icons/regular/align-center.svg";
import ArrowRightToBracketRegularIcon from "../../../../resources/icons/regular/arrow-right-to-bracket.svg";
import ArrowUpLeftFromCircleRegularIcon from "../../../../resources/icons/regular/arrow-up-left-from-circle.svg";
import ArrowUpToLineRegularIcon from "../../../../resources/icons/regular/arrow-up-to-line.svg";
import BarsStaggeredRegularIcon from "../../../../resources/icons/regular/bars-staggered.svg";
import BinaryRegularIcon from "../../../../resources/icons/regular/binary.svg";
import BoldRegularIcon from "../../../../resources/icons/regular/bold.svg";
import BracketsCurlyRegularIcon from "../../../../resources/icons/regular/brackets-curly.svg";
import BracketsRoundRegularIcon from "../../../../resources/icons/regular/brackets-round.svg";
import CircleERegularIcon from "../../../../resources/icons/regular/circle-e.svg";
import CirclePlusRegularIcon from "../../../../resources/icons/regular/circle-plus.svg";
import CircleXRegularIcon from "../../../../resources/icons/regular/circle-x.svg";
import ClapperboardRegularIcon from "../../../../resources/icons/regular/clapperboard.svg";
import FileAudioRegularIcon from "../../../../resources/icons/regular/file-audio.svg";
import FileImageRegularIcon from "../../../../resources/icons/regular/file-image.svg";
import FilmRegularIcon from "../../../../resources/icons/regular/film.svg";
import HashtagRegularIcon from "../../../../resources/icons/regular/hashtag.svg";
import HouseRegularIcon from "../../../../resources/icons/regular/house.svg";
import ImageUserRegularIcon from "../../../../resources/icons/regular/image-user.svg";
import IslandTropicalRegularIcon from "../../../../resources/icons/regular/island-tropical.svg";
import ItalicRegularIcon from "../../../../resources/icons/regular/italic.svg";
import ListCheckRegularIcon from "../../../../resources/icons/regular/list-check.svg";
import ListOlRegularIcon from "../../../../resources/icons/regular/list-ol.svg";
import ListTreeRegularIcon from "../../../../resources/icons/regular/list-tree.svg";
import ListUlRegularIcon from "../../../../resources/icons/regular/list-ul.svg";
import MessageDotsRegularIcon from "../../../../resources/icons/regular/message-dots.svg";
import ShareFromSquareBracketRegularIcon from "../../../../resources/icons/regular/share-from-square.svg";
import SplitRegularIcon from "../../../../resources/icons/regular/split.svg";
import TableListRegularIcon from "../../../../resources/icons/regular/table-list.svg";
import UnderlineRegularIcon from "../../../../resources/icons/regular/underline.svg";
import VolumeRegularIcon from "../../../../resources/icons/regular/volume.svg";
import CaretDownSolidIcon from "../../../../resources/icons/solid/caret-down.svg";
import { FontIcon } from "../../../impower-icon";
import { Tooltip } from "../../../impower-route";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import {
  panelChangeEditorState,
  panelSnippetPreview,
} from "../../types/actions/panelActions";
import { SnippetCategoryType } from "../../types/state/panelState";

const categories: {
  type: SnippetCategoryType;
  name: string;
  icon: React.ReactNode;
}[] = [
  { type: "screenplay", name: "Screenplay", icon: <ClapperboardRegularIcon /> },
  { type: "entity", name: "Entity", icon: <CircleERegularIcon /> },
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

const StyledButtonArea = styled.div`
  flex: 1;
  display: flex;
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

interface ToolbarProps {
  onPointerEnter?: (e: React.MouseEvent, value: string) => void;
  onPointerLeave?: (e: React.MouseEvent, value: string) => void;
  onPointerDown?: (e: React.MouseEvent) => void;
  onChange?: (e: React.MouseEvent, value: string) => void;
}

const FormattingToolbar = React.memo((props: ToolbarProps): JSX.Element => {
  const { onPointerEnter, onPointerLeave, onPointerDown, onChange } = props;
  return (
    <StyledMainToggleButtonGroup
      size="small"
      exclusive
      onPointerDown={onPointerDown}
      onChange={onChange}
    >
      <Tooltip title="bold" placement="top" arrow>
        <StyledMainToggleButton
          value="bold"
          aria-label="bold"
          onPointerEnter={(e): void => onPointerEnter?.(e, "bold")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "bold")}
        >
          <FontIcon aria-label={`bold`}>
            <BoldRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="italic" placement="top" arrow>
        <StyledMainToggleButton
          value="italic"
          aria-label="italic"
          onPointerEnter={(e): void => onPointerEnter?.(e, "italic")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "italic")}
        >
          <FontIcon aria-label={`italic`}>
            <ItalicRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="underline" placement="top" arrow>
        <StyledMainToggleButton
          value="underline"
          aria-label="underline"
          onPointerEnter={(e): void => onPointerEnter?.(e, "underline")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "underline")}
        >
          <FontIcon aria-label={`underline`}>
            <UnderlineRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="center" placement="top" arrow>
        <StyledMainToggleButton
          value="center"
          aria-label="center"
          onPointerEnter={(e): void => onPointerEnter?.(e, "center")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "center")}
        >
          <FontIcon aria-label={`align-center`}>
            <AlignCenterRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="dynamic" placement="top" arrow>
        <StyledMainToggleButton
          value="dynamic"
          aria-label="dynamic"
          onPointerEnter={(e): void => onPointerEnter?.(e, "dynamic")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "dynamic")}
        >
          <FontIcon aria-label={`dynamic`}>
            <BracketsCurlyRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
    </StyledMainToggleButtonGroup>
  );
});

const ScreenplayToolbar = React.memo((props: ToolbarProps): JSX.Element => {
  const { onPointerEnter, onPointerLeave, onPointerDown, onChange } = props;
  return (
    <StyledMainToggleButtonGroup
      size="small"
      exclusive
      onPointerDown={onPointerDown}
      onChange={onChange}
    >
      <Tooltip title="section" placement="top" arrow>
        <StyledMainToggleButton
          value="section"
          aria-label="section"
          onPointerEnter={(e): void => onPointerEnter?.(e, "section")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "section")}
        >
          <FontIcon aria-label={`section`}>
            <HashtagRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="scene" placement="top" arrow>
        <StyledMainToggleButton
          value="scene"
          aria-label="scene"
          onPointerEnter={(e): void => onPointerEnter?.(e, "scene")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "scene")}
        >
          <FontIcon aria-label={`scene`}>
            <HouseRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="dialogue" placement="top" arrow>
        <StyledMainToggleButton
          value="dialogue"
          aria-label="dialogue"
          onPointerEnter={(e): void => onPointerEnter?.(e, "dialogue")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "dialogue")}
        >
          <FontIcon aria-label={`dialogue`}>
            <MessageDotsRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="parenthetical" placement="top" arrow>
        <StyledMainToggleButton
          value="parenthetical"
          aria-label="parenthetical"
          onPointerEnter={(e): void => onPointerEnter?.(e, "parenthetical")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "parenthetical")}
        >
          <FontIcon aria-label={`parenthetical`}>
            <BracketsRoundRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="transition" placement="top" arrow>
        <StyledMainToggleButton
          value="transition"
          aria-label="transition"
          onPointerEnter={(e): void => onPointerEnter?.(e, "transition")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "transition")}
        >
          <FontIcon aria-label={`transition`}>
            <FilmRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
    </StyledMainToggleButtonGroup>
  );
});

const WorldToolbar = React.memo((props: ToolbarProps): JSX.Element => {
  const { onPointerEnter, onPointerLeave, onPointerDown, onChange } = props;
  return (
    <StyledMainToggleButtonGroup
      size="small"
      exclusive
      onPointerDown={onPointerDown}
      onChange={onChange}
    >
      <Tooltip title="show image" placement="top" arrow>
        <StyledMainToggleButton
          value="image"
          aria-label="image"
          onPointerEnter={(e): void => onPointerEnter?.(e, "image")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "image")}
        >
          <FontIcon aria-label={`image`}>
            <ImageUserRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="play audio" placement="top" arrow>
        <StyledMainToggleButton
          value="audio"
          aria-label="audio"
          onPointerEnter={(e): void => onPointerEnter?.(e, "audio")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "audio")}
        >
          <FontIcon aria-label={`audio`}>
            <VolumeRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="spawn entity" placement="top" arrow>
        <StyledMainToggleButton
          value="spawn"
          aria-label="spawn"
          onPointerEnter={(e): void => onPointerEnter?.(e, "spawn")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "spawn")}
        >
          <FontIcon aria-label={`spawn`}>
            <CirclePlusRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="destroy entity" placement="top" arrow>
        <StyledMainToggleButton
          value="destroy"
          aria-label="destroy"
          onPointerEnter={(e): void => onPointerEnter?.(e, "destroy")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "destroy")}
        >
          <FontIcon aria-label={`destroy`}>
            <CircleXRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="move entity" placement="top" arrow>
        <StyledMainToggleButton
          value="move"
          aria-label="move"
          onPointerEnter={(e): void => onPointerEnter?.(e, "move")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "move")}
        >
          <FontIcon aria-label={`move`}>
            <ArrowUpLeftFromCircleRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
    </StyledMainToggleButtonGroup>
  );
});

const FlowToolbar = React.memo((props: ToolbarProps): JSX.Element => {
  const { onPointerEnter, onPointerLeave, onPointerDown, onChange } = props;
  return (
    <StyledMainToggleButtonGroup
      size="small"
      exclusive
      onPointerDown={onPointerDown}
      onChange={onChange}
    >
      <Tooltip title="choice" placement="top" arrow>
        <StyledMainToggleButton
          value="choice"
          aria-label="choice"
          onPointerEnter={(e): void => onPointerEnter?.(e, "choice")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "choice")}
        >
          <FontIcon aria-label={`choice`}>
            <TableListRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="condition" placement="top" arrow>
        <StyledMainToggleButton
          value="condition"
          aria-label="condition"
          onPointerEnter={(e): void => onPointerEnter?.(e, "condition")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "condition")}
        >
          <FontIcon aria-label={`condition`}>
            <ListCheckRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="go" placement="top" arrow>
        <StyledMainToggleButton
          value="go"
          aria-label="go"
          onPointerEnter={(e): void => onPointerEnter?.(e, "go")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "go")}
        >
          <FontIcon aria-label={`go`}>
            <ArrowRightToBracketRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="return" placement="top" arrow>
        <StyledMainToggleButton
          value="return"
          aria-label="return"
          onPointerEnter={(e): void => onPointerEnter?.(e, "return")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "return")}
        >
          <FontIcon aria-label={`return`} style={{ transform: "scaleX(-1)" }}>
            <ShareFromSquareBracketRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="repeat" placement="top" arrow>
        <StyledMainToggleButton
          value="repeat"
          aria-label="repeat"
          onPointerEnter={(e): void => onPointerEnter?.(e, "repeat")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "repeat")}
        >
          <FontIcon aria-label={`repeat`}>
            <ArrowUpToLineRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
    </StyledMainToggleButtonGroup>
  );
});

const DataToolbar = React.memo((props: ToolbarProps): JSX.Element => {
  const { onPointerEnter, onPointerLeave, onPointerDown, onChange } = props;
  return (
    <StyledMainToggleButtonGroup
      size="small"
      exclusive
      onPointerDown={onPointerDown}
      onChange={onChange}
    >
      <Tooltip title="declare variable" placement="top" arrow>
        <StyledMainToggleButton
          value="declare_variable"
          aria-label="variable"
          onPointerEnter={(e): void => onPointerEnter?.(e, "declare_variable")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "declare_variable")}
        >
          <FontIcon aria-label={`declare variable`}>{`𝑥`}</FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="assign variable" placement="top" arrow>
        <StyledMainToggleButton
          value="assign_variable"
          aria-label="assign"
          onPointerEnter={(e): void => onPointerEnter?.(e, "assign_variable")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "assign_variable")}
        >
          <FontIcon aria-label={`assign variable`}>{`=`}</FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="declare tag" placement="top" arrow>
        <StyledMainToggleButton
          value="declare_tag"
          aria-label="tag"
          onPointerEnter={(e): void => onPointerEnter?.(e, "declare_tag")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "declare_tag")}
        >
          <FontIcon aria-label={`declare tag`}>{`𝑡`}</FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="declare image" placement="top" arrow>
        <StyledMainToggleButton
          value="declare_image"
          aria-label="image"
          onPointerEnter={(e): void => onPointerEnter?.(e, "declare_image")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "declare_image")}
        >
          <FontIcon aria-label={`declare image`}>
            <FileImageRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="declare audio" placement="top" arrow>
        <StyledMainToggleButton
          value="declare_audio"
          aria-label="audio"
          onPointerEnter={(e): void => onPointerEnter?.(e, "declare_audio")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "declare_audio")}
        >
          <FontIcon aria-label={`declare audio`}>
            <FileAudioRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
    </StyledMainToggleButtonGroup>
  );
});

const EntityToolbar = React.memo((props: ToolbarProps): JSX.Element => {
  const { onPointerEnter, onPointerLeave, onPointerDown, onChange } = props;
  return (
    <StyledMainToggleButtonGroup
      size="small"
      exclusive
      onPointerDown={onPointerDown}
      onChange={onChange}
    >
      <Tooltip title="list" placement="top" arrow>
        <StyledMainToggleButton
          value="list"
          aria-label="list"
          onPointerEnter={(e): void => onPointerEnter?.(e, "list")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "list")}
        >
          <FontIcon aria-label={`list`}>
            <ListOlRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="map" placement="top" arrow>
        <StyledMainToggleButton
          value="map"
          aria-label="map"
          onPointerEnter={(e): void => onPointerEnter?.(e, "map")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "map")}
        >
          <FontIcon aria-label={`map`}>
            <ListUlRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="ui" placement="top" arrow>
        <StyledMainToggleButton
          value="ui"
          aria-label="ui"
          onPointerEnter={(e): void => onPointerEnter?.(e, "ui")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "ui")}
        >
          <FontIcon aria-label={`ui`}>
            <ListTreeRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="style" placement="top" arrow>
        <StyledMainToggleButton
          value="style"
          aria-label="style"
          onPointerEnter={(e): void => onPointerEnter?.(e, "style")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "style")}
        >
          <FontIcon aria-label={`style`}>
            <ListUlRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
      <Tooltip title="config" placement="top" arrow>
        <StyledMainToggleButton
          value="config"
          aria-label="config"
          onPointerEnter={(e): void => onPointerEnter?.(e, "config")}
          onPointerLeave={(e): void => onPointerLeave?.(e, "config")}
        >
          <FontIcon aria-label={`config`}>
            <BarsStaggeredRegularIcon />
          </FontIcon>
        </StyledMainToggleButton>
      </Tooltip>
    </StyledMainToggleButtonGroup>
  );
});

interface CategoryToolbarProps {
  type: string;
  onPointerEnter?: (e: React.MouseEvent, value: string) => void;
  onPointerLeave?: (e: React.MouseEvent, value: string) => void;
  onPointerDown?: (e: React.MouseEvent) => void;
  onChange?: (e: React.MouseEvent, value: string) => void;
}

const CategoryToolbar = React.memo(
  (props: CategoryToolbarProps): JSX.Element => {
    const { type, onPointerEnter, onPointerLeave, onPointerDown, onChange } =
      props;
    if (type === "screenplay") {
      return (
        <ScreenplayToolbar
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onPointerDown={onPointerDown}
          onChange={onChange}
        />
      );
    }
    if (type === "world") {
      return (
        <WorldToolbar
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onPointerDown={onPointerDown}
          onChange={onChange}
        />
      );
    }
    if (type === "flow") {
      return (
        <FlowToolbar
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onPointerDown={onPointerDown}
          onChange={onChange}
        />
      );
    }
    if (type === "data") {
      return (
        <DataToolbar
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onPointerDown={onPointerDown}
          onChange={onChange}
        />
      );
    }
    if (type === "entity") {
      return (
        <EntityToolbar
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onPointerDown={onPointerDown}
          onChange={onChange}
        />
      );
    }
    return null;
  }
);

const SnippetToolbar = React.memo((): JSX.Element => {
  const [state, dispatch] = useContext(ProjectEngineContext);
  const windowType = state?.window?.type;
  const selected = state?.panel?.panels?.[windowType]?.editorState?.selected;
  const snippet = state?.panel?.panels?.[windowType]?.editorState?.snippet;
  const category =
    state?.panel?.panels?.[windowType]?.editorCategory || "screenplay";

  const [anchorEl, setAnchorEl] = useState(null);
  const canCloseRef = useRef(false);
  const buttonAreaRef = useRef<HTMLDivElement>();

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
  const handlePointerEnterGroup = useCallback(
    (e: React.MouseEvent, value: string): void => {
      dispatch(panelSnippetPreview(windowType, value));
    },
    [dispatch, windowType]
  );
  const handlePointerDownGroup = useCallback(
    (e: React.MouseEvent): void => {
      handleRestoreFocus(e);
    },
    [handleRestoreFocus]
  );
  const handleChangeGroup = useCallback(
    (e: React.MouseEvent, value: string): void => {
      dispatch(panelSnippetPreview(windowType, ""));
      handleRestoreFocus(e);
      const editorChange = {
        category,
        action: value,
      };
      dispatch(panelChangeEditorState(windowType, editorChange));
    },
    [category, dispatch, handleRestoreFocus, windowType]
  );

  const inlineFormatting = !snippet && selected;

  useEffect(() => {
    const onPointerOver = (e: PointerEvent): void => {
      const isDescendant = (el: HTMLElement, target: HTMLElement): boolean => {
        if (target !== null) {
          return el === target || isDescendant(el, target.parentElement);
        }
        return false;
      };
      if (!isDescendant(buttonAreaRef.current, e.target as HTMLElement)) {
        dispatch(panelSnippetPreview(windowType, ""));
      }
    };
    document.documentElement.addEventListener("pointerover", onPointerOver);
    return (): void => {
      document.documentElement.removeEventListener(
        "pointerover",
        onPointerOver
      );
    };
  }, [dispatch, windowType]);

  return (
    <StyledSnippetToolbar
      className="snippet-toolbar"
      onPointerDown={handlePointerDownBackground}
    >
      <StyledSnippetContent>
        {!inlineFormatting && (
          <>
            <Tooltip title={`${category} snippets`} placement="top" arrow>
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
            </Tooltip>
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
        <StyledButtonArea ref={buttonAreaRef}>
          {inlineFormatting ? (
            <FormattingToolbar
              onPointerDown={handlePointerDownGroup}
              onChange={handleChangeGroup}
            />
          ) : (
            <CategoryToolbar
              type={category}
              onPointerEnter={handlePointerEnterGroup}
              onPointerDown={handlePointerDownGroup}
              onChange={handleChangeGroup}
            />
          )}
        </StyledButtonArea>
      </StyledSnippetContent>
    </StyledSnippetToolbar>
  );
});

export default SnippetToolbar;
