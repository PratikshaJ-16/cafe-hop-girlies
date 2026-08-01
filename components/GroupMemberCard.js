// components/GroupMemberCard.js
//
// Reuses the existing palette/typography from globalStyles.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../globalStyles';

export default function GroupMemberCard({ member, hasSubmitted, hasVoted, isYou }) {
  const initials = (member.displayName || '?').trim().slice(0, 2).toUpperCase();
  const status = hasVoted ? 'Voted' : hasSubmitted ? 'Ready' : 'Waiting…';

  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {member.displayName || 'Friend'}
          {isYou ? ' (you)' : ''}
          {member.isHost ? ' · host' : ''}
        </Text>
        <Text style={styles.status}>{status}</Text>
      </View>
      <View style={[styles.dot, (hasSubmitted || hasVoted) && styles.dotReady]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors?.primary || '#E8A0A0',
  },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  info: { flex: 1, marginLeft: 10 },
  name: { fontSize: 14, color: colors?.text || '#4A3B36' },
  status: { fontSize: 11, color: colors?.muted || '#9A8B85', marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#E3D8D3' },
  dotReady: { backgroundColor: '#6FBF8B' },
});
