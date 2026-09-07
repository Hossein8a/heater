// src/i18n/use-i18n.ts
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — useI18n hook
// زبان فعلی از useSettingsStore (persist) می‌آید و با setLanguage ذخیره می‌شود.
import { useCallback } from 'react';

import { useSettingsStore } from '@/store/useSettingsStore';
import { STRINGS, TKey } from './strings';

export function useI18n() {
  const lang = useSettingsStore((s) => s.language);
  const setLang = useSettingsStore((s) => s.setLanguage);

  const t = useCallback((key: TKey) => STRINGS[lang][key] ?? STRINGS.en[key], [lang]);

  const toggleLang = useCallback(() => {
    setLang(lang === 'fa' ? 'en' : 'fa');
  }, [lang, setLang]);

  return {
    lang,
    t,
    setLang,
    toggleLang,
    isFa: lang === 'fa',
  };
}