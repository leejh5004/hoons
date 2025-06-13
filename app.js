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
    showNotification('모든 정보를 입력하세요.', 'error');
    return;
  }
  auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      const uid = userCredential.user.uid;
      return db.collection('users').doc(uid).set({ email, carNumber });
    })
    .then(() => {
      showNotification('회원가입이 완료되었습니다! 로그인 해주세요.', 'success');
      registerForm.style.display = 'none';
      loginForm.style.display = 'block';
    })
    .catch(err => showNotification('회원가입 실패: ' + err.message, 'error'));
});

// 로그인
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  if (!email || !password) {
    showNotification('이메일과 비밀번호를 입력하세요.', 'error');
    return;
  }
  auth.signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
      const uid = userCredential.user.uid;
      db.collection('users').doc(uid).get().then(doc => {
        if (!doc.exists) {
          showNotification('사용자 정보가 없습니다.', 'error');
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
    .catch(err => showNotification('로그인 실패: ' + err.message, 'error'));
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
  // 관리자 뱃지 표시
  if (isAdmin) {
    userName.innerHTML = `관리자 (${currentUser.email}) <span class='admin-badge'>ADMIN</span>`;
  } else {
    userName.textContent = `차량번호: ${currentUser.carNumber}`;
  }
  loadMaintenanceHistory();
}

// 정비 이력 추가 (관리자만)
addMaintenanceBtn.addEventListener('click', () => {
  if (!isAdmin) {
    showNotification('관리자만 정비 이력을 추가할 수 있습니다.', 'error');
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
      showNotification('정비 이력이 저장되었습니다.', 'success');
    })
    .catch(err => showNotification('정비 이력 저장 실패: ' + err.message, 'error'));
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
      // 타임라인 컨테이너
      const timeline = document.createElement('div');
      timeline.className = 'maintenance-timeline';
      maintenances.forEach((maintenance, idx) => {
        // 정비 종류별 아이콘
        const typeIcon = getTypeIcon(maintenance.type);
        // 상태 뱃지
        const statusClass = maintenance.status || 'pending';
        const statusIcon = getStatusIcon(maintenance.status);
        // 카드
        const card = document.createElement('div');
        card.className = 'maintenance-card glass-card';
        card.innerHTML = `
          <div class="maintenance-card-header">
            <span class="maintenance-type-icon">${typeIcon}</span>
            <span class="maintenance-card-title">${maintenance.type || ''}</span>
            <span class="maintenance-status-badge ${statusClass}">${statusIcon} ${getStatusText(maintenance.status)}</span>
            <span class="maintenance-date">${maintenance.date || ''}</span>
          </div>
          <div class="maintenance-card-body">
            <span class="maintenance-car-number">차량번호: ${maintenance.carNumber}</span>
            ${isAdmin ? `<span class="maintenance-admin">관리자: ${maintenance.adminEmail}</span>` : ''}
            <div class="mt-2">${maintenance.description || ''}</div>
          </div>
          <div class="maintenance-card-footer">
            ${renderActionButtons(maintenance)}
          </div>
        `;
        timeline.appendChild(card);
      });
      maintenanceItems.appendChild(timeline);
    });
}

// 정비 종류별 아이콘
function getTypeIcon(type) {
  switch (type) {
    case '엔진오일교체': return '<i class="fas fa-oil-can"></i>';
    case '타이어교체': return '<i class="fas fa-dot-circle"></i>';
    case '브레이크정비': return '<i class="fas fa-car-crash"></i>';
    case '일반점검': return '<i class="fas fa-tools"></i>';
    case '기타': return '<i class="fas fa-wrench"></i>';
    default: return '<i class="fas fa-cogs"></i>';
  }
}

// 상태별 아이콘
function getStatusIcon(status) {
  switch (status) {
    case 'approved': return '<i class="fas fa-check-circle"></i>';
    case 'rejected': return '<i class="fas fa-times-circle"></i>';
    case 'pending':
    default: return '<i class="fas fa-hourglass-half"></i>';
  }
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
      <button class="btn btn-success btn-sm me-2" onclick="approveMaintenance('${maintenance.id}')">
        <i class="fas fa-check me-1"></i>승인
      </button>
      <button class="btn btn-danger btn-sm" onclick="rejectMaintenance('${maintenance.id}')">
        <i class="fas fa-times me-1"></i>거절
      </button>
    `;
  }
  return '';
}

// 승인/거절
window.approveMaintenance = function(id) {
  db.collection('maintenance').doc(id).update({
    status: 'approved',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    loadMaintenanceHistory();
    showNotification('정비 이력이 승인되었습니다.', 'success');
  });
}
window.rejectMaintenance = function(id) {
  db.collection('maintenance').doc(id).update({
    status: 'rejected',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    loadMaintenanceHistory();
    showNotification('정비 이력이 거절되었습니다.', 'error');
  });
}

// 알림 표시
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `alert alert-${type} notification`;
  notification.innerHTML = `
    <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'} me-2"></i>
    ${message}
  `;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.remove();
  }, 3000);
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
    showLoginForm();
  }
});

// 로그인 폼 표시
function showLoginForm() {
  loginForm.style.display = 'block';
  registerForm.style.display = 'none';
  maintenanceList.style.display = 'none';
  logoutBtn.style.display = 'none';
  addBtnBox.style.display = 'none';
  searchBox.style.display = 'none';
  maintenanceForm.style.display = 'none';
  currentUser = null;
  isAdmin = false;
}

// Firebase 초기화 (firebase-config.js 참고)
// const auth = firebase.auth();
// const db = firebase.firestore(); 

// DOM이 로드된 후 실행
document.addEventListener('DOMContentLoaded', () => {
    const backdrop = document.getElementById('modalBackdrop');
    const modal = document.getElementById('maintenanceModal');
    
    // 모달 외부 클릭시 닫기
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
            closeMaintenanceModal();
        }
    });
    
    // ESC 키로 모달 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMaintenanceModal();
        }
    });
    
    // 닫기 버튼 클릭시 닫기
    const closeButton = modal.querySelector('.modal-close');
    if (closeButton) {
        closeButton.addEventListener('click', closeMaintenanceModal);
    }
});

// 정비이력 카드 생성 함수
function createMaintenanceCard(maintenance) {
    const card = document.createElement('div');
    card.className = 'maintenance-card';
    
    // 카드 내용 컨테이너
    const content = document.createElement('div');
    content.className = 'card-content';
    
    // 헤더 (차량 정보 + 상태)
    const header = document.createElement('div');
    header.className = 'card-header';
    
    // 차량 정보
    const carInfo = document.createElement('div');
    carInfo.className = 'car-info';
    
    const icon = document.createElement('i');
    icon.className = 'fas fa-car';
    carInfo.appendChild(icon);
    
    const carNumber = document.createElement('span');
    carNumber.textContent = maintenance.carNumber;
    carInfo.appendChild(carNumber);
    
    header.appendChild(carInfo);
    
    // 상태 뱃지
    const statusBadge = document.createElement('div');
    const statusText = {
        'completed': '완료',
        'in-progress': '진행중',
        'pending': '대기중',
        'rejected': '거절됨',
        'approved': '승인'
    }[maintenance.status] || maintenance.status;
    
    statusBadge.className = `status-badge ${maintenance.status}`;
    statusBadge.textContent = statusText;
    header.appendChild(statusBadge);
    
    content.appendChild(header);
    
    // 날짜
    const date = document.createElement('div');
    date.className = 'card-date';
    date.textContent = new Date(maintenance.date).toLocaleDateString();
    content.appendChild(date);
    
    // 정비 내용
    const description = document.createElement('p');
    description.className = 'card-description';
    description.textContent = maintenance.description || '정비 내용이 없습니다.';
    content.appendChild(description);
    
    // 담당자 정보
    const mechanic = document.createElement('div');
    mechanic.className = 'card-mechanic';
    
    const mechanicIcon = document.createElement('i');
    mechanicIcon.className = 'fas fa-user-cog';
    mechanic.appendChild(mechanicIcon);
    
    const mechanicText = document.createElement('span');
    mechanicText.textContent = ` ${maintenance.mechanic}`;
    mechanic.appendChild(mechanicText);
    
    content.appendChild(mechanic);
    card.appendChild(content);
    
    // 클릭 이벤트
    card.addEventListener('click', () => {
        showMaintenanceModal(maintenance);
    });
    
    return card;
}

// 모달 관련 함수
function showMaintenanceModal(maintenance) {
    const modal = document.getElementById('maintenanceModal');
    const backdrop = document.getElementById('modalBackdrop');
    
    // 모달 내용 업데이트
    document.getElementById('modalCarNumber').textContent = maintenance.carNumber;
    document.getElementById('modalDate').textContent = new Date(maintenance.date).toLocaleDateString();
    
    const statusMap = {
        'completed': '완료',
        'in-progress': '진행중',
        'pending': '대기중',
        'rejected': '거절됨',
        'approved': '승인'
    };
    
    const statusElement = document.getElementById('modalStatus');
    statusElement.textContent = statusMap[maintenance.status] || maintenance.status;
    statusElement.className = `status-badge ${maintenance.status}`;
    
    document.getElementById('modalDescription').textContent = maintenance.description || '정비 내용이 없습니다.';
    document.getElementById('modalMechanic').textContent = maintenance.mechanic;
    
    // 모달 표시 전에 스타일 초기화
    modal.style.display = 'block';
    backdrop.style.display = 'block';
    
    // 강제 리플로우
    modal.offsetHeight;
    
    // 모달 표시
    requestAnimationFrame(() => {
        backdrop.classList.add('show');
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    });
}

function closeMaintenanceModal() {
    const modal = document.getElementById('maintenanceModal');
    const backdrop = document.getElementById('modalBackdrop');
    
    // 모달 숨기기
    modal.classList.remove('show');
    backdrop.classList.remove('show');
    
    // 트랜지션 완료 후 완전히 숨기기
    const handleTransitionEnd = () => {
        modal.style.display = 'none';
        backdrop.style.display = 'none';
        document.body.style.overflow = '';
        modal.removeEventListener('transitionend', handleTransitionEnd);
    };
    
    modal.addEventListener('transitionend', handleTransitionEnd);
} 