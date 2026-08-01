// ConciergeScreen.js
//
// AI Concierge — natural-language cafe discovery.
// Design language reuses the existing pink/earth palette and Pixelify font
// from globalStyles.js. 

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
} from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GOOGLE_MAPS_API_KEY } from '@env';

import { colors, globalStyles } from '../globalStyles';
import { parsePreferences, summarizePreferences } from './ai/preferenceParser';
import { recommendCafes } from './ai/recommendationEngine';
import { attachExplanations } from './ai/aiExplanation';


const SUGGESTION_CHIPS = [
  { label: 'Study',       query: 'Quiet cafe for studying with wifi and charging' },
  { label: 'Date',        query: 'Romantic rooftop cafe for a date' },
  { label: 'Remote Work', query: 'Cafe with wifi and outlets for remote work' },
  { label: 'Solo',        query: 'Cozy quiet cafe for a solo visit' },
  { label: 'Friends',     query: 'Lively cafe to hang out with friends' },
  { label: 'Coffee',      query: 'Best coffee nearby' },
  { label: 'Desserts',    query: 'Cafe with great desserts and cakes' },
  { label: 'Outdoor',     query: 'Cafe with outdoor seating' },
  { label: 'Budget',      query: 'Affordable cafe under ₹400' },
];

const RECENTS_KEY = '@cafehop:concierge:recents';
const PREFS_CACHE_KEY = '@cafehop:concierge:prefsCache';

// Small in-memory cache for parsed preferences within a session.
const prefsMemo = new Map();

export default function ConciergeScreen({ navigation }) {
  const [query, setQuery]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [results, setResults]     = useState([]);
  const [prefs, setPrefs]         = useState(null);
  const [recents, setRecents]     = useState([]);
  const [userLoc, setUserLoc]     = useState(null);
  const cafesCacheRef             = useRef({ key: null, cafes: null });

  // Load recent searches on mount.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(RECENTS_KEY);
        if (raw) setRecents(JSON.parse(raw));
      } catch {}
    })();
  }, []);

  // Fetch cafes near the user's location. Reuses the same Google Places
  // endpoint as MapScreen — we deliberately do NOT duplicate MapScreen's
  // state machine; this call is cached for the session by rounded lat/lng.
  const getNearbyCafes = async (loc) => {
    const key = `${loc.latitude.toFixed(3)},${loc.longitude.toFixed(3)}`;
    if (cafesCacheRef.current.key === key && cafesCacheRef.current.cafes) {
      return cafesCacheRef.current.cafes;
    }
    const url =
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
      `?location=${loc.latitude},${loc.longitude}` +
      `&radius=2500&type=cafe&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(data.error_message || data.status);
    }
    const cafes = data.results || [];
    cafesCacheRef.current = { key, cafes };
    return cafes;
  };

  const runQuery = async (text) => {
    const q = (text ?? query).trim();
    if (!q) return;
    Keyboard.dismiss();
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      // 1. Preference extraction (cached).
      let parsed = prefsMemo.get(q);
      if (!parsed) {
        parsed = parsePreferences(q);
        prefsMemo.set(q, parsed);
      }
      setPrefs(parsed);

      // 2. Location.
      // let loc = userLoc;
      // if (!loc) {
      //   const { status } = await Location.requestForegroundPermissionsAsync();
      //   if (status !== 'granted') throw new Error('Location permission denied');
      //   const pos = await Location.getCurrentPositionAsync({});
      //   loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      //   setUserLoc(loc);
      // }

      // 2. TEMP Location (for testing without GPS)
    //   const loc = {
    //   latitude: 21.1458,
    //   longitude: 79.0882,
    // };

    //   // 3. Candidate retrieval — reuse existing Places nearbysearch.
    //   //const cafes = await getNearbyCafes(loc);

    //   // 4. Filter + score + rank.
    //   //const ranked = recommendCafes(cafes, parsed, loc, { topN: 5 });

    //   // TEMPORARY - use mock cafes instead of Google Places
    //   const cafes = mockCafes;

    //   const ranked = recommendCafes(
    //     cafes,
    //     parsed,
    //     loc ?? {
    //     latitude: 21.1458,
    //     longitude: 79.0882,
    //   },
    //   { topN: 5 }
    // );
      // 5. Compose AI explanations (deferred via microtask so the first
      //    frame renders the cards; explanations are cheap here but this
      //    keeps the pattern honest for future async LLM calls).


      // Get user's current location
let loc = userLoc;

if (!loc) {
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== "granted") {
    throw new Error("Location permission denied");
  }

  const pos = await Location.getCurrentPositionAsync({});

  loc = {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
  };

  setUserLoc(loc);
}

// Fetch nearby cafes from Google Places
const cafes = await getNearbyCafes(loc);

// Score and rank cafes
const ranked = recommendCafes(cafes, parsed, loc, {
  topN: 5,
});


      setResults(ranked);
      Promise.resolve().then(() => {
        const withExplain = attachExplanations(ranked, parsed);
        setResults(withExplain);
      });

      // 6. Save to recents.
      const next = [q, ...recents.filter((r) => r !== q)].slice(0, 5);
      setRecents(next);
      AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => {});
    } catch (e) {
      setError(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const onSelectRecommendation = (rec) => {
    navigation.navigate('Map', {
      focusCafe: rec.cafe,
      recommendations: results,
    });
  };

  return (
    <ScrollView
      style={styles.screen}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <View style={styles.header}>
        <Text style={[globalStyles.title, styles.greeting]}>Where to today?</Text>
        <Text style={styles.subtle}>Ask in your own words — I'll find the spot.</Text>
      </View>

      <View style={styles.searchBox}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="e.g. Quiet cafe under ₹400 with wifi"
          placeholderTextColor="#a58b7c"
          style={styles.input}
          onSubmitEditing={() => runQuery()}
          returnKeyType="search"
        />
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => runQuery()}
          disabled={loading}
        >
          <Text style={styles.searchBtnText}>{loading ? '…' : 'Find'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {SUGGESTION_CHIPS.map((c) => (
          <TouchableOpacity
            key={c.label}
            style={styles.chip}
            onPress={() => {
              setQuery(c.query);
              runQuery(c.query);
            }}
          >
            <Text style={styles.chipText}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {recents.length > 0 && !loading && results.length === 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent</Text>
          {recents.map((r) => (
            <TouchableOpacity key={r} onPress={() => { setQuery(r); runQuery(r); }}>
              <Text style={styles.recent}>· {r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {prefs && (
        <Text style={styles.prefsLine}>Understood: {summarizePreferences(prefs) || '—'}</Text>
      )}

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.clayRed} />
          <Text style={styles.subtle}>Finding matches…</Text>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {results.map((rec) => (
        <RecommendationCard key={rec.cafe.place_id} rec={rec} onPress={() => onSelectRecommendation(rec)} />
      ))}
    </ScrollView>
  );
}

function RecommendationCard({ rec, onPress }) {
  const { cafe, matchPercent, distanceKm: d, estimatedPrice, explanation, purposeScores, breakdown } = rec;
  const [expanded, setExpanded] = useState(false);
  const photoUrl = cafe.photos?.[0]?.photo_reference
    ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${cafe.photos[0].photo_reference}&key=${GOOGLE_MAPS_API_KEY}`
    : null;

  // Badges now come pre-computed from the recommendation engine (Phase 2).
  const badges = rec.badges || [];

  // Purpose chips to always surface on the card (per Phase 2 spec).
  const primaryPurposes = useMemo(
    () => [
      { key: 'study',   label: 'Study' },
      { key: 'work',    label: 'Work'  },
      { key: 'date',    label: 'Date'  },
    ],
    [],
  );

  const breakdownRows = useMemo(() => {
    if (!breakdown) return [];
    const labels = {
      purposeFit: 'Purpose',
      budget:     'Budget',
      distance:   'Distance',
      amenities:  'Amenities',
      rating:     'Rating',
      ambience:   'Ambience',
    };
    return Object.entries(breakdown).map(([k, v]) => ({
      key: k,
      label: labels[k] || k,
      value: Math.round((v || 0) * 100),
    }));
  }, [breakdown]);

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.cardImageFallback]}>
          <Text style={styles.cardImageFallbackText}>☕</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={1}>{cafe.name}</Text>
          <View style={styles.matchPill}>
            <Text style={styles.matchPillText}>{matchPercent}% match</Text>
          </View>
        </View>

        <Text style={styles.cardMeta}>
          {cafe.rating ? `★ ${cafe.rating}` : '★ —'}
          {d != null ? `  ·  ${d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`}` : ''}
          {estimatedPrice != null ? `  ·  ~₹${estimatedPrice}` : ''}
        </Text>

        {explanation ? (
          <Text style={styles.cardExplain}>{explanation}</Text>
        ) : (
          <ActivityIndicator size="small" color={colors.clayRed} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
        )}

        {purposeScores && (
          <View style={styles.purposeRow}>
            {primaryPurposes.map((p) => (
              <View key={p.key} style={styles.purposeChip}>
                <Text style={styles.purposeLabel}>{p.label}</Text>
                <Text style={styles.purposeValue}>{purposeScores[p.key]}</Text>
              </View>
            ))}
          </View>
        )}

        {badges.length > 0 && (
          <View style={styles.badgeRow}>
            {badges.map((b) => (
              <View key={b} style={styles.badge}>
                <Text style={styles.badgeText}>{b}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          onPress={(e) => { e.stopPropagation?.(); setExpanded((v) => !v); }}
          style={styles.expandBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.expandBtnText}>
            {expanded ? 'Hide score breakdown ▲' : 'Why this match? ▼'}
          </Text>
        </TouchableOpacity>

        {expanded && (
          <View style={styles.breakdownBox}>
            {breakdownRows.map((row) => (
              <View key={row.key} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{row.label}</Text>
                <View style={styles.breakdownBarTrack}>
                  <View style={[styles.breakdownBarFill, { width: `${row.value}%` }]} />
                </View>
                <Text style={styles.breakdownValue}>{row.value}</Text>
              </View>
            ))}
            {purposeScores && (
              <View style={styles.purposeAllGrid}>
                {Object.entries(purposeScores).map(([k, v]) => (
                  <View key={k} style={styles.purposeAllCell}>
                    <Text style={styles.purposeAllLabel}>{k[0].toUpperCase() + k.slice(1)}</Text>
                    <Text style={styles.purposeAllValue}>{v}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff8f6',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  greeting: {
    textAlign: 'left',
    color: colors.deepBrown,
  },
  subtle: {
    fontFamily: 'Pixelify',
    color: colors.walnut,
    fontSize: 14,
    marginTop: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: colors.clayRed,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.rosyPink,
  },
  input: {
    flex: 1,
    fontFamily: 'Pixelify',
    fontSize: 15,
    color: colors.deepBrown,
    paddingVertical: 10,
  },
  searchBtn: {
    backgroundColor: colors.rosyPink,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginLeft: 6,
  },
  searchBtnText: {
    fontFamily: 'Pixelify',
    color: colors.deepBrown,
    fontSize: 14,
  },
  chipsRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  chip: {
    backgroundColor: '#fbe4e6',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  chipText: {
    fontFamily: 'Pixelify',
    color: colors.clayRed,
    fontSize: 13,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: 'Pixelify',
    color: colors.walnut,
    fontSize: 14,
    marginBottom: 4,
  },
  recent: {
    fontFamily: 'Pixelify',
    color: colors.deepBrown,
    fontSize: 14,
    paddingVertical: 2,
  },
  prefsLine: {
    fontFamily: 'Pixelify',
    fontSize: 12,
    color: colors.walnut,
    marginHorizontal: 16,
    marginTop: 8,
    fontStyle: 'italic',
  },
  loading: {
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  error: {
    fontFamily: 'Pixelify',
    color: colors.clayRed,
    textAlign: 'center',
    margin: 16,
  },

  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: colors.deepBrown,
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardImage: {
    width: 110,
    height: '100%',
    minHeight: 140,
    backgroundColor: colors.cream,
  },
  cardImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImageFallbackText: {
    fontSize: 36,
  },
  cardBody: {
    flex: 1,
    padding: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontFamily: 'Pixelify',
    fontSize: 16,
    color: colors.deepBrown,
    flex: 1,
    marginRight: 8,
  },
  matchPill: {
    backgroundColor: colors.rosyPink,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  matchPillText: {
    fontFamily: 'Pixelify',
    fontSize: 11,
    color: colors.deepBrown,
  },
  cardMeta: {
    fontFamily: 'Pixelify',
    fontSize: 12,
    color: colors.walnut,
    marginTop: 4,
  },
  cardExplain: {
    fontFamily: 'Pixelify',
    fontSize: 13,
    color: colors.deepBrown,
    marginTop: 6,
    lineHeight: 18,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  badge: {
    backgroundColor: colors.cream,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
    marginBottom: 4,
  },
  badgeText: {
    fontFamily: 'Pixelify',
    fontSize: 11,
    color: colors.clayRed,
  },

  purposeRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 6,
  },
  purposeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fbe4e6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
  },
  purposeLabel: {
    fontFamily: 'Pixelify',
    fontSize: 11,
    color: colors.walnut,
    marginRight: 4,
  },
  purposeValue: {
    fontFamily: 'Pixelify',
    fontSize: 12,
    color: colors.clayRed,
  },
  expandBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  expandBtnText: {
    fontFamily: 'Pixelify',
    fontSize: 12,
    color: colors.clayRed,
  },
  breakdownBox: {
    marginTop: 8,
    backgroundColor: '#fff8f6',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.rosyPink,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  breakdownLabel: {
    fontFamily: 'Pixelify',
    fontSize: 11,
    color: colors.walnut,
    width: 72,
  },
  breakdownBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#f1d9dc',
    borderRadius: 3,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  breakdownBarFill: {
    height: '100%',
    backgroundColor: colors.clayRed,
  },
  breakdownValue: {
    fontFamily: 'Pixelify',
    fontSize: 11,
    color: colors.deepBrown,
    width: 28,
    textAlign: 'right',
  },
  purposeAllGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 6,
  },
  purposeAllCell: {
    width: '31%',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginRight: '2%',
    marginBottom: 6,
    alignItems: 'center',
  },
  purposeAllLabel: {
    fontFamily: 'Pixelify',
    fontSize: 10,
    color: colors.walnut,
  },
  purposeAllValue: {
    fontFamily: 'Pixelify',
    fontSize: 14,
    color: colors.clayRed,
  },
});
