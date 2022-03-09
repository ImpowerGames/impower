import "@emotion/styled";
import { Theme as MaterialTheme } from "@material-ui/core/styles";

export interface StyledTheme {
  space: {
    panelLeft: number;
    reorderableTop: number;
    reorderableBottom: number;
    reorderableContentLeft: number;
    reorderableContentRight: number;
    reorderableText: number;
    renameContentTop: number;
  };

  minWidth: {
    dataButton: string;
    dataField: string;
    panel: string;
    headerIcon: string;
    navigationBar: string;
  };

  minHeight: {
    dataButton: string;
    dataField: string;
    panel: string;
    panelHeader: string;
    panelHeaderTitle: string;
    navigationBar: string;
    navigationTabs: string;
    filterToolbar: string;
    titleBar: string;
  };

  transitionDuration: {
    fast: string;
    medium: string;
    slow: string;
    extraSlow: string;
  };

  fontFamily: {
    main: string;
    monospace: string;
    monospaceSans: string;
    title: string;
  };

  fontWeight: {
    normal: number;
    medium: number;
    semiBold: number;
    bold: number;
    extraBold: number;
  };

  fontSize: {
    heading: string;
    small: string;
    regular: string;
    large: string;
    icon: string;
    smallIcon: string;
    smallerIcon: string;
    headerIcon: string;
    optionIcon: string;
    moreIcon: string;
    addRemoveIcon: string;
    adornmentIcon: string;
    navdrawerIcon: string;
    navbarText: string;
    fabIcon: string;
    initials: string;
    title: string;
    sectionHeading: string;
  };

  borderRadius: {
    topTab: string;
    bottomTab: string;
    leftTab: string;
    rightTab: string;
    box: string;
    pill: string;
    field: string;
    info: string;
  };

  border: {
    tab: string;
    navbar: string;
    selected: string;
  };

  dropShadow: {
    normal: string;
    selected: string;
  };

  boxShadow: {
    panel: string;
    normal: string;
    selected: string;
    multiDragging: string;
    top: string;
    bottom: string;
    inset: string;
    bottomInset: string;
    rightInset: string;
  };

  colors: {
    shadow: string;
    lightHover: string;
    darkHover: string;
    focus: string;
    selected: string;
    executed: string;
    satisfied: string;
    unsatisfied: string;
    set: string;
    kudo: string;
    connect: string;
    contribute: string;
    like: string;
    dislike: string;
    black00: string;
    black01: string;
    black02: string;
    black03: string;
    black04: string;
    black05: string;
    black10: string;
    black15: string;
    black20: string;
    black25: string;
    black30: string;
    black35: string;
    black40: string;
    black50: string;
    black60: string;
    black70: string;
    black80: string;
    black85: string;
    black90: string;
    black95: string;
    white00: string;
    white01: string;
    white02: string;
    white03: string;
    white04: string;
    white05: string;
    white10: string;
    white15: string;
    white20: string;
    white25: string;
    white30: string;
    white40: string;
    white50: string;
    white60: string;
    white70: string;
    white80: string;
    white85: string;
    white90: string;
    white95: string;

    darkForeground: string;
    lightForeground: string;
    darkForegroundText: string;
    lightForegroundText: string;

    container: string;
    item: string;

    darkHeaderText: string;
    lightHeaderText: string;

    darkText: string;
    lightText: string;

    selectedElement: string;
    selectedDarkText: string;
    selectedLightText: string;

    panelbarOnIcon: string;
    panelbarOffIcon: string;
    navbar: string;
    navbarOnContent: string;
    navbarOffContent: string;

    defaultToggle: string;

    grid: string;

    hoverLightOverlay: string;
    hoverDarkOverlay: string;

    subtitle: string;
    nodeLink: string;
    offwhite: string;
    lightGray: string;
  };
}

declare module "@material-ui/core/styles/createTheme" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Theme extends EmotionTheme {}
}

declare module "@emotion/react" {
  export interface Theme extends MaterialTheme, StyledTheme {}
}
