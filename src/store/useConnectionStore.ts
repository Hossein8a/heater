// src/store/useConnectionStore.ts
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — Connection Store (runtime — persist نمی‌شود)
// وضعیت اتصال BLE و تله‌متری زنده‌ی هر کفش. منبع تغییرات:
//   · src/ble/scanner.ts   → setScanning
//   · src/ble/ShoeDevice.ts → connect/disconnect/updateTelemetry
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';

import type { ConnectionState, ShoeSide } from '../types';

export interface SideConnection {
  deviceId: string | null;
  deviceName: string | null;
  firmware: string | null;
  rssi: number | null;
  batteryPercent: number | null;
  currentTempC: number | null;
  connectionState: ConnectionState;
  lastSeenAt: number | null;
  errorMessage: string | null;
  /** لحظه‌ی شروع گرمایش پیوسته — SafetyGuardService سقف ۱۲۰ دقیقه را از این می‌گیرد */
  heatingStartedAt: number | null;
}

interface ConnectionStateShape {
  scanning: boolean;
  left: SideConnection;
  right: SideConnection;

  setScanning: (scanning: boolean) => void;
  setConnecting: (side: ShoeSide, deviceId: string, deviceName: string) => void;
  setConnected: (side: ShoeSide, info: { deviceId: string; deviceName: string; firmware: string | null; rssi: number | null }) => void;
  updateTelemetry: (side: ShoeSide, patch: Partial<Pick<SideConnection, 'batteryPercent' | 'currentTempC' | 'rssi' | 'firmware'>>) => void;
  setError: (side: ShoeSide, message: string) => void;
  setDisconnected: (side: ShoeSide, message?: string) => void;
  setHeating: (side: ShoeSide, isHeating: boolean) => void;
}

const SIDES = ['left', 'right'] as const;

const EMPTY_SIDE: SideConnection = {
  deviceId: null,
  deviceName: null,
  firmware: null,
  rssi: null,
  batteryPercent: null,
  currentTempC: null,
  connectionState: 'disconnected',
  lastSeenAt: null,
  errorMessage: null,
  heatingStartedAt: null,
};

const EMPTY: Record<ShoeSide, SideConnection> = {
  left: { ...EMPTY_SIDE },
  right: { ...EMPTY_SIDE },
};

export const useConnectionStore = create<ConnectionStateShape>()((set) => ({
  scanning: false,
  left: { ...EMPTY_SIDE },
  right: { ...EMPTY_SIDE },

  setScanning: (scanning) => set({ scanning }),

  setConnecting: (side, deviceId, deviceName) =>
    set((s) => ({
      [side]: { ...s[side], deviceId, deviceName, connectionState: 'connecting' as ConnectionState, errorMessage: null },
    })),

  setConnected: (side, info) =>
    set((s) => ({
      [side]: {
        ...s[side],
        ...info,
        connectionState: 'connected' as ConnectionState,
        lastSeenAt: Date.now(),
        errorMessage: null,
      },
    })),

  updateTelemetry: (side, patch) =>
    set((s) => ({
      [side]: { ...s[side], ...patch, lastSeenAt: Date.now() },
    })),

  setError: (side, message) =>
    set((s) => ({
      [side]: { ...s[side], connectionState: 'error' as ConnectionState, errorMessage: message },
    })),

  setDisconnected: (side, message) =>
    set((s) => ({
      [side]: {
        ...s[side],
        connectionState: 'disconnected' as ConnectionState,
        errorMessage: message ?? s[side].errorMessage,
        heatingStartedAt: null,
      },
    })),

  setHeating: (side, isHeating) =>
    set((s) => ({
      [side]: { ...s[side], heatingStartedAt: isHeating ? (s[side].heatingStartedAt ?? Date.now()) : null },
    })),
}));

/** خواندن لحظه‌ای خارج از کامپوننت */
export const getConnection = (side: ShoeSide): SideConnection => useConnectionStore.getState()[side];

export const CONNECTED_SIDES = SIDES;