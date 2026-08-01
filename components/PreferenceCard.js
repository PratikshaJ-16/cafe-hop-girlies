// components/PreferenceCard.js
//
// Emits an object shaped exactly like parsePreferences() output so the
// existing engine consumes it with zero adapters.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../globalStyles';

const PURPOSES = [
  { key: 'study',   label: 'Study' },
  { key: 'date',    label: 'Date' },
  { key: 'friends', label: 'Friends' },
  { key: 'work',    label: 'Remote Work' },
  { key: 'coffee',  label: 'Coffee' },
  { key: 'dessert', label: 'Desserts' },
];
const BUDGETS   = [200, 400, 600, 1000, 1500];
const DISTANCES = [1, 2, 5, 10];
const NOISES    = [
  { key: 'low',    label: 'Quiet' },
  { key: 'medium', label: 'Medium' },
  { key: 'high',   label: 'Lively' },
];
const SEATING = [
  { key: 'indoor',  label: 'Indoor',  value: false },
  { key: 'outdoor', label: 'Outdoor', value: true },
];

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.row}>{children}</View>
    </View>
  );
}

export default function PreferenceCard({ initial, submitting, onSubmit }) {
  const [purpose, setPurpose]   = useState(initial?.purpose);
  const [budget, setBudget]     = useState(initial?.budget);
  const [distance, setDistance] = useState(initial?.distance ?? 5);
  const [noise, setNoise]       = useState(initial?.noise);
  const [outdoor, setOutdoor]   = useState(initial?.outdoor);
  const [wifi, setWifi]         = useState(initial?.wifi === true);
  const [charging, setCharging] = useState(initial?.charging === true);
  const [groupSize, setGroupSize] = useState(initial?.groupSize);

  const toggle = (cur, next) => (cur === next ? undefined : next);

  // const submit = () =>
  //   onSubmit({
  //     purpose,
  //     budget,
  //     distance,
  //     noise,
  //     outdoor,
  //     wifi: wifi ? true : undefined,
  //     charging: charging ? true : undefined,
  //     groupSize,
  //     ambience: purpose === 'date' ? 'romantic' : undefined,
  //     coffee: purpose === 'coffee' ? true : undefined,
  //     food: purpose === 'dessert' ? true : undefined,
  //   });

  const submit = () => {
  const preferences = {
    purpose,
    budget,
    distance,
    noise,
    outdoor,
    wifi,
    charging,
    groupSize,
    ambience: purpose === 'date' ? 'romantic' : null,
    coffee: purpose === 'coffee',
    food: purpose === 'dessert',
  };

  // Remove any undefined values before sending to Firestore
  Object.keys(preferences).forEach((key) => {
    if (preferences[key] === undefined) {
      delete preferences[key];
    }
  });

  onSubmit(preferences);
};

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Your preferences</Text>

      <Section title="Purpose">
        {PURPOSES.map((p) => (
          <Chip key={p.key} label={p.label} active={purpose === p.key} onPress={() => setPurpose(toggle(purpose, p.key))} />
        ))}
      </Section>

      <Section title="Budget per person">
        {BUDGETS.map((b) => (
          <Chip key={b} label={`₹${b}`} active={budget === b} onPress={() => setBudget(toggle(budget, b))} />
        ))}
      </Section>

      <Section title="Max travel distance">
        {DISTANCES.map((d) => (
          <Chip key={d} label={`${d} km`} active={distance === d} onPress={() => setDistance(d)} />
        ))}
      </Section>

      <Section title="Noise">
        {NOISES.map((n) => (
          <Chip key={n.key} label={n.label} active={noise === n.key} onPress={() => setNoise(toggle(noise, n.key))} />
        ))}
      </Section>

      <Section title="Seating">
        {SEATING.map((s) => (
          <Chip key={s.key} label={s.label} active={outdoor === s.value} onPress={() => setOutdoor(outdoor === s.value ? undefined : s.value)} />
        ))}
      </Section>

      <Section title="Must have">
        <Chip label="Wi-Fi" active={wifi} onPress={() => setWifi(!wifi)} />
        <Chip label="Charging" active={charging} onPress={() => setCharging(!charging)} />
      </Section>

      <Section title="Group size">
        {[2, 3, 4, 5, 6, 8].map((g) => (
          <Chip key={g} label={`${g}`} active={groupSize === g} onPress={() => setGroupSize(toggle(groupSize, g))} />
        ))}
      </Section>

      <TouchableOpacity style={[styles.submit, submitting && styles.submitDisabled]} onPress={submit} disabled={submitting}>
        <Text style={styles.submitText}>{submitting ? 'Saving…' : 'Submit preferences'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 14 },
  title: { fontSize: 16, color: colors?.text || '#4A3B36', marginBottom: 10 },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 12, color: colors?.muted || '#9A8B85', marginBottom: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#F6EFEC',
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: colors?.primary || '#E8A0A0' },
  chipText: { fontSize: 12, color: colors?.text || '#4A3B36' },
  chipTextActive: { color: '#fff' },
  submit: {
    marginTop: 4,
    backgroundColor: colors?.primary || '#E8A0A0',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 14 },
});
