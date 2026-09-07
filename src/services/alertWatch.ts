// src/services/alertWatch.ts
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — Watchdog ایمنی
// هر ۱۰ ثانیه وضعیت را چک می‌کند:
//   · گرمایش پیوسته از ۱۲۰ دقیقه گذشت → خاموشی اجباری + هشدار ایمنی
//     (هشدارهای ایمنی غیرقابل خاموشی‌اند — طبق مستند)
// ─────────────────────────────────────────────────────────────────────────────
import { ShoeDevice } from '../ble/ShoeDevice';
import { useConnectionStore } from '../store/useConnectionStore';
import { useHeatStore } from '../store/useHeatStore';
import type { ShoeSide } from '../types';
import { notifySafety } from './notificationService';
import { isOverHeatingCap } from './SafetyGuardService';

const CHECK_INTERVAL_MS = 10000;

const SIDE_FA: Record<ShoeSide, string> = { left: 'چپ', right: 'راست' };
const fired = { left: false, right: false };

function check(): void {
  const conn = useConnectionStore.getState();
  (['left', 'right'] as const).forEach((side) => {
    const c = conn[side];
    if (c.heatingStartedAt == null) {
      fired[side] = false;
      return;
    }
    if (!fired[side] && isOverHeatingCap(c.heatingStartedAt)) {
      fired[side] = true;
      // خاموشی اجباری این سمت
      useHeatStore.getState().setMode(side, 'off');
      void ShoeDevice.pushHeatState(side);
      notifySafety(`گرمایش پیوسته‌ی کفش ${SIDE_FA[side]} به سقف ۱۲۰ دقیقه رسید — خاموشی اجباری انجام شد.`);
    }
  });
}

/** شروع watchdog — مقدار بازگشتی تابع توقف است */
export function startAlertWatch(): () => void {
  const id = setInterval(check, CHECK_INTERVAL_MS);
  return () => clearInterval(id);
}