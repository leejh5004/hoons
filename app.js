// 관리자 이메일 목록
const ADMIN_EMAILS = ['admin1@admin.com', 'admin2@admin.com', 'admin3@admin.com'];

// 관리자 이메일 → 이름 변환 캐시
const adminNameCache = {};

// 전역 변수
let currentUser = null;
let isAdmin = false;

// DOM이 로드된 후 실행
document.addEventListener('DOMContentLoaded', () => {
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

    // 폼 전환
    if (showRegister) {
        showRegister.addEventListener('click', e => {
            e.preventDefault();
            loginForm.style.display = 'none';
            registerForm.style.display = 'block';
        });
    }
    
    if (showLogin) {
        showLogin.addEventListener('click', e => {
            e.preventDefault();
            registerForm.style.display = 'none';
            loginForm.style.display = 'block';
        });
    }

    // 회원가입
    if (registerForm) {
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
    }

    // 로그인
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value.trim().toLowerCase();
            const password = document.getElementById('password').value;
            
            if (!email || !password) {
                showNotification('이메일과 비밀번호를 입력하세요.', 'error');
                return;
            }
            
            auth.signInWithEmailAndPassword(email, password)
                .catch(err => showNotification('로그인 실패: ' + err.message, 'error'));
        });
    }

    // 로그아웃
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            auth.signOut();
        });
    }

    // 검색
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            // 디바운스 처리
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                loadMaintenanceHistory(searchInput.value);
            }, 300);
        });
    }

    // 정비 이력 추가 (관리자만)
    if (addMaintenanceBtn) {
        addMaintenanceBtn.addEventListener('click', () => {
            if (!isAdmin) {
                showNotification('관리자만 정비 이력을 추가할 수 있습니다.', 'error');
                return;
            }
            openMaintenanceInputModal();
        });
    }

    // 정비 이력 폼 취소
    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn && maintenanceForm) {
        cancelBtn.addEventListener('click', () => {
            maintenanceForm.style.display = 'none';
        });
    }

    // 정비 이력 저장
    const newMaintenanceForm = document.getElementById('newMaintenance');
    if (newMaintenanceForm) {
        newMaintenanceForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!isAdmin) return;

            const carNumber = document.getElementById('maintenanceCarNumber').value.trim().toLowerCase().replace(/\\s+/g, '');
            const maintenanceData = {
                carNumber,
                date: document.getElementById('maintenanceDate').value,
                mileage: document.getElementById('maintenanceMileage').value,
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
                    newMaintenanceForm.reset();
                    loadMaintenanceHistory();
                    showNotification('정비 이력이 저장되었습니다.', 'success');
                })
                .catch(err => showNotification('정비 이력 저장 실패: ' + err.message, 'error'));
        });
    }

    // 인증 상태 감지
    auth.onAuthStateChanged(user => {
        if (user) {
            // users 컬렉션이 삭제된 상황을 처리
            db.collection('users').doc(user.uid).get()
                .then(doc => {
                    if (!doc.exists) {
                        // users 컬렉션이 없거나 문서가 없는 경우
                        console.log('Users collection or document not found, attempting to recover...');
                        
                        // 현재 로그인된 사용자의 이메일로 users 컬렉션 재생성
                        return db.collection('users').doc(user.uid).set({
                            email: user.email,
                            carNumber: user.email.split('@')[0], // 임시 차량번호 (이메일 아이디 사용)
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                            isRecovered: true // 복구된 계정 표시
                        }).then(() => {
                            showNotification('계정 정보가 복구되었습니다. 차량번호를 수정해주세요.', 'info');
                            return db.collection('users').doc(user.uid).get();
                        });
                    }
                    return doc;
                })
                .then(doc => {
                    if (doc.exists) {
                        currentUser = {
                            uid: user.uid,
                            email: user.email,
                            carNumber: doc.data().carNumber
                        };
                        isAdmin = ADMIN_EMAILS.includes(user.email);
                        
                        // UI 업데이트
                        updateUI();
                        
                        // 정비 이력 로드
                        loadMaintenanceHistory();
                    }
                })
                .catch(error => {
                    console.error('Error handling user data:', error);
                    showNotification('사용자 정보를 처리하는데 실패했습니다.', 'error');
                    auth.signOut();
                });
        } else {
            // 로그아웃 상태
            currentUser = null;
            isAdmin = false;
            
            // UI 초기화
            if (loginForm) loginForm.style.display = 'block';
            if (registerForm) registerForm.style.display = 'none';
            if (maintenanceList) maintenanceList.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (addBtnBox) addBtnBox.style.display = 'none';
            if (searchBox) searchBox.style.display = 'none';
            if (maintenanceItems) maintenanceItems.innerHTML = '';
            
            const updateCarNumberBtn = document.getElementById('updateCarNumberBtn');
            if (updateCarNumberBtn) {
                updateCarNumberBtn.style.display = 'none';
            }
        }
    });

    // 정비 이력 입력 모달 열기/닫기 함수
    window.openMaintenanceInputModal = function() {
        const modal = document.getElementById('maintenanceInputModal');
        const backdrop = document.getElementById('modalBackdrop');
        if (modal && backdrop) {
            modal.classList.add('show');
            backdrop.classList.add('show');
        }
    }
    window.closeMaintenanceInputModal = function() {
        const modal = document.getElementById('maintenanceInputModal');
        const backdrop = document.getElementById('modalBackdrop');
        if (modal && backdrop) {
            modal.classList.remove('show');
            backdrop.classList.remove('show');
        }
    }

    // 모달 폼 제출 시 정비이력 저장
    const newMaintenanceModalForm = document.getElementById('newMaintenanceModalForm');
    if (newMaintenanceModalForm) {
        newMaintenanceModalForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!isAdmin) return;

            const carNumber = document.getElementById('maintenanceCarNumberModal').value.trim().toLowerCase().replace(/\s+/g, '');
            const maintenanceData = {
                carNumber,
                date: document.getElementById('maintenanceDateModal').value,
                mileage: document.getElementById('maintenanceMileageModal').value,
                type: document.getElementById('maintenanceTypeModal').value,
                description: document.getElementById('descriptionModal').value,
                status: 'pending',
                adminEmail: currentUser.email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            db.collection('maintenance').add(maintenanceData)
                .then(() => {
                    closeMaintenanceInputModal();
                    newMaintenanceModalForm.reset();
                    loadMaintenanceHistory();
                    showNotification('정비 이력이 저장되었습니다.', 'success');
                })
                .catch(err => showNotification('정비 이력 저장 실패: ' + err.message, 'error'));
        });
    }
});

// 관리자 이메일로 이름 가져오기 (비동기)
async function getAdminNameByEmail(email) {
    if (adminNameCache[email]) return adminNameCache[email];
    const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();
    if (!snapshot.empty) {
        const name = snapshot.docs[0].data().name || email;
        adminNameCache[email] = name;
        return name;
    }
    return email;
}

// 정비카드 생성 함수 비동기로 변경
async function createMaintenanceCard(maintenance) {
    const card = document.createElement('div');
    card.className = 'maintenance-card glass-card';
    card.onclick = () => showMaintenanceDetail(maintenance);

    // 관리자 이름 가져오기
    let adminName = maintenance.adminName;
    if (!adminName && maintenance.adminEmail) {
        adminName = await getAdminNameByEmail(maintenance.adminEmail);
    }

    // 상태별 활성화/비활성화 클래스
    const approvedClass = maintenance.status === 'approved' ? '' : ' badge-inactive';
    const rejectedClass = maintenance.status === 'rejected' ? '' : ' badge-inactive';
    const pendingClass = maintenance.status === 'pending' ? '' : ' badge-inactive';

    // 도장(관리자 이름) 노출 조건: 승인/거절 상태일 때만
    const showAdminSeal = maintenance.status === 'approved' || maintenance.status === 'rejected';

    card.innerHTML = `
        <div class="maintenance-card-header">
            <span class="maintenance-type-icon">${getTypeIcon(maintenance.type)}</span>
            <span class="maintenance-card-title">${maintenance.type || ''}</span>
            <span class="maintenance-date">${maintenance.date || ''}</span>
            <span class="maintenance-status-badge ${maintenance.status}">${getStatusText(maintenance.status)}</span>
        </div>
        <div class="maintenance-card-body">
            <div class="maintenance-car-number">차량번호: ${maintenance.carNumber}</div>
            ${maintenance.mileage ? `<div class="maintenance-mileage">키로수: ${maintenance.mileage}km</div>` : ''}
            <div class="maintenance-description">${maintenance.description || ''}</div>
        </div>
        <div class="maintenance-card-footer">
            ${showAdminSeal ? `<span class="maintenance-admin">관리자 ${adminName}</span>` : ''}
            ${!isAdmin && maintenance.status === 'pending' ? `
                <button class="btn btn-success btn-sm" onclick="updateMaintenanceStatus('${maintenance.id}', 'approved')">
                    <i class="fas fa-check"></i> 승인
                </button>
                <button class="btn btn-danger btn-sm" onclick="updateMaintenanceStatus('${maintenance.id}', 'rejected')">
                    <i class="fas fa-times"></i> 거절
                </button>
            ` : ''}
        </div>
    `;
    return card;
}

// 정비 이력 상세 보기 모달 열기
function showMaintenanceDetail(maintenance) {
    const modal = document.getElementById('maintenanceDetailModal');
    const backdrop = document.getElementById('modalBackdrop');
    
    if (!modal || !backdrop) return;

    // 모달 내용 업데이트
    const detailType = modal.querySelector('.detail-type');
    const detailDate = modal.querySelector('.detail-date');
    const detailStatus = modal.querySelector('.detail-status');
    const detailCarNumber = modal.querySelector('.detail-car-number');
    const detailMileage = modal.querySelector('.detail-mileage');
    const detailDescription = modal.querySelector('.detail-description');
    const detailAdmin = modal.querySelector('.detail-admin');

    if (detailType) {
        detailType.innerHTML = `${getTypeIcon(maintenance.type)} ${maintenance.type || ''}`;
    }
    if (detailDate) {
        detailDate.textContent = maintenance.date || '';
    }
    if (detailStatus) {
        detailStatus.textContent = getStatusText(maintenance.status);
        detailStatus.className = `detail-status ${maintenance.status}`;
    }
    if (detailCarNumber) {
        detailCarNumber.textContent = `차량번호: ${maintenance.carNumber}`;
    }
    if (detailMileage) {
        detailMileage.textContent = maintenance.mileage ? `키로수: ${maintenance.mileage}km` : '';
    }
    if (detailDescription) {
        detailDescription.textContent = maintenance.description || '';
    }
    if (detailAdmin) {
        detailAdmin.innerHTML = maintenance.adminName ? 
            `<i class="fas fa-user-shield"></i> 관리자: ${maintenance.adminName}` : '';
    }

    // 모달 표시
    modal.classList.add('show');
    backdrop.classList.add('show');
}

// 정비 이력 상세 보기 모달 닫기
function closeMaintenanceDetailModal() {
    if (confirm('이전 화면으로 돌아가시겠습니까?')) {
        const modal = document.getElementById('maintenanceDetailModal');
        const backdrop = document.getElementById('modalBackdrop');
        
        if (modal && backdrop) {
            modal.classList.remove('show');
            backdrop.classList.remove('show');
        }
    }
}

// 정비 이력 목록을 비동기로 렌더링
async function loadMaintenanceHistory(search = '') {
    const maintenanceItems = document.getElementById('maintenanceItems');
    if (!maintenanceItems) return;

    maintenanceItems.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> 로딩중...</div>';

    let query = db.collection('maintenance');
    if (isAdmin) {
        query = query.where('adminEmail', '==', currentUser.email);
    } else if (currentUser) {
        query = query.where('carNumber', '==', currentUser.carNumber);
    }

    try {
        const snapshot = await query.orderBy('createdAt', 'desc').get();
        maintenanceItems.innerHTML = '';
        let maintenances = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            maintenances.push({ ...data, id: doc.id });
        });

        if (search && search.trim() !== '') {
            const searchTerms = search.trim().toLowerCase().split(/\s+/);
            maintenances = maintenances.filter(m => {
                const type = (m.type || '').toLowerCase();
                const description = (m.description || '').toLowerCase();
                const carNumber = (m.carNumber || '').toLowerCase();
                const date = (m.date || '').toLowerCase();
                return searchTerms.every(term =>
                    type.includes(term) ||
                    description.includes(term) ||
                    carNumber.includes(term) ||
                    date.includes(term)
                );
            });
        }

        if (maintenances.length === 0) {
            maintenanceItems.innerHTML = `
                <div class="no-data">
                    <i class="fas fa-search fa-2x mb-3"></i>
                    <p>검색 결과가 없습니다.</p>
                    ${search ? '<p class="text-muted">다른 검색어를 입력해보세요.</p>' : '<p class="text-muted">정비 이력이 없습니다.</p>'}
                </div>`;
            return;
        }

        // 타임라인 생성
        const timeline = document.createElement('div');
        timeline.className = 'maintenance-timeline';

        // 카드 비동기 생성
        for (const maintenance of maintenances) {
            const card = await createMaintenanceCard(maintenance);
            timeline.appendChild(card);
        }

        maintenanceItems.appendChild(timeline);
    } catch (error) {
        console.error('Error loading maintenance list:', error);
        showNotification('정비 이력을 불러오는데 실패했습니다.', 'error');
        maintenanceItems.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle fa-2x mb-3"></i>
                <p>정비 이력을 불러오는데 실패했습니다.</p>
                <p class="text-muted">잠시 후 다시 시도해주세요.</p>
            </div>`;
    }
}

// 정비 상태 업데이트 함수 추가
function updateMaintenanceStatus(maintenanceId, newStatus) {
    if (!currentUser) return;
    
    db.collection('maintenance').doc(maintenanceId)
        .update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(() => {
            showNotification(`정비 이력이 ${newStatus === 'approved' ? '승인' : '거절'}되었습니다.`, 'success');
            loadMaintenanceHistory();
        })
        .catch(error => {
            console.error('Error updating maintenance status:', error);
            showNotification('상태 업데이트 실패: ' + error.message, 'error');
        });
}

// 알림 표시
function showNotification(message, type = 'info') {
    // 기존 알림 제거
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // 새 알림 생성
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    // 알림 추가
    document.body.appendChild(notification);

    // 3초 후 자동 제거
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// 아이콘 가져오기 함수들
function getTypeIcon(type) {
    const icons = {
        '일반점검': '<i class="fas fa-tools"></i>',
        '엔진오일교체': '<i class="fas fa-oil-can"></i>',
        '타이어교체': '<i class="fas fa-circle-notch"></i>',
        '브레이크정비': '<i class="fas fa-brake"></i>',
        '기타': '<i class="fas fa-wrench"></i>'
    };
    return icons[type] || icons['기타'];
}

function getStatusIcon(status) {
    const icons = {
        'pending': '<i class="fas fa-clock"></i>',
        'in-progress': '<i class="fas fa-cog fa-spin"></i>',
        'completed': '<i class="fas fa-check"></i>',
        'rejected': '<i class="fas fa-times"></i>',
        'approved': '<i class="fas fa-check-double"></i>'
    };
    return icons[status] || icons['pending'];
}

function getStatusText(status) {
    const statusTexts = {
        'approved': '승인됨',
        'rejected': '거절됨',
        'pending': '대기중'
    };
    return statusTexts[status] || status;
}

// 차량번호 수정 함수 추가
async function updateCarNumber(newCarNumber) {
    if (!currentUser) return;
    
    const trimmedCarNumber = newCarNumber.trim().toLowerCase().replace(/\s+/g, '');
    
    try {
        // 현재 사용자의 차량번호와 동일한 경우 업데이트 불필요
        if (trimmedCarNumber === currentUser.carNumber) {
            showNotification('현재 등록된 차량번호와 동일합니다.', 'info');
            return;
        }
        
        // 차량번호 중복 체크
        const duplicateCheck = await db.collection('users')
            .where('carNumber', '==', trimmedCarNumber)
            .get();
            
        if (!duplicateCheck.empty) {
            showNotification('이미 등록된 차량번호입니다.', 'error');
            return;
        }
        
        // 중복이 없는 경우에만 업데이트 진행
        await db.collection('users').doc(currentUser.uid)
            .update({
                carNumber: trimmedCarNumber,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
        currentUser.carNumber = trimmedCarNumber;
        if (userName) {
            userName.textContent = `차량번호: ${currentUser.carNumber}`;
        }
        showNotification('차량번호가 수정되었습니다.', 'success');
        
    } catch (error) {
        console.error('Error updating car number:', error);
        showNotification('차량번호 수정 실패: ' + error.message, 'error');
    }
}

// 차량번호 수정 모달 관련 함수들
function showCarNumberUpdateModal() {
    const modal = document.getElementById('carNumberModal');
    const backdrop = document.getElementById('modalBackdrop');
    const newCarNumberInput = document.getElementById('newCarNumber');
    
    if (modal && backdrop && newCarNumberInput) {
        newCarNumberInput.value = currentUser.carNumber;
        modal.classList.add('show');
        backdrop.classList.add('show');
        try {
            newCarNumberInput.focus();
        } catch (e) {
            // 모바일 환경 등에서 focus 에러 무시
        }
    }
}

function closeCarNumberModal() {
    const modal = document.getElementById('carNumberModal');
    const backdrop = document.getElementById('modalBackdrop');
    
    if (modal && backdrop) {
        modal.classList.remove('show');
        backdrop.classList.remove('show');
    }
}

function submitCarNumberUpdate() {
    const newCarNumberInput = document.getElementById('newCarNumber');
    if (!newCarNumberInput || !newCarNumberInput.value.trim()) {
        showNotification('차량번호를 입력해주세요.', 'error');
        return;
    }
    
    updateCarNumber(newCarNumberInput.value);
    closeCarNumberModal();
}

// UI 업데이트 함수 수정
function updateUI() {
    if (userName) {
        userName.textContent = isAdmin ? 
            `관리자 (${currentUser.email})` : 
            `차량번호: ${currentUser.carNumber}`;
    }
    
    const updateCarNumberBtn = document.getElementById('updateCarNumberBtn');
    if (updateCarNumberBtn) {
        updateCarNumberBtn.style.display = isAdmin ? 'none' : 'inline-block';
    }
    
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'none';
    if (maintenanceList) maintenanceList.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'block';
    if (addBtnBox) addBtnBox.style.display = 'block';
    if (searchBox) searchBox.style.display = 'block';
} 