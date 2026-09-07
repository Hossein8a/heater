// app/settings.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — App Settings
//
// برخلاف صفحات دیگر، این صفحه از روز اول به store واقعی وصل است:
//   · src/store/useSettingsStore.ts (Zustand + persist)
// سقف‌های سخت ایمنی (۴۵° / ۱۲۰ دقیقه / هشدارهای ایمنی) عمداً قفل هستند —
// طبق مستند، خاموش‌کردن آن‌ها توسط کاربر مجاز نیست.
// ─────────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PressableScale } from '../../components/pressable-scale';
import { useI18n } from '../../i18n/use-i18n';
import { useSettingsStore } from '../../store/useSettingsStore';

// ── Design tokens (یکسان با بقیه‌ی صفحات) ──
const Colors = {
  canvas: '#EFEDE5',
  surface: '#FFFFFF',
  surfaceSoft: '#F7F5ED',
  ink: '#15120D',
  muted: '#8B8578',
  border: '#E2DED2',
  borderStrong: '#D3CCBB',
  heatCoreDeep: '#9C330B',
  heatCore: '#C7420F',
  success: '#2E6B39',
  danger: '#AE3324',
  dark: '#12100D',
  darkBorder: '#282319',
  darkText: '#F2F0E9',
  darkMuted: '#87806E',
};
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' }) as string;
const SERIF = Platform.select({ ios: 'Palatino', default: 'serif' }) as string;

const LOW_BATTERY_OPTIONS = [15, 20, 25] as const;
const SCAN_TIMEOUT_OPTIONS = [10, 30, 60] as const;

// ─────────────────────────────────────────────────────────────────────────────
// PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────
function Toggle({ on, onChange, disabled = false }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => onChange(!on)}
      style={[styles.toggle, on ? styles.toggleOn : styles.toggleOff, disabled && styles.toggleDisabled]}
      hitSlop={8}
    >
      <View style={[styles.toggleKnob, on && styles.toggleKnobOn]} />
    </Pressable>
  );
}

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSub}>{sub}</Text>
      </View>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  title,
  desc,
  locked = false,
  iconSize = 20,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  locked?: boolean;
  iconSize?: number;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, locked && styles.rowIconLocked]}>
        <Ionicons name={locked ? 'lock-closed' : icon} size={locked ? 18 : iconSize} color={locked ? Colors.muted : Colors.heatCoreDeep} />
      </View>
      <View style={styles.rowTexts}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle}>{title}</Text>
          {locked && <Text style={styles.lockedTag}>{t('safetyLock')}</Text>}
        </View>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>
      {children}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  // store واقعی — persist خودکار روی AsyncStorage
  const s = useSettingsStore();
  const { t, setLang } = useI18n();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* ── TOP NAV ── */}
        <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.topNav}>
          <Pressable style={styles.backBtn} onPress={() => router.navigate('/')} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color={Colors.ink} />
          </Pressable>
          <View style={styles.navCenter}>
            <Text style={styles.navTitleEn}>SETTINGS</Text>
            <Text style={styles.navTitleFa}>{t('titleSettings')}</Text>
          </View>
          <View style={styles.resetSlot}>
            <Pressable
              onPress={() => s.resetSettings()}
              hitSlop={8}
              style={styles.resetBtn}
            >
              <Ionicons name="refresh" size={17} color={Colors.muted} />
            </Pressable>
          </View>
        </Animated.View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* ── LANGUAGE ── */}
          <Animated.View entering={FadeInDown.delay(90).springify()}>
            <Section title="LANGUAGE" sub={t('langSub')}>
              <View style={styles.chipBlock}>
                <PressableScale
                  onPress={() => setLang('fa')}
                  style={[styles.chip, s.language === 'fa' && styles.chipActive]}
                >
                  <Text style={[styles.chipText, s.language === 'fa' && styles.chipTextActive]}>
                    {t('langFa')}
                  </Text>
                </PressableScale>
                <PressableScale
                  onPress={() => setLang('en')}
                  style={[styles.chip, s.language === 'en' && styles.chipActive]}
                >
                  <Text style={[styles.chipText, s.language === 'en' && styles.chipTextActive]}>
                    {t('langEn')}
                  </Text>
                </PressableScale>
              </View>
            </Section>
          </Animated.View>

          {/* ── NOTIFICATIONS ── */}
          <Animated.View entering={FadeInDown.delay(120).springify()}>
            <Section title="NOTIFICATIONS" sub={t('secNotificationsSub')}>
              <Row
                icon="notifications-outline"
                title={t('rowNotifications')}
                desc={t('rowNotificationsDesc')}
              >
                <Toggle on={s.notificationsEnabled} onChange={(v) => s.setSettings({ notificationsEnabled: v })} />
              </Row>
              <View style={styles.rowDivider} />
              <Row
                icon="battery-half-outline"
                iconSize={23}
                title={t('rowLowBattery')}
                desc={t('rowLowBatteryDesc')}
              >
                <Toggle
                  on={s.lowBatteryAlert}
                  onChange={(v) => s.setSettings({ lowBatteryAlert: v })}
                  disabled={!s.notificationsEnabled}
                />
              </Row>
              <View style={styles.rowDivider} />
              <Row
                icon="bluetooth-outline"
                title={t('rowDisconnect')}
                desc={t('rowDisconnectDesc')}
              >
                <Toggle
                  on={s.disconnectAlert}
                  onChange={(v) => s.setSettings({ disconnectAlert: v })}
                  disabled={!s.notificationsEnabled}
                />
              </Row>
              <View style={styles.rowDivider} />
              <Row
                icon="shield-checkmark-outline"
                title={t('rowSafety')}
                desc={t('rowSafetyDesc')}
                locked
              >
                <Toggle on={true} onChange={() => {}} disabled />
              </Row>
            </Section>
          </Animated.View>

          {/* ── BATTERY THRESHOLD ── */}
          <Animated.View entering={FadeInDown.delay(180).springify()}>
            <Section title="BATTERY ALERT" sub={t('secBatterySub')}>
              <View style={styles.chipBlock}>
                {LOW_BATTERY_OPTIONS.map((opt) => (
                  <PressableScale
                    key={opt}
                    onPress={() => s.setSettings({ lowBatteryThreshold: opt })}
                    style={[styles.chip, s.lowBatteryThreshold === opt && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, s.lowBatteryThreshold === opt && styles.chipTextActive]}>
                      {`${opt}٪`}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </Section>
          </Animated.View>

          {/* ── CONNECTION ── */}
          <Animated.View entering={FadeInDown.delay(240).springify()}>
            <Section title="CONNECTION" sub={t('secConnectionSub')}>
              <Row
                icon="refresh"
                title={t('rowAutoReconnect')}
                desc={t('rowAutoReconnectDesc')}
              >
                <Toggle on={s.autoReconnect} onChange={(v) => s.setSettings({ autoReconnect: v })} />
              </Row>
              <View style={styles.rowDivider} />
              <Row
                icon="timer-outline"
                title={t('rowScanTimeout')}
                desc={t('rowScanTimeoutDesc')}
              >
                <View style={styles.inlineChips}>
                  {SCAN_TIMEOUT_OPTIONS.map((sec) => (
                    <PressableScale
                      key={sec}
                      onPress={() => s.setSettings({ scanTimeoutSec: sec })}
                      style={[styles.chipSmall, s.scanTimeoutSec === sec && styles.chipActive]}
                    >
                      <Text style={[styles.chipTextSmall, s.scanTimeoutSec === sec && styles.chipTextActive]}>
                        {`${sec}s`}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
              </Row>
            </Section>
          </Animated.View>

          {/* ── FEEDBACK ── */}
          <Animated.View entering={FadeInDown.delay(300).springify()}>
            <Section title="FEEDBACK" sub={t('secFeedbackSub')}>
              <Row
                icon="radio-button-on-outline"
                title={t('rowHaptic')}
                desc={t('rowHapticDesc')}
              >
                <Toggle on={s.vibrationFeedback} onChange={(v) => s.setSettings({ vibrationFeedback: v })} />
              </Row>
            </Section>
          </Animated.View>

          {/* ── ABOUT ── */}
          <Animated.View entering={FadeInDown.delay(360).springify()}>
            <Section title="ABOUT" sub={t('secAbout')}>
              <View style={styles.aboutRow}>
                <Text style={styles.aboutKey}>{t('aboutVersion')}</Text>
                <Text style={styles.aboutValue}>{'1.0.0'}</Text>
              </View>
              <View style={styles.rowDivider} />
              <View style={styles.aboutRow}>
                <Text style={styles.aboutKey}>{t('aboutFirmware')}</Text>
                <Text style={styles.aboutValue}>{'CH582M · 2.4.1'}</Text>
              </View>
              <View style={styles.rowDivider} />
              <View style={styles.aboutRow}>
                <Text style={styles.aboutKey}>{t('aboutSafeguard')}</Text>
                <Text style={[styles.aboutValue, { color: Colors.success }]}>{'ACTIVE · ≤45.0° · ≤120 MIN'}</Text>
              </View>
            </Section>
          </Animated.View>

          <View style={styles.footerTag}>
            <Text style={styles.footerTagText}>{t('footerTag')}</Text>
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
  scrollContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 110, gap: 14 },

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
  resetSlot: { width: 38 },
  resetBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Section
  section: { gap: 10 },
  sectionHead: { paddingHorizontal: 4 },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: Colors.ink },
  sectionSub: { fontSize: 10, color: Colors.muted, marginTop: 2 },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 1 },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: 'rgba(199,66,15,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconLocked: { backgroundColor: Colors.surfaceSoft },
  rowTexts: { flex: 1, gap: 3 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 12.5, fontWeight: '700', color: Colors.ink },
  lockedTag: {
    fontFamily: MONO,
    fontSize: 7,
    letterSpacing: 1,
    color: Colors.muted,
    backgroundColor: Colors.surfaceSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  rowDesc: { fontSize: 10, color: Colors.muted, lineHeight: 15 },

  // Toggle
  toggle: {
    width: 46,
    height: 27,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: Colors.heatCoreDeep, alignItems: 'flex-end' },
  toggleOff: { backgroundColor: Colors.borderStrong, alignItems: 'flex-start' },
  toggleDisabled: { opacity: 0.45 },
  toggleKnob: { width: 21, height: 21, borderRadius: 11, backgroundColor: '#FFFFFF' },
  toggleKnobOn: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },

  // Chips
  chipBlock: { flexDirection: 'row', gap: 8, paddingVertical: 10, paddingHorizontal: 2 },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.muted },
  chipTextActive: { color: Colors.darkText },
  inlineChips: { flexDirection: 'row', gap: 6 },
  chipSmall: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipTextSmall: { fontFamily: MONO, fontSize: 10, fontWeight: '700', color: Colors.muted },

  // About
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  aboutKey: { fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, color: Colors.muted },
  aboutValue: { fontFamily: MONO, fontSize: 11, fontWeight: '700', color: Colors.ink },

  // Footer
  footerTag: { alignItems: 'center', marginTop: 8 },
  footerTagText: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 2,
    color: Colors.muted,
    opacity: 0.6,
  },
});
