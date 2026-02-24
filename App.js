import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Platform, createElement, Linking } from 'react-native';
import { searchFlights } from './utils/amadeus'; 
import ItineraryPlanner from './ItineraryPlanner'; // Make sure the path matches where you saved it!

const GEMINI_API_KEY = '';

// --- HELPER FUNCTIONS ---
const formatTime = (isoString) => new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
const parseDuration = (ptString) => ptString.replace('PT', '').replace('H', 'h ').replace('M', 'm').toLowerCase();
const parseDurationToMinutes = (ptString) => {
  let hours = 0, minutes = 0;
  const hMatch = ptString.match(/(\d+)H/);
  const mMatch = ptString.match(/(\d+)M/);
  if (hMatch) hours = parseInt(hMatch[1] || 0);
  if (mMatch) minutes = parseInt(mMatch[1] || 0);
  return hours * 60 + minutes;
};
const getLayoverString = (segments) => {
  if (segments.length === 1) return "Non-stop direct flight.";
  const layovers = segments.slice(0, -1).map(s => s.arrival.iataCode);
  return `Connecting flight with layover(s) in ${layovers.join(', ')}.`;
};
const getMapsLink = (start, end) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(start)}&destination=${encodeURIComponent(end)}&travelmode=transit`;

const getCarbonEquivalency = (kg) => {
  const trees = Math.max(1, Math.round(kg / 25));
  const phones = Math.round(kg / 0.008).toLocaleString();
  return `Requires ${trees} mature trees 🌳 a full year to absorb (or charging ${phones} smartphones 📱)`;
};

// --- 1. LIVE LOCATION AUTOCOMPLETE ---
const LiveCityAutocomplete = ({ placeholder, onLocationSelected }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (query.length > 2) {
      const delayDebounceFn = setTimeout(async () => {
        try {
          const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=4&format=json`);
          const data = await res.json();
          setResults(data.results || []);
          setShowDropdown(true);
        } catch (error) { console.error("Map Error:", error); }
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    } else setShowDropdown(false);
  }, [query]);

  const handleSelect = (place) => {
    setQuery(place.name); 
    onLocationSelected(place.name); 
    setTimeout(() => setShowDropdown(false), 100); 
  };

  return (
    <View style={[styles.autocompleteContainer, { zIndex: showDropdown ? 1000 : 1 }]}>
      <TextInput
        style={styles.input} placeholder={placeholder} value={query} onChangeText={setQuery}
        onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)} 
      />
      {showDropdown && results.length > 0 && (
        <ScrollView style={styles.dropdown} keyboardShouldPersistTaps="handled">
          {results.map((place, index) => (
            <TouchableOpacity key={index} style={styles.dropdownItem} onPress={() => handleSelect(place)}>
              <Text style={styles.dropdownText}>{place.name}, {place.country}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

// --- 2. HTML5 CALENDAR ---
const WebDatePicker = ({ date, setDate }) => {
  if (Platform.OS === 'web') {
    return createElement('input', {
      type: 'date', value: date, onChange: (e) => setDate(e.target.value),
      style: { padding: '14px', borderRadius: '8px', border: '1px solid #DDD', marginBottom: '10px', fontSize: '16px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
    });
  }
  return <TextInput style={styles.input} placeholder="Date" value={date} onChangeText={setDate} />;
};

// --- 3. MAIN APP LOGIC ---
export default function App() {
  const [screen, setScreen] = useState('LAUNCHPAD'); 
  const [originCity, setOriginCity] = useState('');
  const [destinationCity, setDestinationCity] = useState('');
  const [date, setDate] = useState('');
  
  // NEW STATE: Arrival Time Preference
  const [arrivePref, setArrivePref] = useState('Anytime'); 
  
  const [loadingText, setLoadingText] = useState('');
  const [routeOptions, setRouteOptions] = useState([]); 
  const [selectedRoute, setSelectedRoute] = useState(null); 
  const [cityCache, setCityCache] = useState({}); 
  const [sortBy, setSortBy] = useState('eco'); 

  const handleSearch = async () => {
    if (!originCity || !destinationCity || !date) return alert("Fill all fields.");
    setScreen('PROCESSING');
    
    try {
      setLoadingText('Locating transport hubs...');
      let originIATA = cityCache[originCity];
      let destIATA = cityCache[destinationCity];

      if (!originIATA || !destIATA) {
        const promptIATA = `Return ONLY a JSON object with the 3-letter IATA codes for the nearest MASSIVE INTERNATIONAL HUB airports to: Location 1: ${originCity}, Location 2: ${destinationCity}. Format: {"origin": "CODE", "destination": "CODE"}`;
        const resIATA = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: promptIATA }] }], generationConfig: { responseMimeType: "application/json" } })
        });
        const dataIATA = await resIATA.json();
        const codes = JSON.parse(dataIATA.candidates[0].content.parts[0].text);
        originIATA = codes.origin; destIATA = codes.destination;
        setCityCache(prev => ({ ...prev, [originCity]: originIATA, [destinationCity]: destIATA }));
      }

      // --- STAGE 2: THE REGIONAL BYPASS ---
      if (originIATA === destIATA) {
        setLoadingText(`Finding regional options arriving in the ${arrivePref}...`);
        const promptRegional = `
          User travels from ${originCity} to ${destinationCity}. PREFERRED ARRIVAL: ${arrivePref}.
          Search internet for Bus, Train, or Ferry. 
          Return an ARRAY of 3 distinct options, prioritizing schedules that arrive ${arrivePref === 'Anytime' ? 'throughout the day' : `in the ${arrivePref}`}.
          STRICT: Return JSON ARRAY ONLY. Format: [ { "provider": "Train Express", "price": 15, "co2": 10, "url": "https://12go.asia", "duration": "1h", "durationMins": 60, "depTime": "09:00 AM", "arrTime": "10:30 AM" }, ... ]
        `;
        const resReg = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: promptRegional }] }], tools: [{ googleSearch: {} }], generationConfig: { responseMimeType: "application/json" } })
        });
        const dataReg = await resReg.json();
        
        let regionalArray = [
          { provider: "Morning Bus", price: 12, co2: 6, url: "https://12go.asia", duration: "1h 30m", durationMins: 90, depTime: "08:00 AM", arrTime: "09:30 AM" },
          { provider: "Afternoon Train", price: 15, co2: 4, url: "https://12go.asia", duration: "1h 15m", durationMins: 75, depTime: "01:00 PM", arrTime: "02:15 PM" }
        ];

        if (resReg.ok && dataReg?.candidates?.[0]?.content?.parts?.[0]?.text) {
          try {
            const parsed = JSON.parse(dataReg.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/gi, '').trim());
            if (Array.isArray(parsed) && parsed.length > 0) regionalArray = parsed;
          } catch(e) {}
        }

        const finalRoutes = regionalArray.map(opt => ({ type: 'GROUND_ONLY', directGround: opt, totals: { price: opt.price, co2: opt.co2 } }));
        const minCo2 = Math.min(...finalRoutes.map(r => r.totals.co2));
        finalRoutes.forEach(r => { if (r.totals.co2 === minCo2) r.isEcoChampion = true; });

        setRouteOptions(finalRoutes);
        return setScreen('ROUTE_SELECTION'); 
      }

      // --- STAGE 3: THE PURE OVERLAND ALGORITHM ---
      setLoadingText('Algorithmic check: Is a pure Overland chain possible?...');
      let overlandRoute = null;
      try {
        const promptOverland = `
          User travels from ${originCity} to ${destinationCity} via GROUND TRANSPORT ONLY. PREFERRED ARRIVAL: ${arrivePref}.
          If it involves crossing an ocean, return {"possible": false}.
          If possible, build the chain arriving ${arrivePref === 'Anytime' ? 'at a reasonable time' : `in the ${arrivePref}`}. Return JSON ONLY.
          Format: { "possible": true, "provider": "Multi-Stop Train Chain", "price": 120, "co2": 25, "duration": "24h", "durationMins": 1470, "depTime": "08:00 AM", "arrTime": "08:30 AM (+1)", "layoverDesc": "Scenic route via transit hubs.", "url": "https://12go.asia" }
        `;
        const resOverland = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: promptOverland }] }], tools: [{ googleSearch: {} }], generationConfig: { responseMimeType: "application/json" } })
        });
        const dataOverland = await resOverland.json();
        const parsedOverland = JSON.parse(dataOverland.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/gi, '').trim());
        
        if (parsedOverland.possible) {
          overlandRoute = { type: 'OVERLAND_CHAIN', directGround: parsedOverland, totals: { price: parsedOverland.price, co2: parsedOverland.co2 } };
        }
      } catch (e) {}

      // --- STAGE 4: FETCH FLIGHTS & STITCH ---
      setLoadingText(`Finding flights...`);
      const realFlights = await searchFlights(originIATA, destIATA, date);
      let finalRoutes = [];

      if (realFlights && realFlights.length > 0) {
        // Simple local filter to prioritize flights matching arrival preference if possible
        let filteredFlights = realFlights;
        if (arrivePref !== 'Anytime') {
            filteredFlights = realFlights.sort((a, b) => {
                const hourA = new Date(a.itineraries[0].segments[a.itineraries[0].segments.length - 1].arrival.at).getHours();
                const hourB = new Date(b.itineraries[0].segments[b.itineraries[0].segments.length - 1].arrival.at).getHours();
                const targetMatch = (h) => {
                    if (arrivePref === 'Morning' && h >= 0 && h < 12) return 1;
                    if (arrivePref === 'Afternoon' && h >= 12 && h < 18) return 1;
                    if (arrivePref === 'Evening' && h >= 18) return 1;
                    return 0;
                };
                return targetMatch(hourB) - targetMatch(hourA);
            });
        }

        const parsedFlights = filteredFlights.slice(0, 3).map((flight) => {
          const it = flight.itineraries[0];
          const segments = it.segments;
          return {
            id: flight.id, originIATA, destIATA, airline: segments[0].carrierCode, price: parseFloat(flight.price.total), co2: Math.floor(parseFloat(flight.price.total) * 0.85),
            isDirect: segments.length === 1, stops: segments.length - 1, depTime: formatTime(segments[0].departure.at), arrTime: formatTime(segments[segments.length - 1].arrival.at), 
            duration: parseDuration(it.duration), durationMins: parseDurationToMinutes(it.duration), layoverDesc: getLayoverString(segments),
            url: `https://www.skyscanner.net/transport/flights/${originIATA.toLowerCase()}/${destIATA.toLowerCase()}/${date.replace(/-/g, '').substring(2)}`
          };
        });

        setLoadingText('Stitching local transit to flight terminals...');
        const promptMaster = `User travels from ${originCity} to ${destinationCity}. Provide transport from ${originCity} to departure airport, and arrival to ${destinationCity}. Return JSON ARRAY of 3 objects. Format: [ { "firstMile": { "provider": "Train", "price": 10, "co2": 5, "url": "link" }, "lastMile": { "provider": "Ferry", "price": 15, "co2": 8, "url": "link" } }, ... ]`;
        
        let aiGroundOptions = [{}, {}, {}];
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: promptMaster }] }], generationConfig: { responseMimeType: "application/json" } })
          });
          const data = await response.json();
          aiGroundOptions = JSON.parse(data.candidates[0].content.parts[0].text.replace(/```json/gi, '').replace(/```/gi, '').trim());
        } catch (err) {
          aiGroundOptions = parsedFlights.map(() => ({
            firstMile: originCity !== originIATA ? { provider: "Local Transit Estimate", price: 15, co2: 8, url: "https://12go.asia" } : null,
            lastMile: destinationCity !== destIATA ? { provider: "Local Transit Estimate", price: 15, co2: 8, url: "https://12go.asia" } : null,
          }));
        }

        finalRoutes = parsedFlights.map((flight, idx) => {
          const first = aiGroundOptions[idx]?.firstMile || null;
          const last = aiGroundOptions[idx]?.lastMile || null;
          if(first) first.url = `https://12go.asia/en/travel/${originCity.toLowerCase().replace(' ', '-')}/${originIATA.toLowerCase()}?date=${date}`;
          if(last) last.url = `https://12go.asia/en/travel/${destIATA.toLowerCase()}/${destinationCity.toLowerCase().replace(' ', '-')}?date=${date}`;
          return {
            type: 'MULTI_MODAL', flight, firstMile: first, lastMile: last,
            totals: { price: flight.price + (first?.price || 0) + (last?.price || 0), co2: flight.co2 + (first?.co2 || 0) + (last?.co2 || 0) }
          };
        });
      }

      if (overlandRoute) finalRoutes.push(overlandRoute);
      const minCo2 = Math.min(...finalRoutes.map(r => r.totals.co2));
      finalRoutes.forEach(r => { if (r.totals.co2 === minCo2) r.isEcoChampion = true; });

      setRouteOptions(finalRoutes);
      setScreen('ROUTE_SELECTION'); 

    } catch (error) {
      alert(error.message); setScreen('LAUNCHPAD');
    }
  };

  const getSortedRoutes = () => {
    let sorted = [...routeOptions];
    if (sortBy === 'price') sorted.sort((a, b) => a.totals.price - b.totals.price);
    if (sortBy === 'eco') sorted.sort((a, b) => a.totals.co2 - b.totals.co2);
    if (sortBy === 'speed') sorted.sort((a, b) => {
      const durA = (a.type === 'GROUND_ONLY' || a.type === 'OVERLAND_CHAIN') ? a.directGround.durationMins : a.flight.durationMins;
      const durB = (b.type === 'GROUND_ONLY' || b.type === 'OVERLAND_CHAIN') ? b.directGround.durationMins : b.flight.durationMins;
      return durA - durB;
    });
    return sorted;
  };

  // --- SCREEN RENDERING ---
  if (screen === 'PROCESSING') {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2E8B57" />
        <Text style={styles.loadingText}>{loadingText}</Text>
      </View>
    );
  }

  if (screen === 'ROUTE_SELECTION') {
    const displayedRoutes = getSortedRoutes();
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.header}>Select a Journey</Text>
        
        <View style={styles.filterBar}>
          <TouchableOpacity style={sortBy === 'eco' ? styles.filterBtnActive : styles.filterBtn} onPress={() => setSortBy('eco')}><Text style={sortBy === 'eco' ? styles.filterTextActive : styles.filterText}>🍃 Eco-Friendly</Text></TouchableOpacity>
          <TouchableOpacity style={sortBy === 'price' ? styles.filterBtnActive : styles.filterBtn} onPress={() => setSortBy('price')}><Text style={sortBy === 'price' ? styles.filterTextActive : styles.filterText}>Cheapest</Text></TouchableOpacity>
          <TouchableOpacity style={sortBy === 'speed' ? styles.filterBtnActive : styles.filterBtn} onPress={() => setSortBy('speed')}><Text style={sortBy === 'speed' ? styles.filterTextActive : styles.filterText}>Fastest</Text></TouchableOpacity>
        </View>
        
        {displayedRoutes.map((route, idx) => (
          <TouchableOpacity key={idx} style={[styles.card, route.isEcoChampion ? styles.ecoChampionCard : null]} onPress={() => { setSelectedRoute(route); setScreen('DASHBOARD'); }}>
            {route.isEcoChampion && <Text style={styles.ecoBadge}>👑 Eco-Champion Option</Text>}
            <View style={styles.metricsRow}>
              <Text style={styles.cardTitle}>Option {idx + 1} {route.type === 'OVERLAND_CHAIN' ? "(Pure Ground)" : ""}</Text>
              <Text style={styles.cardHighlight}>${route.totals.price.toFixed(2)}</Text>
            </View>
            
            {(route.type === 'GROUND_ONLY' || route.type === 'OVERLAND_CHAIN') ? (
              <>
                <Text style={styles.timelineText}>🚌/🚆 {route.directGround.provider}</Text>
                <Text style={styles.cardBody}>⏱️ {route.directGround.depTime} ➔ {route.directGround.arrTime} ({route.directGround.duration})</Text>
                {route.directGround.layoverDesc && <Text style={styles.ratingText}>{route.directGround.layoverDesc}</Text>}
              </>
            ) : (
              <>
                <Text style={styles.timelineText}>{route.firstMile ? '🚌 Local ' : ''}➔ ✈️ Flight ➔ {route.lastMile ? '🚆 Local' : ''}</Text>
                <Text style={styles.cardBody}>Flight: {route.flight.depTime} ➔ {route.flight.arrTime} ({route.flight.duration})</Text>
                <Text style={styles.ratingText}>{route.flight.layoverDesc}</Text>
              </>
            )}
            
            <Text style={styles.carbonText}>Footprint: {route.totals.co2}kg CO2</Text>
            <Text style={styles.actionText}>Review & Book ➔</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.primaryButton, {backgroundColor: '#555'}]} onPress={() => setScreen('LAUNCHPAD')}><Text style={styles.buttonText}>Back</Text></TouchableOpacity>
      </ScrollView>
    );
  }

  if (screen === 'DASHBOARD' && selectedRoute) {
    const isGround = selectedRoute.type === 'GROUND_ONLY' || selectedRoute.type === 'OVERLAND_CHAIN';
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Trip Total</Text>
          <Text style={styles.summaryPrice}>${selectedRoute.totals.price.toFixed(2)}</Text>
          <Text style={styles.summaryCarbon}>Total Footprint: {selectedRoute.totals.co2}kg CO2</Text>
        </View>
        
        {/* NEW BUTTON: Transitions to the Itinerary Planner */}
        <TouchableOpacity 
          style={[styles.primaryButton, {backgroundColor: '#10B981', marginBottom: 10}]} 
          onPress={() => setScreen('ITINERARY')}
        >
          <Text style={styles.buttonText}>Plan My Days in {destinationCity} ➔</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.primaryButton, {backgroundColor: '#555'}]} onPress={() => setScreen('ROUTE_SELECTION')}>
          <Text style={styles.buttonText}>Back to Transport Options</Text>
        </TouchableOpacity>

        

        {isGround ? (
            <View style={[styles.card, styles.groundCard]}>
                <Text style={styles.cardTitle}>🚌/🚆 Pure Ground Transit</Text>
                <Text style={styles.cardBody}>{originCity} ➔ {destinationCity}</Text>
                <Text style={styles.cardBody}>⏱️ {selectedRoute.directGround.depTime} ➔ {selectedRoute.directGround.arrTime} ({selectedRoute.directGround.duration})</Text>
                <Text style={styles.cardBody}>Provider: {selectedRoute.directGround.provider}</Text>
                <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(getMapsLink(originCity, destinationCity))}><Text style={styles.linkText}>🗺️ View Route on Google Maps</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.linkButton, {marginTop: 10, backgroundColor: '#FFF'}]} onPress={() => Linking.openURL(selectedRoute.directGround.url)}><Text style={styles.linkText}>Search Tickets on 12Go</Text></TouchableOpacity>
            </View>
        ) : (
          <>
            {selectedRoute.firstMile && (
              <View style={[styles.card, styles.groundCard]}>
                <Text style={styles.cardTitle}>🚌 First Mile</Text>
                <Text style={styles.cardBody}>{originCity} ➔ Airport</Text>
                <View style={styles.metricsRow}>
                  <Text style={styles.cardHighlight}>${selectedRoute.firstMile.price}</Text>
                  <Text style={styles.carbonText}>🌱 {selectedRoute.firstMile.co2}kg CO2</Text>
                </View>
                <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(getMapsLink(originCity, selectedRoute.flight.originIATA + " Airport"))}><Text style={styles.linkText}>🗺️ Maps Link</Text></TouchableOpacity>
                {/* RESTORED BOOKING LINK */}
                <TouchableOpacity style={[styles.linkButton, {marginTop: 10, backgroundColor: '#FFF'}]} onPress={() => Linking.openURL(selectedRoute.firstMile.url)}><Text style={styles.linkText}>Search Ground Tickets</Text></TouchableOpacity>
              </View>
            )}
            
            <View style={styles.card}>
              <Text style={styles.cardTitle}>✈️ The Flight</Text>
              <Text style={styles.cardBody}>⏱️ {selectedRoute.flight.depTime} ➔ {selectedRoute.flight.arrTime} ({selectedRoute.flight.duration})</Text>
              <Text style={styles.ratingText}>{selectedRoute.flight.layoverDesc}</Text>
              <View style={styles.metricsRow}>
                  <Text style={styles.cardHighlight}>${selectedRoute.flight.price}</Text>
                  <Text style={styles.carbonText}>☁️ {selectedRoute.flight.co2}kg CO2</Text>
              </View>
              <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(selectedRoute.flight.url)}><Text style={styles.linkText}>Search Flight</Text></TouchableOpacity>
            </View>

            {selectedRoute.lastMile && (
              <View style={[styles.card, styles.groundCard]}>
                <Text style={styles.cardTitle}>🚆 Last Mile</Text>
                <Text style={styles.cardBody}>Airport ➔ {destinationCity}</Text>
                <View style={styles.metricsRow}>
                  <Text style={styles.cardHighlight}>${selectedRoute.lastMile.price}</Text>
                  <Text style={styles.carbonText}>🌱 {selectedRoute.lastMile.co2}kg CO2</Text>
                </View>
                <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(getMapsLink(selectedRoute.flight.destIATA + " Airport", destinationCity))}><Text style={styles.linkText}>🗺️ Maps Link</Text></TouchableOpacity>
                {/* RESTORED BOOKING LINK */}
                <TouchableOpacity style={[styles.linkButton, {marginTop: 10, backgroundColor: '#FFF'}]} onPress={() => Linking.openURL(selectedRoute.lastMile.url)}><Text style={styles.linkText}>Search Ground Tickets</Text></TouchableOpacity>
              </View>
            )}
          </>
        )}
        
        <TouchableOpacity style={[styles.primaryButton, {backgroundColor: '#555', marginTop: 20}]} onPress={() => setScreen('ROUTE_SELECTION')}><Text style={styles.buttonText}>Back to Options</Text></TouchableOpacity>
      </ScrollView>
    );
  }

  if (screen === 'ITINERARY') {
    return (
      <View style={{ flex: 1, width: '100%' }}>
        {/* We pass your dynamic destinationCity directly into the component! */}
        <ItineraryPlanner destination={destinationCity} />
        
        {/* A back button so they don't get stuck */}
        <TouchableOpacity 
          style={{ padding: 15, backgroundColor: '#555', alignItems: 'center' }} 
          onPress={() => setScreen('DASHBOARD')}
        >
          <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Back to Transport Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // VIEW: LAUNCHPAD
  return (
    <View style={styles.centerContainer}>
      <Text style={styles.header}>SoJourner</Text>
      <Text style={styles.subHeader}>Sustainable Travel Network</Text>
      
      <View style={styles.inputContainer}>
        <View style={{ zIndex: 3, elevation: 3 }}><LiveCityAutocomplete placeholder="Origin" onLocationSelected={setOriginCity} /></View>
        <View style={{ zIndex: 2, elevation: 2 }}><LiveCityAutocomplete placeholder="Destination" onLocationSelected={setDestinationCity} /></View>
        <View style={{ zIndex: 1, elevation: 1 }}><WebDatePicker date={date} setDate={setDate} /></View>
        
        {/* NEW UX: Arrival Time Segmented Control */}
        <Text style={styles.timeLabel}>Preferred Arrival Time:</Text>
        <View style={styles.timeSelector}>
          {['Anytime', 'Morning', 'Afternoon', 'Evening'].map(time => (
            <TouchableOpacity 
              key={time} 
              onPress={() => setArrivePref(time)} 
              style={arrivePref === time ? styles.timeBtnActive : styles.timeBtn}
            >
              <Text style={arrivePref === time ? styles.timeTextActive : styles.timeText}>{time}</Text>
            </TouchableOpacity>
          ))}
        </View>

      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={handleSearch}><Text style={styles.buttonText}>Find Eco-Routes</Text></TouchableOpacity>
    </View>
  );
}

// --- 4. STYLES ---
const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#F5F7FA', justifyContent: 'center' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F7FA', padding: 20 },
  header: { fontSize: 32, fontWeight: 'bold', color: '#2E8B57', marginBottom: 5, textAlign: 'center' },
  subHeader: { fontSize: 16, color: '#666', marginBottom: 30, textAlign: 'center' },
  inputContainer: { width: '100%', maxWidth: 400, marginBottom: 20 },
  autocompleteContainer: { position: 'relative' },
  dropdown: { position: 'absolute', top: 55, left: 0, right: 0, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDD', borderRadius: 8, maxHeight: 180, elevation: 5 },
  dropdownItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  dropdownText: { fontSize: 14, color: '#333' },
  input: { backgroundColor: '#FFF', padding: 15, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#DDD', fontSize: 16 },
  primaryButton: { backgroundColor: '#2E8B57', padding: 15, borderRadius: 8, width: '100%', maxWidth: 400, alignItems: 'center', alignSelf: 'center' },
  buttonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  loadingText: { marginTop: 20, fontSize: 16, color: '#555', fontStyle: 'italic', textAlign: 'center' },
  card: { backgroundColor: '#FFF', padding: 20, borderRadius: 12, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  ecoChampionCard: { borderColor: '#10B981', borderWidth: 3, backgroundColor: '#F0FDF4' },
  ecoBadge: { backgroundColor: '#10B981', color: '#FFF', fontWeight: 'bold', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  groundCard: { borderColor: '#2E8B57', borderWidth: 2 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 5, color: '#333' },
  cardBody: { fontSize: 16, color: '#555', marginBottom: 5 },
  timelineText: { fontSize: 16, fontWeight: '600', color: '#555', marginVertical: 8, backgroundColor: '#E8F5E9', padding: 8, borderRadius: 5, textAlign: 'center' },
  ratingText: { fontSize: 14, color: '#D97706', fontStyle: 'italic', marginBottom: 10 },
  actionText: { fontSize: 14, fontWeight: 'bold', color: '#2E8B57', marginTop: 10, textAlign: 'right' },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 5 },
  cardHighlight: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  carbonText: { fontSize: 16, fontWeight: 'bold', color: '#10B981' },
  linkButton: { backgroundColor: '#E8F5E9', padding: 12, borderRadius: 6, alignItems: 'center', borderWidth: 1, borderColor: '#A5D6A7', marginTop: 10 },
  linkText: { color: '#2E8B57', fontWeight: 'bold', fontSize: 16 },
  summaryBox: { backgroundColor: '#2E8B57', padding: 20, borderRadius: 12, marginBottom: 20, alignItems: 'center' },
  summaryTitle: { fontSize: 22, fontWeight: 'bold', color: '#FFF', marginBottom: 10 },
  summaryCarbon: { fontSize: 16, color: '#E8F5E9', fontWeight: '600', textAlign: 'center', lineHeight: 24 },
  filterBar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20, gap: 10 },
  filterBtn: { backgroundColor: '#E8F5E9', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, borderWidth: 1, borderColor: '#A5D6A7' },
  filterBtnActive: { backgroundColor: '#2E8B57', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, borderWidth: 1, borderColor: '#2E8B57' },
  filterText: { color: '#2E8B57', fontWeight: 'bold', fontSize: 14 },
  filterTextActive: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  
  // New Time Selector Styles
  timeLabel: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 8, marginLeft: 5 },
  timeSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  timeBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDD' },
  timeBtnActive: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#2E8B57', borderWidth: 1, borderColor: '#2E8B57' },
  timeText: { fontSize: 12, color: '#555', fontWeight: 'bold' },
  timeTextActive: { fontSize: 12, color: '#FFF', fontWeight: 'bold' }
});