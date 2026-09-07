// app/scan.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — Device Scan / Pairing
//
// INTEGRATION POINT: اسکن و اتصال فعلاً شبیه‌سازی شده است. بعد از وصل کردن
// لایه BLE فقط این توابع را جایگزین کن و UI دست‌نخورده می‌ماند:
//   · startScan()   → BleManager.scan + تشخیص چپ/راست (src/ble/scanner.ts)
//   · connectDevice(id) → ShoeDevice.connect + useConnectionStore
// قرارداد تشخیص سمت: پسوند نام دستگاه «-L-» یا «-R-» (طبق scanner.ts)
// ─────────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { scanForShoes, scanForShoesDemo, type ScanResult } from '../../ble/scanner';
import { ShoeDevice } from '../../ble/ShoeDevice';
import { PressableScale } from '../../components/pressable-scale';
import { useI18n } from '../../i18n/use-i18n';
import { useSettingsStore } from '../../store/useSettingsStore';

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

type DeviceSide = 'left' | 'right' | null;
type PairState = 'found' | 'connecting' | 'connected' | 'failed';

interface ScanDevice {
  id: string;
  name: string;
  side: DeviceSide;
  rssi: number;
  state: PairState;
}

// تشخیص سمت از نام دستگاه — عیناً مطابق قرارداد src/ble/scanner.ts
const parseSide = (name: string): DeviceSide => {
  if (/-L-/i.test(name) || /-L$/i.test(name)) return 'left';
  if (/-R-/i.test(name) || /-R$/i.test(name)) return 'right';
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// RADAR — انیمیشن اسکن
// ─────────────────────────────────────────────────────────────────────────────
function Radar({ active }: { active: boolean }) {
  const sweep = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    sweep.value = active
      ? withRepeat(withTiming(360, { duration: 1800, easing: Easing.linear }), -1, false)
      : 0;
    pulse.value = active
      ? withRepeat(withSequence(withTiming(1, { duration: 1200 }), withTiming(0, { duration: 1200 })), -1, false)
      : 0;
  }, [active]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sweep.value * 3}deg` }],
    opacity: active ? 1 : 0.5,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.4,
    transform: [{ scale: 1 + pulse.value * 0.35 }],
  }));

  return (
    <View style={styles.radarWrap}>
      {/* رینگ‌های ثابت */}
      {[110, 78, 46].map((r) => (
        <View key={r} style={[styles.radarRing, { width: r * 2, height: r * 2, borderRadius: r }]} />
      ))}
      {/* پالس مرکزی */}
      <Animated.View style={[styles.radarPulse, pulseStyle]} />
      {/* بازوی چرخان */}
      <Animated.View style={[styles.radarSweepArm, sweepStyle]}>
        <View style={styles.radarSweepLine} />
        <View style={styles.radarBlip} />
      </Animated.View>
      {/* نقطه‌ی مرکز */}
      <View style={styles.radarCenter} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RSSI BARS
// ─────────────────────────────────────────────────────────────────────────────
function RssiBars({ rssi }: { rssi: number }) {
  const level = rssi > -60 ? 3 : rssi > -75 ? 2 : 1;
  return (
    <View style={styles.rssiRow}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            styles.rssiSeg,
            i === 2 && styles.rssiTall,
            { backgroundColor: i < level ? (level === 1 ? Colors.warning : Colors.success) : Colors.border },
          ]}
        />
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEVICE ROW
// ─────────────────────────────────────────────────────────────────────────────
function DeviceRow({ device, onConnect }: { device: ScanDevice; onConnect: (id: string) => void }) {
  const { t } = useI18n();
  const isPaired = device.state === 'connected';
  const isConnecting = device.state === 'connecting';
  const sideLabel = device.side === 'left' ? `${t('left')} · L` : device.side === 'right' ? `${t('right')} · R` : t('unknown');
  const known = device.side != null;

  return (
    <Animated.View entering={FadeInDown.springify()} style={[styles.deviceRow, isPaired && styles.deviceRowPaired]}>
      <View style={[styles.deviceIcon, { backgroundColor: known ? 'rgba(199,66,15,0.1)' : Colors.surfaceSoft }]}>
        <Ionicons
          name={known ? 'footsteps-outline' : 'help-circle-outline'}
          size={20}
          color={known ? Colors.heatCoreDeep : Colors.muted}
        />
      </View>

      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{device.name}</Text>
        <View style={styles.deviceMeta}>
          <Text style={[styles.deviceSide, !known && styles.deviceSideUnknown]}>{sideLabel}</Text>
          <Text style={styles.deviceId}>{device.id}</Text>
        </View>
      </View>

      <RssiBars rssi={device.rssi} />

      <PressableScale
        disabled={isPaired || isConnecting}
        onPress={() => onConnect(device.id)}
        style={[
          styles.pairBtn,
          isPaired && styles.pairBtnConnected,
          isConnecting && styles.pairBtnConnecting,
        ]}
      >
        <Text style={[styles.pairBtnText, isPaired && styles.pairBtnTextConnected]}>
          {isPaired ? t('connConnected') : isConnecting ? '...' : t('connect')}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function ScanScreen() {
  const { t } = useI18n();
  const [devices, setDevices] = useState<ScanDevice[]>([]);
  const [scanning, setScanning] = useState(true);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const foundRef = useRef(0);
  const stopScanRef = useRef<(() => void) | null>(null);
  const devicesRef = useRef<ScanDevice[]>([]);
  // mirror برای دسترسی داخل callback ها
  devicesRef.current = devices;

  const clearTimers = () => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  };

  // اسکن واقعی BLE؛ اگر سخت‌افزار/دستگاهی پیدا نشد → fallback دمو
  const startScan = useCallback(() => {
    clearTimers();
    setDevices([]);
    setScanning(true);
    const timeoutSec = useSettingsStore.getState().scanTimeoutSec;

    const upsert = (r: ScanResult) => {
      setDevices((prev) =>
        prev.some((d) => d.id === r.id)
          ? prev
          : [...prev, { id: r.id, name: r.name, side: r.side, rssi: r.rssi, state: 'found' as PairState }],
      );
    };

    const runDemoFallback = () => {
      timeouts.current.push(
        setTimeout(() => {
          if (foundRef.current > 0) return;
          stopScanRef.current = scanForShoesDemo(timeoutSec * 1000, upsert, () => setScanning(false));
        }, 300),
      );
    };

    let stop: (() => void) | null = null;
    const stopScan = () => stop?.();

    if (Platform.OS === 'web') {
      // وب BLE ندارد — مستقیم دمو
      stop = scanForShoesDemo(timeoutSec * 1000, upsert, () => setScanning(false));
    } else {
      stop = scanForShoes(
        timeoutSec * 1000,
        (r) => {
          foundRef.current += 1;
          upsert(r);
        },
        () => {
          setScanning(false);
          runDemoFallback();
        },
        () => {
          // خطای BLE (مثلاً بلوتوث خاموش) → fallback دمو
          runDemoFallback();
        },
      );
    }
    stopScanRef.current = stopScan;
  }, []);

  // اتصال واقعی از طریق ShoeDevice → useConnectionStore
  const connectDevice = useCallback((id: string) => {
    const device = devicesRef.current.find((d) => d.id === id);
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, state: 'connecting' } : d)));
    void ShoeDevice.connect(id, device?.name ?? id).then((side) => {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, state: side ? ('connected' as PairState) : ('failed' as PairState) } : d,
        ),
      );
    });
  }, []);

  useEffect(() => {
    startScan();
    return () => {
      stopScanRef.current?.();
      clearTimers();
    };
  }, [startScan]);

  const known = devices.filter((d) => d.side != null);
  const unknown = devices.filter((d) => d.side == null);
  const connectedCount = devices.filter((d) => d.state === 'connected').length;
  const bothConnected = known.length >= 2 && connectedCount >= 2;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* ── TOP NAV ── */}
        <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.topNav}>
          <Pressable style={styles.backBtn} onPress={() => router.navigate('/')} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color={Colors.ink} />
          </Pressable>
          <View style={styles.navCenter}>
            <Text style={styles.navTitleEn}>DEVICES</Text>
            <Text style={styles.navTitleFa}>{t('titleScan')}</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countText}>{`${connectedCount}/2`}</Text>
          </View>
        </Animated.View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* ── RADAR HERO ── */}
          <Animated.View entering={FadeInDown.delay(140).springify()} style={styles.radarCard}>
            <Radar active={scanning} />
            <Text style={styles.radarTitle}>{scanning ? 'SCANNING…' : `${devices.length} ${t('foundN')}`}</Text>
            <Text style={styles.radarSub}>
              {scanning ? t('scanningStatus') : t('scanHint')}
            </Text>
          </Animated.View>

          {/* ── هشدار: هر دو متصل ── */}
          {bothConnected && (
            <Animated.View entering={FadeInDown.springify()} style={styles.readyBanner}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={styles.readyText}>{t('readyBanner')}</Text>
              <PressableScale style={styles.readyBtn} onPress={() => router.navigate('/')}>
                <Text style={styles.readyBtnText}>{t('continueBtn')}</Text>
              </PressableScale>
            </Animated.View>
          )}

          {/* ── KNOWN DEVICES ── */}
          <View style={styles.sectionHead}>
                        <Text style={styles.sectionLabel}>Qartal Modules</Text>
            <Text style={styles.sectionSub}>{t('secKnown')}</Text>
          </View>
          {known.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="scan-outline" size={20} color={Colors.muted} />
              <Text style={styles.emptyText}>{scanning ? t('scanningDots') : t('noDevices')}</Text>
            </View>
          ) : (
            known.map((d) => <DeviceRow key={d.id} device={d} onConnect={connectDevice} />)
          )}

          {/* ── UNKNOWN DEVICES ── */}
          {unknown.length > 0 && (
            <>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionLabel}>OTHER DEVICES</Text>
                <Text style={styles.sectionSub}>{t('secOther')}</Text>
              </View>
              {unknown.map((d) => (
                <DeviceRow key={d.id} device={d} onConnect={connectDevice} />
              ))}
            </>
          )}

          {/* ── RESCAN ── */}
          <PressableScale style={[styles.rescanBtn, scanning && styles.rescanBtnBusy]} disabled={scanning} onPress={startScan}>
            <Ionicons name="refresh" size={15} color={scanning ? Colors.muted : Colors.ink} />
            <Text style={[styles.rescanText, scanning && styles.rescanTextBusy]}>
              {scanning ? t('scanningDots') : t('rescanBtn')}
            </Text>
          </PressableScale>

          <Text style={styles.hint}>{t('scanHint')}</Text>
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
  scrollContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 110, gap: 12 },

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
  countPill: {
    backgroundColor: Colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  countText: { fontFamily: MONO, color: Colors.darkText, fontSize: 10, fontWeight: '700', letterSpacing: 1 },

  // Radar card
  radarCard: {
    backgroundColor: Colors.dark,
    borderColor: Colors.darkBorder,
    borderWidth: 1,
    borderRadius: 24,
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 18,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 26,
    elevation: 4,
  },
  radarWrap: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  radarRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(242,240,233,0.08)',
  },
  radarPulse: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(199,66,15,0.14)',
  },
  radarSweepArm: {
    position: 'absolute',
    width: 220,
    height: 220,
    alignItems: 'center',
  },
  radarSweepLine: {
    width: 1.5,
    height: 110,
    backgroundColor: 'rgba(220,148,56,0.55)',
  },
  radarBlip: {
    position: 'absolute',
    top: 24,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.heatCore,
  },
  radarCenter: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.heatCore,
  },
  radarTitle: { fontFamily: MONO, fontSize: 11, fontWeight: '700', letterSpacing: 2, color: Colors.darkText },
  radarSub: { fontSize: 10, color: Colors.darkMuted, marginTop: 4 },

  // Ready banner
  readyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(46,107,57,0.1)',
    borderColor: 'rgba(46,107,57,0.3)',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  readyText: { flex: 1, fontSize: 12, fontWeight: '600', color: Colors.success },
  readyBtn: {
    backgroundColor: Colors.success,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  readyBtnText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },

  // Section
  sectionHead: { marginTop: 10, marginBottom: 2, paddingHorizontal: 4 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: Colors.ink },
  sectionSub: { fontSize: 10, color: Colors.muted, marginTop: 2 },

  // Device row
  deviceRow: {
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
  deviceRowPaired: { borderColor: 'rgba(46,107,57,0.35)' },
  deviceIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceInfo: { flex: 1, gap: 3 },
  deviceName: { fontFamily: MONO, fontSize: 12, fontWeight: '700', color: Colors.ink, letterSpacing: 0.5 },
  deviceMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deviceSide: { fontSize: 9, fontWeight: '700', color: Colors.heatCoreDeep },
  deviceSideUnknown: { color: Colors.muted },
  deviceId: { fontFamily: MONO, fontSize: 8, color: Colors.muted, letterSpacing: 0.5 },

  // RSSI
  rssiRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  rssiSeg: { width: 4, height: 8, borderRadius: 1 },
  rssiTall: { height: 14 },

  // Pair button
  pairBtn: {
    backgroundColor: Colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 58,
    alignItems: 'center',
  },
  pairBtnConnecting: { backgroundColor: Colors.borderStrong },
  pairBtnConnected: { backgroundColor: 'rgba(46,107,57,0.12)' },
  pairBtnText: { fontSize: 11, fontWeight: '700', color: Colors.darkText },
  pairBtnTextConnected: { color: Colors.success },

  // Empty
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: 18,
    paddingVertical: 22,
  },
  emptyText: { fontSize: 11, color: Colors.muted },

  // Rescan
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.ink,
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 8,
  },
  rescanBtnBusy: { borderColor: Colors.border },
  rescanText: { fontSize: 12, fontWeight: '700', color: Colors.ink, letterSpacing: 0.5 },
  rescanTextBusy: { color: Colors.muted },

  hint: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 1,
    color: Colors.muted,
    textAlign: 'center',
    opacity: 0.6,
    marginTop: 6,
  },
});
