import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator, 
  Platform, 
  Linking, 
  Modal, 
  Switch, 
  createElement, 
  useWindowDimensions, 
  PanResponder, 
  Image 
} from 'react-native';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import ItineraryWizard from './itineraryWizard';

// --- LEAFLET MARKER FIX FOR REACT NATIVE WEB ---
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});


// 🚨 MASTER CONFIGURATION & API KEYS 🚨
// AllOrigins is incredibly stable for Google Maps (GET requests)
const GOOGLE_CORS_PROXY = "https://api.allorigins.win/raw?url=";

// Keep CorsProxy for Amadeus (Since Amadeus requires custom Auth headers)
const AMADEUS_CORS_PROXY = "";

const GEMINI_API_KEY = '';
const AMADEUS_ID = '';
const AMADEUS_SECRET = '';
const WEATHER_API_KEY = '';
const GOOGLE_PLACES_API_KEY = '';

// --- HELPER: AUTO-PAN MAP ---
function MapUpdater({ center, zoom, bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (center) {
      map.flyTo(center, zoom);
    }
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

// 🚨 BULLETPROOF STATIC DROPDOWN (Zero Dependencies)
const StaticDropdown = ({ value, onValueChange, options, placeholder, icon, zIndex }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={{ position: 'relative', zIndex: zIndex, marginBottom: 15 }}>
      <TouchableOpacity 
        style={[styles.inputBox, { marginBottom: 0 }]} 
        onPress={() => setIsOpen(!isOpen)}
      >
        <Text style={{ marginRight: 10, fontSize: 18 }}>{icon}</Text>
        <Text style={{ flex: 1, color: value ? '#1E293B' : '#888', fontSize: 16 }}>
          {value || placeholder}
        </Text>
        <Text style={{ color: '#888', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {isOpen && (
        <View style={[styles.dropdown, { top: 55, zIndex: 999 }]}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 180 }}>
            {options.map((opt, idx) => (
              <TouchableOpacity 
                key={idx} 
                style={styles.dropdownItem} 
                onPress={() => {
                  onValueChange(opt);
                  setIsOpen(false);
                }}
              >
                <Text style={{ color: '#333', fontWeight: 'bold' }}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

// --- 1. REUSABLE UI COMPONENTS ---

// 🚨 Google Places Autocomplete Engine
// 🚨 BULLETPROOF ZERO-CORS AUTOCOMPLETE 
const LiveCityAutocomplete = ({ placeholder, onLocationSelected, emoji, poi = false, initialQuery = '' }) => {
  // Defensive state initialization: ensure it is always a string
  const [query, setQuery] = useState(initialQuery || '');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const isSelecting = useRef(initialQuery !== ''); 

  useEffect(() => { 
    if (initialQuery) { setTimeout(() => { isSelecting.current = false; }, 1000); }
  }, [initialQuery]);

  useEffect(() => {
    // Safe check using fallback empty string
    const currentQuery = query || '';
    
    if (currentQuery.length > 2 && !isSelecting.current) {
      const delay = setTimeout(async () => {
        try {
          // Zero-CORS API call. Safely runs directly on Firebase!
          const url = poi 
            ? `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(currentQuery)}&format=json&limit=5` 
            : `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(currentQuery)}&format=json&featuretype=city&limit=10`;
          
          const res = await fetch(url);
          if (!res.ok) throw new Error("OSM Network Error");
          
          const data = await res.json();
          
          // Sort mathematically by global importance so major cities are always #1
          const dataArray = Array.isArray(data) ? data : [];
          const sortedData = dataArray.sort((a, b) => (b.importance || 0) - (a.importance || 0));
          
          setResults(sortedData.slice(0, 4));
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
    
    // 🚨 THE FIX: OpenStreetMap uses display_name, not description!
    const displayName = poi ? place.display_name : (place.name || place.display_name.split(',')[0]);
    
    // Ensure we never set undefined to the text input
    setQuery(displayName || '');
    
    // OSM provides lat/lon immediately, no second API call required!
    onLocationSelected({ 
      name: displayName || '', 
      lat: parseFloat(place.lat), 
      lon: parseFloat(place.lon) 
    });
    
    setShowDropdown(false);
    setTimeout(() => { isSelecting.current = false; }, 500);
  };

  return (
    <View style={{ position: 'relative', zIndex: showDropdown ? 1000 : 1, marginBottom: 15 }}>
      <View style={styles.inputBox}>
        {/* Pass an icon name instead of an emoji */}
        {emoji && <Text style={{ marginRight: 10, fontSize: 18 }}>{emoji}</Text>}
        <TextInput
          style={styles.input} 
          placeholder={placeholder} 
          placeholderTextColor="#888" 
          value={query}
          onChangeText={(text) => { isSelecting.current = false; setQuery(text || ''); }}
          onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        />
      </View>
      {showDropdown && results.length > 0 && (
        <ScrollView style={styles.dropdown} keyboardShouldPersistTaps="handled">
          {results.map((place, index) => (
            <TouchableOpacity key={index} style={styles.dropdownItem} onPress={() => handleSelect(place)}>
              {/* 🚨 THE FIX: Render display_name */}
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
            flex: 1, height: '100%', padding: '10px 15px', border: 'none', 
            backgroundColor: 'transparent', color: date ? '#1E293B' : '#888', 
            fontSize: '16px', outline: 'none', cursor: 'pointer', fontFamily: 'inherit' 
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

  const [leftWidthPct, setLeftWidthPct] = useState(45);
  const windowWidthRef = useRef(width);
  
  useEffect(() => { 
    windowWidthRef.current = width; 
  }, [width]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        let newPct = (gestureState.moveX / windowWidthRef.current) * 100;
        if (newPct < 30) newPct = 30;
        if (newPct > 70) newPct = 70;
        setLeftWidthPct(newPct);
      },
    })
  ).current;

  const [appMode, setAppMode] = useState('COVER');
  const [activeTab, setActiveTab] = useState('PLANNER');
  const [globalOrigin, setGlobalOrigin] = useState(null);
  const [globalDest, setGlobalDest] = useState(null);

  const [mapCenter, setMapCenter] = useState([3.195, 101.747]); 
  const [mapZoom, setMapZoom] = useState(6);
  const [mapBounds, setMapBounds] = useState(null);
  const [markers, setMarkers] = useState([]); 
  const [routes, setRoutes] = useState([]); 
  const [hiddenDays, setHiddenDays] = useState({});

  const [flightOrigin, setFlightOrigin] = useState(null);
  const [flightDest, setFlightDest] = useState(null);
  const [localStart, setLocalStart] = useState(null);
  const [localEnd, setLocalEnd] = useState(null);
  const [plannerCity, setPlannerCity] = useState(null);
  const [stayCity, setStayCity] = useState(null);
  const [isMapCollapsed, setIsMapCollapsed] = useState(false);

  // PLANNER STATES FOR TEAMMATE LIVE SYNC
  const [itinerary, setItinerary] = useState(null);
  const [isPlannerLoading, setIsPlannerLoading] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardPrefs, setWizardPrefs] = useState(null); 
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [weatherData, setWeatherData] = useState(null);
  const [lastSync, setLastSync] = useState(new Date());

  const initializeDashboard = () => {
    if (!globalOrigin || !globalDest) {
      return alert("Please select your starting point and destination.");
    }
    
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
    
    setMapBounds([
      [globalOrigin.lat, globalOrigin.lon], 
      [globalDest.lat, globalDest.lon]
    ]);
    
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
        console.error(e);
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
    if (!flightOrigin || !flightDest || !flightDate) return alert("Fill origin, destination, and departure date.");
    if (isRoundTrip && !returnDate) return alert("Please select a return date.");

    setIsFlightLoading(true); 
    setFlights([]); 
    setRoutes([]);
    
    setMarkers([
      { lat: flightOrigin.lat, lng: flightOrigin.lon, title: `Origin: ${flightOrigin.name}` }, 
      { lat: flightDest.lat, lng: flightDest.lon, title: `Dest: ${flightDest.name}` }
    ]);
    
    setMapBounds([
      [flightOrigin.lat, flightOrigin.lon], 
      [flightDest.lat, flightDest.lon]
    ]);

    try {
      const prompt = `Return ONLY a JSON object with 3-letter IATA codes for nearest international airports to: Origin: ${flightOrigin.name}, Dest: ${flightDest.name}. Format: {"origin": "CODE", "destination": "CODE"}`;
      
      const resIATA = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) 
      });
      
      const dataIATA = await resIATA.json();
      const codes = JSON.parse(dataIATA.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/gi, '').trim());

      try {
        const authUrl = AMADEUS_CORS_PROXY + 'https://test.api.amadeus.com/v1/security/oauth2/token';
        const authRes = await fetch(authUrl, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, 
          body: `grant_type=client_credentials&client_id=${AMADEUS_ID}&client_secret=${AMADEUS_SECRET}` 
        });
        
        if (!authRes.ok) throw new Error("Proxy or Auth Failed");
        
        const authData = await authRes.json();
        
        let amadeusBaseUrl = `https://test.api.amadeus.com/v2/shopping/flight-offers?originLocationCode=${codes.origin}&destinationLocationCode=${codes.destination}&departureDate=${flightDate}&adults=1&max=5`;
        
        if (isRoundTrip) {
          amadeusBaseUrl += `&returnDate=${returnDate}`;
        }
        
        const searchUrl = AMADEUS_CORS_PROXY + amadeusBaseUrl;
        const flightRes = await fetch(searchUrl, { 
          headers: { 'Authorization': `Bearer ${authData.access_token}` } 
        });
        
        if (!flightRes.ok) throw new Error("Amadeus Search Failed");
        
        const flightData = await flightRes.json();
        
        if (!flightData.data || flightData.data.length === 0) {
          throw new Error("No flights found in API, triggering fallback.");
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

      } catch (apiError) {
        console.warn("API/Proxy Blocked. Triggering Gemini Flight Simulator...");
        
        const fallbackPrompt = `You are a live flight booking API. Generate 5 realistic flights from ${flightOrigin.name} (${codes.origin}) to ${flightDest.name} (${codes.destination}) on ${flightDate}.
        Return ONLY a raw JSON array. Format:
        [ { "id": "1", "airline": "Major Regional Airline", "price": 350.00, "duration": "6h 30m", "depTime": "08:00 AM", "arrTime": "02:30 PM", "depAirport": "${codes.origin}", "arrAirport": "${codes.destination}", "stops": 1, "link": "https://www.skyscanner.net/transport/flights/${codes.origin}/${codes.destination}/${flightDate.replace(/-/g, '').substring(2)}" } ]`;

        const fallbackRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ contents: [{ parts: [{ text: fallbackPrompt }] }] }) 
        });
        
        const fallbackData = await fallbackRes.json();
        const fallbackFlights = JSON.parse(fallbackData.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/gi, '').trim());
        
        setFlights(fallbackFlights.sort((a, b) => a.price - b.price));
      }
    } catch (e) { 
      alert("Flight engine critically failed."); 
    } finally { 
      setIsFlightLoading(false); 
    }
  };

// ==========================================
  // TAB 2: TRAVEL TRANSPORT LOGIC (Live Google Traffic & Tags)
  // ==========================================
  const [transitOptions, setTransitOptions] = useState([]);
  const [isTransitLoading, setIsTransitLoading] = useState(false);
  const [transitMeta, setTransitMeta] = useState({ temp: 'N/A', isHeavyTraffic: false });

  const fetchLocalTransport = async () => {
    if (!localStart?.lat || !localEnd?.lat) return alert("Please select your start and end points from the dropdown.");
    
    setIsTransitLoading(true); 
    setTransitOptions([]); 
    setRoutes([]);
    
    try {
      setMarkers([
        { lat: localStart.lat, lng: localStart.lon, title: 'Start' }, 
        { lat: localEnd.lat, lng: localEnd.lon, title: 'End' }
      ]);
      setMapBounds([[localStart.lat, localStart.lon], [localEnd.lat, localEnd.lon]]);
      
      // Plot the visual line using OSRM (Zero-CORS Map Line)
      try {
        const resRoute = await fetch(`https://router.project-osrm.org/route/v1/driving/${localStart.lon},${localStart.lat};${localEnd.lon},${localEnd.lat}?overview=full&geometries=geojson`);
        if (resRoute.ok) {
          const routeData = await resRoute.json();
          if (routeData.routes && routeData.routes[0]) {
            setRoutes([{ positions: routeData.routes[0].geometry.coordinates.map(c => [c[1], c[0]]), color: '#FF2079' }]);
          }
        }
      } catch (e) {}
      
      // 🚨 PROXY-FREE GOOGLE ROUTES API (Live Traffic)
      const routesUrl = 'https://routes.googleapis.com/directions/v2:computeRoutes';
      const routesBody = {
        origin: { location: { latLng: { latitude: localStart.lat, longitude: localStart.lon } } },
        destination: { location: { latLng: { latitude: localEnd.lat, longitude: localEnd.lon } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE"
      };

      // Direct POST request to Google. Zero proxies needed!
      const dirRes = await fetch(routesUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          // We only request the exact fields we need to save bandwidth
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.staticDuration'
        },
        body: JSON.stringify(routesBody)
      });

      if (!dirRes.ok) {
          const errData = await dirRes.json();
          throw new Error(`Google Routes Error: ${errData.error?.message || dirRes.status}`);
      }
      
      const dirData = await dirRes.json();

      let distKm = calculateDistance(localStart.lat, localStart.lon, localEnd.lat, localEnd.lon);
      let trafficTimeMins = Math.round(distKm * 3); 
      let normalTimeMins = trafficTimeMins;
      let isHeavyTraffic = false;

      // Extract exact live data from Google Routes JSON shape
      if (dirData.routes && dirData.routes.length > 0) {
         const route = dirData.routes[0];
         distKm = route.distanceMeters / 1000;
         
         if (route.staticDuration) normalTimeMins = Math.round(parseInt(route.staticDuration) / 60);
         if (route.duration) trafficTimeMins = Math.round(parseInt(route.duration) / 60);
         
         // 🚨 DEV X-RAY: See exactly what Google is calculating
         console.log(`Normal Time: ${normalTimeMins} mins | Live Traffic Time: ${trafficTimeMins} mins`);
         
         // FIX: Lowered the threshold to 10% (1.1) so it catches minor jams too!
         if (trafficTimeMins > normalTimeMins * 1.1) {
            isHeavyTraffic = true;
         }
      }
      
      // 🚨 LIVE WEATHER API INTEGRATION
      let currentTemp = 'N/A';
      try {
        const wRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${localStart.lat}&lon=${localStart.lon}&appid=${WEATHER_API_KEY}&units=metric`);
        if (wRes.ok) {
          const wJson = await wRes.json();
          if (wJson.main && wJson.main.temp) {
            currentTemp = Math.round(wJson.main.temp);
          }
        }
      } catch (weatherErr) {
        console.warn("Could not fetch live weather.", weatherErr);
      }
      
      setTransitMeta({ temp: currentTemp, isHeavyTraffic });
      
      const endName = localEnd.name || "";
      let cfg;
      
      if (endName.includes("Singapore")) {
        cfg = { cur: "SGD", rides: [{n: "Grab SG", b: 6, k: 1.2, u: "https://www.grab.com/sg/"}, {n: "CDG Zig", b: 5.5, k: 1.3, u: "https://www.cdgtaxi.com.sg/"}] };
      } else if (endName.includes("Malaysia") || endName.includes("Malacca")) {
        cfg = { cur: "MYR", rides: [{n: "Grab MY", b: 5, k: 1.1, u: "https://www.grab.com/my/"}, {n: "AirAsia Ride", b: 4, k: 0.9, u: "https://www.airasia.com/ride/"}] };
      } else {
        cfg = { cur: "USD", rides: [{n: "Uber", b: 8, k: 2.5, u: "https://www.uber.com/"}, {n: "Lyft", b: 7, k: 2.8, u: "https://www.lyft.com/"}] };
      }
      
      let options = [];
      
      // Calculate Ride-hails using exact Google traffic time
      cfg.rides.forEach(r => {
        // Cost inflates if traffic is heavy (Surge pricing simulation)
        const surge = isHeavyTraffic ? 1.4 : 1.0;
        const cost = (r.b + (distKm * r.k)) * surge;
        options.push({ name: r.n, cost, time: trafficTimeMins, type: "ride", url: r.u, tags: [], cur: cfg.cur });
      });
      
      options.push({ name: "Walking", cost: 0.0, time: Math.round(distKm * 12.5), type: "walk", tags: ["🌱 Eco-friendly"], cur: cfg.cur });
      // Transit time is usually fixed, immune to road traffic
      options.push({ name: "Public Transit", cost: 2.0 + (distKm * 0.15), time: normalTimeMins + 10, type: "transit", tags: ["🌱 Eco-friendly"], cur: cfg.cur });
      
      // 🚨 THE TAGGING ENGINE 🚨
      const minTime = Math.min(...options.map(o => o.time));
      const minCost = Math.min(...options.map(o => o.cost));
      
      // Assign dynamic tags
      options.forEach(o => { 
        if (o.time === minTime) o.tags.push("⚡ Fastest");
        if (o.cost === minCost) o.tags.push("💰 Cheapest");
        
        // AI Recommendation Logic:
        // Penalize cars heavily if there is a traffic jam. Reward transit.
        let score = (o.time * 0.5) + (o.cost * 1.5); // Base score (lower is better)
        if (isHeavyTraffic && o.type === 'ride') score += 50; // Huge penalty for cars in traffic
        if (o.type === 'transit') score -= 10; // Slight reward for taking the train
        o.aiScore = score;
      });

      // Find the absolute best score and assign the AI tag
      const bestScore = Math.min(...options.map(o => o.aiScore));
      const bestOption = options.find(o => o.aiScore === bestScore);
      if (bestOption && bestOption.type !== 'walk') { // We don't usually AI-recommend walking 5 hours
          bestOption.tags.push("✨ AI Recommended");
      }
      
      // Sort so AI Recommended and Fastest bubble to the top
      options.sort((a, b) => a.aiScore - b.aiScore);

      setTransitOptions(options);
    } catch (e) { 
      console.error("Full Routing Crash Log:", e);
      alert(`Routing Failed: ${e.message}`); 
    } finally { 
      setIsTransitLoading(false); 
    }
  };

const handleTransportClick = (opt) => {
    if (opt.type === 'ride') {
      Linking.openURL(opt.url); 
    } else {
      const mode = opt.type === 'walk' ? 'walking' : 'transit';
      // FIX: Standardized Google Maps Direction URL
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&origin=${localStart.lat},${localStart.lon}&destination=${localEnd.lat},${localEnd.lon}&travelmode=${mode}`);
    }
  };

  // ==========================================
  // TAB 3: PLANNER LOGIC & TEAMMATE LIVE SYNC
  // ==========================================
  const handleWizardComplete = async (wizardPreferences) => {
    setShowWizard(false); 
    setIsPlannerLoading(true); 
    setItinerary(null); 
    setRoutes([]); 
    setMarkers([]); 
    setHiddenDays({}); 
    setWizardPrefs(wizardPreferences);
    
    const interestsStr = wizardPreferences.interests.length > 0 ? wizardPreferences.interests.join(', ') : 'general sightseeing';
    
    const prompt = `Act as a local travel expert. Create a ${wizardPreferences.days}-day itinerary for a ${wizardPreferences.companions} trip to ${plannerCity.name}. 
    Budget: ${wizardPreferences.budget}. Pace: ${wizardPreferences.pace}. Interests: ${interestsStr}.
    Return ONLY a raw JSON array grouped by day. Format exactly like this:
    [ { "day": 1, "theme": "Arrival", "color": "#FF2079", "activities": [ { "time": "09:00", "name": "Exact Place Name", "desc": "Short info", "lat": 12.34, "lng": 56.78, "cost": 15 } ] } ]
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

  // TEAMMATE LIVE SYNC LOGIC
  const fetchRealWorldContext = async () => {
    if (!plannerCity) return { temp: 25, condition: "Clear", traffic: "Moderate traffic" };
    try {
        const wRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${plannerCity.lat}&lon=${plannerCity.lon}&appid=${WEATHER_API_KEY}&units=metric`);
        const wJson = await wRes.json();
        
        const trafficPrompt = `What is the current traffic congestion status in ${plannerCity.name}? Give a 1-sentence summary.`;
        
        const trafficRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: trafficPrompt }] }] })
        });
        
        const trafficJson = await trafficRes.json();
        const trafficReport = trafficJson?.candidates?.[0]?.content?.parts?.[0]?.text || "Standard traffic flow";
        
        return { 
          temp: wJson?.main?.temp ? Math.round(wJson.main.temp) : 25, 
          condition: wJson?.weather?.[0]?.main || "Clear", 
          traffic: trafficReport 
        };
    } catch (e) { 
      return { temp: 25, condition: "Clear", traffic: "Moderate traffic" }; 
    }
  };

  const syncItinerary = async () => {
    if (!plannerCity || !wizardPrefs) return;
    try {
        const context = await fetchRealWorldContext();
        setWeatherData(context);
        
        const prompt = `REAL-TIME DATA: Weather: ${context.condition} (${context.temp}°C). Traffic: ${context.traffic}.
            TRIP: ${plannerCity.name} for ${wizardPrefs.days} days.
            TASK: Adjust the itinerary. If it is ${context.condition === 'Rain' ? 'raining' : 'sunny'}, prioritize ${context.condition === 'Rain' ? 'indoor' : 'outdoor'} spots. Re-sequence to avoid traffic.
            Return ONLY a raw JSON array grouped by day. Format exactly like this:
            [ { "day": 1, "theme": "Adjusted Theme", "color": "#FF2079", "activities": [ { "time": "09:00", "name": "Exact Place Name", "desc": "Short info", "lat": 12.34, "lng": 56.78, "cost": 15 } ] } ]`;

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        const data = await res.json();
        const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (aiText) {
            const parsedItin = JSON.parse(aiText.replace(/```json/gi, '').replace(/```/gi, '').trim());
            setItinerary(parsedItin);
            updateMapMarkersFromItinerary(parsedItin);
            setLastSync(new Date());
        }
    } catch (err) { 
      console.error("Sync Error:", err); 
    }
  };

  useEffect(() => {
    let interval;
    if (isLiveMode && itinerary) {
        syncItinerary(); 
        interval = setInterval(syncItinerary, 180000); 
    }
    return () => clearInterval(interval);
  }, [isLiveMode]);

  // ==========================================
  // TAB 4: STAYS LOGIC (Bulletproof Google RAG Engine)
  // ==========================================
  const [stays, setStays] = useState([]);
  const [isStaysLoading, setIsStaysLoading] = useState(false);
  const [stayBudget, setStayBudget] = useState('Mid-range');
  const [stayVibe, setStayVibe] = useState('Near city center, modern amenities');

  const searchStays = async () => {
    if (!stayCity) return alert("Please select a destination city.");
    setIsStaysLoading(true); 
    setStays([]);

    try {
      // 🚨 STEP 1: Proxy-Free Call to Google Places API (New)
      const googleRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.location,places.photos'
        },
        body: JSON.stringify({ textQuery: `hotels in ${stayCity.name}` })
      });
      
      const googleData = await googleRes.json();

      // Catch Google API billing/key errors gracefully
      if (googleData.error) {
          console.error("Google Places Error:", googleData.error);
          throw new Error(`Google API Error: ${googleData.error.message}`);
      }

      if (!googleData.places || googleData.places.length === 0) {
         throw new Error("No hotels found on Google Maps for this location.");
      }

      // 🚨 STEP 2: Clean the data & strictly enforce the Photo Rule
      const realHotels = googleData.places.map((place, index) => {
         let photoName = null;
         if (place.photos && place.photos.length > 0) {
           photoName = place.photos[0].name;
         }
         return {
           id: index.toString(),
           name: place.displayName?.text || "Unknown Hotel",
           rating: place.rating || "N/A",
           lat: place.location?.latitude,
           lng: place.location?.longitude,
           photo_reference: photoName
         };
      }).filter(h => h.photo_reference !== null && h.lat && h.lng);

      if (realHotels.length === 0) {
          throw new Error("Found hotels, but none had valid photos. Try another city.");
      }

      // 🚨 STEP 3: Gemini RAG Filter (WITH STRICT JSON MODE)
      const prompt = `You are an AI travel agent.
      USER REQUEST: Budget: "${stayBudget}", Vibe: "${stayVibe}".
      
      AVAILABLE REAL HOTELS:
      ${JSON.stringify(realHotels.slice(0, 15))}
      
      TASK: Select the 5 best hotels from the available list that match the user's request. 
      Add a realistic estimated 'priceStr' (e.g., "$120 / night") and 3 realistic 'amenities' based on the hotel's vibe.
      
      CRITICAL: You MUST use the exact 'name', 'lat', 'lng', and 'photo_reference' from the provided list.
      
      Return ONLY a JSON array of the 5 selected hotels.`;

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          contents: [{ parts: [{ text: prompt }] }],
          // This forces Gemini to output flawless JSON every single time
          generationConfig: { responseMimeType: "application/json" } 
        }) 
      });
      
      if (geminiRes.status === 429) {
         throw new Error("Server is currently handling high traffic. Please wait 30 seconds and try again.");
      }
      
      const geminiData = await geminiRes.json();
      
      // 🚨 THE FIX: Optional Chaining prevents the 'reading 0' crash
      if (!geminiData?.candidates?.[0]?.content?.parts?.[0]?.text) {
          console.error("Gemini Failure Payload:", geminiData);
          throw new Error("Gemini AI failed to respond. Usually a quota limit or safety block. Check console.");
      }
      
      // We don't need .replace(```json) anymore because responseMimeType handles it!
      const finalHotels = JSON.parse(geminiData.candidates[0].content.parts[0].text);
      
      // STEP 4: Convert the New API photo references into actual image URLs
      const hotelsWithLivePhotos = finalHotels.map(hotel => ({
        ...hotel,
        googlePhotoUrl: `https://places.googleapis.com/v1/${hotel.photo_reference}/media?maxHeightPx=400&maxWidthPx=800&key=${GOOGLE_PLACES_API_KEY}`,
        link: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(hotel.name + ' ' + stayCity.name)}`
      }));

      setStays(hotelsWithLivePhotos);
      
      const hotelMarkers = hotelsWithLivePhotos.map(h => ({ lat: h.lat, lng: h.lng, title: `🏨 ${h.name}`, desc: `⭐ ${h.rating} | ${h.priceStr}` }));
      setMarkers(prev => [...prev, ...hotelMarkers]);
      if (hotelMarkers.length > 0) { setMapBounds(null); setMapCenter([hotelMarkers[0].lat, hotelMarkers[0].lng]); setMapZoom(14); }
      
    } catch (e) { 
      console.error("Hotel engine failed:", e);
      // Alerts the exact error message to the user UI so you know what broke
      alert(`Search Failed: ${e.message}`); 
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
        <Polyline 
          key={idx} 
          positions={route.positions} 
          color={route.color} 
          weight={5} 
          opacity={0.8} 
        />
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

  // ==========================================
  // RENDER: STANDARDIZED NAVIGATION
  // ==========================================
  const renderNavButtons = () => {
    const iconSize = isMobile ? 24 : 22;
    const activeColor = '#0284C7'; 
    const inactiveColor = '#64748B';

    return (
      <>
        <TouchableOpacity style={[isMobile ? styles.mobileNavItem : styles.navItem, activeTab === 'FLIGHTS' && styles.navItemActive]} onPress={() => setActiveTab('FLIGHTS')}>
          <Image 
            source={require('./assets/plane.png')} 
            style={{ 
              width: iconSize, 
              height: iconSize, 
              // This magically recolors your PNG to green or gray based on the active tab!
              tintColor: activeTab === 'FLIGHTS' ? activeColor : inactiveColor 
            }} 
          />
          <Text style={[styles.navText, activeTab === 'FLIGHTS' && styles.navTextActive, isMobile && {marginTop: 4, fontSize: 11, fontWeight: 'bold'}]}>Flights</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[isMobile ? styles.mobileNavItem : styles.navItem, activeTab === 'TRAVEL' && styles.navItemActive]} onPress={() => setActiveTab('TRAVEL')}>
          <Image 
            source={require('./assets/cars.png')} 
            style={{ 
              width: iconSize, 
              height: iconSize, 
              // This magically recolors your PNG to green or gray based on the active tab!
              tintColor: activeTab === 'TRAVEL' ? activeColor : inactiveColor 
            }} 
          />
          <Text style={[styles.navText, activeTab === 'TRAVEL' && styles.navTextActive, isMobile && {marginTop: 4, fontSize: 11, fontWeight: 'bold'}]}>Travel</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[isMobile ? styles.mobileNavItem : styles.navItem, activeTab === 'PLANNER' && styles.navItemActive]} onPress={() => setActiveTab('PLANNER')}>
          <Image 
            source={require('./assets/map.png')} 
            style={{ 
              width: iconSize, 
              height: iconSize, 
              // This magically recolors your PNG to green or gray based on the active tab!
              tintColor: activeTab === 'PLANNER' ? activeColor : inactiveColor 
            }} 
          />
          <Text style={[styles.navText, activeTab === 'PLANNER' && styles.navTextActive, isMobile && {marginTop: 4, fontSize: 11, fontWeight: 'bold'}]}>Planner</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[isMobile ? styles.mobileNavItem : styles.navItem, activeTab === 'STAYS' && styles.navItemActive]} onPress={() => setActiveTab('STAYS')}>
          <Image 
            source={require('./assets/bed.png')} 
            style={{ 
              width: iconSize, 
              height: iconSize, 
              // This magically recolors your PNG to green or gray based on the active tab!
              tintColor: activeTab === 'STAYS' ? activeColor : inactiveColor 
            }} 
          />
          <Text style={[styles.navText, activeTab === 'STAYS' && styles.navTextActive, isMobile && {marginTop: 4, fontSize: 11, fontWeight: 'bold'}]}>Stays</Text>
        </TouchableOpacity>

        {!isMobile && <View style={{flex: 1}} />}
        
        <TouchableOpacity style={[isMobile ? styles.mobileNavItem : styles.navItem, !isMobile && {marginBottom: 20}]} onPress={() => setAppMode('COVER')}>
          <Image source={require('./assets/home.png')}
          style={{width: iconSize, height: iconSize}}
          />
          <Text style={[styles.navText, isMobile && {marginTop: 4, fontSize: 11, fontWeight: 'bold'}]}>Home</Text>
        </TouchableOpacity>
      </>
    );
  };

  const renderContent = () => {
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
          
          <ScrollView style={{flex: 1, marginTop: 20}}>
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

if (activeTab === 'TRAVEL') {
      return (
        <View style={styles.tabContent}>
          <Text style={styles.header}>Live Transport</Text>
          
          <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, paddingHorizontal: 5}}>
             <Text style={{color: '#FF7E5F', fontWeight: 'bold'}}>
                🌡️ {transitMeta.temp !== 'N/A' ? `${transitMeta.temp}°C` : 'Local Climate'}
             </Text>
             
             {/* Dynamic Traffic Warning based on Google Routes API */}
             <Text style={{color: transitMeta.isHeavyTraffic ? '#EF4444' : '#10B981', fontWeight: 'bold'}}>
                {transitMeta.isHeavyTraffic ? '🚦 Heavy Traffic Delay' : '🟢 Smooth Traffic'}
             </Text>
          </View>
          
          <LiveCityAutocomplete placeholder="Start (e.g. KLIA Airport)" emoji="🟢" poi={true} initialQuery={localStart?.name} onLocationSelected={setLocalStart} />
          <LiveCityAutocomplete placeholder="End (e.g. Petronas Towers)" emoji="🏁" poi={true} initialQuery={localEnd?.name} onLocationSelected={setLocalEnd} />
          
          <TouchableOpacity style={styles.mainBtn} onPress={fetchLocalTransport}>
            {isTransitLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Analyze Route</Text>}
          </TouchableOpacity>

          <ScrollView style={{flex: 1, marginTop: 20}}>
            {transitOptions.length > 0 && <Text style={{fontWeight: 'bold', color: '#666', marginBottom: 10, fontSize: 12}}>SMART RIDE & TRANSIT OPTIONS</Text>}
            
            {transitOptions.map((opt, idx) => (
              <View key={idx} style={styles.card}>
                
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                  <Text style={{ fontWeight: 'bold', color: '#1E293B', fontSize: 16 }} numberOfLines={1}>
                    {opt.type === 'ride' ? '🚕' : (opt.type === 'walk' ? '🚶‍♂️' : '🚆')} {opt.name}
                  </Text>
                  <Text style={{ color: '#2E8B57', fontWeight: 'bold', fontSize: 16 }}>{opt.cur} {opt.cost.toFixed(2)}</Text>
                </View>

                {/* 🚨 THE MULTI-TAG RENDERER 🚨 */}
                {opt.tags && opt.tags.length > 0 && (
                  <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10}}>
                    {opt.tags.map((tag, tIdx) => {
                      // Color code the tags dynamically
                      let bgColor = '#E2E8F0';
                      let textColor = '#475569';
                      if (tag.includes('Fastest')) { bgColor = '#FEF08A'; textColor = '#854D0E'; }
                      if (tag.includes('Cheapest')) { bgColor = '#DCFCE7'; textColor = '#166534'; }
                      if (tag.includes('Eco')) { bgColor = '#D1FAE5'; textColor = '#065F46'; }
                      if (tag.includes('AI')) { bgColor = '#EDE9FE'; textColor = '#5B21B6'; }

                      return (
                        <View key={tIdx} style={{backgroundColor: bgColor, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12}}>
                          <Text style={{color: textColor, fontSize: 10, fontWeight: 'bold'}}>{tag}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
                
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

    if (activeTab === 'PLANNER') {
      return (
        <View style={styles.tabContent}>
          <Text style={styles.header}>AI Day Planner</Text>
          <Text style={{color: '#666', marginBottom: 15}}>Auto-routes your custom day on the map.</Text>
          
          <View style={{zIndex: 50}}>
            <LiveCityAutocomplete placeholder="Where are you going?" initialQuery={plannerCity?.name} onLocationSelected={setPlannerCity} />
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

          {/* TEAMMATE LIVE SYNC UI */}
          {itinerary && (
            <View style={{marginTop: 15}}>
              <TouchableOpacity 
                style={{backgroundColor: isLiveMode ? '#10B981' : '#E2E8F0', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 10}} 
                onPress={() => setIsLiveMode(!isLiveMode)}
              >
                <Text style={{fontWeight: 'bold', color: isLiveMode ? '#FFF' : '#475569'}}>
                  {isLiveMode ? '📡 Live Sync Active' : '▶️ Enable Weather & Traffic Sync'}
                </Text>
              </TouchableOpacity>
              
              {isLiveMode && weatherData && (
                <View style={{backgroundColor: '#111', padding: 12, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
                    <View style={{flex: 1}}>
                        <Text style={{color: '#10B981', fontSize: 12, fontWeight: 'bold'}}>
                          {weatherData.condition} | {weatherData.temp}°C
                        </Text>
                        <Text style={{color: '#FFA500', fontSize: 11, marginTop: 2}} numberOfLines={1}>
                          {weatherData.traffic}
                        </Text>
                    </View>
                    <Text style={{color: '#666', fontSize: 10}}>Last sync: {lastSync.toLocaleTimeString()}</Text>
                </View>
              )}
            </View>
          )}

          <ScrollView style={{flex: 1, marginTop: 20}}>
            {itinerary && itinerary.map((dayData, dIdx) => (
              <View key={dIdx} style={{marginBottom: 30}}>
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

    if (activeTab === 'STAYS') {
      return (
        <View style={styles.tabContent}>
          <Text style={styles.header}>Find Accommodation</Text>
          <Text style={{color: '#666', marginBottom: 15}}>AI-powered hotel generation.</Text>
          
          <View style={{zIndex: 60}}>
            <LiveCityAutocomplete placeholder="Where are you staying?" emoji="📍" initialQuery={stayCity?.name} onLocationSelected={setStayCity} />
          </View>
          
          <View style={{zIndex: 50}}>
            <StaticDropdown 
              value={stayBudget}
              onValueChange={setStayBudget}
              placeholder="Select your Budget"
              icon="💰"
              zIndex={50}
              options={[
                'Backpacker (Under $50/night)',
                'Budget ($50 - $100/night)',
                'Mid-range ($100 - $250/night)',
                'Luxury ($250 - $500/night)',
                'Ultra Luxury ($500+/night)'
              ]}
            />
          </View>
          
          <View style={{zIndex: 40}}>
            <StaticDropdown 
              value={stayVibe}
              onValueChange={setStayVibe}
              placeholder="Select Hotel Vibe"
              icon="✨"
              zIndex={40}
              options={[
                'Modern & Minimalist',
                'Boutique & Artsy',
                'Resort & Poolside',
                'Business & Transit-friendly',
                'Romantic & Quiet',
                'Party & Nightlife',
                'Eco-friendly Nature Lodge'
              ]}
            />
          </View>
            
          <View style={{zIndex: 30}}>
            <TouchableOpacity style={styles.mainBtn} onPress={searchStays}>
              {isStaysLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Search Hotels</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView style={{flex: 1, marginTop: 20}}>
            {stays.map((hotel, idx) => (
              <View key={idx} style={styles.card}>
                
                {/* 🚨 Google Maps Photo with Unsplash Fallback */}
                <Image 
                  source={{ uri: hotel.googlePhotoUrl || `https://source.unsplash.com/800x400/?${encodeURIComponent(hotel.imageKeyword || 'hotel')}` }} 
                  style={{width: '100%', height: 150, borderRadius: 10, marginBottom: 15, backgroundColor: '#E2E8F0'}} 
                />

                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                  <View style={{flex: 1, paddingRight: 10}}>
                    <Text style={styles.cardTitle}>{hotel.name}</Text>
                    <Text style={{color: '#666', marginTop: 5}}>⭐ {hotel.rating} Rating</Text>
                  </View>
                  <Text style={{color: '#2E8B57', fontWeight: 'bold', fontSize: 20}}>{hotel.priceStr}</Text>
                </View>
                
                {hotel.amenities && (
                  <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10}}>
                    {hotel.amenities.map((amenity, aIdx) => (
                      <View 
                        key={aIdx} 
                        style={{backgroundColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12}}
                      >
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
  // RENDER: APP WRAPPER 
  // ==========================================
  if (appMode === 'COVER') {
    return (
      <View style={{flex: 1, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', padding: isMobile ? 20 : 40}}>
        
        {/* The Clean White Card */}
        <View style={{backgroundColor: '#FFF', padding: isMobile ? 25 : 40, borderRadius: 20, width: '100%', maxWidth: 500, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, elevation: 5}}>
          
          {/* 🚨 TOP CORNER BRANDING */}
          <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10}}>
            <Image 
              source={require('./assets/chirp_logo.png')} 
              style={{
                width: 48,  // Clean, moderate size
                height: 48, 
                resizeMode: 'contain', 
                borderRadius: 12, // Subtly softens the harsh black corners
                marginRight: 15 // Pushes the title text away from the logo
              }} 
            />
            <Text style={{fontSize: 28, fontWeight: '900', color: '#1E293B'}}>Chirp</Text>
          </View>

          {/* Left-aligned to match the corner logo */}
          <Text style={{fontSize: 16, color: '#64748B', marginBottom: 30, textAlign: 'left'}}>
            Where will your journey begin?
          </Text>
          
          {/* Inputs */}
          <View style={{marginBottom: 10, zIndex: 50}}>
            <LiveCityAutocomplete placeholder="Where are you now?" emoji="📍" onLocationSelected={setGlobalOrigin} />
          </View>
          <View style={{marginBottom: 10, zIndex: 40}}>
            <LiveCityAutocomplete placeholder="Where do you want to go?" emoji="✈️" onLocationSelected={setGlobalDest} />
          </View>
          
          <TouchableOpacity 
            style={[styles.mainBtn, {
              marginTop: 20, 
              paddingVertical: 18, 
              backgroundColor: (globalOrigin && globalDest) ? '#0284C7' : '#94A3B8'
            }]} 
            onPress={initializeDashboard} 
            disabled={!globalOrigin || !globalDest}
          >
            <Text style={{color: '#FFF', fontWeight: 'bold', fontSize: 18}}>
              Plan My Trip ➔
            </Text>
          </TouchableOpacity>

        </View>
      </View>
    );
  }

if (isMobile) {
    const mapHeight = isMapCollapsed ? 0 : ((activeTab === 'PLANNER' || activeTab === 'STAYS') ? 180 : 280);
    
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC', flexDirection: 'column' }}>
        
        {/* 🚨 NEW: Mobile Brand Header */}
        <View style={styles.mobileHeader}>
          <Image source={require('./assets/chirp_logo.png')} style={{width: 30, height: 30}} />
          <Text style={styles.mobileHeaderText}>Chirp</Text>
        </View>
        
        {/* THE MAP CONTAINTER */}
        {!isMapCollapsed && (
          <View style={{ width: '100%', height: mapHeight, zIndex: 0, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
            {Platform.OS === 'web' && renderMapComponent()}
          </View>
        )}
        
        {/* 🚨 THE COLLAPSE TOGGLE BAR 🚨 */}
        <TouchableOpacity 
          style={{
            backgroundColor: '#F1F5F9', 
            paddingVertical: 8, 
            alignItems: 'center', 
            borderBottomWidth: 1, 
            borderBottomColor: '#E2E8F0',
            shadowColor: '#000',
            shadowOpacity: 0.05,
            shadowRadius: 3,
            elevation: 2,
            zIndex: 10
          }}
          onPress={() => setIsMapCollapsed(!isMapCollapsed)}
        >
          <Text style={{ fontWeight: '900', color: '#64748B', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
            {isMapCollapsed ? '🗺️ Tap to Show Map' : '🔼 Collapse Map to Read'}
          </Text>
        </TouchableOpacity>

        {/* THE CONTENT AREA */}
        <View style={{ flex: 1, padding: 15 }}>
          {renderContent()}
        </View>

        {/* BOTTOM NAVIGATION */}
        <View style={styles.mobileNavContainer}>
          {renderNavButtons()}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.appContainer}>
      <View style={[styles.leftPane, { width: `${leftWidthPct}%` }]}>
        <View style={styles.sidebar}>
          {/* 🚨 UPDATED: Desktop Brand Header */}
          <View style={{alignItems: 'center', marginBottom: 30}}>
             <Image source={require('./assets/chirp_logo.png')} style={{width: 30, height: 30}} />
             <Text style={styles.logo}>Chirp</Text>
          </View>
          {renderNavButtons()}
        </View>
        <View style={styles.contentArea}>
          {renderContent()}
        </View>
      </View>

      <View {...panResponder.panHandlers} style={styles.resizer}>
        <View style={styles.resizerLine} />
        <View style={styles.resizerLine} />
      </View>

      <View style={styles.rightPane}>
        {Platform.OS === 'web' && renderMapComponent()}
      </View>
    </View>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  // Add these to your StyleSheet:
  mobileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8, // Adds perfect spacing between logo and text
    paddingTop: Platform.OS === 'ios' ? 40 : 12, // Respects the iPhone notch
  },
  mobileHeaderText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1E293B',
    letterSpacing: -0.5,
  },
  logo: { 
    fontSize: 14, 
    fontWeight: '900', 
    color: '#0284C7', // Changed from Green
    marginTop: 5, 
    textAlign: 'center',
    letterSpacing: -0.5 
  },

  appContainer: { flex: 1, flexDirection: 'row', backgroundColor: '#F8FAFC' },
  leftPane: { flexDirection: 'row', backgroundColor: '#FFF' },
  
  resizer: { 
    width: 14, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', 
    cursor: 'col-resize', borderRightWidth: 1, borderRightColor: '#E2E8F0', 
    borderLeftWidth: 1, borderLeftColor: '#E2E8F0', zIndex: 100 
  },
  resizerLine: { 
    width: 2, height: 18, backgroundColor: '#CBD5E1', marginVertical: 1, borderRadius: 1 
  },

  sidebar: { 
    width: 80, borderRightWidth: 1, borderRightColor: '#E2E8F0', 
    alignItems: 'center', paddingTop: 20, backgroundColor: '#F1F5F9' 
  },
  
  navItem: { 
    padding: 15, alignItems: 'center', marginBottom: 10, borderRadius: 10, width: 60 
  },
  navItemActive: { 
    backgroundColor: '#E0F2FE'
  },
  navText: { 
    fontSize: 10, color: '#666', marginTop: 5 
  },
  navTextActive: { 
    color: '#0284C7', fontWeight: 'bold' 
  },
  
  mobileNavContainer: { 
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', 
    backgroundColor: '#FFF', paddingBottom: Platform.OS === 'ios' ? 20 : 10, 
    paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0', 
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, 
    shadowOpacity: 0.05, shadowRadius: 5 
  },
  mobileNavItem: { 
    padding: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' 
  },
  
  contentArea: { 
    flex: 1, padding: 25 
  },
  tabContent: { 
    flex: 1 
  },
  header: { 
    fontSize: 28, fontWeight: 'bold', color: '#1E293B', marginBottom: 5 
  },
  
  rightPane: { 
    flex: 1, backgroundColor: '#E2E8F0' 
  },
  
  inputBox: { 
    flexDirection: 'row', backgroundColor: '#F1F5F9', padding: 15, 
    borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' 
  },
  input: { 
    flex: 1, outlineStyle: 'none', color: '#1E293B', fontSize: 16 
  },
  dropdown: { 
    position: 'absolute', top: 60, left: 0, right: 0, backgroundColor: '#FFF', 
    borderRadius: 8, maxHeight: 200, elevation: 5, shadowColor: '#000', 
    shadowOpacity: 0.1, shadowRadius: 10 
  },
  dropdownItem: { 
    padding: 15, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' 
  },
  
  mainBtn: { 
    backgroundColor: '#0284C7', padding: 15, borderRadius: 10, 
    alignItems: 'center', marginTop: 10 
  },
  btnText: { 
    color: 'white', fontWeight: 'bold', fontSize: 16 
  },
  
  card: { 
    backgroundColor: '#FFF', padding: 20, borderRadius: 12, marginBottom: 15, 
    borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', 
    shadowOpacity: 0.05, shadowRadius: 5 
  },
  cardTitle: { 
    fontSize: 18, fontWeight: 'bold', color: '#1E293B', marginTop: 5 
  },
  linkBtn: { 
    marginTop: 15, padding: 10, borderRadius: 8, borderWidth: 1, 
    borderColor: '#0284C7', // Changed from Green
    backgroundColor: '#F0F9FF'
  }
});