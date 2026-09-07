import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useAlertWatch } from '@/hooks/use-alert-watch';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // راه‌اندازی نوتیفیکیشن‌ها + watchdog سقف ۱۲۰ دقیقه‌ی گرمایش
  useAlertWatch();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider
        value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}
      >
        <AnimatedSplashOverlay />
        {/* ریشه از نوع Stack است تا همه‌ی مسیرها (شامل گروه tabs و صفحات تمام‌صفحه مثل scan/settings/...) mount شوند */}
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="device-settings/[side]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="mode/[side]" options={{ presentation: 'modal' }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}