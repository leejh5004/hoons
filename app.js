// Google Apps Script API URL (여기에 실제 발급받은 URL을 입력하세요)
const API_URL = 'https://script.google.com/macros/s/AKfycbz2N8MZP1lA2VuZtlWcjnQ5FenQB2OcuPKn6X31nSpOT5XEPFQEZ83mWwogr2lzR2qjnQ/exec';

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

    // 차주 로그인: Google Sheet에서 차량번호+비밀번호로 조회
    fetch(API_URL)
        .then(res => res.json())
        .then(data => {
            const user = data.find(u => u.차량번호 === vehicleNumber && u.비밀번호 === password);
            if (user) {
                currentUser = { vehicleNumber };
                isAdmin = false;
                userName.textContent = `차량번호: ${vehicleNumber}`;
                afterLogin();
            } else {
                // 회원가입 처리
                if (confirm('등록되지 않은 차량번호입니다. 회원가입 하시겠습니까?')) {
                    addUser(vehicleNumber, password);
                } else {
                    alert('로그인 실패: 차량번호 또는 비밀번호가 올바르지 않습니다.');
                }
            }
        });
});

function addUser(vehicleNumber, password) {
    // 1. 먼저 차량번호 중복 체크
    fetch(API_URL)
        .then(res => res.json())
        .then(data => {
            const exists = data.some(u => u.차량번호 === vehicleNumber);
            if (exists) {
                alert('이미 등록된 차량번호입니다.');
                return;
            }
            // 2. 중복이 아니면 회원가입 진행
            fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    차량번호: vehicleNumber,
                    비밀번호: password,
                    정비날짜: '',
                    정비종류: '',
                    설명: '',
                    상태: '',
                    생성일시: '',
                    수정일시: ''
                }),
                headers: { 'Content-Type': 'application/json' }
            })
            .then(res => res.text())
            .then(result => {
                if(result === 'OK') {
                    alert('회원가입 완료! 다시 로그인 해주세요.');
                } else {
                    alert('회원가입 실패!');
                }
            });
        });
}

function afterLogin() {
    loginForm.style.display = 'none';
    maintenanceList.style.display = 'block';
    logoutBtn.style.display = 'block';
    showSearchBox();
    addBtnBox.style.display = 'block';
    loadMaintenanceHistory();
}

logoutBtn.addEventListener('click', () => {
    currentUser = null;
    isAdmin = false;
    loginForm.style.display = 'block';
    maintenanceList.style.display = 'none';
    maintenanceForm.style.display = 'none';
    logoutBtn.style.display = 'none';
    userName.textContent = '';
    addBtnBox.style.display = 'none';
    searchBox.style.display = 'none';
});

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
        차량번호: currentUser.vehicleNumber,
        비밀번호: '', // 비밀번호는 저장하지 않음
        정비날짜: document.getElementById('maintenanceDate').value,
        정비종류: document.getElementById('maintenanceType').value,
        설명: document.getElementById('description').value,
        상태: 'pending',
        생성일시: new Date().toISOString(),
        수정일시: new Date().toISOString()
    };

    fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(maintenanceData),
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.text())
    .then(result => {
        if(result === 'OK') {
            maintenanceForm.style.display = 'none';
            document.getElementById('newMaintenance').reset();
            loadMaintenanceHistory();
        } else {
            alert('정비 이력 저장 실패!');
        }
    });
});

function showSearchBox() {
    searchBox.style.display = 'block';
}

searchInput.addEventListener('input', () => {
    loadMaintenanceHistory(searchInput.value);
});

function loadMaintenanceHistory(search = '') {
    fetch(API_URL)
        .then(res => res.json())
        .then(maintenances => {
            maintenanceItems.innerHTML = '';
            let filtered = maintenances.filter(m => m.정비날짜); // 빈 회원가입 row 제외
            if (!isAdmin) {
                filtered = filtered.filter(m => m.차량번호 === currentUser.vehicleNumber);
            }
            if (search && search.trim() !== '') {
                const s = search.trim().toLowerCase();
                filtered = filtered.filter(m =>
                    (m.차량번호 && m.차량번호.toLowerCase().includes(s)) ||
                    (m.정비종류 && m.정비종류.toLowerCase().includes(s)) ||
                    (m.설명 && m.설명.toLowerCase().includes(s))
                );
            }
            filtered.forEach((maintenance, idx) => {
                const item = document.createElement('div');
                item.className = 'card mb-3';
                item.innerHTML = `
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <div>
                                <h5 class="card-title mb-0">${maintenance.정비종류}</h5>
                                <h6 class="card-subtitle text-muted">${maintenance.정비날짜}</h6>
                                ${isAdmin ? `<div class='text-muted' style='font-size:0.95em;'>차량번호: ${maintenance.차량번호}</div>` : ''}
                            </div>
                            <span class="badge ${getStatusBadgeClass(maintenance.상태)}" style="font-size:1em;">${getStatusText(maintenance.상태)}</span>
                        </div>
                        <p class="card-text">${maintenance.설명}</p>
                        <div class="d-flex justify-content-end align-items-center mt-2">
                            ${renderActionButtons(maintenance, idx)}
                        </div>
                        <div class="text-end mt-2">
                            <small class="text-muted">
                                ${maintenance.생성일시 ? new Date(maintenance.생성일시).toLocaleString() : ''}
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

function renderActionButtons(maintenance, idx) {
    // Google Sheets에는 row index가 없으므로, 고유값이 필요하면 생성일시+차량번호 등으로 식별
    if (isAdmin && maintenance.상태 === 'pending') {
        return `
            <button class="btn btn-success btn-sm me-2" onclick="approveMaintenance('${maintenance.차량번호}','${maintenance.정비날짜}','${maintenance.정비종류}','${maintenance.설명}')">승인</button>
            <button class="btn btn-danger btn-sm" onclick="rejectMaintenance('${maintenance.차량번호}','${maintenance.정비날짜}','${maintenance.정비종류}','${maintenance.설명}')">거절</button>
        `;
    }
    if (!isAdmin && maintenance.상태 === 'pending') {
        return `<button class="btn btn-danger btn-sm" onclick="deleteMaintenance('${maintenance.차량번호}','${maintenance.정비날짜}','${maintenance.정비종류}','${maintenance.설명}')">삭제</button>`;
    }
    return '';
}

// 승인/거절/삭제 함수 (row 식별: 차량번호+정비날짜+정비종류+설명)
window.approveMaintenance = function(vehicleNumber, date, type, desc) {
    updateStatus(vehicleNumber, date, type, desc, 'approved');
}
window.rejectMaintenance = function(vehicleNumber, date, type, desc) {
    updateStatus(vehicleNumber, date, type, desc, 'rejected');
}
window.deleteMaintenance = function(vehicleNumber, date, type, desc) {
    // 삭제는 상태를 deleted로 변경(실제 삭제는 Apps Script에서 구현 필요)
    updateStatus(vehicleNumber, date, type, desc, 'deleted');
}

function updateStatus(vehicleNumber, date, type, desc, newStatus) {
    // 상태 변경을 위해 전체 데이터를 불러와서 해당 row를 찾아 수정
    fetch(API_URL)
        .then(res => res.json())
        .then(maintenances => {
            // row 찾기
            const idx = maintenances.findIndex(m =>
                m.차량번호 === vehicleNumber &&
                m.정비날짜 === date &&
                m.정비종류 === type &&
                m.설명 === desc
            );
            if (idx > -1) {
                // 기존 row를 덮어쓰기(상태만 변경)
                const row = maintenances[idx];
                row.상태 = newStatus;
                row.수정일시 = new Date().toISOString();
                // Apps Script에 POST로 추가(실제 구현은 appendRow이므로, 중복 row가 생길 수 있음)
                fetch(API_URL, {
                    method: 'POST',
                    body: JSON.stringify(row),
                    headers: { 'Content-Type': 'application/json' }
                })
                .then(res => res.text())
                .then(result => {
                    loadMaintenanceHistory();
                });
            }
        });
}

window.onload = function() {
    loginForm.style.display = 'block';
    maintenanceList.style.display = 'none';
    maintenanceForm.style.display = 'none';
    logoutBtn.style.display = 'none';
    userName.textContent = '';
    addBtnBox.style.display = 'none';
    searchBox.style.display = 'none';
}; 