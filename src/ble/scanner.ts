// src/ble/scanner.ts
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — BLE Scanner
// اسکن advertisement ها و تشخیص سمت کفش از پسوند نام («-L-» / «-R-»).
// خروجی به صفحه‌ی scan.tsx می‌رود؛ اتصال با src/ble/ShoeDevice.ts انجام می‌شود.
// ─────────────────────────────────────────────────────────────────────────────
import { BleManager, State } from 'react-native-ble-plx';

import type { ShoeSide } from '../types';
import { DEVICE_NAME_PATTERN, parseSide } from './protocol';

export interface ScanResult {
  id: string;
  name: string;
  side: ShoeSide | null;
  rssi: number;
}

let managerInstance: BleManager | null = null;

/**
 * ساخت تنبل BleManager — ماژول نیتیو ble-plx ممکن است در بیلد نیتیو موجود
 * نباشد (dev-client قدیمی/Expo Go)؛ در آن صورت null برمی‌گردانیم تا اپ کرش
 * نکند و صفحه‌ی اسکن به fallback دمو برود.
 */
export function getBleManager(): BleManager | null {
  if (managerInstance != null) return managerInstance;
  try {
    managerInstance = new BleManager();
  } catch {
    managerInstance = null;
  }
  return managerInstance;
}

/**
 * اسکن به مدت مشخص.
 * · روی هر دستگاه RESANA دیده‌شده یک‌بار onDevice صدا زده می‌شود (dedupe بر اساس id)
 * · در پایان onDone صدا زده می‌شود (چه timeout چه stop دستی)
 * · مقدار بازگشتی تابع stop است.
 */
export function scanForShoes(
  timeoutMs: number,
  onDevice: (r: ScanResult) => void,
  onDone: () => void,
  onError: (message: string) => void,
): () => void {
  const manager = getBleManager();
  if (!manager) {
    // ماژول نیتیو موجود نیست — مصرف‌کننده fallback دمو را اجرا می‌کند
    onError('ماژول BLE در این بیلد نیتیو موجود نیست');
    onDone();
    return () => {};
  }

  const seen = new Set<string>();
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    try {
      manager.stopDeviceScan();
    } catch {
      // بی‌توجه — اسکن ممکن است از قبل متوقف شده باشد
    }
    subscription?.remove();
    clearTimeout(timer);
    onDone();
  };

  const subscription = manager.onStateChange((state) => {
    if (state === State.PoweredOff) {
      onError('بلوتوث خاموش است');
      finish();
    }
  }, true);

  const timer = setTimeout(finish, timeoutMs);

  try {
    // INTEGRATION: اگر فریمور سرویس خاصی تبلیغ می‌کند، UUID آن را به‌عنوان
    // فیلتر به startDeviceScan بدهید تا اسکن به دستگاه‌های RESANA محدود شود.
    manager.startDeviceScan([], { allowDuplicates: false }, (error, device) => {
      if (error || !device) return;
      const name = device.name ?? device.localName ?? '';
      if (!DEVICE_NAME_PATTERN.test(name)) return;
      if (seen.has(device.id)) return;
      seen.add(device.id);
      onDevice({
        id: device.id,
        name,
        side: parseSide(name),
        rssi: device.rssi ?? -100,
      });
    });
  } catch (e) {
    onError(e instanceof Error ? e.message : 'خطای BLE');
    finish();
  }

  return finish;
}

// ── DEMO FALLBACK — با اتصال سخت‌افزار واقعی حذف شود ─────────────────────────
// روی شبیه‌ساز/وب (بدون BLE) دستگاه‌های دمو emit می‌شوند تا UI قابل تست بماند.
export const DEMO_SCAN_DEVICES: ScanResult[] = [
  { id: 'CH582-L-77A4', name: 'RESANA-L-77A4', side: 'left', rssi: -52 },
  { id: 'CH582-R-91B2', name: 'RESANA-R-91B2', side: 'right', rssi: -67 },
  { id: 'FF:23:0C:19:A8', name: 'UNKNOWN-BLE', side: null, rssi: -84 },
];

/** شبیه‌سازی اسکن با دستگاه‌های دمو — همان API اسکن واقعی */
export function scanForShoesDemo(
  timeoutMs: number,
  onDevice: (r: ScanResult) => void,
  onDone: () => void,
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const delays = [900, 1700, 2600];
  DEMO_SCAN_DEVICES.forEach((d, i) => {
    timers.push(setTimeout(() => onDevice(d), Math.min(delays[i] ?? 3000, timeoutMs)));
  });
  const done = setTimeout(onDone, Math.min(3400, timeoutMs));
  timers.push(done);
  return () => timers.forEach(clearTimeout);
}