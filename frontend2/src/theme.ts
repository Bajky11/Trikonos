import { alpha, createTheme } from "@mui/material/styles";

declare module "@mui/material/Paper" {
  interface PaperPropsVariantOverrides {
    orderSection: true;
    orderReceipt: true;
  }
}

// All brand decisions live here. CSS uses these same tokens through CssBaseline.
export const colors = {
  paper: "#f6f3ea",
  fir: "#0e584d",
  ink: "#252b28",
  ochre: "#c98a3a",
  surface: "#fbfaf6",
  muted: "#626e67",
  sage: "#e8eee6",
  sand: "#dec69d",
  dark: "#102f2a",
  error: "#943e39",
};
const heading = { fontFamily: "Manrope, sans-serif", fontWeight: 700, letterSpacing: "-.04em" };

export const theme = createTheme({
  palette: {
    primary: { main: colors.fir },
    secondary: { main: colors.ochre },
    background: { default: colors.paper, paper: colors.surface },
    text: { primary: colors.ink, secondary: colors.muted },
    divider: alpha(colors.fir, 0.19),
    error: { main: colors.error },
  },
  shape: { borderRadius: 0 },
  typography: {
    fontFamily: '"DM Sans", sans-serif',
    fontSize: 14,
    h1: { ...heading, fontWeight: 800, fontSize: 52, lineHeight: 1.1 },
    h2: { ...heading, fontSize: 42, lineHeight: 1.15, letterSpacing: "-.05em" },
    h3: { ...heading, fontSize: 24, lineHeight: 1.3 },
    h4: { ...heading, fontSize: 20, lineHeight: 1.3 },
    button: { textTransform: "none", fontWeight: 600, letterSpacing: 0 },
    overline: { fontSize: 12, fontWeight: 800, letterSpacing: ".15em", lineHeight: 1.5 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ":root": Object.fromEntries(
          Object.entries(colors).map(([key, value]) => [`--${key}`, value]),
        ),
        html: { scrollBehavior: "smooth", scrollPaddingTop: 144 },
        body: { margin: 0, lineHeight: "normal" },
        a: { color: "inherit", textDecoration: "none" },
        "button, input, select": { font: "inherit" },
        "button, a, input, select, summary": {
          "&:focus-visible": { outline: `2px solid ${colors.ochre}`, outlineOffset: 4 },
        },
        "*": { boxSizing: "border-box" },
        "@media (prefers-reduced-motion: reduce)": {
          html: { scrollBehavior: "auto" },
          "*, *::before, *::after": { animation: "none !important", transition: "none !important" },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true, disableRipple: true },
      styleOverrides: {
        root: { minHeight: 44, padding: "10px 18px", lineHeight: 1.4, borderRadius: 0 },
        outlined: { borderColor: colors.fir },
        contained: { "&:hover": { backgroundColor: colors.dark } },
      },
    },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 0, color: colors.fir } } },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: "none",
          variants: [
            {
              props: { variant: "orderSection" },
              style: {
                display: "grid",
                gap: 18,
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                minWidth: 0,
                margin: 0,
                padding: "clamp(16px, 3vw, 28px)",
                border: `1px solid ${alpha(colors.fir, 0.14)}`,
                backgroundColor: colors.surface,
                "& > :is(h2, .MuiAlert-root, .MuiFormControlLabel-root, fieldset, p), &[data-optional] > *":
                  { gridColumn: "1 / -1" },
                "& .MuiRadioGroup-root .MuiFormControlLabel-root": {
                  minHeight: 44,
                  marginInline: 0,
                },
                "& .checkout-address": { border: 0, padding: 0, margin: 0 },
                "@media (max-width: 600px)": { gridTemplateColumns: "minmax(0, 1fr)" },
              },
            },
            {
              props: { variant: "orderReceipt" },
              style: {
                display: "grid",
                justifyItems: "start",
                gap: 16,
                maxWidth: 660,
                marginInline: "auto",
                padding: "clamp(22px, 5vw, 52px)",
                border: `1px solid ${alpha(colors.fir, 0.17)}`,
                backgroundColor: colors.surface,
                overflowWrap: "anywhere",
                "& > .MuiSvgIcon-root": {
                  fontSize: 40,
                  color: colors.fir,
                },
                "& > .MuiDivider-root": { width: "100%" },
                "& h1": { fontSize: "clamp(28px, 4vw, 42px)" },
              },
            },
          ],
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          border: `1px solid ${alpha(colors.fir, 0.25)}`,
          boxShadow: `0 24px 80px ${alpha(colors.dark, 0.2)}`,
        },
      },
    },
    MuiDialogTitle: { styleOverrides: { root: { ...heading, fontSize: 24 } } },
    MuiTextField: { defaultProps: { size: "small", variant: "outlined" } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { fontSize: 14, background: "transparent" },
        notchedOutline: { borderColor: alpha(colors.fir, 0.32) },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { padding: "14px 20px", borderBottomColor: alpha(colors.fir, 0.1), fontSize: 14 },
        head: {
          lineHeight: 1.5,
          color: colors.muted,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: ".04em",
          background: alpha(colors.fir, 0.015),
          fontWeight: 600,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { height: 27, borderRadius: 0, fontSize: 11, fontWeight: 600 },
        label: { paddingInline: 9 },
      },
    },
    MuiTabs: { styleOverrides: { root: { borderBottom: `1px solid ${alpha(colors.fir, 0.2)}` } } },
    MuiTab: {
      styleOverrides: {
        root: {
          padding: "10px 0",
          marginRight: 24,
          minWidth: 0,
          textTransform: "none",
          fontSize: 13,
        },
      },
    },
    MuiAccordion: {
      defaultProps: { disableGutters: true, elevation: 0 },
      styleOverrides: {
        root: {
          background: "transparent",
          borderTop: `1px solid ${alpha(colors.fir, 0.25)}`,
          "&:last-child": { borderBottom: `1px solid ${alpha(colors.fir, 0.25)}` },
          "&::before": { display: "none" },
        },
      },
    },
    MuiAccordionSummary: {
      styleOverrides: { root: { padding: 0, minHeight: 66 }, content: { margin: "18px 0" } },
    },
    MuiAccordionDetails: { styleOverrides: { root: { padding: "0 0 20px", lineHeight: 1.7 } } },
    MuiPaginationItem: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          minWidth: 42,
          height: 44,
          "&.Mui-selected": {
            background: colors.fir,
            color: colors.paper,
            "&:hover": { background: colors.dark },
          },
        },
      },
    },
  },
});

export const adminTheme = createTheme(theme, {
  components: {
    MuiOutlinedInput: {
      styleOverrides: { root: { minHeight: 44, minWidth: 0 } },
    },
    MuiFormControl: {
      styleOverrides: { root: { maxWidth: "100%" } },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { margin: "clamp(12px, 4vw, 32px)" },
        paperFullWidth: { width: "calc(100% - 2 * clamp(12px, 4vw, 32px))" },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          paddingInline: "clamp(16px, 4vw, 24px)",
          ".MuiDialogTitle-root + &": { paddingTop: 12 },
        },
      },
    },
    MuiDialogActions: {
      defaultProps: { disableSpacing: true },
      styleOverrides: {
        root: { padding: "12px clamp(16px, 4vw, 24px)", flexWrap: "wrap", gap: 8 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { paddingInline: "clamp(12px, 1.5vw, 20px)" },
      },
    },
  },
});
