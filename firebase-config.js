// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyDu_DVHYKmxb8LNTO4lVNdXp2K-ZU8qClE",
  authDomain: "hoons-a02bc.firebaseapp.com",
  projectId: "hoons-a02bc",
  storageBucket: "hoons-a02bc.appspot.com",
  messagingSenderId: "129637551362",
  appId: "1:129637551362:web:3bb671f51fdb3a2cd9061b"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);

// Firebase 서비스 초기화
const auth = firebase.auth();
// db는 app.js에서 초기화됩니다

// ImgBB API 설정
const IMGBB_API_KEY = 'f894050dd0ffa9923ef7049a58f02292'; 