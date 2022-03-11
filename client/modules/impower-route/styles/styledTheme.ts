import {
  createTheme,
  responsiveFontSizes,
  Theme,
} from "@material-ui/core/styles";
import { Breakpoint } from "./breakpoint";
import { layout } from "./layout";
import { StyledTheme } from "./styled";

export const styledTheme: StyledTheme = {
  space: {
    panelLeft: 5,
    reorderableTop: 0.5,
    reorderableBottom: 0.5,
    reorderableContentLeft: 1,
    reorderableContentRight: 2,
    reorderableText: 2,
    renameContentTop: 3,
  },

  minWidth: {
    dataButton: `${layout.size.minWidth.dataButton}px`,
    dataField: `${layout.size.minWidth.dataField}px`,
    panel: `${layout.size.minWidth.panel}px`,
    headerIcon: `${layout.size.minWidth.headerIcon}px`,
    navigationBar: `${layout.size.minWidth.navigationBar}px`,
  },

  minHeight: {
    dataButton: `${layout.size.minHeight.dataButton}px`,
    dataField: `${layout.size.minWidth.dataField}px`,
    panel: `${layout.size.minHeight.panel}px`,
    panelHeader: `${layout.size.minHeight.panelHeader}px`,
    panelHeaderTitle: `${layout.size.minHeight.panelHeaderTitle}px`,
    navigationBar: `${layout.size.minHeight.navigationBar}px`,
    navigationTabs: `${layout.size.minHeight.navigationTabs}px`,
    filterToolbar: `${layout.size.minHeight.filterToolbar}px`,
    titleBar: `${layout.size.minHeight.titleBar}px`,
  },

  transitionDuration: {
    fast: "100ms",
    medium: "200ms",
    slow: "500ms",
    extraSlow: "1s",
  },

  fontWeight: {
    normal: 400,
    medium: 500,
    semiBold: 600,
    bold: 700,
    extraBold: 900,
  },

  fontFamily: {
    main: "Open Sans",
    monospace: "Courier Prime",
    monospaceSans: "Courier Prime Sans",
    title: "Roboto Slab",
  },

  fontSize: {
    heading: "0.9375rem",
    small: "0.75rem",
    regular: "0.9375rem",
    large: "1.125rem",
    icon: "1.5rem",
    smallIcon: "1.25rem",
    smallerIcon: "1.125rem",
    headerIcon: "1rem",
    optionIcon: "1.0625rem",
    addRemoveIcon: "0.9375rem",
    moreIcon: "	1.1875rem",
    adornmentIcon: "0.9375rem",
    navdrawerIcon: "1.125rem",
    navbarText: "0.75rem",
    fabIcon: "1.375rem",
    initials: "2rem",
    title: "2.25rem",
    sectionHeading: "1.5rem",
  },

  borderRadius: {
    topTab: "8px 8px 0 0",
    bottomTab: "0 0 8px 8px",
    leftTab: "8px 0 0 8px",
    rightTab: "8px 0 8px 0",
    box: "8px",
    pill: "64px",
    field: "8px",
    info: "16px",
  },

  border: {
    tab: "1px solid #FFFFFF0D",
    navbar: "1px solid #000000",
    selected: "4px solid #33CCFF",
  },

  dropShadow: {
    normal: "0 2px 2px #00000080",
    selected: "0 0 3px #33CCFF",
  },

  boxShadow: {
    panel: "4px 0 4px 4px #00000080",
    normal: "0 2px 4px 0 #00000080",
    selected: `inset 0px 0px 0px 4px #33CCFF`,
    multiDragging: `inset 0px 0px 0px 4px #33CCFF,
    0 1px 4px #00000080, 0 10px 0 -5px #33CCFF,
    0 10px 4px -4px #00000080, 0 20px 0 -10px #33CCFF`,
    top: "0 -2px 4px 0 #00000080",
    bottom: "0 2px 4px 0 #00000080",
    inset: "inset 0 2px 4px 0 #00000080",
    bottomInset: "inset 0 -7px 9px -7px #00000080",
    rightInset: "inset -7px 0 9px -7px #00000080",
  },

  colors: {
    shadow: "#00000080",
    lightHover: "#FFFFFF1A",
    darkHover: "#0000001A",
    focus: "#00000033",
    selected: "#33CCFF",
    executed: "#27e848",
    satisfied: "#27e848",
    unsatisfied: "#e82727",
    set: "#e8a127",
    kudo: "#ff492f",
    connect: "#00bf56",
    contribute: "#00bf56",
    like: "#27a7d8",
    dislike: "#ff9f0f",
    black00: "#00000000",
    black01: "#00000003",
    black02: "#00000005",
    black03: "#00000008",
    black04: "#0000000A",
    black05: "#0000000D",
    black10: "#0000001A",
    black15: "#00000026",
    black20: "#00000033",
    black25: "#00000040",
    black30: "#0000004D",
    black35: "#00000059",
    black40: "#00000066",
    black50: "#00000080",
    black60: "#00000099",
    black70: "#000000B3",
    black80: "#000000CC",
    black85: "#000000D9",
    black90: "#000000E6",
    black95: "#000000F2",
    white00: "#FFFFFF00",
    white01: "#FFFFFF03",
    white02: "#FFFFFF05",
    white03: "#FFFFFF08",
    white04: "#FFFFFF0A",
    white05: "#FFFFFF0D",
    white10: "#FFFFFF1A",
    white15: "#FFFFFF26",
    white20: "#FFFFFF33",
    white25: "#FFFFFF40",
    white30: "#FFFFFF4D",
    white40: "#FFFFFF66",
    white50: "#FFFFFF80",
    white60: "#FFFFFF99",
    white70: "#FFFFFFB3",
    white80: "#FFFFFFCC",
    white85: "#FFFFFFD9",
    white90: "#FFFFFFE6",
    white95: "#FFFFFFF2",

    darkForeground: "#001933",
    lightForeground: "#e8e9eb",
    darkForegroundText: "#D6E0EA",
    lightForegroundText: "#06476A",

    container: "#E2E5F0",
    item: "#F9FBFF",

    darkHeaderText: "#FFFFFFFF",
    lightHeaderText: "#053155",

    darkText: "#000000E6",
    lightText: "#798187",

    selectedDark: "#06476A",
    selectedLight: "#497B97",

    navbar: "#053155",
    navbarOnContent: "#FFFFFF",
    navbarOffContent: "#000000",
    panelbarOnIcon: "#D6E0EA",
    panelbarOffIcon: "#305B80",

    defaultToggle: "#888888",

    grid: "#081f39",

    hoverLightOverlay: "#FFFFFF0D",
    hoverDarkOverlay: "#00000014",

    subtitle: "#97A1A6",
    nodeLink: "#C8C8C8",
    offwhite: "#fafafa",
    lightGray: "#f5f5f5",
  },
};

const palette = {
  primary: {
    main: "#052d57",
  },
  secondary: {
    main: "#315881",
  },
};

const typography = {
  fontFamily: "Open Sans, Arial",
  fontWeightMedium: 600,
  button: { fontWeight: 600 },
};

const shape = {
  borderRadius: 8,
};

const mixins = {
  toolbar: {
    minHeight: 48,
  },
};

const breakpoints = {
  values: {
    xs: 0,
    sm: Breakpoint.sm,
    md: Breakpoint.md,
    lg: Breakpoint.lg,
    xl: Breakpoint.xl,
  },
};

export const theme = createTheme({
  breakpoints,
  palette,
  typography,
  shape,
  mixins,
});

export const materialLightTheme = createTheme({
  ...theme,
  components: {
    MuiIconButton: {
      styleOverrides: {
        root: {
          "padding": 8,
          "fontSize": styledTheme.fontSize.icon,
          "lineHeight": 1,
          "&:hover": {
            backgroundColor: "transparent",
          },
        },
        edgeStart: {
          marginLeft: -8,
        },
        edgeEnd: {
          marginRight: -8,
        },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          "&:hover": {
            backgroundColor: palette.secondary.main,
          },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          fontSize: styledTheme.fontSize.navdrawerIcon,
          lineHeight: 1,
        },
      },
    },
    MuiToolbar: {
      styleOverrides: {
        root: {
          alignItems: "stretch",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paperAnchorLeft: {
          minWidth: "300px",
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          letterSpacing: "0.015em",
          textTransform: "none",
          minWidth: 0,
          padding: 0,
          [theme.breakpoints.up("md")]: {
            padding: 0,
            minWidth: 0,
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 4,
          padding: 0,
          fontSize: "0.75rem",
        },
      },
    },
    MuiFilledInput: {
      styleOverrides: {
        root: {
          "backgroundColor": "rgba(5, 44, 85, 0.08)",
          "&:hover": {
            backgroundColor: "rgba(5, 44, 85, 0.13)",
          },
          "&$focused": {
            backgroundColor: "rgba(5, 44, 85, 0.08)",
          },
        },
      },
    },
    MuiTypography: {
      defaultProps: {
        variantMapping: {
          h1: "h1",
          h2: "h2",
          h3: "h2",
          h4: "h2",
          h5: "h2",
          h6: "h2",
          subtitle1: "h2",
          subtitle2: "h2",
        },
      },
    },
  },
  palette,
});

export const defaultTheme: Theme = {
  ...responsiveFontSizes(materialLightTheme),
  ...styledTheme,
};
