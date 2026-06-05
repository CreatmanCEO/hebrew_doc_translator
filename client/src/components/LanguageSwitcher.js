import React from 'react';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useUiLang } from '../i18n';

const LANGS = [['he', 'עב'], ['en', 'EN'], ['ru', 'RU']];

export default function LanguageSwitcher() {
  const { uiLang, setUiLang } = useUiLang();
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={uiLang}
      onChange={(_, v) => v && setUiLang(v)}
      aria-label="interface language"
    >
      {LANGS.map(([code, label]) => (
        <ToggleButton key={code} value={code} aria-label={code}>
          {label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
