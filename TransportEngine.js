import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// --- HELPER FUNCTIONS (Ported from Python) ---

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c; // Distance in km
};

const deg2rad = (deg) => deg * (Math.PI / 180);

const formatTime = (minutes) => {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
};

export default function TransportEngine({ originCoords, destCoords, destinationName }) {
  const [loading, setLoading] = useState(true);
  const [weather, setWeather] = useState({ temp: '...', condition: 'Loading' });
  const [options, setOptions] = useState([]);
  const [trafficFactor, setTrafficFactor] = useState(1.0);

  useEffect(() => {
    if (originCoords && destCoords) {
      calculateTransportOptions();
    }
  }, [originCoords, destCoords]);

  const calculateTransportOptions = async () => {
    setLoading(true);
    try {
      // 1. Get Real Weather (Open-Meteo API)
      const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${destCoords.lat}&longitude=${destCoords.lng}&current_weather=true`);
      const weatherData = await weatherRes.json();
      
      const temp = weatherData.current_weather.temperature;
      const isRaining = weatherData.current_weather.weathercode >= 51; // WMO code for drizzle/rain
      const weatherMult = isRaining ? 1.6 : 1.0; // Surge pricing if raining

      setWeather({ 
        temp: `${temp}°C`, 
        condition: isRaining ? 'Rainy 🌧️' : 'Clear ☀️' 
      });

      // 2. Calculate Distance & Traffic
      const dist = calculateDistance(originCoords.lat, originCoords.lng, destCoords.lat, destCoords.lng);
      
      // Simulate traffic based on Python logic (Short trips = more traffic congestion per km)
      const tFactor = dist < 20 ? 1.25 : 1.05; 
      setTrafficFactor(tFactor);

      // 3. Define Regional Configs (Malaysia vs Global)
      let config = { currency: 'USD', rides: [] };
      
      if (destinationName.includes("Malaysia") || destinationName.includes("Kuala Lumpur") || destinationName.includes("Penang")) {
        config = {
          currency: 'MYR',
          rides: [
            { name: "GrabCar", base: 5, rate: 1.1, safety: 1, url: "https://www.grab.com/my/" },
            { name: "AirAsia Ride", base: 4, rate: 0.9, safety: 2, url: "https://www.airasia.com/ride/" }
          ]
        };
      } else {
        config = {
          currency: 'USD',
          rides: [
            { name: "Uber X", base: 8, rate: 2.5, safety: 1, url: "https://m.uber.com/ul" },
            { name: "Lyft", base: 7, rate: 2.8, safety: 1, url: "https://www.lyft.com/" }
          ]
        };
      }

      // 4. Generate Options Array
      let computedOptions = [];

      // Ride Hailing Logic
      config.rides.forEach(ride => {
        const cost = (ride.base + (dist * ride.rate)) * tFactor * weatherMult;
        const time = (dist * 2.2 * tFactor); // 2.2 mins per km roughly in city
        const score = (time * 0.5) + (cost * 0.3) + (ride.safety * 10); // AI Scoring Algorithm
        
        computedOptions.push({
          id: ride.name,
          name: ride.name,
          type: 'ride',
          cost: cost.toFixed(2),
          currency: config.currency,
          time: time,
          score: score,
          url: ride.url,
          icon: 'car-sport'
        });
      });

      // Public Transit Logic
      computedOptions.push({
        id: 'transit',
        name: 'Public Transit',
        type: 'transit',
        cost: (2.0 + (dist * 0.15)).toFixed(2),
        currency: config.currency,
        time: (dist * 4.0) + 10, // Slower
        score: 50, // Base score
        url: `https://www.google.com/maps/dir/?api=1&origin=${originCoords.lat},${originCoords.lng}&destination=${destCoords.lat},${destCoords.lng}&travelmode=transit`,
        icon: 'bus'
      });

      // Find "Fastest" and "AI Recommended"
      const minTime = Math.min(...computedOptions.map(o => o.time));
      const minScore = Math.min(...computedOptions.map(o => o.score));

      const finalOptions = computedOptions.map(opt => ({
        ...opt,
        isFastest: opt.time === minTime,
        isRecommended: opt.score === minScore && opt.type !== 'walk'
      })).sort((a, b) => a.score - b.score);

      setOptions(finalOptions);
      setLoading(false);

    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };

  if (loading) return <ActivityIndicator color="#00E5E5" />;

  return (
    <View style={styles.container}>
      {/* Live Context Bar */}
      <View style={styles.contextBar}>
        <Text style={styles.contextText}>{weather.condition} {weather.temp}</Text>
        <Text style={styles.contextText}>🚦 {trafficFactor}x Traffic</Text>
      </View>

      {/* Options List */}
      {options.map((opt) => (
        <TouchableOpacity key={opt.id} style={styles.card} onPress={() => Linking.openURL(opt.url)}>
          <View style={styles.leftCol}>
            <Ionicons name={opt.icon} size={24} color="#00E5E5" />
          </View>
          <View style={styles.centerCol}>
            <View style={styles.titleRow}>
              <Text style={styles.optionName}>{opt.name}</Text>
              {opt.isFastest && <View style={styles.badgeFast}><Text style={styles.badgeText}>FASTEST</Text></View>}
              {opt.isRecommended && <View style={styles.badgeAi}><Text style={styles.badgeText}>AI PICK</Text></View>}
            </View>
            <Text style={styles.details}>{formatTime(opt.time)} • {opt.currency} {opt.cost}</Text>
          </View>
          <TouchableOpacity style={styles.bookBtn} onPress={() => Linking.openURL(opt.url)}>
            <Text style={styles.bookText}>GO</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 10, width: '100%' },
  contextBar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, backgroundColor: '#1E1E1E', padding: 8, borderRadius: 8 },
  contextText: { color: '#FF7E5F', fontWeight: 'bold', fontSize: 12 },
  card: { flexDirection: 'row', backgroundColor: '#262626', marginBottom: 8, borderRadius: 12, padding: 12, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#333' },
  leftCol: { width: 40, alignItems: 'center' },
  centerCol: { flex: 1, paddingHorizontal: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  optionName: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  badgeFast: { backgroundColor: '#00E5E5', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  badgeAi: { backgroundColor: '#635BFF', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: 'black', fontSize: 10, fontWeight: 'bold' },
  details: { color: '#AAA', fontSize: 13 },
  bookBtn: { backgroundColor: '#333', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#00E5E5' },
  bookText: { color: '#00E5E5', fontWeight: 'bold' }
});