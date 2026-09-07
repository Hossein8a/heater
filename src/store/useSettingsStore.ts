// src/store/useSettingsStore.ts
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — App Settings Store (persist روی AsyncStorage)
// فقط ترجیحات کاربر؛ سقف‌های سخت ایمنی (۴۵° / ۱۲۰ دقیقه) اینجا قابل تغییر
// نیستند — آن‌ها ثابت‌های SafetyGuardService هستند.
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { safeAsyncStorage } from './safeAsyncStorage';

export interface SettingsState {
  // زبان برنامه — ذخیره خودکار روی AsyncStorage
  language: 'fa' | 'en';

  // نوتیفیکیشن‌ها
  notificationsEnabled: boolean;
  lowBatteryAlert: boolean;
  disconnectAlert: boolean;
  // هشدارهای ایمنی همیشه روشن‌اند (غیرقابل خاموش کردن توسط کاربر)
  safetyAlerts: true;

  // آستانه‌ی هشدار باتری کم (٪) — 15 | 20 | 25
  lowBatteryThreshold: number;

  // اتصال
  autoReconnect: boolean;
  scanTimeoutSec: 10 | 30 | 60;

  // حس لمسی
  vibrationFeedback: boolean;

  setSettings: (patch: Partial<Omit<SettingsState, 'setSettings' | 'safetyAlerts'>>) => void;
  setLanguage: (lang: 'fa' | 'en') => void;
  resetSettings: () => void;
}

const DEFAULTS = {
  language: 'fa' as 'fa' | 'en',
  notificationsEnabled: true,
  lowBatteryAlert: true,
  disconnectAlert: true,
  safetyAlerts: true as const,
  lowBatteryThreshold: 20,
  autoReconnect: true,
  scanTimeoutSec: 30 as 10 | 30 | 60,
  vibrationFeedback: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setSettings: (patch) => set(patch),

      setLanguage: (lang) => set({ language: lang }),

      resetSettings: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'resana-amud-settings',
      storage: createJSONStorage(() => safeAsyncStorage),
      // سازگاری با نسخه‌های قبلی: اگر language در داده‌ی ذخیره‌شده نبود، پیش‌فرض فارسی
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          language: (p.language ?? 'fa') as 'fa' | 'en',
        };
      },
      // فقط داده‌ها ذخیره شوند، نه توابع اکشن
      partialize: (s) => ({
        language: s.language,
        notificationsEnabled: s.notificationsEnabled,
        lowBatteryAlert: s.lowBatteryAlert,
        disconnectAlert: s.disconnectAlert,
        safetyAlerts: s.safetyAlerts,
        lowBatteryThreshold: s.lowBatteryThreshold,
        autoReconnect: s.autoReconnect,
        scanTimeoutSec: s.scanTimeoutSec,
        vibrationFeedback: s.vibrationFeedback,
      }),
    },
  ),
);
