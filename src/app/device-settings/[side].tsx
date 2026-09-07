// app/device-settings/[side].tsx
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — Device Settings (parametric: left / right)
//
// INTEGRATION POINT: state فعلی دمو است. بعد از اتصال store ها:
//   · deviceInfo (id / rssi / fw / lastSeen) → useConnectionStore
//   · targetTempC / mode → useHeatStore
//   · identify / reconnect / disconnect → src/ble/ShoeDevice.ts فرمان‌های BLE
// قرارداد ShoeSide / ConnectionState / HeatMode عیناً طبق مستند.
// ─────────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShoeDevice } from '../../ble/ShoeDevice';
import type { TKey } from '../../i18n/strings';
import { useI18n } from '../../i18n/use-i18n';
import { useConnectionStore } from '../../store/useConnectionStore';
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

// ── قرارداد مشترک ──
type ShoeSide = 'left' | 'right';
type HeatMode = 'off' | 'constant' | 'timer' | 'stepped' | 'smart' | 'activity';

const TEMP_MIN = 20;
const TEMP_MAX = 45; // سقف سخت — SafetyGuardService

const MODE_FA: Record<HeatMode, TKey> = {
  off: 'modeOff',
  constant: 'modeConstant',
  timer: 'modeTimer',
  stepped: 'modeStepped',
  smart: 'modeSmart',
  activity: 'modeActivity',
};
const MODE_ORDER: HeatMode[] = ['off', 'constant', 'timer', 'stepped', 'smart', 'activity'];

interface DeviceInfo {
  deviceId: string;
  firmware: string;
  rssi: number;
  batteryPercent: number;
  lastSeenSecAgo: number;
  connectionState: 'connected' | 'disconnected' | 'connecting' | 'error';
}

// وضعیت دستگاه و تله‌متری زنده از useConnectionStore می‌آید (ShoeDevice).

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const rssiBars = (rssi: number) => (rssi > -60 ? 3 : rssi > -75 ? 2 : 1);

// برچسب‌های اتصال/RSSI با i18n — t به‌عنوان پارامتر پاس داده می‌شود
const rssiLabel = (t: (k: TKey) => string, rssi: number) =>
  rssi > -60 ? t('rssiStrong') : rssi > -75 ? t('rssiMedium') : t('rssiWeak');

const connMeta = (t: (k: TKey) => string, state: DeviceInfo['connectionState']) => {
  switch (state) {
    case 'connected':
      return { color: Colors.success, fa: t('connConnected') };
    case 'connecting':
      return { color: Colors.warning, fa: t('connConnecting') };
    case 'error':
      return { color: Colors.danger, fa: t('connError') };
    default:
      return { color: Colors.muted, fa: t('connDisconnected') };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function DeviceSettingsScreen() {
  const { t } = useI18n();
  const params = useLocalSearchParams<{ side?: string }>();
  const side: ShoeSide | null =
    params.side === 'left' ? 'left' : params.side === 'right' ? 'right' : null;

  // ── STORE — وضعیت واقعی از useConnectionStore + useHeatStore ──
  const c = useConnectionStore((s) => (side ? s[side] : s.left));
  const heat = useHeatStore((s) => (side ? s[side] : s.left));
  const [identifying, setIdentifying] = useState(false);

  // نگاشت به قرارداد DeviceInfo صفحه
  const deviceInfo: DeviceInfo = {
    deviceId: c.deviceId ?? '—',
    firmware: c.firmware ?? '2.4.1',
    rssi: c.rssi ?? -100,
    batteryPercent: c.batteryPercent ?? 0,
    lastSeenSecAgo: c.lastSeenAt == null ? 0 : Math.max(0, Math.round((Date.now() - c.lastSeenAt) / 1000)),
    connectionState: c.connectionState === 'scanning' ? 'disconnected' : c.connectionState,
  };
  const targetTempC = heat.targetTempC;
  const mode = heat.mode;

  if (!side) {
    // پارامتر نامعتبر یا باز شدن مستقیم صفحه از طریق deep-link —
    // Redirect امن است و تا mount شدن root navigator صبر می‌کند.
    // (صدا زدن router در حین render باعث خطای
    //  «Attempted to navigate before mounting the Root Layout component» می‌شود)
    return <Redirect href="/" />;
  }

  const cm = connMeta(t, deviceInfo.connectionState);
  const bars = rssiBars(deviceInfo.rssi);

  const bumpTemp = (d: number) => {
    // سقف‌های ایمنی (۲۰–۴۵°) توسط SafetyGuardService داخل store اعمال می‌شوند
    useHeatStore.getState().setTargetTemp(side, targetTempC + d);
    void ShoeDevice.pushHeatState(side);
  };

  const pickMode = (m: HeatMode) => {
    useHeatStore.getState().setMode(side, m);
    void ShoeDevice.pushHeatState(side);
  };

  const identify = () => {
    // چشمک LED روی ماژول CH582M
    void ShoeDevice.identify(side);
    setIdentifying(true);
    setTimeout(() => setIdentifying(false), 2400);
  };

  const reconnect = () => {
    // اتصال مجدد دستی با آخرین deviceId شناخته‌شده
    if (deviceInfo.deviceId && deviceInfo.deviceId !== '—') {
      void ShoeDevice.connect(deviceInfo.deviceId, deviceInfo.deviceId);
    }
  };

  const disconnect = () => {
    ShoeDevice.disconnect(side);
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
            <Text style={styles.navTitleEn}>DEVICE</Text>
            <Text style={styles.navTitleFa}>{side === 'left' ? t('titleDeviceLeft') : t('titleDeviceRight')}</Text>
          </View>
          <View style={[styles.sidePill, side === 'left' ? styles.sidePillL : styles.sidePillR]}>
            <Text style={styles.sidePillText}>{side === 'left' ? 'L' : 'R'}</Text>
          </View>
        </Animated.View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* ── DEVICE HERO ── */}
          <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIconWrap}>
                <Ionicons name="footsteps" size={26} color={Colors.darkText} />
              </View>
              <View style={styles.heroInfo}>
                <Text style={styles.heroDeviceId}>{deviceInfo.deviceId}</Text>
                <View style={styles.heroConnRow}>
                  <View style={[styles.connDot, { backgroundColor: cm.color }]} />
                  <Text style={[styles.heroConnText, { color: cm.color }]}>{cm.fa}</Text>
                  <Text style={styles.heroSeen}>{`· ${deviceInfo.lastSeenSecAgo}${t('agoShort')}`}</Text>
                </View>
              </View>
              {/* سیگنال */}
              <View style={styles.signalWrap}>
                <View style={styles.rssiRow}>
                  {[0, 1, 2].map((i) => (
                    <View
                      key={i}
                      style={[
                        styles.rssiSeg,
                        i === 2 && styles.rssiTall,
                        { backgroundColor: i < bars ? cm.color : 'rgba(255,255,255,0.12)' },
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.signalLabel}>{`RSSI ${deviceInfo.rssi} · ${rssiLabel(t, deviceInfo.rssi)}`}</Text>
              </View>
            </View>

            <View style={styles.heroStatsRow}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>FW</Text>
                <Text style={styles.heroStatValue}>{deviceInfo.firmware}</Text>
              </View>
              <View style={[styles.heroStat, styles.heroStatMid]}>
                <Text style={styles.heroStatLabel}>BATTERY</Text>
                <Text style={styles.heroStatValue}>{`${Math.round(deviceInfo.batteryPercent)}%`}</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>CHIP</Text>
                <Text style={styles.heroStatValue}>CH582M</Text>
              </View>
            </View>
          </Animated.View>

          {/* ── TARGET TEMP ── */}
          <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.tempCard}>
            <View style={styles.sectionHeadRow}>
              <View>
                <Text style={styles.sectionLabel}>{t('targetTemp')}</Text>
                <Text style={styles.sectionSub}>{side === 'left' ? t('titleDeviceLeft') : t('titleDeviceRight')}</Text>
              </View>
              <Text style={styles.tempRange}>{`${TEMP_MIN}–${TEMP_MAX}°`}</Text>
            </View>

            <View style={styles.tempRow}>
              <Pressable style={styles.tempBtn} onPress={() => bumpTemp(-1)}>
                <Ionicons name="remove" size={22} color={Colors.ink} />
              </Pressable>
              <Text style={styles.tempValue}>{`${targetTempC}°`}</Text>
              <Pressable style={styles.tempBtn} onPress={() => bumpTemp(1)}>
                <Ionicons name="add" size={22} color={Colors.ink} />
              </Pressable>
            </View>
          </Animated.View>

          {/* ── MODE ── */}
          <Animated.View entering={FadeInDown.delay(260).springify()} style={styles.modeCard}>
            <View style={styles.sectionHeadRow}>
              <View>
                <Text style={styles.sectionLabel}>{t('operatingMode')}</Text>
                <Text style={styles.sectionSub}>{t('selectMode')}</Text>
              </View>
              {/* لینک به صفحه‌ی کامل انتخاب مد با توضیحات */}
              <Pressable onPress={() => router.push(`/mode/${side}`)} hitSlop={6} style={styles.moreLink}>
                <Text style={styles.moreLinkText}>{t('moreModes')}</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.heatCoreDeep} />
              </Pressable>
            </View>
            <View style={styles.modeRow}>
              {MODE_ORDER.map((m) => {
                const active = mode === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => pickMode(m)}
                    style={[styles.modeChip, active && (m === 'off' ? styles.modeChipDark : styles.modeChipHeat)]}
                  >
                    <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>{t(MODE_FA[m])}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>

          {/* ── DEVICE ACTIONS ── */}
          <Animated.View entering={FadeInDown.delay(320).springify()} style={styles.actionsCard}>
            <Text style={styles.sectionLabel}>{t('deviceActions')}</Text>
            <Text style={styles.sectionSub}>{t('identifyTitle')}</Text>

            <Pressable style={styles.actionRow} onPress={identify}>
              <View style={styles.actionIcon}>
                <Ionicons name="flashlight-outline" size={18} color={Colors.heatCoreDeep} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.actionTitle}>{t('identifyTitle')}</Text>
                <Text style={styles.actionDesc}>{identifying ? t('identifyDescActive') : t('identifyDescIdle')}</Text>
              </View>
              {identifying ? (
                <Ionicons name="pulse" size={18} color={Colors.heatCore} />
              ) : (
                <Ionicons name="chevron-forward" size={14} color={Colors.borderStrong} />
              )}
            </Pressable>

            <Pressable style={styles.actionRow} onPress={reconnect}>
              <View style={styles.actionIcon}>
                <Ionicons name="refresh" size={18} color={Colors.heatCoreDeep} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.actionTitle}>{t('reconnectTitle')}</Text>
                <Text style={styles.actionDesc}>{t('reconnectDesc')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={Colors.borderStrong} />
            </Pressable>

            <View style={styles.actionRowLast} />

            <Pressable style={[styles.actionRow, styles.actionRowDanger]} onPress={disconnect}>
              <View style={[styles.actionIcon, { backgroundColor: 'rgba(174,51,36,0.1)' }]}>
                <Ionicons name="bluetooth-outline" size={18} color={Colors.danger} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.actionTitle, { color: Colors.danger }]}>{t('disconnectTitle')}</Text>
                <Text style={styles.actionDesc}>{t('disconnectDesc')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={Colors.borderStrong} />
            </Pressable>
          </Animated.View>

          {/* ── SAFETY LIMITS ── */}
          <View style={styles.safetyCard}>
            <Ionicons name="shield-checkmark-outline" size={16} color={Colors.heatCoreDeep} />
            <Text style={styles.safetyText}>
              {t('safetyText')}
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
  sidePill: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidePillL: { backgroundColor: Colors.heatCoreDeep },
  sidePillR: { backgroundColor: Colors.ink },
  sidePillText: { fontFamily: MONO, color: Colors.darkText, fontSize: 13, fontWeight: '700' },

  // Hero
  heroCard: {
    backgroundColor: Colors.dark,
    borderColor: Colors.darkBorder,
    borderWidth: 1,
    borderRadius: 22,
    padding: 17,
    gap: 16,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 26,
    elevation: 4,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInfo: { flex: 1, gap: 5 },
  heroDeviceId: { fontFamily: MONO, fontSize: 13, fontWeight: '700', color: Colors.darkText, letterSpacing: 0.5 },
  heroConnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  connDot: { width: 7, height: 7, borderRadius: 4 },
  heroConnText: { fontSize: 11, fontWeight: '700' },
  heroSeen: { fontFamily: MONO, fontSize: 9, color: Colors.darkMuted },
  signalWrap: { alignItems: 'flex-end', gap: 5 },
  rssiRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  rssiSeg: { width: 4, height: 8, borderRadius: 1 },
  rssiTall: { height: 14 },
  signalLabel: { fontFamily: MONO, fontSize: 8, color: Colors.darkMuted, letterSpacing: 0.5 },
  heroStatsRow: { flexDirection: 'row' },
  heroStat: { flex: 1, alignItems: 'center', gap: 4 },
  heroStatMid: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroStatLabel: { fontFamily: MONO, fontSize: 8, letterSpacing: 1.5, color: Colors.darkMuted },
  heroStatValue: { fontFamily: MONO, fontSize: 13, fontWeight: '700', color: Colors.darkText },

  // Section head row
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: Colors.ink },
  sectionSub: { fontSize: 10, color: Colors.muted, marginTop: 2 },
  tempRange: { fontFamily: MONO, fontSize: 9, color: Colors.muted, letterSpacing: 1 },
  moreLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  moreLinkText: { fontSize: 10, fontWeight: '700', color: Colors.heatCoreDeep },

  // Temp card
  tempCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 16,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  tempRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 26 },
  tempBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tempValue: { fontFamily: MONO, fontSize: 42, fontWeight: '700', color: Colors.ink, letterSpacing: -2, minWidth: 100, textAlign: 'center' },

  // Mode card
  modeCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 14,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeChipHeat: { backgroundColor: Colors.heatCoreDeep, borderColor: Colors.heatCoreDeep },
  modeChipDark: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  modeChipText: { fontSize: 11, fontWeight: '700', color: Colors.muted },
  modeChipTextActive: { color: Colors.darkText },

  // Actions
  actionsCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 6,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  actionsCardGap: { height: 10 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },
  actionRowLast: { height: 8 },
  actionRowDanger: { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 2 },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(199,66,15,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: { fontSize: 12, fontWeight: '700', color: Colors.ink },
  actionDesc: { fontSize: 10, color: Colors.muted },

  // Safety
  safetyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: 'rgba(199,66,15,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(199,66,15,0.2)',
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  safetyText: { flex: 1, fontSize: 10, color: Colors.heatCoreDeep, lineHeight: 15 },
});
