// src/ble/protocol.ts
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — پروتکل BLE ماژول CH582M
//
// INTEGRATION POINT: UUID های سرویس/کاراکتریستیک عیناً از مستند فریمور CH582M
// جایگزین شوند. قرارداد payload فعلی JSON بر بستر UART سرویس BLE است؛ اگر
// فریمور باینری است فقط encodeCommand/decodeStatus را عوض کنید — بقیه‌ی کد
// دست‌نخورده می‌ماند.
// ─────────────────────────────────────────────────────────────────────────────

/** سرویس اصلی گرمایش (UART-transparent — Nordic style) */
export const QARTAL_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

/** کاراکتریستیک فرمان (Write / Write-Without-Response) */
export const QARTAL_CMD_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

/** کاراکتریستیک وضعیت (Notify — دمای فعلی، باتری، وضعیت هتر) */
export const QARTAL_STATUS_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

/** پیشوند نام تبلیغ‌شده‌ی دستگاه‌ها در advertisement */
export const DEVICE_NAME_PREFIX = 'RESANA-';

/** الگوی نام دستگاه — پسوند سمت: «-L-» یا «-L$» (طبق مستند) */
export const DEVICE_NAME_PATTERN = /^RESANA-(L|R)-([0-9A-F]{4})$/i;

/** تشخیص سمت از نام دستگاه — عیناً قرارداد مستند */
export function parseSide(name: string): 'left' | 'right' | null {
  if (/-L-/i.test(name) || /-L$/i.test(name)) return 'left';
  if (/-R-/i.test(name) || /-R$/i.test(name)) return 'right';
  return null;
}

/** فرمان‌های مجاز به فریمور */
export type BleCommand =
  | { type: 'setHeat'; mode: string; targetTempC: number; timerMin?: number; steppedCount?: number }
  | { type: 'stop' }
  | { type: 'identify' }
  | { type: 'ping' };

/** انکود فرمان به bytes رایت‌شده روی CMD char */
export function encodeCommand(cmd: BleCommand): string {
  return JSON.stringify({ v: 1, ...cmd });
}

/** payload وضعیت تبلیغ‌شده از فریمور (روی STATUS char) */
export interface DeviceStatusPayload {
  currentTempC: number | null;
  batteryPercent: number | null;
  isHeating: boolean;
  rssi?: number;
  firmware?: string;
}

/** دیکود وضعیت — خطا null برمی‌گرداند تا مصرف‌کننده کرش نکند */
export function decodeStatus(raw: string): DeviceStatusPayload | null {
  try {
    const p = JSON.parse(raw);
    if (typeof p !== 'object' || p == null) return null;
    return {
      currentTempC: typeof p.currentTempC === 'number' ? p.currentTempC : null,
      batteryPercent: typeof p.batteryPercent === 'number' ? p.batteryPercent : null,
      isHeating: p.isHeating === true,
      rssi: typeof p.rssi === 'number' ? p.rssi : undefined,
      firmware: typeof p.firmware === 'string' ? p.firmware : undefined,
    };
  } catch {
    return null;
  }
}

/** نسخه‌ی فریمور هدف — برای صفحه‌ی ABOUT */
export const TARGET_CHIP = 'CH582M';
export const TARGET_FIRMWARE = '2.4.1';