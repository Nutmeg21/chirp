import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import ItineraryPlanner from './ItineraryPlanner';


const GEMINI_API_KEY = '';
const WEATHER_API_KEY = '';

export default function LiveTravelController({ destination, preferences, onBack }) {
    const [livePlan, setLivePlan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [weatherData, setWeatherData] = useState(null);
    const [lastSync, setLastSync] = useState(new Date());

    const fetchRealWorldContext = async () => {
        try {
            const wRes = await fetch(
                `https://api.openweathermap.org/data/2.5/weather?q=${destination}&appid=${WEATHER_API_KEY}&units=metric`
            );
            const wJson = await wRes.json();
            
            const trafficPrompt = `What is the current traffic congestion status in ${destination}? Give a 1-sentence summary.`;
            
            const trafficRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: trafficPrompt }] }],
                    tools: [{ googleSearch: {} }] 
                })
            });
            const trafficJson = await trafficRes.json();
            
            //Safety Check for Traffic Data
            const trafficReport = trafficJson?.candidates?.[0]?.content?.parts?.[0]?.text || "Standard traffic flow";
            
            return {
                temp: wJson?.main?.temp ? Math.round(wJson.main.temp) : 25,
                condition: wJson?.weather?.[0]?.main || "Clear",
                traffic: trafficReport
            };
        } catch (e) {
            console.error("Context Fetch Error", e);
            return { temp: 25, condition: "Clear", traffic: "Moderate traffic" };
        }
    };

    const syncItinerary = async () => {
        try {
            const context = await fetchRealWorldContext();
            setWeatherData(context);
            
            const prompt = `
                REAL-TIME DATA: Weather: ${context.condition} (${context.temp}°C). Traffic: ${context.traffic}.
                TRIP: ${destination} for ${preferences.days} days.
                
                TASK: Adjust the itinerary. If it is ${context.condition === 'Rain' ? 'raining' : 'sunny'}, 
                prioritize ${context.condition === 'Rain' ? 'indoor' : 'outdoor'} spots. 
                Re-sequence activities to avoid heavy traffic areas.
                
                Return ONLY a JSON object matching the ItineraryPlanner schema. Do not include markdown formatting.
            `;

            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: "application/json" }
                })
            });

            const data = await res.json();
            const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (aiText) {
                const cleanedJson = aiText.replace(/```json|```/g, "").trim();
                setLivePlan(JSON.parse(cleanedJson));
                setLastSync(new Date());
            }
        } catch (err) {
            console.error("Sync Error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        syncItinerary();
        const interval = setInterval(syncItinerary, 30000); 
        return () => clearInterval(interval);
    }, [destination, preferences]);

    //Handle initial loading state
    if (loading && !livePlan) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#2E8B57" />
                <Text style={styles.loadingText}>Connecting to Live Traffic...</Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
            <View style={styles.liveBar}>
                <View style={styles.trafficIndicator}>
                    <Text style={styles.liveText}>
                        {weatherData?.condition} | {weatherData?.temp}°C
                    </Text>
                    <Text style={styles.trafficText} numberOfLines={1}>
                        {weatherData?.traffic}
                    </Text>
                </View>
                <Text style={styles.syncText}>Last: {lastSync.toLocaleTimeString()}</Text>
            </View>
            
            <ItineraryPlanner 
                destination={destination} 
                preferences={preferences} 
                onBack={onBack} 
                externalPlanData={livePlan} 
            />
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 10, color: '#666' },
    liveBar: { 
        backgroundColor: '#111', 
        padding: 12, 
        flexDirection: 'row', 
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    trafficIndicator: { flex: 1 },
    liveText: { color: '#10B981', fontSize: 11, fontWeight: 'bold' },
    trafficText: { color: '#FFA500', fontSize: 10, marginTop: 2 },
    syncText: { color: '#666', fontSize: 10 }
});