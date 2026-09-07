// app/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — Home Dashboard  (v3 · final)
// Dual-boot BLE thermal controller · Expo Router
//
// INTEGRATION DONE: صفحه به useShoeSystem وصل است
// (ترکیب useConnectionStore + useHeatStore) — API قرارداد ShoeStatus حفظ شده
// و بقیه‌ی صفحه مستقل از منبع داده کار می‌کند.
//
// v3:
//  · اصلاح import های Polygon/Polyline (کرش اسپارک‌لاین)
//  · فلش روند دما (↑/↓) در کارت هر کفش
//  · تخمین زمان رسیدن به دمای هدف (ETA) در لجاند
// ─────────────────────────────────────────────────────────────────────────────
import { PressableScale } from '@/components/pressable-scale';
import { useShoeSystem } from '@/hooks/useShoeSystem';
import type { TKey } from '@/i18n/strings';
import { useI18n } from '@/i18n/use-i18n';
import { useScheduleStore } from '@/store/useScheduleStore';
import type { HeatProfile } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Polyline,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS — warm bone / aged leather / brass / terracotta heat
// ─────────────────────────────────────────────────────────────────────────────
const Colors = {
  canvas: '#EFEDE5',
  surface: '#FFFFFF',
  surfaceSoft: '#F7F5ED',
  ink: '#15120D',
  muted: '#8B8578',
  border: '#E2DED2',
  borderStrong: '#D3CCBB',

  heatCore: '#C7420F',
  heatCoreDeep: '#9C330B',
  heatAmber: '#DC9438',
  heatGlow: 'rgba(199, 66, 15, 0.13)',
  comfort: '#3E7A4C',

  success: '#2E6B39',
  warning: '#A9721E',
  danger: '#AE3324',

  dark: '#12100D',
  darkBorder: '#282319',
  darkText: '#F2F0E9',
  darkMuted: '#87806E',

  brassDeep: '#8A7042',
};

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' }) as string;
const SERIF = Platform.select({ ios: 'Palatino', default: 'serif' }) as string;
const SPRING = { damping: 19, stiffness: 165, mass: 0.9 };

// ─────────────────────────────────────────────────────────────────────────────
// SHARED TYPES (قرارداد مشترک پروژه — عیناً طبق مستند)
// ─────────────────────────────────────────────────────────────────────────────
type ShoeSide = 'left' | 'right';
type HeatMode = 'off' | 'constant' | 'timer' | 'stepped' | 'smart' | 'activity';
type ConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'error';
type HeatScope = 'both' | ShoeSide;

interface ShoeStatus {
  side: ShoeSide;
  deviceId: string | null;
  connectionState: ConnectionState;
  batteryPercent: number | null;
  currentTempC: number | null;
  targetTempC: number;
  mode: HeatMode;
  isHeating: boolean;
  lastSeenAt: number | null;
  errorMessage: string | null;
}

// سقف‌های سخت لایه ایمنی — SafetyGuardService
const DIAL = {
  MIN: 20,
  MAX: 45, // hard cap
  CX: 150,
  CY: 150,
  R: 120,
  COMFORT_LO: 36,
  COMFORT_HI: 40,
};
const DIAL_LEN = Math.PI * DIAL.R;
const toProgress = (t: number) => (t - DIAL.MIN) / (DIAL.MAX - DIAL.MIN);

const arcPoint = (t: number, r: number = DIAL.R) => {
  const a = ((1 - toProgress(t)) * 180 * Math.PI) / 180;
  return { x: DIAL.CX + Math.cos(a) * r, y: DIAL.CY - Math.sin(a) * r };
};

// ─────────────────────────────────────────────────────────────────────────────
// DATA LAYER — واقعی: useShoeSystem (useConnectionStore + useHeatStore)
// تله‌متری زنده از src/ble/ShoeDevice.ts وارد store ها می‌شود.
// ─────────────────────────────────────────────────────────────────────────────

// تاریخچه‌ی دما برای اسپارک‌لاین — خارج از قرارداد store
function useTempHistory(temp: number | null, maxPoints = 40) {
  const [history, setHistory] = useState<number[]>(() => (temp == null ? [] : [temp]));
  useEffect(() => {
    if (temp == null) return;
    setHistory((prev) => {
      const next = [...prev, temp];
      return next.length > maxPoints ? next.slice(next.length - maxPoints) : next;
    });
  }, [temp, maxPoints]);
  return history;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

const TactileCard = ({
  children,
  style,
  delay = 0,
}: {
  children: React.ReactNode;
  style?: object | object[];
  delay?: number;
}) => (
  <Animated.View entering={FadeInDown.delay(delay).springify()} style={[styles.card, style]}>
    <View style={styles.cardHighlight} pointerEvents="none" />
    {children}
  </Animated.View>
);

// ── نوار پروفایل‌های ذخیره‌شده روی داشبورد (اعمال فوری با یک لمس) ──
// PROFILES = تنظیمات ذخیره‌شدهٔ دستی — با لمس بلافاصله روی هر دو کفش اعمال می‌شوند.
// برتری این نوار نسبت به «زمان‌بندی»: اجرای بلافاصله و در دسترس بودن در همان خانه.
const ProfileStrip = () => {
  const { t } = useI18n();
  const profiles = useScheduleStore((s) => s.profiles);
  const activeId = useScheduleStore((s) => s.activeProfileId);

  const apply = useCallback(
    (profile: HeatProfile) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      void useScheduleStore.getState().applyProfile(profile.id, 'both');
    },
    [],
  );

  if (profiles.length === 0) return null;

  return (
    <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.stripWrap}>
      <View style={styles.stripHead}>
        <Text style={styles.stripTitle}>{t('activeProfile')}</Text>
        <Text style={styles.stripSub}>{t('homeProfilesSub')}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stripRow}
      >
        {profiles.map((p, i) => {
          const active = p.id === activeId;
          return (
            <PressableScale
              key={p.id}
              onPress={() => apply(p)}
              style={[
                styles.stripChip,
                active && styles.stripChipOn,
                { borderColor: `${p.tint}44` },
                active && { backgroundColor: p.tint },
              ]}
            >
              <Ionicons name={p.icon} size={13} color={active ? Colors.darkText : p.tint} />
              <Text style={[styles.stripChipText, active && styles.stripChipTextOn]} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={[styles.stripChipTemp, active && styles.stripChipTempOn]}>{`${p.targetTempC}°`}</Text>
            </PressableScale>
          );
        })}
        <View style={{ width: 4 }} />
      </ScrollView>
    </Animated.View>
  );
};


const ConnectionDot = ({ state }: { state: ConnectionState }) => {
  const color =
    state === 'connected'
      ? Colors.success
      : state === 'error'
        ? Colors.danger
        : state === 'disconnected'
          ? Colors.muted
          : Colors.warning;
  return <View style={[styles.connDot, { backgroundColor: color }]} />;
};

const BatteryBars = ({ pct }: { pct: number | null }) => (
  <View style={styles.batRow}>
    {[0, 1, 2, 3, 4].map((i) => {
      const on = pct != null && pct > i * 20;
      const low = pct != null && pct <= 20;
      return (
        <View
          key={i}
          style={[styles.batSeg, { backgroundColor: on ? (low ? Colors.danger : Colors.ink) : Colors.border }]}
        />
      );
    })}
  </View>
);

const fmtTemp = (v: number | null) => (v == null ? '--' : v.toFixed(1));

// ─────────────────────────────────────────────────────────────────────────────
// TEMP SPARKLINE
// ─────────────────────────────────────────────────────────────────────────────
const SPARK_W = 100;
const SPARK_H = 32;
const SPARK_LO = 18;
const SPARK_HI = 45;

const sparkY = (v: number) =>
  SPARK_H - ((Math.min(SPARK_HI, Math.max(SPARK_LO, v)) - SPARK_LO) / (SPARK_HI - SPARK_LO)) * (SPARK_H - 4) - 2;

function TempSparkline({ history, active }: { history: number[]; active: boolean }) {
  const stroke = active ? Colors.heatCore : Colors.muted;
  const points = useMemo(() => {
    if (history.length < 2) return '';
    const step = SPARK_W / (history.length - 1);
    return history
      .map((v, i) => `${(i * step).toFixed(1)},${sparkY(v).toFixed(1)}`)
      .join(' ');
  }, [history]);

  if (!points) return <View style={{ height: SPARK_H }} />;

  return (
    <Svg width="100%" height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="gSparkFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stroke} stopOpacity={0.22} />
          <Stop offset="1" stopColor={stroke} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect
        x={0}
        y={sparkY(DIAL.COMFORT_HI)}
        width={SPARK_W}
        height={sparkY(DIAL.COMFORT_LO) - sparkY(DIAL.COMFORT_HI)}
        fill={Colors.comfort}
        opacity={0.08}
      />
      <Polygon points={`0,${SPARK_H} ${points} ${SPARK_W},${SPARK_H}`} fill="url(#gSparkFill)" />
      <Polyline points={points} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={SPARK_W} cy={sparkY(history[history.length - 1] ?? 22)} r={2.2} fill={stroke} />
    </Svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// THERMAL BOOT — pseudo-3D SVG model + heat particles + scan line + tap-to-walk
// ─────────────────────────────────────────────────────────────────────────────
const BOOT_UPPER_D = [
  'M 130 40',
  'C 125 74, 116 104, 101 128',
  'C 92 143, 66 152, 46 168',
  'C 32 179, 25 190, 28 201',
  'C 30 208, 37 211, 47 211',
  'L 196 211',
  'C 208 211, 214 205, 214 193',
  'C 213 158, 209 104, 207 47',
  'C 206.6 41, 202 39, 196 39',
  'L 130 40',
  'Z',
].join(' ');

const BOOT_QUARTER_D = [
  'M 101 128',
  'C 92 143, 66 152, 46 168',
  'C 32 179, 25 190, 28 201',
  'C 30 208, 37 211, 47 211',
  'L 110 211',
  'C 106 190, 104 170, 106 150',
  'C 107 142, 104 134, 101 128',
  'Z',
].join(' ');

const TOE_CAP_D = [
  'M 30 200',
  'C 34 190, 44 182, 60 178',
  'C 80 173, 100 175, 112 184',
  'C 118 189, 118 198, 112 205',
  'C 100 213, 60 214, 40 210',
  'C 33 208, 28 205, 30 200',
  'Z',
].join(' ');

const BOOT_SOLE_D = [
  'M 36 209',
  'L 202 209',
  'C 218 209, 227 216, 227 227',
  'C 227 236, 220 240, 209 240',
  'L 44 240',
  'C 30 240, 24 233, 24 224',
  'C 24 216, 29 209, 36 209',
  'Z',
].join(' ');

const MIDSOLE_D = [
  'M 34 205',
  'L 204 205',
  'C 214 205, 220 209, 221 215',
  'L 21 215',
  'C 24 209, 29 205, 34 205',
  'Z',
].join(' ');

function HeatParticle({ heating, index }: { heating: boolean; index: number }) {
  const t = useSharedValue(0);
  const dur = 2200 + index * 420;
  // خوشه زیر پنجه — ردههای گرما از زیر پنجه بالا میروند
  const left = 36 + index * 8.5;
  const w = 2.6 + (index % 2) * 1.8;
  const h = 6 + (index % 3) * 3.5;

  useEffect(() => {
    if (heating) {
      t.value = withDelay(index * 480, withRepeat(withTiming(1, { duration: dur, easing: Easing.in(Easing.quad) }), -1, false));
    } else {
      t.value = withTiming(0, { duration: 300 });
    }
  }, [heating, dur, index]);

  const style = useAnimatedStyle(() => ({
    opacity: heating ? (1 - t.value) * 0.55 * (t.value > 0.02 ? 1 : 0) : 0,
    transform: [
      { translateY: -t.value * 132 },
      { translateX: Math.sin(t.value * Math.PI * 2 + index) * 5 },
      { scale: 1 - t.value * 0.35 },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: `${left}%` as never,
          bottom: '34%',
          width: w,
          height: h,
          borderRadius: 2.5,
          backgroundColor: '#FF8A4D',
        },
        style,
      ]}
    />
  );
}

function ThermalBoot({ heating, connected, onTap }: { heating: boolean; connected: boolean; onTap: () => void }) {
  const { t } = useI18n();
  const bob = useSharedValue(0);
  const idleTilt = useSharedValue(0);
  const glow = useSharedValue(0);
  const sweep = useSharedValue(0);

  const strideRot = useSharedValue(0);
  const strideX = useSharedValue(0);
  const squash = useSharedValue(0);
  const [stepping, setStepping] = useState(false);

  useEffect(() => {
    bob.value = withRepeat(withSequence(withTiming(-4, { duration: 2600 }), withTiming(0, { duration: 2600 })), -1, true);
    idleTilt.value = withRepeat(withSequence(withTiming(1, { duration: 3400 }), withTiming(-1, { duration: 3400 })), -1, true);
  }, []);

  useEffect(() => {
    glow.value = heating
      ? withRepeat(withSequence(withTiming(1, { duration: 1500 }), withTiming(0.38, { duration: 1500 })), -1, true)
      : withTiming(0, { duration: 500 });
  }, [heating]);

  useEffect(() => {
    sweep.value = connected
      ? withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.quad) }), -1, false)
      : 0;
  }, [connected]);

  const runStep = useCallback(() => {
    if (stepping) return;
    setStepping(true);
    const EASE_UP = Easing.out(Easing.cubic);
    const EASE_DOWN = Easing.in(Easing.cubic);

    strideRot.value = withSequence(
      withTiming(-7, { duration: 190, easing: EASE_UP }),
      withTiming(5, { duration: 180, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 220, easing: EASE_DOWN }),
    );
    strideX.value = withSequence(withTiming(-3, { duration: 190 }), withTiming(4, { duration: 260 }), withTiming(0, { duration: 220 }));
    bob.value = withSequence(
      withTiming(-14, { duration: 190, easing: EASE_UP }),
      withTiming(2, { duration: 260, easing: EASE_DOWN }),
      withTiming(-4, { duration: 220 }),
    );
    squash.value = withDelay(360, withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 260 })));

    setTimeout(() => setStepping(false), 700);
  }, [stepping]);

  const handlePress = () => {
    runStep();
    onTap();
  };

  const bobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: bob.value },
      { translateX: strideX.value },
      { rotate: `${idleTilt.value + strideRot.value}deg` },
      { scaleY: 1 - squash.value * 0.015 },
    ],
  }));

  const glowProps = useAnimatedProps<{ opacity: number }>(() => ({ opacity: glow.value }));
  const warmProps = useAnimatedProps<{ opacity: number }>(() => ({ opacity: glow.value * 0.1 }));
  // پنجه: نارنجی روشن مثل هیترِ زیر پنجه
  const toeProps = useAnimatedProps<{ opacity: number }>(() => ({ opacity: 0.3 + glow.value * 0.55 }));
  const shadowProps = useAnimatedProps<{ rx: number; opacity: number }>(() => {
    const lift = Math.abs(strideRot.value) / 7 + squash.value * 0.4;
    return {
      rx: 90 - lift * 12,
      opacity: 0.9 - lift * 0.28,
    };
  });

  const sweepStyle = useAnimatedStyle(() => ({
    opacity: connected ? 0.1 : 0,
    transform: [{ translateY: sweep.value * 320 - 40 }],
  }));

  return (
    <Pressable onPress={handlePress} style={styles.bootStage} hitSlop={12}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 260 250">
        <Defs>
          <RadialGradient id="gShadow" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="rgba(0,0,0,0.34)" />
            <Stop offset="1" stopColor="rgba(0,0,0,0)" />
          </RadialGradient>
        </Defs>
        <Circle cx={130} cy={150} r={104} stroke="rgba(242,240,233,0.06)" strokeWidth={1} strokeDasharray="2 7" fill="none" />
        <Circle cx={130} cy={150} r={72} stroke="rgba(242,240,233,0.045)" strokeWidth={1} strokeDasharray="2 9" fill="none" />
        <Line x1={16} y1={247} x2={244} y2={247} stroke="rgba(242,240,233,0.09)" strokeWidth={1} strokeDasharray="2 7" />
        <AnimatedEllipse cx={130} cy={244} ry={7} fill="url(#gShadow)" animatedProps={shadowProps} />
      </Svg>

      <Animated.View pointerEvents="none" style={[styles.scanLine, sweepStyle]} />

      <Animated.View style={[StyleSheet.absoluteFill, bobStyle]}>
        {[0, 1, 2, 3].map((i) => (
          <HeatParticle key={i} index={i} heating={heating} />
        ))}

        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 260 250">
          <Defs>
            <RadialGradient id="gHalo" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="rgba(199,66,15,0.26)" />
              <Stop offset="1" stopColor="rgba(199,66,15,0)" />
            </RadialGradient>
            <RadialGradient id="gHeat" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="rgba(255,120,58,0.85)" />
              <Stop offset="0.6" stopColor="rgba(199,66,15,0.32)" />
              <Stop offset="1" stopColor="rgba(199,66,15,0)" />
            </RadialGradient>
            <LinearGradient id="gLeather" x1="0.1" y1="0" x2="0.85" y2="1">
              <Stop offset="0" stopColor="#7C5638" />
              <Stop offset="0.45" stopColor="#523823" />
              <Stop offset="1" stopColor="#2E1F14" />
            </LinearGradient>
            <LinearGradient id="gQuarter" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#3C2A1B" />
              <Stop offset="1" stopColor="#1F150D" />
            </LinearGradient>
            <LinearGradient id="gToe" x1="0" y1="0" x2="0.2" y2="1">
              <Stop offset="0" stopColor="#9C7250" />
              <Stop offset="0.5" stopColor="#6B4A30" />
              <Stop offset="1" stopColor="#402C1C" />
            </LinearGradient>
            <LinearGradient id="gCollar" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#F1E6CE" />
              <Stop offset="1" stopColor="#CBB68C" />
            </LinearGradient>
            <LinearGradient id="gSole" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#2C2019" />
              <Stop offset="1" stopColor="#15100B" />
            </LinearGradient>
            <LinearGradient id="gMidsole" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#E7DCC0" />
              <Stop offset="1" stopColor="#BCA97E" />
            </LinearGradient>
            <LinearGradient id="gBrass" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#D8BC82" />
              <Stop offset="1" stopColor="#8A7042" />
            </LinearGradient>
          </Defs>

          <AnimatedCircle cx={130} cy={148} r={98} fill="url(#gHalo)" animatedProps={glowProps} />

          <Path d={BOOT_UPPER_D} fill="url(#gLeather)" />
          <Path d={BOOT_QUARTER_D} fill="url(#gQuarter)" opacity={0.85} />
          <AnimatedPath d={BOOT_UPPER_D} fill="#FF6B33" animatedProps={warmProps} />

          <Path d="M 138 46 C 132 82, 120 112, 106 136" stroke="rgba(255,240,220,0.30)" strokeWidth={1.4} strokeLinecap="round" fill="none" />
          <Path d="M 198 50 C 201 100, 203 150, 202 191" stroke="rgba(0,0,0,0.22)" strokeWidth={5} strokeLinecap="round" fill="none" />
          <Path d="M 54 170 Q 36 182 38 198" stroke="rgba(255,255,255,0.10)" strokeWidth={6} strokeLinecap="round" fill="none" />
          <Path d="M 60 160 Q 74 168 70 182" stroke="rgba(0,0,0,0.20)" strokeWidth={2} strokeLinecap="round" fill="none" />
          <Path d="M 82 148 Q 94 156 90 170" stroke="rgba(0,0,0,0.16)" strokeWidth={2} strokeLinecap="round" fill="none" />

          <Rect x={132} y={62} width={64} height={11} rx={5} fill="#211609" opacity={0.92} />
          <Rect x={186} y={59.5} width={12} height={16} rx={2.5} fill="url(#gBrass)" stroke={Colors.brassDeep} strokeWidth={0.5} />
          <Rect x={132} y={88} width={64} height={11} rx={5} fill="#211609" opacity={0.92} />
          <Rect x={186} y={85.5} width={12} height={16} rx={2.5} fill="url(#gBrass)" stroke={Colors.brassDeep} strokeWidth={0.5} />
          <Circle cx={192} cy={64.5} r={1.6} fill="#3A2A16" />
          <Circle cx={192} cy={90.5} r={1.6} fill="#3A2A16" />

          <Rect x={118} y={24} width={96} height={25} rx={12.5} fill="url(#gCollar)" />
          {[128, 141, 154, 167, 180, 193, 206].map((cx) => (
            <Circle key={cx} cx={cx} cy={49} r={3.3} fill="#E4D6B4" />
          ))}
          {[128, 141, 154, 167, 180, 193, 206].map((cx) => (
            <Circle key={`hi-${cx}`} cx={cx - 1} cy={47.5} r={1.1} fill="#FBF3E2" opacity={0.7} />
          ))}

          <Path d="M 46 199 C 92 195, 158 195, 200 199" stroke="#E4D9BC" strokeWidth={1.4} strokeDasharray="4 4" fill="none" opacity={0.32} />
          <Path d="M 100 42 C 102 78, 100 112, 92 140" stroke="#E4D9BC" strokeWidth={1.2} strokeDasharray="3 5" fill="none" opacity={0.22} />

          <Path d={TOE_CAP_D} fill="url(#gToe)" />
          <AnimatedPath d={TOE_CAP_D} fill="#FF6B33" animatedProps={toeProps} />
          <Path d={TOE_CAP_D} stroke="rgba(255,255,255,0.14)" strokeWidth={1} fill="none" />

          <Path d={MIDSOLE_D} fill="url(#gMidsole)" />
          <Path d={BOOT_SOLE_D} fill="url(#gSole)" />
          <Path
            d="M 58 217 L 58 232 M 88 217 L 88 232 M 118 217 L 118 232 M 148 217 L 148 232 M 178 217 L 178 232"
            stroke="rgba(0,0,0,0.32)"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <Path d="M 40 224 L 210 224" stroke="rgba(255,255,255,0.05)" strokeWidth={1} />

          <AnimatedCircle cx={62} cy={200} r={32} fill="url(#gHeat)" animatedProps={glowProps} />
          <AnimatedCircle cx={178} cy={217} r={21} fill="url(#gHeat)" animatedProps={glowProps} />
        </Svg>
      </Animated.View>

      <View style={[styles.bracket, styles.bracketTL]} />
      <View style={[styles.bracket, styles.bracketTR]} />
      <View style={[styles.bracket, styles.bracketBL]} />
      <View style={[styles.bracket, styles.bracketBR]} />

      <View style={styles.tapHint} pointerEvents="none">
        <Ionicons name="footsteps-outline" size={13} color={Colors.darkMuted} />
        <Text style={styles.tapHintText}>{t('tapHint')}</Text>
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HEAT DIAL — semi-circle, drag-to-set, comfort zone + glowing knob
// ─────────────────────────────────────────────────────────────────────────────
const TRACK_D = `M ${DIAL.CX - DIAL.R} ${DIAL.CY} A ${DIAL.R} ${DIAL.R} 0 0 1 ${DIAL.CX + DIAL.R} ${DIAL.CY}`;

const COMFORT_D = (() => {
  const a = arcPoint(DIAL.COMFORT_LO);
  const b = arcPoint(DIAL.COMFORT_HI);
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${DIAL.R} ${DIAL.R} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
})();

function HeatDial({ temp, onChange }: { temp: number; onChange: (t: number) => void }) {
  const progressSV = useSharedValue(toProgress(temp));
  const scaleSV = useSharedValue(1);
  const dragSV = useSharedValue(0);
  const lastTempRef = useRef(temp);

  const commitTemp = (t: number) => {
    if (t === lastTempRef.current) return;
    lastTempRef.current = t;
    onChange(t);
  };

  const fromTouch = (x: number, y: number) => {
    'worklet';
    const s = scaleSV.value;
    const px = x * s;
    const py = y * s;
    let deg = (Math.atan2(-(py - DIAL.CY), px - DIAL.CX) * 180) / Math.PI;
    if (deg < 0) deg = px < DIAL.CX ? 180 : 0;
    deg = Math.min(180, Math.max(0, deg));
    const p = 1 - deg / 180;
    progressSV.value = p;
    runOnJS(commitTemp)(Math.round(DIAL.MIN + p * (DIAL.MAX - DIAL.MIN)));
  };

  const gesture = Gesture.Pan()
    .onBegin((e) => {
      dragSV.value = 1;
      fromTouch(e.x, e.y);
    })
    .onUpdate((e) => fromTouch(e.x, e.y))
    .onFinalize(() => {
      dragSV.value = 0;
    });

  useEffect(() => {
    lastTempRef.current = temp;
    if (dragSV.value === 0) {
      progressSV.value = withSpring(toProgress(temp), SPRING);
    }
  }, [temp]);

  const dashProps = useAnimatedProps<{ strokeDashoffset: number }>(() => ({
    strokeDashoffset: DIAL_LEN * (1 - progressSV.value),
  }));

  const knobProps = useAnimatedProps<{ cx: number; cy: number }>(() => {
    const a = ((1 - progressSV.value) * 180 * Math.PI) / 180;
    return { cx: DIAL.CX + Math.cos(a) * DIAL.R, cy: DIAL.CY - Math.sin(a) * DIAL.R };
  });

  const ticks = useMemo(() => {
    const arr: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    for (let t = DIAL.MIN; t <= DIAL.MAX; t += 5) {
      const a = ((180 - toProgress(t) * 180) * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const major = t % 10 === 0;
      arr.push({
        x1: DIAL.CX + cos * (major ? 98 : 101),
        y1: DIAL.CY - sin * (major ? 98 : 101),
        x2: DIAL.CX + cos * 109,
        y2: DIAL.CY - sin * 109,
        major,
      });
    }
    return arr;
  }, []);

  const inComfort = temp >= DIAL.COMFORT_LO && temp <= DIAL.COMFORT_HI;

  return (
    <View
      style={{ width: '100%', aspectRatio: 300 / 172 }}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0) scaleSV.value = 300 / w;
      }}
    >
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill}>
          <Svg style={StyleSheet.absoluteFill} viewBox="0 0 300 172">
            <Defs>
              <LinearGradient id="gArc" x1={30} y1={0} x2={270} y2={0} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={Colors.heatAmber} />
                <Stop offset="1" stopColor={Colors.heatCoreDeep} />
              </LinearGradient>
              <RadialGradient id="gKnobGlow" cx="0.5" cy="0.5" r="0.5">
                <Stop offset="0" stopColor="rgba(199,66,15,0.45)" />
                <Stop offset="1" stopColor="rgba(199,66,15,0)" />
              </RadialGradient>
            </Defs>

            {ticks.map((t, i) => (
              <Line
                key={i}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke={t.major ? Colors.borderStrong : Colors.border}
                strokeWidth={t.major ? 2.4 : 1.6}
                strokeLinecap="round"
              />
            ))}
            <SvgText x={60} y={149} fontSize={9} fontFamily={MONO} fill={Colors.muted} textAnchor="middle">
              20
            </SvgText>
            <SvgText x={240} y={149} fontSize={9} fontFamily={MONO} fill={Colors.muted} textAnchor="middle">
              45
            </SvgText>

            <Path d={TRACK_D} stroke={Colors.border} strokeWidth={14} strokeLinecap="round" fill="none" />
            <Path d={COMFORT_D} stroke={Colors.comfort} strokeWidth={14} strokeLinecap="butt" fill="none" opacity={0.28} />
            <AnimatedPath
              d={TRACK_D}
              stroke="url(#gArc)"
              strokeWidth={14}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={DIAL_LEN}
              animatedProps={dashProps}
            />

            <SvgText x={150} y={120} fontSize={44} fontWeight="700" fontFamily={MONO} fill={Colors.ink} textAnchor="middle">
              {`${temp}°`}
            </SvgText>
            <SvgText x={150} y={140} fontSize={8} fontFamily={MONO} fill={inComfort ? Colors.comfort : Colors.muted} textAnchor="middle">
              {inComfort ? 'COMFORT ZONE' : 'CELSIUS'}
            </SvgText>

            <AnimatedCircle r={24} fill="url(#gKnobGlow)" animatedProps={knobProps} />
            <AnimatedCircle r={12} fill="#FFFFFF" stroke={Colors.heatCoreDeep} strokeWidth={3} animatedProps={knobProps} />
            <AnimatedCircle r={4} fill={Colors.heatCoreDeep} animatedProps={knobProps} />
          </Svg>
        </View>
      </GestureDetector>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
const MODE_META: Record<HeatMode, { icon: keyof typeof Ionicons.glyphMap; key: TKey }> = {
  off: { icon: 'power-outline', key: 'modeOff' },
  constant: { icon: 'flame-outline', key: 'modeConstant' },
  timer: { icon: 'timer-outline', key: 'modeTimer' },
  stepped: { icon: 'trending-up-outline', key: 'modeStepped' },
  smart: { icon: 'bulb-outline', key: 'modeSmart' },
  activity: { icon: 'fitness-outline', key: 'modeActivity' },
};

const QUICK_ACTIONS: { icon: keyof typeof Ionicons.glyphMap; key: TKey; route: string; tint: string }[] = [
  { icon: 'calendar-outline', key: 'quickSchedule', route: '/schedule', tint: '#4A6B8A' },
  { icon: 'layers-outline', key: 'quickProfiles', route: '/profiles', tint: '#7A5EA0' },
  { icon: 'battery-half-outline', key: 'quickBattery', route: '/battery-history', tint: '#3E7A4C' },
  { icon: 'bluetooth-outline', key: 'quickDevices', route: '/scan', tint: '#B0623A' },
];

export default function HomeScreen() {
  const { t, isFa, toggleLang } = useI18n();
  const { status, setTargetTemp, setMode } = useShoeSystem();
  const [scope, setScope] = useState<HeatScope>('both');
  const lastActiveMode = useRef<HeatMode>('smart');

  const sides: ShoeSide[] = ['left', 'right'];
  const activeSide: ShoeSide = scope === 'both' ? 'left' : scope;
  const dialTemp = status[activeSide].targetTempC;
  const currentMode: HeatMode = status[activeSide].mode;

  const connectedCount = sides.filter((s) => status[s].connectionState === 'connected').length;
  const allConnected = connectedCount === 2;
  const anyHeating = sides.some((s) => status[s].isHeating && status[s].connectionState === 'connected');
  const asymmetric =
    (status.left.connectionState === 'connected') !== (status.right.connectionState === 'connected');
  const minBattery = Math.min(...sides.map((s) => status[s].batteryPercent ?? 0));

  const temps = sides.map((s) => status[s].currentTempC).filter((t): t is number => t != null);
  const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
  const duty = anyHeating && avgTemp != null ? Math.round(35 + Math.min(1, Math.max(0, (avgTemp - 20) / 25)) * 45) : 0;

  // ETA تخمینی رسیدن به دمای هدف — heuristic دمو؛ در نسخه‌ی واقعی از SafetyGuardService می‌آید
  const etaMinutes = (() => {
    const cur = status[activeSide].currentTempC;
    if (cur == null || !anyHeating) return null;
    const diff = Math.abs(dialTemp - cur);
    if (diff < 0.4) return 0;
    return Math.max(1, Math.round(diff * 1.4));
  })();

  const leftHistory = useTempHistory(status.left.currentTempC);
  const rightHistory = useTempHistory(status.right.currentTempC);

  const changeScope = (next: HeatScope) => {
    if (next === scope) return;
    if (next === 'both') {
      setTargetTemp('both', status[activeSide].targetTempC);
      setMode('both', status[activeSide].mode);
    }
    setScope(next);
  };

  const bump = (d: number) => setTargetTemp(scope, dialTemp + d);

  const togglePower = () => {
    if (currentMode === 'off') {
      setMode('both', lastActiveMode.current === 'off' ? 'smart' : lastActiveMode.current);
    } else {
      lastActiveMode.current = currentMode;
      setMode('both', 'off');
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* ── TOP NAV ── */}
        <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.topNav}>
          <View style={styles.navLeft}>
                        <Text style={styles.navTitleEn}>Qartal</Text>
            <Text style={styles.navTitleFa}>{t('homeTagline')}</Text>
          </View>
          <View style={styles.navPills}>
            <Pressable style={styles.pill} onPress={() => router.push('/scan')}>
              <Ionicons name="bluetooth-outline" size={14} color={Colors.darkText} />
              <Text style={styles.pillText}>{`${connectedCount}/2`}</Text>
            </Pressable>
            <Pressable style={styles.pill} onPress={() => router.push('/battery-history')}>
              <Text style={styles.pillText}>{`${Math.round(minBattery)}% BAT`}</Text>
            </Pressable>
            <Pressable style={styles.pill} onPress={toggleLang} hitSlop={8} accessibilityLabel="Language">
              <Ionicons name="language-outline" size={14} color={Colors.darkText} />
              <Text style={styles.pillText}>{isFa ? 'EN' : 'FA'}</Text>
            </Pressable>
            <Pressable
              onPress={togglePower}
              style={[styles.powerBtn, currentMode !== 'off' && styles.powerBtnOn]}
              hitSlop={8}
            >
              <Ionicons name="power" size={16} color={currentMode !== 'off' ? Colors.darkText : Colors.muted} />
            </Pressable>
          </View>
                </Animated.View>

        {/* ── PROFILE STRIP — اعمال فوری در همان خانه ── */}
        <ProfileStrip />

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* ── هشدار قطع نامتقارن ── */}
          {asymmetric && (
            <View style={styles.warnBanner}>
              <Ionicons name="warning-outline" size={16} color={Colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.warnFa}>{t('warnAsym')}</Text>
                <Text style={styles.warnEn}>ASYMMETRIC DISCONNECT</Text>
              </View>
            </View>
          )}

          {/* ── THERMAL MODEL — DARK HERO ── */}
          <TactileCard delay={120} style={styles.viewerCard}>
            <View style={styles.viewerHeader}>
              <View>
                <Text style={styles.viewerTitle}>THERMAL MODEL</Text>
                <Text style={styles.viewerSub}>{t('thermalModel')}</Text>
              </View>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: anyHeating ? Colors.heatCore : Colors.darkMuted }]} />
                <Text style={[styles.statusText, { color: anyHeating ? Colors.heatCore : Colors.darkMuted }]}>
                  {anyHeating ? t('heating') : t('standby')}
                </Text>
              </View>
            </View>

            <ThermalBoot heating={anyHeating} connected={allConnected} onTap={() => {}} />

            <View style={styles.viewerLegend}>
              {(['left', 'right'] as const).map((side) => (
                <View key={side} style={styles.legendItem}>
                  <ConnectionDot state={status[side].connectionState} />
                  <Text style={styles.legendLabel}>{side === 'left' ? 'L' : 'R'}</Text>
                  <Text style={styles.legendValue}>{`${fmtTemp(status[side].currentTempC)}°`}</Text>
                </View>
              ))}
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={styles.legendDuty}>{`${t('duty')} ${duty}%`}</Text>
                {etaMinutes != null && (
                  <Text style={styles.legendEta}>
                    {etaMinutes === 0 ? t('etaAtTarget') : `${t('etaMin')} ~${etaMinutes} ${isFa ? 'دقیقه' : 'MIN'}`}
                  </Text>
                )}
              </View>
            </View>
          </TactileCard>

          {/* ── PER-SHOE STATS + SPARKLINE ── */}
          <View style={styles.statsRow}>
            {(['left', 'right'] as const).map((side, i) => {
              const s = status[side];
              const heating = s.isHeating && s.connectionState === 'connected';
              const history = side === 'left' ? leftHistory : rightHistory;
              const trend =
                history.length >= 2 ? history[history.length - 1] - history[history.length - 2] : 0;
              return (
                <TactileCard key={side} delay={220 + i * 80} style={styles.statCard}>
                  <Pressable onPress={() => router.push({ pathname: '/device-settings/[side]', params: { side } })}>
                    <View style={styles.statHead}>
                      <Text style={styles.statLabel}>{side === 'left' ? t('statLeft') : t('statRight')}</Text>
                      <View style={styles.statHeadRight}>
                        {heating && (
                          <View style={styles.heatTag}>
                            <Ionicons name="flame" size={12} color={Colors.darkText} />
                          </View>
                        )}
                        <ConnectionDot state={s.connectionState} />
                      </View>
                    </View>
                    <View style={styles.statValueRow}>
                      <Text style={[styles.statValue, heating && styles.statValueHeating]}>
                        {`${fmtTemp(s.currentTempC)}°`}
                      </Text>
                      {Math.abs(trend) >= 0.05 && (
                        <Ionicons
                          name={trend > 0 ? 'arrow-up' : 'arrow-down'}
                          size={13}
                          color={trend > 0 ? Colors.heatCore : Colors.success}
                        />
                      )}
                    </View>
                    <TempSparkline history={history} active={heating} />
                    <View style={styles.statFoot}>
                      <Text style={styles.statSet}>{`SET ${s.targetTempC}°`}</Text>
                      <BatteryBars pct={s.batteryPercent} />
                      <Text style={styles.statBat}>{`${s.batteryPercent == null ? '--' : Math.round(s.batteryPercent)}%`}</Text>
                    </View>
                  </Pressable>
                </TactileCard>
              );
            })}
          </View>

          {/* ── TARGET DIAL ── */}
          <TactileCard delay={380} style={styles.dialCard}>
            <View style={styles.dialHead}>
              <View>
                <Text style={[styles.sectionLabel, isFa && styles.faSection]}>{t('targetTemp')}</Text>
              </View>
              <View style={styles.scopeChips}>
                {(['both', 'left', 'right'] as const).map((sc) => (
                  <Pressable
                    key={sc}
                    onPress={() => changeScope(sc)}
                    style={[styles.scopeChip, scope === sc && styles.scopeChipActive]}
                  >
                    <Text style={[styles.scopeChipText, scope === sc && styles.scopeChipTextActive]}>
                      {sc === 'both' ? t('scopeBoth') : sc === 'left' ? t('scopeLeft') : t('scopeRight')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <HeatDial temp={dialTemp} onChange={(t) => setTargetTemp(scope, t)} />

            <View style={styles.dialControls}>
              <Pressable style={styles.dialBtn} onPress={() => bump(-1)}>
                <Ionicons name="remove" size={22} color={Colors.ink} />
              </Pressable>
              <View style={styles.dialHelperWrap}>
                <View style={[styles.comfortDot]} />
                <Text style={styles.dialHelper}>{t('comfortZone')}</Text>
              </View>
              <Pressable style={styles.dialBtn} onPress={() => bump(1)}>
                <Ionicons name="add" size={22} color={Colors.ink} />
              </Pressable>
            </View>
          </TactileCard>

          {/* ── OPERATING MODE ── */}
          <TactileCard delay={460} style={styles.modesCard}>
            <View style={styles.modesHead}>
              <Text style={[styles.sectionLabel, isFa && styles.faSection]}>{t('operatingMode')}</Text>
            </View>
            <View style={styles.modesGrid}>
              {(Object.keys(MODE_META) as HeatMode[]).map((m) => {
                const active = currentMode === m;
                const meta = MODE_META[m];
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMode(scope, m)}
                    style={[
                      styles.modeCell,
                      active && (m === 'off' ? styles.modeCellDark : styles.modeCellHeat),
                    ]}
                  >
                    <View style={[styles.modeIcon, active && styles.modeIconActive]}>
                      <Ionicons name={meta.icon} size={18} color={active ? Colors.darkText : Colors.muted} />
                    </View>
                    <Text style={[isFa ? styles.modeFa : styles.modeEn, active && (isFa ? styles.modeFaActive : styles.modeTextActive)]}>{t(meta.key)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </TactileCard>

          {/* ── SAFETY GUARD ── */}
          <TactileCard delay={540} style={styles.safetyCard}>
            <View style={styles.safetyIconWrap}>
              <Ionicons name="shield-checkmark-outline" size={18} color={Colors.heatCoreDeep} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionLabel, isFa && styles.faSection]}>{t('safetyGuard')}</Text>
            </View>
            <Text style={styles.safetyLimit}>{'≤45.0°C · ≤120 MIN'}</Text>
          </TactileCard>

          {/* ── QUICK ACTIONS — 2×2 GRID ── */}
          <View style={styles.quickGrid}>
            {QUICK_ACTIONS.map((a, i) => (
              <TactileCard key={a.route} delay={620 + i * 60} style={styles.quickTile}>
                <Pressable style={styles.quickInner} onPress={() => router.push(a.route as never)}>
                  <View style={[styles.quickIcon, { backgroundColor: `${a.tint}1A` }]}>
                    <Ionicons name={a.icon} size={20} color={a.tint} />
                  </View>
                  <View style={styles.quickTexts}>
                    <Text style={isFa ? styles.quickFa : styles.quickEn}>{t(a.key)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={Colors.borderStrong} />
                </Pressable>
              </TactileCard>
            ))}
          </View>

          <Text style={styles.footerTag}>{t('footerTag')}</Text>
          <View style={{ height: 24 }} />
        </ScrollView>
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

  // Profile strip
  stripWrap: { paddingHorizontal: 4, paddingTop: 6, paddingBottom: 2 },
  stripHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  stripTitle: { fontFamily: MONO, fontSize: 9, fontWeight: '700', color: Colors.muted, letterSpacing: 1.5 },
  stripSub: { fontSize: 8, color: Colors.muted, opacity: 0.7 },
  stripRow: { gap: 6, paddingHorizontal: 2 },
  stripChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 8,
    minWidth: 90,
  },
  stripChipOn: {
    borderWidth: 0,
    shadowColor: Colors.heatCore,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 4,
  },
  stripChipText: { fontSize: 10.5, fontWeight: '700', color: Colors.ink, flexShrink: 1 },
  stripChipTextOn: { color: Colors.darkText },
  stripChipTemp: { fontFamily: MONO, fontSize: 10, fontWeight: '700', color: Colors.heatCoreDeep, marginLeft: 'auto' },
  stripChipTempOn: { color: Colors.darkText },
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 64, gap: 14 },

  // Nav
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  navLeft: { gap: 3 },
  navTitleEn: { fontFamily: SERIF, fontSize: 16, fontWeight: '700', letterSpacing: 2, color: Colors.ink },
  navTitleFa: { fontSize: 11, color: Colors.muted },
  navPills: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.ink,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 99,
  },
  pillText: { fontFamily: MONO, color: Colors.darkText, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  powerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  powerBtnOn: {
    backgroundColor: Colors.heatCoreDeep,
    borderColor: Colors.heatCoreDeep,
    shadowColor: Colors.heatCore,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 6,
  },

  // Base card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 22,
    overflow: 'hidden',
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.06,
    shadowRadius: 26,
    elevation: 3,
  },
  cardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.8)',
    zIndex: 10,
  },

  // Warning banner
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(169,114,30,0.10)',
    borderColor: 'rgba(169,114,30,0.32)',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  warnFa: { fontSize: 12, fontWeight: '600', color: Colors.warning },
  warnEn: { fontSize: 8, letterSpacing: 1.5, color: Colors.muted, marginTop: 2 },

  // Viewer (dark hero)
  viewerCard: { backgroundColor: Colors.dark, borderColor: Colors.darkBorder, padding: 0 },
  viewerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.darkBorder,
  },
  viewerTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: Colors.darkText },
  viewerSub: { fontSize: 9, color: Colors.darkMuted, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, fontFamily: MONO },
  bootStage: { width: '100%', aspectRatio: 260 / 250 },
  scanLine: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(242,240,233,0.8)',
  },
  bracket: { position: 'absolute', width: 14, height: 14, borderColor: 'rgba(242,240,233,0.2)' },
  bracketTL: { top: 10, left: 10, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
  bracketTR: { top: 10, right: 10, borderTopWidth: 1.5, borderRightWidth: 1.5 },
  bracketBL: { bottom: 10, left: 10, borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
  bracketBR: { bottom: 10, right: 10, borderBottomWidth: 1.5, borderRightWidth: 1.5 },
  tapHint: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    opacity: 0.55,
  },
  tapHintText: { fontSize: 8, color: Colors.darkMuted, letterSpacing: 0.3 },
  viewerLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.darkBorder,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLabel: { fontSize: 10, fontWeight: '700', color: Colors.darkMuted, letterSpacing: 1 },
  legendValue: { fontFamily: MONO, fontSize: 12, color: Colors.darkText, fontWeight: '700' },
  legendDuty: { fontFamily: MONO, fontSize: 10, color: Colors.darkMuted, letterSpacing: 1 },
  legendEta: { fontFamily: MONO, fontSize: 8, color: Colors.heatAmber, letterSpacing: 1 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 14 },
  statCard: { flex: 1, padding: 16 },
  statHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  statHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heatTag: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.heatCore,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { fontSize: 11, fontWeight: '600', color: Colors.muted },
  connDot: { width: 7, height: 7, borderRadius: 4 },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  statValue: { fontFamily: MONO, fontSize: 28, color: Colors.ink, letterSpacing: -1 },
  statValueHeating: { color: Colors.heatCoreDeep },
  statFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  statSet: { fontFamily: MONO, fontSize: 10, color: Colors.heatCoreDeep, fontWeight: '700' },
  batRow: { flexDirection: 'row', gap: 2, marginLeft: 'auto' },
  batSeg: { width: 5, height: 10, borderRadius: 1.5 },
  statBat: { fontFamily: MONO, fontSize: 10, color: Colors.muted },

  // Section labels
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: Colors.ink },
faSection: { letterSpacing: 0, fontWeight: '600' },
  sectionSub: { fontSize: 10, color: Colors.muted, marginTop: 2 },

  // Dial
  dialCard: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 18 },
  dialHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
  },
  scopeChips: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 3,
    gap: 2,
  },
  scopeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9 },
  scopeChipActive: { backgroundColor: Colors.ink },
  scopeChipText: { fontSize: 10, fontWeight: '700', color: Colors.muted },
  scopeChipTextActive: { color: Colors.canvas },
  dialControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 6,
    paddingHorizontal: 10,
  },
  dialBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dialHelperWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' },
  comfortDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.comfort, opacity: 0.6 },
  dialHelper: { fontSize: 10, color: Colors.muted },

  // Modes
  modesCard: { padding: 18 },
  modesHead: { marginBottom: 12 },
  modesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeCell: {
    flexGrow: 1,
    flexBasis: '30.5%',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSoft,
  },
  modeCellHeat: {
    backgroundColor: Colors.heatCoreDeep,
    borderColor: Colors.heatCoreDeep,
    shadowColor: Colors.heatCore,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  modeCellDark: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  modeIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.045)',
  },
  modeIconActive: { backgroundColor: 'rgba(255,255,255,0.16)' },
  modeEn: { fontSize: 9, fontWeight: '700', letterSpacing: 1, color: Colors.ink },
  modeFa: { fontSize: 9, color: Colors.muted },
  modeTextActive: { color: Colors.darkText },
  modeFaActive: { color: 'rgba(242,240,233,0.75)' },

  // Safety
  safetyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  safetyIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: Colors.heatGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safetyLimit: { fontFamily: MONO, fontSize: 10, fontWeight: '700', color: Colors.heatCoreDeep, letterSpacing: 0.5 },

  // Quick actions — 2×2
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickTile: { flexBasis: '48.2%', flexGrow: 1, padding: 0 },
  quickInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  quickIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTexts: { flex: 1, gap: 2 },
  quickEn: { fontSize: 9, fontWeight: '700', letterSpacing: 1, color: Colors.ink },
  quickFa: { fontSize: 9, color: Colors.muted },

  // Footer
  footerTag: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 1.5,
    color: Colors.muted,
    textAlign: 'center',
    opacity: 0.6,
    marginTop: 4,
  },
});
