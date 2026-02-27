import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, ActivityIndicator, Platform, Linking, Modal, Switch, createElement, useWindowDimensions, PanResponder } from 'react-native';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import ItineraryWizard from './ItineraryWizard';

// --- LEAFLET MARKER FIX FOR REACT NATIVE WEB ---
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// --- HELPER: AUTO-PAN MAP ---
function MapUpdater({ center, zoom, bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (center) {
      map.flyTo(center, zoom);
    }
    // Forces the map to recalculate its tiles when the user drags the resizer!
    setTimeout(() => { map.invalidateSize(); }, 300);
  }, [center, zoom, bounds, map]);
  return null;
}

// --- MATH HELPERS ---
const formatTime = (mins) => {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const formatFlightTime = (isoString) => {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + 
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
};

// --- 1. REUSABLE UI COMPONENTS ---
const LiveCityAutocomplete = ({ placeholder, onLocationSelected, emoji, poi = false, initialQuery = '' }) => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const isSelecting = useRef(initialQuery !== ''); 

  useEffect(() => { 
    if (initialQuery) {
      setTimeout(() => { isSelecting.current = false; }, 1000); 
    }
  }, [initialQuery]);

  useEffect(() => {
    if (query.length > 2 && !isSelecting.current) {
      const delay = setTimeout(async () => {
        try {
          const url = poi 
            ? `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=5` 
            : `https://nominatim.openstreetmap.org/search?q=${query}&format=json&featuretype=city&limit=4`;
          const res = await fetch(url);
          const data = await res.json();
          setResults(data || []);
          setShowDropdown(true);
        } catch (e) {
          console.error("Autocomplete Error: ", e);
        }
      }, 500);
      return () => clearTimeout(delay);
    }
  }, [query, poi]);

  const handleSelect = (place) => {
    isSelecting.current = true;
    const displayName = poi ? place.display_name : (place.name || place.display_name.split(',')[0]);
    setQuery(displayName);
    onLocationSelected({ 
      name: displayName, 
      lat: parseFloat(place.lat), 
      lon: parseFloat(place.lon) 
    });
    setShowDropdown(false);
    setTimeout(() => { isSelecting.current = false; }, 500);
  };

  return (
    <View style={{ position: 'relative', zIndex: showDropdown ? 1000 : 1, marginBottom: 15 }}>
      <View style={styles.inputBox}>
        {emoji && <Text style={{ marginRight: 10, fontSize: 18 }}>{emoji}</Text>}
        <TextInput
          style={styles.input} 
          placeholder={placeholder} 
          placeholderTextColor="#888" 
          value={query}
          onChangeText={(text) => { 
            isSelecting.current = false; 
            setQuery(text); 
          }}
          onFocus={() => { 
            if (results.length > 0) setShowDropdown(true); 
          }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        />
      </View>
      {showDropdown && results.length > 0 && (
        <ScrollView style={styles.dropdown} keyboardShouldPersistTaps="handled">
          {results.map((place, index) => (
            <TouchableOpacity key={index} style={styles.dropdownItem} onPress={() => handleSelect(place)}>
              <Text style={{ color: '#333', fontWeight: 'bold' }}>{place.display_name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const WebDatePicker = ({ date, setDate, placeholder }) => {
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.inputBox, { flex: 1, padding: 0, overflow: 'hidden', height: 54, marginBottom: 0 }]}>
        <View style={{ paddingLeft: 15, justifyContent: 'center' }}>
          <Text style={{ fontSize: 18 }}>📅</Text>
        </View>
        {createElement('input', {
          type: 'date', 
          value: date, 
          onChange: (e) => setDate(e.target.value),
          style: { 
            flex: 1, 
            height: '100%', 
            padding: '10px 15px', 
            border: 'none', 
            backgroundColor: 'transparent', 
            color: date ? '#1E293B' : '#888', 
            fontSize: '16px', 
            outline: 'none', 
            cursor: 'pointer', 
            fontFamily: 'inherit' 
          }
        })}
      </View>
    );
  }
  return (
    <View style={[styles.inputBox, { flex: 1, marginBottom: 0 }]}>
      <Text style={{ marginRight: 10, fontSize: 18 }}>📅</Text>
      <TextInput 
        style={[styles.input, { cursor: 'pointer' }]} 
        placeholder={placeholder} 
        value={date} 
        onChangeText={setDate} 
      />
    </View>
  );
};

export default function App() {
  const { width } = useWindowDimensions();
  const isMobile = width < 800;

  // 🚨 NEW: DRAGGABLE RESIZER STATE
  // Starts at 45% width to give UI more room immediately
  const [leftWidthPct, setLeftWidthPct] = useState(45);
  const windowWidthRef = useRef(width);
  useEffect(() => { windowWidthRef.current = width; }, [width]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        // Calculate where the mouse is dragged as a percentage of the screen
        let newPct = (gestureState.moveX / windowWidthRef.current) * 100;
        
        // Limits: Don't let the user squash the left panel past 30% or the map past 70%
        if (newPct < 30) newPct = 30;
        if (newPct > 70) newPct = 70;
        
        setLeftWidthPct(newPct);
      },
    })
  ).current;

  // APP STATE
  const [appMode, setAppMode] = useState('COVER');
  const [activeTab, setActiveTab] = useState('FLIGHTS');
  
  const [globalOrigin, setGlobalOrigin] = useState(null);
  const [globalDest, setGlobalDest] = useState(null);

  // MAP STATE
  const [mapCenter, setMapCenter] = useState([3.195, 101.747]); 
  const [mapZoom, setMapZoom] = useState(6);
  const [mapBounds, setMapBounds] = useState(null);
  const [markers, setMarkers] = useState([]); 
  const [routes, setRoutes] = useState([]); 

  const [hiddenDays, setHiddenDays] = useState({});

  // 🚨 YOUR API KEYS (PASTE THEM HERE) 🚨
  const GEMINI_API_KEY = '';
  const AMADEUS_ID = '';
  const AMADEUS_SECRET = '';
  const RAPID_API_KEY = '';

  const [flightOrigin, setFlightOrigin] = useState(null);
  const [flightDest, setFlightDest] = useState(null);
  const [localStart, setLocalStart] = useState(null);
  const [localEnd, setLocalEnd] = useState(null);
  const [plannerCity, setPlannerCity] = useState(null);
  const [stayCity, setStayCity] = useState(null);

  const initializeDashboard = () => {
    if (!globalOrigin || !globalDest) return alert("Please select your starting point and destination.");
    
    setFlightOrigin(globalOrigin); 
    setFlightDest(globalDest);
    setLocalStart(globalOrigin); 
    setLocalEnd(globalDest);
    setPlannerCity(globalDest); 
    setStayCity(globalDest);
    
    setMarkers([
      { lat: globalOrigin.lat, lng: globalOrigin.lon, title: `Origin: ${globalOrigin.name}` }, 
      { lat: globalDest.lat, lng: globalDest.lon, title: `Dest: ${globalDest.name}` }
    ]);
    setMapBounds([[globalOrigin.lat, globalOrigin.lon], [globalDest.lat, globalDest.lon]]);
    
    setAppMode('DASHBOARD');
  };

  const drawMultiDayRoutes = async (daysData) => {
    const newRoutes = [];
    await Promise.all(daysData.map(async (day) => {
      if (day.activities.length < 2) return; 
      try {
        const coordsString = day.activities.map(a => `${a.lng},${a.lat}`).join(';');
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`);
        const data = await res.json();
        if (data.routes && data.routes[0]) {
          const leafletCoords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
          newRoutes.push({ 
            day: day.day, 
            positions: leafletCoords, 
            color: day.color || '#2E8B57' 
          });
        }
      } catch (e) {
        console.error("OSRM Route Error:", e);
      }
    }));
    setRoutes(newRoutes);
  };

  const updateMapMarkersFromItinerary = (itinData) => {
    const allMapPoints = [];
    itinData.forEach(day => { 
      day.activities.forEach(act => { 
        allMapPoints.push({ 
          day: day.day, 
          lat: act.lat, 
          lng: act.lng, 
          title: `Day ${day.day}: ${act.name}`, 
          desc: act.desc 
        }); 
      }); 
    });
    setMarkers(allMapPoints);
    drawMultiDayRoutes(itinData);
  }

  const toggleDayVisibility = (dayNum) => {
    setHiddenDays(prev => ({...prev, [dayNum]: !prev[dayNum]}));
  };

  // ==========================================
  // TAB 1: FLIGHTS LOGIC 
  // ==========================================
  const [flightDate, setFlightDate] = useState('');
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [returnDate, setReturnDate] = useState('');
  const [flights, setFlights] = useState([]);
  const [isFlightLoading, setIsFlightLoading] = useState(false);

  const handleFlightSearch = async () => {
    if (!flightOrigin || !flightDest || !flightDate) {
      return alert("Fill origin, destination, and departure date.");
    }
    if (isRoundTrip && !returnDate) {
      return alert("Please select a return date.");
    }

    setIsFlightLoading(true); 
    setFlights([]); 
    setRoutes([]);
    
    setMarkers([
      { lat: flightOrigin.lat, lng: flightOrigin.lon, title: `Origin: ${flightOrigin.name}` }, 
      { lat: flightDest.lat, lng: flightDest.lon, title: `Dest: ${flightDest.name}` }
    ]);
    setMapBounds([[flightOrigin.lat, flightOrigin.lon], [flightDest.lat, flightDest.lon]]);

    try {
      const prompt = `Return ONLY a JSON object with 3-letter IATA codes for nearest international airports to: Origin: ${flightOrigin.name}, Dest: ${flightDest.name}. Format: {"origin": "CODE", "destination": "CODE"}`;
      const resIATA = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) 
      });
      const dataIATA = await resIATA.json();
      const codes = JSON.parse(dataIATA.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/gi, '').trim());

      const CORS_PROXY = "https://corsproxy.io/?";
      const authUrl = CORS_PROXY + encodeURIComponent('https://test.api.amadeus.com/v1/security/oauth2/token');
      const authRes = await fetch(authUrl, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, 
        body: `grant_type=client_credentials&client_id=${AMADEUS_ID}&client_secret=${AMADEUS_SECRET}` 
      });
      const authData = await authRes.json();
      
      let amadeusBaseUrl = `https://test.api.amadeus.com/v2/shopping/flight-offers?originLocationCode=${codes.origin}&destinationLocationCode=${codes.destination}&departureDate=${flightDate}&adults=1&max=5`;
      if (isRoundTrip) {
        amadeusBaseUrl += `&returnDate=${returnDate}`;
      }
      const searchUrl = CORS_PROXY + encodeURIComponent(amadeusBaseUrl);

      const flightRes = await fetch(searchUrl, { 
        headers: { 'Authorization': `Bearer ${authData.access_token}` } 
      });
      const flightData = await flightRes.json();
      
      if (!flightData.data || flightData.data.length === 0) {
        return alert("No flights found for this route and date.");
      }
      
      const parsed = flightData.data.map(offer => {
        const segments = offer.itineraries[0].segments;
        const firstSeg = segments[0];
        const lastSeg = segments[segments.length - 1];
        
        return {
          id: offer.id, 
          airline: `Carrier ${firstSeg.carrierCode}`, 
          price: parseFloat(offer.price.total), 
          duration: offer.itineraries[0].duration.replace('PT', '').toLowerCase(),
          depTime: formatFlightTime(firstSeg.departure.at), 
          arrTime: formatFlightTime(lastSeg.arrival.at),
          depAirport: firstSeg.departure.iataCode, 
          arrAirport: lastSeg.arrival.iataCode, 
          stops: segments.length - 1,
          link: `https://www.skyscanner.net/transport/flights/${codes.origin}/${codes.destination}/${flightDate.replace(/-/g, '').substring(2)}`
        };
      }).sort((a, b) => a.price - b.price);
      
      setFlights(parsed);
    } catch (e) { 
      console.error(e);
      alert("Flight search failed. Check console for details."); 
    } finally { 
      setIsFlightLoading(false); 
    }
  };

  // ==========================================
  // TAB 2: TRAVEL TRANSPORT LOGIC
  // ==========================================
  const [transitOptions, setTransitOptions] = useState([]);
  const [isTransitLoading, setIsTransitLoading] = useState(false);
  const [transitMeta, setTransitMeta] = useState({ temp: 'N/A', tMult: 1, wMult: 1 });

  const fetchLocalTransport = async () => {
    if (!localStart?.lat || !localEnd?.lat) {
      return alert("Please select your start and end points from the dropdown.");
    }
    
    setIsTransitLoading(true); 
    setTransitOptions([]); 
    setRoutes([]);
    
    try {
      setMarkers([
        { lat: localStart.lat, lng: localStart.lon, title: 'Start' }, 
        { lat: localEnd.lat, lng: localEnd.lon, title: 'End' }
      ]);
      setMapBounds([[localStart.lat, localStart.lon], [localEnd.lat, localEnd.lon]]);
      
      try {
        const resRoute = await fetch(`https://router.project-osrm.org/route/v1/driving/${localStart.lon},${localStart.lat};${localEnd.lon},${localEnd.lat}?overview=full&geometries=geojson`);
        if (resRoute.ok) {
          const routeData = await resRoute.json();
          if (routeData.routes && routeData.routes[0]) {
            setRoutes([{ 
              positions: routeData.routes[0].geometry.coordinates.map(c => [c[1], c[0]]), 
              color: '#FF2079' 
            }]);
          }
        }
      } catch (e) {
        console.warn("OSRM Line skipped due to distance.");
      }
      
      const dist = calculateDistance(localStart.lat, localStart.lon, localEnd.lat, localEnd.lon);
      
      let temp = "N/A", wMult = 1.0;
      try {
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${localEnd.lat}&longitude=${localEnd.lon}&current_weather=true`);
        const weatherData = await weatherRes.json();
        temp = weatherData.current_weather.temperature;
        wMult = weatherData.current_weather.weathercode >= 51 ? 1.6 : 1.0;
      } catch (e) {}
      
      const tMult = dist < 20 ? 1.25 : 1.05;
      setTransitMeta({ temp, tMult, wMult });
      
      const endName = localEnd.name || "";
      let cfg;
      
      if (endName.includes("Singapore")) {
        cfg = { cur: "SGD", rides: [{n: "Grab SG", b: 6, k: 1.2, u: "https://www.grab.com/sg/", s: 1}, {n: "CDG Zig", b: 5.5, k: 1.3, u: "https://www.cdgtaxi.com.sg/", s: 1}] };
      } else if (endName.includes("Malaysia") || endName.includes("Malacca")) {
        cfg = { cur: "MYR", rides: [{n: "Grab MY", b: 5, k: 1.1, u: "https://www.grab.com/my/", s: 1}, {n: "AirAsia Ride", b: 4, k: 0.9, u: "https://www.airasia.com/ride/", s: 2}] };
      } else {
        cfg = { cur: "USD", rides: [{n: "Uber", b: 8, k: 2.5, u: "https://www.uber.com/", s: 1}, {n: "Lyft", b: 7, k: 2.8, u: "https://www.lyft.com/", s: 1}] };
      }
      
      let options = [];
      cfg.rides.forEach(r => {
        const cost = (r.b + (dist * r.k)) * tMult * wMult;
        const timeM = Math.round(dist * 2.2 * tMult);
        options.push({ 
          name: r.n, 
          cost, 
          time: timeM, 
          type: "ride", 
          url: r.u, 
          score: (timeM * 0.5) + (cost * 0.3) + (r.s * 10), 
          cur: cfg.cur 
        });
      });
      
      options.push({ name: "Walking", cost: 0.0, time: Math.round(dist * 12.5), type: "walk", score: 999, cur: cfg.cur });
      options.push({ name: "Public Transit", cost: 2.0 + (dist * 0.15), time: Math.round(dist * 4.0) + 10, type: "transit", score: 50, cur: cfg.cur });
      
      const minTime = Math.min(...options.map(o => o.time));
      const bestScore = Math.min(...options.filter(o => o.type !== 'walk').map(o => o.score));
      
      options.forEach(o => { 
        o.fastest = o.time === minTime; 
        o.recommended = o.score === bestScore && o.type !== 'walk'; 
      });
      
      setTransitOptions(options);
    } catch (e) { 
      alert("Routing error."); 
    } finally { 
      setIsTransitLoading(false); 
    }
  };

  const handleTransportClick = (opt) => {
    if (opt.type === 'ride') {
      Linking.openURL(opt.url); 
    } else {
      const travelMode = opt.type === 'walk' ? 'walking' : 'transit';
      const url = `https://www.google.com/maps/dir/?api=1&origin=${localStart.lat},${localStart.lon}&destination=${localEnd.lat},${localEnd.lon}&travelmode=${travelMode}`;
      Linking.openURL(url);
    }
  };

  // ==========================================
  // TAB 3: PLANNER LOGIC
  // ==========================================
  const [itinerary, setItinerary] = useState(null);
  const [isPlannerLoading, setIsPlannerLoading] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const handleWizardComplete = async (wizardPreferences) => {
    setShowWizard(false); 
    setIsPlannerLoading(true); 
    setItinerary(null); 
    setRoutes([]); 
    setMarkers([]); 
    setHiddenDays({}); 
    
    const interestsStr = wizardPreferences.interests.length > 0 ? wizardPreferences.interests.join(', ') : 'general sightseeing';
    
    const prompt = `Act as a local travel expert. Create a ${wizardPreferences.days}-day itinerary for a ${wizardPreferences.companions} trip to ${plannerCity.name}. 
    Budget: ${wizardPreferences.budget}. 
    Pace: ${wizardPreferences.pace}. 
    Interests: ${interestsStr}.
    
    Return ONLY a raw JSON array grouped by day. Format exactly like this:
    [
      { 
        "day": 1, 
        "theme": "Arrival", 
        "color": "#FF2079", 
        "activities": [ 
          { "time": "09:00", "name": "Exact Place Name", "desc": "Short info", "lat": 12.34, "lng": 56.78, "cost": 15 } 
        ] 
      } 
    ]
    CRITICAL: Provide highly accurate lat/lng for map plotting. Generate a unique hex color for each day.`;

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) 
      });
      const data = await res.json();
      const parsedItin = JSON.parse(data.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/gi, '').trim());
      
      setItinerary(parsedItin);
      updateMapMarkersFromItinerary(parsedItin);
      
      if (parsedItin.length > 0 && parsedItin[0].activities.length > 0) {
        setMapCenter([parsedItin[0].activities[0].lat, parsedItin[0].activities[0].lng]);
        setMapZoom(13);
      }
    } catch (e) { 
      alert("AI Itinerary Generation failed."); 
    } finally { 
      setIsPlannerLoading(false); 
    }
  };

  const swapActivity = async (dayIndex, actIndex, oldActivity, dayTheme) => {
    setIsPlannerLoading(true);
    const prompt = `Suggest a replacement for "${oldActivity.name}" in ${plannerCity.name}. The day's theme is "${dayTheme}". 
    Return ONLY a JSON object matching this format: 
    { "time": "${oldActivity.time}", "name": "New Place", "desc": "Info", "lat": 12.34, "lng": 56.78, "cost": 10 }`;
    
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) 
      });
      const data = await res.json();
      const newAct = JSON.parse(data.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/gi, '').trim());
      
      const updatedItin = [...itinerary];
      updatedItin[dayIndex].activities[actIndex] = newAct;
      
      setItinerary(updatedItin);
      updateMapMarkersFromItinerary(updatedItin);
    } catch (e) { 
      alert("Swap failed"); 
    } finally { 
      setIsPlannerLoading(false); 
    }
  };

  // ==========================================
  // TAB 4: STAYS LOGIC
  // ==========================================
  const [stays, setStays] = useState([]);
  const [isStaysLoading, setIsStaysLoading] = useState(false);
  const [stayBudget, setStayBudget] = useState('Mid-range');
  const [stayVibe, setStayVibe] = useState('Near city center, modern amenities');

  const searchStays = async () => {
    if (!stayCity) return alert("Please select a destination city.");
    setIsStaysLoading(true); 
    setStays([]);

    const prompt = `You are a hotel booking API. The user is searching for accommodation in ${stayCity.name} (Lat: ${stayCity.lat}, Lon: ${stayCity.lon}).
    Budget: "${stayBudget}". Vibe: "${stayVibe}".
    
    Return ONLY a raw JSON array of 5 highly realistic hotels that fit this criteria.
    Format EXACTLY like this:
    [ 
      { 
        "id": "1", 
        "name": "Realistic Hotel Name", 
        "priceStr": "$85 / night", 
        "rating": 4.5, 
        "lat": 13.7563, 
        "lng": 100.5018, 
        "link": "https://www.booking.com/searchresults.html?ss=${encodeURIComponent(stayCity.name)}", 
        "amenities": ["Free WiFi", "Pool", "Air Conditioning"] 
      } 
    ]`;

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) 
      });
      const data = await res.json();
      const liveHotels = JSON.parse(data.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/gi, '').trim());
      
      setStays(liveHotels);
      
      const hotelMarkers = liveHotels.map(h => ({ 
        lat: h.lat, 
        lng: h.lng, 
        title: `🏨 ${h.name}`, 
        desc: `⭐ ${h.rating} | ${h.priceStr}` 
      }));
      setMarkers(prev => [...prev, ...hotelMarkers]);
      
      if (hotelMarkers.length > 0) { 
        setMapBounds(null);
        setMapCenter([hotelMarkers[0].lat, hotelMarkers[0].lng]); 
        setMapZoom(14); 
      }
    } catch (e) { 
      alert("Hotel generation failed."); 
    } finally { 
      setIsStaysLoading(false); 
    }
  };

  // ==========================================
  // RENDER: SHARED COMPONENTS
  // ==========================================
  const renderMapComponent = () => (
    <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '100%', width: '100%', zIndex: 0 }}>
      <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
      <MapUpdater center={mapCenter} zoom={mapZoom} bounds={mapBounds} />
      
      {routes.filter(r => !hiddenDays[r.day]).map((route, idx) => (
        <Polyline key={idx} positions={route.positions} color={route.color} weight={5} opacity={0.8} />
      ))}
      
      {markers.filter(m => m.day === undefined || !hiddenDays[m.day]).map((marker, idx) => (
        <Marker key={idx} position={[marker.lat, marker.lng]}>
          <Popup>
            <Text style={{fontWeight: 'bold'}}>{marker.title}</Text>
            <br/>
            <Text>{marker.desc}</Text>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );

  const renderNavButtons = () => (
    <>
      <TouchableOpacity 
        style={[isMobile ? styles.mobileNavItem : styles.navItem, activeTab === 'FLIGHTS' && styles.navItemActive]} 
        onPress={() => setActiveTab('FLIGHTS')}
      >
        <Text style={{fontSize: isMobile ? 24 : 20}}>✈️</Text>
        {!isMobile && <Text style={[styles.navText, activeTab === 'FLIGHTS' && styles.navTextActive]}>Flights</Text>}
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[isMobile ? styles.mobileNavItem : styles.navItem, activeTab === 'TRAVEL' && styles.navItemActive]} 
        onPress={() => setActiveTab('TRAVEL')}
      >
        <Text style={{fontSize: isMobile ? 24 : 20}}>🚆</Text>
        {!isMobile && <Text style={[styles.navText, activeTab === 'TRAVEL' && styles.navTextActive]}>Travel</Text>}
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[isMobile ? styles.mobileNavItem : styles.navItem, activeTab === 'PLANNER' && styles.navItemActive]} 
        onPress={() => setActiveTab('PLANNER')}
      >
        <Text style={{fontSize: isMobile ? 24 : 20}}>🗺️</Text>
        {!isMobile && <Text style={[styles.navText, activeTab === 'PLANNER' && styles.navTextActive]}>Planner</Text>}
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={[isMobile ? styles.mobileNavItem : styles.navItem, activeTab === 'STAYS' && styles.navItemActive]} 
        onPress={() => setActiveTab('STAYS')}
      >
        <Text style={{fontSize: isMobile ? 24 : 20}}>🛌</Text>
        {!isMobile && <Text style={[styles.navText, activeTab === 'STAYS' && styles.navTextActive]}>Stays</Text>}
      </TouchableOpacity>

      {!isMobile && <View style={{flex: 1}} />}
      
      <TouchableOpacity 
        style={[isMobile ? styles.mobileNavItem : styles.navItem, !isMobile && {marginBottom: 20}]} 
        onPress={() => setAppMode('COVER')}
      >
        <Text style={{fontSize: isMobile ? 24 : 20}}>🏠</Text>
        {!isMobile && <Text style={styles.navText}>Home</Text>}
      </TouchableOpacity>
    </>
  );

  const renderContent = () => {
    // ------------------------------------------
    // RENDER: FLIGHTS TAB
    // ------------------------------------------
    if (activeTab === 'FLIGHTS') {
      return (
        <View style={styles.tabContent}>
          <Text style={styles.header}>Find Flights</Text>
          <View style={{zIndex: 50}}>
            <LiveCityAutocomplete placeholder="Origin City" emoji="📍" initialQuery={flightOrigin?.name} onLocationSelected={setFlightOrigin} />
            <LiveCityAutocomplete placeholder="Destination City" emoji="✈️" initialQuery={flightDest?.name} onLocationSelected={setFlightDest} />
            
            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 15, paddingHorizontal: 5}}>
              <Switch value={isRoundTrip} onValueChange={setIsRoundTrip} trackColor={{ false: '#E2E8F0', true: '#2E8B57' }} thumbColor='#FFF' />
              <Text style={{color: '#1E293B', marginLeft: 10, fontWeight: 'bold'}}>{isRoundTrip ? "Round Trip" : "One Way"}</Text>
            </View>
            
            <View style={{flexDirection: isMobile ? 'column' : 'row', gap: 10, marginBottom: 15}}>
              <WebDatePicker date={flightDate} setDate={setFlightDate} placeholder="Departure" />
              {isRoundTrip && <WebDatePicker date={returnDate} setDate={setReturnDate} placeholder="Return" />}
            </View>
            
            <TouchableOpacity style={styles.mainBtn} onPress={handleFlightSearch}>
              <Text style={styles.btnText}>{isFlightLoading ? "Scanning APIs..." : "Search Routes"}</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={{marginTop: 20}}>
            {flights.map((flight, idx) => (
              <View key={idx} style={styles.card}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15}}>
                   <View style={{flexDirection: 'row', alignItems: 'center', flexShrink: 1, paddingRight: 10}}>
                     <Text style={{fontSize: 24, marginRight: 10}}>✈️</Text>
                     <Text style={[styles.cardTitle, { flexShrink: 1 }]} numberOfLines={1}>{flight.airline}</Text>
                   </View>
                   <Text style={{color: '#2E8B57', fontWeight: 'bold', fontSize: 22}}>${flight.price}</Text>
                </View>
                
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F1F5F9', padding: 15, borderRadius: 10}}>
                   <View style={{alignItems: 'center'}}>
                     <Text style={{fontSize: 18, fontWeight: 'bold', color: '#1E293B'}}>{flight.depTime}</Text>
                     <Text style={{color: '#64748B', fontWeight: 'bold'}}>{flight.depAirport}</Text>
                   </View>
                   
                   <View style={{alignItems: 'center', flex: 1, paddingHorizontal: 10}}>
                     <Text style={{color: '#64748B', fontSize: 12, marginBottom: 5}}>{flight.duration}</Text>
                     <View style={{height: 2, backgroundColor: '#CBD5E1', width: '100%', justifyContent: 'center', alignItems: 'center'}}>
                       {flight.stops > 0 && <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF2079'}} />}
                     </View>
                     <Text style={{color: flight.stops > 0 ? '#FF2079' : '#2E8B57', fontSize: 10, marginTop: 5, fontWeight: 'bold'}}>
                       {flight.stops === 0 ? 'Direct' : `${flight.stops} Stop(s)`}
                     </Text>
                   </View>
                   
                   <View style={{alignItems: 'center'}}>
                     <Text style={{fontSize: 18, fontWeight: 'bold', color: '#1E293B'}}>{flight.arrTime}</Text>
                     <Text style={{color: '#64748B', fontWeight: 'bold'}}>{flight.arrAirport}</Text>
                   </View>
                </View>
                
                <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL(flight.link)}>
                  <Text style={{color: '#2E8B57', fontWeight: 'bold', textAlign: 'center'}}>Book on Skyscanner</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      );
    }

    // ------------------------------------------
    // RENDER: TRAVEL TAB
    // ------------------------------------------
    if (activeTab === 'TRAVEL') {
      return (
        <View style={styles.tabContent}>
          <Text style={styles.header}>Global Guardian Transport</Text>
          
          <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, paddingHorizontal: 5}}>
             <Text style={{color: '#FF7E5F', fontWeight: 'bold'}}>🌡️ {transitMeta.temp}°C</Text>
             <Text style={{color: '#00E5E5', fontWeight: 'bold'}}>🚦 {transitMeta.tMult.toFixed(2)}x Traffic</Text>
          </View>
          
          <LiveCityAutocomplete placeholder="Start (e.g. KLIA Airport)" emoji="🟢" poi={true} initialQuery={localStart?.name} onLocationSelected={setLocalStart} />
          <LiveCityAutocomplete placeholder="End (e.g. Petronas Towers)" emoji="🏁" poi={true} initialQuery={localEnd?.name} onLocationSelected={setLocalEnd} />
          
          <TouchableOpacity style={styles.mainBtn} onPress={fetchLocalTransport}>
            {isTransitLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Analyze Route</Text>}
          </TouchableOpacity>

          <ScrollView style={{marginTop: 20}}>
            {transitOptions.length > 0 && <Text style={{fontWeight: 'bold', color: '#666', marginBottom: 10, fontSize: 12}}>SMART RIDE & TRANSIT OPTIONS</Text>}
            {transitOptions.map((opt, idx) => (
              <View key={idx} style={styles.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                  <View style={{flexDirection: 'row', alignItems: 'center', flexShrink: 1, paddingRight: 10}}>
                    <Text style={{ fontWeight: 'bold', color: '#1E293B', fontSize: 16, marginRight: 10 }} numberOfLines={1}>
                      {opt.type === 'ride' ? '🚕' : (opt.type === 'walk' ? '🚶‍♂️' : '🚆')} {opt.name}
                    </Text>
                    {opt.fastest && !isMobile && (
                      <View style={{backgroundColor: '#00E5E5', paddingHorizontal: 5, borderRadius: 4}}>
                        <Text style={{fontSize: 10, fontWeight: 'bold'}}>FASTEST</Text>
                      </View>
                    )}
                    {opt.recommended && !isMobile && (
                      <View style={{backgroundColor: '#635BFF', paddingHorizontal: 5, borderRadius: 4, marginLeft: 5}}>
                        <Text style={{fontSize: 10, color: 'white', fontWeight: 'bold'}}>AI REC</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: '#2E8B57', fontWeight: 'bold', fontSize: 16 }}>{opt.cur} {opt.cost.toFixed(2)}</Text>
                </View>
                
                <Text style={{ color: '#64748B', marginBottom: 10 }}>⏱️ {formatTime(opt.time)}</Text>
                
                <TouchableOpacity style={styles.linkBtn} onPress={() => handleTransportClick(opt)}>
                  <Text style={{ color: '#2E8B57', fontWeight: 'bold', textAlign: 'center' }}>
                    {opt.type === 'ride' ? 'Book Ride ➔' : '🗺️ Open in Google Maps'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      );
    }

    // ------------------------------------------
    // RENDER: PLANNER TAB
    // ------------------------------------------
    if (activeTab === 'PLANNER') {
      return (
        <View style={styles.tabContent}>
          <Text style={styles.header}>AI Day Planner</Text>
          <Text style={{color: '#666', marginBottom: 15}}>Auto-routes your custom day on the map.</Text>
          
          <View style={{zIndex: 50}}>
            <LiveCityAutocomplete placeholder="Where are you going?" emoji="🗺️" initialQuery={plannerCity?.name} onLocationSelected={setPlannerCity} />
            <TouchableOpacity 
              style={[styles.mainBtn, {backgroundColor: plannerCity ? '#1E293B' : '#94A3B8'}]} 
              onPress={() => setShowWizard(true)} 
              disabled={!plannerCity}
            >
              <Text style={styles.btnText}>⚙️ Configure Trip</Text>
            </TouchableOpacity>
            
            {isPlannerLoading && <ActivityIndicator color="#2E8B57" style={{marginTop: 20}} />}
          </View>

          <Modal visible={showWizard} animationType="slide" transparent={false}>
            <ItineraryWizard onComplete={handleWizardComplete} onCancel={() => setShowWizard(false)} />
          </Modal>

          <ScrollView style={{marginTop: 20}}>
            {itinerary && itinerary.map((dayData, dIdx) => (
              <View key={dIdx} style={{marginBottom: 30}}>
                
                {/* Day Header & Visibility Toggle */}
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderLeftWidth: 4, borderLeftColor: dayData.color, paddingLeft: 10, marginBottom: 15}}>
                  <View>
                    <Text style={{fontSize: 22, fontWeight: 'bold', color: '#1E293B'}}>Day {dayData.day}</Text>
                    <Text style={{color: dayData.color, fontWeight: 'bold'}}>{dayData.theme}</Text>
                  </View>
                  <TouchableOpacity 
                    onPress={() => toggleDayVisibility(dayData.day)} 
                    style={{padding: 8, backgroundColor: hiddenDays[dayData.day] ? '#F1F5F9' : '#E0F2FE', borderRadius: 8}}
                  >
                    <Text style={{fontSize: 12, fontWeight: 'bold', color: '#475569'}}>
                      {hiddenDays[dayData.day] ? '👁️‍🗨️ Hidden' : '👁️ Map Layer'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Hide cards if layer is hidden */}
                {!hiddenDays[dayData.day] && dayData.activities.map((item, aIdx) => (
                  <View key={aIdx} style={styles.card}>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                      <Text style={{fontWeight: 'bold', color: '#2E8B57'}}>{item.time}</Text>
                      <Text style={{color: '#666'}}>${item.cost}</Text>
                    </View>
                    
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <Text style={{color: '#555', marginBottom: 10}}>{item.desc}</Text>
                    
                    <View style={{flexDirection: 'row', gap: 10}}>
                      <TouchableOpacity 
                        style={[styles.linkBtn, {flex: 1}]} 
                        onPress={() => { 
                          setMapBounds(null); 
                          setMapCenter([item.lat, item.lng]); 
                          setMapZoom(16); 
                        }}
                      >
                        <Text style={{color: '#2E8B57', textAlign: 'center', fontSize: 12}}>📍 View on Map</Text>
                      </TouchableOpacity>
                      
                      {/* AI Swap Button */}
                      <TouchableOpacity 
                        style={[styles.linkBtn, {flex: 1, borderColor: '#FF4444'}]} 
                        onPress={() => swapActivity(dIdx, aIdx, item, dayData.theme)}
                      >
                        <Text style={{color: '#FF4444', textAlign: 'center', fontSize: 12}}>♻️ Swap</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      );
    }

    // ------------------------------------------
    // RENDER: STAYS TAB
    // ------------------------------------------
    if (activeTab === 'STAYS') {
      return (
        <View style={styles.tabContent}>
          <Text style={styles.header}>Find Accommodation</Text>
          <Text style={{color: '#666', marginBottom: 15}}>AI-powered hotel generation.</Text>
          
          <View style={{zIndex: 50}}>
            <LiveCityAutocomplete placeholder="Where are you staying?" emoji="📍" initialQuery={stayCity?.name} onLocationSelected={setStayCity} />
            <TextInput style={[styles.inputBox, {marginBottom: 10}]} placeholder="Budget (e.g., $100/night, cheap)" value={stayBudget} onChangeText={setStayBudget} />
            <TextInput style={[styles.inputBox, {marginBottom: 15}]} placeholder="Vibe (e.g., Pool, near transit)" value={stayVibe} onChangeText={setStayVibe} />
            
            <TouchableOpacity style={styles.mainBtn} onPress={searchStays}>
              {isStaysLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Search Hotels</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView style={{marginTop: 20}}>
            {stays.map((hotel, idx) => (
              <View key={idx} style={styles.card}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                  <View style={{flex: 1, paddingRight: 10}}>
                    <Text style={styles.cardTitle}>{hotel.name}</Text>
                    <Text style={{color: '#666', marginTop: 5}}>⭐ {hotel.rating} Rating</Text>
                  </View>
                  <Text style={{color: '#2E8B57', fontWeight: 'bold', fontSize: 20}}>{hotel.priceStr}</Text>
                </View>
                
                {/* Amenities Block */}
                {hotel.amenities && (
                  <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10}}>
                    {hotel.amenities.map((amenity, aIdx) => (
                      <View key={aIdx} style={{backgroundColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12}}>
                        <Text style={{color: '#475569', fontSize: 10, fontWeight: 'bold'}}>{amenity}</Text>
                      </View>
                    ))}
                  </View>
                )}
                
                <View style={{flexDirection: 'row', gap: 10, marginTop: 15}}>
                  <TouchableOpacity 
                    style={[styles.linkBtn, {flex: 1}]} 
                    onPress={() => { 
                      setMapBounds(null); 
                      setMapCenter([hotel.lat, hotel.lng]); 
                      setMapZoom(16); 
                    }}
                  >
                    <Text style={{color: '#2E8B57', textAlign: 'center', fontSize: 12}}>📍 View on Map</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.linkBtn, {flex: 1, backgroundColor: '#1E293B', borderColor: '#1E293B'}]} 
                    onPress={() => Linking.openURL(hotel.link)}
                  >
                    <Text style={{color: 'white', textAlign: 'center', fontSize: 12}}>Book Now</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      );
    }
  };

  // ==========================================
  // RENDER: APP WRAPPER (Cover vs Dashboard)
  // ==========================================
  if (appMode === 'COVER') {
    return (
      <View style={{flex: 1, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', padding: isMobile ? 20 : 40}}>
        <View style={{backgroundColor: '#FFF', padding: isMobile ? 25 : 40, borderRadius: 20, width: '100%', maxWidth: 500, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, elevation: 5}}>
          <Text style={{fontSize: isMobile ? 28 : 36, fontWeight: '900', color: '#1E293B', marginBottom: 10, textAlign: 'center'}}>Sojourner</Text>
          <Text style={{fontSize: 16, color: '#64748B', marginBottom: 40, textAlign: 'center'}}>Where will your journey begin?</Text>
          
          <LiveCityAutocomplete placeholder="Where are you now?" emoji="📍" onLocationSelected={setGlobalOrigin} />
          <LiveCityAutocomplete placeholder="Where do you want to go?" emoji="✈️" onLocationSelected={setGlobalDest} />
          
          <TouchableOpacity 
            style={[styles.mainBtn, {marginTop: 20, paddingVertical: 18, backgroundColor: (globalOrigin && globalDest) ? '#2E8B57' : '#94A3B8'}]} 
            onPress={initializeDashboard} 
            disabled={!globalOrigin || !globalDest}
          >
            <Text style={{color: 'white', fontWeight: 'bold', fontSize: 18}}>Plan My Trip ➔</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Mobile Dashboard
  if (isMobile) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC', flexDirection: 'column' }}>
        <View style={{ width: '100%', height: 280, zIndex: 0, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
          {Platform.OS === 'web' && renderMapComponent()}
        </View>
        <View style={{ flex: 1, padding: 15 }}>
          {renderContent()}
        </View>
        <View style={styles.mobileNavContainer}>
          {renderNavButtons()}
        </View>
      </View>
    );
  }

  // Desktop Dashboard
  return (
    <View style={styles.appContainer}>
      {/* 🚨 LEFT PANE IS NOW DYNAMICALLY RESIZED BY leftWidthPct 🚨 */}
      <View style={[styles.leftPane, { width: `${leftWidthPct}%` }]}>
        <View style={styles.sidebar}>
          <Text style={styles.logo}>Sojourner</Text>
          {renderNavButtons()}
        </View>
        <View style={styles.contentArea}>
          {renderContent()}
        </View>
      </View>

      {/* 🚨 THE DRAGGABLE SPLIT-PANE RESIZER 🚨 */}
      <View {...panResponder.panHandlers} style={styles.resizer}>
        <View style={styles.resizerLine} />
        <View style={styles.resizerLine} />
      </View>

      {/* RIGHT PANE FLEXES TO FILL REMAINING SPACE */}
      <View style={styles.rightPane}>
        {Platform.OS === 'web' && renderMapComponent()}
      </View>
    </View>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  appContainer: { flex: 1, flexDirection: 'row', backgroundColor: '#F8FAFC' },
  
  // Left pane width is dynamically set inline now
  leftPane: { flexDirection: 'row', backgroundColor: '#FFF' },
  
  // 🚨 STYLES FOR THE NEW RESIZER BAR 🚨
  resizer: { 
    width: 14, 
    backgroundColor: '#F8FAFC', 
    justifyContent: 'center', 
    alignItems: 'center', 
    cursor: 'col-resize', 
    borderRightWidth: 1, 
    borderRightColor: '#E2E8F0', 
    borderLeftWidth: 1, 
    borderLeftColor: '#E2E8F0', 
    zIndex: 100 
  },
  resizerLine: { 
    width: 2, 
    height: 18, 
    backgroundColor: '#CBD5E1', 
    marginVertical: 1, 
    borderRadius: 1 
  },

  sidebar: { width: 80, borderRightWidth: 1, borderRightColor: '#E2E8F0', alignItems: 'center', paddingTop: 20, backgroundColor: '#F1F5F9' },
  logo: { fontSize: 10, fontWeight: 'bold', color: '#2E8B57', marginBottom: 30, textAlign: 'center' },
  
  navItem: { padding: 15, alignItems: 'center', marginBottom: 10, borderRadius: 10, width: 60 },
  navItemActive: { backgroundColor: '#E0F2FE' },
  navText: { fontSize: 10, color: '#666', marginTop: 5 },
  navTextActive: { color: '#2E8B57', fontWeight: 'bold' },
  
  mobileNavContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#FFF', paddingBottom: Platform.OS === 'ios' ? 20 : 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.05, shadowRadius: 5 },
  mobileNavItem: { padding: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  
  contentArea: { flex: 1, padding: 25 },
  tabContent: { flex: 1 },
  header: { fontSize: 28, fontWeight: 'bold', color: '#1E293B', marginBottom: 5 },
  
  // Right pane flexes to take up whatever space the left pane leaves
  rightPane: { flex: 1, backgroundColor: '#E2E8F0' },
  
  inputBox: { flexDirection: 'row', backgroundColor: '#F1F5F9', padding: 15, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  input: { flex: 1, outlineStyle: 'none', color: '#1E293B', fontSize: 16 },
  dropdown: { position: 'absolute', top: 60, left: 0, right: 0, backgroundColor: '#FFF', borderRadius: 8, maxHeight: 200, elevation: 5, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  dropdownItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  
  mainBtn: { backgroundColor: '#2E8B57', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  
  card: { backgroundColor: '#FFF', padding: 20, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B', marginTop: 5 },
  linkBtn: { marginTop: 15, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2E8B57', backgroundColor: '#F0FDF4' }
});