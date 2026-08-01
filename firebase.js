// Import the functions you need from the SDKs you need
import { getFirestore } from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD_nm4zrRc7sYRGcpg_RntDo9gJG_MbjVA",
  authDomain: "cafe-hop-girlies-68cbf.firebaseapp.com",
  projectId: "cafe-hop-girlies-68cbf",
  storageBucket: "cafe-hop-girlies-68cbf.firebasestorage.app",
  messagingSenderId: "114480277437",
  appId: "1:114480277437:web:3db62f979cd35365c094d4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export { auth,db };