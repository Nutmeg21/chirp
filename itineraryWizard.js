import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated, Dimensions, ScrollView, Platform } from 'react-native';
import Slider from '@react-native-community/slider';

const WIZARD_STEPS = [
  {
    id: 'days',
    question: "How long is your trip?",
    subtitle: "Slide to select the number of days.",
    type: 'slider',
    min: 1,
    max: 14
  },
  {
    id: 'companions',
    question: "Who is traveling?",
    subtitle: "This helps tailor the activity recommendations.",
    type: 'chips',
    options: ['Solo', 'Couple', 'Family (with kids)', 'Friends']
  },
  {
    id: 'budget',
    question: "What is your budget style?",
    subtitle: "Excluding flights and initial transport.",
    type: 'cards',
    options: [
      { label: 'Backpacker', desc: 'Hostels, street food, free sights' },
      { label: 'Moderate', desc: '3-4 star hotels, casual dining' },
      { label: 'Luxury', desc: '5-star, fine dining, private tours' }
    ]
  },
  {
    id: 'pace',
    question: "What pace do you prefer?",
    subtitle: "How packed should your days be?",
    type: 'cards',
    options: [
      { label: 'Relaxed', desc: '1-2 activities a day, plenty of downtime' },
      { label: 'Balanced', desc: 'A good mix of exploring and relaxing' },
      { label: 'Action-Packed', desc: 'See and do as much as possible' }
    ]
  },
  {
    id: 'transport',
    question: "How will you get around?",
    subtitle: "Helps us plan realistic daily routes.",
    type: 'cards',
    options: [
      { label: 'Walking & Public Transit', desc: 'Eco-friendly, local experience' },
      { label: 'Rideshare / Taxi', desc: 'Convenient point-to-point travel' },
      { label: 'Rental Car', desc: 'Maximum flexibility and range' }
    ]
  },
  {
    id: 'interests',
    question: "What are your interests?",
    subtitle: "Select all that apply.",
    type: 'multi-select',
    options: ['History & Culture', 'Food & Culinary', 'Nature & Outdoors', 'Shopping', 'Nightlife', 'Art & Museums', 'Relaxation']
  }
];

export default function ItineraryWizard({ onComplete, onCancel }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [preferences, setPreferences] = useState({
    days: 3,
    companions: 'Solo',
    budget: 'Moderate',
    pace: 'Balanced',
    transport: 'Walking & Public Transit',
    interests: []
  });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(20);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true })
    ]).start();
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete(preferences);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    } else if (onCancel) {
      onCancel();
    }
  };

  const toggleInterest = (interest) => {
    setPreferences(prev => {
      const current = prev.interests;
      if (current.includes(interest)) {
        return { ...prev, interests: current.filter(i => i !== interest) };
      } else {
        return { ...prev, interests: [...current, interest] };
      }
    });
  };

  const stepData = WIZARD_STEPS[currentStep];
  const progressPercent = ((currentStep + 1) / WIZARD_STEPS.length) * 100;

  const isStepValid = () => {
    if (stepData.id === 'interests' && preferences.interests.length === 0) return false;
    return true;
  };

  return (
    <View style={styles.pageWrapper}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.stepIndicator}>Step {currentStep + 1} of {WIZARD_STEPS.length}</Text>
        </View>
        <View style={styles.progressBarBg}>
          <Animated.View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>

        <View style={styles.contentArea}>
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], flex: 1 }}>
            <Text style={styles.questionText}>{stepData.question}</Text>
            <Text style={styles.subtitleText}>{stepData.subtitle}</Text>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              
              {/* SLIDER TYPE (Days) */}
              {stepData.type === 'slider' && (
                <View style={styles.sliderSection}>
                  <View style={styles.daysCircle}>
                    <Text style={styles.daysValue}>{preferences.days}</Text>
                    <Text style={styles.daysLabel}>{preferences.days === 1 ? 'Day' : 'Days'}</Text>
                  </View>
                  <Slider
                    style={styles.slider}
                    minimumValue={stepData.min}
                    maximumValue={stepData.max}
                    step={1}
                    value={preferences.days}
                    onValueChange={(v) => setPreferences({...preferences, days: v})}
                    minimumTrackTintColor="#2E8B57"
                    maximumTrackTintColor="#E5E7EB"
                    thumbTintColor="#2E8B57"
                  />
                  <View style={styles.sliderLimits}>
                    <Text style={styles.limitText}>{stepData.min} Day</Text>
                    <Text style={styles.limitText}>{stepData.max} Days</Text>
                  </View>
                </View>
              )}

              {/* CHIPS TYPE (Companions) */}
              {stepData.type === 'chips' && (
                <View style={styles.chipWrapper}>
                  {stepData.options.map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, preferences[stepData.id] === opt && styles.chipSelected]}
                      onPress={() => setPreferences({ ...preferences, [stepData.id]: opt })}
                    >
                      <Text style={[styles.chipText, preferences[stepData.id] === opt && styles.chipTextSelected]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* CARDS TYPE (Budget, Pace, Transport) */}
              {stepData.type === 'cards' && (
                <View style={styles.cardWrapper}>
                  {stepData.options.map(opt => (
                    <TouchableOpacity
                      key={opt.label}
                      style={[styles.optionCard, preferences[stepData.id] === opt.label && styles.optionCardSelected]}
                      onPress={() => setPreferences({ ...preferences, [stepData.id]: opt.label })}
                    >
                      <View style={styles.cardTextContainer}>
                        <Text style={[styles.cardTitle, preferences[stepData.id] === opt.label && styles.cardTitleSelected]}>{opt.label}</Text>
                        <Text style={[styles.cardDesc, preferences[stepData.id] === opt.label && styles.cardDescSelected]}>{opt.desc}</Text>
                      </View>
                      {preferences[stepData.id] === opt.label && <View style={styles.selectedCircle}><Text style={styles.checkmark}>✓</Text></View>}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* MULTI-SELECT TYPE (Interests) */}
              {stepData.type === 'multi-select' && (
                <View style={styles.chipWrapper}>
                  {stepData.options.map(opt => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, preferences.interests.includes(opt) && styles.chipSelected]}
                      onPress={() => toggleInterest(opt)}
                    >
                      <Text style={[styles.chipText, preferences.interests.includes(opt) && styles.chipTextSelected]}>
                        {preferences.interests.includes(opt) ? '✓ ' : '+ '}{opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          </Animated.View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.nextButton, !isStepValid() && styles.nextButtonDisabled]} 
            onPress={handleNext}
            disabled={!isStepValid()}
          >
            <Text style={styles.nextButtonText}>
              {currentStep === WIZARD_STEPS.length - 1 ? 'Generate Itinerary ✨' : 'Continue'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageWrapper: {
    flex: 1,
    backgroundColor: '#F4F6F8',
    height: Platform.OS === 'web' ? '100vh' : '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Platform.OS === 'web' ? 20 : 0,
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 650,
    maxHeight: Platform.OS === 'web' ? '90vh' : '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: Platform.OS === 'web' ? 24 : 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: Platform.OS === 'web' ? '0px 10px 40px rgba(0,0,0,0.05)' : 'none',
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 25, 
    paddingTop: Platform.OS === 'web' ? 30 : 50,
    paddingBottom: 20
  },
  backButton: { padding: 5 },
  backButtonText: { fontSize: 16, color: '#6B7280', fontWeight: '600' },
  stepIndicator: { fontSize: 15, color: '#9CA3AF', fontWeight: '700' },
  progressBarBg: { height: 6, backgroundColor: '#F3F4F6', marginHorizontal: 25, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#2E8B57', borderRadius: 3 },
  contentArea: { flex: 1, padding: 30, paddingBottom: 0 },
  questionText: { fontSize: 30, fontWeight: '800', color: '#111827', marginBottom: 8 },
  subtitleText: { fontSize: 16, color: '#6B7280', marginBottom: 25 },
  scrollContent: { paddingBottom: 40, flexGrow: 1 },

  // Slider Specific Styles
  sliderSection: { alignItems: 'center', paddingVertical: 20 },
  daysCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center', marginBottom: 30, borderWidth: 2, borderColor: '#2E8B57' },
  daysValue: { fontSize: 48, fontWeight: '800', color: '#2E8B57' },
  daysLabel: { fontSize: 16, color: '#2E8B57', fontWeight: '600', marginTop: -5 },
  slider: { width: '100%', height: 40 },
  sliderLimits: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 5 },
  limitText: { color: '#9CA3AF', fontWeight: '600', fontSize: 14 },
  
  chipWrapper: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chip: { paddingVertical: 14, paddingHorizontal: 22, borderRadius: 30, borderWidth: 2, borderColor: '#E5E7EB', backgroundColor: '#FFF' },
  chipSelected: { borderColor: '#2E8B57', backgroundColor: '#F0FDF4' },
  chipText: { fontSize: 16, color: '#4B5563', fontWeight: '600' },
  chipTextSelected: { color: '#2E8B57', fontWeight: '800' },

  cardWrapper: { gap: 15 },
  optionCard: { padding: 22, borderRadius: 16, borderWidth: 2, borderColor: '#E5E7EB', backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center' },
  optionCardSelected: { borderColor: '#2E8B57', backgroundColor: '#F0FDF4' },
  cardTextContainer: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937', marginBottom: 4 },
  cardTitleSelected: { color: '#2E8B57' },
  cardDesc: { fontSize: 14, color: '#6B7280' },
  cardDescSelected: { color: '#065F46' },
  selectedCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#2E8B57', justifyContent: 'center', alignItems: 'center' },
  checkmark: { color: '#FFF', fontWeight: 'bold' },

  footer: { padding: 25, borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#FFF' },
  nextButton: { backgroundColor: '#2E8B57', paddingVertical: 18, borderRadius: 14, alignItems: 'center' },
  nextButtonDisabled: { backgroundColor: '#E5E7EB' },
  nextButtonText: { color: '#FFF', fontSize: 18, fontWeight: '700' }
});