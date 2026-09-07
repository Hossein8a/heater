// src/store/useHeatStore.ts
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — Heat Store (persist روی AsyncStorage)
// وضعیت گرمایش هر کفش: مد، دمای هدف و پارامترهای اختیاری مد.
// همه‌ی مقادیر خروجی از فیلترهای SafetyGuardService عبور می‌کنند —
// سقف‌های سخت (۴۵° / ۱۲۰ دقیقه) اینجا غیرقابل دورزدن هستند.
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { clampTargetTemp, clampTimerMin } from '../services/SafetyGuardService';
import type { HeatMode, HeatScope, ShoeSide } from '../types';
import { safeAsyncStorage } from './safeAsyncStorage';

export interface SideHeat {
  mode: HeatMode;
  targetTempC: number;
  /** فقط برای مد timer — دقیقه */
  timerMin: number;
  /** فقط برای مد stepped — تعداد مراحل */
  steppedCount: number;
}

interface HeatState {
  left: SideHeat;
  right: SideHeat;

  setMode: (scope: HeatScope, mode: HeatMode) => void;
  setTargetTemp: (scope: HeatScope, targetTempC: number) => void;
  setTimerMin: (scope: HeatScope, timerMin: number) => void;
  setSteppedCount: (scope: HeatScope, steppedCount: number) => void;
}

const SIDES: ShoeSide[] = ['left', 'right'];

const DEFAULT_SIDE: SideHeat = {
  mode: 'off',
  targetTempC: 38,
  timerMin: 60,
  steppedCount: 3,
};

const DEFAULTS: Record<ShoeSide, SideHeat> = { left: { ...DEFAULT_SIDE }, right: { ...DEFAULT_SIDE } };

const sidesOf = (scope: HeatScope): ShoeSide[] => (scope === 'both' ? SIDES : [scope]);

export const useHeatStore = create<HeatState>()(
  persist(
    (set) => ({
      left: { ...DEFAULT_SIDE },
      right: { ...DEFAULT_SIDE },

      setMode: (scope, mode) =>
        set((s) => {
          const next = { ...s };
          sidesOf(scope).forEach((side) => {
            next[side] = { ...s[side], mode };
          });
          return next;
        }),

      setTargetTemp: (scope, targetTempC) => {
        const v = clampTargetTemp(targetTempC);
        set((s) => {
          const next = { ...s };
          sidesOf(scope).forEach((side) => {
            next[side] = { ...s[side], targetTempC: v };
          });
          return next;
        });
      },

      setTimerMin: (scope, timerMin) => {
        const v = clampTimerMin(timerMin);
        set((s) => {
          const next = { ...s };
          sidesOf(scope).forEach((side) => {
            next[side] = { ...s[side], timerMin: v };
          });
          return next;
        });
      },

      setSteppedCount: (scope, steppedCount) =>
        set((s) => {
          const v = Math.min(4, Math.max(2, Math.round(steppedCount)));
          const next = { ...s };
          sidesOf(scope).forEach((side) => {
            next[side] = { ...s[side], steppedCount: v };
          });
          return next;
        }),
    }),
    {
      name: 'resana-amud-heat',
      storage: createJSONStorage(() => safeAsyncStorage),
      partialize: (s) => ({ left: s.left, right: s.right }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Record<ShoeSide, SideHeat>>;
        return {
          ...current,
          left: { ...DEFAULTS.left, ...(p.left ?? {}) },
          right: { ...DEFAULTS.right, ...(p.right ?? {}) },
        };
      },
    },
  ),
);