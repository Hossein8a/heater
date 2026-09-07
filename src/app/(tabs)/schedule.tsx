// app/schedule.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — Heating Schedule
//
// INTEGRATION POINT: state فعلی دمو است. بعد از اتصال store ها:
//   · entries / masterEnabled → useScheduleStore (persist روی AsyncStorage)
//   · منطق trigger خودکار در src/services/SchedulerService.ts (چک هر ۳۰ ثانیه)
//     این صفحه فقط CRUD داده است و هیچ تایمری خودش اجرا نمی‌کند.
// قرارداد HeatMode عیناً طبق مستند.
// ─────────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PressableScale } from '../../components/pressable-scale';
import type { TKey } from '../../i18n/strings';
import { useI18n } from '../../i18n/use-i18n';
import { useScheduleStore } from '../../store/useScheduleStore';

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
  success: '#2E6B39',
  danger: '#AE3324',
  dark: '#12100D',
  darkBorder: '#282319',
  darkText: '#F2F0E9',
  darkMuted: '#87806E',
};
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' }) as string;
const SERIF = Platform.select({ ios: 'Palatino', default: 'serif' }) as string;

// ── قرارداد مشترک ──
type HeatMode = 'off' | 'constant' | 'timer' | 'stepped' | 'smart' | 'activity';

interface ScheduleEntry {
  id: string;
  time: string; // "HH:MM" 24h
  days: number[]; // 0..6 — 0 = شنبه
  mode: HeatMode;
  targetTempC: number;
  enabled: boolean;
}

// روزهای هفته — 0 = شنبه (ترتیب ایرانی) — برچسب‌ها از strings می‌آیند
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const dayShort = (t: (k: TKey) => string, idx: number) => t(`day${idx}Short` as TKey);
const dayFull = (t: (k: TKey) => string, idx: number) => t(`day${idx}Full` as TKey);

const SCHEDULE_MODES: { mode: HeatMode; key: TKey; icon: keyof typeof Ionicons.glyphMap }[] = [
  { mode: 'smart', key: 'modeSmart', icon: 'bulb-outline' },
  { mode: 'constant', key: 'modeConstant', icon: 'flame-outline' },
  { mode: 'timer', key: 'modeTimer', icon: 'timer-outline' },
  { mode: 'stepped', key: 'modeStepped', icon: 'trending-up-outline' },
];
const TEMP_OPTIONS = [34, 36, 38, 40, 42] as const; // زیر سقف سخت ۴۵° — SafetyGuardService

const MODE_FA: Record<HeatMode, TKey> = {
  off: 'modeOff',
  constant: 'modeConstant',
  timer: 'modeTimer',
  stepped: 'modeStepped',
  smart: 'modeSmart',
  activity: 'modeActivity',
};

const pad2 = (n: number) => String(n).padStart(2, '0');

// ارقام فارسی برای ساعت زمانبندی
const faDigits = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const fmtNextTime = (when: Date, fa: boolean) => {
  const hh = pad2(when.getHours());
  const mm = pad2(when.getMinutes());
  return fa ? `${faDigits(hh)}:${faDigits(mm)}` : `${hh}:${mm}`;
};


// ─────────────────────────────────────────────────────────────────────────────
// TOGGLE SWITCH (بدون کتابخانه‌ی خارجی)
// ─────────────────────────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!on)}
      style={[styles.toggle, on ? styles.toggleOn : styles.toggleOff]}
      hitSlop={8}
    >
      <View style={[styles.toggleKnob, on && styles.toggleKnobOn]} />
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY CARD
// ─────────────────────────────────────────────────────────────────────────────
function EntryCard({
  entry,
  onToggle,
  onDelete,
}: {
  entry: ScheduleEntry;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [h, m] = entry.time.split(':');
  const activeDays = new Set(entry.days);

  return (
    <Animated.View entering={FadeInDown.springify()} exiting={FadeOutDown.springify()} style={[styles.entryCard, !entry.enabled && styles.entryCardOff]}>
      <View style={styles.entryTop}>
        <View style={styles.entryTimeWrap}>
          <Ionicons name="time-outline" size={15} color={entry.enabled ? Colors.heatCoreDeep : Colors.muted} />
          <Text style={[styles.entryTime, !entry.enabled && styles.entryTimeOff]}>{`${h}:${m}`}</Text>
        </View>
        <View style={styles.entryActions}>
          <Toggle on={entry.enabled} onChange={onToggle} />
          <Pressable onPress={onDelete} hitSlop={8} style={styles.trashBtn}>
            <Ionicons name="trash-outline" size={15} color={Colors.danger} />
          </Pressable>
        </View>
      </View>

      {/* روزها */}
      <View style={styles.dayRow}>
        {DAYS.map((idx) => (
          <View key={idx} style={[styles.dayDot, activeDays.has(idx) && styles.dayDotOn]}>
            <Text style={[styles.dayDotText, activeDays.has(idx) && styles.dayDotTextOn]}>{dayShort(t, idx)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.entryFoot}>
        <View style={styles.entryTag}>
          <Ionicons
            name={entry.mode === 'off' ? 'power-outline' : 'flame-outline'}
            size={14}
            color={Colors.muted}
          />
          <Text style={styles.entryTagText}>{t(MODE_FA[entry.mode])}</Text>
        </View>
        <View style={styles.entryTag}>
          <Ionicons name="thermometer-outline" size={14} color={Colors.heatCoreDeep} />
          <Text style={[styles.entryTagText, styles.entryTagTemp]}>{`${entry.targetTempC}°`}</Text>
        </View>
        {entry.days.length === 7 && (
          <Text style={styles.everydayTag}>{t('everyDay')}</Text>
        )}
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function ScheduleScreen() {
  // ── STORE — وضعیت واقعی از useScheduleStore (persist روی AsyncStorage) ──
  const { t, isFa } = useI18n();
  const masterEnabled = useScheduleStore((s) => s.masterEnabled);
  const entries = useScheduleStore((s) => s.entries);
  const setMasterEnabled = (v: boolean) => useScheduleStore.getState().setMasterEnabled(v);

  const [adding, setAdding] = useState(false);
  const [fHour, setFHour] = useState(7);
  const [fMin, setFMin] = useState(0);
  const [fDays, setFDays] = useState<number[]>([]);
  const [fMode, setFMode] = useState<HeatMode>('smart');
  const [fTemp, setFTemp] = useState<number>(38);

    const sorted = useMemo(
    () => [...entries].sort((a, b) => a.time.localeCompare(b.time)),
    [entries],
  );

  // زمان‌بندی = اجرای خودکار در ساعت مشخص — وقتی فعال باشد، هر روز در ساعت تنظیم‌شده به طور خودکار اعمال می‌شود.
  const nextRun = useMemo(() => {
    if (!masterEnabled || sorted.length === 0) return null;
    const now = new Date();
    let soon: Date | null = null;
    let soonEntry: (typeof sorted)[number] | null = null;
    for (const e of sorted) {
      for (const d of e.days) {
        const [h, m] = e.time.split(':').map(Number);
        const dNow = now.getDay();
        const diff = (d + 7 - dNow) % 7;
        const run = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, h, m, 0);
        if (run > now && (!soon || run < soon)) { soon = run; soonEntry = e; }
      }
    }
    return soon ? { when: soon, entry: soonEntry! } : null;
  }, [masterEnabled, sorted]);

  const toggleEntry = (id: string, v: boolean) => {
    useScheduleStore.getState().toggleEntry(id, v);
  };

  const deleteEntry = (id: string) => {
    useScheduleStore.getState().removeEntry(id);
  };

  const toggleFormDay = (idx: number) => {
    setFDays((prev) => (prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort()));
  };

  const stepTime = (deltaH: number, deltaM: number) => {
    let total = fHour * 60 + fMin + deltaH * 60 + deltaM;
    total = ((total % 1440) + 1440) % 1440;
    setFHour(Math.floor(total / 60));
    setFMin(total % 60);
  };

  const canAdd = fDays.length > 0;

  const addEntry = () => {
    if (!canAdd) return;
    const entry: ScheduleEntry = {
      id: `sch-${Date.now()}`,
      time: `${pad2(fHour)}:${pad2(fMin)}`,
      days: fDays,
      mode: fMode,
      targetTempC: fTemp,
      enabled: true,
    };
    useScheduleStore.getState().addEntry(entry);
    setAdding(false);
    setFDays([]);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* ── TOP NAV ── */}
        <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.topNav}>
          <Pressable style={styles.backBtn} onPress={() => router.navigate('/')} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color={Colors.ink} />
          </Pressable>
          <View style={styles.navCenter}>
            <Text style={styles.navTitleEn}>SCHEDULE</Text>
            <Text style={styles.navTitleFa}>{t('titleSchedule')}</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countText}>{`${entries.filter((e) => e.enabled).length}/${entries.length}`}</Text>
          </View>
        </Animated.View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* ── MASTER TOGGLE ── */}
          <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.masterCard}>
            <View style={styles.masterIconWrap}>
              <Ionicons name="calendar-clear-outline" size={20} color={Colors.darkText} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.masterTitle}>{t('masterTitle')}</Text>
              <Text style={styles.masterSub}>{t('masterSub')}</Text>
            </View>
            <Toggle on={masterEnabled} onChange={setMasterEnabled} />
          </Animated.View>

          {/* ── ADD BUTTON ── */}
          {!adding && (
            <PressableScale style={styles.addBtn} onPress={() => setAdding(true)}>
              <Ionicons name="add-circle-outline" size={17} color={Colors.ink} />
              <Text style={styles.addBtnText}>{t('newSchedule')}</Text>
            </PressableScale>
          )}

          {/* ── ADD FORM (inline) ── */}
          {adding && (
            <Animated.View entering={FadeInDown.springify()} style={styles.formCard}>
              <View style={styles.formHead}>
                <Text style={styles.formTitle}>{t('newSchedule')}</Text>
                <Pressable onPress={() => setAdding(false)} hitSlop={8}>
                  <Ionicons name="close" size={18} color={Colors.muted} />
                </Pressable>
              </View>

              {/* انتخابگر زمان */}
              <View style={styles.timePickerRow}>
                <Pressable style={styles.timeBtn} onPress={() => stepTime(1, 0)}>
                  <Ionicons name="chevron-up" size={16} color={Colors.ink} />
                </Pressable>
                <Text style={styles.timeValue}>{`${pad2(fHour)}:${pad2(fMin)}`}</Text>
                <Pressable style={styles.timeBtn} onPress={() => stepTime(-1, 0)}>
                  <Ionicons name="chevron-down" size={16} color={Colors.ink} />
                </Pressable>
              </View>
              <View style={styles.timePickerRow}>
                <Pressable style={styles.timeBtn} onPress={() => stepTime(0, 15)}>
                  <Ionicons name="chevron-up" size={16} color={Colors.ink} />
                </Pressable>
                <Text style={styles.timeValueSmall}>{t('minuteLabel')}</Text>
                <Pressable style={styles.timeBtn} onPress={() => stepTime(0, -15)}>
                  <Ionicons name="chevron-down" size={16} color={Colors.ink} />
                </Pressable>
              </View>

              {/* روزها */}
              <Text style={styles.formLabel}>{t('dayLabel')}</Text>
              <View style={styles.dayPickRow}>
                {DAYS.map((idx) => {
                  const on = fDays.includes(idx);
                  return (
                    <PressableScale
                      key={idx}
                      onPress={() => toggleFormDay(idx)}
                      style={[styles.dayPick, on && styles.dayPickOn]}
                    >
                      <Text style={[styles.dayPickText, on && styles.dayPickTextOn]}>{dayShort(t, idx)}</Text>
                    </PressableScale>
                  );
                })}
              </View>
              {fDays.length > 0 && (
                <Text style={styles.formDaysFull}>
                  {fDays.map((i) => dayFull(t, i)).join('، ')}
                </Text>
              )}

              {/* مد */}
              <Text style={styles.formLabel}>{t('modeLabel')}</Text>
              <View style={styles.chipRow}>
                {SCHEDULE_MODES.map((m) => (
                  <PressableScale
                    key={m.mode}
                    onPress={() => setFMode(m.mode)}
                    style={[styles.chip, fMode === m.mode && styles.chipActive]}
                  >
                    <Ionicons
                      name={m.icon}
                      size={14}
                      color={fMode === m.mode ? Colors.darkText : Colors.muted}
                    />
                    <Text style={[styles.chipText, fMode === m.mode && styles.chipTextActive]}>{t(m.key)}</Text>
                  </PressableScale>
                ))}
              </View>

              {/* دما */}
              <Text style={styles.formLabel}>{t('tempLabel')}</Text>
              <View style={styles.chipRow}>
                {TEMP_OPTIONS.map((opt) => (
                  <PressableScale
                    key={opt}
                    onPress={() => setFTemp(opt)}
                    style={[styles.chip, fTemp === opt && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, fTemp === opt && styles.chipTextActive]}>{`${opt}°`}</Text>
                  </PressableScale>
                ))}
              </View>

              <PressableScale
                disabled={!canAdd}
                onPress={addEntry}
                style={[styles.submitBtn, !canAdd && styles.submitBtnDisabled]}
              >
                <Text style={[styles.submitText, !canAdd && styles.submitTextDisabled]}>
                  {canAdd ? t('addToSchedule') : t('pickDay')}
                </Text>
              </PressableScale>
            </Animated.View>
          )}

          {/* -- NEXT RUN -- */}
          {nextRun && (
            <View style={styles.nextRunBanner}>
              <Ionicons name="time-outline" size={16} color={Colors.heatCoreDeep} />
              <View style={{ flex: 1 }}>
                <Text style={styles.nextRunTitle}>{isFa ? 'برنامه بعدی' : 'NEXT AUTOMATIC RUN'}</Text>
                <View style={styles.nextRunMeta}>
                  <Text style={styles.nextRunAt}>{isFa ? 'ساعت' : 'AT'}</Text>
                  <Text style={styles.nextRunTime}>{fmtNextTime(nextRun.when, isFa)}</Text>
                  <View style={styles.nextRunDot} />
                  <Text style={styles.nextRunMode} numberOfLines={1}>
                    {`${t(MODE_FA[nextRun.entry.mode])} · ${nextRun.entry.targetTempC}°`}
                  </Text>
                </View>
              </View>
            </View>
          )}

{/* ── ENTRIES ── */}
          {sorted.length === 0 && !adding ? (
            <View style={styles.emptyCard}>
              <Ionicons name="calendar-outline" size={22} color={Colors.muted} />
              <Text style={styles.emptyText}>{t('emptySchedule')}</Text>
            </View>
          ) : (
            sorted.map((e) => (
              <EntryCard
                key={e.id}
                entry={e}
                onToggle={(v) => toggleEntry(e.id, v)}
                onDelete={() => deleteEntry(e.id)}
              />
            ))
          )}

          {/* ── SAFETY NOTE ── */}
          <View style={styles.safetyNote}>
            <Ionicons name="shield-checkmark-outline" size={16} color={Colors.heatCoreDeep} />
            <Text style={styles.safetyNoteText}>
              {t('scheduleSafety')}
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
  nextRunBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(199,66,15,0.25)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  nextRunTitle: { fontFamily: MONO, fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: Colors.muted },
  nextRunMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' },
  nextRunAt: { fontSize: 10, fontWeight: '600', color: Colors.muted },
  nextRunTime: { fontFamily: MONO, fontSize: 16, fontWeight: '700', color: Colors.heatCoreDeep, letterSpacing: 1 },
  nextRunDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: Colors.borderStrong },
  nextRunMode: { fontSize: 10.5, fontWeight: '700', color: Colors.heatCoreDeep, flexShrink: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 110, gap: 10 },

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
  countPill: { backgroundColor: Colors.ink, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99 },
  countText: { fontFamily: MONO, color: Colors.darkText, fontSize: 10, fontWeight: '700', letterSpacing: 1 },

  // Master
  masterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: Colors.dark,
    borderColor: Colors.darkBorder,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 26,
    elevation: 4,
  },
  masterIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  masterTitle: { fontSize: 13, fontWeight: '700', color: Colors.darkText },
  masterSub: { fontSize: 10, color: Colors.darkMuted },

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
  toggleKnob: { width: 21, height: 21, borderRadius: 11, backgroundColor: '#FFFFFF' },
  toggleKnobOn: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2 },

  // Add
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.ink,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 13,
  },
  addBtnText: { fontSize: 12, fontWeight: '700', color: Colors.ink },

  // Form
  formCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  formHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  formTitle: { fontSize: 13, fontWeight: '700', color: Colors.ink },
  formLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: Colors.muted, marginTop: 2 },
  formDaysFull: { fontSize: 10, color: Colors.heatCoreDeep, marginTop: -4 },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  timeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeValue: {
    fontFamily: MONO,
    fontSize: 30,
    fontWeight: '700',
    color: Colors.ink,
    letterSpacing: 1,
    minWidth: 110,
    textAlign: 'center',
  },
  timeValueSmall: { fontFamily: MONO, fontSize: 11, color: Colors.muted, minWidth: 110, textAlign: 'center' },
  dayPickRow: { flexDirection: 'row', gap: 7 },
  dayPick: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 42,
    borderRadius: 12,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPickOn: { backgroundColor: Colors.heatCoreDeep, borderColor: Colors.heatCoreDeep },
  dayPickText: { fontSize: 13, fontWeight: '700', color: Colors.muted },
  dayPickTextOn: { color: Colors.darkText },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  chipText: { fontSize: 11, fontWeight: '700', color: Colors.muted },
  chipTextActive: { color: Colors.darkText },
  submitBtn: {
    alignItems: 'center',
    backgroundColor: Colors.heatCoreDeep,
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 4,
  },
  submitBtnDisabled: { backgroundColor: Colors.surfaceSoft, borderWidth: 1, borderColor: Colors.border },
  submitText: { fontSize: 12, fontWeight: '700', color: Colors.darkText },
  submitTextDisabled: { color: Colors.muted },

  // Entry card
  entryCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 15,
    gap: 11,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  entryCardOff: { opacity: 0.62 },
  entryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  entryTimeWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  entryTime: { fontFamily: MONO, fontSize: 22, fontWeight: '700', color: Colors.ink, letterSpacing: 1 },
  entryTimeOff: { color: Colors.muted },
  entryActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trashBtn: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dayRow: { flexDirection: 'row', gap: 6 },
  dayDot: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotOn: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  dayDotText: { fontSize: 11, fontWeight: '700', color: Colors.muted },
  dayDotTextOn: { color: Colors.darkText },
  entryFoot: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surfaceSoft,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  entryTagText: { fontSize: 10, fontWeight: '600', color: Colors.muted },
  entryTagTemp: { fontFamily: MONO, color: Colors.heatCoreDeep, fontWeight: '700' },
  everydayTag: { fontSize: 9, color: Colors.success, fontWeight: '700', marginLeft: 'auto' },

  // Empty
  emptyCard: {
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: 18,
    paddingVertical: 28,
  },
  emptyText: { fontSize: 11, color: Colors.muted },

  // Safety note
  safetyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: 'rgba(199,66,15,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(199,66,15,0.2)',
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginTop: 4,
  },
  safetyNoteText: { flex: 1, fontSize: 10, color: Colors.heatCoreDeep, lineHeight: 15 },
});
