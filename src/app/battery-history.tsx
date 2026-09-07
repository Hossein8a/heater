// app/battery-history.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — Battery History
//
// INTEGRATION POINT: داده‌ی فعلی دمو است. بعد از اتصال store ها:
//   · history چپ/راست → useBatteryStore (persist روی AsyncStorage)
//   · آستانه‌ی هشدار ۲۰٪ و نوتیفیکیشن → src/services/NotificationService.ts
//     (این صفحه فقط نمایش می‌دهد؛ هیچ تایمر یا تشخیصی خودش اجرا نمی‌کند)
// قرارداد ShoeSide عیناً طبق مستند.
// ─────────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, LinearGradient, Polyline, Stop } from 'react-native-svg';
import { useI18n } from '../i18n/use-i18n';
import { useBatteryStore } from '../store/useBatteryStore';

// ── Design tokens (یکسان با index) ──
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

// ── قرارداد مشترک ──
type ShoeSide = 'left' | 'right';

const LOW_BATTERY_PCT = 20; // آستانه‌ی هشدار — NotificationService
const CHART_W = 300;
const CHART_H = 120;
const SAMPLES = 49; // ۴۸ نقطه در ۲۴ ساعت (هر ۳۰ دقیقه) + نقطه‌ی لحظه‌ای
const HOURS_SPAN = 24;

// تاریخچه و رخدادها از useBatteryStore می‌آیند (ShoeDevice نمونه‌ها را ثبت می‌کند)

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const chartY = (pct: number) => CHART_H - 8 - (Math.min(100, Math.max(0, pct)) / 100) * (CHART_H - 16);
const chartX = (i: number, len: number) => (i / (len - 1)) * CHART_W;

function toPoints(history: number[]): string {
  return history.map((v, i) => `${chartX(i, history.length).toFixed(1)},${chartY(v).toFixed(1)}`).join(' ');
}

const fmtPct = (v: number) => `${Math.round(v)}%`;

// نرخ تخلیه از شیب تاریخچه — ٪ در ساعت
const drainPerHour = (history: number[]) => {
  if (history.length < 2) return 0;
  const drop = history[0] - history[history.length - 1];
  return Math.max(0.1, drop / HOURS_SPAN);
};

// ─────────────────────────────────────────────────────────────────────────────
// BOOT BATTERY SUMMARY (کارت تیره)
// ─────────────────────────────────────────────────────────────────────────────
function BootBatterySummary({
  side,
  pct,
  drain,
}: {
  side: ShoeSide;
  pct: number;
  drain: number;
}) {
  const { t } = useI18n();
  const low = pct <= LOW_BATTERY_PCT;
  const runtimeH = Math.max(0, (pct - LOW_BATTERY_PCT) / drain);
  const runtimeLabel =
    runtimeH >= 1 ? `~${runtimeH.toFixed(1)} ${t('hoursUnit')}` : `~${Math.round(runtimeH * 60)} ${t('minutesUnit')}`;

  return (
    <View style={styles.sumCard}>
      <View style={styles.sumHead}>
        <View style={[styles.sumIcon, { backgroundColor: low ? 'rgba(174,51,36,0.2)' : 'rgba(255,255,255,0.07)' }]}>
          <Ionicons name="footsteps" size={15} color={low ? Colors.danger : Colors.darkText} />
        </View>
        <Text style={styles.sumSide}>{side === 'left' ? 'LEFT · چپ' : 'RIGHT · راست'}</Text>
      </View>
      <Text style={[styles.sumPct, { color: low ? Colors.danger : Colors.darkText }]}>{fmtPct(pct)}</Text>
      <View style={styles.sumBarWrap}>
        <View style={[styles.sumBarFill, { width: `${Math.min(100, pct)}%` as never, backgroundColor: low ? Colors.danger : Colors.heatAmber }]} />
      </View>
      <View style={styles.sumFoot}>
        <Ionicons name="timer-outline" size={14} color={Colors.darkMuted} />
        <Text style={styles.sumRuntime}>{`${t('untilThreshold')} ${runtimeLabel}`}</Text>
      </View>
      <Text style={styles.sumDrain}>{`DRAIN ${drain.toFixed(1)} %/H`}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function BatteryHistoryScreen() {
  // ── STORE — داده‌ی واقعی از useBatteryStore (persist روی AsyncStorage) ──
  const { t } = useI18n();
  const leftHistory = useBatteryStore((s) => s.left.history);
  const rightHistory = useBatteryStore((s) => s.right.history);
  const events = useBatteryStore((s) => s.events);

  const leftPct = leftHistory[leftHistory.length - 1] ?? 0;
  const rightPct = rightHistory[rightHistory.length - 1] ?? 0;
  const leftDrain = drainPerHour(leftHistory);
  const rightDrain = drainPerHour(rightHistory);

  const leftPoints = useMemo(() => toPoints(leftHistory), [leftHistory]);
  const rightPoints = useMemo(() => toPoints(rightHistory), [rightHistory]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* ── TOP NAV ── */}
        <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.topNav}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color={Colors.ink} />
          </Pressable>
          <View style={styles.navCenter}>
            <Text style={styles.navTitleEn}>BATTERY</Text>
            <Text style={styles.navTitleFa}>{t('titleBattery')}</Text>
          </View>
          <View style={styles.rangePill}>
            <Text style={styles.rangeText}>{`${HOURS_SPAN}H`}</Text>
          </View>
        </Animated.View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* ── SUMMARIES ── */}
          <View style={styles.sumRow}>
            <BootBatterySummary side="left" pct={leftPct} drain={leftDrain} />
            <BootBatterySummary side="right" pct={rightPct} drain={rightDrain} />
          </View>

          {/* ── 24H CHART ── */}
          <Animated.View entering={FadeInDown.delay(180).springify()} style={styles.chartCard}>
            <View style={styles.chartHead}>
              <View>
                <Text style={styles.chartTitle}>{t('last24')}</Text>
                <Text style={styles.chartSub}>{t('sampleNote')}</Text>
              </View>
              <View style={styles.legendCol}>
                <View style={styles.legendRow}>
                  <View style={[styles.legendSwatch, { backgroundColor: Colors.ink }]} />
                  <Text style={styles.legendText}>{t('left')}</Text>
                </View>
                <View style={styles.legendRow}>
                  <View style={[styles.legendSwatch, { backgroundColor: Colors.heatAmber }]} />
                  <Text style={styles.legendText}>{t('right')}</Text>
                </View>
              </View>
            </View>

            <Svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="gBatLeft" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={Colors.ink} stopOpacity={0.14} />
                  <Stop offset="1" stopColor={Colors.ink} stopOpacity={0} />
                </LinearGradient>
              </Defs>

              {/* شبکه‌ی افقی ۰/۲۵/۵۰/۷۵/۱۰۰ + آستانه‌ی ۲۰٪ */}
              {[0, 25, 50, 75, 100].map((p) => (
                <Line
                  key={p}
                  x1={0}
                  y1={chartY(p)}
                  x2={CHART_W}
                  y2={chartY(p)}
                  stroke={Colors.border}
                  strokeWidth={p % 50 === 0 ? 1 : 0.6}
                  strokeDasharray={p % 50 === 0 ? undefined : '2 4'}
                />
              ))}
              <Line x1={0} y1={chartY(LOW_BATTERY_PCT)} x2={CHART_W} y2={chartY(LOW_BATTERY_PCT)} stroke={Colors.danger} strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />

              {/* ناحیه‌ی زیر خط چپ */}
              <Polyline
                points={`0,${CHART_H} ${leftPoints} ${CHART_W},${CHART_H}`}
                fill="url(#gBatLeft)"
                stroke="none"
              />
              <Polyline points={leftPoints} fill="none" stroke={Colors.ink} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
              <Polyline points={rightPoints} fill="none" stroke={Colors.heatAmber} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />

              {/* نقطه‌ی انتهایی هر خط */}
              <Circle cx={chartX(leftHistory.length - 1, leftHistory.length)} cy={chartY(leftPct)} r={3} fill={Colors.ink} />
              <Circle cx={chartX(rightHistory.length - 1, rightHistory.length)} cy={chartY(rightPct)} r={3} fill={Colors.heatAmber} />
            </Svg>

            {/* برچسب‌های محور افقی */}
            <View style={styles.axisRow}>
              {['-24h', '-18h', '-12h', '-6h', 'now'].map((t) => (
                <Text key={t} style={styles.axisText}>{t}</Text>
              ))}
            </View>

            <View style={styles.thresholdNote}>
              <View style={[styles.thresholdDash, { backgroundColor: Colors.danger }]} />
              <Text style={styles.thresholdText}>{`${t('thresholdNote')} ${LOW_BATTERY_PCT}٪`}</Text>
            </View>
          </Animated.View>

          {/* ── DRAIN STATS ── */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Ionicons name="speedometer-outline" size={18} color={Colors.heatCoreDeep} />
              <Text style={styles.statValue}>{leftDrain.toFixed(1)}</Text>
              <Text style={styles.statLabel}>{t('statDrainLeft')}</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="speedometer-outline" size={18} color={Colors.heatCoreDeep} />
              <Text style={styles.statValue}>{rightDrain.toFixed(1)}</Text>
              <Text style={styles.statLabel}>{t('statDrainRight')}</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="battery-charging-outline" size={18} color={Colors.success} />
              <Text style={[styles.statValue, { color: Colors.success }]}>{Math.abs(leftPct - rightPct).toFixed(0)}</Text>
              <Text style={styles.statLabel}>{t('statGap')}</Text>
            </View>
          </View>

          {/* ── EVENTS LOG ── */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionLabel}>{t('eventsTitle')}</Text>
            <Text style={styles.sectionSub}>{t('eventsSub')}</Text>
          </View>

          {events.map((ev) => {
            const icon =
              ev.kind === 'low'
                ? { name: 'alert-circle' as const, color: Colors.danger }
                : ev.kind === 'charged'
                  ? { name: 'checkmark-circle' as const, color: Colors.success }
                  : { name: 'trending-down' as const, color: Colors.warning };
            return (
              <View key={ev.id} style={styles.eventRow}>
                <View style={[styles.eventIcon, { backgroundColor: `${icon.color}1A` }]}>
                  <Ionicons name={icon.name} size={18} color={icon.color} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.eventDetail}>{ev.detail}</Text>
                  <Text style={styles.eventTime}>{ev.time}</Text>
                </View>
              </View>
            );
          })}

          {/* ── NOTIFICATION NOTE ── */}
          <View style={styles.noteCard}>
            <Ionicons name="notifications-outline" size={16} color={Colors.heatCoreDeep} />
            <Text style={styles.noteText}>
              هشدار کم‌بودن باتری در {LOW_BATTERY_PCT}٪ به‌صورت نوتیفیکیشن محلی ارسال می‌شود (NotificationService).
            </Text>
          </View>

          <View style={{ height: 32 }} />
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
  scrollContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 48, gap: 12 },

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
  rangePill: { backgroundColor: Colors.ink, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99 },
  rangeText: { fontFamily: MONO, color: Colors.darkText, fontSize: 10, fontWeight: '700', letterSpacing: 1 },

  // Summaries
  sumRow: { flexDirection: 'row', gap: 12 },
  sumCard: {
    flex: 1,
    backgroundColor: Colors.dark,
    borderColor: Colors.darkBorder,
    borderWidth: 1,
    borderRadius: 20,
    padding: 15,
    gap: 9,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 26,
    elevation: 4,
  },
  sumHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sumIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sumSide: { fontFamily: MONO, fontSize: 8, letterSpacing: 1.5, color: Colors.darkMuted },
  sumPct: { fontFamily: MONO, fontSize: 30, fontWeight: '700', letterSpacing: -1 },
  sumBarWrap: {
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  sumBarFill: { height: '100%', borderRadius: 4 },
  sumFoot: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sumRuntime: { fontSize: 10, color: Colors.darkText, fontWeight: '600' },
  sumDrain: { fontFamily: MONO, fontSize: 8, letterSpacing: 1, color: Colors.darkMuted },

  // Chart card
  chartCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  chartTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: Colors.ink },
  chartSub: { fontSize: 10, color: Colors.muted, marginTop: 3 },
  legendCol: { gap: 5 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 3, borderRadius: 2 },
  legendText: { fontSize: 9, color: Colors.muted, fontWeight: '600' },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  axisText: { fontFamily: MONO, fontSize: 8, color: Colors.muted },
  thresholdNote: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  thresholdDash: { width: 16, height: 0, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.danger },
  thresholdText: { fontSize: 9, color: Colors.muted },

  // Drain stats
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingVertical: 14,
  },
  statValue: { fontFamily: MONO, fontSize: 19, fontWeight: '700', color: Colors.ink },
  statLabel: { fontSize: 9, color: Colors.muted, textAlign: 'center' },

  // Section
  sectionHead: { marginTop: 8, marginBottom: 0, paddingHorizontal: 4 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: Colors.ink },
  sectionSub: { fontSize: 10, color: Colors.muted, marginTop: 2 },

  // Events
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 13,
  },
  eventIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  eventDetail: { fontSize: 11, color: Colors.ink, lineHeight: 16 },
  eventTime: { fontFamily: MONO, fontSize: 9, color: Colors.muted, letterSpacing: 0.5 },

  // Note
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: 'rgba(199,66,15,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(199,66,15,0.2)',
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginTop: 2,
  },
  noteText: { flex: 1, fontSize: 10, color: Colors.heatCoreDeep, lineHeight: 15 },
});
