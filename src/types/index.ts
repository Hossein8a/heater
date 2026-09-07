// src/types/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — قراردادهای مشترک پروژه (عیناً طبق مستند)
// این فایل تنها مرجع تایپ‌های اشتراکی بین صفحات، store ها و لایه‌ی BLE است.
// ─────────────────────────────────────────────────────────────────────────────

/** سمت کفش */
export type ShoeSide = 'left' | 'right';

/** دامنه‌ی اعمال تنظیمات — هر دو کفش یا فقط یکی */
export type HeatScope = 'both' | ShoeSide;

/**
 * مد گرمایش — عیناً طبق مستند:
 *  · off       خاموش
 *  · constant  گرمایش ثابت
 *  · timer     گرمایش برای مدت مشخص (timerMin)
 *  · stepped   پله‌ای (steppedCount مرحله)
 *  · smart     هوشمند — تنظیم خودکار بر اساس دمای محیط/پروفایل
 *  · activity  ورزشی — پیش‌گرم و مدیریت دیوتی حین فعالیت
 */
export type HeatMode = 'off' | 'constant' | 'timer' | 'stepped' | 'smart' | 'activity';

/** وضعیت اتصال BLE */
export type ConnectionState =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'error';

/** وضعیت کامل یک کفش — خروجی useShoeSystem (ترکیب useConnectionStore + useHeatStore) */
export interface ShoeStatus {
  side: ShoeSide;
  deviceId: string | null;
  connectionState: ConnectionState;
  batteryPercent: number | null;
  currentTempC: number | null;
  targetTempC: number;
  mode: HeatMode;
  isHeating: boolean;
  lastSeenAt: number | null;
  errorMessage: string | null;
}

/** اطلاعات هویتی/تله‌متری یک دستگاه متصل */
export interface DeviceInfo {
  deviceId: string;
  firmware: string;
  rssi: number;
  batteryPercent: number;
  lastSeenSecAgo: number;
  connectionState: 'connected' | 'disconnected' | 'connecting' | 'error';
}

/** پروفایل گرمایش ذخیره‌شده‌ی کاربر */
export interface HeatProfile {
  id: string;
  name: string;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  tint: string;
  mode: HeatMode;
  targetTempC: number;
}

/** یک رخداد زمان‌بندی — 0 = شنبه (ترتیب ایرانی) */
export interface ScheduleEntry {
  id: string;
  time: string; // "HH:MM" 24h
  days: number[]; // 0..6
  mode: HeatMode;
  targetTempC: number;
  enabled: boolean;
}

/** رخداد باتری برای صفحه‌ی تاریخچه */
export interface BatteryEvent {
  id: string;
  side: 'left' | 'right' | 'both';
  kind: 'low' | 'charged' | 'swap';
  time: string;
  detail: string;
}