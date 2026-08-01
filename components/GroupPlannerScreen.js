// components/GroupPlannerScreen.js
//
// Create/join a session, collect preferences, compute compromise
// recommendations with the EXISTING engine, vote in realtime, pick a winner.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import * as Location from 'expo-location';
import { GOOGLE_MAPS_API_KEY } from '@env';

import { colors } from '../globalStyles';
import { auth } from '../firebase';
import GroupMemberCard from './GroupMemberCard';
import PreferenceCard from './PreferenceCard';
import VoteCard from './VoteCard';
import {
  SESSION_STATES,
  createSession,
  joinSession,
  submitPreferences,
  saveRecommendations,
  castVote,
  selectCafe,
  setStatus,
  subscribeToSession,
  leaveSession,
  isExpired,
} from './group/sessionManager';
import { recommendForGroup } from './group/groupPreferenceEngine';
import { computeWinner, memberVote, votingProgress } from './group/votingEngine';


const PLACES_URL = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';

function photoUrl(ref) {
  if (!ref) return null;
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photo_reference=${ref}&key=${GOOGLE_MAPS_API_KEY}`;
}

export default function GroupPlannerScreen({ navigation }) {
  const user = auth.currentUser;
  const userId = user?.uid;
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Friend';

  const [session, setSession]   = useState(null);
  const [code, setCode]         = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState(null);
  const [computing, setComputing] = useState(false);
  const [userLoc, setUserLoc]   = useState(null);
  const cafesRef = useRef(null);
  const unsubRef = useRef(null);

  // Location once, reused for retrieval + scoring.
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({});
        setUserLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch {
        /* location optional — scoring falls back to neutral distance */
      }
    })();
    return () => unsubRef.current?.();
  }, []);

  const listen = useCallback((sessionId) => {
    unsubRef.current?.();
    unsubRef.current = subscribeToSession(
      sessionId,
      (data) => {
        setSession(data);
        if (isExpired(data)) setError('This session has expired.');
      },
      (err) => setError(err.message || 'Lost connection to the session.'),
    );
  }, []);

  const handleCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      const { sessionId } = await createSession({ userId, displayName, location: userLoc });
      listen(sessionId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    setError(null);
    setBusy(true);
    try {
      const s = await joinSession({ code, userId, displayName });
      listen(s.sessionId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitPrefs = async (prefs) => {
    setBusy(true);
    setError(null);
    try {
      await submitPreferences({ sessionId: session.sessionId, userId, preferences: prefs });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const fetchCafes = async (radiusKm) => {
    if (cafesRef.current) return cafesRef.current;
    if (!userLoc) return [];
    const radius = Math.min(50000, Math.round((radiusKm || 5) * 1000));
    const url = `${PLACES_URL}?location=${userLoc.latitude},${userLoc.longitude}&radius=${radius}&type=cafe&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    cafesRef.current = json.results || [];
    return cafesRef.current;
  };

  const handleGenerate = async () => {
    setComputing(true);
    setError(null);
    try {
      await setStatus(session.sessionId, SESSION_STATES.GENERATING);
      //change for now 
      const cafes = await fetchCafes(5);

      // const cafes = mockCafes;
      const { recommendations } = recommendForGroup(
        cafes,
        session.preferences || {},
        session.members || [],
        userLoc,
        { topN: 5 },
      );
      if (recommendations.length === 0) {
        setError('No cafes matched everyone. Try relaxing budget or distance.');
        await setStatus(session.sessionId, SESSION_STATES.COLLECTING);
        return;
      }
      await saveRecommendations({ sessionId: session.sessionId, recommendations });
    } catch (e) {
      setError(e.message || 'Could not generate recommendations.');
      await setStatus(session.sessionId, SESSION_STATES.COLLECTING).catch(() => {});
    } finally {
      setComputing(false);
    }
  };

  const handleVote = async (placeId, value) => {
    try {
      await castVote({ sessionId: session.sessionId, userId, placeId, value });
    } catch (e) {
      setError(e.message);
    }
  };

  const recommendations = session?.recommendations || [];
  const winner = useMemo(
    () => computeWinner(session?.votes || {}, recommendations),
    [session?.votes, recommendations],
  );
  const progress = useMemo(
    () => votingProgress(session?.votes || {}, session?.members || []),
    [session?.votes, session?.members],
  );

  const isHost = session?.createdBy === userId;
  const mySubmitted = !!session?.preferences?.[userId];
  const submittedCount = Object.keys(session?.preferences || {}).length;

  // ---------- Lobby (no session yet) ----------
  if (!session) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Plan With Friends</Text>
        <Text style={styles.sub}>
          Everyone shares what they want — the AI finds the cafe that works best for the whole group.
        </Text>

        <TouchableOpacity style={styles.primaryBtn} onPress={handleCreate} disabled={busy}>
          <Text style={styles.primaryBtnText}>{busy ? 'Creating…' : 'Create a session'}</Text>
        </TouchableOpacity>

        <Text style={styles.or}>or join with a code</Text>
        <View style={styles.joinRow}>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase().slice(0, 6))}
            placeholder="QX7P2A"
            autoCapitalize="characters"
            maxLength={6}
          />
          <TouchableOpacity style={styles.joinBtn} onPress={handleJoin} disabled={busy || code.length !== 6}>
            <Text style={styles.primaryBtnText}>Join</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    );
  }

  // ---------- Active session ----------
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.codeBox}>
        <Text style={styles.codeLabel}>Invite code</Text>
        <Text style={styles.code}>{session.inviteCode}</Text>
        <Text style={styles.codeHint}>Share this with your friends to let them join.</Text>
      </View>

      <Text style={styles.h2}>Members ({session.members?.length || 0})</Text>
      {(session.members || []).map((m) => (
        <GroupMemberCard
          key={m.userId}
          member={m}
          isYou={m.userId === userId}
          hasSubmitted={!!session.preferences?.[m.userId]}
          hasVoted={Object.values(session.votes?.[m.userId] || {}).some((v) => v !== 0)}
        />
      ))}

      {session.status !== SESSION_STATES.COMPLETED && !mySubmitted ? (
        <PreferenceCard submitting={busy} onSubmit={handleSubmitPrefs} />
      ) : null}

      {mySubmitted && recommendations.length === 0 ? (
        <View style={styles.panel}>
          <Text style={styles.panelText}>
            {submittedCount} of {session.members?.length || 0} friends ready.
          </Text>
          {isHost ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleGenerate} disabled={computing || submittedCount === 0}>
              {computing ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Find our cafe</Text>}
            </TouchableOpacity>
          ) : (
            <Text style={styles.panelHint}>Waiting for the host to generate recommendations…</Text>
          )}
        </View>
      ) : null}

      {recommendations.length > 0 ? (
        <>
          <Text style={styles.h2}>Best compromises</Text>
          {winner ? (
            <View style={styles.winnerBox}>
              <Text style={styles.winnerLabel}>
                {session.status === SESSION_STATES.COMPLETED ? 'Final pick' : 'Current winner'}
              </Text>
              <Text style={styles.winnerName}>{winner.name}</Text>
              <Text style={styles.winnerMeta}>
                👍 {winner.up} · 👎 {winner.down} · {winner.overallMatch}% group match
                {winner.isTie ? ' · tie' : ''}
              </Text>
              <Text style={styles.winnerMeta}>{progress.voted}/{progress.total} voted</Text>
            </View>
          ) : null}

          {recommendations.map((rec) => (
            <VoteCard
              key={rec.placeId}
              rec={rec}
              photoUrl={photoUrl(rec.photoRef)}
              tally={winner?.tallies?.find((t) => t.placeId === rec.placeId)}
              myVote={memberVote(session.votes, userId, rec.placeId)}
              onVote={(v) => handleVote(rec.placeId, v)}
              onOpen={() => navigation?.navigate?.('CafeDetails', { cafe: rec.cafe, })}   //replace with placeId: rec.placeId,
            />
          ))}

          {isHost && session.status !== SESSION_STATES.COMPLETED && winner ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => selectCafe({ sessionId: session.sessionId, cafe: { placeId: winner.placeId, name: winner.name } })}
            >
              <Text style={styles.primaryBtnText}>Lock in {winner.name}</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={styles.leave}
        onPress={async () => {
          await leaveSession({ sessionId: session.sessionId, userId }).catch(() => {});
          unsubRef.current?.();
          setSession(null);
        }}
      >
        <Text style={styles.leaveText}>Leave session</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors?.background || '#FDF7F4' },
  content: { padding: 16, paddingBottom: 40 },
  h1: { fontSize: 22, color: colors?.text || '#4A3B36' },
  h2: { fontSize: 15, color: colors?.text || '#4A3B36', marginTop: 16, marginBottom: 8 },
  sub: { fontSize: 13, color: colors?.muted || '#7C6B65', marginTop: 6, marginBottom: 18, lineHeight: 19 },
  primaryBtn: {
    backgroundColor: colors?.primary || '#E8A0A0',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  primaryBtnText: { color: '#fff', fontSize: 14 },
  or: { textAlign: 'center', marginVertical: 14, fontSize: 12, color: colors?.muted || '#9A8B85' },
  joinRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    letterSpacing: 3,
    color: colors?.text || '#4A3B36',
  },
  joinBtn: {
    marginLeft: 8,
    backgroundColor: colors?.primary || '#E8A0A0',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 20,
  },
  codeBox: { backgroundColor: '#fff', borderRadius: 18, padding: 16, alignItems: 'center' },
  codeLabel: { fontSize: 11, color: colors?.muted || '#9A8B85' },
  code: { fontSize: 30, letterSpacing: 6, color: colors?.text || '#4A3B36', marginVertical: 4 },
  codeHint: { fontSize: 11, color: colors?.muted || '#9A8B85' },
  panel: { backgroundColor: '#fff', borderRadius: 18, padding: 14, marginTop: 8 },
  panelText: { fontSize: 13, color: colors?.text || '#4A3B36' },
  panelHint: { fontSize: 12, color: colors?.muted || '#9A8B85', marginTop: 8 },
  winnerBox: { backgroundColor: '#FFF3EE', borderRadius: 18, padding: 14, marginBottom: 12 },
  winnerLabel: { fontSize: 11, color: colors?.muted || '#9A8B85' },
  winnerName: { fontSize: 17, color: colors?.text || '#4A3B36', marginTop: 2 },
  winnerMeta: { fontSize: 12, color: colors?.muted || '#7C6B65', marginTop: 3 },
  error: { color: '#C05B5B', fontSize: 12, marginTop: 12, textAlign: 'center' },
  leave: { marginTop: 20, alignItems: 'center' },
  leaveText: { fontSize: 12, color: colors?.muted || '#9A8B85' },
});
