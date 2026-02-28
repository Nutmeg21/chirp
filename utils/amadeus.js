// utils/amadeus.js
import axios from 'axios';

// ---> PASTE YOUR AMADEUS KEYS HERE <---
const CLIENT_ID = '';
const CLIENT_SECRET = '';

let accessToken = null;

const getAccessToken = async () => {
  try {
    const response = await axios.post(
      'https://test.api.amadeus.com/v1/security/oauth2/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    accessToken = response.data.access_token;
    return accessToken;
  } catch (error) {
    console.error('Amadeus Token Error:', error);
    return null;
  }
};

export const searchFlights = async (origin, destination, date) => {
  if (!accessToken) await getAccessToken();
  try {
    const response = await axios.get(
      'https://test.api.amadeus.com/v2/shopping/flight-offers',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          originLocationCode: origin,
          destinationLocationCode: destination,
          departureDate: date,
          adults: '1',
          currencyCode: 'USD',
          max: '3' // Limit to 3 results to keep it fast
        },
      }
    );
    return response.data.data;
  } catch (error) {
    console.error('Flight search error:', error);
    return [];
  }
};