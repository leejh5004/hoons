// LocalStorage 기반 오토바이 정비 이력 관리 시스템

// 관리자 계정 (예시)
const ADMIN = { vehicleNumber: 'admin', password: 'admin123' };

// DOM 요소
const loginForm = document.getElementById('loginForm');
const maintenanceList = document.getElementById('maintenanceList');
const maintenanceForm = document.getElementById('maintenanceForm');
const maintenanceItems = document.getElementById('maintenanceItems');
const addMaintenanceBtn = document.getElementById('addMaintenanceBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userName = document.getElementById('userName');
const searchBox = document.getElementById('searchBox');
const searchInput = document.getElementById('searchInput');
const addBtnBox = document.getElementById('addBtnBox');

let currentUser = null;
let isAdmin = false;

// 회원 데이터 LocalStorage에 저장/조회
function getUsers() {
    return JSON.parse(localStorage.getItem('users') || '{}');
}
function setUsers(users) {
    localStorage.setItem('users', JSON.stringify(users));
}

// 정비 이력 LocalStorage에 저장/조회
function getMaintenances() {
    return JSON.parse(localStorage.getItem('maintenances') || '[]');
}
function setMaintenances(data) {
    localStorage.setItem('maintenances', JSON.stringify(data));
}

// 로그인 폼 제출 처리
document.getElementById('login').addEventListener('submit', (e) => {
    e.preventDefault();
    const vehicleNumber = document.getElementById('vehicleNumber').value.trim();
    const password = document.getElementById('password').value;

    // 관리자 로그인
    if (vehicleNumber === ADMIN.vehicleNumber && password === ADMIN.password) {
        currentUser = ADMIN;
        isAdmin = true;
        userName.textContent = `관리자`;
        afterLogin();
        return;
    }

    // 일반 사용자 로그인
    const users = getUsers();
    if (users[vehicleNumber] && users[vehicleNumber] === password) {
        currentUser = { vehicleNumber };
        isAdmin = false;
        userName.textContent = `차량번호: ${vehicleNumber}`;
        afterLogin();
    } else {
        // 회원가입 처리
        if (confirm('등록되지 않은 차량번호입니다. 회원가입 하시겠습니까?')) {
            users[vehicleNumber] = password;
            setUsers(users);
            alert('회원가입 완료! 다시 로그인 해주세요.');
        } else {
            alert('로그인 실패: 차량번호 또는 비밀번호가 올바르지 않습니다.');
        }
    }
});

// 로그인 후 UI 처리
function afterLogin() {
    loginForm.style.display = 'none';
    maintenanceList.style.display = 'block';
    logoutBtn.style.display = 'block';
    showSearchBox();
    addBtnBox.style.display = 'block';
    loadMaintenanceHistory();
}

// 로그아웃 처리
logoutBtn.addEventListener('click', () => {
    currentUser = null;
    isAdmin = false;
    loginForm.style.display = 'block';
    maintenanceList.style.display = 'none';
    maintenanceForm.style.display = 'none';
    logoutBtn.style.display = 'none';
    userName.textContent = '';
    addBtnBox.style.display = 'none';
});

// 새 정비 이력 추가 버튼 클릭
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
        id: Date.now(),
        date: document.getElementById('maintenanceDate').value,
        type: document.getElementById('maintenanceType').value,
        description: document.getElementById('description').value,
        vehicleNumber: currentUser.vehicleNumber,
        status: 'pending', // pending, approved, rejected
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const maintenances = getMaintenances();
    maintenances.push(maintenanceData);
    setMaintenances(maintenances);
    maintenanceForm.style.display = 'none';
    document.getElementById('newMaintenance').reset();
    loadMaintenanceHistory();
});

// 정비 이력 로드
function loadMaintenanceHistory(search = '') {
    const maintenances = getMaintenances();
    maintenanceItems.innerHTML = '';
    let filtered = maintenances;
    if (!isAdmin) {
        filtered = maintenances.filter(m => m.vehicleNumber === currentUser.vehicleNumber);
    }
    if (search && search.trim() !== '') {
        const s = search.trim().toLowerCase();
        filtered = filtered.filter(m =>
            (m.vehicleNumber && m.vehicleNumber.toLowerCase().includes(s)) ||
            (m.type && m.type.toLowerCase().includes(s)) ||
            (m.description && m.description.toLowerCase().includes(s))
        );
    }
    filtered.forEach(maintenance => {
        const item = document.createElement('div');
        item.className = 'card mb-3';
        item.innerHTML = `
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div>
                        <h5 class="card-title mb-0">${maintenance.type}</h5>
                        <h6 class="card-subtitle text-muted">${maintenance.date}</h6>
                        ${isAdmin ? `<div class='text-muted' style='font-size:0.95em;'>차량번호: ${maintenance.vehicleNumber}</div>` : ''}
                    </div>
                    <span class="badge ${getStatusBadgeClass(maintenance.status)}" style="font-size:1em;">${getStatusText(maintenance.status)}</span>
                </div>
                <p class="card-text">${maintenance.description}</p>
                <div class="d-flex justify-content-end align-items-center mt-2">
                    ${renderActionButtons(maintenance)}
                </div>
                <div class="text-end mt-2">
                    <small class="text-muted">
                        ${maintenance.createdAt ? new Date(maintenance.createdAt).toLocaleString() : ''}
                    </small>
                </div>
            </div>
        `;
        maintenanceItems.appendChild(item);
    });
}

// 상태에 따른 배지 스타일 반환
function getStatusBadgeClass(status) {
    switch (status) {
        case 'pending': return 'bg-warning';
        case 'approved': return 'bg-success';
        case 'rejected': return 'bg-danger';
        default: return 'bg-secondary';
    }
}

// 상태 텍스트 반환
function getStatusText(status) {
    switch (status) {
        case 'pending': return '검토중';
        case 'approved': return '승인됨';
        case 'rejected': return '거절됨';
        default: return '알 수 없음';
    }
}

// 승인/거절/삭제 버튼 렌더링
function renderActionButtons(maintenance) {
    if (isAdmin && maintenance.status === 'pending') {
        return `
            <button class="btn btn-success btn-sm me-2" onclick="approveMaintenance(${maintenance.id})">승인</button>
            <button class="btn btn-danger btn-sm" onclick="rejectMaintenance(${maintenance.id})">거절</button>
        `;
    }
    if (!isAdmin && maintenance.status === 'pending') {
        return `<button class="btn btn-danger btn-sm" onclick="deleteMaintenance(${maintenance.id})">삭제</button>`;
    }
    return '';
}

// 승인/거절/삭제 함수 (전역 등록)
window.approveMaintenance = function(id) {
    const maintenances = getMaintenances();
    const idx = maintenances.findIndex(m => m.id === id);
    if (idx > -1) {
        maintenances[idx].status = 'approved';
        maintenances[idx].updatedAt = new Date().toISOString();
        setMaintenances(maintenances);
        loadMaintenanceHistory();
    }
}
window.rejectMaintenance = function(id) {
    const maintenances = getMaintenances();
    const idx = maintenances.findIndex(m => m.id === id);
    if (idx > -1) {
        maintenances[idx].status = 'rejected';
        maintenances[idx].updatedAt = new Date().toISOString();
        setMaintenances(maintenances);
        loadMaintenanceHistory();
    }
}
window.deleteMaintenance = function(id) {
    let maintenances = getMaintenances();
    maintenances = maintenances.filter(m => m.id !== id);
    setMaintenances(maintenances);
    loadMaintenanceHistory();
}

// 검색창 표시 및 이벤트 처리
function showSearchBox() {
    searchBox.style.display = 'block';
}

searchInput.addEventListener('input', () => {
    loadMaintenanceHistory(searchInput.value);
});

// 인증 상태 초기화
window.onload = function() {
    loginForm.style.display = 'block';
    maintenanceList.style.display = 'none';
    maintenanceForm.style.display = 'none';
    logoutBtn.style.display = 'none';
    userName.textContent = '';
}; 