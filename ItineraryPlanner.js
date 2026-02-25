import React, { useState, useMemo, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Platform, Dimensions } from 'react-native';

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
        // Fly to the coordinates with a smooth animation and a close zoom level (15)
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

// REMEMBER TO REGENERATE THIS KEY AFTER YOUR HACKATHON
const GEMINI_API_KEY = ''; 

export default function ItineraryPlanner({ destination }) {
  const [days, setDays] = useState('3');
  const [budget, setBudget] = useState('Standard'); 
  const [interests, setInterests] = useState('Food, Culture, Nature');
  
  const [loading, setLoading] = useState(false);
  const [replacingId, setReplacingId] = useState(null); 
  const [planData, setPlanData] = useState(null);

  // NEW: State to track which activity the user just clicked
  const [focusedCoords, setFocusedCoords] = useState(null);

  const generateItinerary = async () => {
    if (!days || !destination) return alert("Please specify days and destination.");
    setLoading(true);

    try {
      const prompt = `
        You are an expert travel planner. User travels to ${destination} for ${days} days.
        Budget: "${budget}". Interests: ${interests}.
        
        Generate a day-by-day itinerary and calculate the "True Cost" (excluding flights).
        Provide exact, real-world data including coordinates (lat/lng), admission fees, and distances.
        STRICT: Every single activity MUST have valid real-world 'lat' and 'lng' coordinates.

        Return EXACTLY a JSON object in this format:
        {
          "summary": "A 2-sentence engaging summary. Include what makes the destination unique and attractive to the visitor.",
          "trueCost": { "accommodationTotal": 120, "foodTotal": 90, "activitiesTotal": 40, "totalEstimate": 250, "currency": "USD" },
          "itinerary": [
            {
              "day": 1,
              "theme": "Culture & Walking",
              "activities": [
                { 
                  "id": "day1-act1",
                  "time": "09:00 AM", 
                  "title": "Wat Chedi Luang", 
                  "lat": 18.7869, "lng": 98.9865,
                  "description": "A 14th-century Buddhist temple.",
                  "admission": "$1.50 (50 THB)",
                  "cost": 2, 
                  "ecoTag": "Cultural Heritage",
                  "distanceToNext": "800m (10 min walk)"
                }
              ]
            }
          ]
        }
      `;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
      });

      if (!response.ok) throw new Error("Failed to generate itinerary.");
      const data = await response.json();
      const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (aiText) {
        setPlanData(JSON.parse(aiText.replace(/```json/gi, '').replace(/```/gi, '').trim()));
        setFocusedCoords(null); // Reset camera on new generation
      }
    } catch (error) { alert("Failed to build itinerary."); } 
    finally { setLoading(false); }
  };

  const replaceActivity = async (dayIndex, actIndex, oldActivity) => {
    setReplacingId(oldActivity.id); 
    try {
      const prompt = `
        User is in ${destination}. They REJECTED: "${oldActivity.title}".
        Interests: ${interests}. Budget: ${budget}.
        
        Suggest ONE replacement activity for ${oldActivity.time}, completely different from the rejected activity.
        STRICT: It must have valid 'lat' and 'lng' coordinates.

        Return EXACTLY ONE JSON object matching this structure:
        {
          "id": "new-${Date.now()}",
          "time": "${oldActivity.time}",
          "title": "New Awesome Activity",
          "lat": 18.7900, "lng": 98.9900,
          "description": "A totally new place they will love. Give details on what makes it unique and attractive to the visitor",
          "admission": "Free",
          "cost": 0,
          "ecoTag": "Local Park",
          "distanceToNext": "Similar distance"
        }
      `;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
      });

      const data = await response.json();
      const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (aiText) {
        const newActivity = JSON.parse(aiText.replace(/```json/gi, '').replace(/```/gi, '').trim());
        setPlanData(prevData => {
          const newData = JSON.parse(JSON.stringify(prevData)); 
          newData.itinerary[dayIndex].activities[actIndex] = newActivity;
          const costDiff = newActivity.cost - oldActivity.cost;
          newData.trueCost.activitiesTotal += costDiff;
          newData.trueCost.totalEstimate += costDiff;
          return newData;
        });
        setFocusedCoords([newActivity.lat, newActivity.lng]); // Fly to the new replacement!
      }
    } catch (error) { alert("Failed to find a replacement."); } 
    finally { setReplacingId(null); }
  };

  // Extract coordinates for Pins and calculate the dotted lines for the routes
  const mapData = useMemo(() => {
    if (!planData || Platform.OS !== 'web') return { markers: [], center: [0, 0], dayRoutes: [] };
    
    let markers = [];
    let dayRoutes = []; // This will hold arrays of coordinates to draw lines between

    planData.itinerary.forEach((day, index) => {
      let routeCoords = [];
      day.activities.forEach(act => {
        if (act.lat && act.lng) {
          markers.push({...act, dayNum: day.day});
          routeCoords.push([act.lat, act.lng]);
        }
      });
      if (routeCoords.length > 1) {
        // Different colors for different days so lines don't get confusing
        const colors = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444'];
        dayRoutes.push({ coords: routeCoords, color: colors[index % colors.length] });
      }
    });

    const center = markers.length > 0 ? [markers[0].lat, markers[0].lng] : [0, 0];
    return { markers, center, dayRoutes };
  }, [planData]);

  // --- RENDERING ---

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2E8B57" />
        <Text style={styles.loadingText}>Synthesizing spatial data & routing...</Text>
      </View>
    );
  }

  if (planData) {
    // Determine layout dynamically based on screen width
    const screenWidth = Dimensions.get('window').width;
    const isDesktop = screenWidth > 800;

    return (
      <View style={[styles.mainLayout, isDesktop ? styles.rowLayout : styles.colLayout]}>
        
        {/* LEFT PANE: The Itinerary List */}
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
                  // NEW: Wrap the row in a TouchableOpacity so clicking it flies the map!
                  <TouchableOpacity 
                    key={act.id} 
                    style={styles.activityRow}
                    activeOpacity={0.7}
                    onPress={() => setFocusedCoords([act.lat, act.lng])}
                  >
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

        {/* RIGHT PANE: The Interactive Map */}
        {Platform.OS === 'web' && mapData.markers.length > 0 && (
          <View style={isDesktop ? styles.rightPane : styles.mobileMapContainer}>
            <MapContainer center={mapData.center} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              
              {/* This invisible component handles the camera animations */}
              <MapController centerCoords={focusedCoords || mapData.center} />

              {/* Draw dotted lines to show the routes for the day */}
              {mapData.dayRoutes.map((route, idx) => (
                <Polyline 
                  key={idx} 
                  positions={route.coords} 
                  pathOptions={{ color: route.color, weight: 3, dashArray: '5, 10' }} 
                />
              ))}

              {/* Drop the Pins */}
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
      <Text style={styles.header}>Plan Your Stay</Text>
      <Text style={styles.subHeader}>Generate a personalized itinerary for {destination || "your destination"}.</Text>

      <View style={styles.inputGroup}><Text style={styles.label}>How many days?</Text><TextInput style={styles.input} value={days} onChangeText={setDays} keyboardType="numeric" /></View>
      <View style={styles.inputGroup}><Text style={styles.label}>Budget Level:</Text>
        <View style={styles.pillContainer}>
          {['Backpacker', 'Standard', 'Luxury'].map(b => (
            <TouchableOpacity key={b} style={budget === b ? styles.pillActive : styles.pill} onPress={() => setBudget(b)}><Text style={budget === b ? styles.pillTextActive : styles.pillText}>{b}</Text></TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={styles.inputGroup}><Text style={styles.label}>Interests (comma separated):</Text><TextInput style={styles.input} value={interests} onChangeText={setInterests} placeholder="e.g., Food, Museums, Hiking" /></View>
      <TouchableOpacity style={styles.primaryButton} onPress={generateItinerary}><Text style={styles.buttonText}>Generate Itinerary & Map</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Main Layout Styles
  mainLayout: { flex: 1, backgroundColor: '#F5F7FA', height: Platform.OS === 'web' ? '100vh' : '100%' },
  rowLayout: { flexDirection: 'row' },
  colLayout: { flexDirection: 'column' },
  
  // Split Screen Panes
  leftPane: { flex: 1, borderRightWidth: 1, borderColor: '#DDD', backgroundColor: '#F5F7FA' },
  rightPane: { flex: 1, backgroundColor: '#E0E0E0' },
  fullPane: { flex: 1 },
  mobileMapContainer: { width: '100%', height: 350, backgroundColor: '#E0E0E0', borderBottomWidth: 1, borderColor: '#DDD' },
  scrollContent: { padding: 20, paddingBottom: 50 },

  // Center/Form Styles
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F7FA', padding: 20 },
  header: { fontSize: 28, fontWeight: 'bold', color: '#2E8B57', marginBottom: 5, textAlign: 'center' },
  subHeader: { fontSize: 16, color: '#666', marginBottom: 20, textAlign: 'center', maxWidth: 400 },
  inputGroup: { width: '100%', maxWidth: 400, marginBottom: 15 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 8 },
  input: { backgroundColor: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#DDD', fontSize: 16 },
  pillContainer: { flexDirection: 'row', gap: 10 },
  pill: { flex: 1, paddingVertical: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDD', borderRadius: 8, alignItems: 'center' },
  pillActive: { flex: 1, paddingVertical: 10, backgroundColor: '#2E8B57', borderWidth: 1, borderColor: '#2E8B57', borderRadius: 8, alignItems: 'center' },
  pillText: { color: '#555', fontWeight: 'bold' },
  pillTextActive: { color: '#FFF', fontWeight: 'bold' },
  primaryButton: { backgroundColor: '#2E8B57', padding: 15, borderRadius: 8, width: '100%', maxWidth: 400, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  loadingText: { marginTop: 20, fontSize: 16, color: '#555', fontStyle: 'italic', textAlign: 'center' },
  
  // Itinerary List Styles
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