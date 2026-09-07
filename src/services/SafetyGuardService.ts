// src/services/SafetyGuardService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — سرویس ایمنی (سقف‌های سخت)
//
// طبق مستند، این سقف‌ها توسط کاربر قابل تغییر/خاموشی نیستند:
//   · دمای هدف: ۲۰ تا ۴۵ درجه‌ی سانتی‌گراد
//   · گرمایش پیوسته: حداکثر ۱۲۰ دقیقه (سپس خاموشی اجباری + هشدار)
//   · هشدارهای ایمنی همیشه فعال (safetyAlerts در store فقط true است)
// ─────────────────────────────────────────────────────────────────────────────

export const SAFETY = {
  TEMP_MIN: 20,
  TEMP_MAX: 45, // سقف سخت دما (°C)
  TIMER_MAX_MIN: 120, // سقف سخت گرمایش پیوسته (دقیقه)
  BATTERY_ABS_MIN: 4, // زیر این درصد فریمور خودش قطع می‌کند (٪)
  COMFORT_LO: 36,
  COMFORT_HI: 40,
} as const;

/** محدودکردن دمای هدف به بازه‌ی مجاز ایمنی — قبل از هر ارسال به دستگاه */
export function clampTargetTemp(t: number): number {
  if (!Number.isFinite(t)) return SAFETY.TEMP_MIN;
  return Math.min(SAFETY.TEMP_MAX, Math.max(SAFETY.TEMP_MIN, Math.round(t)));
}

/** محدودکردن مدت تایمر به سقف ۱۲۰ دقیقه */
export function clampTimerMin(m: number): number {
  if (!Number.isFinite(m) || m <= 0) return 30;
  return Math.min(SAFETY.TIMER_MAX_MIN, Math.round(m));
}

/** تخمین زمان رسیدن به دمای هدف — heuristic خطی (~۱.۱ درجه بر دقیقه) */
export function estimateEtaMinutes(current: number | null, target: number): number | null {
  if (current == null || current >= target) return null;
  const delta = target - current;
  return Math.max(1, Math.round(delta / 1.1));
}

/** بررسی عبور از آستانه‌ی باتری کم */
export function isBelowLowBattery(percent: number | null, threshold: number): boolean {
  return percent != null && percent > 0 && percent <= threshold;
}

/** دقیقه‌های گذشته از شروع گرمایش پیوسته */
export function continuousHeatingMinutes(heatingStartedAt: number | null, now: number = Date.now()): number {
  if (heatingStartedAt == null) return 0;
  return (now - heatingStartedAt) / 60000;
}

/** آیا گرمایش پیوسته از سقف مجاز گذشته است؟ */
export function isOverHeatingCap(heatingStartedAt: number | null, now: number = Date.now()): boolean {
  return continuousHeatingMinutes(heatingStartedAt, now) >= SAFETY.TIMER_MAX_MIN;
}