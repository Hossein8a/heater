// src/store/safeAsyncStorage.ts
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — آداپتور امن AsyncStorage برای zustand/persist
//
// اگر ماژول نیتیو AsyncStorage در بیلد نیتیو موجود نباشد (dev-client قدیمی،
// Expo Go و…)، فراخوانی‌های native یک Promise رد‌شده برمی‌گردانند که به‌صورت
// «Uncaught (in promise)» در لاگ ظاهر می‌شود. این آداپتور خطاها را می‌بلعد:
//   · در نبود نیتیو → state فقط در حافظه‌ی نشست نگه داشته می‌شود
//   · با بیلد کامل → ذخیره‌سازی دائمی عادی روی AsyncStorage
// ─────────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

export const safeAsyncStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return (await AsyncStorage.getItem(name)) ?? null;
    } catch {
      return null;
    }
  },

  setItem: async (name, value) => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch {
      // بی‌صدا — بیلد نیتیو فاقد ماژول AsyncStorage است
    }
  },

  removeItem: async (name) => {
    try {
      await AsyncStorage.removeItem(name);
    } catch {
      // بی‌صدا
    }
  },
};