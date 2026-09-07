// app/profiles.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Qartal — Heat Profiles
//
// INTEGRATION POINT: state فعلی دمو است. بعد از اتصال store ها:
//   · profiles / activeProfileId → useScheduleStore (persist روی AsyncStorage —
//     طبق ساختار پروژه، پروفایل‌ها هم در همین store ذخیره می‌شوند)
//   · اعمال پروفایل → useHeatStore.setMode(scope, p.mode) + setTargetTemp(scope, p.targetTempC)
// قرارداد HeatMode عیناً طبق مستند.
// ─────────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
  muted: '#8B8578',
  border: '#E2DED2',
  borderStrong: '#D3CCBB',
  heatCore: '#C7420F',
  heatCoreDeep: '#9C330B',
  heatAmber: '#DC9438',
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
type ShoeSide = 'left' | 'right';
type HeatMode = 'off' | 'constant' | 'timer' | 'stepped' | 'smart' | 'activity';
type Scope = 'both' | ShoeSide;

interface HeatProfile {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  mode: HeatMode;
  targetTempC: number;
}

const MODE_FA: Record<HeatMode, TKey> = {
  off: 'modeOff',
  constant: 'modeConstant',
  timer: 'modeTimer',
  stepped: 'modeStepped',
  smart: 'modeSmart',
  activity: 'modeActivity',
};

const PROFILE_ICONS: { icon: keyof typeof Ionicons.glyphMap; tint: string }[] = [
  { icon: 'sunny-outline', tint: '#B0623A' },
  { icon: 'home-outline', tint: '#4A6B8A' },
  { icon: 'snow-outline', tint: '#5A7D9A' },
  { icon: 'fitness-outline', tint: '#7A5EA0' },
  { icon: 'bed-outline', tint: '#3E7A4C' },
  { icon: 'flame-outline', tint: '#C7420F' },
];

const PROFILE_MODES: HeatMode[] = ['constant', 'timer', 'stepped', 'smart', 'activity'];
const PROFILE_TEMPS = [34, 36, 38, 40, 42] as const; // زیر سقف سخت ۴۵° — SafetyGuardService


// ─────────────────────────────────────────────────────────────────────────────
// PROFILE CARD
// ─────────────────────────────────────────────────────────────────────────────
function ProfileCard({
  profile,
  active,
  onApply,
  onDelete,
}: {
  profile: HeatProfile;
  active: boolean;
  onApply: (scope: Scope) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  return (
    <Animated.View entering={FadeInDown.springify()} exiting={FadeOutDown.springify()} style={[styles.profileCard, active && styles.profileCardActive]}>
      <View style={styles.profileHead}>
        <View style={[styles.profileIcon, { backgroundColor: `${profile.tint}1A` }]}>
          <Ionicons name={profile.icon} size={21} color={profile.tint} />
        </View>
        <View style={styles.profileInfo}>
          <View style={styles.profileNameRow}>
            <Text style={styles.profileName}>{profile.name}</Text>
            {active && (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>{t('active')}</Text>
              </View>
            )}
          </View>
          <View style={styles.profileMeta}>
            <Text style={styles.profileMetaMode}>{t(MODE_FA[profile.mode])}</Text>
            <View style={styles.metaDot} />
            <Text style={[styles.profileMetaTemp]}>{`${profile.targetTempC}°`}</Text>
          </View>
        </View>
        <Pressable onPress={onDelete} hitSlop={8} style={styles.trashBtn}>
          <Ionicons name="trash-outline" size={18} color={Colors.danger} />
        </Pressable>
      </View>

      {/* اعمال سریع — سه اسکوپ */}
      <View style={styles.applyRow}>
        <PressableScale style={[styles.applyBtn, styles.applyBtnBoth]} onPress={() => onApply('both')}>
          <Ionicons name="git-merge-outline" size={18} color={Colors.darkText} />
          <Text style={[styles.applyBtnText, styles.applyBtnTextBoth]} numberOfLines={1}>{t('scopeBoth')}</Text>
        </PressableScale>
        <PressableScale style={styles.applyBtn} onPress={() => onApply('left')}>
          <Ionicons name="arrow-back-outline" size={17} color={Colors.muted} />
          <Text style={styles.applyBtnText} numberOfLines={1}>{t('applyLeft')}</Text>
        </PressableScale>
        <PressableScale style={styles.applyBtn} onPress={() => onApply('right')}>
          <Ionicons name="arrow-forward-outline" size={17} color={Colors.muted} />
          <Text style={styles.applyBtnText} numberOfLines={1}>{t('applyRight')}</Text>
        </PressableScale>
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
export default function ProfilesScreen() {
  // ── STORE — وضعیت واقعی از useScheduleStore (persist روی AsyncStorage) ──
  const { t, isFa } = useI18n();
  const profiles = useScheduleStore((s) => s.profiles);
  const activeProfileId = useScheduleStore((s) => s.activeProfileId);

  const [adding, setAdding] = useState(false);
  const [fName, setFName] = useState('');
  const [fIconIdx, setFIconIdx] = useState(0);
  const [fMode, setFMode] = useState<HeatMode>('smart');
  const [fTemp, setFTemp] = useState<number>(38);

  const canAdd = fName.trim().length > 0;

  const applyProfile = (profile: HeatProfile, scope: Scope) => {
    // مد و دمای هدف روی useHeatStore اعمال و پروفایل فعال ثبت می‌شود
    useScheduleStore.getState().applyProfile(profile.id, scope);
    // بازگشت به داشبورد تا کاربر نتیجه را ببیند
    router.navigate('/');
  };

  const deleteProfile = (id: string) => {
    useScheduleStore.getState().removeProfile(id);
  };

  const addProfile = () => {
    if (!canAdd) return;
    const icon = PROFILE_ICONS[fIconIdx];
    useScheduleStore.getState().addProfile({
      name: fName.trim(),
      icon: icon.icon,
      tint: icon.tint,
      mode: fMode,
      targetTempC: fTemp,
    });
    setAdding(false);
    setFName('');
    setFIconIdx(0);
    setFMode('smart');
    setFTemp(38);
  };

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* ── TOP NAV ── */}
        <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.topNav}>
          <Pressable style={styles.backBtn} onPress={() => router.navigate('/')} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color={Colors.ink} />
          </Pressable>
          <View style={styles.navCenter}>
            <Text style={styles.navTitleEn}>PROFILES</Text>
            <Text style={styles.navTitleFa}>{t('titleProfiles')}</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countText}>{`${profiles.length}`}</Text>
          </View>
        </Animated.View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* ── ACTIVE PROFILE HERO ── */}
          <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.heroCard}>
            {activeProfile ? (
              <>
                <View style={[styles.heroIcon, { backgroundColor: `${activeProfile.tint}26` }]}>
                  <Ionicons name={activeProfile.icon} size={24} color={activeProfile.tint} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.heroLabel}>{t('activeProfile')}</Text>
                  <Text style={styles.heroName}>{activeProfile.name}</Text>
                </View>
                <View style={styles.heroTempWrap}>
                  <Text style={styles.heroTemp}>{`${activeProfile.targetTempC}°`}</Text>
                  <Text style={styles.heroMode}>{t(MODE_FA[activeProfile.mode])}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.heroIcon, { backgroundColor: 'rgba(255,255,255,0.07)' }]}>
                  <Ionicons name="layers-outline" size={24} color={Colors.darkMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroLabel}>{t('activeProfile')}</Text>
                  <Text style={styles.heroNameMuted}>{t('noProfile')}</Text>
                </View>
              </>
            )}
          </Animated.View>

          {/* ── ADD BUTTON ── */}
          {!adding && (
            <Pressable style={styles.addBtn} onPress={() => setAdding(true)}>
              <Ionicons name="add-circle-outline" size={17} color={Colors.ink} />
              <Text style={styles.addBtnText}>{t('newProfile')}</Text>
            </Pressable>
          )}

          {/* ── ADD FORM (inline) ── */}
          {adding && (
            <Animated.View entering={FadeInDown.springify()} style={styles.formCard}>
              <View style={styles.formHead}>
                <Text style={styles.formTitle}>{t('newProfile')}</Text>
                <Pressable onPress={() => setAdding(false)} hitSlop={8}>
                  <Ionicons name="close" size={18} color={Colors.muted} />
                </Pressable>
              </View>

              {/* نام */}
              <Text style={styles.formLabel}>{t('profileName')}</Text>
              <TextInput
                value={fName}
                onChangeText={setFName}
                placeholder={t('profileNamePh')}
                placeholderTextColor={Colors.muted}
                style={styles.nameInput}
                maxLength={24}
              />

              {/* آیکون */}
              <Text style={styles.formLabel}>{t('iconLabel')}</Text>
              <View style={styles.iconRow}>
                {PROFILE_ICONS.map((it, i) => (
                  <PressableScale
                    key={it.icon}
                    onPress={() => setFIconIdx(i)}
                    style={[styles.iconPick, fIconIdx === i && styles.iconPickOn]}
                  >
                    <Ionicons name={it.icon} size={18} color={fIconIdx === i ? Colors.darkText : it.tint} />
                  </PressableScale>
                ))}
              </View>

              {/* مد */}
              <Text style={styles.formLabel}>{t('modeLabel')}</Text>
              <View style={styles.chipRow}>
                {PROFILE_MODES.map((m) => (
                  <PressableScale
                    key={m}
                    onPress={() => setFMode(m)}
                    style={[styles.chip, fMode === m && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, fMode === m && styles.chipTextActive]}>{t(MODE_FA[m])}</Text>
                  </PressableScale>
                ))}
              </View>

              {/* دما */}
              <Text style={styles.formLabel}>{t('tempLabel')}</Text>
              <View style={styles.chipRow}>
                {PROFILE_TEMPS.map((opt) => (
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
                onPress={addProfile}
                style={[styles.submitBtn, !canAdd && styles.submitBtnDisabled]}
              >
                <Text style={[styles.submitText, !canAdd && styles.submitTextDisabled]}>
                  {canAdd ? t('addProfile') : t('profileNamePh')}
                </Text>
              </PressableScale>
            </Animated.View>
          )}

          {/* ── SAVED PROFILES LIST ── */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionSub}>{t('profilesHint')}</Text>
          </View>

          {profiles.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="layers-outline" size={22} color={Colors.muted} />
              <Text style={styles.emptyText}>{t('emptyProfiles')}</Text>
            </View>
          ) : (
            profiles.map((p) => (
              <ProfileCard
                key={p.id}
                profile={p}
                active={p.id === activeProfileId}
                onApply={(scope) => applyProfile(p, scope)}
                onDelete={() => deleteProfile(p.id)}
              />
            ))
          )}

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

  // Hero
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.dark,
    borderColor: Colors.darkBorder,
    borderWidth: 1,
    borderRadius: 22,
    padding: 17,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 26,
    elevation: 4,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: { fontFamily: MONO, fontSize: 8, letterSpacing: 1.5, color: Colors.darkMuted },
  heroName: { fontSize: 15, fontWeight: '700', color: Colors.darkText },
  heroNameMuted: { fontSize: 13, color: Colors.darkMuted },
  heroTempWrap: { alignItems: 'flex-end', gap: 2 },
  heroTemp: { fontFamily: MONO, fontSize: 22, fontWeight: '700', color: Colors.heatAmber },
  heroMode: { fontSize: 10, color: Colors.darkMuted },

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
  nameInput: {
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13,
    color: Colors.ink,
  },
  iconRow: { flexDirection: 'row', gap: 9 },
  iconPick: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPickOn: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
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

  // Section
  sectionHead: { marginTop: 12, marginBottom: 2, paddingHorizontal: 4 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: Colors.ink },
  sectionSub: { fontSize: 10, color: Colors.muted, marginTop: 2 },

  // Profile card
  profileCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 15,
    gap: 13,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  profileCardActive: { borderColor: Colors.heatCoreDeep },
  profileHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profileIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: { flex: 1, gap: 4 },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileName: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  activeBadge: {
    backgroundColor: 'rgba(46,107,57,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
  },
  activeBadgeText: { fontSize: 9, fontWeight: '700', color: Colors.success },
  profileMeta: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  profileMetaMode: { fontSize: 10, color: Colors.muted, fontWeight: '600' },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: Colors.borderStrong },
  profileMetaTemp: { fontFamily: MONO, fontSize: 11, fontWeight: '700', color: Colors.heatCoreDeep },
  trashBtn: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  // Apply row
  applyRow: { flexDirection: 'row', gap: 8 },
  applyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  applyBtnBoth: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  applyBtnText: { fontSize: 11, fontWeight: '700', color: Colors.muted },
  applyBtnTextBoth: { color: Colors.darkText },

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
});
