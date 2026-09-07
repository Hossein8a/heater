// src/services/notificationService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — Local Notification Service (notifee)
// کانال‌ها + ارسال هشدارهای باتری کم / قطع اتصال / ایمنی.
// هر هشدار قبل از ارسال تنظیمات کاربر (useSettingsStore) را رعایت می‌کند —
// به‌جز هشدارهای ایمنی که طبق مستند همیشه فعال‌اند.
//
// نکته: ماژول نیتیو notifee با require تنبل لود می‌شود تا اگر در بیلد نیتیو
// موجود نبود (مثلاً dev-client قدیمی)، کل اپ کرش نکند — نوتیفیکیشن‌ها فقط
// بی‌صدا می‌شوند.
// ─────────────────────────────────────────────────────────────────────────────
import { NativeModules, Platform } from 'react-native';

import { useSettingsStore } from '../store/useSettingsStore';
import type { ShoeSide } from '../types';

const CHANNEL_ID = 'resana-amud-alerts';

type NotifeeModule = typeof import('@notifee/react-native');

let notifeeCache: NotifeeModule | null = null;

/** لود تنبل ماژول نیتیو — در نبود آن null برمی‌گرداند */
function getNotifee(): NotifeeModule | null {
  if (Platform.OS === 'web') return null;
  if (notifeeCache != null) return notifeeCache;
  // چک مستقیم ماژول نیتیو: اگر در بیلد نیتیو ثبت نشده باشد، اصلاً JS lib را
  // require نمی‌کنیم — چون کرشِ ارزیابی ماژول، حتی داخل try/catch هم توسط
  // Metro به‌عنوان ERROR لاگ می‌شود.
  if (NativeModules.NotifeeApiModule == null && NativeModules.NotifeeNativeModule == null) {
    return null;
  }
  try {
    notifeeCache = require('@notifee/react-native') as NotifeeModule;
  } catch {
    notifeeCache = null;
  }
  return notifeeCache;
}

/** ساخت کانال اندروید + درخواست مجوز — یک‌بار در شروع اپ */
export async function setupNotifications(): Promise<void> {
  const mod = getNotifee();
  if (!mod) return;
  try {
    await mod.default.createChannel({
      id: CHANNEL_ID,
      name: 'Qartal',
      importance: mod.AndroidImportance.HIGH,
      vibration: true,
    });
    const settings = await mod.default.requestPermission();
    if (settings.authorizationStatus < mod.AuthorizationStatus.AUTHORIZED) {
      // مجوز داده نشده — نوتیفیکیشن‌ها سکوت می‌شوند ولی store دست‌نخورده می‌ماند
    }
  } catch {
    // پلتفرم بدون پشتیبانی بومی — بی‌خطر است
  }
}

const SIDE_FA: Record<ShoeSide, string> = { left: 'چپ', right: 'راست' };

async function display(title: string, body: string): Promise<void> {
  const mod = getNotifee();
  if (!mod) return;
  try {
    await mod.default.displayNotification({
      title,
      body,
      android: { channelId: CHANNEL_ID, smallIcon: 'ic_launcher', vibrationPattern: [120, 80, 120] },
    });
  } catch {
    // بی‌خطر — پلتفرم بدون پشتیبانی
  }
}

/** هشدار باتری کم — فقط اگر lowBatteryAlert روشن باشد */
export function notifyLowBattery(side: ShoeSide, percent: number): void {
  const s = useSettingsStore.getState();
  if (!s.notificationsEnabled || !s.lowBatteryAlert) return;
  void display('RESANA · باتری کم', `باتری کفش ${SIDE_FA[side]} به ${Math.round(percent)}٪ رسید.`);
}

/** هشدار قطع اتصال — فقط اگر disconnectAlert روشن باشد */
export function notifyDisconnect(side: ShoeSide): void {
  const s = useSettingsStore.getState();
  if (!s.notificationsEnabled || !s.disconnectAlert) return;
  void display('RESANA · قطع اتصال', `اتصال کفش ${SIDE_FA[side]} قطع شد${s.autoReconnect ? ' — تلاش برای اتصال مجدد…' : '.'}`);
}

/** هشدار ایمنی — همیشه ارسال می‌شود (غیرقابل خاموشی طبق مستند) */
export function notifySafety(detail: string): void {
  void display('RESANA · هشدار ایمنی', detail);
}

/** اطلاع‌رسانی بی‌صدا برای رخدادهای عادی (مثلاً شارژ کامل) */
export function notifyCharged(side: ShoeSide | 'both'): void {
  const s = useSettingsStore.getState();
  if (!s.notificationsEnabled) return;
  const who = side === 'both' ? 'هر دو کفش' : `کفش ${SIDE_FA[side]}`;
      void display('Qartal · شارژ', `شارژ ${who} کامل شد.`);
}