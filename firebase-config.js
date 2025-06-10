// Firebase 설정
const firebaseConfig = {
    // 여기에 Firebase 프로젝트 설정을 넣어주세요
    apiKey: "AIzaSyCo53eSA1uN7y4OHDVMyoq-fQ_Xs0rHyHA",
    authDomain: "hoons-6e2ea.firebaseapp.com",
    projectId: "hoons-6e2ea",
    storageBucket: "hoons-6e2ea.appspot.com",
    messagingSenderId: "172348464422",
    appId: "1:172348464422:web:13f2e5d141569796d275e7"
  };

// Firebase 초기화
firebase.initializeApp(firebaseConfig);

// Firebase 서비스 초기화 (전역 변수로 할당)
window.auth = firebase.auth();
window.db = firebase.firestore(); 