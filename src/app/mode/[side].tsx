// app/mode/[side].tsx
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — Operating Mode Select (parametric: left / right)
//
// INTEGRATION POINT: state فعلی دمو است. بعد از اتصال store ها:
//   · mode / targetTemp  → useHeatStore (setMode(side, mode), setTimerMin, ...)
//   · connectionState    → useConnectionStore (برای هشدار قطع)
// قرارداد HeatMode عیناً طبق مستند: off | constant | timer | stepped | smart | activity
// ─────────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShoeDevice } from '../../ble/ShoeDevice';
import { PressableScale } from '../../components/pressable-scale';
import type { TKey } from '../../i18n/strings';
import { useI18n } from '../../i18n/use-i18n';
import { useHeatStore } from '../../store/useHeatStore';

// ── Design tokens (یکسان با index) ──
const Colors = {
  canvas: '#EFEDE5',
  surface: '#FFFFFF',
  surfaceSoft: '#F7F5ED',
  ink: '#15120D',
  inkSoft: '#2E2820',
  muted: '#8B8578',
  border: '#E2DED2',
  borderStrong: '#D3CCBB',
  heatCore: '#C7420F',
  heatCoreDeep: '#9C330B',
  heatAmber: '#DC9438',
  success: '#2E6B39',
  warning: '#A9721E',
  danger: '#AE3324',
  dark: '#12100D',
  darkBorder: '#282319',
  darkText: '#F2F0E9',
  darkMuted: '#87806E',
};
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' }) as string;
const SERIF = Platform.select({ ios: 'Palatino', default: 'serif' }) as string;

// ── قرارداد مشترک پروژه ──
type ShoeSide = 'left' | 'right';
type HeatMode = 'off' | 'constant' | 'timer' | 'stepped' | 'smart' | 'activity';

// سقف سخت لایه ایمنی — SafetyGuardService: حداکثر ۱۲۰ دقیقه گرمایش پیوسته
const TIMER_OPTIONS = [30, 60, 90, 120] as const;
const STEP_OPTIONS = [2, 3, 4] as const;

interface ModeMeta {
  icon: keyof typeof Ionicons.glyphMap;
  en: string;
  key: TKey;
  descKey: TKey;
  accent: string;
}

const MODES: Record<HeatMode, ModeMeta> = {
  off: {
    icon: 'power-outline',
    en: 'OFF',
    key: 'modeOff',
    descKey: 'modeDescOff',
    accent: Colors.ink,
  },
  constant: {
    icon: 'flame-outline',
    en: 'CONSTANT',
    key: 'modeConstant',
    descKey: 'modeDescConstant',
    accent: Colors.heatCoreDeep,
  },
  timer: {
    icon: 'timer-outline',
    en: 'TIMER',
    key: 'modeTimer',
    descKey: 'modeDescTimer',
    accent: Colors.heatAmber,
  },
  stepped: {
    icon: 'trending-up-outline',
    en: 'STEPPED',
    key: 'modeStepped',
    descKey: 'modeDescStepped',
    accent: Colors.warning,
  },
  smart: {
    icon: 'bulb-outline',
    en: 'SMART',
    key: 'modeSmart',
    descKey: 'modeDescSmart',
    accent: Colors.success,
  },
  activity: {
    icon: 'fitness-outline',
    en: 'ACTIVITY',
    key: 'modeActivity',
    descKey: 'modeDescActivity',
    accent: '#7A5EA0',
  },
};

const MODE_ORDER: HeatMode[] = ['off', 'constant', 'timer', 'stepped', 'smart', 'activity'];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function ModeSelectScreen() {
  const { t } = useI18n();
  const params = useLocalSearchParams<{ side?: string }>();

  // اعتبارسنجی پارامتر — اگر نامعتبر بود به عقب
  const side: ShoeSide | null =
    params.side === 'left' ? 'left' : params.side === 'right' ? 'right' : null;

  // ── STORE — وضعیت واقعی از useHeatStore (persist) ──
  const mode = useHeatStore((s) => (side ? s[side].mode : 'off'));
  const timerMin = useHeatStore((s) => (side ? s[side].timerMin : 60));
  const steppedCount = useHeatStore((s) => (side ? s[side].steppedCount : 3));

  // ── باگ‌رفته: علامت «تغییر‌داده‌شده» در مقایسه با وضعیتِ هنگام ورود به صفحه
  // محاسبه می‌شود، نه با مقادیر پیش‌فرض هاردکد.
  const snapshot = useRef<{ mode: HeatMode; timerMin: number; steppedCount: number } | null>(null);
  if (snapshot.current === null) {
    const st = useHeatStore.getState();
    const cur = side ? st[side] : null;
    if (cur) snapshot.current = { mode: cur.mode, timerMin: cur.timerMin, steppedCount: cur.steppedCount };
  }

  const dirty = useMemo(() => {
    const snap = snapshot.current;
    if (!snap) return false;
    return mode !== snap.mode || timerMin !== snap.timerMin || steppedCount !== snap.steppedCount;
  }, [mode, timerMin, steppedCount]);

  if (!side) {
    // پارامتر نامعتبر یا باز شدن مستقیم صفحه از طریق deep-link —
    // Redirect امن است و تا mount شدن root navigator صبر می‌کند.
    // (صدا زدن router در حین render باعث خطای
    //  «Attempted to navigate before mounting the Root Layout component» می‌شود)
    return <Redirect href="/" />;
  }

  const sideLabel = side === 'left' ? 'LEFT · چپ' : 'RIGHT · راست';
  const meta = MODES[mode];
  const needsTimer = mode === 'timer';
  const needsSteps = mode === 'stepped';

  const setMode = (m: HeatMode) => {
    if (!side) return;
    useHeatStore.getState().setMode(side, m);
  };

  const setTimerMin = (v: number) => {
    if (!side) return;
    useHeatStore.getState().setTimerMin(side, v);
  };

  const setSteppedCount = (v: number) => {
    if (!side) return;
    useHeatStore.getState().setSteppedCount(side, v);
  };

  const apply = () => {
    if (!side) return;
    useHeatStore.getState().setMode(side, mode);
    void ShoeDevice.pushHeatState(side);
    router.back();
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* ── TOP NAV ── */}
        <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.topNav}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color={Colors.ink} />
          </Pressable>
          <View style={styles.navCenter}>
            <Text style={styles.navTitleEn}>OPERATING MODE</Text>
            <Text style={styles.navTitleFa}>{side === 'left' ? t('titleModeLeft') : t('titleModeRight')}</Text>
          </View>
          <View style={[styles.sidePill, side === 'left' ? styles.sidePillL : styles.sidePillR]}>
            <Ionicons name="footsteps" size={14} color={Colors.darkText} />
            <Text style={styles.sidePillText}>{side === 'left' ? 'L' : 'R'}</Text>
          </View>
        </Animated.View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── CURRENT MODE HERO ── */}
          <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.heroCard}>
            <View style={[styles.heroIconWrap, { backgroundColor: 'rgba(255,255,255,0.07)' }]}>
              <Ionicons name={meta.icon} size={30} color={Colors.heatAmber} />
            </View>
            <View style={styles.heroTexts}>
              <Text style={styles.heroEn}>{meta.en}</Text>
              <Text style={styles.heroFa}>{t(meta.key)}</Text>
            </View>
            <View style={styles.heroSideTag}>
              <Text style={styles.heroSideTagText}>{sideLabel}</Text>
            </View>
          </Animated.View>

          {/* ── MODE LIST ── */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionLabel}>SELECT MODE</Text>
            <Text style={styles.sectionSub}>{t('selectMode')}</Text>
          </View>

          {MODE_ORDER.map((m, i) => {
            const mm = MODES[m];
            const active = mode === m;
            return (
              <Animated.View key={m} entering={FadeInDown.delay(180 + i * 50).springify()}>
                <Pressable
                  onPress={() => setMode(m)}
                  style={[styles.modeRow, active && (m === 'off' ? styles.modeRowOff : styles.modeRowActive)]}
                >
                  <View
                    style={[
                      styles.modeIcon,
                      active && (m === 'off' ? styles.modeIconDark : styles.modeIconHeat),
                    ]}
                  >
                    <Ionicons
                      name={mm.icon}
                      size={19}
                      color={active ? Colors.darkText : mm.accent}
                    />
                  </View>

                  <View style={styles.modeTexts}>
                    <View style={styles.modeTitleRow}>
                      <Text style={[styles.modeEn, active && styles.modeEnActive]}>{mm.en}</Text>
                      <Text style={[styles.modeFa, active && styles.modeFaActive]}>{t(mm.key)}</Text>
                    </View>
                    <Text style={[styles.modeDesc, active && styles.modeDescActive]} numberOfLines={2}>
                      {t(mm.descKey)}
                    </Text>
                  </View>

                  <View
                    style={[styles.radio, active && (m === 'off' ? styles.radioDark : styles.radioHeat)]}
                  >
                    {active && <Ionicons name="checkmark" size={13} color={Colors.darkText} />}
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}

          {/* ── MODE PARAMS — timer ── */}
          {needsTimer && (
            <Animated.View entering={FadeInDown.springify()} style={styles.paramsCard}>
              <View style={styles.paramsHead}>
                <Ionicons name="timer-outline" size={16} color={Colors.heatCoreDeep} />
                <Text style={styles.paramsLabel}>{t('timerLabel')}</Text>
                <Text style={styles.paramsHint}>{`MAX 120 MIN`}</Text>
              </View>
              <View style={styles.chipRow}>
                {TIMER_OPTIONS.map((min) => (
                  <PressableScale
                    key={min}
                    onPress={() => setTimerMin(min)}
                    style={[styles.chip, timerMin === min && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, timerMin === min && styles.chipTextActive]}>
                      {`${min} ${t('minutesUnit')}`}
                    </Text>
                  </PressableScale>
                ))}
              </View>
              <Text style={styles.paramsNote}>
                {t('timerNote')}
              </Text>
            </Animated.View>
          )}

          {/* ── MODE PARAMS — stepped ── */}
          {needsSteps && (
            <Animated.View entering={FadeInDown.springify()} style={styles.paramsCard}>
              <View style={styles.paramsHead}>
                <Ionicons name="trending-up-outline" size={16} color={Colors.heatCoreDeep} />
                <Text style={styles.paramsLabel}>{t('stepsLabel')}</Text>
                <Text style={styles.paramsHint}>{`20° → 45°`}</Text>
              </View>
              <View style={styles.chipRow}>
                {STEP_OPTIONS.map((c) => (
                  <PressableScale
                    key={c}
                    onPress={() => setSteppedCount(c)}
                    style={[styles.chip, steppedCount === c && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, steppedCount === c && styles.chipTextActive]}>
                      {`${c} ${t('stepUnit')}`}
                    </Text>
                  </PressableScale>
                ))}
              </View>
              <Text style={styles.paramsNote}>
                {t('stepsNote')}
              </Text>
            </Animated.View>
          )}

          <View style={{ height: 96 }} />
        </ScrollView>

        {/* ── APPLY FOOTER ── */}
        <View style={styles.footerWrap} pointerEvents="box-none">
          <PressableScale
            disabled={!dirty}
            onPress={apply}
            style={[styles.applyBtn, !dirty && styles.applyBtnDisabled]}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={17}
              color={dirty ? Colors.darkText : Colors.muted}
            />
            <Text style={[styles.applyText, !dirty && styles.applyTextDisabled]}>
              {dirty ? t('applyChanges') : t('noChanges')}
            </Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.canvas },
  safeArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 24, gap: 10 },

  // Nav
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCenter: { alignItems: 'center', gap: 2 },
  navTitleEn: { fontFamily: SERIF, fontSize: 15, fontWeight: '700', letterSpacing: 2, color: Colors.ink },
  navTitleFa: { fontSize: 10, color: Colors.muted },
  sidePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 99,
  },
  sidePillL: { backgroundColor: Colors.heatCoreDeep },
  sidePillR: { backgroundColor: Colors.ink },
  sidePillText: { fontFamily: MONO, color: Colors.darkText, fontSize: 10, fontWeight: '700' },

  // Hero
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.dark,
    borderColor: Colors.darkBorder,
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 26,
    elevation: 4,
  },
  heroIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTexts: { flex: 1, gap: 3 },
  heroEn: { fontFamily: MONO, fontSize: 17, fontWeight: '700', letterSpacing: 2, color: Colors.darkText },
  heroFa: { fontSize: 11, color: Colors.darkMuted },
  heroSideTag: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  heroSideTagText: { fontFamily: MONO, fontSize: 8, letterSpacing: 1, color: Colors.darkMuted },

  // Section
  sectionHead: { marginTop: 12, marginBottom: 4, paddingHorizontal: 4 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: Colors.ink },
  sectionSub: { fontSize: 10, color: Colors.muted, marginTop: 2 },

  // Mode row
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 14,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  modeRowActive: {
    borderColor: Colors.heatCoreDeep,
    shadowColor: Colors.heatCore,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4,
  },
  modeRowOff: { borderColor: Colors.ink },
  modeIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceSoft,
  },
  modeIconHeat: { backgroundColor: Colors.heatCoreDeep },
  modeIconDark: { backgroundColor: Colors.ink },
  modeTexts: { flex: 1, gap: 4 },
  modeTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  modeEn: { fontFamily: MONO, fontSize: 12, fontWeight: '700', letterSpacing: 1.5, color: Colors.ink },
  modeEnActive: { color: Colors.heatCoreDeep },
  modeFa: { fontSize: 11, fontWeight: '600', color: Colors.muted },
  modeFaActive: { color: Colors.ink },
  modeDesc: { fontSize: 10, color: Colors.muted, lineHeight: 15 },
  modeDescActive: { color: Colors.inkSoft ?? '#2E2820' },

  // Radio
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.6,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  radioHeat: { backgroundColor: Colors.heatCoreDeep, borderColor: Colors.heatCoreDeep },
  radioDark: { backgroundColor: Colors.ink, borderColor: Colors.ink },

  // Params
  paramsCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  paramsHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  paramsLabel: { fontSize: 11, fontWeight: '700', color: Colors.ink, flex: 1 },
  paramsHint: { fontFamily: MONO, fontSize: 9, color: Colors.muted, letterSpacing: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  chipText: { fontSize: 11, fontWeight: '700', color: Colors.muted },
  chipTextActive: { color: Colors.darkText },
  paramsNote: { fontSize: 10, color: Colors.muted, lineHeight: 15 },

  // Footer
  footerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 10,
    backgroundColor: 'rgba(239,237,229,0.94)',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.ink,
    borderRadius: 16,
    paddingVertical: 15,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 5,
  },
  applyBtnDisabled: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, elevation: 0, shadowOpacity: 0 },
  applyText: { fontSize: 13, fontWeight: '700', color: Colors.darkText, letterSpacing: 0.5 },
  applyTextDisabled: { color: Colors.muted },
});
