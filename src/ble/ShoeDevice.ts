// src/ble/ShoeDevice.ts
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — ShoeDevice (پل BLE ↔ Store ها)
//
// مسئولیت‌ها:
//   · connect / disconnect / identify هر کفش (CH582M)
//   · سابسکرایب STATUS → updateTelemetry روی useConnectionStore + useBatteryStore
//   · سابسکرایب useHeatStore → ارسال فرمان setHeat به دستگاه متصل
//   · autoReconnect با backoff (طبق useSettingsStore)
//   · DEMO FALLBACK: بدون سخت‌افزار، اتصال و تله‌متری شبیه‌سازی می‌شود
// ─────────────────────────────────────────────────────────────────────────────
import type { Device, Subscription } from 'react-native-ble-plx';
import { notifyDisconnect, notifyLowBattery } from '../services/notificationService';
import { isBelowLowBattery } from '../services/SafetyGuardService';
import { useBatteryStore } from '../store/useBatteryStore';
import { useConnectionStore } from '../store/useConnectionStore';
import { useHeatStore } from '../store/useHeatStore';
import { useSettingsStore } from '../store/useSettingsStore';
import type { ShoeSide } from '../types';
import {
  QARTAL_CMD_CHAR_UUID,
  QARTAL_SERVICE_UUID,
  QARTAL_STATUS_CHAR_UUID,
  TARGET_FIRMWARE,
  decodeStatus,
  encodeCommand,
  parseSide,
} from './protocol';
import { getBleManager } from './scanner';

const RECONNECT_MAX_TRIES = 3;
const RECONNECT_BACKOFF_MS = 2000;
const DEMO_CONNECT_DELAY_MS = 1300;
const DEMO_TELEMETRY_MS = 1500;

/** سمت هر دستگاه از روی نام/شناسه */
function sideOfDevice(deviceId: string, name: string): ShoeSide | null {
  const byName = parseSide(name);
  if (byName) return byName;
  if (/-L-/i.test(deviceId) || /-L$/i.test(deviceId)) return 'left';
  if (/-R-/i.test(deviceId) || /-R$/i.test(deviceId)) return 'right';
  return null;
}

/** فرمان setHeat برای یک سمت از وضعیت فعلی heat store */
function heatCommandFor(side: ShoeSide) {
  const h = useHeatStore.getState()[side];
  return {
    type: 'setHeat' as const,
    mode: h.mode,
    targetTempC: h.targetTempC,
    ...(h.mode === 'timer' ? { timerMin: h.timerMin } : {}),
    ...(h.mode === 'stepped' ? { steppedCount: h.steppedCount } : {}),
  };
}

class ShoeDeviceManager {
  private devices: Partial<Record<ShoeSide, Device>> = {};
  private statusSubs: Partial<Record<ShoeSide, Subscription>> = {};
  private heatUnsub: (() => void) | null = null;
  private demoTimers: Partial<Record<ShoeSide, ReturnType<typeof setInterval>>> = {};
  private demoTimeouts: Partial<Record<ShoeSide, ReturnType<typeof setTimeout>>> = {};
  private reconnectTries: Record<ShoeSide, number> = { left: 0, right: 0 };
  private lastBatteryNotified: Record<ShoeSide, number> = { left: 100, right: 100 };
  private manualDisconnect: Record<ShoeSide, boolean> = { left: false, right: false };

  // ── CONNECT ──────────────────────────────────────────────────────────────
  async connect(deviceId: string, name: string): Promise<ShoeSide | null> {
    const side = sideOfDevice(deviceId, name);
    if (!side) return null;

    useConnectionStore.getState().setConnecting(side, deviceId, name);
    this.manualDisconnect[side] = false;

    const manager = getBleManager();
    if (!manager) {
      // ماژول نیتیو BLE موجود نیست — مستقیم حالت دمو
      this.startDemoSession(side, deviceId, name);
      return side;
    }

    try {
      const device = await manager.connectToDevice(deviceId, { autoConnect: true });
      await device.discoverAllServicesAndCharacteristics();
      this.devices[side] = device;
      this.watchStatus(side, device);
      useConnectionStore.getState().setConnected(side, {
        deviceId,
        deviceName: name,
        firmware: TARGET_FIRMWARE,
        rssi: device.rssi ?? null,
      });
      void this.pushHeatState(side); // همگام‌سازی اولیه‌ی گرمایش
      this.reconnectTries[side] = 0;
      this.watchDisconnected(side, device);
      this.startHeatSync();
      return side;
    } catch {
      // ── DEMO FALLBACK — با سخت‌افزار واقعی این شاخه عملاً رخ نمی‌دهد ──
      this.startDemoSession(side, deviceId, name);
      return side;
    }
  }

  // ── DISCONNECT ───────────────────────────────────────────────────────────
  disconnect(side: ShoeSide): void {
    this.manualDisconnect[side] = true;
    this.stopDemoSession(side);
    this.statusSubs[side]?.remove();
    delete this.statusSubs[side];
    const device = this.devices[side];
    if (device) {
      getBleManager()?.cancelDeviceConnection(device.id).catch(() => {});
      delete this.devices[side];
    }
    useConnectionStore.getState().setDisconnected(side);
    this.stopHeatSyncIfIdle();
  }

  /** چشمک LED برای پیدا کردن کفش */
  async identify(side: ShoeSide): Promise<void> {
    const device = this.devices[side];
    if (device) {
      try {
        await device.writeCharacteristicWithoutResponseForService(
                    QARTAL_SERVICE_UUID,
          QARTAL_CMD_CHAR_UUID,
          encodeCommand({ type: 'identify' }),
        );
        return;
      } catch {
        // رایت شکست خورد — مثل حالت دمو ادامه بده
      }
    }
    // DEMO FALLBACK: شناسه‌ی بصری در صفحه‌ی device-settings انجام می‌شود
  }

  // ── PUSH HEAT STATE ──────────────────────────────────────────────────────
  async pushHeatState(side: ShoeSide): Promise<void> {
    const device = this.devices[side];
    if (!device) return; // دمو: telemetry شبیه‌ساز خودش از heat store می‌خواند
    try {
      await device.writeCharacteristicWithoutResponseForService(
                QARTAL_SERVICE_UUID,
        QARTAL_CMD_CHAR_UUID,
        encodeCommand(heatCommandFor(side)),
      );
    } catch {
      useConnectionStore.getState().setError(side, 'ارسال فرمان ناموفق بود');
    }
  }

  // ── STATUS NOTIFICATIONS ─────────────────────────────────────────────────
  private watchStatus(side: ShoeSide, device: Device): void {
    this.statusSubs[side]?.remove();
    this.statusSubs[side] = device.monitorCharacteristicForService(
            QARTAL_SERVICE_UUID,
      QARTAL_STATUS_CHAR_UUID,
      (error, char) => {
        if (error || !char?.value) return;
        const payload = decodeStatus(atob(char.value));
        if (!payload) return;
        useConnectionStore.getState().updateTelemetry(side, {
          currentTempC: payload.currentTempC,
          batteryPercent: payload.batteryPercent,
          rssi: payload.rssi,
          firmware: payload.firmware,
        });
        if (payload.batteryPercent != null) {
          useBatteryStore.getState().recordSample(side, payload.batteryPercent);
          this.maybeNotifyLowBattery(side, payload.batteryPercent);
        }
        useConnectionStore.getState().setHeating(side, payload.isHeating);
      },
    );
  }

  private watchDisconnected(side: ShoeSide, device: Device): void {
    device.onDisconnected(() => {
      if (this.manualDisconnect[side]) return;
      useConnectionStore.getState().setDisconnected(side, 'اتصال قطع شد');
      notifyDisconnect(side);
      this.maybeReconnect(side);
    });
  }

  private maybeReconnect(side: ShoeSide): void {
    const { autoReconnect } = useSettingsStore.getState();
    if (!autoReconnect) return;
    if (this.reconnectTries[side] >= RECONNECT_MAX_TRIES) return;
    const conn = useConnectionStore.getState()[side];
    if (!conn.deviceId || !conn.deviceName) return;
    this.reconnectTries[side] += 1;
    const delay = RECONNECT_BACKOFF_MS * this.reconnectTries[side]; // backoff تصاعدی
    setTimeout(() => {
      if (!this.manualDisconnect[side]) void this.connect(conn.deviceId!, conn.deviceName!);
    }, delay);
  }

  private maybeNotifyLowBattery(side: ShoeSide, percent: number): void {
    const threshold = useSettingsStore.getState().lowBatteryThreshold;
    // فقط هنگام عبور از آستانه اعلان بده (نه در هر نمونه)
    if (isBelowLowBattery(percent, threshold) && this.lastBatteryNotified[side] > threshold) {
      notifyLowBattery(side, percent);
    }
    this.lastBatteryNotified[side] = percent;
  }

  // ── HEAT STORE → DEVICE SYNC ─────────────────────────────────────────────
  private startHeatSync(): void {
    if (this.heatUnsub) return;
    this.heatUnsub = useHeatStore.subscribe((state, prev) => {
      (['left', 'right'] as const).forEach((side) => {
        if (state[side] !== prev[side] && this.devices[side]) {
          void this.pushHeatState(side);
        }
      });
    });
  }

  private stopHeatSyncIfIdle(): void {
    const anyConnected = (['left', 'right'] as const).some((s) => this.devices[s]);
    if (!anyConnected && this.heatUnsub) {
      this.heatUnsub();
      this.heatUnsub = null;
    }
  }

  // ── DEMO SESSION (بدون سخت‌افزار) ────────────────────────────────────────
  private startDemoSession(side: ShoeSide, deviceId: string, name: string): void {
    const seedBattery = side === 'left' ? 92 : 88;
    useConnectionStore.getState().setConnected(side, {
      deviceId,
      deviceName: name,
      firmware: TARGET_FIRMWARE,
      rssi: side === 'left' ? -52 : -67,
    });
    useConnectionStore.getState().updateTelemetry(side, {
      currentTempC: side === 'left' ? 31.2 : 30.6,
      batteryPercent: seedBattery,
    });

    // تله‌متری شبیه‌سازی‌شده — منطق همان useDemoShoeSystem قبلی
    const tick = () => {
      const s = useConnectionStore.getState()[side];
      if (s.connectionState !== 'connected') return;
      const h = useHeatStore.getState()[side];
      const heating = h.mode !== 'off';
      const cur = s.currentTempC ?? 22;
      const pull = (h.targetTempC - cur) * 0.1;
      const noise = (Math.random() - 0.5) * 0.3;
      const nextCur = Math.min(49, Math.max(18, cur + pull + (heating ? Math.abs(noise) : noise * 0.3)));
      const bat = s.batteryPercent == null ? null : heating ? Math.max(4, s.batteryPercent - 0.04 - (h.targetTempC / 45) * 0.04) : s.batteryPercent;
      const c = useConnectionStore.getState();
      c.updateTelemetry(side, {
        currentTempC: Math.round(nextCur * 10) / 10,
        batteryPercent: bat == null ? null : Math.round(bat * 10) / 10,
      });
      c.setHeating(side, heating);
      if (bat != null) {
        useBatteryStore.getState().recordSample(side, bat);
        this.maybeNotifyLowBattery(side, bat);
      }
    };
    this.demoTimeouts[side] = setTimeout(() => {
      tick();
      this.demoTimers[side] = setInterval(tick, DEMO_TELEMETRY_MS);
    }, DEMO_CONNECT_DELAY_MS);
  }

  private stopDemoSession(side: ShoeSide): void {
    if (this.demoTimers[side]) clearInterval(this.demoTimers[side]!);
    if (this.demoTimeouts[side]) clearTimeout(this.demoTimeouts[side]!);
    delete this.demoTimers[side];
    delete this.demoTimeouts[side];
  }
}

export const ShoeDevice = new ShoeDeviceManager();