// src/hooks/use-alert-watch.ts
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — هوک نصب watchdog ایمنی + راه‌اندازی نوتیفیکیشن‌ها
// یک‌بار در ریشه‌ی اپ (src/app/_layout.tsx) صدا زده می‌شود.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react';

import { startAlertWatch } from '../services/alertWatch';
import { setupNotifications } from '../services/notificationService';

export function useAlertWatch(): void {
  useEffect(() => {
    void setupNotifications();
    return startAlertWatch();
  }, []);
}