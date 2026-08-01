// components/VoteCard.js
//
// group recommendation card + voting controls.
// Visual language matches the Phase 2 RecommendationCard (pill, badges,
// purpose chips) — no redesign.

import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../globalStyles';

const PURPOSE_LABELS = {
  study: 'Study',
  work: 'Work',
  date: 'Date',
  solo: 'Solo',
  friends: 'Friends',
  family: 'Family',
};

function matchColor(pct) {
  if (pct >= 85) return '#6FBF8B';
  if (pct >= 70) return '#E0B457';
  return '#C98B8B';
}

export default function VoteCard({ rec, photoUrl, tally, myVote = 0, onVote, onOpen }) {
  const [open, setOpen] = useState(false);
  const overall = rec.overallMatch ?? rec.matchPercent ?? 0;

  return (
    <View style={styles.card}>
      <TouchableOpacity activeOpacity={0.9} onPress={onOpen}>
        {photoUrl ? <Image source={{ uri: photoUrl }} style={styles.photo} /> : null}
      </TouchableOpacity>

      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={1}>{rec.name}</Text>
          <View style={[styles.pill, { backgroundColor: matchColor(overall) }]}>
            <Text style={styles.pillText}>{overall}% group</Text>
          </View>
        </View>

        {rec.explanation ? <Text style={styles.explain}>{rec.explanation}</Text> : null}

        {rec.badges?.length ? (
          <View style={styles.row}>
            {rec.badges.slice(0, 4).map((b) => (
              <View key={b} style={styles.badge}>
                <Text style={styles.badgeText}>{b}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <TouchableOpacity onPress={() => setOpen(!open)}>
          <Text style={styles.toggle}>{open ? 'Hide friend breakdown' : 'Friend breakdown'}</Text>
        </TouchableOpacity>

        {open ? (
          <View style={styles.breakdown}>
            {(rec.memberMatches || []).map((m) => (
              <View key={m.userId} style={styles.memberRow}>
                <Text style={styles.memberName} numberOfLines={1}>{m.displayName}</Text>
                <View style={styles.bar}>
                  <View style={[styles.barFill, { width: `${m.matchPercent}%`, backgroundColor: matchColor(m.matchPercent) }]} />
                </View>
                <Text style={styles.memberPct}>{m.matchPercent}%</Text>
              </View>
            ))}

            {rec.purposeScores ? (
              <View style={[styles.row, { marginTop: 8 }]}>
                {Object.entries(rec.purposeScores).map(([k, v]) => (
                  <View key={k} style={styles.purposeChip}>
                    <Text style={styles.purposeText}>{PURPOSE_LABELS[k] || k} {v}%</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.voteRow}>
          <TouchableOpacity
            style={[styles.voteBtn, myVote === 1 && styles.voteUpActive]}
            onPress={() => onVote(myVote === 1 ? 0 : 1)}
          >
            <Text style={styles.voteText}>👍 {tally?.up ?? 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.voteBtn, myVote === -1 && styles.voteDownActive]}
            onPress={() => onVote(myVote === -1 ? 0 : -1)}
          >
            <Text style={styles.voteText}>👎 {tally?.down ?? 0}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', marginBottom: 14 },
  photo: { width: '100%', height: 140 },
  body: { padding: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  name: { flex: 1, fontSize: 15, color: colors?.text || '#4A3B36' },
  pill: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, marginLeft: 8 },
  pillText: { color: '#fff', fontSize: 11 },
  explain: { fontSize: 12, color: colors?.muted || '#7C6B65', marginTop: 6, lineHeight: 17 },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  badge: { backgroundColor: '#F6EFEC', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, marginRight: 6, marginBottom: 6 },
  badgeText: { fontSize: 10, color: colors?.text || '#4A3B36' },
  toggle: { marginTop: 6, fontSize: 12, color: colors?.primary || '#C97B7B' },
  breakdown: { marginTop: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  memberName: { width: 78, fontSize: 11, color: colors?.text || '#4A3B36' },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#F1E8E4', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  memberPct: { width: 38, textAlign: 'right', fontSize: 11, color: colors?.muted || '#9A8B85' },
  purposeChip: { backgroundColor: '#FBF5F3', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6, marginBottom: 6 },
  purposeText: { fontSize: 10, color: colors?.muted || '#7C6B65' },
  voteRow: { flexDirection: 'row', marginTop: 10 },
  voteBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: '#F6EFEC',
    marginRight: 8,
  },
  voteUpActive: { backgroundColor: '#DFF1E4' },
  voteDownActive: { backgroundColor: '#F7E1E1' },
  voteText: { fontSize: 13, color: colors?.text || '#4A3B36' },
});
