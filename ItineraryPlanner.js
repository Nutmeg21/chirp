import React, { useState, useMemo, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, ScrollView, Platform, Dimensions } from 'react-native';

let MapContainer, TileLayer, Marker, Popup, Polyline, useMap, L;
let MapController = () => null; // Fallback for non-web

if (Platform.OS === 'web') {
  const ReactLeaflet = require('react-leaflet');
  MapContainer = ReactLeaflet.MapContainer;
  TileLayer = ReactLeaflet.TileLayer;
  Marker = ReactLeaflet.Marker;
  Popup = ReactLeaflet.Popup;
  Polyline = ReactLeaflet.Polyline;
  useMap = ReactLeaflet.useMap;
  L = require('leaflet');
  
  // CDN CSS Injection
  if (typeof document !== 'undefined' && !document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }

  // The "Click to Fly" Camera Controller
  MapController = ({ centerCoords }) => {
    const map = useMap();
    useEffect(() => {
      if (centerCoords && centerCoords.length === 2) {
        map.flyTo(centerCoords, 15, { animate: true, duration: 1.5 });
      }
    }, [centerCoords, map]);
    return null;
  };
}

const customIcon = Platform.OS === 'web' ? new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
}) : null;

const GEMINI_API_KEY = 'AIzaSyARaC8O6dXJ9GB951HSkiH-OZZGrBkLskc'; 

export default function ItineraryPlanner({ destination, preferences, onBack }) {
  const [loading, setLoading] = useState(true); 
  const [replacingId, setReplacingId] = useState(null); 
  const [planData, setPlanData] = useState(null);
  const [focusedCoords, setFocusedCoords] = useState(null);

  // 🛑 THE HACKATHON BYPASS SWITCH 🛑
  const USE_MOCK_DATA = false;
  

 // Fix 1: Add dependencies to the useEffect
  useEffect(() => {
    if (preferences) {
      generateItinerary();
    }
  }, [preferences, destination]); // <--- Added these here

  const generateItinerary = async () => {
    setLoading(true);

    if (USE_MOCK_DATA) {
      // ... (keep your existing mock data block here) ...
    }

    // --- REAL API LOGIC ---
    try {
      // Fix 2: Added optional chaining (?.) and fallbacks to prevent crashes
      const prompt = `
        You are an expert travel planner. User travels to ${destination || 'their destination'} for ${preferences?.days || 3} days.
        Companions: ${preferences?.companions || 'solo'}. Budget: "${preferences?.budget || 'moderate'}". Pace: "${preferences?.pace || 'balanced'}".
        Interests: ${(preferences?.interests || []).join(', ') || 'local highlights'}.
        Generate a day-by-day itinerary. STRICT: Every activity MUST have valid real-world 'lat' and 'lng' coordinates.

        You MUST return EXACTLY a JSON object that matches this exact schema. Do not return any other text or markdown formatting outside the JSON:
        {
          "summary": "A 1-sentence personalized summary of the trip",
          "trueCost": {
            "accommodationTotal": 0,
            "foodTotal": 0,
            "activitiesTotal": 0,
            "totalEstimate": 0,
            "currency": "MYR"
          },
          "itinerary": [
            {
              "day": 1,
              "theme": "Theme of the day",
              "activities": [
                {
                  "id": "day1-act1",
                  "time": "09:00 AM",
                  "title": "Name of Place",
                  "lat": 2.1923,
                  "lng": 102.2500,
                  "description": "Short engaging description.",
                  "admission": "Price string (e.g. 'RM 10' or 'Free')",
                  "cost": 10,
                  "ecoTag": "Nature/Heritage/etc",
                  "distanceToNext": "e.g., 600m (8 min walk)"
                }
              ]
            }
          ]
        }
      `;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            contents: [{ parts: [{ text: prompt }] }], 
            generationConfig: { responseMimeType: "application/json" } 
        })
      });

      const data = await response.json();
      if (!response.ok || !data.candidates) throw new Error(data.error?.message || "Quota Exceeded.");

      const aiText = data.candidates[0].content.parts[0].text;
      setPlanData(JSON.parse(aiText.replace(/```json/gi, '').replace(/```/gi, '').trim()));
      setFocusedCoords(null); 
    } catch (error) { 
        console.error("FULL API ERROR:", error);
        alert(`Google API Error: ${error.message}`); 
        if(onBack) onBack(); 
    } finally { 
        setLoading(false); 
    }
  };

  const replaceActivity = async (dayIndex, actIndex, oldActivity) => {
    setReplacingId(oldActivity.id); 

    if (USE_MOCK_DATA) {
      setTimeout(() => {
        const newActivity = {
          id: `new-${Date.now()}`, time: oldActivity.time, title: "Melaka River Cruise",
          lat: 2.1934, lng: 102.2486, description: "A peaceful eco-cruise down the historic river, passing painted murals.",
          admission: "RM 30", cost: 30, ecoTag: "Low-Emission Transport", distanceToNext: "Similar distance"
        };
        setPlanData(prev => {
          const newData = JSON.parse(JSON.stringify(prev)); 
          newData.itinerary[dayIndex].activities[actIndex] = newActivity;
          return newData;
        });
        setFocusedCoords([newActivity.lat, newActivity.lng]);
        setReplacingId(null);
      }, 1000);
      return;
    }

    try {
      const prompt = `User REJECTED: "${oldActivity.title}". Suggest ONE replacement. Return JSON only with lat/lng.`;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
      });

      const data = await response.json();
      if (!response.ok || !data.candidates) throw new Error("API Error");

      const aiText = data.candidates[0].content.parts[0].text;
      const newActivity = JSON.parse(aiText.replace(/```json/gi, '').replace(/```/gi, '').trim());
      setPlanData(prevData => {
        const newData = JSON.parse(JSON.stringify(prevData)); 
        newData.itinerary[dayIndex].activities[actIndex] = newActivity;
        return newData;
      });
      setFocusedCoords([newActivity.lat, newActivity.lng]); 
    } catch (error) { alert(`Failed to replace activity.`); } 
    finally { setReplacingId(null); }
  };

  const mapData = useMemo(() => {
    if (!planData || Platform.OS !== 'web') return { markers: [], center: [0, 0], dayRoutes: [] };
    let markers = []; let dayRoutes = []; 
    planData.itinerary.forEach((day, index) => {
      let routeCoords = [];
      day.activities.forEach(act => {
        if (act.lat && act.lng) {
          markers.push({...act, dayNum: day.day});
          routeCoords.push([act.lat, act.lng]);
        }
      });
      if (routeCoords.length > 1) {
        const colors = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444'];
        dayRoutes.push({ coords: routeCoords, color: colors[index % colors.length] });
      }
    });
    const center = markers.length > 0 ? [markers[0].lat, markers[0].lng] : [0, 0];
    return { markers, center, dayRoutes };
  }, [planData]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2E8B57" />
        <Text style={styles.loadingText}>Synthesizing spatial data & routing for your {preferences?.pace || 'trip'}...</Text>
      </View>
    );
  }

  if (planData) {
    const screenWidth = Dimensions.get('window').width;
    const isDesktop = screenWidth > 800;

    return (
      <View style={[styles.mainLayout, isDesktop ? styles.rowLayout : styles.colLayout]}>
        
        {/* LEFT PANE */}
        <View style={isDesktop ? styles.leftPane : styles.fullPane}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.header}>{destination} Itinerary</Text>
            <Text style={styles.subHeader}>{planData.summary}</Text>

            <View style={styles.budgetBox}>
              <Text style={styles.budgetTitle}>The "True Cost" Estimate</Text>
              <View style={styles.budgetRow}><Text style={styles.budgetText}>🏨 Accommodation:</Text><Text style={styles.budgetValue}>${planData.trueCost.accommodationTotal}</Text></View>
              <View style={styles.budgetRow}><Text style={styles.budgetText}>🍜 Food & Dining:</Text><Text style={styles.budgetValue}>${planData.trueCost.foodTotal}</Text></View>
              <View style={styles.budgetRow}><Text style={styles.budgetText}>🎟️ Activities:</Text><Text style={styles.budgetValue}>${planData.trueCost.activitiesTotal}</Text></View>
              <View style={[styles.budgetRow, { borderTopWidth: 1, borderColor: '#A5D6A7', marginTop: 10, paddingTop: 10 }]}>
                <Text style={[styles.budgetText, { fontWeight: 'bold' }]}>Total Ground Cost:</Text>
                <Text style={[styles.budgetValue, { fontWeight: 'bold', fontSize: 20 }]}>${planData.trueCost.totalEstimate} {planData.trueCost.currency}</Text>
              </View>
            </View>

            {planData.itinerary.map((day, dayIdx) => (
              <View key={dayIdx} style={styles.card}>
                <Text style={styles.dayHeader}>Day {day.day}: {day.theme}</Text>
                
                {day.activities.map((act, actIdx) => (
                  <TouchableOpacity key={act.id} style={styles.activityRow} activeOpacity={0.7} onPress={() => setFocusedCoords([act.lat, act.lng])}>
                    <View style={styles.timeCol}>
                      <Text style={styles.timeText}>{act.time}</Text>
                      <Text style={styles.distanceText}>🚶 {act.distanceToNext}</Text>
                    </View>
                    <View style={styles.detailsCol}>
                      <Text style={styles.activityTitle}>{act.title}</Text>
                      <Text style={styles.descriptionText}>{act.description}</Text>
                      <View style={styles.tagRow}>
                        {act.ecoTag && <Text style={styles.ecoTag}>🍃 {act.ecoTag}</Text>}
                        <Text style={styles.costBadge}>Cost: ${act.cost} ({act.admission})</Text>
                      </View>
                      <TouchableOpacity style={styles.replaceBtn} onPress={() => replaceActivity(dayIdx, actIdx, act)} disabled={replacingId === act.id}>
                        {replacingId === act.id ? <ActivityIndicator size="small" color="#D97706" /> : <Text style={styles.replaceBtnText}>🔄 Replace Activity</Text>}
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>

        {/* RIGHT PANE: Map */}
        {Platform.OS === 'web' && mapData.markers.length > 0 && (
          <View style={isDesktop ? styles.rightPane : styles.mobileMapContainer}>
            <MapContainer center={mapData.center} zoom={14} style={{ height: '100%', width: '100%' }}>
              <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapController centerCoords={focusedCoords || mapData.center} />
              {mapData.dayRoutes.map((route, idx) => (
                <Polyline key={idx} positions={route.coords} pathOptions={{ color: route.color, weight: 3, dashArray: '5, 10' }} />
              ))}
              {mapData.markers.map((marker, index) => (
                <Marker key={marker.id || index} position={[marker.lat, marker.lng]} icon={customIcon}>
                  <Popup>
                    <b style={{fontSize: '16px', color: '#2E8B57'}}>{marker.title}</b><br/>
                    Day {marker.dayNum} - {marker.time}<br/>
                    <i>{marker.ecoTag}</i>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.centerContainer}>
        <Text style={styles.header}>Something went wrong</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={onBack}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  mainLayout: { flex: 1, backgroundColor: '#F5F7FA', height: Platform.OS === 'web' ? '100vh' : '100%' },
  rowLayout: { flexDirection: 'row' },
  colLayout: { flexDirection: 'column' },
  leftPane: { flex: 1, borderRightWidth: 1, borderColor: '#DDD', backgroundColor: '#F5F7FA' },
  rightPane: { flex: 1, backgroundColor: '#E0E0E0' },
  fullPane: { flex: 1 },
  mobileMapContainer: { width: '100%', height: 350, backgroundColor: '#E0E0E0', borderBottomWidth: 1, borderColor: '#DDD' },
  scrollContent: { padding: 20, paddingBottom: 50 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F7FA', padding: 20 },
  header: { fontSize: 28, fontWeight: 'bold', color: '#2E8B57', marginBottom: 5, textAlign: 'center' },
  subHeader: { fontSize: 16, color: '#666', marginBottom: 20, textAlign: 'center', maxWidth: 400 },
  primaryButton: { backgroundColor: '#2E8B57', padding: 15, borderRadius: 8, width: '100%', maxWidth: 400, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  loadingText: { marginTop: 20, fontSize: 16, color: '#555', fontStyle: 'italic', textAlign: 'center' },
  budgetBox: { backgroundColor: '#E8F5E9', padding: 20, borderRadius: 12, width: '100%', marginBottom: 20, borderWidth: 1, borderColor: '#A5D6A7' },
  budgetTitle: { fontSize: 20, fontWeight: 'bold', color: '#2E8B57', textAlign: 'center', marginBottom: 15 },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  budgetText: { fontSize: 16, color: '#333' },
  budgetValue: { fontSize: 16, fontWeight: 'bold', color: '#2E8B57' },
  card: { backgroundColor: '#FFF', padding: 20, borderRadius: 12, width: '100%', marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  dayHeader: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#EEE', paddingBottom: 10 },
  activityRow: { flexDirection: 'row', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', paddingBottom: 15 },
  timeCol: { width: 90, borderRightWidth: 2, borderRightColor: '#2E8B57', marginRight: 15, paddingRight: 10, alignItems: 'flex-end' },
  timeText: { fontSize: 14, fontWeight: 'bold', color: '#2E8B57' },
  distanceText: { fontSize: 12, color: '#888', marginTop: 5, textAlign: 'right' },
  detailsCol: { flex: 1 },
  activityTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  descriptionText: { fontSize: 14, color: '#555', marginBottom: 8, lineHeight: 20 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  ecoTag: { fontSize: 12, color: '#10B981', fontWeight: 'bold', backgroundColor: '#F0FDF4', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#A7F3D0' },
  costBadge: { fontSize: 12, color: '#666', backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  replaceBtn: { backgroundColor: '#FEF3C7', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#FDE68A', zIndex: 10 },
  replaceBtnText: { color: '#D97706', fontSize: 12, fontWeight: 'bold' }
});