// src/hooks/useShoeSystem.ts
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — useShoeSystem (جایگزین useDemoShoeSystem)
// ترکیب useConnectionStore + useHeatStore با همان API قبلی:
//   { status: Record<ShoeSide, ShoeStatus>, setTargetTemp, setMode }
// تا داشبورد (index.tsx) بدون تغییر UI به store های واقعی وصل شود.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react';

import { useConnectionStore } from '../store/useConnectionStore';
import { useHeatStore } from '../store/useHeatStore';
import type { HeatMode, HeatScope, ShoeSide, ShoeStatus } from '../types';

export function useShoeSystem(): {
  status: Record<ShoeSide, ShoeStatus>;
  setTargetTemp: (scope: HeatScope, t: number) => void;
  setMode: (scope: HeatScope, m: HeatMode) => void;
} {
  const conn = useConnectionStore();
  const heat = useHeatStore();

  const status = useMemo<Record<ShoeSide, ShoeStatus>>(() => {
    const c = conn;
    const h = heat;
    const build = (side: ShoeSide): ShoeStatus => {
      const connected = c[side].connectionState === 'connected';
      return {
        side,
        deviceId: c[side].deviceId,
        connectionState: c[side].connectionState,
        batteryPercent: c[side].batteryPercent,
        currentTempC: c[side].currentTempC,
        targetTempC: h[side].targetTempC,
        mode: h[side].mode,
        isHeating: connected && h[side].mode !== 'off',
        lastSeenAt: c[side].lastSeenAt,
        errorMessage: c[side].errorMessage,
      };
    };
    return { left: build('left'), right: build('right') };
  }, [conn, heat]);

  return {
    status,
    setTargetTemp: (scope, t) => useHeatStore.getState().setTargetTemp(scope, t),
    setMode: (scope, m) => useHeatStore.getState().setMode(scope, m),
  };
}