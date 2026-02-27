// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth"
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "",
  authDomain: "sojourner-travel.firebaseapp.com",
  projectId: "sojourner-travel",
  storageBucket: "sojourner-travel.firebasestorage.app",
  messagingSenderId: "224972465555",
  appId: "1:224972465555:web:51e2f27d3480d495a1f466",
  measurementId: "G-S38NF59H4N"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
