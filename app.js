// 관리자 이메일 목록
const ADMIN_EMAILS = ['admin1@admin.com', 'admin2@admin.com', 'admin3@admin.com'];

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

// 폼 전환
showRegister.addEventListener('click', e => {
  e.preventDefault();
  loginForm.style.display = 'none';
  registerForm.style.display = 'block';
});
showLogin.addEventListener('click', e => {
  e.preventDefault();
  registerForm.style.display = 'none';
  loginForm.style.display = 'block';
});

// 회원가입
registerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;
  const carNumber = document.getElementById('regCarNumber').value.trim().toLowerCase().replace(/\\s+/g, '');
  if (!email || !password || !carNumber) {
    alert('모든 정보를 입력하세요.');
    return;
  }
  auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      const uid = userCredential.user.uid;
      return db.collection('users').doc(uid).set({ email, carNumber });
    })
    .then(() => {
      alert('회원가입 완료! 로그인 해주세요.');
      registerForm.style.display = 'none';
      loginForm.style.display = 'block';
    })
    .catch(err => alert('회원가입 실패: ' + err.message));
});

// 로그인
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  if (!email || !password) {
    alert('이메일과 비밀번호를 입력하세요.');
    return;
  }
  auth.signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
      const uid = userCredential.user.uid;
      db.collection('users').doc(uid).get().then(doc => {
        if (!doc.exists) {
          alert('사용자 정보가 없습니다.');
          return;
        }
        currentUser = {
          uid,
          email,
          carNumber: doc.data().carNumber
        };
        isAdmin = ADMIN_EMAILS.includes(email);
        userName.textContent = isAdmin ? `관리자 (${email})` : `차량번호: ${currentUser.carNumber}`;
        afterLogin();
      });
    })
    .catch(err => alert('로그인 실패: ' + err.message));
});

// 로그아웃
logoutBtn.addEventListener('click', () => {
  auth.signOut().then(() => {
    currentUser = null;
    isAdmin = false;
    showLoginForm();
  });
});

// 로그인 후 UI 처리
function afterLogin() {
  loginForm.style.display = 'none';
  registerForm.style.display = 'none';
  maintenanceList.style.display = 'block';
  logoutBtn.style.display = 'block';
  addBtnBox.style.display = 'block';
  searchBox.style.display = 'block';
  loadMaintenanceHistory();
}

// 정비 이력 추가 (관리자만)
addMaintenanceBtn.addEventListener('click', () => {
  if (!isAdmin) {
    alert('관리자만 정비 이력을 추가할 수 있습니다.');
    return;
  }
  maintenanceForm.style.display = 'block';
});
document.getElementById('cancelBtn').addEventListener('click', () => {
  maintenanceForm.style.display = 'none';
});
document.getElementById('newMaintenance').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!isAdmin) return;
  const carNumber = document.getElementById('maintenanceCarNumber').value.trim().toLowerCase().replace(/\\s+/g, '');
  const maintenanceData = {
    carNumber,
    date: document.getElementById('maintenanceDate').value,
    type: document.getElementById('maintenanceType').value,
    description: document.getElementById('description').value,
    status: 'pending',
    adminEmail: currentUser.email,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  db.collection('maintenance').add(maintenanceData)
    .then(() => {
      maintenanceForm.style.display = 'none';
      document.getElementById('newMaintenance').reset();
      loadMaintenanceHistory();
    })
    .catch(err => alert('정비 이력 저장 실패: ' + err.message));
});

// 검색
searchInput.addEventListener('input', () => {
  loadMaintenanceHistory(searchInput.value);
});

// 정비 이력 불러오기
function loadMaintenanceHistory(search = '') {
  let query = db.collection('maintenance');
  if (isAdmin) {
    query = query.where('adminEmail', '==', currentUser.email);
  } else if (currentUser) {
    query = query.where('carNumber', '==', currentUser.carNumber);
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
                <div class='text-muted' style='font-size:0.95em;'>차량번호: ${maintenance.carNumber}</div>
                ${isAdmin ? `<div class='text-muted' style='font-size:0.95em;'>등록 관리자: ${maintenance.adminEmail}</div>` : ''}
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

// 상태 텍스트
function getStatusText(status) {
  switch (status) {
    case 'pending': return '검토중';
    case 'approved': return '승인됨';
    case 'rejected': return '거절됨';
    default: return '알 수 없음';
  }
}

// 관리자 승인/거절 버튼
function renderActionButtons(maintenance) {
  if (!isAdmin && currentUser && maintenance.carNumber === currentUser.carNumber && maintenance.status === 'pending') {
    return `
      <button class="btn btn-success btn-sm me-2" onclick="approveMaintenance('${maintenance.id}')">승인</button>
      <button class="btn btn-danger btn-sm" onclick="rejectMaintenance('${maintenance.id}')">거절</button>
    `;
  }
  return '';
}

// 승인/거절
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

// 인증 상태 감지
auth.onAuthStateChanged(user => {
  if (user) {
    const uid = user.uid;
    db.collection('users').doc(uid).get().then(doc => {
      if (!doc.exists) {
        currentUser = null;
        isAdmin = false;
        showLoginForm();
        return;
      }
      currentUser = {
        uid,
        email: user.email,
        carNumber: doc.data().carNumber
      };
      isAdmin = ADMIN_EMAILS.includes(user.email);
      userName.textContent = isAdmin ? `관리자 (${user.email})` : `차량번호: ${currentUser.carNumber}`;
      afterLogin();
    });
  } else {
    currentUser = null;
    isAdmin = false;
    showLoginForm();
  }
});

// 로그인 폼만 보이기
function showLoginForm() {
  loginForm.style.display = 'block';
  registerForm.style.display = 'none';
  maintenanceList.style.display = 'none';
  maintenanceForm.style.display = 'none';
  logoutBtn.style.display = 'none';
  userName.textContent = '';
  addBtnBox.style.display = 'none';
  searchBox.style.display = 'none';
}

// Firebase 초기화 (firebase-config.js 참고)
// const auth = firebase.auth();
// const db = firebase.firestore(); 

function getStatusBadgeClass(status) {
  switch (status) {
    case 'pending': return 'bg-secondary';
    case 'approved': return 'bg-success';
    case 'rejected': return 'bg-danger';
    default: return 'bg-light text-dark';
  }
} 