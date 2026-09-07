// src/app/(tabs)/_layout.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — Tabs Layout
// تب‌بار سفارشی AppTabBar:
//   · موبایل (عرض < 768)  → تب‌بار پایین
//   · تبلت/وب (عرض ≥ 768) → سایدبار چپ (tabBarPosition: 'left')
// ─────────────────────────────────────────────────────────────────────────────
import { Tabs } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import AppTabBar from '@/components/app-tab-bar';
import { useI18n } from '@/i18n/use-i18n';

export default function TabsLayout() {
  const wide = useWindowDimensions().width >= 768;
  const { t } = useI18n();

  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: false, // برچسب داخل AppTabBar رندر می‌شود
        tabBarPosition: wide ? 'left' : 'bottom',
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabHome') }} />
      <Tabs.Screen name="scan" options={{ title: t('titleScan') }} />
      <Tabs.Screen name="profiles" options={{ title: t('titleProfiles') }} />
      <Tabs.Screen name="schedule" options={{ title: t('titleSchedule') }} />
      <Tabs.Screen name="settings" options={{ title: t('titleSettings') }} />
    </Tabs>
  );
}