// src/store/useBatteryStore.ts
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — Battery Telemetry Store (persist روی AsyncStorage)
// تاریخچه‌ی ۲۴ ساعته‌ی باتری هر کفش + رخدادها (شارژ/باتری کم)
// · منبع ورودی: src/ble/ShoeDevice.ts → recordSample / recordEvent
// · مصرف‌کننده:  src/app/battery-history.tsx
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { BatteryEvent, ShoeSide } from '../types';
import { safeAsyncStorage } from './safeAsyncStorage';

/** حداکثر نمونه‌ها — نمونه‌گیری ~۱۰ دقیقه‌ای برای پوشش ۲۴ ساعت */
const MAX_HISTORY = 144;

interface SideBattery {
  history: number[]; // درصدها، قدیمی → جدید
  lastRecordedAt: number | null;
}

interface BatteryState {
  left: SideBattery;
  right: SideBattery;
  events: BatteryEvent[];

  /** ثبت نمونه‌ی جدید — اگر فاصله از نمونه‌ی قبلی کمتر از MIN_GAP باشد نادیده گرفته می‌شود */
  recordSample: (side: ShoeSide, percent: number) => void;
  recordEvent: (e: Omit<BatteryEvent, 'id'>) => void;
  clearHistory: (side?: ShoeSide) => void;
}

const MIN_GAP_MS = 5 * 60 * 1000; // حداقل فاصله‌ی ثبت نمونه: ۵ دقیقه

const genSeed = (seed: number, startPct: number, drainFactor: number): number[] => {
  const out: number[] = [];
  let v = startPct;
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < MAX_HISTORY; i++) {
    out.push(Math.round(v * 10) / 10);
    const drain = (0.055 + rnd() * 0.02) * drainFactor;
    v = Math.max(6, v - drain);
    // شبیه‌سازی داک شارژ نیمه‌شب
    if (i === MAX_HISTORY - 34) v = 100;
  }
  return out;
};

const SEED_LEFT = genSeed(1, 97, 0.9);
const SEED_RIGHT = genSeed(4, 93, 1.15);

const DEFAULT_EVENTS: BatteryEvent[] = [
  { id: 'ev-1', side: 'right', kind: 'low', time: '۰۷:۴۲', detail: 'باتری راست به زیر ۲۰٪ رسید — نوتیفیکیشن ارسال شد' },
  { id: 'ev-2', side: 'both', kind: 'charged', time: '۰۳:۱۰', detail: 'هر دو کفش روی داک قرار گرفتند — شارژ کامل شد' },
];

const EMPTY_SIDE: SideBattery = { history: [], lastRecordedAt: null };

export const useBatteryStore = create<BatteryState>()(
  persist(
    (set, get) => ({
      left: { history: [...SEED_LEFT], lastRecordedAt: null },
      right: { history: [...SEED_RIGHT], lastRecordedAt: null },
      events: DEFAULT_EVENTS,

      recordSample: (side, percent) => {
        const now = Date.now();
        const cur = get()[side];
        if (cur.lastRecordedAt != null && now - cur.lastRecordedAt < MIN_GAP_MS) return;
        const history = [...cur.history, Math.round(percent * 10) / 10];
        if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
        set({ [side]: { history, lastRecordedAt: now } } as unknown as Partial<BatteryState>);
      },

      recordEvent: (e) =>
        set((s) => ({
          events: [{ ...e, id: `ev-${Date.now().toString(36)}` }, ...s.events].slice(0, 50),
        })),

      clearHistory: (side) => {
        if (side == null) {
          set({ left: { ...EMPTY_SIDE }, right: { ...EMPTY_SIDE }, events: [] });
        } else {
          set({ [side]: { ...EMPTY_SIDE } } as unknown as Partial<BatteryState>);
        }
      },
    }),
    {
      name: 'resana-amud-battery',
      storage: createJSONStorage(() => safeAsyncStorage),
      partialize: (s) => ({ left: s.left, right: s.right, events: s.events }),
    },
  ),
);