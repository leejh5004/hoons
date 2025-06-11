// 관리자 계정 (이메일/비밀번호)
const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'admin1234';

// DOM 요소
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const maintenanceList = document.getElementById('maintenanceList');
const maintenanceForm = document.getElementById('maintenanceForm');
const maintenanceItems = document.getElementById('maintenanceItems');
const addMaintenanceBtn = document.getElementById('addMaintenanceBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userName = document.getElementById('userName');
const searchBox = document.getElementById('searchBox');
const searchInput = document.getElementById('searchInput');
const addBtnBox = document.getElementById('addBtnBox');
const showRegister = document.getElementById('showRegister');
const showLogin = document.getElementById('showLogin');

let currentUser = null;
let isAdmin = false;

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyDu_DVHYKmxb8LNTO4lVNdXp2K-ZU8qClE",
  authDomain: "hoons-a02bc.firebaseapp.com",
  projectId: "hoons-a02bc",
  storageBucket: "hoons-a02bc.firebasestorage.app",
  messagingSenderId: "129637551362",
  appId: "1:129637551362:web:3bb671f51fdb3a2cd9061b"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);

// Firebase 서비스 초기화
const auth = firebase.auth();
const db = firebase.firestore();

// 로그인/회원가입 폼 전환
showRegister.addEventListener('click', (e) => {
  e.preventDefault();
  loginForm.style.display = 'none';
  registerForm.style.display = 'block';
});
showLogin.addEventListener('click', (e) => {
  e.preventDefault();
  registerForm.style.display = 'none';
  loginForm.style.display = 'block';
});

// 회원가입
registerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  auth.createUserWithEmailAndPassword(email, password)
    .then(() => {
      alert('회원가입 완료! 로그인 해주세요.');
      registerForm.style.display = 'none';
      loginForm.style.display = 'block';
    })
    .catch(err => {
      alert('회원가입 실패: ' + err.message);
    });
});

// 로그인
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  auth.signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
      currentUser = userCredential.user;
      isAdmin = (email === ADMIN_EMAIL);
      userName.textContent = isAdmin ? '관리자' : `차량번호: ${email}`;
      afterLogin();
    })
    .catch(err => {
      alert('로그인 실패: ' + err.message);
    });
});

// 로그아웃
logoutBtn.addEventListener('click', () => {
  auth.signOut().then(() => {
    currentUser = null;
    isAdmin = false;
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    maintenanceList.style.display = 'none';
    maintenanceForm.style.display = 'none';
    logoutBtn.style.display = 'none';
    userName.textContent = '';
    addBtnBox.style.display = 'none';
    searchBox.style.display = 'none';
  });
});

// 로그인 후 UI 처리
function afterLogin() {
  loginForm.style.display = 'none';
  registerForm.style.display = 'none';
  maintenanceList.style.display = 'block';
  logoutBtn.style.display = 'block';
  addBtnBox.style.display = 'block';
  showSearchBox();
  loadMaintenanceHistory();
}

// 새 정비 이력 추가 버튼
addMaintenanceBtn.addEventListener('click', () => {
  maintenanceForm.style.display = 'block';
});

document.getElementById('cancelBtn').addEventListener('click', () => {
  maintenanceForm.style.display = 'none';
});

document.getElementById('newMaintenance').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!currentUser) return;
  const maintenanceData = {
    userEmail: currentUser.email,
    date: document.getElementById('maintenanceDate').value,
    type: document.getElementById('maintenanceType').value,
    description: document.getElementById('description').value,
    status: 'pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  db.collection('maintenance').add(maintenanceData)
    .then(() => {
      maintenanceForm.style.display = 'none';
      document.getElementById('newMaintenance').reset();
      loadMaintenanceHistory();
    })
    .catch(err => {
      alert('정비 이력 저장 실패: ' + err.message);
    });
});

function showSearchBox() {
  searchBox.style.display = 'block';
}

searchInput.addEventListener('input', () => {
  loadMaintenanceHistory(searchInput.value);
});

function loadMaintenanceHistory(search = '') {
  let query = db.collection('maintenance');
  if (!isAdmin && currentUser) {
    query = query.where('userEmail', '==', currentUser.email);
  }
  query.orderBy('createdAt', 'desc').get()
    .then(snapshot => {
      maintenanceItems.innerHTML = '';
      let maintenances = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        maintenances.push({ ...data, id: doc.id });
      });
      if (search && search.trim() !== '') {
        const s = search.trim().toLowerCase();
        maintenances = maintenances.filter(m =>
          (m.type && m.type.toLowerCase().includes(s)) ||
          (m.description && m.description.toLowerCase().includes(s))
        );
      }
      maintenances.forEach(maintenance => {
        const item = document.createElement('div');
        item.className = 'card mb-3';
        item.innerHTML = `
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div>
                <h5 class="card-title mb-0">${maintenance.type}</h5>
                <h6 class="card-subtitle text-muted">${maintenance.date}</h6>
                ${isAdmin ? `<div class='text-muted' style='font-size:0.95em;'>차량번호: ${maintenance.userEmail}</div>` : ''}
              </div>
              <span class="badge ${getStatusBadgeClass(maintenance.status)}" style="font-size:1em;">${getStatusText(maintenance.status)}</span>
            </div>
            <p class="card-text">${maintenance.description}</p>
            <div class="d-flex justify-content-end align-items-center mt-2">
              ${renderActionButtons(maintenance)}
            </div>
            <div class="text-end mt-2">
              <small class="text-muted">
                ${maintenance.createdAt && maintenance.createdAt.toDate ? maintenance.createdAt.toDate().toLocaleString() : ''}
              </small>
            </div>
          </div>
        `;
        maintenanceItems.appendChild(item);
      });
    });
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'pending': return 'bg-warning';
    case 'approved': return 'bg-success';
    case 'rejected': return 'bg-danger';
    default: return 'bg-secondary';
  }
}

function getStatusText(status) {
  switch (status) {
    case 'pending': return '검토중';
    case 'approved': return '승인됨';
    case 'rejected': return '거절됨';
    default: return '알 수 없음';
  }
}

function renderActionButtons(maintenance) {
  if (isAdmin && maintenance.status === 'pending') {
    return `
      <button class="btn btn-success btn-sm me-2" onclick="approveMaintenance('${maintenance.id}')">승인</button>
      <button class="btn btn-danger btn-sm" onclick="rejectMaintenance('${maintenance.id}')">거절</button>
    `;
  }
  if (!isAdmin && maintenance.status === 'pending') {
    return `<button class="btn btn-danger btn-sm" onclick="deleteMaintenance('${maintenance.id}')">삭제</button>`;
  }
  return '';
}

// 승인/거절/삭제 함수
window.approveMaintenance = function(id) {
  db.collection('maintenance').doc(id).update({
    status: 'approved',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(loadMaintenanceHistory);
}
window.rejectMaintenance = function(id) {
  db.collection('maintenance').doc(id).update({
    status: 'rejected',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(loadMaintenanceHistory);
}
window.deleteMaintenance = function(id) {
  db.collection('maintenance').doc(id).delete().then(loadMaintenanceHistory);
}

// 인증 상태 변경 감지
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    isAdmin = (user.email === ADMIN_EMAIL);
    userName.textContent = isAdmin ? '관리자' : `차량번호: ${user.email}`;
    afterLogin();
  } else {
    currentUser = null;
    isAdmin = false;
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    maintenanceList.style.display = 'none';
    maintenanceForm.style.display = 'none';
    logoutBtn.style.display = 'none';
    userName.textContent = '';
    addBtnBox.style.display = 'none';
    searchBox.style.display = 'none';
  }
});

window.onload = function() {
  loginForm.style.display = 'block';
  maintenanceList.style.display = 'none';
  maintenanceForm.style.display = 'none';
  logoutBtn.style.display = 'none';
  userName.textContent = '';
  addBtnBox.style.display = 'none';
  searchBox.style.display = 'none';
}; 