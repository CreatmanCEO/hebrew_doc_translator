import { createTheme } from '@mui/material/styles';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

export function makeTheme(direction = 'ltr') {
  return createTheme({
    direction,
    palette: {
      mode: 'light',
      primary: { main: '#4F46E5' },
      background: { default: '#F7F8FA', paper: '#FFFFFF' },
      text: { primary: '#1A1A1A', secondary: '#5A5A6A' },
    },
    shape: { borderRadius: 14 },
    typography: {
      fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    },
    components: {
      MuiPaper: { styleOverrides: { root: { boxShadow: '0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.04)' } } },
      MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    },
  });
}
