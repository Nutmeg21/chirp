import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ItineraryPlanner({ destination }) {
  // 1. User Preferences State
  const [duration, setDuration] = useState('3');
  const [budget, setBudget] = useState('Backpacker ($)');
  const [pax, setPax] = useState('2');
  const [interests, setInterests] = useState('Hidden gems, street food');
  const [diet, setDiet] = useState('Halal');
  
  // 2. Engine State
  const [loading, setLoading] = useState(false);
  const [itinerary, setItinerary] = useState(null);

  const generatePlan = async () => {
    setLoading(true);
    setItinerary(null);
    
    // 🚨 INSERT YOUR GEMINI API KEY HERE 🚨
    const GEMINI_API_KEY = '';

    // The Master Prompt: Forcing Gemini to output strict JSON with the Budget Comparison
    const prompt = `
      Act as a budget-conscious local travel expert. Create a ${duration}-day itinerary for ${pax} people visiting ${destination}.
      Budget Level: ${budget}. 
      Interests: ${interests}. 
      Dietary Restrictions: ${diet}.

      Rules:
      1. Focus on local gems, free activities, and cheap transit. Do NOT just list the top 10 tourist traps.
      2. Ensure all food recommendations strictly follow the "${diet}" dietary restriction.
      3. Output ONLY a raw, valid JSON array. No markdown, no conversational text.

      JSON Format strictly required:
      [
        {
          "day": 1,
          "title": "Theme of the day",
          "activities": [
            {
              "time": "09:00",
              "name": "Name of place",
              "type": "Food/Sight/Transit",
              "desc": "Short compelling description.",
              "tag": "e.g., Halal / Free / Nature",
              "touristTrap": "Name of an expensive alternative ($30)",
              "localAlternative": "Cost of this local gem ($5)",
              "savings": 25
            }
          ]
        }
      ]
    `;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      const data = await response.json();
      let aiText = data.candidates[0].content.parts[0].text;
      
      // Strip out markdown formatting if Gemini disobeys the "raw JSON" rule
      aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      setItinerary(JSON.parse(aiText));
    } catch (error) {
      console.error("Gemini API Error:", error);
      alert("Failed to generate plan. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Planning: {destination}</Text>

      {/* The Dynamic Form */}
      <View style={styles.formCard}>
        <View style={styles.row}>
          <TextInput style={[styles.input, {flex: 1}]} placeholder="Days" value={duration} onChangeText={setDuration} keyboardType="numeric" />
          <TextInput style={[styles.input, {flex: 1, marginLeft: 10}]} placeholder="People" value={pax} onChangeText={setPax} keyboardType="numeric" />
        </View>
        <TextInput style={styles.input} placeholder="Budget ($ / $$ / $$$)" value={budget} onChangeText={setBudget} />
        <TextInput style={styles.input} placeholder="Diet (Halal, Vegan, None)" value={diet} onChangeText={setDiet} />
        <TextInput style={styles.input} placeholder="Interests (e.g. History, Markets)" value={interests} onChangeText={setInterests} />
        
        <TouchableOpacity style={styles.mainBtn} onPress={generatePlan} disabled={loading}>
          {loading ? <ActivityIndicator color="black" /> : <Text style={styles.btnText}>Consult AI Agents</Text>}
        </TouchableOpacity>
      </View>

      {/* The Rendered Itinerary */}
      <ScrollView style={{marginTop: 20}}>
        {itinerary && itinerary.map((day, dIdx) => (
          <View key={dIdx} style={{marginBottom: 25}}>
            <Text style={styles.dayHeader}>Day {day.day}: {day.title}</Text>
            
            {day.activities.map((act, aIdx) => (
              <View key={aIdx} style={styles.activityCard}>
                <View style={styles.timeTag}>
                  <Text style={styles.timeText}>{act.time}</Text>
                </View>
                
                <View style={{padding: 15}}>
                  <View style={styles.titleRow}>
                    <Text style={styles.actName}>{act.name}</Text>
                    <View style={styles.badge}><Text style={styles.badgeText}>{act.tag}</Text></View>
                  </View>
                  
                  <Text style={styles.descText}>{act.desc}</Text>

                  {/* The Budget "Tourist Trap" Comparison UI */}
                  {act.savings > 0 && (
                    <View style={styles.savingsBox}>
                      <Text style={styles.strikeText}>Avoid: {act.touristTrap}</Text>
                      <Text style={styles.saveText}>Local Cost: {act.localAlternative}</Text>
                      <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 5}}>
                        <Ionicons name="trending-down" size={16} color="#00FFC2" style={{marginRight: 5}} />
                        <Text style={styles.saveAmount}>Saved ${act.savings}</Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808', padding: 20 },
  header: { fontSize: 24, fontWeight: 'bold', color: 'white', marginBottom: 15 },
  formCard: { backgroundColor: '#1E1E1E', padding: 15, borderRadius: 12 },
  row: { flexDirection: 'row', marginBottom: 10 },
  input: { backgroundColor: '#111', color: 'white', padding: 12, borderRadius: 8, marginBottom: 10, outlineStyle: 'none' },
  mainBtn: { backgroundColor: '#00E5E5', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 5 },
  btnText: { color: 'black', fontWeight: 'bold', fontSize: 16 },
  dayHeader: { fontSize: 20, color: '#635BFF', fontWeight: 'bold', marginBottom: 15 },
  activityCard: { backgroundColor: '#1E1E1E', borderRadius: 12, marginBottom: 15, overflow: 'hidden' },
  timeTag: { backgroundColor: '#333', paddingVertical: 5, paddingHorizontal: 15 },
  timeText: { color: '#00E5E5', fontWeight: 'bold' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  actName: { color: 'white', fontSize: 18, fontWeight: 'bold', flex: 1 },
  badge: { backgroundColor: '#262626', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, borderWidth: 1, borderColor: '#635BFF' },
  badgeText: { color: '#635BFF', fontSize: 10, fontWeight: 'bold' },
  descText: { color: '#AAA', fontSize: 14, marginBottom: 15 },
  savingsBox: { backgroundColor: 'rgba(0, 255, 194, 0.1)', padding: 10, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: '#00FFC2' },
  strikeText: { color: '#FF4444', textDecorationLine: 'line-through', fontSize: 12 },
  saveText: { color: 'white', fontWeight: 'bold', marginTop: 2, fontSize: 13 },
  saveAmount: { color: '#00FFC2', fontWeight: 'bold', fontSize: 14 }
});