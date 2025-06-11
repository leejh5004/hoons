// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyDu_DVHYKm8kBLNT04V1NdXyqP2K-ZU8qC1E",
  authDomain: "hoons-a02bc.firebaseapp.com",
  projectId: "hoons-a02bc",
  storageBucket: "hoons-a02bc.appspot.com",
  messagingSenderId: "129637551362",
  appId: "1:129637551362:web:3bb6f715fdb3a2cd9661b"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);

// Firebase 서비스 초기화
const auth = firebase.auth();
const db = firebase.firestore(); 