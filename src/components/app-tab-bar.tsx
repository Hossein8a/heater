// src/components/app-tab-bar.tsx
// -------------------------------------------------------------
// Qartal -- custom tab bar
// One component, two layouts:
//   - width < 768  -> floating rounded dock at the bottom (mobile)
//   - width >= 768 -> refined left sidebar (tablet/web)
// Single-language labels via useI18n. A language toggle sits at the
// top of the sidebar and as the last slot of the mobile dock.
// -------------------------------------------------------------
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TKey } from '@/i18n/strings';
import { useI18n } from '@/i18n/use-i18n';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useSettingsStore } from '@/store/useSettingsStore';

// ---- Design tokens (bone / leather / terracotta heat) ----
const PALETTE = {
  light: {
    bg: '#FFFFFF',
    border: '#E2DED2',
    active: '#9C330B',
    inactive: '#8B8578',
    pill: 'rgba(156,51,11,0.09)',
    badge: '#AE3324',
    brand: '#15120D',
    shadow: 'rgba(21,18,13,0.22)',
  },
  dark: {
    bg: '#1B1712',
    border: '#2C261B',
    active: '#DC9438',
    inactive: '#8A8372',
    pill: 'rgba(220,148,56,0.14)',
    badge: '#C1503A',
    brand: '#F2F0E9',
    shadow: 'rgba(0,0,0,0.55)',
  },
} as const;

type PaletteColors = (typeof PALETTE)[keyof typeof PALETTE];

const TAB_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: TKey }> = {
  index: { icon: 'home-outline', label: 'tabHome' },
  scan: { icon: 'bluetooth-outline', label: 'tabScan' },
  profiles: { icon: 'layers-outline', label: 'tabProfiles' },
  schedule: { icon: 'calendar-outline', label: 'tabSchedule' },
  settings: { icon: 'settings-outline', label: 'tabSettings' },
};

const haptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

// ---- Animated tab item (dock + sidebar share this) ----
function TabItem({
  icon,
  label,
  focused,
  horizontal,
  colors,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  focused: boolean;
  horizontal: boolean;
  colors: PaletteColors;
  badge: number | null;
  onPress: () => void;
}) {
  const active = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    active.value = withSpring(focused ? 1 : 0, { damping: 15, stiffness: 260 });
  }, [focused, active]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scale: 0.88 + active.value * 0.12 }],
  }));

  const contentColor = focused ? colors.active : colors.inactive;

  if (horizontal) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        style={({ pressed }) => [styles.dItem, pressed && { opacity: 0.7 }]}
      >
        <Animated.View style={[styles.dPill, { backgroundColor: colors.pill }, pillStyle]} />
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={21} color={contentColor} />
          {badge != null && badge > 0 && <Badge value={badge} color={colors.badge} />}
        </View>
        <Text style={[styles.dLabel, { color: contentColor }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      style={({ pressed }) => [styles.vItem, pressed && { opacity: 0.7 }]}
    >
      <Animated.View style={[styles.vIndicator, { backgroundColor: colors.active }, pillStyle]} />
      <View style={[styles.iconWrap, styles.vIconWrap]}>
        <Ionicons name={icon} size={20} color={contentColor} />
        {badge != null && badge > 0 && <Badge value={badge} color={colors.badge} />}
      </View>
      <Text style={[styles.vLabel, { color: contentColor }, focused && styles.vLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Badge({ value, color }: { value: number; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{value > 9 ? '9+' : String(value)}</Text>
    </View>
  );
}

// ---- Language toggle ----
function LangToggle({
  lang,
  horizontal = false,
  colors,
  onPress,
}: {
  lang: 'fa' | 'en';
  horizontal?: boolean;
  colors: PaletteColors;
  onPress: () => void;
}) {
  const code = lang === 'fa' ? 'FA' : 'EN';
  if (horizontal) {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={lang === 'fa' ? 'English' : 'فارسی'}
        style={({ pressed }) => [styles.dItem, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.langIconWrap}>
          <Ionicons name="globe-outline" size={19} color={colors.inactive} />
        </View>
        <Text style={[styles.dLabel, { color: colors.inactive }]}>{code}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={lang === 'fa' ? 'English' : 'فارسی'}
      style={({ pressed }) => [
        styles.sideLangBtn,
        { borderColor: colors.border, backgroundColor: colors.pill },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name="globe-outline" size={15} color={colors.active} />
      <Text style={[styles.sideLangText, { color: colors.active }]}>{code}</Text>
    </Pressable>
  );
}

// ---- Main tab bar ----
export default function AppTabBar({ state, navigation }: BottomTabBarProps) {
  // همه‌ی صفحات پالت گرمِ روشن ثابت دارند؛ تب‌بار هم همیشه روشن می‌ماند تا در حالت دارکِ سیستم با صفحات ناهماهنگ نشود.
  const colors = PALETTE.light;
  const { width } = useWindowDimensions();
  const vertical = width >= 768;
  const insets = useSafeAreaInsets();
  const { t, lang, toggleLang } = useI18n();

  const conn = useConnectionStore();
  const lowBatteryThreshold = useSettingsStore((s) => s.lowBatteryThreshold);

  const connectedCount = (['left', 'right'] as const).filter(
    (k) => conn[k].connectionState === 'connected',
  ).length;
  const batteries = [conn.left.batteryPercent, conn.right.batteryPercent].filter(
    (b): b is number => b != null,
  );
  const minBattery = batteries.length ? Math.min(...batteries) : null;

  const badgeFor = (name: string): number | null => {
    if (name === 'scan') return connectedCount > 0 ? connectedCount : null;
    if (name === 'index') {
      return minBattery != null && minBattery <= lowBatteryThreshold ? Math.round(minBattery) : null;
    }
    return null;
  };

  const makePress = (index: number) => () => {
    const route = state.routes[index];
    const focused = state.index === index;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      if (Platform.OS !== 'web') void haptic();
      navigation.navigate(route.name);
    }
  };

  const langPress = () => {
    if (Platform.OS !== 'web') void haptic();
    toggleLang();
  };

  // ---- Sidebar (wide) ----
  if (vertical) {
    return (
      <View
        style={[
          styles.sideBar,
          { backgroundColor: colors.bg, borderRightColor: colors.border, paddingTop: insets.top + 14 },
        ]}
      >
        <View>
          <View style={styles.sideBrandRow}>
            <View style={styles.brand}>
                            <Text style={[styles.brandEn, { color: colors.brand }]}>Qartal</Text>
              <Text style={[styles.brandFa, { color: colors.inactive }]} numberOfLines={1}>
                {t('brandTagline')}
              </Text>
            </View>
            <LangToggle lang={lang} colors={colors} onPress={langPress} />
          </View>

          <View style={styles.sideItems}>
            {state.routes.map((route, i) => {
              const meta = TAB_META[route.name];
              if (!meta) return null;
              return (
                <TabItem
                  key={route.key}
                  icon={meta.icon}
                  label={t(meta.label)}
                  focused={state.index === i}
                  horizontal={false}
                  colors={colors}
                  badge={badgeFor(route.name)}
                  onPress={makePress(i)}
                />
              );
            })}
          </View>
        </View>

        <View style={[styles.sideFooter, { borderTopColor: colors.border }]}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  connectedCount === 2 ? '#2E6B39' : connectedCount === 1 ? '#A9721E' : colors.inactive,
              },
            ]}
          />
          <Text style={[styles.statusText, { color: colors.inactive }]}>
            {`${connectedCount}/2 ${t('connected')}`}
          </Text>
        </View>
      </View>
    );
  }

  // ---- Floating dock (mobile) ----
  return (
    <View style={[styles.dockWrap, { paddingBottom: insets.bottom + 8 }]}>
      <View style={[styles.dock, { backgroundColor: colors.bg, borderColor: colors.border, shadowColor: colors.shadow }]}>
        {state.routes.map((route, i) => {
          const meta = TAB_META[route.name];
          if (!meta) return null;
          return (
            <TabItem
              key={route.key}
              icon={meta.icon}
              label={t(meta.label)}
              focused={state.index === i}
              horizontal
              colors={colors}
              badge={badgeFor(route.name)}
              onPress={makePress(i)}
            />
          );
        })}
        <LangToggle lang={lang} colors={colors} horizontal onPress={langPress} />
      </View>
    </View>
  );
}

// -------------------------------------------------------------
// STYLES
// -------------------------------------------------------------
const styles = StyleSheet.create({
  // Floating dock
  dockWrap: {
    paddingHorizontal: 14,
    paddingTop: 6,
    backgroundColor: 'transparent',
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 4,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
  },
  dItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  dPill: {
    position: 'absolute',
    top: 2,
    width: 48,
    height: 30,
    borderRadius: 15,
  },
  iconWrap: { position: 'relative' },
  langIconWrap: { height: 21, justifyContent: 'center' },
  dLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

  // Sidebar
  sideBar: {
    width: 248,
    borderRightWidth: 1,
    height: '100%',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 18,
  },
  sideBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginBottom: 18,
  },
  brand: { flex: 1, paddingRight: 8 },
  brandEn: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
  },
  brandFa: { fontSize: 10, marginTop: 4 },
  sideLangBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sideLangText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  sideItems: { gap: 2 },
  vItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  vIndicator: {
    position: 'absolute',
    left: 0,
    width: 3,
    height: 22,
    borderRadius: 2,
  },
  vIconWrap: { width: 22 },
  vLabel: { fontSize: 13, fontWeight: '500', flex: 1 },
  vLabelActive: { fontWeight: '700' },
  sideFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 12,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11 },

  // Shared
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '700' },
});
