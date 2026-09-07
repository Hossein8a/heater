// src/store/useScheduleStore.ts
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — Schedule & Profiles Store (persist روی AsyncStorage)
// · profiles + activeProfileId  → صفحه‌ی PROFILES
// · masterEnabled + entries     → صفحه‌ی SCHEDULE
// اعمال پروفایل روی کفش‌ها از طریق useHeatStore انجام می‌شود.
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { clampTargetTemp } from '../services/SafetyGuardService';
import type { HeatProfile, HeatScope, ScheduleEntry } from '../types';
import { safeAsyncStorage } from './safeAsyncStorage';
import { useHeatStore } from './useHeatStore';

interface ScheduleState {
  masterEnabled: boolean;
  entries: ScheduleEntry[];
  profiles: HeatProfile[];
  activeProfileId: string | null;

  setMasterEnabled: (v: boolean) => void;
  addEntry: (e: Omit<ScheduleEntry, 'id'>) => void;
  removeEntry: (id: string) => void;
  toggleEntry: (id: string, enabled: boolean) => void;

  addProfile: (p: Omit<HeatProfile, 'id'>) => string;
  removeProfile: (id: string) => void;
  setActiveProfile: (id: string | null) => void;
  /** اعمال پروفایل روی دامنه — مقدار بازگشتی false یعنی پروفایل وجود ندارد */
  applyProfile: (id: string, scope: HeatScope) => boolean;
}

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const DEFAULT_PROFILES: HeatProfile[] = [
  { id: 'prf-1', name: 'صبح زمستانی', icon: 'sunny-outline', tint: '#B0623A', mode: 'smart', targetTempC: 38 },
  { id: 'prf-2', name: 'خانه', icon: 'home-outline', tint: '#4A6B8A', mode: 'constant', targetTempC: 34 },
  { id: 'prf-3', name: 'بیرون سرما', icon: 'snow-outline', tint: '#5A7D9A', mode: 'stepped', targetTempC: 42 },
  { id: 'prf-4', name: 'ورزش', icon: 'fitness-outline', tint: '#7A5EA0', mode: 'activity', targetTempC: 36 },
];

const DEFAULT_ENTRIES: ScheduleEntry[] = [
  { id: 'sch-1', time: '06:30', days: [0, 1, 2, 3, 4], mode: 'smart', targetTempC: 38, enabled: true },
  { id: 'sch-2', time: '22:00', days: [6], mode: 'timer', targetTempC: 40, enabled: false },
];

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set, get) => ({
      masterEnabled: true,
      entries: DEFAULT_ENTRIES,
      profiles: DEFAULT_PROFILES,
      activeProfileId: 'prf-1',

      setMasterEnabled: (v) => set({ masterEnabled: v }),

      addEntry: (e) => set((s) => ({ entries: [...s.entries, { ...e, targetTempC: clampTargetTemp(e.targetTempC), id: uid('sch') }] })),

      removeEntry: (id) => set((s) => ({ entries: s.entries.filter((x) => x.id !== id) })),

      toggleEntry: (id, enabled) =>
        set((s) => ({ entries: s.entries.map((x) => (x.id === id ? { ...x, enabled } : x)) })),

      addProfile: (p) => {
        const id = uid('prf');
        set((s) => ({ profiles: [...s.profiles, { ...p, targetTempC: clampTargetTemp(p.targetTempC), id }] }));
        return id;
      },

      removeProfile: (id) =>
        set((s) => ({
          profiles: s.profiles.filter((p) => p.id !== id),
          activeProfileId: s.activeProfileId === id ? null : s.activeProfileId,
        })),

      setActiveProfile: (id) => set({ activeProfileId: id }),

      applyProfile: (id, scope) => {
        const p = get().profiles.find((x) => x.id === id);
        if (!p) return false;
        // اعمال واقعی روی store گرمایش
        useHeatStore.getState().setMode(scope, p.mode);
        useHeatStore.getState().setTargetTemp(scope, p.targetTempC);
        set({ activeProfileId: id });
        return true;
      },
    }),
    {
      name: 'resana-amud-schedule',
      storage: createJSONStorage(() => safeAsyncStorage),
      partialize: (s) => ({
        masterEnabled: s.masterEnabled,
        entries: s.entries,
        profiles: s.profiles,
        activeProfileId: s.activeProfileId,
      }),
    },
  ),
);