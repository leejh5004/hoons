/*
 * TWOHOONS GARAGE - Mobile First Management System
 * Modern motorcycle maintenance management app
 */

// Global variables
let currentUser = null;
let isAdmin = false;
let db = null;
let uploadedPhotos = {}; // 정비전/정비중/정비후 구분 없이 단순화
let adminNameCache = {};
let currentStep = 1;
let currentTheme = 'light';
let currentViewMode = 'card'; // 'card' or 'list'

// Firebase 관련 전역 변수들
let activeListeners = {};
let isLoadingStats = {
    today: false,
    pending: false,
    month: false,
    average: false
};
let queryQueue = new Set();

// Firebase 쿼리 지연 설정
const QUERY_DELAY = 1000; // 1초



// 프로덕션 환경에서 로그 출력 제어
const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const shouldLog = !isProduction || window.location.search.includes('debug=true');
const isDebugMode = window.location.search.includes('debug=true');

function log(...args) {
    if (shouldLog) {
        console.log(...args);
    }
}

// 디버그 모드가 아닐 때는 더 적은 로그만 출력
function debugLog(...args) {
    if (isDebugMode) {
        console.log(...args);
    }
}

// 🚀 클라이언트 사이드 캐싱 시스템 (무료플랜 최적화 + 재시도 로직)
const dataCache = {
    maintenanceTimeline: { data: null, timestamp: null, ttl: 5 * 60 * 1000, retryCount: 0 }, // 5분
    todayStats: { data: null, timestamp: null, ttl: 10 * 60 * 1000, retryCount: 0 }, // 10분
    pendingStats: { data: null, timestamp: null, ttl: 8 * 60 * 1000, retryCount: 0 }, // 8분
    monthStats: { data: null, timestamp: null, ttl: 15 * 60 * 1000, retryCount: 0 }, // 15분
    averageStats: { data: null, timestamp: null, ttl: 20 * 60 * 1000, retryCount: 0 }, // 20분
    notifications: { data: null, timestamp: null, ttl: 2 * 60 * 1000, retryCount: 0 }, // 2분
    recentTransactions: { data: null, timestamp: null, ttl: 8 * 60 * 1000, retryCount: 0 } // 8분
};

// 캐시 유틸리티 함수들
function getCachedData(key) {
    const cached = dataCache[key];
    if (!cached || !cached.data || !cached.timestamp) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
        // TTL 만료시 캐시 삭제
        cached.data = null;
        cached.timestamp = null;
        return null;
    }
    
    // console.log(`📦 Cache HIT: ${key} (${Math.round((now - cached.timestamp) / 1000)}초 전)`);
    return cached.data;
}

function setCachedData(key, data) {
    if (dataCache[key]) {
        dataCache[key].data = data;
        dataCache[key].timestamp = Date.now();
        // console.log(`💾 Cache SET: ${key}`);
    }
}

function clearCachedData(key = null) {
    if (key) {
        if (dataCache[key]) {
            dataCache[key].data = null;
            dataCache[key].timestamp = null;
            dataCache[key].retryCount = 0; // 재시도 카운트 리셋
            console.log(`🗑️ Cache CLEAR: ${key}`);
        }
    } else {
        // 전체 캐시 클리어
        Object.keys(dataCache).forEach(k => {
            dataCache[k].data = null;
            dataCache[k].timestamp = null;
            dataCache[k].retryCount = 0; // 재시도 카운트 리셋
        });
        console.log(`🗑️ Cache CLEAR: ALL`);
    }
}

// 관리자 이메일 목록 (전역 상수) - 마스터 관리자 + 일반 관리자들
// 첫 번째 이메일은 "마스터 관리자"로, 다른 관리자 생성/삭제 권한을 가집니다.
const ADMIN_EMAILS = ['admin@admin.com', 'admin1@admin.com', 'admin2@admin.com', 'hojun121516@naver.com'];

// 마스터 관리자 이메일 (관리자 추가/관리 권한 보유자)
const MASTER_ADMIN_EMAIL = 'admin@admin.com';

// 자동완성 데이터 전역 변수
window.autoCompleteData = {
    parts: [],
    prices: {}
};

// 📸 사진 보존 기간 설정 (30일)
const PHOTO_RETENTION_DAYS = 30;

// 📅 삭제 경고 기간 설정 (5일 전부터 경고)
const DELETE_WARNING_DAYS = 5;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    log('🚀 TWOHOONS GARAGE - Starting application...');
    
    // Initialize Firebase with enhanced error handling
    if (typeof firebase !== 'undefined') {
        try {
            // Firebase 앱이 초기화되었는지 확인
            if (!firebase.apps.length) {
                console.error('❌ Firebase 앱이 초기화되지 않았습니다');
                showNotification('Firebase 초기화 실패. 페이지를 새로고침해주세요.', 'error');
                return;
            }
            
            db = firebase.firestore();
            
            // 기본 Firebase 초기화만 수행

            
        } catch (error) {
            console.error('❌ Firebase 초기화 실패:', error);
            showNotification('Firebase 연결 실패. 페이지를 새로고침해주세요.', 'error');
            // 자동 재시도 로직 추가
            setTimeout(() => {
                location.reload();
            }, 3000);
            return;
        }
    } else {
        console.error('❌ Firebase 라이브러리 로드 실패');
        showNotification('Firebase 라이브러리 로드 실패. 페이지를 새로고침해주세요.', 'error');
        // 자동 재시도 로직 추가
        setTimeout(() => {
            location.reload();
        }, 3000);
        return;
    }
    
    // 네트워크 상태 초기 확인 및 모니터링 시작
    console.log('🌐 네트워크 상태 확인:', navigator.onLine ? '온라인' : '오프라인');
    if (!navigator.onLine) {
        handleOfflineMode();
    }
    
    // 네트워크 상태 변화 감지 시작
    updateNetworkStatusDisplay();
    
    // Initialize critical components only
    initializeAuthSystem();
    initializeThemeSystem();
    

    
    // Check authentication state
    firebase.auth().onAuthStateChanged(handleAuthStateChange);
    
    // Initialize other components after user login
    window.addEventListener('user-authenticated', () => {
        initializeMobileOptimization();
        initializeNavigation();
        initializeModals();
        initializeEventListeners();
        initializeSearchAndFilters();
        initializeNotificationSystem(); // 알림 시스템 초기화 추가
        loadViewMode();
        
        // Firebase 연결 상태 모니터링 시작
        monitorFirebaseConnection();
        

        

    });
    
    console.log('Application initialized successfully');
    console.log('💡 개발자 도구 명령어를 보려면 showConsoleHelp() 를 실행하세요');
    

});

// =============================================
// Authentication System
// =============================================

function initializeAuthSystem() {
    const authTabs = document.querySelectorAll('.auth-tab');
    const authForms = document.querySelectorAll('.auth-form');
    
    // Tab switching
    authTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            // Update active tab
            authTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active form
            authForms.forEach(form => {
                form.classList.remove('active');
                if (form.id === `${targetTab}Form`) {
                    form.classList.add('active');
                }
            });
        });
    });
    
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Register form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
    
    // 오토바이 번호 도움말 시스템 초기화
    initializeMotorcycleNumberHelper();
}

// 오토바이 번호 도움말 시스템 초기화
function initializeMotorcycleNumberHelper() {
    const helpBtn = document.getElementById('motorcycleHelpBtn');
    const carNumberInput = document.getElementById('registerCarNumber');
    
    if (helpBtn) {
        helpBtn.addEventListener('click', showMotorcycleNumberHelp);
    }
    
    if (carNumberInput) {
        // 실시간 검증
        carNumberInput.addEventListener('input', validateMotorcycleNumber);
        carNumberInput.addEventListener('blur', validateMotorcycleNumber);
        
        // 한글 입력 지원
        carNumberInput.addEventListener('compositionend', validateMotorcycleNumber);
    }
}

// 오토바이 번호 도움말 모달 표시
function showMotorcycleNumberHelp() {
    // 기존 모달 제거
    const existingModal = document.getElementById('motorcycleHelpModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modalHTML = `
        <div id="motorcycleHelpModal" class="modal-overlay active">
            <div class="modal-container" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-motorcycle"></i>
                        오토바이 번호 입력 가이드
                    </h2>
                    <button class="modal-close" onclick="closeMotorcycleHelpModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="modal-body">
                    <div class="help-section">
                        <h3><i class="fas fa-info-circle"></i> 오토바이 번호판 위치</h3>
                        <p>오토바이 번호판은 다음 위치에서 확인할 수 있습니다:</p>
                        <ul class="help-list">
                            <li><strong>뒷번호판:</strong> 오토바이 뒷부분 (메인 번호판)</li>
                            <li><strong>등록증:</strong> 이륜차 등록증에서도 확인 가능</li>
                        </ul>
                    </div>
                    
                    <div class="help-section">
                        <h3><i class="fas fa-list-ul"></i> 오토바이 번호 형식</h3>
                        <div class="format-examples">
                            <div class="format-item">
                                <h4>🌍 지역형 (지역명+차종+숫자)</h4>
                                <div class="examples">
                                    <span class="example-badge">제주서귀포차3107</span>
                                    <span class="example-badge">부산해운대바1234</span>
                                    <span class="example-badge">경기수원가5678</span>
                                    <span class="example-badge">인천중구나9012</span>
                                    <span class="example-badge">서울강남차2468</span>
                                    <span class="example-badge">대구달서바1357</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="help-section">
                        <h3><i class="fas fa-exclamation-triangle"></i> 입력 시 주의사항</h3>
                        <ul class="help-list">
                            <li>띄어쓰기 없이 붙여서 입력해주세요</li>
                            <li>한글과 숫자를 정확히 입력해주세요</li>
                            <li>영문자가 아닌 한글을 사용해주세요 (가나다라마 등)</li>
                            <li>번호판에 표시된 그대로 입력해주세요</li>
                        </ul>
                    </div>
                    
                    <div class="help-section">
                        <h3><i class="fas fa-search"></i> 번호를 모르시겠다면</h3>
                        <ul class="help-list">
                            <li>이륜차 등록증을 확인해보세요</li>
                            <li>보험증서에서도 확인 가능합니다</li>
                            <li>오토바이 뒷부분 번호판을 직접 확인해보세요</li>
                            <li>가입 후에도 프로필에서 수정 가능합니다</li>
                        </ul>
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="closeMotorcycleHelpModal()">
                        <i class="fas fa-check"></i>
                        이해했습니다
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// 오토바이 번호 도움말 모달 닫기
function closeMotorcycleHelpModal() {
    const modal = document.getElementById('motorcycleHelpModal');
    if (modal) {
        modal.remove();
    }
}

// 오토바이 번호 실시간 검증
function validateMotorcycleNumber() {
    const input = document.getElementById('registerCarNumber');
    const validationDiv = document.getElementById('motorcycleValidation');
    const validationMessage = document.getElementById('validationMessage');
    
    if (!input || !validationDiv || !validationMessage) return;
    
    const value = input.value.trim();
    
    if (!value) {
        validationDiv.style.display = 'none';
        return;
    }
    
    // 오토바이 번호 패턴 검증 (지역형만)
    const patterns = [
        /^[가-힣]{2,}[가-힣]\d{4}$/, // 지역형: 제주서귀포차3107
        /^[가-힣]{3,}[가-힣]\d{4}$/, // 기타 지역형 패턴
    ];
    
    const isValid = patterns.some(pattern => pattern.test(value));
    
    validationDiv.style.display = 'flex';
    
    if (isValid) {
        validationDiv.className = 'input-validation valid';
        validationDiv.querySelector('i').className = 'fas fa-check-circle';
        validationMessage.textContent = '올바른 오토바이 번호 형식입니다!';
    } else {
        validationDiv.className = 'input-validation';
        validationDiv.querySelector('i').className = 'fas fa-exclamation-triangle';
        
        if (value.length < 5) {
            validationMessage.textContent = '번호가 너무 짧습니다. 다시 확인해주세요.';
        } else if (!/[가-힣]/.test(value)) {
            validationMessage.textContent = '한글이 포함되어야 합니다. (예: 가, 나, 다, 차, 바 등)';
        } else if (!/\d/.test(value)) {
            validationMessage.textContent = '숫자가 포함되어야 합니다.';
        } else {
            validationMessage.textContent = '올바른 형식이 아닙니다. 도움말을 참고해주세요.';
        }
    }
}

// 전역 함수로 등록
window.showMotorcycleNumberHelp = showMotorcycleNumberHelp;
window.closeMotorcycleHelpModal = closeMotorcycleHelpModal;

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        showNotification('이메일과 비밀번호를 입력해주세요.', 'error');
        return;
    }
    
    try {
        showNotification('로그인 중...', 'info');
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
        console.log('✅ Login successful');
    } catch (error) {
        console.error('❌ Login error:', error);
        let errorMessage = '로그인에 실패했습니다.';
        
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = '등록되지 않은 이메일입니다.';
                break;
            case 'auth/wrong-password':
                errorMessage = '비밀번호가 틀렸습니다.';
                break;
            case 'auth/invalid-email':
                errorMessage = '올바른 이메일 형식을 입력해주세요.';
                break;
        }
        
        showNotification(errorMessage, 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const carNumber = document.getElementById('registerCarNumber').value.trim().toLowerCase().replace(/\s+/g, '');
    
    if (!name || !email || !password || !carNumber) {
        showNotification('모든 필드를 입력해주세요.', 'error');
        return;
    }
    
    if (password.length < 6) {
        showNotification('비밀번호는 6자 이상이어야 합니다.', 'error');
        return;
    }
    
    try {
        showNotification('회원가입 중...', 'info');
        
        // Create user account
        const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Save user data to Firestore
        await db.collection('users').doc(user.uid).set({
            name: name,
            email: email,
            carNumber: carNumber,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            role: 'user'
        });
        
        console.log('✅ Registration successful');
        showNotification('회원가입이 완료되었습니다!', 'success');
        
    } catch (error) {
        console.error('❌ Registration error:', error);
        let errorMessage = '회원가입에 실패했습니다.';
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = '이미 사용 중인 이메일입니다.';
                break;
            case 'auth/invalid-email':
                errorMessage = '올바른 이메일 형식을 입력해주세요.';
                break;
            case 'auth/weak-password':
                errorMessage = '비밀번호가 너무 약합니다.';
                break;
        }
        
        showNotification(errorMessage, 'error');
    }
}

// =============================================
// Password Reset System
// =============================================

function showPasswordResetModal() {
    console.log('🔐 Password reset modal opening...');
    const modal = document.getElementById('passwordResetModal');
    const form = document.getElementById('passwordResetForm');
    const resetSuccess = document.getElementById('resetSuccess');
    const sendBtn = document.getElementById('sendResetBtn');
    
    if (modal) {
        // 초기화
        if (form) form.style.display = 'block';
        if (resetSuccess) resetSuccess.style.display = 'none';
        if (sendBtn) sendBtn.style.display = 'block';
        
        const emailInput = document.getElementById('resetEmail');
        if (emailInput) emailInput.value = '';
        
        modal.classList.add('active');
        console.log('✅ Modal activated');
        
        // 폼 제출 이벤트 리스너 추가
        if (form && !form.hasAttribute('data-listener-added')) {
            form.addEventListener('submit', handlePasswordReset);
            form.setAttribute('data-listener-added', 'true');
            console.log('✅ Form listener added');
        }
    } else {
        console.error('❌ Password reset modal not found');
        showNotification('모달을 찾을 수 없습니다. 페이지를 새로고침해주세요.', 'error');
    }
}

// 전역으로 함수 노출
window.showPasswordResetModal = showPasswordResetModal;

function closePasswordResetModal() {
    console.log('🔐 Closing password reset modal...');
    const modal = document.getElementById('passwordResetModal');
    if (modal) {
        modal.classList.remove('active');
        console.log('✅ Modal closed');
    }
}

// 전역으로 함수 노출
window.closePasswordResetModal = closePasswordResetModal;

async function handlePasswordReset(e) {
    e.preventDefault();
    
    const email = document.getElementById('resetEmail').value.trim();
    const sendBtn = document.getElementById('sendResetBtn');
    const form = document.getElementById('passwordResetForm');
    const resetSuccess = document.getElementById('resetSuccess');
    
    if (!email) {
        showNotification('이메일을 입력해주세요.', 'error');
        return;
    }
    
    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showNotification('올바른 이메일 형식을 입력해주세요.', 'error');
        return;
    }
    
    try {
        // 버튼 비활성화 및 로딩 상태
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 전송 중...';
        
        // Firebase에서 비밀번호 재설정 이메일 발송
        await firebase.auth().sendPasswordResetEmail(email);
        
        // 성공 시 UI 업데이트
        form.style.display = 'none';
        resetSuccess.style.display = 'block';
        sendBtn.style.display = 'none';
        
        console.log('✅ Password reset email sent to:', email);
        
        // 5초 후 모달 자동 닫기
        setTimeout(() => {
            closePasswordResetModal();
        }, 5000);
        
    } catch (error) {
        console.error('❌ Password reset error:', error);
        let errorMessage = '비밀번호 재설정 이메일 전송에 실패했습니다.';
        
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = '등록되지 않은 이메일입니다.';
                break;
            case 'auth/invalid-email':
                errorMessage = '올바른 이메일 형식을 입력해주세요.';
                break;
            case 'auth/too-many-requests':
                errorMessage = '너무 많은 요청이 있었습니다. 잠시 후 다시 시도해주세요.';
                break;
        }
        
        showNotification(errorMessage, 'error');
        
        // 버튼 원상복구
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> 재설정 링크 보내기';
    }
}

async function handleAuthStateChange(user) {
    if (user) {
        console.log('User authenticated:', user.email);
        
        try {
            // 네트워크 연결 상태 확인
            if (!navigator.onLine) {
                console.warn('⚠️ 오프라인 상태에서 인증됨 - 기본 사용자 정보로 진행');
                handleOfflineMode();
                
                // 오프라인 모드에서 기본 사용자 정보 설정
                const isAdminEmail = ADMIN_EMAILS.includes(user.email);
                currentUser = {
                    uid: user.uid,
                    email: user.email,
                    name: isAdminEmail ? '관리자' : '사용자',
                    carNumber: isAdminEmail ? 'admin1' : '',
                    role: isAdminEmail ? 'admin' : 'user'
                };
                isAdmin = isAdminEmail;
                
                showScreen('dashboard');
                showNotification('오프라인 모드로 실행 중입니다.', 'warning');
                return;
            }
            
            // Firebase 네트워크 활성화 (안전하게)
            try {
                if (db && typeof db.enableNetwork === 'function') {
                    await db.enableNetwork();
                }
            } catch (networkError) {
                console.warn('⚠️ Firebase 네트워크 활성화 실패:', networkError);
            }
            
            // 사용자 데이터 로딩 (간단하게)
            let userDoc;
            try {
                userDoc = await db.collection('users').doc(user.uid).get();
            } catch (error) {
                // 오프라인 모드로 즉시 전환
                const isAdminEmail = ADMIN_EMAILS.includes(user.email);
                currentUser = {
                    uid: user.uid,
                    email: user.email,
                    name: isAdminEmail ? '관리자' : '사용자',
                    carNumber: isAdminEmail ? 'admin1' : '',
                    role: isAdminEmail ? 'admin' : 'user'
                };
                isAdmin = isAdminEmail;
                
                showScreen('dashboardScreen');
                showNotification('오프라인 모드로 실행 중입니다.', 'warning');
                return;
            }
            
            if (userDoc && userDoc.exists) {
                const userData = userDoc.data();
                
                // 관리자 이메일 체크
                const isAdminEmail = ADMIN_EMAILS.includes(user.email);
                
                currentUser = {
                    uid: user.uid,
                    email: user.email,
                    name: userData.name || (isAdminEmail ? '관리자' : '사용자'),
                    carNumber: userData.carNumber || (isAdminEmail ? 'admin1' : ''),
                    role: isAdminEmail ? 'admin' : 'user' // 🔒 이메일 기반으로만 role 결정
                };
                
                // 관리자 권한 부여 (이메일 기반으로만)
                isAdmin = isAdminEmail;
                
                // 🔒 사용자 role 보안 검증 및 수정
                const correctRole = isAdminEmail ? 'admin' : 'user';
                if (userData.role !== correctRole) {
                    console.log(`🔧 Correcting user role from '${userData.role}' to '${correctRole}'`);
                    await db.collection('users').doc(user.uid).update({
                        role: correctRole,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    currentUser.role = correctRole;
                }
                
                // 관리자 계정이지만 이름이 없는 경우 자동으로 업데이트
                if (isAdminEmail && !userData.name) {
                    console.log('🔧 Updating admin user data...');
                    await db.collection('users').doc(user.uid).update({
                        name: '관리자',
                        carNumber: userData.carNumber || 'admin1',
                        role: 'admin',
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
                
                // Switch to dashboard
                showScreen('dashboardScreen');
                updateUI();
                
                // 자동으로 대시보드 데이터 로드 (새로고침 시에도)
                setTimeout(() => {
                    loadDashboardData();
                }, 300);
                
                // 🚀 사용자 인증 완료 이벤트 발생
                window.dispatchEvent(new CustomEvent('user-authenticated'));
                
                // 환영 메시지는 한 번만 표시 (자동 로그인 시에는 표시하지 않음)
                if (!window.hasShownWelcomeMessage) {
                    showNotification(`환영합니다, ${currentUser.name}님!`, 'success');
                    window.hasShownWelcomeMessage = true;
                }
            } else {
                console.log('📄 User document not found, creating new user...');
                
                // 관리자 이메일 체크
                const isAdminEmail = ADMIN_EMAILS.includes(user.email);
                
                if (isAdminEmail) {
                    // 관리자 계정 생성
                    const adminData = {
                        name: '관리자',
                        email: user.email,
                        carNumber: 'admin1',
                        role: 'admin',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    
                    await db.collection('users').doc(user.uid).set(adminData);
                    
                    currentUser = {
                        uid: user.uid,
                        email: user.email,
                        name: '관리자',
                        carNumber: 'admin1',
                        role: 'admin'
                    };
                    
                    isAdmin = true;
                    
                } else {
                    // 일반 사용자 계정 자동 생성
                    const userData = {
                        name: user.displayName || user.email.split('@')[0], // 이메일 앞부분을 이름으로 사용
                        email: user.email,
                        carNumber: '', // 나중에 설정 가능
                        role: 'user',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    
                    await db.collection('users').doc(user.uid).set(userData);
                    
                    currentUser = {
                        uid: user.uid,
                        email: user.email,
                        name: userData.name,
                        carNumber: '',
                        role: 'user'
                    };
                    
                    isAdmin = false;
                }
                
                // 공통 처리: 로그인 완료 후 대시보드 이동
                showScreen('dashboardScreen');
                updateUI();
                loadDashboardData();
                

                
                // 🚀 사용자 인증 완료 이벤트 발생
                window.dispatchEvent(new CustomEvent('user-authenticated'));
            }
            
        } catch (error) {
            console.error('❌ Error loading user data:', error);
            showNotification('사용자 정보 로딩 실패', 'error');
        }
        
    } else {
        console.log('👋 User signed out');
        currentUser = null;
        isAdmin = false;
        showScreen('loginScreen');
    }
}

async function handleLogout() {
    try {
        // Firebase 리스너 정리
        cleanupFirebaseListeners();
        
        await firebase.auth().signOut();
        
        // 🔒 모든 사용자 데이터 완전 초기화
        currentUser = null;
        isAdmin = false;
        
        // 환영 메시지 플래그 초기화
        window.hasShownWelcomeMessage = false;
        
        // 🔔 알림 패널 닫기 및 완전 초기화
        closeNotificationPanel();
        const notificationList = document.getElementById('notificationList');
        if (notificationList) {
            notificationList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">로그인 후 알림을 확인하세요</div>';
        }
        
        // 🔴 알림 배지 완전 초기화
        const badge = document.querySelector('.notification-badge');
        if (badge) {
            badge.style.display = 'none';
            badge.textContent = '0';
        }
        
        // 👤 프로필 메뉴 초기화
        const profileDropdown = document.getElementById('profileDropdown');
        if (profileDropdown) {
            profileDropdown.style.display = 'none';
        }
        
        // 🚫 모든 모달 강제 닫기
        const modals = document.querySelectorAll('.modal-overlay');
        modals.forEach(modal => {
            try {
                modal.remove();
            } catch (error) {
                console.log('Modal already removed:', error);
            }
        });
        
        // 📱 타임라인 초기화
        const timelineContent = document.getElementById('timelineContent');
        if (timelineContent) {
            timelineContent.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">로그인 후 정비 이력을 확인하세요</div>';
        }
        
        showNotification('로그아웃되었습니다.', 'info');
        
        // 로그인 화면으로 강제 이동
        showScreen('loginScreen');
        
    } catch (error) {
        console.error('❌ Logout error:', error);
        showNotification('로그아웃 실패', 'error');
    }
}

// =============================================
// Theme System
// =============================================

function initializeThemeSystem() {
    const themeToggle = document.getElementById('themeToggle');
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
}

function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

function toggleTheme() {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    showNotification(`${newTheme === 'dark' ? '다크' : '라이트'} 모드로 변경되었습니다.`, 'info');
}

// =============================================
// Mobile Optimization
// =============================================

// 모바일 터치 이벤트 최적화
function initializeMobileOptimization() {
    // 터치 이벤트 지원 확인
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    console.log('📱 Touch device detected:', isTouchDevice);
    
    // 모바일에서 스크롤 성능 개선
    if (isTouchDevice) {
        document.body.style.webkitOverflowScrolling = 'touch';
        
        // 터치 이벤트 최적화
        document.addEventListener('touchstart', function() {}, { passive: true });
        document.addEventListener('touchmove', function() {}, { passive: true });
        document.addEventListener('touchend', function() {}, { passive: true });
    }
    
    // 모바일 뷰포트 높이 조정 (iOS Safari 대응)
    function setViewportHeight() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    
    setViewportHeight();
    window.addEventListener('resize', setViewportHeight);
    window.addEventListener('orientationchange', setViewportHeight);
}

// =============================================
// Navigation System
// =============================================

function initializeNavigation() {
    console.log('🎯 Initializing navigation system...');
    
    // 기존 이벤트 리스너 정리
    if (window.navigationInitialized) {
        console.log('⚠️ Navigation already initialized, cleaning up...');
        // 기존 이벤트 리스너 제거
        const existingNavItems = document.querySelectorAll('.nav-item');
        existingNavItems.forEach(item => {
            item.replaceWith(item.cloneNode(true));
        });
    }
    
    // 새로운 네비게이션 요소들 찾기
    const navItems = document.querySelectorAll('.nav-item');
    const profileBtn = document.getElementById('profileBtn');
    
    console.log('📱 Found navigation items:', navItems.length);
    
    // Bottom navigation 이벤트 리스너 등록
    navItems.forEach((item, index) => {
        console.log(`🔗 Adding event listener to nav item ${index + 1}:`, item.dataset.screen);
        
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const screen = item.dataset.screen;
            console.log('🎯 Navigation clicked:', screen);
            
            // Update active nav item
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // Handle navigation
            switch (screen) {
                case 'dashboard':
                    console.log('🏠 Navigating to dashboard');
                    showScreen('dashboardScreen');
                    loadDashboardData();
                    break;
                case 'add':
                    console.log('➕ Opening maintenance modal');
                    openMaintenanceModal();
                    break;
                case 'taxation':
                    console.log('💰 Navigating to taxation');
                    // 🔒 세무 화면 접근 권한 확인 - 관리자만 허용
                    if (!isAdmin) {
                        showNotification('관리자만 세무 화면에 접근할 수 있습니다.', 'error');
                        return;
                    }
                    showScreen('taxationScreen');
                    loadTaxationData();
                    break;
                case 'search':
                    console.log('🔍 Focusing search input');
                    focusSearchInput();
                    break;
                case 'profile':
                    console.log('👤 Showing profile options');
                    showProfileOptions();
                    break;
                default:
                    console.warn('⚠️ Unknown navigation screen:', screen);
            }
        });
    });
    
    // Profile button 이벤트 리스너
    if (profileBtn) {
        console.log('👤 Adding profile button event listener');
        profileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showProfileOptions();
        });
    }
    
    // 초기화 완료 표시
    window.navigationInitialized = true;
    console.log('✅ Navigation system initialized successfully');
}

function showScreen(screenId) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => {
        screen.classList.remove('active');
        if (screen.id === screenId) {
            screen.classList.add('active');
        }
    });
}

function focusSearchInput() {
    const searchInput = document.getElementById('quickSearch');
    if (searchInput) {
        searchInput.focus();
    }
}

function showProfileOptions() {
    const options = [];
    
    // 마스터 관리자 전용 메뉴 (다른 관리자 생성)
    if (currentUser && currentUser.email === MASTER_ADMIN_EMAIL) {
        options.push({
            text: '새 관리자 추가',
            action: () => showAddAdminModal(),
            icon: 'fas fa-user-plus'
        });
    }
    
    // 관리자 / 일반 사용자 공통 또는 전용 메뉴
    options.push({ text: '로그아웃', action: handleLogout, icon: 'fas fa-sign-out-alt' });
    
    if (!isAdmin) {
        options.unshift({ 
            text: '오토바이 번호 수정', 
            action: () => showCarNumberModal(), 
            icon: 'fas fa-motorcycle' 
        });
    } else {
        // 관리자 전용 메뉴
        options.unshift({ 
            text: '오래된 사진 정리', 
            action: () => manualPhotoCleanup(), 
            icon: 'fas fa-broom' 
        });

        options.unshift({ 
            text: '월별 견적서 다운로드', 
            action: () => showMonthlyEstimateModal(), 
            icon: 'fas fa-download' 
        });

        options.unshift({ 
            text: '견적서 조회', 
            action: () => showEstimateSearchModal(), 
            icon: 'fas fa-search' 
        });
        options.unshift({ 
            text: '견적서 생성', 
            action: () => showEstimateModal(), 
            icon: 'fas fa-file-invoice-dollar' 
        });
    }
    
    // Create and show profile modal
    showContextMenu(options);
}

// 오토바이 번호 수정 모달 표시
function showCarNumberModal() {
    // 🔒 로그인 상태 확인
    if (!currentUser) {
        showNotification('로그인이 필요합니다.', 'error');
        showScreen('auth');
        return;
    }
    
    // 관리자는 오토바이 번호 수정 불가
    if (isAdmin) {
        showNotification('관리자는 오토바이 번호를 수정할 수 없습니다.', 'error');
        return;
    }
    
    // 기존 모달 제거
    const existingModal = document.getElementById('carNumberModal');
    if (existingModal) {
        try {
            existingModal.remove();
        } catch (error) {
            console.log('Modal already removed:', error);
        }
    }
    
    const currentCarNumber = currentUser?.carNumber || '';
    
    const modalHTML = `
        <div id="carNumberModal" class="modal-overlay active">
            <div class="modal-container" style="max-width: 400px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-motorcycle"></i> 오토바이 번호 수정
                    </h2>
                    <button class="modal-close" onclick="closeCarNumberModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="modal-body">
                    <form id="carNumberForm">
                        <div class="form-group">
                            <label for="newCarNumber">새 오토바이 번호</label>
                            <div class="input-with-icon">
                                <i class="fas fa-motorcycle"></i>
                                <input type="text" id="newCarNumber" value="${currentCarNumber}" placeholder="예: 제주서귀포차3107" required>
                            </div>
                            <small style="color: #666; font-size: 12px; margin-top: 8px; display: block;">
                                현재: ${currentCarNumber || '없음'}
                            </small>
                        </div>
                    </form>
                </div>
                
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeCarNumberModal()">
                        <i class="fas fa-times"></i> 취소
                    </button>
                    <button class="btn btn-primary" onclick="handleCarNumberUpdate()">
                        <i class="fas fa-save"></i> 저장
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // 폼 이벤트 리스너 추가
    setTimeout(() => {
        const input = document.getElementById('newCarNumber');
        const form = document.getElementById('carNumberForm');
        
        if (input) {
            input.focus();
            input.select();
            
            // Enter 키로 제출 가능
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCarNumberUpdate();
                }
            });
        }
        
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                handleCarNumberUpdate();
            });
        }
    }, 100);
}

// 새 관리자 추가 모달
function showAddAdminModal() {
    // 🔒 로그인 및 권한 체크
    if (!currentUser || currentUser.email !== MASTER_ADMIN_EMAIL) {
        showNotification('새 관리자 추가는 마스터 관리자만 가능합니다.', 'error');
        return;
    }
    
    // 기존 모달 제거
    const existingModal = document.getElementById('addAdminModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modalHTML = `
        <div id="addAdminModal" class="modal-overlay active">
            <div class="modal-container" style="max-width: 420px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-user-shield"></i>
                        새 관리자 추가
                    </h2>
                    <button class="modal-close" onclick="closeAddAdminModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="modal-body">
                    <form id="addAdminForm" class="simple-form">
                        <div class="input-group">
                            <i class="fas fa-envelope input-icon"></i>
                            <input type="email" id="newAdminEmail" placeholder="관리자 이메일" required>
                        </div>
                        <div class="input-group">
                            <i class="fas fa-user input-icon"></i>
                            <input type="text" id="newAdminName" placeholder="관리자 이름/상호 (선택)">
                        </div>
                        <p class="helper-text">
                            ✅ 이 이메일로 처음 로그인하면 자동으로 <strong>새 관리자 계정</strong>이 생성되고,<br>
                            다른 관리자 데이터와 완전히 분리된 <strong>별도 업체 공간</strong>에서 시작합니다.
                        </p>
                    </form>
                </div>
                
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeAddAdminModal()">
                        <i class="fas fa-times"></i>
                        취소
                    </button>
                    <button class="btn btn-primary" id="createAdminBtn" onclick="handleCreateAdmin(event)">
                        <i class="fas fa-user-plus"></i>
                        관리자 추가
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function closeAddAdminModal() {
    const modal = document.getElementById('addAdminModal');
    if (modal) {
        modal.remove();
    }
}

// 새 관리자 메타데이터 생성 (Firebase Auth 계정은 첫 로그인 시 사용자가 직접 생성)
async function handleCreateAdmin(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    if (!currentUser || currentUser.email !== MASTER_ADMIN_EMAIL) {
        showNotification('새 관리자 추가는 마스터 관리자만 가능합니다.', 'error');
        return;
    }
    
    const emailInput = document.getElementById('newAdminEmail');
    const nameInput = document.getElementById('newAdminName');
    
    if (!emailInput) return;
    
    const email = emailInput.value.trim();
    const name = nameInput ? nameInput.value.trim() : '';
    
    if (!email) {
        showNotification('관리자 이메일을 입력해주세요.', 'error');
        return;
    }
    
    try {
        // 이미 ADMIN_EMAILS에 있으면 안내만
        if (ADMIN_EMAILS.includes(email)) {
            showNotification('이미 관리자 목록에 있는 이메일입니다.', 'info');
            closeAddAdminModal();
            return;
        }
        
        // Firestore users 컬렉션에 "예약된 관리자" 문서 생성
        // 실제 uid는 첫 로그인 시 createUserWithEmailAndPassword 후 handleAuthStateChange에서 매칭
        await db.collection('pendingAdmins').add({
            email,
            name: name || email.split('@')[0],
            role: 'admin',
            createdBy: currentUser.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showNotification('새 관리자 이메일이 등록되었습니다. 해당 이메일로 가입 후 로그인하면 관리자 계정으로 동작합니다.', 'success');
        closeAddAdminModal();
    } catch (error) {
        console.error('❌ Error creating admin metadata:', error);
        showNotification('새 관리자 등록 중 오류가 발생했습니다.', 'error');
    }
}

// 전역에서 접근 가능하도록 등록
window.showAddAdminModal = showAddAdminModal;
window.closeAddAdminModal = closeAddAdminModal;
window.handleCreateAdmin = handleCreateAdmin;

// 오토바이 번호 수정 모달 닫기
function closeCarNumberModal() {
    const modal = document.getElementById('carNumberModal');
    if (modal) {
        try {
            modal.remove();
        } catch (error) {
            console.log('Modal already removed:', error);
        }
    }
}

// 오토바이 번호 업데이트 처리
async function handleCarNumberUpdate() {
    // 🔒 보안 검사: 로그인 상태 확인
    if (!currentUser) {
        showNotification('로그인이 필요합니다.', 'error');
        closeCarNumberModal();
        showScreen('auth');
        return;
    }
    
    // 🔒 보안 검사: 관리자 차단
    if (isAdmin) {
        showNotification('관리자는 오토바이 번호를 수정할 수 없습니다.', 'error');
        closeCarNumberModal();
        return;
    }
    
    const newCarNumber = document.getElementById('newCarNumber')?.value?.trim();
    
    if (!newCarNumber) {
        showNotification('오토바이 번호를 입력해주세요.', 'error');
        return;
    }
    
    if (newCarNumber === currentUser?.carNumber) {
        showNotification('현재 번호와 동일합니다.', 'info');
        return;
    }
    
    try {
        await updateCarNumber(newCarNumber);
        closeCarNumberModal();
    } catch (error) {
        console.error('❌ Error updating car number:', error);
    }
}

// 전역 함수로 등록
window.showCarNumberModal = showCarNumberModal;
window.closeCarNumberModal = closeCarNumberModal;
window.handleCarNumberUpdate = handleCarNumberUpdate;

// =============================================
// 알림 시스템
// =============================================

// 알림 데이터 저장
let notifications = [];
let unreadCount = 0;

// 알림 초기화 함수
function initializeNotificationSystem() {
    console.log('🔔 Initializing notification system...');
    
    // 중복 초기화 방지
    if (window.notificationSystemInitialized) {
        console.log('⚠️ Notification system already initialized');
        return;
    }
    
    const notificationBtn = document.getElementById('notificationBtn');
    if (notificationBtn) {
        console.log('🔔 Adding notification button event listener');
        
        // 기존 이벤트 리스너 제거
        const newBtn = notificationBtn.cloneNode(true);
        notificationBtn.parentNode.replaceChild(newBtn, notificationBtn);
        
        // 새로운 이벤트 리스너 추가
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔔 Notification button clicked');
            showNotificationPanel();
        });
    } else {
        console.log('⚠️ Notification button not found');
    }
    
    // 기존 알림 로딩
    loadNotifications();
    
    // 초기화 완료 표시
    window.notificationSystemInitialized = true;
    console.log('✅ Notification system initialized successfully');
}

// 알림 패널 표시
function showNotificationPanel() {
    console.log('🔔 Showing notification panel...');
    
    // 🔒 로그인 상태 확인
    if (!currentUser) {
        showNotification('로그인이 필요합니다.', 'error');
        showScreen('auth');
        return;
    }
    
    // 기존 패널 제거
    const existingPanel = document.getElementById('notificationPanel');
    if (existingPanel) {
        try {
            existingPanel.remove();
        } catch (error) {
            console.log('Panel already removed:', error);
        }
        return; // 토글 효과
    }
    
    const panelHTML = `
        <div id="notificationPanel" class="notification-panel" style="
            position: fixed;
            top: 60px;
            right: 16px;
            width: 380px;
            max-width: calc(100vw - 32px);
            max-height: calc(100vh - 60px - 32px);
            background: var(--surface, #ffffff);
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
            z-index: 10000;
            overflow: hidden;
            animation: slideInFromRight 0.2s ease-out;
        ">
            <div class="notification-panel-header" style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px;
                border-bottom: 1px solid var(--secondary-200, #e5e7eb);
                background: var(--bg-secondary, #f9fafb);
            ">
                <h3 style="
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                    color: var(--text-primary, #111827);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                "><i class="fas fa-bell"></i> 알림</h3>
                <button class="clear-all-btn" onclick="clearAllNotifications()" style="
                    background: none;
                    border: none;
                    color: var(--primary-600, #2563eb);
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    padding: 8px;
                    border-radius: 6px;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                ">
                    <i class="fas fa-check-double"></i> 모두 읽음
                </button>
            </div>
            <div class="notification-panel-body" id="notificationPanelBody" style="
                max-height: 400px;
                overflow-y: auto;
            ">
                ${notifications.length > 0 ? 
                    notifications.map(notification => createNotificationItem(notification)).join('') :
                    '<div class="no-notifications" style="text-align: center; padding: 40px 20px; color: var(--text-secondary, #6b7280);"><i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i><p style="margin: 0;">새로운 알림이 없습니다</p></div>'
                }
            </div>
        </div>
        <div class="notification-panel-backdrop" onclick="closeNotificationPanel()" style="
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.3);
            z-index: 9999;
        "></div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', panelHTML);
    
    // 애니메이션 추가
    const panel = document.getElementById('notificationPanel');
    if (panel) {
        panel.style.transform = 'translateX(100%)';
        panel.style.opacity = '0';
        
        setTimeout(() => {
            panel.style.transform = 'translateX(0)';
            panel.style.opacity = '1';
        }, 10);
    }
    
    // 모든 알림을 읽음으로 표시
    markAllAsRead();
}

// 알림 패널 닫기
function closeNotificationPanel() {
    console.log('🔔 Closing notification panel...');
    
    const panel = document.getElementById('notificationPanel');
    const backdrop = document.querySelector('.notification-panel-backdrop');
    
    if (panel) {
        // 애니메이션으로 닫기
        panel.style.transform = 'translateX(100%)';
        panel.style.opacity = '0';
        
        setTimeout(() => {
            try {
                panel.remove();
            } catch (error) {
                console.log('Panel already removed:', error);
            }
        }, 200);
    }
    
    if (backdrop) {
        backdrop.style.opacity = '0';
        setTimeout(() => {
            try {
                backdrop.remove();
            } catch (error) {
                console.log('Backdrop already removed:', error);
            }
        }, 200);
    }
}

// 알림 아이템 생성
function createNotificationItem(notification) {
    const timeAgo = getTimeAgo(notification.createdAt);
    const iconClass = getNotificationIcon(notification.type);
    const statusColor = getNotificationColor(notification.type);
    
    const unreadStyle = !notification.read ? 'background: var(--primary-25, #f8faff);' : '';
    const unreadIndicator = !notification.read ? '<div class="unread-indicator" style="position: absolute; top: 16px; right: 16px; width: 8px; height: 8px; border-radius: 50%; background: var(--primary-500, #3b82f6);"></div>' : '';
    
    return `
        <div class="notification-item ${notification.read ? 'read' : 'unread'}" data-id="${notification.id}" style="display: flex; align-items: flex-start; gap: 12px; padding: 16px; border-bottom: 1px solid var(--secondary-100, #f3f4f6); position: relative; transition: all 0.2s ease; ${unreadStyle}">
            <div class="notification-icon" style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: ${statusColor}; color: white; font-size: 16px; flex-shrink: 0;">
                <i class="${iconClass}"></i>
            </div>
            <div class="notification-content" style="flex: 1; min-width: 0;">
                <h4 class="notification-title" style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: var(--text-primary, #111827); line-height: 1.4;">${notification.title}</h4>
                <p class="notification-message" style="margin: 0 0 8px 0; font-size: 13px; color: var(--text-secondary, #6b7280); line-height: 1.4;">${notification.message}</p>
                <span class="notification-time" style="font-size: 12px; color: var(--text-tertiary, #9ca3af);">${timeAgo}</span>
            </div>
            ${unreadIndicator}
        </div>
    `;
}

// 알림 색상 가져오기
function getNotificationColor(type) {
    const colors = {
        'success': 'linear-gradient(135deg, #10b981, #059669)',
        'error': 'linear-gradient(135deg, #ef4444, #dc2626)',
        'warning': 'linear-gradient(135deg, #f59e0b, #d97706)',
        'info': 'linear-gradient(135deg, #06b6d4, #0891b2)',
        'maintenance': 'linear-gradient(135deg, #3b82f6, #2563eb)'
    };
    return colors[type] || colors['info'];
}

// 시간 경과 표시
function getTimeAgo(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now - time) / 1000);
    
    if (diffInSeconds < 60) return '방금 전';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}분 전`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}시간 전`;
    
    return time.toLocaleDateString('ko-KR');
}

// 새 알림 추가
function addNotification(title, message, type = 'info') {
    const notification = {
        id: Date.now().toString(),
        title,
        message,
        type,
        read: false,
        createdAt: new Date().toISOString()
    };
    
    notifications.unshift(notification);
    unreadCount++;
    
    // Firebase에 저장
    saveNotificationToFirebase(notification);
    
    // UI 업데이트
    updateNotificationBadge();
    
    // 토스트 알림도 표시
    showNotification(`${title}: ${message}`, type);
    
    console.log('🔔 New notification added:', notification);
}

// Firebase에 알림 저장
async function saveNotificationToFirebase(notification) {
    if (!currentUser) return;
    
    if (!db) {
        console.error('❌ Firebase 데이터베이스 연결 없음');
        return;
    }
    
    try {
        await db.collection('notifications').add({
            ...notification,
            userId: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('✅ Notification saved to Firebase');
    } catch (error) {
        console.error('❌ Error saving notification:', error);
        
        // Firebase 오류 상세 처리
        if (error.code === 'unavailable') {
            console.warn('⚠️ 네트워크 연결 불안정으로 알림 저장 실패');
        } else if (error.code === 'permission-denied') {
            console.warn('⚠️ 권한 없음으로 알림 저장 실패');
        }
    }
}

// Firebase에서 알림 로딩
async function loadNotifications() {
    if (!currentUser) return;
    
    if (!db) {
        console.error('❌ Firebase 데이터베이스 연결 없음');
        return;
    }
    
    try {
        // 기존 알림 리스너 정리
        if (activeListeners.notifications) {
            console.log('🧹 기존 알림 리스너 정리 중...');
            activeListeners.notifications();
            activeListeners.notifications = null;
        }
        
        // safeFirebaseQuery를 사용하여 Target ID 충돌 방지
        const snapshot = await safeFirebaseQuery('loadNotifications', async () => {
            console.log('🔍 Executing Firebase query: loadNotifications');
            return await db.collection('notifications')
                .where('userId', '==', currentUser.uid)
                .orderBy('createdAt', 'desc')
                .limit(100)
                .get();
        });
        
        if (!snapshot) {
            console.log('❌ loadNotifications query returned null, skipping...');
            return;
        }
        
        notifications = [];
        unreadCount = 0;
        
        // 클라이언트 측에서 정렬 및 제한
        const notificationData = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const notification = {
                id: doc.id,
                ...data,
                createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
                createdAtTimestamp: data.createdAt ? data.createdAt.toDate().getTime() : new Date().getTime()
            };
            notificationData.push(notification);
        });
        
        // 클라이언트 측에서 날짜순 정렬 (최신순)
        notificationData.sort((a, b) => b.createdAtTimestamp - a.createdAtTimestamp);
        
        // 최대 50개로 제한
        notifications = notificationData.slice(0, 50);
        
        // 읽지 않은 알림 수 계산
        notifications.forEach(notification => {
            if (!notification.read) {
                unreadCount++;
            }
        });
        
        updateNotificationBadge();
        console.log('📱 Loaded notifications:', notifications.length);
        
    } catch (error) {
        console.error('❌ Error loading notifications:', error);
        
        // Firebase 오류 상세 처리
        if (error.code === 'unavailable') {
            console.warn('⚠️ 네트워크 연결 불안정으로 알림 로딩 실패');
        } else if (error.code === 'permission-denied') {
            console.warn('⚠️ 권한 없음으로 알림 로딩 실패');
        } else if (error.code === 'already-exists') {
            console.warn('⚠️ Target ID 충돌로 알림 로딩 실패 - 재시도 예정');
            // 짧은 지연 후 재시도
            setTimeout(() => {
                loadNotifications();
            }, 1000);
        }
    }
}

// 모든 알림을 읽음으로 표시
async function markAllAsRead() {
    if (unreadCount === 0) return;
    
    try {
        await safeFirebaseQuery('markAllAsRead', async () => {
            const batch = db.batch();
            
            notifications.forEach(notification => {
                if (!notification.read) {
                    notification.read = true;
                    const notificationRef = db.collection('notifications').doc(notification.id);
                    batch.update(notificationRef, { read: true });
                }
            });
            
            await batch.commit();
            unreadCount = 0;
            updateNotificationBadge();
            
            console.log('✅ All notifications marked as read');
        });
        
    } catch (error) {
        console.error('❌ Error marking notifications as read:', error);
        if (error.code === 'already-exists') {
            console.warn('⚠️ Target ID 충돌로 알림 읽음 처리 실패');
        }
    }
}

// 모든 알림 지우기
async function clearAllNotifications() {
    try {
        await safeFirebaseQuery('clearAllNotifications', async () => {
            const batch = db.batch();
            
            notifications.forEach(notification => {
                const notificationRef = db.collection('notifications').doc(notification.id);
                batch.delete(notificationRef);
            });
            
            await batch.commit();
            
            notifications = [];
            unreadCount = 0;
            updateNotificationBadge();
            
            closeNotificationPanel();
            showNotification('모든 알림이 삭제되었습니다.', 'success');
            
            console.log('🗑️ All notifications cleared');
        });
        
    } catch (error) {
        console.error('❌ Error clearing notifications:', error);
        if (error.code === 'already-exists') {
            console.warn('⚠️ Target ID 충돌로 알림 삭제 실패');
        }
        showNotification('알림 삭제 실패', 'error');
    }
}

// 정비 상태 변경 시 알림 생성
function createMaintenanceNotification(maintenanceId, status, maintenanceType = '정비') {
    let title, message, type;
    
    switch (status) {
        case 'approved':
            title = '정비 확인됨';
            message = `${maintenanceType} 정비가 확인되었습니다.`;
            type = 'success';
            break;
        case 'rejected':
            title = '정비 거절됨';
            message = `${maintenanceType} 정비가 거절되었습니다.`;
            type = 'error';
            break;
        case 'completed':
            title = '정비 완료';
            message = `${maintenanceType} 정비가 완료되었습니다.`;
            type = 'success';
            break;
        default:
            return;
    }
    
    addNotification(title, message, type);
}

// 전역 함수로 등록
window.showNotificationPanel = showNotificationPanel;
window.closeNotificationPanel = closeNotificationPanel;
window.clearAllNotifications = clearAllNotifications;

function showContextMenu(options) {
    // Simple context menu implementation
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--surface);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xl);
        padding: var(--space-sm);
        z-index: var(--z-modal);
        min-width: 200px;
    `;
    
    options.forEach(option => {
        const item = document.createElement('button');
        item.className = 'context-menu-item';
        item.style.cssText = `
            width: 100%;
            padding: var(--space-md);
            background: transparent;
            border: none;
            border-radius: var(--radius-md);
            color: var(--text-primary);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            transition: all var(--transition-fast);
        `;
        
        item.innerHTML = `<i class="${option.icon}"></i> ${option.text}`;
        item.addEventListener('click', () => {
            option.action();
            try {
                if (menu.parentNode) {
                    menu.remove();
                }
            } catch (error) {
                console.log('Menu already removed:', error);
            }
        });
        
        item.addEventListener('mouseenter', () => {
            item.style.background = 'var(--bg-secondary)';
        });
        
        item.addEventListener('mouseleave', () => {
            item.style.background = 'transparent';
        });
        
        menu.appendChild(item);
    });
    
    // Close on outside click
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.3);
        z-index: var(--z-modal-backdrop);
    `;
    
    overlay.addEventListener('click', () => {
        try {
            if (menu.parentNode) {
                menu.remove();
            }
            if (overlay.parentNode) {
                overlay.remove();
            }
        } catch (error) {
            console.log('Menu/overlay already removed:', error);
        }
    });
    
    document.body.appendChild(overlay);
    document.body.appendChild(menu);
}

// =============================================
// Firebase Connection System
// =============================================

// Firebase 쿼리 안전 실행 함수 (강화된 버전)
async function safeFirebaseQuery(queryId, queryFunction) {
    try {
        // 중복 실행 방지
        if (queryQueue.has(queryId)) {
            console.log(`⚠️ Query ${queryId} already in progress, skipping...`);
            return null;
        }
        
        // 쿼리 큐에 추가
        queryQueue.add(queryId);
        
        // Target ID 오류 방지를 위한 지연
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 실제 쿼리 실행
        const result = await queryFunction();
        return result;
        
    } catch (error) {
        console.error(`❌ Firebase query error for ${queryId}:`, error);
        
        // Target ID already exists 오류 처리
        if (error.message?.includes('Target ID already exists')) {
            console.log(`⚠️ Target ID conflict for ${queryId}`);
            // 사용자가 직접 재시도하도록 오류 전파
        }
        
        // 오프라인 에러 처리
        if (error.code === 'unavailable' || error.message?.includes('offline') || error.message?.includes('client is offline')) {
            showNotification('네트워크 연결을 확인해주세요.', 'error');
        }
        
        // Firebase 내부 오류 처리
        if (error.message?.includes('INTERNAL ASSERTION FAILED') || error.message?.includes('Unexpected state')) {
            showNotification('Firebase 연결 오류. 페이지를 새로고침해주세요.', 'error');
        }
        
        throw error;
    } finally {
        // 쿼리 큐에서 제거
        queryQueue.delete(queryId);
    }
}

// Firebase 리스너 정리 함수 (기본 버전)
function cleanupFirebaseListeners() {
    Object.keys(activeListeners).forEach(key => {
        if (activeListeners[key]) {
            activeListeners[key]();
            activeListeners[key] = null;
        }
    });
}

// 페이지 언로드 시 리스너 정리
window.addEventListener('beforeunload', () => {
    cleanupFirebaseListeners();
});

// 페이지 로드 시 초기화 (한 번만 실행)
let pageLoaded = false;
window.addEventListener('load', () => {
    if (pageLoaded) return;
    pageLoaded = true;
    
    console.log('🔄 페이지 로드 시 초기화...');
    
    // 자동 로그인 상태 확인 (새로고침 시에도 로그인 유지)
    setTimeout(() => {
        if (firebase.auth().currentUser && !currentUser) {
            console.log('🔄 자동 로그인 상태 확인 중...');
            // 자동 로그인 시에는 환영 메시지 표시하지 않음
            window.hasShownWelcomeMessage = true;
            handleAuthStateChange(firebase.auth().currentUser);
        }
    }, 1000); // 1초 지연
});

// 페이지 포커스 시 간단한 상태 확인
let focusTimeout;
window.addEventListener('focus', () => {
    if (focusTimeout) {
        clearTimeout(focusTimeout);
    }
    
    focusTimeout = setTimeout(() => {
        if (db && currentUser) {
            // 간단한 네트워크 활성화만
            db.enableNetwork().catch(error => {
                console.warn('⚠️ Firebase 네트워크 활성화 실패:', error);
            });
        }
    }, 1000);
});

// 네비게이션 시 리스너 정리
window.addEventListener('popstate', () => {
    console.log('🔍 네비게이션 감지 - 리스너 정리');
    cleanupFirebaseListeners();
});

// Firebase 연결 상태 체크 함수
function checkFirebaseConnection() {
    console.log('🔍 Firebase 연결 상태 확인 중...');
    console.log('  - db 객체:', !!db);
    console.log('  - currentUser:', !!currentUser);
    console.log('  - currentUser.email:', currentUser?.email);
    
    if (!db) {
        console.error('❌ Firebase 데이터베이스 연결 없음');
        showNotification('데이터베이스 연결 오류. 페이지를 새로고침해주세요.', 'error');
        return false;
    }
    
    if (!currentUser) {
        console.error('❌ 사용자 인증 정보 없음');
        showNotification('로그인이 필요합니다.', 'error');
        return false;
    }
    
    if (!currentUser.email) {
        console.error('❌ 사용자 이메일 정보 없음');
        showNotification('사용자 인증 정보가 불완전합니다.', 'error');
        return false;
    }
    
    console.log('✅ Firebase 연결 상태 정상');
    return true;
}

// 오프라인 상태 감지 및 처리
function handleOfflineMode() {
    console.log('📱 오프라인 모드 감지');
    showNotification('오프라인 상태입니다. 네트워크 연결을 확인해주세요.', 'warning');
    
    // 기존 오프라인 표시가 있다면 제거
    const existingIndicator = document.getElementById('offlineIndicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // 오프라인 상태 UI 표시 (연결 복구 버튼 포함)
    const offlineIndicator = document.createElement('div');
    offlineIndicator.id = 'offlineIndicator';
    offlineIndicator.style.cssText = `
        position: fixed;
        top: 70px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #ff9800, #f57c00);
        color: white;
        padding: 12px 20px;
        border-radius: 25px;
        font-size: 14px;
        z-index: 9999;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 10px;
        max-width: 90vw;
        animation: slideDown 0.3s ease-out;
    `;
    
    offlineIndicator.innerHTML = `
        <span>🌐 오프라인 모드</span>
        <button onclick="manualNetworkReconnect()" style="
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
        " onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">
            🔄 재연결
        </button>
    `;
    
    // CSS 애니메이션 추가
    if (!document.getElementById('offlineIndicatorStyles')) {
        const style = document.createElement('style');
        style.id = 'offlineIndicatorStyles';
        style.textContent = `
            @keyframes slideDown {
                from {
                    transform: translateX(-50%) translateY(-100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(-50%) translateY(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(offlineIndicator);
}

// 온라인 상태 복구 처리
function handleOnlineMode() {
    console.log('🌐 온라인 모드 복구');
    // 네트워크 복구 알림 제거 - 백그라운드에서만 처리
    
    // 오프라인 표시 제거
    const offlineIndicator = document.getElementById('offlineIndicator');
    if (offlineIndicator) {
        offlineIndicator.remove();
    }
    
    // Firebase 재연결 시도
    if (db) {
        attemptFirebaseReconnection();
    }
}

// 네트워크 상태 감지 이벤트 리스너
window.addEventListener('online', handleOnlineMode);
window.addEventListener('offline', handleOfflineMode);

// 수동 네트워크 연결 복구 함수
async function manualNetworkReconnect() {
    console.log('👆 수동 네트워크 연결 복구 시도');
    // 수동 복구 시에만 알림 표시 (사용자가 직접 요청한 경우)
    showNotification('네트워크 연결을 복구하고 있습니다...', 'info');
    
    try {
        // 1. 브라우저 네트워크 상태 확인
        if (!navigator.onLine) {
            showNotification('인터넷 연결을 확인해주세요.', 'warning');
            return false;
        }
        
        // 2. Firebase 재연결 시도
        const reconnected = await attemptFirebaseReconnection();
        
        if (reconnected) {
            // 3. 성공 시 데이터 다시 로드
            if (currentUser) {
                console.log('🔄 데이터 다시 로딩...');
                await loadDashboardData();
                showNotification('연결이 복구되어 데이터를 다시 불러왔습니다.', 'success');
            }
            return true;
        } else {
            showNotification('연결 복구에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
            return false;
        }
    } catch (error) {
        console.error('❌ 수동 연결 복구 실패:', error);
        showNotification('연결 복구 중 오류가 발생했습니다.', 'error');
        return false;
    }
}

// 전역에서 접근 가능하도록 설정
window.manualNetworkReconnect = manualNetworkReconnect;

// 개발자용 디버깅 함수들
window.debugFirebaseConnection = async function() {
    console.log('🔍 Firebase 연결 상태 디버깅 시작');
    console.log('📊 현재 상태:', {
        browserOnline: navigator.onLine,
        firebaseDb: !!db,
        currentUser: currentUser?.email || 'null',
        activeListeners: Object.keys(activeListeners).filter(key => activeListeners[key] !== null)
    });
    
    if (db) {
        try {
            console.log('🔄 Firebase 연결 테스트 중...');
            await db.doc('test/connection').get();
            console.log('✅ Firebase 연결 정상');
        } catch (error) {
            console.error('❌ Firebase 연결 실패:', error);
        }
    }
};

window.forceFirebaseReconnect = async function() {
    console.log('🔧 강제 Firebase 재연결 시작');
    cleanupFirebaseListeners();
    return await attemptFirebaseReconnection();
};

window.clearOfflineIndicator = function() {
    const indicator = document.getElementById('offlineIndicator');
    if (indicator) {
        indicator.remove();
        console.log('🧹 오프라인 표시 제거됨');
    }
};

// PDF 라이브러리 문제 해결 도구 함수들
window.fixPDFLibraryIssue = async function() {
    console.log('🔧 PDF 라이브러리 문제 해결 시작');
    
    // 1. 현재 상태 확인
    const status = checkPDFLibraryStatus();
    console.log('📊 현재 PDF 라이브러리 상태:', status);
    
    // 2. 수동 로드 시도
    showNotification('PDF 라이브러리를 수동으로 로드하는 중...', 'info');
    const manualLoadSuccess = await tryLoadJsPDFManually();
    
    if (manualLoadSuccess) {
        showNotification('PDF 라이브러리 로드 성공! 🎉', 'success');
        console.log('✅ PDF 라이브러리 문제 해결 완료');
    } else {
        showNotification('PDF 라이브러리 로드에 실패했습니다. 페이지를 새로고침해주세요.', 'error');
        console.log('❌ PDF 라이브러리 문제 해결 실패');
    }
    
    return manualLoadSuccess;
};

window.showPDFLibraryHelp = function() {
    const helpModal = document.createElement('div');
    helpModal.className = 'modal-overlay';
    helpModal.innerHTML = `
        <div class="modal-container" style="max-width: 500px;">
            <div class="modal-header">
                <h2 class="modal-title">
                    <i class="fas fa-file-pdf"></i>
                    PDF 라이브러리 문제 해결
                </h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div style="margin-bottom: 20px;">
                    <h4>🔍 현재 상태 확인</h4>
                    <button onclick="checkPDFLibraryStatus()" class="btn btn-secondary" style="margin: 5px;">
                        상태 확인
                    </button>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h4>🔧 자동 해결 시도</h4>
                    <button onclick="fixPDFLibraryIssue()" class="btn btn-primary" style="margin: 5px;">
                        자동 해결
                    </button>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h4>📱 수동 해결 방법</h4>
                    <ol style="margin: 10px 0; padding-left: 20px;">
                        <li>페이지를 새로고침하세요</li>
                        <li>브라우저 캐시를 삭제하세요</li>
                        <li>다른 브라우저를 시도해보세요</li>
                        <li>인터넷 연결을 확인하세요</li>
                    </ol>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <h4>🚀 개발자 도구</h4>
                    <p style="font-size: 12px; color: #666; margin: 5px 0;">
                        브라우저 콘솔에서 다음 함수들을 사용할 수 있습니다:
                    </p>
                    <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px;">
                        checkPDFLibraryStatus()<br/>
                        waitForJsPDFLibrary()<br/>
                        tryLoadJsPDFManually()<br/>
                        fixPDFLibraryIssue()
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                    닫기
                </button>
                <button class="btn btn-success" onclick="location.reload()" style="margin-left: 8px;">
                    페이지 새로고침
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(helpModal);
    console.log('📖 PDF 라이브러리 도움말 표시됨');
};

// 콘솔 명령어 도움말 출력
window.showConsoleHelp = function() {
    console.log(`
🚀 TWOHOONS GARAGE - 개발자 도구 명령어

📄 PDF 라이브러리 관련:
  checkPDFLibraryStatus()      - PDF 라이브러리 상태 확인
  waitForJsPDFLibrary()        - PDF 라이브러리 로딩 대기
  tryLoadJsPDFManually()       - PDF 라이브러리 수동 로드
  fixPDFLibraryIssue()         - PDF 라이브러리 문제 자동 해결
  showPDFLibraryHelp()         - PDF 문제 해결 도움말 표시

🌐 네트워크 연결 관련:
  debugFirebaseConnection()    - Firebase 연결 상태 디버깅
  forceFirebaseReconnect()     - 강제 Firebase 재연결
  manualNetworkReconnect()     - 수동 네트워크 재연결
  clearOfflineIndicator()      - 오프라인 표시 제거

🔧 시스템 관리:
  verifyAndFixAdminStatus()    - 관리자 권한 확인/수정
  setupAdminUser()             - 관리자 사용자 설정
  cleanupFirebaseListeners()   - Firebase 리스너 정리
  fixTargetIdConflict()        - Target ID 충돌 해결

📊 데이터 관리:
  clearFirebaseCache()         - Firebase 캐시 정리
  debugPhotoIssue()            - 사진 관리 디버그

💡 도움말:
  showConsoleHelp()            - 이 도움말 표시
  
사용 예시:
  checkPDFLibraryStatus()      // PDF 상태 확인
  fixPDFLibraryIssue()         // PDF 문제 해결
  debugFirebaseConnection()    // 연결 상태 확인
`);
};

// 네트워크 상태 표시 업데이트 함수
function updateNetworkStatusDisplay() {
    const isOnline = navigator.onLine;
    const statusElement = document.getElementById('networkStatus');
    
    if (statusElement) {
        statusElement.textContent = isOnline ? '온라인' : '오프라인';
        statusElement.className = `network-status ${isOnline ? 'online' : 'offline'}`;
    }
    
    // 오프라인/온라인 상태에 따른 UI 업데이트
    if (isOnline) {
        handleOnlineMode();
    } else {
        handleOfflineMode();
    }
}

// Firebase 네트워크 연결 복구 시도
async function attemptFirebaseReconnection() {
    if (!db) return false;
    
    try {
        console.log('🔄 Firebase 재연결 시도...');
        
        // 브라우저 네트워크 상태 확인
        if (!navigator.onLine) {
            console.warn('⚠️ 브라우저가 오프라인 상태입니다.');
            // 자동 재연결 시에는 오프라인 알림 제거 - 진짜 오프라인일 때만 handleOfflineMode에서 처리
            return false;
        }
        
        // Firebase 네트워크 재설정 (단계별 진행)
        console.log('1️⃣ Firebase 네트워크 비활성화...');
        await db.disableNetwork();
        
        console.log('2️⃣ 잠시 대기 중...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        console.log('3️⃣ Firebase 네트워크 활성화...');
        await db.enableNetwork();
        
        console.log('4️⃣ 연결 테스트 중...');
        // 더 간단한 연결 테스트
        await db.doc('test/connection').get();
        
        console.log('✅ Firebase 재연결 성공');
        // 자동 재연결 시에는 알림 제거 - 백그라운드에서만 처리
        
        // 온라인 상태 표시 업데이트
        const offlineIndicator = document.getElementById('offlineIndicator');
        if (offlineIndicator) {
            offlineIndicator.remove();
        }
        
        return true;
    } catch (error) {
        console.error('❌ Firebase 재연결 실패:', error);
        
        // 에러 타입별 세분화된 메시지
        let errorMessage = '네트워크 연결 복구 실패';
        if (error.code === 'unavailable') {
            errorMessage = 'Firebase 서버에 연결할 수 없습니다';
        } else if (error.code === 'permission-denied') {
            errorMessage = '접근 권한이 없습니다';
        } else if (error.message && error.message.includes('offline')) {
            errorMessage = '오프라인 상태입니다';
            handleOfflineMode(); // 오프라인 모드 처리
        }
        
        showNotification(`${errorMessage}. 잠시 후 다시 시도됩니다.`, 'warning');
        return false;
    }
}

// Firebase 연결 상태 실시간 모니터링
function monitorFirebaseConnection() {
    if (!db) return;
    
    // 연결 상태 모니터링 (알림 없이 백그라운드에서만)
    db.enableNetwork().then(() => {
        console.log('🌐 Firebase 연결 활성화');
    }).catch(error => {
        console.warn('⚠️ Firebase 연결 문제:', error);
        // 알림 제거 - 백그라운드에서만 처리
    });
    
    // 주기적으로 연결 상태 체크 (5분마다) - 알림 없이
    setInterval(async () => {
        try {
            await db.enableNetwork();
            console.log('💓 Firebase 연결 상태 양호');
        } catch (error) {
            console.warn('⚠️ Firebase 연결 상태 불안정:', error);
            
            // 재연결 시도 (알림 없이)
            const reconnected = await attemptFirebaseReconnection();
            // 알림 제거 - 백그라운드에서만 재연결 처리
        }
    }, 300000); // 5분 = 300000ms
}

// =============================================
// Dashboard System
// =============================================

// 캐시 우선 로딩 함수 (즉시 반응을 위한)
async function loadCachedDataFirst() {
    console.log('⚡ 캐시된 데이터 우선 표시...');
    
    // 캐시된 데이터가 있으면 즉시 표시
    const cachedStats = {
        today: getCachedData('todayStats'),
        pending: getCachedData('pendingStats'),
        month: getCachedData('monthStats'),
        average: getCachedData('averageStats'),
        timeline: getCachedData('maintenanceTimeline')
    };
    
    // 캐시된 데이터가 있으면 즉시 UI 업데이트
    if (cachedStats.today !== null) {
        updateStatCard('todayCount', cachedStats.today);
    }
    if (cachedStats.pending !== null) {
        updateStatCard('pendingCount', cachedStats.pending);
    }
    if (cachedStats.month !== null) {
        updateStatCard('monthCount', cachedStats.month);
    }
    if (cachedStats.average !== null) {
        updateStatCard('averageCount', cachedStats.average);
    }
    if (cachedStats.timeline !== null) {
        renderMaintenanceTimeline(cachedStats.timeline);
    }
    
    console.log('⚡ 캐시 데이터 표시 완료');
}

// 캐시된 세무 데이터 로딩 함수
async function loadCachedTaxationData() {
    console.log('⚡ 캐시된 세무 데이터 우선 표시...');
    
    // 캐시된 세무 데이터가 있으면 즉시 표시
    const cachedTaxation = {
        summary: getCachedData('taxationSummary'),
        categories: getCachedData('taxationCategories'),
        recentTransactions: getCachedData('recentTransactions')
    };
    
    // 캐시된 데이터가 있으면 즉시 UI 업데이트
    if (cachedTaxation.summary !== null) {
        // 세무 요약 UI 업데이트
        updateTaxationSummaryUI(cachedTaxation.summary);
    }
    if (cachedTaxation.categories !== null) {
        // 세무 분류 UI 업데이트
        updateTaxationCategoriesUI(cachedTaxation.categories);
    }
    if (cachedTaxation.recentTransactions !== null) {
        // 최근 거래 UI 업데이트
        updateRecentTransactionsUI(cachedTaxation.recentTransactions);
    }
    
    console.log('⚡ 캐시된 세무 데이터 표시 완료');
}

async function loadDashboardData() {
    console.log('📊 Loading dashboard data...');
    
    // 🔒 로그인 상태 체크 - 보안 강화
    if (!currentUser) {
        console.log('🚫 Not logged in - redirecting to auth screen');
        showNotification('로그인이 필요합니다.', 'error');
        showScreen('auth');
        return;
    }
    
    // Firebase 연결 상태 체크
    if (!db) {
        console.error('❌ Firebase 데이터베이스 연결 없음');
        showNotification('데이터베이스 연결 오류. 페이지를 새로고침해주세요.', 'error');
        return;
    }
    
    try {
        // Show loading with progress
        showLoadingSpinner(true, '데이터를 불러오는 중...');
        
        // 1단계: 캐시된 데이터 먼저 표시 (즉시 반응)
        await loadCachedDataFirst();
        
        // 2단계: Firebase 네트워크 연결 안전하게 확인
        try {
            await db.enableNetwork();
            console.log('✅ Firebase 네트워크 연결 확인됨');
        } catch (networkError) {
            console.warn('⚠️ Firebase 네트워크 연결 실패, 계속 진행:', networkError);
            // 네트워크 연결 실패해도 계속 진행
        }
        
        // 3단계: 최신 데이터 로드 (순차 처리로 변경)
        console.log('🔄 대시보드 데이터 순차 로드 시작...');
        
        // 순차적으로 로드하여 Firebase 부하 감소
        await updateTodayStats();
        await updatePendingStats();
        await updateMonthStats();
        await updateAverageStats();
        await loadMaintenanceTimeline();
        
        console.log('✅ 대시보드 데이터 로드 완료');
        showLoadingSpinner(false);
        
    } catch (error) {
        console.error('❌ Error loading dashboard:', error);
        
        // Firebase 특정 오류 처리
        if (error.code === 'unavailable') {
            showNotification('네트워크 연결을 확인해주세요.', 'error');
        } else if (error.code === 'permission-denied') {
            showNotification('데이터 접근 권한이 없습니다.', 'error');
        } else if (error.code === 'already-exists') {
            console.log('🔄 Target ID already exists, cleaning up and retrying...');
            cleanupFirebaseListeners();
            // 짧은 지연 후 재시도
            setTimeout(() => {
                loadDashboardData();
            }, 1000);
            return;
        } else {
            showNotification('대시보드 로딩 실패: ' + error.message, 'error');
        }
        
        showLoadingSpinner(false);
    }
}

async function updateTodayStats() {
    try {
        // 🔒 로그인 상태 체크
        if (!currentUser) {
            updateStatCard('todayCount', 0);
            return;
        }
        
        // 📦 캐시 확인 먼저
        const cachedData = getCachedData('todayStats');
        if (cachedData !== null) {
            updateStatCard('todayCount', cachedData);
            return;
        }
        
        // 중복 실행 방지
        if (isLoadingStats.today) {
            console.log('⚠️ Today stats already loading, skipping...');
            return;
        }
        
        isLoadingStats.today = true;
        
        // 안전한 Firebase 쿼리 실행
        const result = await safeFirebaseQuery('todayStats', async () => {
            const today = new Date().toISOString().split('T')[0];
            let query = db.collection('maintenance').where('date', '==', today);
            
            if (isAdmin) {
                query = query.where('adminEmail', '==', currentUser.email);
            } else {
                query = query.where('carNumber', '==', currentUser.carNumber);
            }
            
            const snapshot = await query.get();
            return snapshot.size;
        });
        
        if (result !== null) {
            updateStatCard('todayCount', result);
            setCachedData('todayStats', result); // 📦 캐시에 저장
        } else {
            updateStatCard('todayCount', 0);
            setCachedData('todayStats', 0); // 📦 캐시에 저장
        }
        
    } catch (error) {
        console.error('❌ Error updating today stats:', error);
        updateStatCard('todayCount', 0);
    } finally {
        isLoadingStats.today = false;
    }
}

async function updatePendingStats() {
    try {
        // 🔒 로그인 상태 체크
        if (!currentUser) {
            updateStatCard('pendingCount', 0);
            return;
        }
        
        // 중복 실행 방지
        if (isLoadingStats.pending) {
            console.log('⚠️ Pending stats already loading, skipping...');
            return;
        }
        
        isLoadingStats.pending = true;
        
        // 안전한 Firebase 쿼리 실행
        const result = await safeFirebaseQuery('pendingStats', async () => {
            let query = db.collection('maintenance').where('status', '==', 'pending');
            
            if (isAdmin) {
                query = query.where('adminEmail', '==', currentUser.email);
            } else {
                query = query.where('carNumber', '==', currentUser.carNumber);
            }
            
            const snapshot = await query.get();
            return snapshot.size;
        });
        
        if (result !== null) {
            updateStatCard('pendingCount', result);
        } else {
            updateStatCard('pendingCount', 0);
        }
        
    } catch (error) {
        console.error('❌ Error updating pending stats:', error);
        updateStatCard('pendingCount', 0);
    } finally {
        isLoadingStats.pending = false;
    }
}

async function updateMonthStats() {
    try {
        // 🔒 로그인 상태 체크
        if (!currentUser) {
            updateStatCard('monthCount', 0);
            return;
        }
        
        // 중복 실행 방지
        if (isLoadingStats.month) {
            console.log('⚠️ Month stats already loading, skipping...');
            return;
        }
        
        isLoadingStats.month = true;
        
        // 안전한 Firebase 쿼리 실행 (최적화: 최신 200개만 조회)
        const result = await safeFirebaseQuery('monthStats', async () => {
            let query = db.collection('maintenance');
            
            // 권한별 필터링
            if (!isAdmin && currentUser && currentUser.carNumber) {
                query = query.where('carNumber', '==', currentUser.carNumber);
            } else if (isAdmin && currentUser) {
                query = query.where('adminEmail', '==', currentUser.email);
            }
            
            // 최적화: 최신 200개만 조회하여 월간 통계 계산
            query = query.orderBy('createdAt', 'desc').limit(200);
            const snapshot = await query.get();
            
            // 클라이언트 측에서 월간 필터링
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            let monthCount = 0;
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.date) {
                    const maintenanceDate = new Date(data.date);
                    if (maintenanceDate.getMonth() === currentMonth && 
                        maintenanceDate.getFullYear() === currentYear) {
                        monthCount++;
                    }
                }
            });
            
            return monthCount;
        });
        
        if (result !== null) {
            updateStatCard('monthCount', result);
        } else {
            updateStatCard('monthCount', 0);
        }
        
    } catch (error) {
        console.error('❌ Error updating month stats:', error);
        updateStatCard('monthCount', 0);
    } finally {
        isLoadingStats.month = false;
    }
}

async function updateAverageStats() {
    try {
        // 🔒 로그인 상태 체크
        if (!currentUser) {
            updateStatCard('averageDays', '-');
            return;
        }
        
        // 중복 실행 방지
        if (isLoadingStats.average) {
            console.log('⚠️ Average stats already loading, skipping...');
            return;
        }
        
        isLoadingStats.average = true;
        
        // 안전한 Firebase 쿼리 실행 (최적화: 최신 50개만 조회)
        const result = await safeFirebaseQuery('averageStats', async () => {
            let query = db.collection('maintenance');
            
            // 권한별 필터링
            if (!isAdmin && currentUser && currentUser.carNumber) {
                query = query.where('carNumber', '==', currentUser.carNumber);
            } else if (isAdmin && currentUser) {
                query = query.where('adminEmail', '==', currentUser.email);
            }
            
            // 최적화: 평균 계산용 최신 50개만 조회 (충분한 표본)
            query = query.orderBy('createdAt', 'desc').limit(50);
            const snapshot = await query.get();
            
            if (snapshot.size > 1) {
                // 클라이언트 측에서 날짜순 정렬 및 계산
                const dates = snapshot.docs
                    .map(doc => doc.data().date)
                    .filter(date => date)
                    .map(date => new Date(date))
                    .sort((a, b) => b - a) // 내림차순 정렬
                    .slice(0, 10); // 최근 10개만
                
                if (dates.length > 1) {
                    let totalDays = 0;
                    
                    for (let i = 0; i < dates.length - 1; i++) {
                        const diff = (dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24);
                        totalDays += diff;
                    }
                    
                    const averageDays = Math.round(totalDays / (dates.length - 1));
                    return `${averageDays}일`;
                } else {
                    return '-';
                }
            } else {
                return '-';
            }
        });
        
        if (result !== null) {
            updateStatCard('averageDays', result);
        } else {
            updateStatCard('averageDays', '-');
        }
        
    } catch (error) {
        console.error('❌ Error updating average stats:', error);
        updateStatCard('averageDays', '-');
    } finally {
        isLoadingStats.average = false;
    }
}

function updateStatCard(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value;
    }
}

// 로딩 알림 중복 방지를 위한 변수
let isShowingLoadingNotification = false;

function showLoadingSpinner(show, message = '데이터를 불러오고 있습니다...') {
    const spinner = document.getElementById('loadingSpinner');
    const content = document.getElementById('timelineContent');
    
    if (spinner) {
        spinner.style.display = show ? 'block' : 'none';
        
        // 로딩 메시지 업데이트
        if (show && message) {
            const spinnerText = spinner.querySelector('.spinner-text');
            if (spinnerText) {
                spinnerText.textContent = message;
            }
        }
    }
    
    if (content) {
        content.style.display = show ? 'none' : 'block';
    }
    
    // 로딩 중일 때 사용자 피드백
    if (show) {
        console.log('🔄 로딩 시작...');
        if (!isShowingLoadingNotification) {
            isShowingLoadingNotification = true;
            showNotification(message, 'info');
        }
    } else {
        console.log('✅ 로딩 완료');
        isShowingLoadingNotification = false;
    }
}

// =============================================
// Maintenance Timeline
// =============================================

async function loadMaintenanceTimeline(searchTerm = '') {
    console.log('📋 Loading maintenance timeline...');
    console.log('👤 Current user:', currentUser);
    console.log('🔧 Is admin:', isAdmin);
    console.log('🔍 Search term:', searchTerm);
    
    // 🔒 로그인 상태 체크 - 보안 강화
    if (!currentUser) {
        console.log('🚫 Not logged in - clearing timeline');
        const timelineContent = document.getElementById('timelineContent');
        if (timelineContent) {
            timelineContent.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">로그인 후 정비 이력을 확인하세요</div>';
        }
        showLoadingSpinner(false);
        return;
    }
    
    // Firebase 연결 상태 체크 - 추가 디버깅
    if (!db) {
        console.error('❌ Firebase 데이터베이스 연결 없음');
        showNotification('데이터베이스 연결 오류. 페이지를 새로고침해주세요.', 'error');
        showLoadingSpinner(false);
        return;
    }
    
    console.log('✅ Firebase 연결 상태 확인됨');
    
    // 로딩 스피너 표시 (검색 시에는 알림 억제)
    const isSearching = searchTerm && searchTerm.trim() !== '';
    showLoadingSpinner(true, isSearching);
    
    try {
        // 네트워크 연결 상태 확인 (백그라운드에서만)
        try {
            await db.enableNetwork();
        } catch (networkError) {
            console.warn('⚠️ 네트워크 연결 문제, 재연결 시도:', networkError);
            const reconnected = await attemptFirebaseReconnection();
            if (!reconnected) {
                throw new Error('네트워크 연결 복구 실패');
            }
        }
        
        // 중복 실행 방지
        if (isLoadingStats.timeline) {
            console.log('⚠️ Timeline already loading, skipping...');
            return;
        }
        
        isLoadingStats.timeline = true;
        
        // 안전한 Firebase 쿼리 실행 (최적화: 최신 50개만 조회)
        const queryId = searchTerm ? `maintenanceTimeline_search_${searchTerm}` : 'maintenanceTimeline';
        
        // 단순한 Firebase 쿼리 실행
        const snapshot = await safeFirebaseQuery(queryId, async () => {
            let query = db.collection('maintenance')
                .orderBy('createdAt', 'desc')
                .limit(50); // 최신 50개만 조회하여 읽기 횟수 대폭 감소
            console.log('🔍 Executing optimized maintenance timeline query (limit: 50)...');
            return await query.get();
        });
        
        if (!snapshot) {
            console.log('❌ Query returned null, skipping...');
            return;
        }
        
        console.log('📊 Found documents:', snapshot.size);
        
        // 빈 결과 처리
        if (snapshot.empty) {
            console.log('📋 정비 이력이 비어있음');
            const timelineContent = document.getElementById('timelineContent');
            if (timelineContent) {
                timelineContent.innerHTML = `
                    <div style="background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%); color: #8b4513; padding: 40px; text-align: center; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                        <h3 style="margin: 0 0 15px 0; font-size: 24px;">📋 정비 이력이 없습니다</h3>
                        <p style="margin: 0; opacity: 0.8;">첫 번째 정비를 등록해보세요!</p>
                    </div>
                `;
            }
            showLoadingSpinner(false);
            return;
        }
        
        const maintenances = [];
        
        snapshot.docs.forEach((doc) => {
            const data = doc.data();
            const maintenance = { 
                ...data, 
                id: doc.id,
                // 날짜 포맷 보정
                date: data.date || data.createdAt?.toDate?.()?.toISOString?.()?.split('T')[0] || '2024-01-01'
            };
            
            maintenances.push(maintenance);
                            debugLog('📋 Added maintenance:', maintenance.id, maintenance.type, maintenance.carNumber);
        });
        
        // 날짜순 정렬 (클라이언트에서)
        maintenances.sort((a, b) => {
            const dateA = new Date(a.date || '2024-01-01');
            const dateB = new Date(b.date || '2024-01-01');
            return dateB - dateA; // 최신순
        });
        
        // 권한별 필터링 - 디버깅 강화
        let filteredMaintenances = maintenances;
        console.log('🔍 권한별 필터링 시작...');
        console.log('📊 필터링 전 정비 이력 수:', maintenances.length);
        console.log('👤 현재 사용자:', {
            email: currentUser.email,
            carNumber: currentUser.carNumber,
            role: currentUser.role
        });
        console.log('🔧 관리자 권한:', isAdmin);
        
        if (!isAdmin && currentUser && currentUser.carNumber) {
            // 일반 사용자: 자신의 차량번호만
            console.log('🚗 일반 사용자 필터링 적용 중...');
            filteredMaintenances = maintenances.filter(m => {
                debugLog(`📋 정비 이력 체크: ${m.id} - 차량번호: ${m.carNumber} vs 사용자: ${currentUser.carNumber}`);
                return m.carNumber === currentUser.carNumber;
            });
            console.log('🚗 User filtered by car number:', currentUser.carNumber, filteredMaintenances.length);
        } else if (isAdmin && currentUser) {
            // 관리자: 자신이 작업한 정비만
            console.log('👨‍💼 관리자 필터링 적용 중...');
            filteredMaintenances = maintenances.filter(m => {
                debugLog(`📋 정비 이력 체크: ${m.id} - 관리자: ${m.adminEmail} vs 사용자: ${currentUser.email}`);
                return m.adminEmail === currentUser.email;
            });
            console.log('👨‍💼 Admin filtered by email:', currentUser.email, filteredMaintenances.length);
        } else {
            console.log('⚠️ 권한 필터링 조건에 맞지 않음');
        }
        
        console.log('📊 필터링 후 정비 이력 수:', filteredMaintenances.length);
        
        // 상태별 필터 적용
        const currentFilter = window.currentFilter || 'all';
        console.log('🔍 Current filter:', currentFilter);
        
        if (currentFilter !== 'all') {
            const beforeFilterCount = filteredMaintenances.length;
            filteredMaintenances = filteredMaintenances.filter(m => {
                switch (currentFilter) {
                    case 'in-progress':
                        return m.status === 'in-progress';
                    case 'completed':
                        return m.status === 'completed';
                    case 'pending':
                        return m.status === 'pending';
                    case 'approved':
                        return m.status === 'approved';
                    case 'rejected':
                        return m.status === 'rejected';
                    default:
                        return true;
                }
            });
            console.log(`🔍 Filtered by status "${currentFilter}": ${beforeFilterCount} → ${filteredMaintenances.length} items`);
        }
        
        // 검색어 필터링
        if (searchTerm) {
            const searchLower = searchTerm.toLowerCase();
            filteredMaintenances = filteredMaintenances.filter(m => 
                (m.type || '').toLowerCase().includes(searchLower) ||
                (m.description || '').toLowerCase().includes(searchLower) ||
                (m.carNumber || '').toLowerCase().includes(searchLower) ||
                (m.date || '').toLowerCase().includes(searchLower)
            );
            console.log('🔍 Filtered by search term:', filteredMaintenances.length);
        }
        
        // 최종 결과 확인
        console.log('📊 최종 렌더링할 정비 이력 수:', filteredMaintenances.length);
        
        // 빈 결과 처리
        if (filteredMaintenances.length === 0) {
            console.log('📋 필터링 후 결과가 비어있음');
            const timelineContent = document.getElementById('timelineContent');
            if (timelineContent) {
                timelineContent.innerHTML = `
                    <div style="background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%); color: #8b4513; padding: 40px; text-align: center; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                        <h3 style="margin: 0 0 15px 0; font-size: 24px;">📋 정비 이력이 없습니다</h3>
                        <p style="margin: 0; opacity: 0.8;">조건에 맞는 정비 이력이 없습니다.</p>
                        ${!isAdmin ? '<p style="margin: 10px 0 0 0; font-size: 14px;">차량번호를 확인하거나 관리자에게 문의하세요.</p>' : ''}
                    </div>
                `;
            }
            showLoadingSpinner(false);
            return;
        }
        
        console.log('✅ About to render', filteredMaintenances.length, 'maintenances');
        await renderRealMaintenanceTimeline(filteredMaintenances);
        
        // 로딩 완료 후 스피너 숨기기
        showLoadingSpinner(false);
        
        console.log('✅ Timeline loaded successfully with', filteredMaintenances.length, 'items');
        
    } catch (error) {
        console.error('❌ Error loading timeline:', error);
        console.error('❌ Error details:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        
        // Firebase 오류 상세 처리
        if (error.code === 'unavailable') {
            showNotification('네트워크 연결을 확인해주세요.', 'error');
        } else if (error.code === 'permission-denied') {
            showNotification('데이터 접근 권한이 없습니다.', 'error');
        } else {
            showNotification('정비 이력 로딩 실패: ' + error.message, 'error');
        }
        
        // 오류 발생 시에도 스피너 숨기기
        showLoadingSpinner(false);
        
        // 오류 시 에러 메시지 표시
        const timelineContent = document.getElementById('timelineContent');
        if (timelineContent) {
            timelineContent.innerHTML = `
                <div style="background: linear-gradient(135deg, #ffcccc 0%, #ff9999 100%); color: #cc0000; padding: 40px; text-align: center; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                    <h3 style="margin: 0 0 15px 0; font-size: 24px;">❌ 정비 이력 로딩 실패</h3>
                    <p style="margin: 0; opacity: 0.8;">네트워크 연결을 확인하고 다시 시도해주세요.</p>
                    <button onclick="loadMaintenanceTimeline()" style="margin-top: 15px; padding: 10px 20px; background: #cc0000; color: white; border: none; border-radius: 5px; cursor: pointer;">다시 시도</button>
                </div>
            `;
        }
    } finally {
        isLoadingStats.timeline = false;
    }
}

function renderMaintenanceTimeline(maintenances) {
    console.log('🎨 Rendering timeline with', maintenances.length, 'items');
    
    const container = document.getElementById('timelineContent');
    const emptyState = document.getElementById('emptyState');
    const loadingSpinner = document.getElementById('loadingSpinner');
    
    // 로딩 스피너 숨기기
    if (loadingSpinner) {
        loadingSpinner.style.display = 'none';
    }
    
    if (!container) {
        console.error('❌ Timeline container not found');
        // 모든 요소들을 확인해보자
        console.log('🔍 Available elements:', Object.keys(document.getElementById ? document : {}));
        console.log('🔍 Body innerHTML preview:', document.body ? document.body.innerHTML.substring(0, 500) : 'No body');
        return;
    }
    
    console.log('📦 Container found:', container);
    console.log('📦 Container parent:', container.parentElement);
    console.log('📦 Container styles:', window.getComputedStyle(container));
    
    // 컨테이너를 확실히 보이게 만들자
    container.style.display = 'block';
    container.style.visibility = 'visible';
    container.style.opacity = '1';
    container.style.position = 'relative';
    container.style.zIndex = '1000';
    
    if (maintenances.length === 0) {
        container.innerHTML = '<div style="background: yellow; color: black; padding: 40px; text-align: center; font-size: 20px; margin: 20px; border-radius: 8px;">⚠️ 데이터가 없습니다 (0개 항목)</div>';
        if (emptyState) {
            emptyState.style.display = 'block';
        }
        console.log('📭 No maintenances to display');
        return;
    }
    
    if (emptyState) {
        emptyState.style.display = 'none';
    }
    
    console.log('🚀 Starting to generate cards immediately...');
    
    try {
        const cardsHtml = maintenances.map((maintenance, index) => {
            console.log(`🏗️ Building card ${index + 1}/${maintenances.length}:`, maintenance.type, maintenance.carNumber);
            const cardHtml = createMaintenanceCard(maintenance);
            console.log(`✅ Card ${index + 1} created, length:`, cardHtml.length);
            return cardHtml;
        }).join('');
        
        console.log('📝 All cards generated! Total HTML length:', cardsHtml.length);
        console.log('🎨 HTML preview:', cardsHtml.substring(0, 300) + '...');
        
        if (cardsHtml.length === 0) {
            console.error('❌ No HTML generated!');
            container.innerHTML = '<div style="background: orange; color: white; padding: 20px; margin: 10px; font-size: 20px;">⚠️ 카드 HTML이 생성되지 않았습니다</div>';
            return;
        }
        
        container.innerHTML = cardsHtml;
        
        console.log('✅ Timeline rendered successfully!');
        console.log('📐 Final container info:', {
            width: container.offsetWidth,
            height: container.offsetHeight,
            display: getComputedStyle(container).display,
            visibility: getComputedStyle(container).visibility,
            childElementCount: container.childElementCount,
            innerHTML: container.innerHTML.length + ' characters'
        });
        
    } catch (error) {
        console.error('❌ Error during rendering:', error);
        container.innerHTML = '<div style="background: red; color: white; padding: 20px; margin: 10px; font-size: 20px;">🚨 렌더링 오류: ' + error.message + '</div>';
    }
}

function createMaintenanceCard(maintenance) {
    console.log('🎨 Creating card for:', maintenance.id, maintenance.type, maintenance);
    
    // 아주 간단한 카드로 테스트
    try {
        const cardHtml = `
            <div style="background: blue; color: white; padding: 20px; margin: 10px; border-radius: 8px; font-size: 18px;">
                <div>카드 #${maintenance.id}</div>
                <div>타입: ${maintenance.type}</div>
                <div>차량: ${maintenance.carNumber}</div>
                <div>상태: ${maintenance.status}</div>
            </div>
        `;
        
        console.log('✅ Card HTML generated:', cardHtml.length, 'characters');
        return cardHtml;
        
    } catch (error) {
        console.error('❌ Error creating card:', error);
        return `<div style="background: red; color: white; padding: 20px; margin: 10px;">오류 발생: ${error.message}</div>`;
    }
}

async function renderRealMaintenanceTimeline(maintenances) {
    console.log('🎯 Rendering REAL timeline with', maintenances.length, 'items');
    
    const container = document.getElementById('timelineContent');
    if (!container) {
        console.error('❌ Timeline container not found');
        return;
    }
    
    // 컨테이너 스타일 설정
    container.style.cssText = 'display: block !important; visibility: visible !important; background: #f8f9fa; padding: 20px; margin: 20px 0; min-height: 200px;';
    
    if (maintenances.length === 0) {
        container.innerHTML = `
            <div style="background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%); color: #8b4513; padding: 40px; text-align: center; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                <h3 style="margin: 0 0 15px 0; font-size: 24px;">📋 정비 이력이 없습니다</h3>
                <p style="margin: 0; opacity: 0.8;">첫 번째 정비를 등록해보세요!</p>
            </div>
        `;
        return;
    }
    
    // 비동기로 관리자 이름 가져오기
    for (const maintenance of maintenances) {
        if (!maintenance.adminName && maintenance.adminEmail) {
            maintenance.adminName = await getAdminNameByEmail(maintenance.adminEmail);
        }
    }
    
    // 현재 보기 모드에 따라 렌더링
    if (currentViewMode === 'list') {
        container.innerHTML = renderListView(maintenances);
    } else {
        container.innerHTML = renderCardView(maintenances);
    }
    console.log('✅ Real timeline rendered successfully with', maintenances.length, 'cards');
}

// 카드 뷰 렌더링 함수
function renderCardView(maintenances) {
    return maintenances.map((maintenance, index) => {
        console.log(`🏗️ Building card ${index + 1}:`, maintenance.type, maintenance.carNumber);
        
        // 상태별 색상
        const statusColors = {
            'pending': '#ffc107',
            'approved': '#28a745', 
            'rejected': '#dc3545',
            'completed': '#17a2b8'
        };
        
        // 타입별 아이콘
        const typeIcons = {
            '엔진오일교체': '🛢️',
            '타이어교체': '🛞',
            '브레이크정비': '🔧',
            '일반점검': '🔍',
            '기타': '⚙️'
        };
        
        const statusColor = statusColors[maintenance.status] || '#6c757d';
        const typeIcon = typeIcons[maintenance.type] || '🔧';
        
        // 그라디언트 색상 배열
        const gradients = [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', 
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
        ];
        
        const gradient = gradients[index % gradients.length];
        
        // 📸 사진이 있는 경우 삭제까지 남은 일수 계산
        const hasPhotos = maintenance.beforePhoto || maintenance.duringPhoto || maintenance.afterPhoto;
        let photoDeleteInfo = '';
        
        if (hasPhotos && maintenance.createdAt) {
            const deleteInfo = getDaysUntilDeletion(maintenance.createdAt);
            if (deleteInfo) {
                if (deleteInfo.isExpired) {
                    photoDeleteInfo = `
                        <div style="background: rgba(220, 53, 69, 0.9); padding: 8px; border-radius: 6px; margin: 10px 0; font-size: 13px; font-weight: bold;">
                            📸 사진이 삭제되었습니다
                        </div>
                    `;
                } else if (deleteInfo.isWarning) {
                    photoDeleteInfo = `
                        <div style="background: rgba(255, 193, 7, 0.9); color: #000; padding: 8px; border-radius: 6px; margin: 10px 0; font-size: 13px; font-weight: bold; animation: pulse 2s infinite;">
                            ⚠️ 📸 사진 삭제 임박: D-${deleteInfo.daysLeft}
                            <br><small>📅 ${deleteInfo.deletionDate.toLocaleDateString('ko-KR')} 삭제 예정</small>
                        </div>
                    `;
                } else {
                    photoDeleteInfo = `
                        <div style="background: rgba(0, 123, 255, 0.8); padding: 8px; border-radius: 6px; margin: 10px 0; font-size: 13px;">
                            📸 사진 보존: D-${deleteInfo.daysLeft}
                            <br><small>📅 ${deleteInfo.deletionDate.toLocaleDateString('ko-KR')} 삭제 예정</small>
                        </div>
                    `;
                }
            }
        }
        
        // 📸 사진 개수 계산
        const photoCount = [maintenance.beforePhoto, maintenance.duringPhoto, maintenance.afterPhoto].filter(photo => photo).length;
        const photoIndicator = photoCount > 0 ? ` <span class="photo-indicator">📸${photoCount}</span>` : '';
        
        // 타입별 클래스 매핑
        const typeClassMap = {
            '엔진오일교체': 'type-engine',
            '타이어교체': 'type-tire', 
            '브레이크정비': 'type-brake',
            '일반점검': 'type-inspection',
            '기타': 'type-other'
        };
        
        const typeClass = typeClassMap[maintenance.type] || 'type-other';
        
        return `
            <div class="maintenance-card-enhanced ${typeClass}" onclick="showMaintenanceDetail('${maintenance.id}')">
                <h3>
                    ${typeIcon} ${maintenance.type || '정비'}${photoIndicator}
                </h3>
                <p>
                    📅 ${maintenance.date || '날짜 없음'}
                </p>
                <p>
                    🏍️ 차량번호: ${maintenance.carNumber || '없음'}
                </p>
                <p>
                    📋 상태: <span class="status-badge" style="background: ${statusColor};">${getStatusText(maintenance.status) || maintenance.status || '없음'}</span>
                </p>
                ${maintenance.mileage ? `<p>📏 주행거리: ${maintenance.mileage}km</p>` : ''}
                ${(maintenance.status === 'approved' || maintenance.status === 'rejected') && maintenance.adminName ? `<p>👨‍💼 관리자: ${maintenance.adminName}</p>` : ''}
                ${photoDeleteInfo}
                <p class="description">
                    ${(maintenance.description || '설명이 없습니다.').substring(0, 100)}${(maintenance.description || '').length > 100 ? '...' : ''}
                </p>
            </div>
        `;
    }).join('');
}

// 리스트 뷰 렌더링 함수
function renderListView(maintenances) {
    return `
        <div class="maintenance-list-view">
            <div class="list-header">
                <div class="list-col-type">정비 종류</div>
                <div class="list-col-date">날짜</div>
                <div class="list-col-car">차량번호</div>
                <div class="list-col-status">상태</div>
                <div class="list-col-admin">관리자</div>
            </div>
            ${maintenances.map((maintenance, index) => {
                const statusColors = {
                    'pending': '#ffc107',
                    'approved': '#28a745', 
                    'rejected': '#dc3545',
                    'completed': '#17a2b8'
                };
                
                const typeIcons = {
                    '엔진오일교체': '🛢️',
                    '타이어교체': '🛞',
                    '브레이크정비': '🔧',
                    '일반점검': '🔍',
                    '기타': '⚙️'
                };
                
                const statusColor = statusColors[maintenance.status] || '#6c757d';
                const typeIcon = typeIcons[maintenance.type] || '🔧';
                
                // 📸 사진 정보 및 삭제 카운터
                        // 🔄 신규/기존 방식 모두 지원하는 사진 개수 계산
        let photoCount = 0;
        let hasPhotos = false;
        
        if (maintenance.photos && maintenance.photos.length > 0) {
            // 신규 방식: photos 배열
            photoCount = maintenance.photos.length;
            hasPhotos = true;
        } else {
            // 기존 방식: 개별 필드
            const photos = [maintenance.beforePhoto, maintenance.duringPhoto, maintenance.afterPhoto].filter(photo => photo);
            photoCount = photos.length;
            hasPhotos = photoCount > 0;
        }
                let photoInfo = '';
                
                if (hasPhotos && maintenance.createdAt) {
                    const deleteInfo = getDaysUntilDeletion(maintenance.createdAt);
                    if (deleteInfo) {
                        if (deleteInfo.isExpired) {
                            photoInfo = ` <span style="color: #dc3545; font-size: 11px; font-weight: bold;">📸삭제됨</span>`;
                        } else if (deleteInfo.isWarning) {
                            photoInfo = ` <span style="color: #ff6b35; font-size: 11px; font-weight: bold; animation: pulse 2s infinite;">📸D-${deleteInfo.daysLeft}</span>`;
                        } else {
                            photoInfo = ` <span style="color: #28a745; font-size: 11px; font-weight: 600;">📸${photoCount}</span>`;
                        }
                    }
                } else if (photoCount > 0) {
                    photoInfo = ` <span style="color: #6c757d; font-size: 11px;">📸${photoCount}</span>`;
                }
                
                return `
                    <div class="list-row ${index % 2 === 0 ? 'even' : 'odd'}" onclick="showMaintenanceDetail('${maintenance.id}')">
                        <div class="list-col-type">
                            <span class="type-icon">${typeIcon}</span>
                            ${maintenance.type || '정비'}${photoInfo}
                        </div>
                        <div class="list-col-date">
                            ${maintenance.date || '날짜 없음'}
                        </div>
                        <div class="list-col-car">
                            ${maintenance.carNumber || '없음'}
                        </div>
                        <div class="list-col-status">
                            <span class="status-badge" style="background: ${statusColor};">
                                ${getStatusText(maintenance.status) || maintenance.status || '없음'}
                            </span>
                        </div>
                        <div class="list-col-admin">
                            ${(maintenance.status === 'approved' || maintenance.status === 'rejected') && maintenance.adminName ? maintenance.adminName : '-'}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// =============================================
// Modal System
// =============================================

function initializeModals() {
    // 중복 초기화 방지
    if (window.modalsInitialized) {
        console.log('⚠️ Modals already initialized, skipping...');
        return;
    }
    
    initializeMaintenanceModal();
    initializeSearchAndFilters();
    initializePasswordResetModal();
    
    // 초기화 완료 표시
    window.modalsInitialized = true;
    console.log('✅ All modals initialized');
}

function initializePasswordResetModal() {
    const modal = document.getElementById('passwordResetModal');
    
    if (modal) {
        // 백드롭 클릭 이벤트
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closePasswordResetModal();
            }
        });
        
        // ESC 키 이벤트
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                closePasswordResetModal();
            }
        });
    }
}

function initializeMaintenanceModal() {
    // 중복 초기화 방지
    if (window.maintenanceModalInitialized) {
        console.log('⚠️ Maintenance modal already initialized, skipping...');
        return;
    }
    
    const fab = document.getElementById('addMaintenanceFab');
    const prevBtn = document.getElementById('prevStep');
    const nextBtn = document.getElementById('nextStep');
    const submitBtn = document.getElementById('submitForm');
    const form = document.getElementById('maintenanceForm');
    
    // 🔧 FAB 버튼 이벤트 리스너 (중복 방지)
    if (fab && !fab.hasAttribute('data-listener-added')) {
        fab.addEventListener('click', openMaintenanceModal);
        fab.setAttribute('data-listener-added', 'true');
        console.log('✅ FAB 이벤트 리스너 등록');
    }
    
    // 버튼 이벤트 리스너 (중복 방지)
    if (prevBtn && !prevBtn.hasAttribute('data-listener-added')) {
        prevBtn.addEventListener('click', goToPreviousStep);
        prevBtn.setAttribute('data-listener-added', 'true');
    }
    
    if (nextBtn && !nextBtn.hasAttribute('data-listener-added')) {
        nextBtn.addEventListener('click', goToNextStep);
        nextBtn.setAttribute('data-listener-added', 'true');
    }
    
    if (form && !form.hasAttribute('data-listener-added')) {
        form.addEventListener('submit', submitMaintenanceForm);
        form.setAttribute('data-listener-added', 'true');
    }
    
    // Initialize type selector (한 번만)
    initializeTypeSelector();
    initializePhotoUpload();
    
    // 초기화 완료 표시
    window.maintenanceModalInitialized = true;
    console.log('✅ Maintenance modal initialized');
}

function openMaintenanceModal() {
    if (!isAdmin) {
        showNotification('관리자만 정비 이력을 등록할 수 있습니다.', 'error');
        return;
    }
    
    const modal = document.getElementById('maintenanceModal');
    if (modal) {
        modal.classList.add('active');
        resetMaintenanceForm();
        showStep(1);
        
            // 사진 슬롯이 없으면 10개만 생성
    const photoGrid = document.getElementById('photoGrid');
    if (photoGrid && photoGrid.children.length === 0) {
        for (let i = 0; i < 10; i++) {
            createPhotoSlot(i);
        }
    }
    
    // 타입 선택 초기화
    document.querySelectorAll('.type-option').forEach(option => {
        option.classList.remove('selected');
    });
    } else {
        showNotification('페이지를 새로고침 후 다시 시도해주세요.', 'error');
    }
}

function closeMaintenanceModal() {
    const modal = document.getElementById('maintenanceModal');
    if (modal) {
        modal.classList.remove('active');
        
        // 모달을 닫을 때만 사진 데이터 완전히 리셋
        resetPhotoUploads();
        
        // 수정 모드 플래그 제거
        if (window.editingMaintenanceId) {
            delete window.editingMaintenanceId;
            
            // 제출 버튼 텍스트 원래대로
            const submitBtn = document.querySelector('#maintenanceModal .btn-primary');
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-plus"></i> 등록하기';
            }
            
            // 모달 제목 원래대로
            const modalTitle = document.querySelector('#maintenanceModal .modal-title');
            if (modalTitle) {
                modalTitle.innerHTML = '<i class="fas fa-wrench"></i> 정비 이력 등록';
            }
        }
    }
}

function resetMaintenanceForm() {
    currentStep = 1;
    
    const form = document.getElementById('maintenanceForm');
    if (form) {
        form.reset();
    }
    
    // 타입 선택 초기화는 하지 않음 (모달이 열릴 때만 수행)
    
    // 사진 관련 초기화는 하지 않음 (모달 닫을 때만 수행)
    
    // Set default date
    const dateInput = document.getElementById('maintenanceDate');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
}

function showStep(step) {
    currentStep = step;
    
    // Update step visibility
    document.querySelectorAll('.form-step').forEach((stepEl, index) => {
        stepEl.classList.toggle('active', index + 1 === step);
    });
    
    // Update button visibility
    const prevBtn = document.getElementById('prevStep');
    const nextBtn = document.getElementById('nextStep');
    const submitBtn = document.getElementById('submitForm');
    
    if (prevBtn) prevBtn.style.display = step > 1 ? 'inline-flex' : 'none';
    if (nextBtn) nextBtn.style.display = step < 3 ? 'inline-flex' : 'none';
    if (submitBtn) submitBtn.style.display = step === 3 ? 'inline-flex' : 'none';
}

function goToPreviousStep() {
    if (currentStep > 1) {
        showStep(currentStep - 1);
    }
}

function goToNextStep() {
    if (validateCurrentStep()) {
        if (currentStep < 3) {
            showStep(currentStep + 1);
        }
    }
}

function validateCurrentStep() {
    switch (currentStep) {
        case 1:
            const carNumber = document.getElementById('carNumber').value.trim();
            const date = document.getElementById('maintenanceDate').value;
            const type = document.getElementById('maintenanceType').value;
            
            if (!carNumber) {
                showNotification('오토바이 번호를 입력해주세요.', 'error');
                return false;
            }
            
            if (!date) {
                showNotification('정비 날짜를 선택해주세요.', 'error');
                return false;
            }
            
            if (!type) {
                showNotification('정비 종류를 선택해주세요.', 'error');
                return false;
            }
            
            return true;
            
        case 2:
            // Photos are optional
            return true;
            
        case 3:
            const description = document.getElementById('description').value.trim();
            
            if (!description) {
                showNotification('정비 내용을 입력해주세요.', 'error');
                return false;
            }
            
            return true;
            
        default:
            return true;
    }
}

// 정비 등록 처리 함수
async function submitMaintenanceForm(e) {
    e.preventDefault();
    
    // 중복 실행 방지
    if (window.isSubmittingMaintenance) {
        console.log('⚠️ Maintenance submission already in progress, skipping...');
        return;
    }
    
    if (!validateCurrentStep()) {
        return;
    }
    
    try {
        // 중복 실행 플래그 설정
        window.isSubmittingMaintenance = true;
        
        // Firebase 연결 상태 확인
        if (!checkFirebaseConnection()) {
            window.isSubmittingMaintenance = false;
            return;
        }
        
        showNotification('정비 이력을 등록하는 중...', 'info');
        
        // 폼 데이터 수집
        const formData = {
            carNumber: document.getElementById('carNumber').value.trim(),
            date: document.getElementById('maintenanceDate').value,
            type: document.getElementById('maintenanceType').value,
            mileage: document.getElementById('mileage')?.value || '',
            description: document.getElementById('description').value.trim(),
            adminEmail: currentUser.email,
            adminName: currentUser.name || '관리자',
            status: 'in-progress', // 관리자가 등록하면 진행중 상태로 시작
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            photos: []
        };
        
        // 데이터 검증
        console.log('📝 Form data validation:', {
            carNumber: formData.carNumber,
            date: formData.date,
            type: formData.type,
            adminEmail: formData.adminEmail,
            hasDescription: !!formData.description
        });
        
        // 필수 필드 검증
        if (!formData.carNumber || !formData.date || !formData.type || !formData.adminEmail) {
            throw new Error('필수 정보가 누락되었습니다.');
        }
        
        console.log('📝 Creating maintenance with status:', formData.status);
        
        // 수정 모드인지 확인
        console.log('🔍 Debug - window.editingMaintenanceId:', window.editingMaintenanceId);
        if (window.editingMaintenanceId) {
            // 수정 모드
            console.log('📝 Updating existing maintenance:', window.editingMaintenanceId);
            
            // 수정 시에는 상태를 변경하지 않음 (진행중 유지)
            delete formData.status;
            delete formData.createdAt;
            formData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            
            await db.collection('maintenance').doc(window.editingMaintenanceId).update(formData);
            console.log('✅ Maintenance updated successfully');
            
            // 🔄 수정 모드에서는 항상 사진 병합 로직 실행
            console.log('📸 Processing photos in edit mode (always check)...');
            
            // 새로 업로드한 사진이 있는지 확인 (새로운 사진 업로드 시스템)
            const hasNewPhotos = Object.keys(uploadedPhotos).some(key => uploadedPhotos[key]);
            console.log('📸 Has new photos:', hasNewPhotos);
            
            let newPhotos = [];
            if (hasNewPhotos) {
                // 새 사진 업로드
                newPhotos = await uploadMaintenancePhotos(window.editingMaintenanceId);
                console.log('📸 New photos uploaded:', newPhotos);
            }
            
            // 🔄 기존 사진과 새 사진을 스마트하게 병합 (새 사진이 없어도 실행)
            const currentDoc = await db.collection('maintenance').doc(window.editingMaintenanceId).get();
            const currentPhotos = currentDoc.data().photos || [];
            console.log('📸 Current photos before merge:', currentPhotos);
            
            if (newPhotos.length > 0) {
                // 새 사진이 있는 경우: 교체 병합
                const newPhotoTypes = newPhotos.map(p => p.type);
                console.log('📸 New photo types:', newPhotoTypes);
                
                // 기존 사진에서 새로 업로드된 타입과 겹치지 않는 것들만 유지
                const filteredCurrentPhotos = currentPhotos.filter(existingPhoto => {
                    const shouldKeep = !newPhotoTypes.includes(existingPhoto.type);
                    if (!shouldKeep) {
                        console.log(`📸 Replacing existing ${existingPhoto.type} photo`);
                    }
                    return shouldKeep;
                });
                
                // 필터링된 기존 사진 + 새 사진 = 최종 사진 배열
                const finalPhotos = [...filteredCurrentPhotos, ...newPhotos];
                console.log('📸 Final photos after merge:', finalPhotos);
                
                await db.collection('maintenance').doc(window.editingMaintenanceId).update({
                    photos: finalPhotos
                });
                console.log('✅ Photos updated for maintenance record:', finalPhotos.length);
                showNotification(`${newPhotos.length}장의 사진이 업데이트되었습니다!`, 'success');
            } else {
                // 새 사진이 없는 경우: 기존 사진 그대로 유지
                console.log('📸 No new photos - keeping existing photos:', currentPhotos.length);
                if (currentPhotos.length > 0) {
                    showNotification(`기존 사진 ${currentPhotos.length}장이 유지되었습니다.`, 'info');
                }
            }
            
            showNotification('정비 이력이 성공적으로 수정되었습니다!', 'success');
            
            // 수정 모드 플래그 제거
            delete window.editingMaintenanceId;
        } else {
            // 새 등록 모드
            const docRef = await db.collection('maintenance').add(formData);
            console.log('✅ Maintenance added with ID:', docRef.id);
            
            // 사진 업로드 (있는 경우)
            console.log('📸 Checking uploaded photos:', uploadedPhotos);
            console.log('📸 Before photo exists:', !!uploadedPhotos.before);
            console.log('📸 During photos exist:', {
                during1: !!uploadedPhotos.during1,
                during2: !!uploadedPhotos.during2,
                during3: !!uploadedPhotos.during3,
                during4: !!uploadedPhotos.during4
            });
            console.log('📸 After photo exists:', !!uploadedPhotos.after);
            
            if (Object.keys(uploadedPhotos).some(key => uploadedPhotos[key])) {
                const photos = await uploadMaintenancePhotos(docRef.id);
                console.log('📸 Photos returned from upload:', photos);
                
                if (photos.length > 0) {
                    await db.collection('maintenance').doc(docRef.id).update({
                        photos: photos
                    });
                    console.log('✅ Photos saved to maintenance record:', photos.length);
                    console.log('✅ Photo details:', photos.map(p => ({ type: p.type, url: p.url })));
                }
            }
            
            showNotification('정비 이력이 성공적으로 등록되었습니다!', 'success');
            
            // 사진이 있을 경우 보존 기간 안내
            if (Object.keys(uploadedPhotos).some(key => uploadedPhotos[key])) {
                setTimeout(() => {
                    showNotification(`📸 등록된 사진은 ${PHOTO_RETENTION_DAYS}일 후 자동 삭제됩니다.`, 'info');
                }, 2000);
            }
        }
        
        closeMaintenanceModal();
        
        // 🗑️ 관련 캐시 무효화 (데이터 변경으로 인한)
        clearCachedData('maintenanceTimeline');
        clearCachedData('todayStats');
        clearCachedData('pendingStats');
        clearCachedData('monthStats');
        clearCachedData('averageStats');
        
        // 대시보드 데이터 새로고침
        loadDashboardData();
        
    } catch (error) {
        console.error('❌ Error submitting maintenance:', error);
        showNotification('정비 이력 등록 실패: ' + error.message, 'error');
    } finally {
        // 중복 실행 플래그 해제
        window.isSubmittingMaintenance = false;
    }
}

// 타입 선택 초기화 함수 (중복 방지)
function initializeTypeSelector() {
    // 중복 초기화 방지
    if (window.typeSelectorInitialized) {
        console.log('⚠️ Type selector already initialized, skipping...');
        return;
    }
    
    const typeOptions = document.querySelectorAll('.type-option');
    
    // 중복 이벤트 리스너 방지
    typeOptions.forEach(option => {
        if (option.hasAttribute('data-listener-added')) {
            return;
        }
        
        option.addEventListener('click', () => {
            // 기존 선택 해제
            typeOptions.forEach(opt => opt.classList.remove('selected'));
            
            // 현재 옵션 선택
            option.classList.add('selected');
            
            // hidden input 업데이트
            const maintenanceTypeInput = document.getElementById('maintenanceType');
            if (maintenanceTypeInput) {
                maintenanceTypeInput.value = option.dataset.type;
            }
        });
        
        option.setAttribute('data-listener-added', 'true');
    });
    
    // 초기화 완료 표시
    window.typeSelectorInitialized = true;
    console.log('✅ Type selector initialized');
}

// 개선된 사진 업로드 초기화 함수
function initializePhotoUpload() {
    // 중복 초기화 방지
    if (window.photoUploadInitialized) {
        return;
    }
    
    const uploadAllBtn = document.getElementById('uploadAllBtn');
    const photoInput = document.getElementById('photoInput');
    const dragDropArea = document.getElementById('dragDropArea');
    const photoGrid = document.getElementById('photoGrid');
    const selectedCountElement = document.getElementById('selectedCount');
    
    // 업로드 버튼 클릭 이벤트
    if (uploadAllBtn) {
        uploadAllBtn.addEventListener('click', () => {
            photoInput.click();
        });
    }
    
    // 파일 선택 이벤트 (모바일 최적화)
    if (photoInput) {
        photoInput.addEventListener('change', handleMultiplePhotoUpload);
        
        // 모바일에서 카메라/갤러리 선택 가능하도록 설정
        photoInput.setAttribute('accept', 'image/*');
        // capture 속성 제거하여 사용자가 카메라/갤러리 선택 가능하게 함
        // photoInput.setAttribute('capture', 'environment');
    }
    
    // 드래그 앤 드롭 이벤트 (모바일 터치 지원)
    if (dragDropArea) {
        dragDropArea.addEventListener('click', () => {
            photoInput.click();
        });
        
        // 모바일 터치 이벤트 추가
        dragDropArea.addEventListener('touchstart', (e) => {
            e.preventDefault();
            photoInput.click();
        });
        
        dragDropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dragDropArea.classList.add('dragover');
        });
        
        dragDropArea.addEventListener('dragleave', () => {
            dragDropArea.classList.remove('dragover');
        });
        
        dragDropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dragDropArea.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
            handleMultiplePhotoUpload({ target: { files } });
        });
    }
    
    // 사진 삭제 버튼 이벤트
    if (photoGrid) {
        photoGrid.addEventListener('click', (e) => {
            if (e.target.closest('.remove-photo')) {
                const photoSlot = e.target.closest('.photo-slot');
                const photoType = photoSlot.dataset.type;
                removePhoto(photoType);
                updatePhotoCount();
            }
        });
    }
    
    // 초기 슬롯 생성 및 카운트 업데이트
    updatePhotoCount();
    
    // 정확히 10개 슬롯만 생성
    const grid = document.getElementById('photoGrid');
    if (grid) {
        grid.innerHTML = ''; // 기존 슬롯 모두 제거
        for (let i = 0; i < 10; i++) {
            createPhotoSlot(i);
        }
    }
    
    // 초기화 완료 표시
    window.photoUploadInitialized = true;
}

// 다중 사진 업로드 처리 (진행률 표시 개선)
async function handleMultiplePhotoUpload(event) {
    const files = Array.from(event.target.files).filter(file => file.type.startsWith('image/'));
    
    if (files.length === 0) {
        showNotification('이미지 파일을 선택해주세요.', 'warning');
        return;
    }
    
    // 모바일에서 카메라로 촬영한 경우 안내
    if (files.length === 1 && window.innerWidth <= 768) {
        const file = files[0];
        if (file.name.includes('image') || file.name.includes('IMG')) {
            showNotification('📸 카메라로 촬영된 사진이 선택되었습니다.', 'info');
        }
    }
    
    // 현재 업로드된 사진 개수 확인
    const currentCount = Object.keys(uploadedPhotos).filter(key => uploadedPhotos[key]).length;
    
    if (currentCount + files.length > 10) {
        showNotification(`사진이 너무 많습니다. (${10 - currentCount}장 더 추가 가능)`, 'warning');
        return;
    }
    
    // 진행률 표시 시작
    showUploadProgress(0, files.length);
    
    // 파일들을 순서대로 업로드
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const photoIndex = currentCount + i;
        const photoKey = `photo${photoIndex}`;
        
        try {
            await handlePhotoUpload(file, photoKey);
            // 진행률 업데이트
            showUploadProgress(i + 1, files.length);
        } catch (error) {
            console.error(`❌ 사진 업로드 실패: ${photoKey}`, error);
            showNotification(`${photoKey} 사진 업로드 실패: ${error.message}`, 'error');
        }
    }
    
    updatePhotoCount();
    hideUploadProgress();
    showNotification(`${files.length}장의 사진이 업로드되었습니다.`, 'success');
}

// 사진 업로드 처리 함수
async function handlePhotoUpload(file, type) {
    try {
        // 이미지 리사이즈
        const resizedFile = await resizeImage(file);
        
        // Base64로 변환하여 임시 저장
        const base64 = await convertToBase64(resizedFile);
        uploadedPhotos[type] = base64;
        
        // 미리보기 표시
        showPhotoPreview(base64, type);
        
    } catch (error) {
        console.error(`❌ Error uploading ${type} photo:`, error);
        throw error; // 상위 함수에서 처리하도록 에러 전파
    }
}

// 업로드 진행률 표시 함수
function showUploadProgress(current, total) {
    const progress = Math.round((current / total) * 100);
    
    // 기존 진행률 표시 제거
    let existingProgress = document.getElementById('uploadProgress');
    if (existingProgress) {
        existingProgress.remove();
    }
    
    // 새로운 진행률 표시 생성
    const progressHTML = `
        <div id="uploadProgress" style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 10px;
            z-index: 10000;
            text-align: center;
            min-width: 300px;
        ">
            <div style="margin-bottom: 15px;">
                <i class="fas fa-upload" style="font-size: 24px; margin-bottom: 10px;"></i>
                <h4 style="margin: 0 0 10px 0;">사진 업로드 중...</h4>
                <p style="margin: 0; opacity: 0.8;">${current}/${total} 장 완료</p>
            </div>
            <div style="
                width: 100%;
                height: 8px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 10px;
            ">
                <div style="
                    width: ${progress}%;
                    height: 100%;
                    background: linear-gradient(90deg, #4CAF50, #45a049);
                    transition: width 0.3s ease;
                "></div>
            </div>
            <div style="font-size: 14px; opacity: 0.8;">${progress}% 완료</div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', progressHTML);
}

// 업로드 진행률 숨기기 함수
function hideUploadProgress() {
    const progress = document.getElementById('uploadProgress');
    if (progress) {
        progress.remove();
    }
}

// 개선된 사진 미리보기 표시 함수
function showPhotoPreview(base64, type) {
    const photoSlot = document.querySelector(`[data-type="${type}"]`);
    if (!photoSlot) return;
    
    const placeholder = photoSlot.querySelector('.photo-placeholder');
    const preview = photoSlot.querySelector('.photo-preview');
    
    if (placeholder && preview) {
        placeholder.style.display = 'none';
        preview.classList.remove('hidden');
        
        const img = preview.querySelector('img');
        if (img) {
            img.src = base64;
        }
    }
}

// 사진 슬롯 생성 함수
function createPhotoSlot(index) {
    const photoGrid = document.getElementById('photoGrid');
    if (!photoGrid) return;
    
    const photoSlot = document.createElement('div');
    photoSlot.className = 'photo-slot';
    photoSlot.dataset.type = `photo${index}`;
    
    photoSlot.innerHTML = `
        <div class="photo-placeholder">
            <i class="fas fa-camera"></i>
            <span>사진 ${index + 1}</span>
        </div>
        <div class="photo-preview hidden">
            <img src="" alt="사진 ${index + 1}">
            <button type="button" class="remove-photo" title="삭제">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    photoGrid.appendChild(photoSlot);
}

// 사진 개수 업데이트 함수
function updatePhotoCount() {
    const selectedCountElement = document.getElementById('selectedCount');
    if (!selectedCountElement) return;
    
    const usedSlots = Object.keys(uploadedPhotos).filter(key => uploadedPhotos[key]);
    const count = usedSlots.length;
    
    selectedCountElement.textContent = count;
    
    // 상태에 따른 스타일 변경
    if (count === 0) {
        selectedCountElement.style.color = 'var(--text-tertiary)';
    } else if (count >= 10) {
        selectedCountElement.style.color = 'var(--success)';
    } else {
        selectedCountElement.style.color = 'var(--primary-600)';
    }
    
    // 슬롯은 항상 10개만 유지
    const grid = document.getElementById('photoGrid');
    if (grid && grid.children.length !== 10) {
        grid.innerHTML = ''; // 기존 슬롯 모두 제거
        for (let i = 0; i < 10; i++) {
            createPhotoSlot(i);
        }
    }
}

// 개선된 사진 제거 함수
function removePhoto(type) {
    uploadedPhotos[type] = null;
    
    const photoSlot = document.querySelector(`[data-type="${type}"]`);
    if (photoSlot) {
        const placeholder = photoSlot.querySelector('.photo-placeholder');
        const preview = photoSlot.querySelector('.photo-preview');
        
        if (placeholder && preview) {
            preview.classList.add('hidden');
            placeholder.style.display = 'block';
        }
    }
    
    // 파일 입력 초기화
    const photoInput = document.getElementById('photoInput');
    if (photoInput) {
        photoInput.value = '';
    }
    
    updatePhotoCount();
    showNotification(`${type} 사진이 제거되었습니다.`, 'info');
}

// URL에서 사진 미리보기 표시 함수 (수정 모드용)
function showPhotoPreviewFromUrl(imageUrl, type) {
    const uploadArea = document.querySelector(`[data-type="${type}"]`);
    if (!uploadArea) return;
    
    const placeholder = uploadArea.querySelector('.upload-placeholder');
    const preview = uploadArea.querySelector('.photo-preview');
    
    if (placeholder && preview) {
        placeholder.style.display = 'none';
        preview.style.display = 'block';
        
        const img = preview.querySelector('img');
        if (img) {
            img.src = imageUrl;
        }
        
        // 기존 사진임을 표시하는 배지 추가
        let badge = preview.querySelector('.existing-photo-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'existing-photo-badge';
            badge.innerHTML = '<i class="fas fa-clock"></i> 기존 사진';
            badge.style.cssText = `
                position: absolute;
                top: 5px;
                left: 5px;
                background: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 10px;
                z-index: 10;
            `;
            preview.style.position = 'relative';
            preview.appendChild(badge);
        }
        
        console.log(`🖼️ ${type} 기존 사진 미리보기 표시 완료`);
    }
}

// 기존 사진 제거 함수 (수정 모드용)
function removeExistingPhoto(type) {
    // 기존 사진은 단순히 미리보기만 제거 (실제 삭제는 하지 않음)
    const uploadArea = document.querySelector(`[data-type="${type}"]`);
    if (uploadArea) {
        const placeholder = uploadArea.querySelector('.upload-placeholder');
        const preview = uploadArea.querySelector('.photo-preview');
        
        if (placeholder && preview) {
            preview.style.display = 'none';
            placeholder.style.display = 'flex';
            
            // 배지 제거
            const badge = preview.querySelector('.existing-photo-badge');
            if (badge) {
                badge.remove();
            }
        }
    }
    
    showNotification(`${type} 기존 사진을 제거했습니다. (새로 업로드하면 교체됩니다)`, 'info');
    console.log(`🖼️ ${type} 기존 사진 미리보기 제거`);
}

// 전역 함수로 만들어서 HTML에서 호출 가능하게 함
window.removePhoto = removePhoto;
window.removeExistingPhoto = removeExistingPhoto;
window.submitMaintenanceForm = submitMaintenanceForm;

// 사진 업로드 리셋 함수
function resetPhotoUploads() {
    uploadedPhotos = {};
    
    // 모든 사진 슬롯 초기화 (슬롯은 유지, 내용만 리셋)
    const photoGrid = document.getElementById('photoGrid');
    if (photoGrid) {
        photoGrid.querySelectorAll('.photo-slot').forEach(slot => {
            const placeholder = slot.querySelector('.photo-placeholder');
            const preview = slot.querySelector('.photo-preview');
            
            if (placeholder && preview) {
                preview.classList.add('hidden');
                placeholder.style.display = 'block';
            }
        });
    }
    
    // 파일 입력 초기화
    const photoInput = document.getElementById('photoInput');
    if (photoInput) {
        photoInput.value = '';
    }
    
    // 카운터 업데이트
    updatePhotoCount();
}

// Continue with more functions...

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



// 정비 이력 목록을 비동기로 렌더링
async function loadMaintenanceHistory(search = '') {
    const maintenanceItems = document.getElementById('maintenanceItems');
    if (!maintenanceItems) return;

    // 🔒 로그인 상태 체크 - 보안 강화
    if (!currentUser) {
        maintenanceItems.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">로그인 후 정비 이력을 확인하세요</div>';
        return;
    }

    maintenanceItems.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> 로딩중...</div>';

    let query = db.collection('maintenance');
    if (isAdmin) {
        query = query.where('adminEmail', '==', currentUser.email);
    } else if (currentUser) {
        query = query.where('carNumber', '==', currentUser.carNumber);
    }

    try {
        // Firebase 쿼리 최적화: 최신 100개만 조회 후 클라이언트에서 검색 필터링
        const snapshot = await query.orderBy('createdAt', 'desc').limit(100).get();
        maintenanceItems.innerHTML = '';
        let maintenances = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            maintenances.push({ 
                ...data, 
                id: doc.id,
                createdAtTimestamp: data.createdAt ? data.createdAt.toDate().getTime() : new Date().getTime()
            });
        });
        
        // 클라이언트 측에서 날짜순 정렬 (최신순)
        maintenances.sort((a, b) => b.createdAtTimestamp - a.createdAtTimestamp);

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

// 정비 완료 처리 함수 (관리자용)
async function completeMaintenanceWork(maintenanceId) {
    if (!isAdmin) {
        showNotification('관리자만 정비 완료 처리할 수 있습니다.', 'error');
        return;
    }
    
    try {
        console.log('✅ Completing maintenance work:', maintenanceId);
        
        // 정비 이력 정보 가져오기
        const maintenanceDoc = await db.collection('maintenance').doc(maintenanceId).get();
        const maintenanceData = maintenanceDoc.data();
        
        // 상태를 "완료됨"으로 업데이트 (사용자 확인 대기)
        await db.collection('maintenance').doc(maintenanceId).update({
            status: 'completed',
            completedAt: firebase.firestore.FieldValue.serverTimestamp(),
            completedBy: currentUser.name || '관리자'
        });
        
        console.log('✅ Maintenance marked as completed');
        showNotification('정비 작업이 완료되었습니다. 사용자 확인을 기다립니다.', 'success');
        
        // 해당 차량번호의 사용자에게 알림
        if (maintenanceData && maintenanceData.carNumber) {
            const userSnapshot = await db.collection('users')
                .where('carNumber', '==', maintenanceData.carNumber)
                .get();
                
            if (!userSnapshot.empty) {
                const userData = userSnapshot.docs[0].data();
                const userId = userSnapshot.docs[0].id;
                
                // 사용자에게 정비 완료 알림
                const notification = {
                    title: '정비 작업 완료',
                    message: `${maintenanceData.type || '정비'} 작업이 완료되었습니다. 확인/거절을 선택해주세요.`,
                    type: 'info',
                    read: false,
                    userId: userId,
                    maintenanceId: maintenanceId,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                await db.collection('notifications').add(notification);
                console.log('🔔 Completion notification sent to user:', userData.name);
            }
        }
        
        loadDashboardData(); // Refresh dashboard
        
    } catch (error) {
        console.error('❌ Error completing maintenance:', error);
        showNotification('정비 완료 처리 실패: ' + error.message, 'error');
    }
}

// 정비 상태 업데이트 함수 (사용자용 확인/거절)
async function updateMaintenanceStatus(maintenanceId, newStatus) {
    if (!currentUser) return;
    
    try {
        console.log('🔄 Updating maintenance status:', maintenanceId, newStatus);
        
        // 정비 이력 정보 가져오기
        const maintenanceDoc = await db.collection('maintenance').doc(maintenanceId).get();
        const maintenanceData = maintenanceDoc.data();
        
        // 권한 체크: 관리자는 진행중/승인된 상태를 완료로 변경 가능, 사용자는 완료된 것만 확인/거절 가능
        const status = maintenanceData.status ? maintenanceData.status.toLowerCase() : '';
        const isCompletable = status === 'in-progress' || status === 'approved' || status === 'pending';
        
        if (isAdmin && isCompletable && newStatus === 'completed') {
            await completeMaintenanceWork(maintenanceId);
            return;
        } else if (!isAdmin && status === 'completed' && ['approved', 'rejected'].includes(newStatus)) {
            // 사용자의 확인/거절 처리
            await db.collection('maintenance').doc(maintenanceId).update({
                status: newStatus,
                finalizedAt: firebase.firestore.FieldValue.serverTimestamp(),
                finalizedBy: currentUser.name || '사용자'
            });
            
            showNotification(`정비를 ${newStatus === 'approved' ? '확인' : '거절'}하였습니다.`, newStatus === 'approved' ? 'success' : 'warning');
            
            // 관리자에게 알림
            const adminSnapshot = await db.collection('users')
                .where('email', '==', maintenanceData.adminEmail)
                .get();
                
            if (!adminSnapshot.empty) {
                const adminData = adminSnapshot.docs[0].data();
                const adminId = adminSnapshot.docs[0].id;
                
                const notification = {
                    title: newStatus === 'approved' ? '정비 확인됨' : '정비 거절됨',
                    message: `${currentUser.name || '사용자'}가 ${maintenanceData.type || '정비'}를 ${newStatus === 'approved' ? '확인' : '거절'}했습니다.`,
                    type: newStatus === 'approved' ? 'success' : 'warning',
                    read: false,
                    userId: adminId,
                    maintenanceId: maintenanceId,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                await db.collection('notifications').add(notification);
                console.log('🔔 Status notification sent to admin:', adminData.name);
            }
        } else {
            showNotification('권한이 없거나 잘못된 상태 변경입니다.', 'error');
            return;
        }
        
        loadDashboardData(); // Refresh dashboard
        
    } catch (error) {
        console.error('❌ Error updating status:', error);
        showNotification('상태 업데이트 실패: ' + error.message, 'error');
    }
}

// 거절 이유와 함께 정비 상태 업데이트 함수
async function updateMaintenanceStatusWithReason(maintenanceId, newStatus, rejectReason) {
    if (!currentUser) return;
    
    try {
        console.log('🔄 Updating maintenance status with reason:', maintenanceId, newStatus, rejectReason);
        
        // 정비 이력 정보 가져오기
        const maintenanceDoc = await db.collection('maintenance').doc(maintenanceId).get();
        const maintenanceData = maintenanceDoc.data();
        
        const status = maintenanceData.status ? maintenanceData.status.toLowerCase() : '';
        
        if (!isAdmin && status === 'completed' && newStatus === 'rejected') {
            // 사용자의 거절 처리 (거절 이유 포함)
            await db.collection('maintenance').doc(maintenanceId).update({
                status: newStatus,
                rejectReason: rejectReason,
                finalizedAt: firebase.firestore.FieldValue.serverTimestamp(),
                finalizedBy: currentUser.name || '사용자'
            });
            
            // 관리자에게 알림 (거절 이유 포함)
            const adminSnapshot = await db.collection('users')
                .where('email', '==', maintenanceData.adminEmail)
                .get();
                
            if (!adminSnapshot.empty) {
                const adminData = adminSnapshot.docs[0].data();
                const adminId = adminSnapshot.docs[0].id;
                
                const notification = {
                    title: '정비 거절됨',
                    message: `${currentUser.name || '사용자'}가 ${maintenanceData.type || '정비'}를 거절했습니다.\n거절 이유: ${rejectReason}`,
                    type: 'warning',
                    read: false,
                    userId: adminId,
                    maintenanceId: maintenanceId,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                await db.collection('notifications').add(notification);
                console.log('🔔 Rejection notification sent to admin:', adminData.name);
            }
        } else {
            showNotification('권한이 없거나 잘못된 상태 변경입니다.', 'error');
            return;
        }
        
        loadDashboardData(); // Refresh dashboard
        
    } catch (error) {
        console.error('❌ Error updating maintenance status with reason:', error);
        showNotification('상태 변경 실패: ' + error.message, 'error');
    }
}

// 알림 표시
function showNotification(message, type = 'info') {
    console.log('🔔 알림 표시:', { message, type });
    
    // 알림 컨테이너 확인 및 생성
    let container = document.getElementById('notificationContainer');
    if (!container) {
        console.log('📦 알림 컨테이너가 없어서 생성합니다');
        container = document.createElement('div');
        container.id = 'notificationContainer';
        container.className = 'notification-container';
        container.style.cssText = `
            position: fixed;
            top: calc(var(--header-height, 60px) + 16px);
            right: 16px;
            z-index: 10000;
            max-width: 400px;
            width: calc(100vw - 32px);
        `;
        document.body.appendChild(container);
    }
    
    // 기존 알림들 정리 (최대 3개까지만 유지)
    const existingNotifications = container.querySelectorAll('.notification');
    if (existingNotifications.length >= 3) {
        existingNotifications[0].remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-${getNotificationIcon(type)}" style="font-size: 16px;"></i>
            <span style="flex: 1;">${message}</span>
        </div>
    `;
    
    // 스타일 직접 적용
    notification.style.cssText = `
        background: var(--surface, #ffffff);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border-left: 4px solid ${getNotificationColor(type)};
        padding: 12px 16px;
        margin-bottom: 8px;
        transform: translateX(100%);
        transition: all 0.3s ease;
        max-width: 400px;
        width: calc(100vw - 32px);
        position: relative;
        z-index: 10000;
    `;
    
    container.appendChild(notification);
    
    // 알림 표시 애니메이션
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // 자동 숨김 (2초 후)
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            try {
                if (notification.parentNode) {
                    notification.remove();
                }
            } catch (error) {
                console.log('알림 제거 중 오류:', error);
            }
        }, 300);
    }, 2000);
}

function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'warning': return 'exclamation-triangle';
        default: return 'info-circle';
    }
}

function getNotificationColor(type) {
    switch (type) {
        case 'success': return '#10b981';
        case 'error': return '#ef4444';
        case 'warning': return '#f59e0b';
        default: return '#3b82f6';
    }
}

function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'warning': return 'exclamation-triangle';
        default: return 'info-circle';
    }
}

function updateUI() {
    // Update FAB visibility
    const fab = document.getElementById('addMaintenanceFab');
    if (fab) {
        fab.style.display = isAdmin ? 'flex' : 'none';
    }
    
    // 🔒 세무 탭 권한 제어 - 관리자만 표시
    const taxationNavItem = document.getElementById('taxationNavItem');
    if (taxationNavItem) {
        console.log('🔐 세무 탭 권한 확인:', { isAdmin, currentUser: currentUser?.email });
        // 임시로 세무 탭 표시 (테스트용)
        taxationNavItem.style.display = 'block';
        console.log('✅ 세무 탭 표시됨');
    }
    
    // Update notification badge
    updateNotificationBadge();
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';
        
        // 9 이상이면 "9+" 표시
        if (unreadCount > 9) {
            badge.textContent = '9+';
        }
    }
}

// 검색 및 필터 초기화 함수
function initializeSearchAndFilters() {
    const quickSearch = document.getElementById('quickSearch');
    const filterChips = document.querySelectorAll('.filter-chip');
    
    // 초기 필터를 '전체'로 설정
    window.currentFilter = 'all';
    
    // 디바운싱을 위한 타이머 변수
    let searchTimeout = null;
    
    if (quickSearch) {
        quickSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value;
            
            // 이전 타이머가 있으면 취소
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            
            // 500ms 후에 검색 실행 (디바운싱)
            searchTimeout = setTimeout(() => {
                loadMaintenanceTimeline(searchTerm);
            }, 500);
        });
    }
    
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            // Remove active from all chips
            filterChips.forEach(c => c.classList.remove('active'));
            // Add active to clicked chip
            chip.classList.add('active');
            
            const filter = chip.dataset.filter;
            applyFilter(filter);
        });
    });
}

// 필터 적용 함수
function applyFilter(filter) {
    console.log('🔍 Applying filter:', filter);
    
    // 현재 활성화된 필터를 전역 변수로 저장
    window.currentFilter = filter;
    
    const searchTerm = document.getElementById('quickSearch')?.value || '';
    loadMaintenanceTimeline(searchTerm);
}

// 중복된 함수 정의 제거됨 - 위에 async 버전이 메인 함수임

// 이벤트 리스너 초기화 함수
function initializeEventListeners() {
    console.log('🎯 Initializing event listeners...');
    
    // 보기 전환 버튼 이벤트 리스너
    const viewToggle = document.getElementById('viewToggle');
    if (viewToggle) {
        viewToggle.addEventListener('click', toggleViewMode);
    }
    
    // 페이지 새로고침 시 로그인 화면 표시 (제거 - 사용자 경험 개선)
    // window.addEventListener('beforeunload', () => {
    //     showScreen('loginScreen');
    // });
    
    // 키보드 단축키
    document.addEventListener('keydown', (e) => {
        // ESC 키로 모달 닫기
        if (e.key === 'Escape') {
            closeMaintenanceModal();
        }
    });
    
    // 맨 위로 가기 버튼 초기화
    initializeScrollToTop();
}

// 맨 위로 가기 버튼 초기화 함수
function initializeScrollToTop() {
    console.log('⬆️ Initializing scroll to top functionality...');
    
    const scrollToTopBtn = document.getElementById('scrollToTopBtn');
    if (!scrollToTopBtn) {
        console.warn('❌ Scroll to top button not found');
        return;
    }
    
    let scrollTimer = null;
    
    // 스크롤 이벤트 리스너 (스로틀링)
    function handleScroll() {
        if (scrollTimer) {
            clearTimeout(scrollTimer);
        }
        
        scrollTimer = setTimeout(() => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const showThreshold = 300; // 300px 이상 스크롤하면 버튼 표시
            
            if (scrollTop > showThreshold) {
                scrollToTopBtn.classList.add('show');
                scrollToTopBtn.style.display = 'flex';
            } else {
                scrollToTopBtn.classList.remove('show');
                // 애니메이션 완료 후 display none
                setTimeout(() => {
                    if (!scrollToTopBtn.classList.contains('show')) {
                        scrollToTopBtn.style.display = 'none';
                    }
                }, 300);
            }
        }, 100); // 100ms 디바운싱
    }
    
    // 클릭 이벤트 리스너
    function handleScrollToTop() {
        console.log('⬆️ Scrolling to top...');
        
        // 부드러운 스크롤
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
        
        // 햅틱 피드백 (모바일에서만)
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
        
        showNotification('맨 위로 이동했습니다', 'info');
    }
    
    // 이벤트 리스너 등록
    window.addEventListener('scroll', handleScroll, { passive: true });
    scrollToTopBtn.addEventListener('click', handleScrollToTop);
    
    console.log('✅ Scroll to top functionality initialized');
}

// 보기 모드 전환 함수
function toggleViewMode() {
    console.log('🔄 Toggling view mode from:', currentViewMode);
    
    const viewToggle = document.getElementById('viewToggle');
    const timelineContainer = document.getElementById('timelineContainer');
    
    if (!viewToggle || !timelineContainer) return;
    
    // 현재 보기 모드 전환
    currentViewMode = currentViewMode === 'card' ? 'list' : 'card';
    
    // 아이콘 업데이트
    const icon = viewToggle.querySelector('i');
    if (currentViewMode === 'card') {
        icon.className = 'fas fa-th-large'; // 카드 뷰 (그리드)
        viewToggle.title = '리스트 뷰로 전환';
        timelineContainer.classList.remove('list-view');
        timelineContainer.classList.add('card-view');
    } else {
        icon.className = 'fas fa-list'; // 리스트 뷰
        viewToggle.title = '카드 뷰로 전환';
        timelineContainer.classList.remove('card-view');
        timelineContainer.classList.add('list-view');
    }
    
    console.log('✅ View mode changed to:', currentViewMode);
    
    // 현재 검색어로 다시 렌더링
    const searchTerm = document.getElementById('quickSearch')?.value || '';
    loadMaintenanceTimeline(searchTerm);
    
    // 선택 사항 저장
    localStorage.setItem('viewMode', currentViewMode);
    
    showNotification(`${currentViewMode === 'card' ? '카드' : '리스트'} 뷰로 전환되었습니다`, 'info');
}

// 저장된 보기 모드 불러오기
function loadViewMode() {
    const savedViewMode = localStorage.getItem('viewMode');
    if (savedViewMode && ['card', 'list'].includes(savedViewMode)) {
        currentViewMode = savedViewMode;
        
        const viewToggle = document.getElementById('viewToggle');
        const timelineContainer = document.getElementById('timelineContainer');
        
        if (viewToggle && timelineContainer) {
            const icon = viewToggle.querySelector('i');
            if (currentViewMode === 'card') {
                icon.className = 'fas fa-th-large';
                viewToggle.title = '리스트 뷰로 전환';
                timelineContainer.classList.remove('list-view');
                timelineContainer.classList.add('card-view');
            } else {
                icon.className = 'fas fa-list';
                viewToggle.title = '카드 뷰로 전환';
                timelineContainer.classList.remove('card-view');
                timelineContainer.classList.add('list-view');
            }
        }
    }
}

// 정비 타입별 아이콘과 색상 가져오기 함수
function getTypeIconAndColor(type) {
    const types = {
        '일반점검': { icon: 'fa-tools', color: '#4bc0c0' },
        '엔진오일교체': { icon: 'fa-oil-can', color: '#ff6347' },
        '타이어교체': { icon: 'fa-circle', color: '#d4ac0d' },
        '브레이크정비': { icon: 'fa-brake', color: '#ff9f40' },
        '기타': { icon: 'fa-wrench', color: '#666' }
    };
    return types[type] || types['기타'];
}

// 아이콘 가져오기 함수들
function getTypeIcon(type) {
    const icons = {
        '일반점검': '<i class="fas fa-tools"></i>',
        '엔진오일교체': '<i class="fas fa-oil-can"></i>',
        '타이어교체': '🛞',
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
        'in-progress': '진행중',
        'completed': '완료됨',
        'approved': '확인됨',
        'rejected': '거절됨',
        'pending': '대기중'
    };
    return statusTexts[status] || status;
}

// 정비 타입 정보 가져오기 함수 (createMaintenanceCard에서 사용)
function getMaintenanceTypeInfo(type) {
    const types = {
        '일반점검': { icon: 'fas fa-tools', color: '#4bc0c0' },
        '엔진오일교체': { icon: 'fas fa-oil-can', color: '#ff6347' },
        '타이어교체': { icon: '🛞', color: '#d4ac0d' },
        '브레이크정비': { icon: 'fas fa-car-brake', color: '#ff9f40' },
        '기타': { icon: 'fas fa-wrench', color: '#666' }
    };
    return types[type] || types['기타'];
}

// 상태 정보 가져오기 함수 (createMaintenanceCard에서 사용)
function getStatusInfo(status) {
    const statusInfo = {
        'in-progress': { icon: 'fas fa-cog fa-spin', text: '진행중', class: 'primary', color: '#3498db' },
        'completed': { icon: 'fas fa-check', text: '완료됨', class: 'info', color: '#17a2b8' },
        'approved': { icon: 'fas fa-check-double', text: '확인됨', class: 'success', color: '#27ae60' },
        'rejected': { icon: 'fas fa-times', text: '거절됨', class: 'danger', color: '#e74c3c' },
        'pending': { icon: 'fas fa-clock', text: '대기중', class: 'warning', color: '#f39c12' }
    };
    return statusInfo[status] || statusInfo['pending'];
}

// 날짜 포맷팅 함수 (createMaintenanceCard에서 사용)
function formatDate(dateString) {
    if (!dateString) return '';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (error) {
        return dateString;
    }
}

// 차량번호 수정 함수 추가
async function updateCarNumber(newCarNumber) {
    console.log('🔧 updateCarNumber 시작');
    console.log('📊 currentUser:', currentUser);
    console.log('🔐 firebase.auth().currentUser:', firebase.auth().currentUser);
    console.log('📝 newCarNumber:', newCarNumber);
    
    if (!currentUser) {
        console.error('❌ currentUser가 없습니다!');
        showNotification('로그인 상태를 확인할 수 없습니다.', 'error');
        return;
    }
    
    const firebaseUser = firebase.auth().currentUser;
    if (!firebaseUser) {
        console.error('❌ Firebase 인증 사용자가 없습니다!');
        showNotification('Firebase 인증이 필요합니다.', 'error');
        return;
    }
    
    const trimmedCarNumber = newCarNumber.trim().replace(/\s+/g, '');
    console.log('🔄 정리된 차량번호:', trimmedCarNumber);
    
    try {
        // 현재 사용자의 차량번호와 동일한 경우 업데이트 불필요
        if (trimmedCarNumber === currentUser.carNumber) {
            showNotification('현재 등록된 차량번호와 동일합니다.', 'info');
            return;
        }
        
        console.log('🔍 중복 체크 시작...');
        // 차량번호 중복 체크
        const duplicateCheck = await db.collection('users')
            .where('carNumber', '==', trimmedCarNumber)
            .get();
            
        console.log('📊 중복 체크 결과:', duplicateCheck.size, '개 문서 발견');
            
        if (!duplicateCheck.empty) {
            showNotification('이미 등록된 차량번호입니다.', 'error');
            return;
        }
        
        console.log('💾 사용자 문서 업데이트 시작...');
        console.log('🎯 업데이트할 UID:', currentUser.uid);
        console.log('🎯 Firebase Auth UID:', firebaseUser.uid);
        console.log('🔄 UID 일치 여부:', currentUser.uid === firebaseUser.uid);
        
        // 토큰 새로고침 시도
        console.log('🔑 토큰 새로고침 시도...');
        await firebaseUser.getIdToken(true);
        console.log('✅ 토큰 새로고침 완료');
        
        // 문서 존재 여부 확인
        console.log('📄 사용자 문서 존재 여부 확인...');
        const userDocRef = db.collection('users').doc(currentUser.uid);
        const userDoc = await userDocRef.get();
        console.log('📄 사용자 문서 존재:', userDoc.exists);
        console.log('📄 사용자 문서 데이터:', userDoc.data());
        
        // 중복이 없는 경우에만 업데이트 진행
        console.log('🚀 실제 업데이트 시작...');
        
        try {
            // 방법 1: Firebase Admin SDK 방식 시도
            console.log('🔄 방법 1: 표준 update() 시도...');
            await userDocRef.update({
                carNumber: trimmedCarNumber,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('✅ update() 방식 성공!');
        } catch (updateError) {
            console.error('❌ update() 실패:', updateError);
            
            try {
                console.log('🔄 방법 2: set() with merge 시도...');
                await userDocRef.set({
                    carNumber: trimmedCarNumber,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                console.log('✅ set() 방식 성공!');
            } catch (setError) {
                console.error('❌ set() 실패:', setError);
                
                console.log('🔄 방법 3: 재인증 후 재시도...');
                // 강제 토큰 갱신
                await firebase.auth().currentUser.getIdToken(true);
                
                // 새로운 참조로 재시도
                const newUserRef = firebase.firestore().collection('users').doc(currentUser.uid);
                await newUserRef.update({
                    carNumber: trimmedCarNumber,
                    updatedAt: new Date()  // 서버 타임스탬프 대신 클라이언트 시간 사용
                });
                console.log('✅ 재인증 후 성공!');
            }
        }
            
        console.log('✅ Firestore 업데이트 성공!');
        
        currentUser.carNumber = trimmedCarNumber;
        
        console.log('✅ Car number updated in currentUser:', currentUser.carNumber);
        
        showNotification('오토바이 번호가 수정되었습니다.', 'success');
        
        // 대시보드 데이터 새로고침
        loadDashboardData();
        
    } catch (error) {
        console.error('❌ Error updating car number:', error);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error message:', error.message);
        
        if (error.code === 'permission-denied') {
            showNotification('권한이 없습니다. 다시 로그인해주세요.', 'error');
        } else {
            showNotification('오토바이 번호 수정 실패: ' + error.message, 'error');
        }
    }
}

// 이미지 리사이즈 함수 (toBlob 실패 시 toDataURL로 fallback, PNG도 지원)
async function resizeImage(file) {
    return new Promise((resolve, reject) => {
        if (file.size <= 512 * 1024) { // 1MB → 512KB로 낮춰서 더 많은 이미지 최적화
            resolve(file);
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const maxSize = 600; // 800px → 600px로 축소하여 용량 절약
                    let { width, height } = img;
                    if (width > height) {
                        if (width > maxSize) {
                            height = (height * maxSize) / width;
                            width = maxSize;
                        }
                    } else {
                        if (height > maxSize) {
                            width = (width * maxSize) / height;
                            height = maxSize;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    let called = false;
                    canvas.toBlob((blob) => {
                        if (called) return;
                        called = true;
                        if (blob) {
                            resolve(new File([blob], file.name, {
                                type: 'image/jpeg',
                                lastModified: Date.now()
                            }));
                        } else {
                            // fallback: Base64 PNG로 반환
                            const dataUrl = canvas.toDataURL('image/png');
                            fetch(dataUrl)
                                .then(res => res.blob())
                                .then(blob2 => {
                                    resolve(new File([blob2], file.name, {
                                        type: 'image/png',
                                        lastModified: Date.now()
                                    }));
                                })
                                .catch(() => resolve(file));
                        }
                    }, 'image/jpeg', 0.7); // 80% → 70%로 압축률 개선
                    setTimeout(() => {
                        if (!called) {
                            called = true;
                            // fallback: Base64 PNG로 반환
                            const dataUrl = canvas.toDataURL('image/png');
                            fetch(dataUrl)
                                .then(res => res.blob())
                                .then(blob2 => {
                                    resolve(new File([blob2], file.name, {
                                        type: 'image/png',
                                        lastModified: Date.now()
                                    }));
                                })
                                .catch(() => resolve(file));
                        }
                    }, 2000);
                } catch (error) {
                    resolve(file);
                }
            };
            img.onerror = function() { resolve(file); };
            img.src = e.target.result;
        };
        reader.onerror = function() { resolve(file); };
        reader.readAsDataURL(file);
    });
}

// EXIF 방향 정보 추출 함수
function getImageOrientation(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    if (view.getUint16(0, false) !== 0xFFD8) return 1; // Not a JPEG
    
    const length = view.byteLength;
    let offset = 2;
    
    while (offset < length) {
        const marker = view.getUint16(offset, false);
        offset += 2;
        
        if (marker === 0xFFE1) {
            if (view.getUint32(offset += 2, false) !== 0x45786966) return 1;
            
            const little = view.getUint16(offset += 6, false) === 0x4949;
            offset += view.getUint32(offset + 4, little);
            
            const tags = view.getUint16(offset, little);
            offset += 2;
            
            for (let i = 0; i < tags; i++) {
                if (view.getUint16(offset + (i * 12), little) === 0x0112) {
                    return view.getUint16(offset + (i * 12) + 8, little);
                }
            }
        } else if ((marker & 0xFF00) !== 0xFF00) break;
        else offset += view.getUint16(offset, false);
    }
    
    return 1; // Default orientation
}

// 개선된 사진 업로드 함수 - 배치 처리로 성능 향상
async function uploadMaintenancePhotos(maintenanceId) {
    console.log('📸 Starting batch photo upload for maintenance:', maintenanceId);
    console.log('📸 Photos to upload:', Object.keys(uploadedPhotos).filter(key => uploadedPhotos[key]));
    
    // 업로드할 사진들을 미리 검증하고 준비
    const photosToUpload = [];
    const uploadedPhotoKeys = Object.keys(uploadedPhotos).filter(key => uploadedPhotos[key]);
    
    for (const photoKey of uploadedPhotoKeys) {
        const base64Data = uploadedPhotos[photoKey];
        
        // 사진 데이터 검증
        const isValidPhotoData = base64Data && 
                                base64Data.trim() && 
                                base64Data.includes('data:image') && 
                                base64Data.length > 100;
        
        if (isValidPhotoData) {
            // Base64 데이터에서 data:image/... 부분 제거
            const base64Image = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
            
            if (base64Image && base64Image.length >= 100) {
                photosToUpload.push({
                    key: photoKey,
                    base64Data: base64Image,
                    timestamp: Date.now()
                });
            } else {
                console.error(`❌ Invalid base64 content for ${photoKey}`);
                showNotification(`${photoKey} 사진 데이터가 손상되었습니다.`, 'error');
            }
        }
    }
    
    if (photosToUpload.length === 0) {
        console.log('📸 No valid photos to upload');
        return [];
    }
    
    console.log(`📸 Preparing to upload ${photosToUpload.length} photos in batch...`);
    
    // 진행률 표시 시작
    showUploadProgress(0, photosToUpload.length);
    
    // 배치 업로드 실행 (병렬 처리 + 재시도 로직)
    const uploadWithRetry = async (photoData, retryCount = 0) => {
        const maxRetries = 2;
        
        try {
            const { key, base64Data, timestamp } = photoData;
            
            // ImgBB API 호출
            const formData = new FormData();
            formData.append('key', IMGBB_API_KEY);
            formData.append('image', base64Data);
            formData.append('name', `maintenance_${maintenanceId}_${key}_${timestamp}`);
            
            console.log(`📸 Uploading ${key} photo... (attempt ${retryCount + 1})`);
            const response = await fetch('https://api.imgbb.com/1/upload', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                const photoInfo = {
                    type: key,
                    url: result.data.url,
                    thumbnailUrl: result.data.thumb ? result.data.thumb.url : result.data.url,
                    deleteUrl: result.data.delete_url,
                    imgbbId: result.data.id,
                    createdAt: new Date().toISOString(),
                    filename: `${key}_${timestamp}.jpg`
                };
                
                console.log(`✅ ${key} photo uploaded successfully`);
                return { success: true, data: photoInfo };
            } else {
                throw new Error(result.error?.message || '알 수 없는 오류');
            }
        } catch (err) {
            console.error(`❌ Error uploading ${photoData.key} photo (attempt ${retryCount + 1}):`, err);
            
            // 재시도 로직
            if (retryCount < maxRetries) {
                console.log(`🔄 Retrying ${photoData.key} photo upload... (${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // 지수 백오프
                return uploadWithRetry(photoData, retryCount + 1);
            }
            
            return { success: false, error: err.message, key: photoData.key };
        }
    };
    
    // 진행률 추적을 위한 변수
    let completedUploads = 0;
    const totalUploads = photosToUpload.length;
    
    // 배치 업로드 실행 (병렬 처리, 최대 3개 동시)
    const batchSize = 3;
    const results = [];
    
    for (let i = 0; i < photosToUpload.length; i += batchSize) {
        const batch = photosToUpload.slice(i, i + batchSize);
        const batchPromises = batch.map(uploadWithRetry);
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        completedUploads += batch.length;
        const progress = Math.round((completedUploads / totalUploads) * 100);
        console.log(`📸 Upload progress: ${progress}% (${completedUploads}/${totalUploads})`);
        
        // 진행률 표시 업데이트
        showUploadProgress(completedUploads, totalUploads);
        
        // 진행률 알림 (25%, 50%, 75%, 100%)
        if (progress === 25 || progress === 50 || progress === 75 || progress === 100) {
            showNotification(`사진 업로드 진행률: ${progress}%`, 'info');
        }
    }
    
    // 결과 분석
    const successfulUploads = results.filter(r => r.success).map(r => r.data);
    const failedUploads = results.filter(r => !r.success);
    
    console.log(`📸 Batch upload completed: ${successfulUploads.length} success, ${failedUploads.length} failed`);
    
    // 실패한 업로드가 있으면 알림
    if (failedUploads.length > 0) {
        const failedKeys = failedUploads.map(f => f.key).join(', ');
        showNotification(`${failedKeys} 사진 업로드에 실패했습니다.`, 'error');
    }
    
    // 진행률 표시 숨기기
    hideUploadProgress();
    
    // 성공한 업로드 알림
    if (successfulUploads.length > 0) {
        showNotification(`${successfulUploads.length}장의 사진이 성공적으로 업로드되었습니다!`, 'success');
    }
    
    return successfulUploads;
}

// 파일을 Base64로 변환하는 함수
function convertToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// 정비 상세보기 함수
function showMaintenanceDetail(maintenanceId) {
    console.log('🔍 Showing maintenance detail for:', maintenanceId);
    
    // Firebase에서 해당 정비 이력 가져오기
    db.collection('maintenance').doc(maintenanceId).get()
        .then(doc => {
            if (doc.exists) {
                const maintenance = { ...doc.data(), id: doc.id };
                showMaintenanceDetailModal(maintenance);
            } else {
                showNotification('정비 이력을 찾을 수 없습니다.', 'error');
            }
        })
        .catch(error => {
            console.error('❌ Error fetching maintenance:', error);
            showNotification('정비 이력 로딩 실패', 'error');
        });
}

function showMaintenanceDetailModal(maintenance) {
    console.log('🔍 Creating detail modal for:', maintenance);
    console.log('📸 Photos in maintenance data:', maintenance.photos);
    console.log('📸 Number of photos:', maintenance.photos ? maintenance.photos.length : 0);
    
    // 사진 정보 상세 로깅
    if (maintenance.photos && maintenance.photos.length > 0) {
        maintenance.photos.forEach((photo, index) => {
            console.log(`📸 Photo ${index + 1}:`, {
                type: photo.type,
                url: photo.url,
                hasUrl: !!photo.url,
                hasThumbnail: !!photo.thumbnailUrl
            });
        });
    }
    
    console.log('👤 Current user info - isAdmin:', isAdmin, 'email:', currentUser?.email);
    
    // 기존 모달 제거
    const existingModal = document.getElementById('maintenanceDetailModal');
    if (existingModal) {
        try {
            existingModal.remove();
        } catch (error) {
            console.log('Modal already removed:', error);
        }
    }
    
    // 상태별 정보
    const statusInfo = getStatusInfo(maintenance.status);
    const typeIcon = getTypeIcon(maintenance.type);
    
    // 모달 HTML 생성
    const modalHTML = `
        <div id="maintenanceDetailModal" class="modal-overlay active">
            <div class="modal-container" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        ${typeIcon} ${maintenance.type || '정비'} 상세정보
                    </h2>
                    <button class="modal-close" onclick="closeMaintenanceDetailModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                    <div class="info-section-unified">
                        <h3>${typeIcon} ${maintenance.type || '정비'}</h3>
                        <p>📅 날짜: ${formatDate(maintenance.date) || '날짜 없음'}</p>
                        <p>🏍️ 차량번호: ${maintenance.carNumber || '없음'}</p>
                        <p>
                            📋 상태: <span style="background: ${statusInfo.color}; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                                ${statusInfo.text || maintenance.status || '없음'}
                            </span>
                        </p>
                        ${maintenance.mileage ? `<p>📏 주행거리: ${maintenance.mileage}km</p>` : ''}
                    </div>
                    
                    <div class="info-section-secondary">
                        <h4>📝 상세 설명</h4>
                        <p>${maintenance.description || '설명이 없습니다.'}</p>
                    </div>
                    
                    ${(() => {
                        // 🔄 신규 방식과 기존 방식 모두 지원하는 사진 처리
                        let photos = [];
                        
                        console.log('🔍 DEBUG: 사진 처리 시작');
                        console.log('📸 maintenance.photos:', maintenance.photos);
                        console.log('📸 maintenance.beforePhoto:', maintenance.beforePhoto);
                        console.log('📸 maintenance.duringPhoto:', maintenance.duringPhoto);
                        console.log('📸 maintenance.afterPhoto:', maintenance.afterPhoto);
                        console.log('📸 전체 maintenance 데이터:', maintenance);
                        
                        // 1️⃣ 신규 방식: photos 배열 확인
                        if (maintenance.photos && maintenance.photos.length > 0) {
                            console.log('📸 신규 방식 사진 발견:', maintenance.photos.length + '개');
                            photos = maintenance.photos.map(photo => {
                                console.log('📸 처리 중인 사진:', photo);
                                return {
                                    url: photo.url,
                                    type: photo.type === 'before' ? '정비 전' : 
                                          photo.type === 'during1' ? '정비 중 1' :
                                          photo.type === 'during2' ? '정비 중 2' :
                                          photo.type === 'during3' ? '정비 중 3' :
                                          photo.type === 'during4' ? '정비 중 4' :
                                          photo.type === 'after' ? '정비 후' : photo.type
                                };
                            });
                        } 
                        // 2️⃣ 기존 방식: 개별 필드 확인
                        else {
                            console.log('📸 기존 방식 사진 확인 중...');
                            if (maintenance.beforePhoto) {
                                photos.push({ url: maintenance.beforePhoto, type: '정비 전' });
                                console.log('📸 정비 전 사진 발견:', maintenance.beforePhoto);
                            }
                            if (maintenance.duringPhoto) {
                                photos.push({ url: maintenance.duringPhoto, type: '정비 중' });
                                console.log('📸 정비 중 사진 발견:', maintenance.duringPhoto);
                            }
                            if (maintenance.afterPhoto) {
                                photos.push({ url: maintenance.afterPhoto, type: '정비 후' });
                                console.log('📸 정비 후 사진 발견:', maintenance.afterPhoto);
                            }
                        }
                        
                        const hasPhotos = photos.length > 0;
                        console.log('📸 총 발견된 사진:', photos.length + '개');
                        console.log('📸 최종 photos 배열:', photos);
                        
                        let photoDeleteInfo = '';
                        
                        if (hasPhotos && maintenance.createdAt) {
                            const deleteInfo = getDaysUntilDeletion(maintenance.createdAt);
                            if (deleteInfo) {
                                if (deleteInfo.isExpired) {
                                    photoDeleteInfo = `
                                        <div style="background: #dc3545; color: white; padding: 12px; border-radius: 8px; margin-bottom: 15px; text-align: center;">
                                            <strong>📸 사진이 삭제되었습니다</strong>
                                        </div>
                                    `;
                                } else if (deleteInfo.isWarning) {
                                    photoDeleteInfo = `
                                        <div style="background: #ffc107; color: #000; padding: 12px; border-radius: 8px; margin-bottom: 15px; text-align: center; animation: pulse 2s infinite;">
                                            <strong>⚠️ 사진 삭제 임박!</strong><br>
                                            <span style="font-size: 16px; font-weight: bold;">D-${deleteInfo.daysLeft}</span><br>
                                            <small>📅 ${deleteInfo.deletionDate.toLocaleDateString('ko-KR')} 삭제 예정</small>
                                        </div>
                                    `;
                                } else {
                                    photoDeleteInfo = `
                                        <div style="background: #17a2b8; color: white; padding: 12px; border-radius: 8px; margin-bottom: 15px; text-align: center;">
                                            <strong>📸 사진 보존 기간</strong><br>
                                            <span style="font-size: 16px; font-weight: bold;">D-${deleteInfo.daysLeft}</span><br>
                                            <small>📅 ${deleteInfo.deletionDate.toLocaleDateString('ko-KR')} 자동 삭제 예정</small>
                                        </div>
                                    `;
                                }
                            }
                        }
                        
                        if (hasPhotos) {
                            console.log('🖼️ 사진 HTML 생성 중...');
                            
                            return `
                                <div class="photo-section">
                                    <h4 style="margin: 0 0 var(--space-lg) 0; color: #1e293b; font-size: var(--font-size-lg); font-weight: 800;">📸 사진 (${photos.length}장)</h4>
                                    ${photoDeleteInfo}
                                    

                                    
                                    <div class="photo-grid">
                                        ${photos.map((photo, index) => {
                                            console.log(`🖼️ 사진 ${index + 1} HTML 생성:`, photo.url);
                                            return `
                                            <div class="photo-item">
                                                <img src="${photo.url}" alt="${photo.type}" 
                                                     onclick="showPhotoModal('${photo.url}')"
                                                     onload="console.log('✅ 이미지 로딩 성공:', '${photo.url}')"
                                                     onerror="console.error('❌ 이미지 로딩 실패:', '${photo.url}'); this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                                <div style="display: none; width: 100%; height: 150px; background: #ddd; border-radius: 8px; align-items: center; justify-content: center; color: #666; flex-direction: column;">
                                                    <i class="fas fa-image" style="font-size: 24px; margin-bottom: 8px;"></i>
                                                    <span style="font-size: 12px;">이미지 로딩 실패</span>
                                                    <small style="font-size: 10px; margin-top: 4px; word-break: break-all; text-align: center;">${photo.url.substring(0, 50)}...</small>
                                                </div>
                                                <div class="photo-label">
                                                    <span>${photo.type}</span>
                                                    <br>
                                                    <button onclick="downloadPhoto('${photo.url}', '${maintenance.type || '정비'}_${photo.type}_${maintenance.date || 'unknown'}.jpg'); event.stopPropagation();" 
                                                            class="photo-download-btn">
                                                        <i class="fas fa-download"></i> 다운로드
                                                    </button>
                                                </div>
                                            </div>
                                        `;
                                        }).join('')}
                                    </div>
                                    
                                    <div style="text-align: center;">
                                        <button onclick="downloadAllPhotos('${maintenance.id}', '${maintenance.type || '정비'}', '${maintenance.date || 'unknown'}')" 
                                                class="download-all-btn">
                                            <i class="fas fa-download"></i> 모든 사진 다운로드
                                        </button>
                                    </div>
                                </div>
                            `;
                        } else {
                            console.log('📸 사진이 없어서 섹션을 표시하지 않음');
                        }
                        return '';
                    })()}
                    
                    <div class="info-section-secondary">
                        <h4>ℹ️ 추가 정보</h4>
                        <p>🆔 ID: ${maintenance.id}</p>
                        <p>📅 등록일: ${maintenance.createdAt ? new Date(maintenance.createdAt.toDate()).toLocaleString('ko-KR') : '없음'}</p>
                        ${maintenance.adminName ? `<p>👨‍💼 관리자: ${maintenance.adminName}</p>` : ''}
                    </div>
                </div>
                
                <div class="modal-footer" style="padding: 20px; border-top: 1px solid #e5e5e5;">
                    <button class="btn btn-secondary" onclick="closeMaintenanceDetailModal()">
                        <i class="fas fa-times"></i> 닫기
                    </button>
                    ${(() => {
                        console.log('🔍 Modal button logic - isAdmin:', isAdmin, 'status:', maintenance.status, 'id:', maintenance.id);
                        console.log('🔍 Available statuses: in-progress, completed, approved, rejected');
                        console.log('🔍 Current user:', currentUser);
                        
                        if (isAdmin) {
                            console.log('👨‍💼 Admin view detected');
                            // 관리자 화면 - 다양한 상태값 형식 처리
                            const status = maintenance.status ? maintenance.status.toLowerCase() : '';
                            const isPending = status === 'in-progress' || status === 'pending';
                            
                            if (isPending) {
                                console.log('⚙️ In-progress/pending status - showing edit/complete buttons');
                                // 진행중/대기중: 수정 + 완료 버튼
                                return `
                                    <button class="btn btn-primary" onclick="editMaintenance('${maintenance.id}')">
                                        <i class="fas fa-edit"></i> 수정
                                    </button>
                                    <button class="btn btn-success" onclick="completeMaintenanceWork('${maintenance.id}'); closeMaintenanceDetailModal();">
                                        <i class="fas fa-check-circle"></i> 정비완료
                                    </button>
                                `;
                            } else {
                                console.log('❌ Status not actionable, no admin buttons shown. Current status:', maintenance.status);
                                console.log('❌ Expected status: "in-progress/approved/pending", actual status: "' + maintenance.status + '"');
                                
                                // 상태에 따른 메시지와 색상 결정
                                let statusMessage = '';
                                let statusColor = '';
                                let statusIcon = '';
                                
                                if (status === 'rejected') {
                                    let statusMessage_text = '사용자가 거절한 정비입니다';
                                    if (maintenance.rejectReason) {
                                        statusMessage_text += `<div style="margin-top: 8px; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; font-size: 12px; line-height: 1.3;"><strong>거절 이유:</strong><br>${maintenance.rejectReason}</div>`;
                                    }
                                    statusMessage = statusMessage_text;
                                    statusColor = '#dc3545';
                                    statusIcon = 'fas fa-times-circle';
                                } else if (status === 'approved') {
                                    statusMessage = '사용자가 확인한 정비입니다';
                                    statusColor = '#28a745';
                                    statusIcon = 'fas fa-check-circle';
                                } else if (status === 'completed') {
                                    statusMessage = '정비 완료 - 사용자 확인 대기중';
                                    statusColor = '#17a2b8';
                                    statusIcon = 'fas fa-clock';
                                } else {
                                    statusMessage = '처리 완료된 정비입니다';
                                    statusColor = '#6c757d';
                                    statusIcon = 'fas fa-info-circle';
                                }
                                
                                return `
                                    <div style="
                                        padding: 16px; 
                                        background: ${statusColor}10; 
                                        border-left: 4px solid ${statusColor}; 
                                        border-radius: 8px; 
                                        color: ${statusColor}; 
                                        font-weight: 500;
                                        font-size: 14px;
                                        line-height: 1.4;
                                        margin: 0;
                                    ">
                                        <div style="display: flex; align-items: flex-start; gap: 10px;">
                                            <i class="${statusIcon}" style="font-size: 18px; margin-top: 1px; flex-shrink: 0;"></i>
                                            <div>${statusMessage}</div>
                                        </div>
                                    </div>
                                `;
                            }
                        } else {
                            console.log('👤 User view detected');
                            // 사용자 화면 - completed 상태에서만 확인/거절 버튼 표시
                            const status = maintenance.status ? maintenance.status.toLowerCase() : '';
                            
                            if (status === 'completed') {
                                console.log('✅ Completed status - showing approve/reject buttons');
                                // 완료됨: 확인/거절 버튼
                                return `
                                    <button class="btn btn-success" onclick="updateMaintenanceStatus('${maintenance.id}', 'approved'); closeMaintenanceDetailModal();">
                                        <i class="fas fa-thumbs-up"></i> 확인
                                    </button>
                                    <button class="btn btn-danger" onclick="showRejectReasonModal('${maintenance.id}');">
                                        <i class="fas fa-thumbs-down"></i> 거절
                                    </button>
                                `;
                            } else {
                                console.log('👤 User - no buttons needed for status:', maintenance.status);
                                // 사용자에게는 다른 상태에서 아무것도 표시하지 않음
                                return '';
                            }
                        }
                        console.log('🚫 No buttons to show');
                        return '';
                    })()}
                </div>
            </div>
        </div>
    `;
    
    // 모달을 body에 추가
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    console.log('✅ Detail modal created');
}

function closeMaintenanceDetailModal() {
    const modal = document.getElementById('maintenanceDetailModal');
    if (modal) {
        try {
            modal.classList.remove('active');
            // DOM에서 완전히 제거하지 않고 숨김만 처리
            setTimeout(() => {
                if (modal && !modal.classList.contains('active')) {
                    modal.remove();
                }
            }, 300);
        } catch (error) {
            console.log('Modal already removed:', error);
        }
    }
}

// 사진 확대 모달
function showPhotoModal(photoUrl) {
    const photoModalHTML = `
        <div id="photoModal" class="modal-overlay active" style="background: rgba(0,0,0,0.9);" onclick="event.target === this && closePhotoModal()">
            <div class="modal-container" style="max-width: 90vw; max-height: 90vh; background: transparent; box-shadow: none; position: relative;">
                <img src="${photoUrl}" alt="정비 사진" style="width: 100%; height: 100%; object-fit: contain; border-radius: 8px;">
                
                <!-- 상단 버튼 그룹 -->
                <div style="position: absolute; top: 20px; right: 20px; display: flex; gap: 10px; z-index: 10001;">
                    <button onclick="downloadPhoto('${photoUrl}', 'maintenance-photo-${Date.now()}.jpg'); event.stopPropagation();" 
                            style="background: rgba(40, 167, 69, 0.9); color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 14px; backdrop-filter: blur(10px);">
                        <i class="fas fa-download"></i>
                        <span>다운로드</span>
                    </button>
                    <button onclick="closePhotoModal()" 
                            style="background: rgba(220, 53, 69, 0.9); color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; font-size: 16px; backdrop-filter: blur(10px);">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- 하단 안내 -->
                <div style="position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: white; padding: 8px 16px; border-radius: 20px; font-size: 14px; backdrop-filter: blur(10px);">
                    클릭하면 닫힙니다
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', photoModalHTML);
}

function closePhotoModal() {
    const modal = document.getElementById('photoModal');
    if (modal) {
        try {
            modal.remove();
        } catch (error) {
            console.log('Modal already removed:', error);
        }
    }
}

// 정비 수정 함수
async function editMaintenance(maintenanceId) {
    if (!isAdmin) {
        showNotification('관리자만 정비를 수정할 수 있습니다.', 'error');
        return;
    }
    
    try {
        console.log('✏️ Editing maintenance:', maintenanceId);
        
        // 정비 정보 가져오기
        const maintenanceDoc = await db.collection('maintenance').doc(maintenanceId).get();
        if (!maintenanceDoc.exists) {
            showNotification('정비 정보를 찾을 수 없습니다.', 'error');
            return;
        }
        
        const maintenance = maintenanceDoc.data();
        
        // 진행중/대기중 상태만 수정 가능 (approved는 사용자가 이미 확인한 상태라 수정 불가)
        const status = maintenance.status ? maintenance.status.toLowerCase() : '';
        const isEditable = status === 'in-progress' || status === 'pending';
        
        if (!isEditable) {
            showNotification('진행중/대기중인 정비만 수정할 수 있습니다.', 'error');
            return;
        }
        
        // 상세 모달 닫기
        closeMaintenanceDetailModal();
        
        // 정비 등록 모달 열고 기존 데이터로 채우기 (지연시켜서 충돌 방지)
        setTimeout(() => {
            openMaintenanceModal();
        }, 100);
        
        // 데이터 채우기
        setTimeout(() => {
            document.getElementById('carNumber').value = maintenance.carNumber || '';
            document.getElementById('maintenanceDate').value = maintenance.date || '';
            document.getElementById('maintenanceType').value = maintenance.type || '';
            document.getElementById('mileage').value = maintenance.mileage || '';
            document.getElementById('description').value = maintenance.description || '';
            
            // 🖼️ 기존 사진들을 미리보기로 표시 (최대 10장으로 제한)
            console.log('🖼️ 수정 모드: 기존 사진 미리보기 표시');
            
            if (maintenance.photos && maintenance.photos.length > 0) {
                // 신규 방식: photos 배열 (최대 10장)
                console.log('🖼️ 신규 방식 사진 로드:', maintenance.photos.length + '장');
                const maxPhotos = Math.min(maintenance.photos.length, 10);
                
                for (let i = 0; i < maxPhotos; i++) {
                    const photo = maintenance.photos[i];
                    if (photo.url && photo.type) {
                        showPhotoPreviewFromUrl(photo.url, photo.type);
                        console.log(`🖼️ ${photo.type} 사진 미리보기 표시:`, photo.url.substring(0, 50) + '...');
                    }
                }
                
                if (maintenance.photos.length > 10) {
                    showNotification('기존 사진이 10장을 초과하여 처음 10장만 표시됩니다.', 'warning');
                }
            } else {
                // 기존 방식: 개별 필드 (최대 10장)
                console.log('🖼️ 기존 방식 사진 확인');
                let photoCount = 0;
                
                if (maintenance.beforePhoto && photoCount < 10) {
                    showPhotoPreviewFromUrl(maintenance.beforePhoto, 'before');
                    console.log('🖼️ before 사진 미리보기 표시');
                    photoCount++;
                }
                if (maintenance.duringPhoto && photoCount < 10) {
                    showPhotoPreviewFromUrl(maintenance.duringPhoto, 'during');
                    console.log('🖼️ during 사진 미리보기 표시');
                    photoCount++;
                }
                if (maintenance.afterPhoto && photoCount < 10) {
                    showPhotoPreviewFromUrl(maintenance.afterPhoto, 'after');
                    console.log('🖼️ after 사진 미리보기 표시');
                    photoCount++;
                }
            }
            
            // 제출 버튼 텍스트 변경
            const submitBtn = document.querySelector('#maintenanceModal .btn-primary');
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-save"></i> 수정완료';
            }
            
            // 모달 제목 변경
            const modalTitle = document.querySelector('#maintenanceModal .modal-title');
            if (modalTitle) {
                modalTitle.innerHTML = '<i class="fas fa-edit"></i> 정비 이력 수정';
            }
            
            // 수정 모드 플래그 설정
            window.editingMaintenanceId = maintenanceId;
            
            console.log('✅ Maintenance edit form populated with photos');
        }, 100);
        
    } catch (error) {
        console.error('❌ Error editing maintenance:', error);
        showNotification('정비 수정 중 오류가 발생했습니다: ' + error.message, 'error');
    }
}

// 거절 이유 입력 모달
function showRejectReasonModal(maintenanceId) {
    const modalHTML = `
        <div id="rejectReasonModal" class="modal-overlay active">
            <div class="modal-container" style="max-width: 400px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-times-circle"></i> 정비 거절
                    </h2>
                    <button class="modal-close" onclick="closeRejectReasonModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="modal-body">
                    <div style="margin-bottom: 15px;">
                        <p style="color: #666; margin-bottom: 15px;">정비를 거절하는 이유를 알려주세요:</p>
                        <textarea 
                            id="rejectReason" 
                            rows="4" 
                            placeholder="거절 이유를 입력해주세요..." 
                            style="
                                width: 100%; 
                                padding: 12px; 
                                border: 2px solid #ddd; 
                                border-radius: 8px; 
                                font-size: 14px; 
                                resize: vertical;
                                min-height: 100px;
                            "
                        ></textarea>
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeRejectReasonModal()">
                        <i class="fas fa-times"></i> 취소
                    </button>
                    <button class="btn btn-danger" onclick="submitRejectReason('${maintenanceId}')">
                        <i class="fas fa-thumbs-down"></i> 거절하기
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // 텍스트 영역에 포커스
    setTimeout(() => {
        const textarea = document.getElementById('rejectReason');
        if (textarea) {
            textarea.focus();
        }
    }, 100);
}

function closeRejectReasonModal() {
    const modal = document.getElementById('rejectReasonModal');
    if (modal) {
        try {
            modal.remove();
        } catch (error) {
            console.log('Modal already removed:', error);
        }
    }
}

async function submitRejectReason(maintenanceId) {
    const rejectReason = document.getElementById('rejectReason').value.trim();
    
    if (!rejectReason) {
        showNotification('거절 이유를 입력해주세요.', 'error');
        return;
    }
    
    try {
        // 거절 이유와 함께 상태 업데이트
        await updateMaintenanceStatusWithReason(maintenanceId, 'rejected', rejectReason);
        closeRejectReasonModal();
        closeMaintenanceDetailModal();
        showNotification('정비를 거절하였습니다.', 'warning');
    } catch (error) {
        console.error('❌ Error rejecting maintenance:', error);
        showNotification('거절 처리 중 오류가 발생했습니다.', 'error');
    }
}

// 전역 함수로 등록
window.showMaintenanceDetail = showMaintenanceDetail;
window.closeMaintenanceDetailModal = closeMaintenanceDetailModal;
window.showPhotoModal = showPhotoModal;
window.closePhotoModal = closePhotoModal;
window.editMaintenance = editMaintenance;
window.completeMaintenanceWork = completeMaintenanceWork;
window.showRejectReasonModal = showRejectReasonModal;
window.closeRejectReasonModal = closeRejectReasonModal;
window.submitRejectReason = submitRejectReason;
window.editEstimate = editEstimate;
window.updateEstimate = updateEstimate;
window.regenerateEstimatePDF = regenerateEstimatePDF;

// 테스트 데이터 추가 함수 (관리자 전용)
async function addTestData() {
    if (!isAdmin) {
        showNotification('관리자만 테스트 데이터를 추가할 수 있습니다.', 'error');
        return;
    }
    
    try {
        showNotification('테스트 데이터를 추가하는 중...', 'info');
        
        const testMaintenances = [
            {
                carNumber: 'admin1',
                date: '2024-01-15',
                type: '일반점검',
                mileage: '15000',
                description: '정기 점검 및 기본 정비 작업 수행. 엔진 상태 양호, 브레이크 패드 교체 필요.',
                adminEmail: 'admin@admin.com',
                adminName: '관리자',
                status: 'in-progress', // 진행중 상태로 변경
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                photos: []
            },
            {
                carNumber: 'admin1',
                date: '2024-01-20',
                type: '엔진오일교체',
                mileage: '15200',
                description: '엔진오일 및 오일필터 교체 완료. 다음 교체 예정일: 20,000km',
                adminEmail: 'admin@admin.com',
                adminName: '관리자',
                status: 'completed', // 완료 상태로 변경
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                photos: []
            },
            {
                carNumber: 'admin1',
                date: '2024-01-25',
                type: '브레이크정비',
                mileage: '15300',
                description: '앞뒤 브레이크 패드 교체 및 브레이크 오일 교체 완료.',
                adminEmail: 'admin@admin.com',
                adminName: '관리자',
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                photos: []
            }
        ];
        
        for (const maintenance of testMaintenances) {
            await db.collection('maintenance').add(maintenance);
        }
        
        showNotification('테스트 데이터가 성공적으로 추가되었습니다!', 'success');
        loadDashboardData(); // 데이터 새로고침
        
    } catch (error) {
        console.error('❌ Error adding test data:', error);
        showNotification('테스트 데이터 추가 실패: ' + error.message, 'error');
    }
}

// 전역 함수로 브라우저 콘솔에서 호출 가능하게 만들기
window.addTestData = addTestData;

// 관리자 사용자 데이터 생성/수정 함수
async function setupAdminUser() {
    if (!currentUser) {
        showNotification('로그인이 필요합니다.', 'error');
        return;
    }
    
    try {        
        if (ADMIN_EMAILS.includes(currentUser.email)) {
            // 관리자 사용자 데이터 업데이트
            await db.collection('users').doc(currentUser.uid).set({
                name: '관리자',
                email: currentUser.email,
                carNumber: 'admin1',
                role: 'admin',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            showNotification('관리자 계정이 설정되었습니다.', 'success');
            
            // 현재 사용자 정보 업데이트
            currentUser.role = 'admin';
            currentUser.carNumber = 'admin1';
            isAdmin = true;
            
            console.log('✅ Admin user setup complete');
            loadDashboardData(); // 데이터 새로고침
            
        } else {
            showNotification('관리자 이메일이 아닙니다.', 'error');
        }
        
    } catch (error) {
        console.error('❌ Error setting up admin user:', error);
        showNotification('관리자 설정 실패: ' + error.message, 'error');
    }
}

// 전역 함수로 등록
window.setupAdminUser = setupAdminUser;

// 디버깅용 테스트 함수
function testTimelineRender() {
    const container = document.getElementById('timelineContent');
    if (!container) {
        console.error('❌ Container not found');
        return;
    }
    
    console.log('🧪 Testing timeline render...');
    
    // 간단한 테스트 HTML 삽입
    const testHtml = `
        <div style="background: #f0f0f0; padding: 20px; margin: 10px; border-radius: 8px;">
            <h3>테스트 정비 카드</h3>
            <p>이 카드가 보이면 렌더링이 정상 작동합니다.</p>
        </div>
        <div style="background: #e0e0e0; padding: 20px; margin: 10px; border-radius: 8px;">
            <h3>두 번째 테스트 카드</h3>
            <p>스타일링 없이 기본 HTML로 테스트</p>
        </div>
    `;
    
    container.innerHTML = testHtml;
    console.log('✅ Test HTML inserted');
    console.log('📐 Container after test:', {
        width: container.offsetWidth,
        height: container.offsetHeight,
        childElementCount: container.childElementCount
    });
}

// 전역 함수로 등록
window.testTimelineRender = testTimelineRender;

// =============================================
// 📸 사진 자동 삭제 시스템 (30일 보존)
// =============================================

async function schedulePhotoCleanup() {
    try {
        console.log('🧹 시작: 30일 이상 된 사진 정리 체크');
        
        // Firebase 상태 확인
        if (!db || !currentUser) {
            console.log('⚠️ Firebase 연결 또는 사용자 정보 없음 - 사진 정리 건너뜀');
            return;
        }
        
        // 30일 전 날짜 계산
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - PHOTO_RETENTION_DAYS);
        const cutoffTimestamp = firebase.firestore.Timestamp.fromDate(cutoffDate);
        
        console.log(`📅 삭제 기준일: ${cutoffDate.toLocaleDateString('ko-KR')} (${PHOTO_RETENTION_DAYS}일 전)`);
        
        // 안전한 Firebase 쿼리 실행
        const result = await safeFirebaseQuery('photoCleanup', async () => {
            // 30일 이상 된 정비 이력 찾기 (제한 추가)
            return await db.collection('maintenance')
                .where('createdAt', '<', cutoffTimestamp)
                .limit(10) // 처리 개수 제한
                .get();
        });
        
        if (!result || result.empty) {
            console.log('✅ 삭제할 오래된 사진이 없습니다.');
            return;
        }
        
        console.log(`🔍 ${result.size}개의 오래된 정비 이력 발견`);
        
        let processedMaintenances = 0;
        let totalMaintenances = 0;
        let totalPhotosFromDB = 0;
        let totalPhotosFromImgbb = 0;
        let failedPhotosFromImgbb = 0;
        
        // 각 정비 이력의 사진들 삭제 (안전한 처리)
        for (const doc of result.docs) {
            try {
                const maintenanceId = doc.id;
                const data = doc.data();
                
                // 사진이 있는지 확인 (신규/기존 방식 모두 체크)
                const hasPhotos = (data.photos && data.photos.length > 0) || 
                                 data.beforePhoto || data.duringPhoto || data.afterPhoto;
                
                if (hasPhotos) {
                    totalMaintenances++;
                    const deleteResult = await deleteMaintenancePhotos(maintenanceId, data);
                    
                    if (deleteResult.success) {
                        processedMaintenances++;
                        totalPhotosFromDB += deleteResult.totalPhotos;
                        totalPhotosFromImgbb += deleteResult.deletedFromImgbb;
                        failedPhotosFromImgbb += deleteResult.failedFromImgbb;
                    }
                }
                
                // 처리 간격을 늘려서 Firebase 부하 감소
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.error(`❌ 정비 ${doc.id} 처리 중 오류:`, error);
            }
        }
        
        if (totalMaintenances > 0) {
            console.log(`🗑️ 사진 삭제 완료: ${processedMaintenances}/${totalMaintenances}개 정비 이력`);
            console.log(`📊 상세 결과: DB에서 ${totalPhotosFromDB}개, imgbb에서 ${totalPhotosFromImgbb}개 삭제, ${failedPhotosFromImgbb}개 실패`);
            
            // 📱 사용자에게 상세한 결과 알림
            let notificationMessage = `30일 이상 된 사진 자동 삭제 완료!\n`;
            notificationMessage += `📂 정비 이력: ${processedMaintenances}개\n`;
            notificationMessage += `🗑️ 앱에서 제거: ${totalPhotosFromDB}장\n`;
            notificationMessage += `☁️ imgbb에서 삭제: ${totalPhotosFromImgbb}장`;
            
            if (failedPhotosFromImgbb > 0) {
                notificationMessage += `\n⚠️ imgbb 삭제 실패: ${failedPhotosFromImgbb}장`;
            }
            
            showNotification(notificationMessage, totalPhotosFromImgbb > 0 ? 'success' : 'warning');
        }
        
    } catch (error) {
        console.error('❌ 사진 정리 시스템 오류:', error);
    }
}

async function deleteMaintenancePhotos(maintenanceId, maintenanceData) {
    try {
        console.log(`🗑️ 정비 ${maintenanceId}의 사진 삭제 시작`);
        
        const photosToDelete = [];
        
        // 삭제할 사진 데이터 수집 (기존 방식과 신규 방식 모두 지원)
        if (maintenanceData.photos && maintenanceData.photos.length > 0) {
            // 신규 방식: photos 배열에서 삭제 URL 포함
            maintenanceData.photos.forEach(photo => {
                photosToDelete.push({
                    type: photo.type,
                    url: photo.url,
                    deleteUrl: photo.deleteUrl,
                    imgbbId: photo.imgbbId
                });
            });
        } else {
            // 기존 방식: 개별 필드에서 URL만 있음
            if (maintenanceData.beforePhoto) {
                photosToDelete.push({ type: 'beforePhoto', url: maintenanceData.beforePhoto });
            }
            if (maintenanceData.duringPhoto) {
                photosToDelete.push({ type: 'duringPhoto', url: maintenanceData.duringPhoto });
            }
            if (maintenanceData.afterPhoto) {
                photosToDelete.push({ type: 'afterPhoto', url: maintenanceData.afterPhoto });
            }
        }
        
        if (photosToDelete.length === 0) {
            console.log(`ℹ️ 정비 ${maintenanceId}: 삭제할 사진이 없음`);
            return true;
        }
        
        console.log(`📸 정비 ${maintenanceId}: ${photosToDelete.length}개 사진 삭제 예정`);
        
        // 🔥 실제 imgbb에서 사진 삭제 시도
        let deletedFromImgbb = 0;
        let failedFromImgbb = 0;
        
        for (const photo of photosToDelete) {
            try {
                if (photo.deleteUrl) {
                    // 새로운 방식: delete_url 사용
                    console.log(`🗑️ imgbb에서 ${photo.type} 사진 삭제 시도 (delete_url 사용)`);
                    const deleteResponse = await fetch(photo.deleteUrl, {
                        method: 'GET' // imgbb delete_url은 GET 요청
                    });
                    
                    if (deleteResponse.ok) {
                        console.log(`✅ imgbb에서 ${photo.type} 사진 삭제 성공`);
                        deletedFromImgbb++;
                    } else {
                        console.warn(`⚠️ imgbb에서 ${photo.type} 사진 삭제 실패 (HTTP ${deleteResponse.status})`);
                        failedFromImgbb++;
                    }
                } else {
                    // 기존 방식: delete_url이 없는 경우
                    console.log(`⚠️ ${photo.type} 사진의 delete_url이 없음 - imgbb에서 삭제 불가`);
                    failedFromImgbb++;
                }
            } catch (error) {
                console.error(`❌ imgbb에서 ${photo.type} 사진 삭제 중 오류:`, error);
                failedFromImgbb++;
            }
        }
        
        console.log(`📊 imgbb 삭제 결과: 성공 ${deletedFromImgbb}개, 실패 ${failedFromImgbb}개`);
        
        // 🗄️ Firestore에서 사진 참조 삭제 (imgbb 삭제 성공 여부와 관계없이 실행)
        const updateData = {};
        
        if (maintenanceData.photos && maintenanceData.photos.length > 0) {
            // 신규 방식: photos 배열 삭제
            updateData.photos = firebase.firestore.FieldValue.delete();
            console.log(`🗑️ DB에서 photos 배열 삭제`);
        } else {
            // 기존 방식: 개별 필드 삭제
            photosToDelete.forEach(photo => {
                updateData[photo.type] = firebase.firestore.FieldValue.delete();
                console.log(`🗑️ DB에서 ${photo.type} 사진 참조 삭제: ${photo.url.substring(0, 50)}...`);
            });
        }
        
        // Firestore에서 사진 참조 삭제
        await db.collection('maintenance').doc(maintenanceId).update(updateData);
        
        console.log(`✅ 정비 ${maintenanceId}: ${photosToDelete.length}개 사진 참조 삭제 완료`);
        
        // 삭제 결과 반환
        return {
            success: true,
            totalPhotos: photosToDelete.length,
            deletedFromImgbb: deletedFromImgbb,
            failedFromImgbb: failedFromImgbb
        };
        
    } catch (error) {
        console.error(`❌ 정비 ${maintenanceId} 사진 삭제 실패:`, error);
        return { success: false, error: error.message };
    }
}

// 수동 사진 정리 함수 (관리자용)
async function manualPhotoCleanup() {
    if (!isAdmin) {
        showNotification('관리자만 수동 정리를 실행할 수 있습니다.', 'error');
        return;
    }
    
    const confirmed = confirm(`30일 이상 된 모든 사진을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`);
    if (!confirmed) return;
    
    showNotification('사진 정리를 시작합니다...', 'info');
    await schedulePhotoCleanup();
}

// 📅 삭제까지 남은 일수 계산 함수
function getDaysUntilDeletion(createdAt) {
    if (!createdAt) return null;
    
    // createdAt이 Timestamp 객체인 경우 Date로 변환
    const createdDate = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    
    // 삭제 예정일 계산
    const deletionDate = new Date(createdDate);
    deletionDate.setDate(deletionDate.getDate() + PHOTO_RETENTION_DAYS);
    
    // 현재 날짜와의 차이 계산
    const today = new Date();
    const diffTime = deletionDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return {
        daysLeft: diffDays,
        deletionDate: deletionDate,
        isExpired: diffDays <= 0,
        isWarning: diffDays <= DELETE_WARNING_DAYS && diffDays > 0
    };
}

// 📸 사진 다운로드 함수
async function downloadPhoto(photoUrl, filename = 'maintenance-photo.jpg') {
    try {
        showNotification('사진을 다운로드하는 중...', 'info');
        
        // 이미지를 fetch로 가져오기
        const response = await fetch(photoUrl, { mode: 'cors' });
        if (!response.ok) throw new Error('사진을 가져올 수 없습니다.');
        
        // Blob으로 변환
        const blob = await response.blob();
        
        // 다운로드 링크 생성
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        
        // 정리
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
        
        showNotification('사진이 다운로드되었습니다!', 'success');
        
    } catch (error) {
        console.error('❌ 사진 다운로드 실패:', error);
        showNotification('사진 다운로드에 실패했습니다.', 'error');
    }
}

// 📅 D-Day 형태로 표시하는 함수
function formatDaysLeft(daysLeft) {
    if (daysLeft <= 0) {
        return '<span class="days-expired">삭제됨</span>';
    } else if (daysLeft <= DELETE_WARNING_DAYS) {
        return `<span class="days-warning">D-${daysLeft}</span>`;
    } else {
        return `<span class="days-normal">D-${daysLeft}</span>`;
    }
}

// 📸 모든 사진 다운로드 함수
async function downloadAllPhotos(maintenanceId, maintenanceType, maintenanceDate) {
    try {
        showNotification('모든 사진을 다운로드하는 중...', 'info');
        
        console.log('📸 Download All Photos - Starting for:', maintenanceId);
        
        // 정비 데이터 가져오기
        const doc = await db.collection('maintenance').doc(maintenanceId).get();
        if (!doc.exists) {
            console.error('❌ Maintenance document not found:', maintenanceId);
            showNotification('정비 이력을 찾을 수 없습니다.', 'error');
            return;
        }
        
        const maintenance = doc.data();
        console.log('📸 Full maintenance data:', maintenance);
        console.log('📸 maintenance.photos:', maintenance.photos);
        console.log('📸 maintenance.beforePhoto:', maintenance.beforePhoto);
        console.log('📸 maintenance.duringPhoto:', maintenance.duringPhoto);
        console.log('📸 maintenance.afterPhoto:', maintenance.afterPhoto);
        
        const photos = [];
        
        // 🔄 신규 방식과 기존 방식 모두 지원하는 사진 URL 수집
        if (maintenance.photos && maintenance.photos.length > 0) {
            console.log('📸 Using NEW format - photos array:', maintenance.photos.length);
            // 신규 방식: photos 배열
            maintenance.photos.forEach((photo, index) => {
                console.log(`📸 Processing photo ${index + 1}:`, photo);
                const typeKorean = photo.type === 'before' ? '정비전' : 
                                  photo.type === 'during' ? '정비중' : 
                                  photo.type === 'after' ? '정비후' : photo.type;
                const photoData = { 
                    url: photo.url, 
                    type: typeKorean, 
                    filename: `${maintenanceType}_${typeKorean}_${maintenanceDate}.jpg` 
                };
                photos.push(photoData);
                console.log(`📸 Added photo for download:`, photoData);
            });
        } else {
            console.log('📸 Using OLD format - individual fields');
            // 기존 방식: 개별 필드
            if (maintenance.beforePhoto) {
                console.log('📸 Found beforePhoto:', maintenance.beforePhoto);
                photos.push({ url: maintenance.beforePhoto, type: '정비전', filename: `${maintenanceType}_정비전_${maintenanceDate}.jpg` });
            }
            if (maintenance.duringPhoto) {
                console.log('📸 Found duringPhoto:', maintenance.duringPhoto);
                photos.push({ url: maintenance.duringPhoto, type: '정비중', filename: `${maintenanceType}_정비중_${maintenanceDate}.jpg` });
            }
            if (maintenance.afterPhoto) {
                console.log('📸 Found afterPhoto:', maintenance.afterPhoto);
                photos.push({ url: maintenance.afterPhoto, type: '정비후', filename: `${maintenanceType}_정비후_${maintenanceDate}.jpg` });
            }
        }
        
        console.log('📸 Total photos found for download:', photos.length);
        console.log('📸 Photo URLs:', photos.map(p => ({ type: p.type, url: p.url?.substring(0, 50) + '...' })));
        
        if (photos.length === 0) {
            console.warn('⚠️ No photos found for download');
            showNotification('다운로드할 사진이 없습니다.', 'warning');
            return;
        }
        
        // 순차적으로 다운로드 (동시 다운로드는 브라우저에서 제한될 수 있음)
        let downloadCount = 0;
        for (const photo of photos) {
            try {
                console.log(`📸 Downloading ${photo.type}:`, photo.url);
                await downloadPhoto(photo.url, photo.filename);
                downloadCount++;
                console.log(`✅ Successfully downloaded ${photo.type}`);
                // 다운로드 간격 (브라우저 제한 방지)
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`❌ ${photo.type} 사진 다운로드 실패:`, error);
            }
        }
        
        if (downloadCount > 0) {
            showNotification(`${downloadCount}개 사진이 다운로드되었습니다!`, 'success');
        } else {
            showNotification('사진 다운로드에 실패했습니다.', 'error');
        }
        
    } catch (error) {
        console.error('❌ 모든 사진 다운로드 실패:', error);
        showNotification('사진 다운로드 중 오류가 발생했습니다.', 'error');
    }
}

// 📸 삭제 임박 사진 경고 체크 함수
async function checkPhotoWarnings() {
    try {
        console.log('⚠️ 삭제 임박 사진 경고 체크 시작');
        
        if (!currentUser) {
            console.log('🚫 로그인되지 않음 - 경고 체크 건너뛰기');
            return;
        }
        
        // 사용자의 정비 이력 가져오기
        let query = db.collection('maintenance');
        
        if (isAdmin) {
            query = query.where('adminEmail', '==', currentUser.email);
        } else {
            query = query.where('carNumber', '==', currentUser.carNumber);
        }
        
        const snapshot = await query.get();
        
        let warningCount = 0;
        let expiredCount = 0;
        const warningMaintenances = [];
        
        snapshot.forEach(doc => {
            const maintenance = doc.data();
            const hasPhotos = maintenance.beforePhoto || maintenance.duringPhoto || maintenance.afterPhoto;
            
            if (hasPhotos && maintenance.createdAt) {
                const deleteInfo = getDaysUntilDeletion(maintenance.createdAt);
                if (deleteInfo) {
                    if (deleteInfo.isExpired) {
                        expiredCount++;
                    } else if (deleteInfo.isWarning) {
                        warningCount++;
                        warningMaintenances.push({
                            id: doc.id,
                            type: maintenance.type || '정비',
                            date: maintenance.date,
                            daysLeft: deleteInfo.daysLeft,
                            deletionDate: deleteInfo.deletionDate
                        });
                    }
                }
            }
        });
        
        // 경고 알림 표시
        if (warningCount > 0) {
            const maintenanceList = warningMaintenances
                .map(m => `• ${m.type} (${m.date}) - D-${m.daysLeft}`)
                .join('\n');
                
            setTimeout(() => {
                // 더 눈에 띄는 삭제 경고 알림
                const notification = document.createElement('div');
                notification.className = 'notification warning show';
                notification.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: linear-gradient(135deg, #ff6b35, #f7931e);
                    color: white;
                    padding: 20px;
                    border-radius: 12px;
                    box-shadow: 0 8px 25px rgba(255, 107, 53, 0.3);
                    z-index: 10000;
                    max-width: 400px;
                    animation: slideInRight 0.5s ease-out, pulse 2s infinite 1s;
                    border-left: 5px solid #dc3545;
                `;
                
                notification.innerHTML = `
                    <div style="display: flex; align-items: flex-start; gap: 12px;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 24px; color: #fff; margin-top: 2px;"></i>
                        <div>
                            <strong style="display: block; font-size: 16px; margin-bottom: 8px;">사진 삭제 임박!</strong>
                            <p style="margin: 0; font-size: 14px; line-height: 1.4;">
                                ${warningCount}개 정비의 사진이 ${DELETE_WARNING_DAYS}일 이내 삭제됩니다.<br>
                                <strong>상세보기에서 다운로드하세요!</strong>
                            </p>
                        </div>
                        <button onclick="this.parentElement.parentElement.remove()" 
                                style="background: none; border: none; color: white; font-size: 18px; cursor: pointer; margin-left: auto;">×</button>
                    </div>
                `;
                
                document.body.appendChild(notification);
                
                // 10초 후 자동 제거
                setTimeout(() => {
                    if (notification.parentElement) {
                        notification.remove();
                    }
                }, 10000);
            }, 3000);
            
            console.log(`⚠️ 삭제 임박 정비 ${warningCount}개 발견:`, warningMaintenances);
        }
        
        if (expiredCount > 0) {
            console.log(`🗑️ 삭제된 사진 ${expiredCount}개 발견`);
        }
        
        if (warningCount === 0 && expiredCount === 0) {
            console.log('✅ 삭제 임박 또는 만료된 사진 없음');
        }
        
    } catch (error) {
        console.error('❌ 사진 경고 체크 실패:', error);
    }
}

// 전역 함수로 등록 (브라우저 콘솔에서 테스트 가능)
window.schedulePhotoCleanup = schedulePhotoCleanup;
window.manualPhotoCleanup = manualPhotoCleanup;
window.downloadPhoto = downloadPhoto;
window.downloadAllPhotos = downloadAllPhotos;
window.getDaysUntilDeletion = getDaysUntilDeletion;
window.checkPhotoWarnings = checkPhotoWarnings; 

// =============================================
// 💰 견적서 시스템
// =============================================

// 견적서 생성 모달 표시
function showEstimateModal() {
    // 🔒 관리자 권한 확인
    if (!isAdmin) {
        showNotification('관리자만 견적서를 생성할 수 있습니다.', 'error');
        return;
    }
    
    // 기존 모달 제거
    const existingModal = document.getElementById('estimateModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // 자동완성 데이터 미리 로드 (강제 실행)
    console.log('📝 견적서 모달 - 자동완성 데이터 강제 로드');
    loadAutoCompleteData().then(() => {
        console.log('✅ 견적서 모달 자동완성 데이터 로드 완료');
    }).catch(error => {
        console.warn('⚠️ 견적서 모달 자동완성 데이터 로드 실패:', error);
    });
    
    const modalHTML = `
        <div id="estimateModal" class="modal-overlay active" style="z-index: 10000;">
                         <div class="modal-container" style="
                max-width: min(700px, 95vw); 
                max-height: 85vh; 
                margin: 10px auto;
                display: flex;
                flex-direction: column;
                position: relative;
            ">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-file-invoice-dollar"></i> 견적서 생성
                    </h2>
                    <button class="modal-close" onclick="closeEstimateModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="modal-body" style="
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                    min-height: 0;
                ">
                    <form id="estimateForm">
                        <!-- 기본 정보 -->
                        <div class="info-section-unified">
                            <h3>📋 기본 정보</h3>
                            <div class="info-form-grid">
                                <div class="info-form-row">
                                    <div class="info-form-col large">
                                        <label class="info-form-label">🚗 차량번호</label>
                                        <input type="text" id="estimateCarNumber" placeholder="12가3456" required class="info-form-input">
                                    </div>
                                    <div class="info-form-col large">
                                        <label class="info-form-label">👤 고객명</label>
                                        <input type="text" id="estimateCustomerName" placeholder="홍길동" required class="info-form-input">
                                    </div>
                                </div>
                                <div class="info-form-row">
                                    <div class="info-form-col">
                                        <label class="info-form-label">🏍️ 기종</label>
                                        <input type="text" id="estimateBikeModel" placeholder="혼다 PCX150" class="info-form-input">
                                    </div>
                                    <div class="info-form-col small">
                                        <label class="info-form-label">📅 년식</label>
                                        <input type="text" id="estimateBikeYear" placeholder="2023" class="info-form-input">
                                    </div>
                                    <div class="info-form-col medium">
                                        <label class="info-form-label">📏 키로수</label>
                                        <input type="text" id="estimateMileage" placeholder="15,000km" class="info-form-input">
                                    </div>
                                </div>
                                <div>
                                    <label class="info-form-label">🔧 정비 내용</label>
                                    <input type="text" id="estimateTitle" placeholder="엔진 오일 교체 및 점검" required class="info-form-input">
                                </div>
                            </div>
                        </div>
                        
                        <!-- 견적 항목 -->
                        <div class="info-section-unified">
                            <div class="estimate-modal-header">
                                <h3>💰 견적 항목</h3>
                                <button type="button" onclick="addEstimateItem()" class="estimate-add-item-btn">
                                    <i class="fas fa-plus"></i> 항목 추가
                                </button>
                            </div>
                            
                            <div id="estimateItems">
                                <!-- 기본 항목 1개 -->
                                <div class="estimate-item-card">
                                     <div class="estimate-item-flex">
                                                                              <div class="estimate-item-col-name">
                                         <input type="text" placeholder="항목명 (예: 엔진오일)" class="item-name estimate-item-input" required>
                                     </div>
                                     <div class="estimate-item-col-price">
                                         <input type="number" placeholder="가격" class="item-price estimate-item-input" min="0" required oninput="calculateTotal()">
                                     </div>
                                     <div class="estimate-item-col-quantity">
                                         <input type="number" placeholder="수량" class="item-quantity estimate-item-input" min="1" value="1" required oninput="calculateTotal()">
                                     </div>
                                     <div class="estimate-item-col-action">
                                         <button type="button" onclick="removeEstimateItem(this)" class="estimate-item-remove-btn">
                                             <i class="fas fa-trash"></i>
                                         </button>
                                     </div>
                                     </div>
                                </div>
                            </div>
                            
                            <!-- 총액 표시 -->
                            <div class="estimate-total-section-modal">
                                <div class="estimate-amount-breakdown">
                                    <div class="estimate-breakdown-item">
                                        <span class="estimate-breakdown-label">공급가액:</span>
                                        <span id="supplyAmount" class="estimate-breakdown-amount">0</span>원
                                    </div>
                                    <div class="estimate-breakdown-item">
                                        <span class="estimate-breakdown-label">부가세 (10%):</span>
                                        <span id="vatAmount" class="estimate-breakdown-amount">0</span>원
                                    </div>
                                    <div class="estimate-breakdown-separator"></div>
                                    <div class="estimate-breakdown-total">
                                        <span class="estimate-breakdown-label">합계:</span>
                                        <span id="totalAmount" class="estimate-total-amount-modal">0</span>원
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 추가 메모 -->
                        <div class="estimate-notes-section">
                            <label>📝 추가 메모</label>
                            <textarea id="estimateNotes" placeholder="견적서에 포함할 추가 설명이나 주의사항을 입력하세요..." class="estimate-notes-textarea"></textarea>
                        </div>
                    </form>
                </div>
                
                                 <div class="modal-footer estimate-modal-footer">
                     <button class="btn btn-secondary estimate-modal-btn-cancel" onclick="closeEstimateModal()">
                         <i class="fas fa-times"></i> 취소
                     </button>
                     <button class="btn btn-primary estimate-modal-btn-generate" onclick="generateEstimatePDF()">
                         <i class="fas fa-file-pdf"></i> 견적서 생성
                     </button>
                 </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // 초기 총액 계산
    calculateTotal();
    
    // 기존 항목에 자동완성 이벤트 추가
    setTimeout(() => {
        // 차량번호 자동완성
        const carNumberInput = document.getElementById('estimateCarNumber');
        if (carNumberInput && !carNumberInput.hasAttribute('data-autocomplete-added')) {
            carNumberInput.addEventListener('input', function() {
                const value = this.value.trim();
                if (value.length < 1) {
                    const dropdown = document.querySelector('.autocomplete-dropdown');
                    if (dropdown) dropdown.remove();
                    return;
                }
                
                if (window.autoCompleteData && window.autoCompleteData.carNumbers) {
                    const suggestions = window.autoCompleteData.carNumbers
                        .filter(carNumber => carNumber.toLowerCase().includes(value.toLowerCase()))
                        .slice(0, 5);
                    
                    createSimpleAutoCompleteDropdown(this, suggestions);
                }
            });
            carNumberInput.setAttribute('data-autocomplete-added', 'true');
        }
        
        // 고객명 자동완성
        const customerNameInput = document.getElementById('estimateCustomerName');
        if (customerNameInput && !customerNameInput.hasAttribute('data-autocomplete-added')) {
            customerNameInput.addEventListener('input', function() {
                const value = this.value.trim();
                if (value.length < 1) {
                    const dropdown = document.querySelector('.autocomplete-dropdown');
                    if (dropdown) dropdown.remove();
                    return;
                }
                
                if (window.autoCompleteData && window.autoCompleteData.customerNames) {
                    const suggestions = window.autoCompleteData.customerNames
                        .filter(name => name.toLowerCase().includes(value.toLowerCase()))
                        .slice(0, 5);
                    
                    createSimpleAutoCompleteDropdown(this, suggestions);
                }
            });
            customerNameInput.setAttribute('data-autocomplete-added', 'true');
        }
        
        // 기종 자동완성 (브랜드별 기종 표시)
        const bikeModelInput = document.getElementById('estimateBikeModel');
        if (bikeModelInput && !bikeModelInput.hasAttribute('data-autocomplete-added')) {
            bikeModelInput.addEventListener('input', function() {
                const value = this.value.trim();
                if (value.length < 1) {
                    const dropdown = document.querySelector('.autocomplete-dropdown');
                    if (dropdown) dropdown.remove();
                    return;
                }
                
                // 브랜드별 기종 목록 생성
                const allBikeModels = [];
                if (window.brandParts) {
                    Object.entries(window.brandParts).forEach(([brand, models]) => {
                        Object.keys(models).forEach(model => {
                            allBikeModels.push(`${brand.toUpperCase()} ${model}`);
                        });
                    });
                }
                
                const suggestions = allBikeModels
                    .filter(model => model.toLowerCase().includes(value.toLowerCase()))
                    .slice(0, 8);
                
                createSimpleAutoCompleteDropdown(this, suggestions);
            });
            bikeModelInput.setAttribute('data-autocomplete-added', 'true');
        }
        
        // 부품명 자동완성 (기존 항목)
        const itemsContainer = document.getElementById('estimateItems');
        if (itemsContainer) {
            const nameInput = itemsContainer.querySelector('.item-name');
            const priceInput = itemsContainer.querySelector('.item-price');
            
            if (nameInput && !nameInput.hasAttribute('data-autocomplete-added')) {
                console.log('🔧 기존 견적 항목에 자동완성 이벤트 추가');
                
                // 자동완성 이벤트 추가
                nameInput.addEventListener('input', function() {
                    const value = this.value.trim();
                    console.log('🔍 자동완성 검색 (기존 항목):', value);
                    
                    if (value.length < 1) {
                        const dropdown = document.querySelector('.autocomplete-dropdown');
                        if (dropdown) dropdown.remove();
                        return;
                    }
                    
                    // 기종 선택 확인
                    const currentBikeModel = document.getElementById('estimateBikeModel')?.value || '';
                    if (!currentBikeModel.trim()) {
                        console.log('⚠️ 기종을 먼저 선택해주세요');
                        // 도움말 메시지 표시
                        showAutoCompleteHelp(this, '기종을 먼저 선택해주세요');
                        return;
                    }
                    
                    // 자동완성 데이터 확인
                    if (!window.autoCompleteData || !window.autoCompleteData.parts) {
                        console.warn('⚠️ 자동완성 데이터가 없습니다. 데이터를 로드합니다...');
                        loadAutoCompleteData().then(() => {
                            console.log('✅ 자동완성 데이터 로드 완료');
                        });
                        return;
                    }
                    
                    console.log('🏍️ 현재 선택된 기종:', currentBikeModel);
                    
                    // 기종이 선택되지 않았으면 자동완성 비활성화
                    if (!currentBikeModel.trim()) {
                        console.log('⚠️ 기종이 선택되지 않음 - 자동완성 비활성화');
                        const dropdown = document.querySelector('.autocomplete-dropdown');
                        if (dropdown) dropdown.remove();
                        return;
                    }
                    
                    // 브랜드별 부품명 필터링
                    let availableParts = [];
                    let availablePrices = {};
                    
                    if (window.brandParts) {
                        const bikeSpecificParts = getBikeSpecificParts(currentBikeModel);
                        if (bikeSpecificParts.length > 0) {
                            availableParts = bikeSpecificParts;
                            // 기종별 가격 정보 가져오기
                            bikeSpecificParts.forEach(part => {
                                const price = getBikeSpecificPrice(currentBikeModel, part);
                                if (price) {
                                    availablePrices[part] = price;
                                }
                            });
                            console.log('🔧 기종별 부품명 사용:', availableParts);
                        } else {
                            console.log('⚠️ 해당 기종의 부품명이 없음');
                            return;
                        }
                    }
                    
                    // 부분 검색 + 정확도 순 정렬 + 카테고리별 표시
                    let suggestions = availableParts
                        .filter(part => part.toLowerCase().includes(value.toLowerCase()))
                        .map(part => ({
                            name: part,
                            price: availablePrices[part] || null,
                            category: getPartCategory(part),
                            score: calculateScore(part, value, currentBikeModel)
                        }))
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 12)
                        .map(item => ({ 
                            name: item.name, 
                            price: item.price,
                            category: item.category
                        }));
                    
                    // 검색 결과가 없으면 안내 메시지 표시
                    if (suggestions.length === 0) {
                        console.log('⚠️ 검색 결과 없음');
                        const dropdown = document.querySelector('.autocomplete-dropdown');
                        if (dropdown) dropdown.remove();
                        return;
                    }
                    
                    console.log('💡 자동완성 제안 (기존 항목):', suggestions);
                    createAutoCompleteDropdown(this, suggestions);
                });
                
                // 항목 저장 이벤트
                nameInput.addEventListener('blur', function() {
                    const name = this.value.trim();
                    const price = parseFloat(priceInput.value) || 0;
                    if (name) {
                        addToAutoComplete(name, price);
                    }
                });
                
                // 중복 이벤트 방지
                nameInput.setAttribute('data-autocomplete-added', 'true');
            }
        }
    }, 100);
}

// 견적서 모달 닫기
function closeEstimateModal() {
    const modal = document.getElementById('estimateModal');
    if (modal) {
        modal.remove();
    }
    
    // 수정 모드 초기화
    if (window.editingEstimateNumber) {
        delete window.editingEstimateNumber;
        
        // 제출 버튼 원래대로 복원
        const submitBtn = document.querySelector('#estimateModal .estimate-modal-btn-generate');
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-file-pdf"></i> 견적서 생성';
            submitBtn.onclick = generateEstimatePDF;
        }
        
        // 모달 제목 원래대로 복원
        const modalTitle = document.querySelector('#estimateModal .modal-title');
        if (modalTitle) {
            modalTitle.innerHTML = '<i class="fas fa-file-invoice-dollar"></i> 견적서 생성';
        }
    }
}

// 견적 항목 추가
function addEstimateItem() {
    const itemsContainer = document.getElementById('estimateItems');
    const itemHTML = `
        <div class="estimate-item-card">
            <div class="estimate-item-flex">
                <div class="estimate-item-col-name">
                    <input type="text" placeholder="항목명 (예: 브레이크패드)" class="item-name estimate-item-input" required>
                </div>
                <div class="estimate-item-col-price">
                    <input type="number" placeholder="가격" class="item-price estimate-item-input" min="0" required oninput="calculateTotal()">
                </div>
                <div class="estimate-item-col-quantity">
                    <input type="number" placeholder="수량" class="item-quantity estimate-item-input" min="1" value="1" required oninput="calculateTotal()">
                </div>
                <div class="estimate-item-col-action">
                    <button type="button" onclick="removeEstimateItem(this)" class="estimate-item-remove-btn">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    itemsContainer.insertAdjacentHTML('beforeend', itemHTML);
    
    // 새로 추가된 항목에 자동완성 이벤트 추가
    const newItem = itemsContainer.lastElementChild;
    const nameInput = newItem.querySelector('.item-name');
    const priceInput = newItem.querySelector('.item-price');
    
    // 자동완성 이벤트 (개선된 부분 검색)
    nameInput.addEventListener('input', function() {
        const value = this.value.trim();
        console.log('🔍 자동완성 검색:', value);
        console.log('📊 자동완성 데이터:', window.autoCompleteData);
        
        if (value.length < 1) { // 1글자부터 검색 시작
            const dropdown = document.querySelector('.autocomplete-dropdown');
            if (dropdown) dropdown.remove();
            return;
        }
        
        // 자동완성 데이터 확인
        if (!window.autoCompleteData || !window.autoCompleteData.parts) {
            console.warn('⚠️ 자동완성 데이터가 없습니다. 데이터를 로드합니다...');
            loadAutoCompleteData().then(() => {
                console.log('✅ 자동완성 데이터 로드 완료');
            });
            return;
        }
        
        // 부분 검색 + 정확도 순 정렬
        const suggestions = window.autoCompleteData.parts
            .filter(part => part.toLowerCase().includes(value.toLowerCase()))
            .map(part => ({
                name: part,
                price: window.autoCompleteData.prices[part] || null,
                // 정확도 점수 계산 (시작 부분 일치가 더 높은 점수)
                score: part.toLowerCase().startsWith(value.toLowerCase()) ? 2 : 1
            }))
            .sort((a, b) => b.score - a.score) // 정확도 순 정렬
            .slice(0, 8) // 최대 8개 표시
            .map(item => ({ name: item.name, price: item.price })); // 점수 제거
        
        console.log('💡 자동완성 제안:', suggestions);
        createAutoCompleteDropdown(this, suggestions);
    });
    
    // 항목 저장 이벤트
    nameInput.addEventListener('blur', function() {
        const name = this.value.trim();
        const price = parseFloat(priceInput.value) || 0;
        if (name) {
            addToAutoComplete(name, price);
        }
    });
    
    calculateTotal();
}

// 견적 항목 제거
function removeEstimateItem(button) {
    const item = button.closest('.estimate-item-card');
    if (document.querySelectorAll('.estimate-item-card').length > 1) {
        item.remove();
        calculateTotal();
    } else {
        showNotification('최소 1개의 항목은 필요합니다.', 'warning');
    }
}

// 총액 계산 (부가세 포함)
function calculateTotal() {
    const items = document.querySelectorAll('.estimate-item-card');
    let supplyAmount = 0;
    
    items.forEach(item => {
        const price = parseFloat(item.querySelector('.item-price').value) || 0;
        const quantity = parseInt(item.querySelector('.item-quantity').value) || 0;
        supplyAmount += price * quantity;
    });
    
    // 부가세 10% 계산
    const vatAmount = Math.round(supplyAmount * 0.1);
    const totalAmount = supplyAmount + vatAmount;
    
    // 공급가액 표시
    const supplyAmountElement = document.getElementById('supplyAmount');
    if (supplyAmountElement) {
        supplyAmountElement.textContent = supplyAmount.toLocaleString();
    }
    
    // 부가세 표시
    const vatAmountElement = document.getElementById('vatAmount');
    if (vatAmountElement) {
        vatAmountElement.textContent = vatAmount.toLocaleString();
    }
    
    // 합계 표시
    const totalAmountElement = document.getElementById('totalAmount');
    if (totalAmountElement) {
        totalAmountElement.textContent = totalAmount.toLocaleString();
    }
}

// 🎨 전문적인 PDF 견적서 생성
async function generateEstimatePDF() {
    try {
        // 폼 검증
        const carNumber = document.getElementById('estimateCarNumber').value.trim();
        const customerName = document.getElementById('estimateCustomerName').value.trim();
        const title = document.getElementById('estimateTitle').value.trim();
        
        if (!carNumber || !customerName || !title) {
            showNotification('필수 정보를 모두 입력해주세요.', 'error');
            return;
        }
        
        // 견적 항목 수집
        const items = [];
        const itemElements = document.querySelectorAll('.estimate-item-card');
        let hasValidItem = false;
        
        itemElements.forEach(item => {
            const name = item.querySelector('.item-name').value.trim();
            const price = parseFloat(item.querySelector('.item-price').value) || 0;
            const quantity = parseInt(item.querySelector('.item-quantity').value) || 0;
            
            if (name && price > 0 && quantity > 0) {
                // 자동완성 데이터에 추가
                addToAutoComplete(name, price);
                items.push({ name, price, quantity, total: price * quantity });
                hasValidItem = true;
            }
        });
        
        if (!hasValidItem) {
            showNotification('최소 1개의 유효한 견적 항목을 입력해주세요.', 'error');
            return;
        }
        
        const notes = document.getElementById('estimateNotes').value.trim();
        const bikeModel = document.getElementById('estimateBikeModel').value.trim();
        const bikeYear = document.getElementById('estimateBikeYear').value.trim();
        const mileage = document.getElementById('estimateMileage').value.trim();
        
        // 공급가액 계산
        const supplyAmount = items.reduce((sum, item) => sum + item.total, 0);
        // 부가세 계산 (10%)
        const vatAmount = Math.round(supplyAmount * 0.1);
        // 총액 계산 (공급가액 + 부가세)
        const totalAmount = supplyAmount + vatAmount;
        
        showNotification('PDF 견적서를 생성하는 중...', 'info');
        
        // 현재 로그인한 관리자 이름 가져오기
        let currentManagerName = getCurrentManagerSignature();
        console.log('🚀 현재 관리자 이름:', currentManagerName);
        
        // 견적서 번호 생성
        const estimateNumber = Date.now().toString().slice(-6);
        
        // 🎨 HTML 견적서 템플릿 생성
        const estimateHTML = createEstimateHTML(customerName, carNumber, title, items, supplyAmount, notes, bikeModel, bikeYear, mileage, currentManagerName, estimateNumber);
        
        // 📁 견적서 데이터 Firebase에 저장
        console.log('💾 견적서 저장 시도:', estimateNumber);
        
        await saveEstimateToFirebase({
            estimateNumber,
            customerName,
            carNumber,
            title,
            items,
            supplyAmount,
            vatAmount,
            totalAmount,
            notes,
            bikeModel,
            bikeYear,
            mileage,
            managerName: currentManagerName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUser?.email || 'unknown'
        });
        

        
        // HTML을 이미지로 변환 후 PDF 생성
        await generatePDFFromHTML(estimateHTML, customerName, carNumber);
         
    } catch (error) {
        console.error('❌ PDF 생성 오류:', error);
        showNotification('PDF 생성 중 오류가 발생했습니다.', 'error');
    }
}

// 전역 함수로 등록
window.showEstimateModal = showEstimateModal;
window.closeEstimateModal = closeEstimateModal;
window.addEstimateItem = addEstimateItem;
window.removeEstimateItem = removeEstimateItem;
window.calculateTotal = calculateTotal;
window.generateEstimatePDF = generateEstimatePDF;
window.addToAutoComplete = addToAutoComplete;
window.createAutoCompleteDropdown = createAutoCompleteDropdown;

// 🔧 현재 관리자 서명 이름 가져오기 (v2)
function getCurrentManagerSignature() {
    const currentUser = auth.currentUser;
    if (!currentUser) return '정비사';
    
    const email = currentUser.email.toLowerCase(); // 소문자로 변환
    console.log('🔍 현재 로그인 이메일:', currentUser.email);
    console.log('🔍 소문자 변환:', email);
    
    // 이메일에 따라 실제 이름으로 서명 결정 (대소문자 구분 없이)
    if (email.includes('admin2')) {
        console.log('✅ admin2 감지 → 황태훈');
        return '황태훈'; // admin2는 황태훈
    } else if (email.includes('admin1')) {
        console.log('✅ admin1 감지 → 이정훈');
        return '이정훈'; // admin1은 이정훈
    } else if (email.includes('taehun') || email.includes('태훈')) {
        console.log('✅ taehun 감지 → 황태훈');
        return '황태훈'; // 태훈 관련
    } else if (email.includes('lee') || email.includes('이')) {
        console.log('✅ lee 감지 → 이정훈');
        return '이정훈'; // 이정훈 관련
    } else {
        console.log('❌ 매칭 실패 → 정비사');
        return '정비사'; // 기본값
    }
}


// 🎨 HTML 견적서 템플릿 생성
function createEstimateHTML(customerName, carNumber, title, items, totalAmount, notes, bikeModel = '', bikeYear = '', mileage = '', managerName = '정비사', estimateNumber = '') {
    const currentDate = new Date().toLocaleDateString('ko-KR');
    
    return `
        <div id="estimateDocument" style="
            width: 794px; 
            min-height: 600px; 
            padding: 20px; 
            background: white; 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            color: #333;
            box-sizing: border-box;
            margin: 0;
            font-size: 12px;
            line-height: 1.1;
        ">
            <!-- 🎨 헤더 -->
            <div style="
                background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
                color: white;
                padding: 20px;
                border-radius: 10px;
                margin-bottom: 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
            ">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="
                        width: 50px; 
                        height: 50px; 
                        background: rgba(255,255,255,0.2);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        overflow: hidden;
                        border: 2px solid rgba(255,255,255,0.3);
                    ">
                        <svg width="30" height="30" viewBox="0 0 100 100" style="fill: white;">
                            <circle cx="50" cy="50" r="45" fill="rgba(255,255,255,0.1)" stroke="white" stroke-width="2"/>
                            <text x="50" y="38" text-anchor="middle" fill="white" font-size="14" font-weight="bold" font-family="Arial">TW</text>
                            <text x="50" y="58" text-anchor="middle" fill="white" font-size="10" font-weight="bold" font-family="Arial">GARAGE</text>
                        </svg>
                    </div>
                    <div>
                        <h1 style="margin: 0; font-size: 28px; font-weight: bold;">투훈스 게러지</h1>
                        <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">서비스업 · 이륜차정비</p>
                    </div>
                </div>
                <div style="text-align: right;">
                    <h2 style="margin: 0; font-size: 24px; font-weight: bold;">견적서</h2>
                    <p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">ESTIMATE</p>
                </div>
            </div>
            
            <!-- 📋 기본 정보 - 편지 스타일 -->
            <div style="
                background: linear-gradient(145deg, #ffffff, #f8fafc);
                border: 2px solid #e2e8f0;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 20px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            ">
                <h3 style="margin: 0 0 15px 0; color: #1e40af; font-size: 16px; font-weight: bold; text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">견적 의뢰서</h3>
                
                <!-- 편지 스타일 레이아웃 -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start;">
                    <!-- 왼쪽: 고객 정보 -->
                    <div>
                        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; font-weight: bold; border-bottom: 1px solid #667eea; padding-bottom: 4px;">고객 정보</h4>
                        
                        <!-- 첫 번째 줄: 고객명 + 기종 -->
                        <div style="display: flex; gap: 20px; margin-bottom: 8px; align-items: center;">
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <span style="font-weight: 600; color: #666;">고객명:</span>
                                <span style="color: #333;">${customerName}</span>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <span style="font-weight: 600; color: #666;">기종:</span>
                                <span style="color: #333;">${bikeModel || '-'}</span>
                            </div>
                        </div>
                        
                        <!-- 두 번째 줄: 차량번호 -->
                        <div style="margin-bottom: 8px;">
                            <span style="font-weight: 600; color: #666;">차량번호:</span>
                            <span style="color: #333; margin-left: 8px;">${carNumber}</span>
                        </div>
                        
                        <!-- 세 번째 줄: 년식 + 키로수 -->
                        <div style="display: flex; gap: 20px; align-items: center;">
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <span style="font-weight: 600; color: #666;">년식:</span>
                                <span style="color: #333;">${bikeYear || '-'}</span>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <span style="font-weight: 600; color: #666;">키로수:</span>
                                <span style="color: #333;">${mileage || '-'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 오른쪽: 견적 정보 -->
                    <div>
                        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; font-weight: bold; border-bottom: 1px solid #667eea; padding-bottom: 4px;">견적 정보</h4>
                        <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 15px; align-items: center;">
                            <span style="font-weight: 600; color: #666;">작성일:</span>
                            <span style="color: #333;">${currentDate}</span>
                            
                            <span style="font-weight: 600; color: #666;">정비내용:</span>
                            <span style="color: #333;">${title}</span>
                        </div>
                        
                        <!-- 장식적 요소 -->
                        <div style="margin-top: 15px; text-align: center;">
                            <div style="
                                display: inline-block;
                                padding: 6px 12px;
                                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                color: white;
                                border-radius: 15px;
                                font-size: 11px;
                                font-weight: bold;
                            ">견적서 No. ${estimateNumber || Date.now().toString().slice(-6)}</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- 💰 견적 내역 - 편지 스타일 -->
            <div style="
                background: #f8f9fa;
                border: 1px solid #e9ecef;
                border-radius: 6px;
                padding: 15px;
                margin-bottom: 15px;
            ">
                <h3 style="margin: 0 0 12px 0; color: #667eea; font-size: 15px; font-weight: bold; text-align: center; border-bottom: 1px solid #667eea; padding-bottom: 6px;">견적 내역서</h3>
                
                <table style="
                    width: 100%;
                    border-collapse: collapse;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    background: white;
                ">
                    <thead>
                        <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                            <th style="padding: 10px 8px; text-align: left; font-size: 12px; font-weight: bold;">항목명</th>
                            <th style="padding: 10px 8px; text-align: right; font-size: 12px; font-weight: bold;">단가</th>
                            <th style="padding: 10px 6px; text-align: center; font-size: 12px; font-weight: bold;">수량</th>
                            <th style="padding: 10px 8px; text-align: right; font-size: 12px; font-weight: bold;">금액</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((item, index) => `
                            <tr style="background: ${index % 2 === 0 ? '#ffffff' : '#f8f9fa'}; border-bottom: 1px solid #e9ecef;">
                                <td style="padding: 8px; font-size: 12px;">${item.name}</td>
                                <td style="padding: 8px; text-align: right; font-size: 12px;">${item.price.toLocaleString()}원</td>
                                <td style="padding: 8px; text-align: center; font-size: 12px;">${item.quantity}</td>
                                <td style="padding: 8px; text-align: right; font-size: 12px; font-weight: bold; color: #667eea;">${item.total.toLocaleString()}원</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <!-- 총액 - 편지 스타일 (부가세 포함) -->
                <div style="
                    margin-top: 15px;
                    padding: 15px 20px;
                    background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
                    color: white;
                    border-radius: 8px;
                    text-align: center;
                    box-shadow: 0 4px 12px rgba(30, 64, 175, 0.3);
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <span style="font-size: 14px; font-weight: 500;">공급가액</span>
                        <span style="font-size: 15px; font-weight: bold;">${totalAmount.toLocaleString()}원</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <span style="font-size: 14px; font-weight: 500;">부가세 (10%)</span>
                        <span style="font-size: 15px; font-weight: bold;">${Math.round(totalAmount * 0.1).toLocaleString()}원</span>
                    </div>
                    <div style="height: 1px; background: rgba(255,255,255,0.3); margin: 10px 0;"></div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 17px; font-weight: 700;">합계</span>
                        <span style="font-size: 19px; font-weight: bold;">${(totalAmount + Math.round(totalAmount * 0.1)).toLocaleString()}원</span>
                    </div>
                </div>
            </div>
            
            ${notes ? `
            <!-- 📝 추가 메모 - 편지 스타일 -->
            <div style="
                background: linear-gradient(145deg, #ffffff, #f8fafc);
                border: 2px solid #e2e8f0;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 20px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            ">
                <h4 style="margin: 0 0 10px 0; color: #1e40af; font-size: 14px; font-weight: bold; border-bottom: 2px solid #3b82f6; padding-bottom: 5px;">특별 사항</h4>
                <div style="
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 6px;
                    padding: 15px;
                    white-space: pre-wrap;
                    font-size: 13px;
                    line-height: 1.5;
                    color: #374151;
                    font-style: italic;
                ">${notes}</div>
            </div>
            ` : ''}
            
            <!-- ✍️ 서명란 - 편지 스타일 -->
            <div style="margin-top: 20px; background: linear-gradient(145deg, #ffffff, #f8fafc); padding: 20px; border-radius: 8px; border: 2px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                <div style="text-align: center; margin-bottom: 15px;">
                    <h4 style="margin: 0; color: #1e40af; font-size: 14px; font-weight: bold; border-bottom: 2px solid #3b82f6; padding-bottom: 5px;">서명란</h4>
                    <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 12px;">위 견적서 내용에 동의하며 서명합니다.</p>
                </div>
                
                <div style="display: flex; justify-content: space-around; align-items: end;">
                    <!-- 고객 서명 -->
                    <div style="text-align: center;">
                        <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #333;">고객</p>
                        <div style="
                            width: 100px;
                            height: 40px;
                            border: 2px solid #999;
                            border-radius: 4px;
                            background: #fff;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-family: 'Malgun Gothic', sans-serif;
                            font-weight: bold;
                            font-size: 14px;
                            color: #333;
                        ">(서명)</div>
                        <p style="margin: 5px 0 0 0; font-size: 11px; color: #666;">${customerName}</p>
                    </div>
                    
                    <!-- 정비사 서명 -->
                    <div style="text-align: center;">
                        <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #333;">정비사</p>
                        <div style="
                            width: 100px;
                            height: 40px;
                            border: 2px solid #999;
                            border-radius: 4px;
                            background: #fff;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-family: 'Malgun Gothic', sans-serif;
                            font-weight: bold;
                            font-size: 14px;
                            color: #333;
                        ">${managerName}</div>
                        <p style="margin: 5px 0 0 0; font-size: 11px; color: #666;">TWOHOONS GARAGE</p>
                    </div>
                </div>
            </div>
            
            <!-- 📞 푸터 - 편지 스타일 -->
            <div style="
                margin-top: 15px;
                padding: 15px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border-radius: 6px;
                text-align: center;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            ">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <!-- 왼쪽: 회사 정보 -->
                    <div style="flex: 1; text-align: left;">
                        <div style="margin-bottom: 6px;">
                            <span style="font-size: 13px; font-weight: bold;">TWOHOONS GARAGE</span>
                            <span style="margin: 0 8px; opacity: 0.7;">|</span>
                            <span style="font-size: 11px; opacity: 0.9;">이륜차 정비 서비스</span>
                        </div>
                        <div style="font-size: 11px; opacity: 0.8; margin-bottom: 4px;">
                            견적서 생성일: ${new Date().toLocaleString('ko-KR')}
                        </div>
                        <div style="font-size: 10px; opacity: 0.7;">
                            사업자번호: 368-81-03713
                        </div>
                        <div style="font-size: 10px; opacity: 0.7;">
                            계좌번호: MG새마을금고 9002-2074-4521-6
                        </div>
                    </div>
                    
                    <!-- 오른쪽: QR 코드 -->
                    <div style="flex: 0 0 auto; text-align: center;">
                        <div id="qrcode-container" style="
                            width: 80px;
                            height: 80px;
                            background: white;
                            border-radius: 8px;
                            padding: 8px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin-bottom: 8px;
                        ">
                            <!-- QR 코드가 여기에 동적으로 추가됩니다 -->
                        </div>
                        <div style="font-size: 10px; opacity: 0.9; font-weight: 500;">
                            사이트 접속
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 🎨 HTML을 PDF로 변환
async function generatePDFFromHTML(htmlContent, customerName, carNumber, returnBlob = false) {
    try {
        console.log('📄 PDF 생성 시작...');
        
        // 임시 div 생성
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '-9999px';
        tempDiv.style.background = 'white';
        document.body.appendChild(tempDiv);
        
        // QR 코드 생성 및 추가
        const qrContainer = tempDiv.querySelector('#qrcode-container');
        console.log('🔍 QR 컨테이너 찾기:', qrContainer ? '성공' : '실패');
        
        if (qrContainer) {
            try {
                const siteUrl = 'https://leejh5004.github.io/hoons'; // 사이트 URL
                console.log('🔗 QR 코드 URL:', siteUrl);
                
                // QR 코드를 Canvas로 직접 생성 (html2canvas 호환)
                const qrImageUrl = generateSimpleQRCode();
                console.log('📱 QR 이미지 URL:', qrImageUrl);
                
                // 임시 이미지로 QR 코드 로드
                const tempImg = new Image();
                tempImg.crossOrigin = 'anonymous';
                
                // QR 코드를 Canvas로 변환
                const qrCanvas = document.createElement('canvas');
                qrCanvas.width = 64;
                qrCanvas.height = 64;
                qrCanvas.style.width = '64px';
                qrCanvas.style.height = '64px';
                qrCanvas.style.display = 'block';
                
                const ctx = qrCanvas.getContext('2d');
                
                // 이미지 로딩 완료를 기다리고 Canvas에 그리기
                await new Promise((resolve) => {
                    tempImg.onload = () => {
                        console.log('✅ QR 코드 이미지 로드 성공');
                        // Canvas에 QR 코드 그리기
                        ctx.fillStyle = 'white';
                        ctx.fillRect(0, 0, 64, 64);
                        ctx.drawImage(tempImg, 0, 0, 64, 64);
                        resolve();
                    };
                    tempImg.onerror = () => {
                        console.log('⚠️ QR 코드 이미지 로드 실패, 기본 패턴 생성');
                        // 실패시 간단한 패턴 생성
                        ctx.fillStyle = 'white';
                        ctx.fillRect(0, 0, 64, 64);
                        ctx.fillStyle = 'black';
                        
                        // 간단한 QR 코드 패턴 그리기
                        for(let i = 0; i < 8; i++) {
                            for(let j = 0; j < 8; j++) {
                                if((i + j) % 2 === 0) {
                                    ctx.fillRect(i * 8, j * 8, 8, 8);
                                }
                            }
                        }
                        
                        // 가운데에 텍스트
                        ctx.fillStyle = 'white';
                        ctx.font = '8px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText('QR', 32, 30);
                        ctx.fillText('CODE', 32, 42);
                        
                        resolve();
                    };
                    
                    // 2초 후 무조건 진행
                    setTimeout(() => {
                        console.log('⏰ QR 코드 로딩 타임아웃, 기본 패턴 생성');
                        // 기본 패턴 생성
                        ctx.fillStyle = 'white';
                        ctx.fillRect(0, 0, 64, 64);
                        ctx.fillStyle = 'black';
                        ctx.font = '10px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText('TWOHOONS', 32, 25);
                        ctx.fillText('GARAGE', 32, 40);
                        resolve();
                    }, 2000);
                    
                    // 이미지 로드 시작
                    tempImg.src = qrImageUrl;
                });
                
                qrContainer.appendChild(qrCanvas);
                console.log('✅ QR 코드 Canvas 추가 완료');
                
            } catch (error) {
                console.error('❌ QR 코드 생성 실패:', error);
                // 오류 시 대체 텍스트 표시
                qrContainer.innerHTML = `
                    <div style="
                        font-size: 10px; 
                        text-align: center; 
                        color: #333;
                        padding: 5px;
                        line-height: 1.2;
                    ">
                        <div style="font-weight: bold; margin-bottom: 2px;">🔗 QR 코드</div>
                        <div style="font-size: 8px;">사이트 접속</div>
                        <div style="font-size: 8px; margin-top: 2px; word-break: break-all;">leejh5004.github.io/hoons</div>
                    </div>
                `;
            }
        }
        
        // 잠시 대기 (DOM 렌더링 및 QR 코드 생성 완료 대기)
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // html2canvas로 이미지 생성
        const canvas = await html2canvas(tempDiv.firstElementChild, {
            scale: 2,
            backgroundColor: '#ffffff',
            width: 794,
            height: null,
            allowTaint: true,
            useCORS: true
        });
        
        // 임시 div 제거
        document.body.removeChild(tempDiv);
        
        // PDF 생성
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        // 캔버스를 이미지로 변환
        const imgData = canvas.toDataURL('image/png');
        
        // A4 크기 계산
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        // 이미지 크기 조정
        const imgWidth = pdfWidth;
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;
        
        // 페이지가 길면 여러 페이지로 분할
        let position = 0;
        let pageHeight = pdfHeight;
        
        while (position < imgHeight) {
            // 현재 페이지에 이미지 추가
            pdf.addImage(
                imgData, 
                'PNG', 
                0, 
                position === 0 ? 0 : -position, 
                imgWidth, 
                imgHeight
            );
            
            position += pageHeight;
            
            // 다음 페이지가 필요하면 추가
            if (position < imgHeight) {
                pdf.addPage();
            }
        }
        
        // PDF 저장 또는 Blob 반환
        if (returnBlob) {
            // 월별 다운로드용 - Blob 반환
            return pdf.output('blob');
        } else {
            // 일반 견적서 생성용 - 파일 저장
            const fileName = `견적서_${customerName}_${carNumber}_${new Date().toISOString().slice(0, 10)}.pdf`;
            pdf.save(fileName);
            
            showNotification('PDF 견적서가 성공적으로 생성되었습니다! 🎉', 'success');
            closeEstimateModal();
        }
        
    } catch (error) {
        console.error('❌ PDF 생성 오류:', error);
        if (returnBlob) {
            // 월별 다운로드용 - 오류 재전파
            throw error;
        } else {
            // 일반 견적서 생성용 - 사용자에게 알림
            showNotification('PDF 생성 중 오류가 발생했습니다.', 'error');
        }
    }
}

// 사진 문제 디버그용 임시 함수
async function debugPhotoIssue() {
    try {
        console.log('🔍 사진 문제 디버깅 시작...');
        
        const snapshot = await db.collection('maintenance').limit(10).get();
        console.log('📊 전체 정비 이력 수:', snapshot.size);
        
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`📋 정비 ID ${doc.id}:`);
            console.log('  - photos 배열:', data.photos ? data.photos.length + '개' : '없음');
            console.log('  - beforePhoto:', data.beforePhoto ? '있음' : '없음');
            console.log('  - duringPhoto:', data.duringPhoto ? '있음' : '없음');
            console.log('  - afterPhoto:', data.afterPhoto ? '있음' : '없음');
            
            if (data.photos && data.photos.length > 0) {
                data.photos.forEach((photo, index) => {
                    console.log(`    📸 사진 ${index + 1}:`, {
                        type: photo.type,
                        url: photo.url ? photo.url.substring(0, 50) + '...' : '없음',
                        hasDeleteUrl: !!photo.deleteUrl
                    });
                });
            }
        });
        
        showNotification('사진 디버그 완료 - 콘솔을 확인하세요', 'info');
        
    } catch (error) {
        console.error('❌ 사진 디버그 실패:', error);
        showNotification('사진 디버그 실패', 'error');
    }
}

// 전역에서 접근 가능하도록 설정
window.debugPhotoIssue = debugPhotoIssue;

// 💾 견적서 데이터를 Firebase에 저장
async function saveEstimateToFirebase(estimateData) {
    // Firebase 연결 상태 체크
    if (!checkFirebaseConnection()) {
        return;
    }
    
    try {
        console.log('💾 견적서 저장 시작:', {
            estimateNumber: estimateData.estimateNumber,
            currentUser: currentUser?.email,
            isAdmin,
            token: await auth.currentUser?.getIdTokenResult()
        });
        
        await db.collection('estimates').doc(estimateData.estimateNumber).set(estimateData);
        
        console.log('✅ 견적서 저장 완료:', estimateData.estimateNumber);
        showNotification(`견적서 No. ${estimateData.estimateNumber} 저장 완료`, 'success');
        
    } catch (error) {
        console.error('❌ 견적서 저장 중 에러:', {
            error,
            code: error.code,
            message: error.message
        });
        
        // Firebase 오류 상세 처리
        if (error.code === 'unavailable') {
            showNotification('네트워크 연결을 확인해주세요.', 'error');
        } else if (error.code === 'permission-denied') {
            showNotification('데이터 저장 권한이 없습니다.', 'error');
        } else {
            showNotification(`견적서 저장 실패: ${error.message}`, 'error');
        }
        
        throw error; // 에러를 다시 던져서 상위에서 처리하도록
    }
}

// 🔍 견적서 번호로 조회
async function searchEstimateByNumber(estimateNumber) {
    // Firebase 연결 상태 체크
    if (!checkFirebaseConnection()) {
        return null;
    }
    
    try {
        console.log('🔍 견적서 조회 시작:', {
            estimateNumber,
            currentUser: currentUser?.email,
            isAdmin,
            dbReady: !!db
        });
        
        // 간단한 알림으로 시작
        showNotification('견적서를 조회하고 있습니다...', 'info');
        
        const doc = await db.collection('estimates').doc(estimateNumber).get();
        console.log('📄 문서 조회 결과:', {
            exists: doc.exists,
            id: doc.id,
            data: doc.exists ? doc.data() : null
        });
        
        if (doc.exists) {
            const estimateData = doc.data();
            console.log('✅ 견적서 데이터:', estimateData);
            
            // ✅ 견적서 조회 성공
            console.log('✅ 견적서 조회 완료');
            showNotification('견적서 조회 완료', 'success');
            
            return estimateData;
        } else {
            console.log('❌ 견적서 문서가 존재하지 않음');
            showNotification(`견적서 No. ${estimateNumber}를 찾을 수 없습니다.`, 'error');
            return null;
        }
        
    } catch (error) {
        console.error('❌ 견적서 조회 중 에러:', {
            error,
            code: error.code,
            message: error.message,
            stack: error.stack
        });
        
        // Firebase 오류 상세 처리
        if (error.code === 'unavailable') {
            showNotification('네트워크 연결을 확인해주세요.', 'error');
        } else if (error.code === 'permission-denied') {
            showNotification('데이터 조회 권한이 없습니다.', 'error');
        } else {
            showNotification(`견적서 조회 실패: ${error.message}`, 'error');
        }
        
        return null;
    }
}

// 📋 견적서 상세 정보 표시 (사용 안 함 - alert으로 대체)
function showEstimateDetails(estimateData) {
    // 이 함수는 더 이상 사용되지 않음 (alert 방식으로 변경)
}

// 🔍 견적서 검색 모달 표시
function showEstimateSearchModal() {
    const modal = document.getElementById('estimateSearchModal');
    const input = document.getElementById('estimateNumberInput');
    
    if (!modal || !input) {
        // 백업: 프롬프트 사용
        const estimateNumber = prompt('견적서 번호를 입력하세요 (6자리 숫자):');
        if (estimateNumber && estimateNumber.length === 6 && /^\d+$/.test(estimateNumber)) {
            searchEstimateByNumber(estimateNumber);
        }
        return;
    }
    
    // 모달 표시
    modal.classList.add('active');
    input.value = '';
    input.focus();
    
    // Enter 키 이벤트 추가
    input.onkeypress = function(e) {
        if (e.key === 'Enter') {
            handleEstimateSearchSubmit();
        }
    };
}

// 🔍 견적서 검색 처리
async function handleEstimateSearchSubmit() {
    const input = document.getElementById('estimateNumberInput');
    const estimateNumber = input.value.trim();
    
    if (!estimateNumber) {
        showNotification('견적서 번호를 입력해주세요.', 'error');
        input.focus();
        return;
    }
    
    if (estimateNumber.length !== 6 || !/^\d+$/.test(estimateNumber)) {
        showNotification('견적서 번호는 6자리 숫자여야 합니다.', 'error');
        input.focus();
        return;
    }
    
    // 검색 모달 닫기
    closeEstimateSearchModal();
    
    // 견적서 조회
    const estimateData = await searchEstimateByNumber(estimateNumber);
    
    if (estimateData) {
        // 상세 정보 모달로 표시
        showEstimateDetailModal(estimateData);
    }
}

// 🔍 견적서 검색 모달 닫기
function closeEstimateSearchModal() {
    const modal = document.getElementById('estimateSearchModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// 📋 견적서 상세 모달 표시
function showEstimateDetailModal(estimateData) {
    const modal = document.getElementById('estimateDetailModal');
    const body = document.getElementById('estimateDetailBody');
    
    if (!modal || !body) {
        // 백업: alert 사용
        const summary = `
📋 견적서 No. ${estimateData.estimateNumber}

👤 고객명: ${estimateData.customerName}
🏍️ 차량번호: ${estimateData.carNumber}  
🔧 정비내용: ${estimateData.title}
💰 총액: ${estimateData.totalAmount?.toLocaleString()}원
👨‍🔧 작성자: ${estimateData.managerName}
📅 작성일: ${estimateData.createdAt?.toDate?.() ? estimateData.createdAt.toDate().toLocaleDateString('ko-KR') : '알 수 없음'}
        `;
        alert(summary);
        return;
    }
    
    // 견적서 상세 HTML 생성
    const detailHTML = createEstimateDetailHTML(estimateData);
    body.innerHTML = detailHTML;
    
    // 모달 표시
    modal.classList.add('active');
}

// 📋 견적서 상세 모달 닫기
function closeEstimateDetailModal() {
    const modal = document.getElementById('estimateDetailModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// ✏️ 견적서 수정 함수
async function editEstimate(estimateNumber) {
    if (!isAdmin) {
        showNotification('관리자만 견적서를 수정할 수 있습니다.', 'error');
        return;
    }
    
    try {
        console.log('✏️ 견적서 수정 시작:', estimateNumber);
        
        // 견적서 데이터 가져오기
        const estimateData = await searchEstimateByNumber(estimateNumber);
        if (!estimateData) {
            showNotification('견적서 정보를 찾을 수 없습니다.', 'error');
            return;
        }
        
        // 상세 모달 닫기
        closeEstimateDetailModal();
        
        // 견적서 생성 모달 열고 기존 데이터로 채우기
        showEstimateModal();
        
        // 데이터 채우기
        setTimeout(() => {
            document.getElementById('estimateCarNumber').value = estimateData.carNumber || '';
            document.getElementById('estimateCustomerName').value = estimateData.customerName || '';
            document.getElementById('estimateTitle').value = estimateData.title || '';
            document.getElementById('estimateBikeModel').value = estimateData.bikeModel || '';
            document.getElementById('estimateBikeYear').value = estimateData.bikeYear || '';
            document.getElementById('estimateMileage').value = estimateData.mileage || '';
            document.getElementById('estimateNotes').value = estimateData.notes || '';
            
            // 견적 항목들 채우기
            const itemsContainer = document.getElementById('estimateItems');
            itemsContainer.innerHTML = ''; // 기존 항목들 제거
            
            if (estimateData.items && estimateData.items.length > 0) {
                estimateData.items.forEach((item, index) => {
                    addEstimateItem(); // 새 항목 추가
                    
                    // 마지막에 추가된 항목에 데이터 채우기
                    const lastItem = itemsContainer.lastElementChild;
                    if (lastItem) {
                        lastItem.querySelector('.item-name').value = item.name || '';
                        lastItem.querySelector('.item-price').value = item.price || '';
                        lastItem.querySelector('.item-quantity').value = item.quantity || 1;
                    }
                });
            } else {
                // 기본 항목 1개 추가
                addEstimateItem();
            }
            
            // 총액 계산
            calculateTotal();
            
            // 제출 버튼 텍스트 변경
            const submitBtn = document.querySelector('#estimateModal .estimate-modal-btn-generate');
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-save"></i> 견적서 수정';
                submitBtn.onclick = () => updateEstimate(estimateNumber);
            }
            
            // 모달 제목 변경
            const modalTitle = document.querySelector('#estimateModal .modal-title');
            if (modalTitle) {
                modalTitle.innerHTML = '<i class="fas fa-edit"></i> 견적서 수정';
            }
            
            // 수정 모드 플래그 설정
            window.editingEstimateNumber = estimateNumber;
            
            console.log('✅ 견적서 수정 폼 준비 완료');
        }, 100);
        
    } catch (error) {
        console.error('❌ 견적서 수정 중 오류:', error);
        showNotification('견적서 수정 중 오류가 발생했습니다: ' + error.message, 'error');
    }
}

// 💾 견적서 업데이트 함수
async function updateEstimate(estimateNumber) {
    if (!isAdmin) {
        showNotification('관리자만 견적서를 수정할 수 있습니다.', 'error');
        return;
    }
    
    try {
        // 폼 검증
        const carNumber = document.getElementById('estimateCarNumber').value.trim();
        const customerName = document.getElementById('estimateCustomerName').value.trim();
        const title = document.getElementById('estimateTitle').value.trim();
        
        if (!carNumber || !customerName || !title) {
            showNotification('필수 정보를 모두 입력해주세요.', 'error');
            return;
        }
        
        // 견적 항목 수집
        const items = [];
        const itemElements = document.querySelectorAll('.estimate-item-card');
        let hasValidItem = false;
        
        itemElements.forEach(item => {
            const name = item.querySelector('.item-name').value.trim();
            const price = parseFloat(item.querySelector('.item-price').value) || 0;
            const quantity = parseInt(item.querySelector('.item-quantity').value) || 0;
            
            if (name && price > 0 && quantity > 0) {
                // 자동완성 데이터에 추가
                addToAutoComplete(name, price);
                items.push({ name, price, quantity, total: price * quantity });
                hasValidItem = true;
            }
        });
        
        if (!hasValidItem) {
            showNotification('최소 1개의 유효한 견적 항목을 입력해주세요.', 'error');
            return;
        }
        
        const notes = document.getElementById('estimateNotes').value.trim();
        const bikeModel = document.getElementById('estimateBikeModel').value.trim();
        const bikeYear = document.getElementById('estimateBikeYear').value.trim();
        const mileage = document.getElementById('estimateMileage').value.trim();
        
        // 공급가액 계산
        const supplyAmount = items.reduce((sum, item) => sum + item.total, 0);
        // 부가세 계산 (10%)
        const vatAmount = Math.round(supplyAmount * 0.1);
        // 총액 계산 (공급가액 + 부가세)
        const totalAmount = supplyAmount + vatAmount;
        
        // 현재 로그인한 관리자 이름 가져오기
        let currentManagerName = getCurrentManagerSignature();
        
        // 업데이트할 데이터
        const updateData = {
            customerName,
            carNumber,
            title,
            items,
            supplyAmount,
            vatAmount,
            totalAmount,
            notes,
            bikeModel,
            bikeYear,
            mileage,
            managerName: currentManagerName,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: currentUser?.email || 'unknown'
        };
        
        // Firebase에 업데이트
        await db.collection('estimates').doc(estimateNumber).update(updateData);
        
        showNotification('견적서가 성공적으로 수정되었습니다! 🎉', 'success');
        
        // 수정 모드 플래그 제거
        delete window.editingEstimateNumber;
        
        // 모달 닫기
        closeEstimateModal();
        
        // 견적서 상세 모달 다시 열기 (업데이트된 정보로)
        const updatedEstimateData = await searchEstimateByNumber(estimateNumber);
        if (updatedEstimateData) {
            showEstimateDetailModal(updatedEstimateData);
        }
        
    } catch (error) {
        console.error('❌ 견적서 업데이트 오류:', error);
        showNotification('견적서 수정 중 오류가 발생했습니다.', 'error');
    }
}

// 📄 견적서 PDF 재생성 함수
async function regenerateEstimatePDF(estimateNumber) {
    if (!isAdmin) {
        showNotification('관리자만 PDF를 재생성할 수 있습니다.', 'error');
        return;
    }
    
    try {
        console.log('📄 견적서 PDF 재생성 시작:', estimateNumber);
        
        // 견적서 데이터 가져오기
        const estimateData = await searchEstimateByNumber(estimateNumber);
        if (!estimateData) {
            showNotification('견적서 정보를 찾을 수 없습니다.', 'error');
            return;
        }
        
        showNotification('PDF를 재생성하는 중...', 'info');
        
        // HTML 생성
        const htmlContent = createEstimateHTML(
            estimateData.customerName,
            estimateData.carNumber,
            estimateData.title,
            estimateData.items || [],
            estimateData.supplyAmount || 0,
            estimateData.notes || '',
            estimateData.bikeModel || '',
            estimateData.bikeYear || '',
            estimateData.mileage || '',
            estimateData.managerName || '정비사',
            estimateData.estimateNumber
        );
        
        // PDF 생성
        await generatePDFFromHTML(htmlContent, estimateData.customerName, estimateData.carNumber);
        
        showNotification('PDF가 성공적으로 재생성되었습니다! 🎉', 'success');
        
    } catch (error) {
        console.error('❌ PDF 재생성 오류:', error);
        showNotification('PDF 재생성 중 오류가 발생했습니다.', 'error');
    }
}

// 📋 견적서 상세 HTML 생성
function createEstimateDetailHTML(estimateData) {
    const createdDate = estimateData.createdAt?.toDate?.() 
        ? estimateData.createdAt.toDate().toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        })
        : '알 수 없음';
        
    const createdTime = estimateData.createdAt?.toDate?.() 
        ? estimateData.createdAt.toDate().toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit'
        })
        : '';

    // 견적 항목들 HTML 생성
    const itemsHTML = (estimateData.items && estimateData.items.length > 0) 
        ? estimateData.items.map((item, index) => `
            <tr style="background: ${index % 2 === 0 ? '#ffffff' : '#f8f9fa'}; border-bottom: 1px solid #e9ecef;">
                <td style="padding: 12px; font-size: var(--font-size-sm); font-weight: 600; color: #0f172a;">${item.name}</td>
                <td style="padding: 12px; text-align: right; font-size: var(--font-size-sm); color: #475569;">${item.price?.toLocaleString()}원</td>
                <td style="padding: 12px; text-align: center; font-size: var(--font-size-sm); color: #475569;">${item.quantity}</td>
                <td style="padding: 12px; text-align: right; font-size: var(--font-size-sm); font-weight: bold; color: var(--primary-600);">${item.total?.toLocaleString()}원</td>
            </tr>
        `).join('')
        : `
            <tr>
                <td colspan="4" style="padding: 20px; text-align: center; color: #64748b; font-style: italic;">
                    견적 항목 정보가 없습니다.
                </td>
            </tr>
        `;
    
    // 수정 버튼 HTML (관리자만 표시)
    const editButtonHTML = isAdmin ? `
        <div style="margin-top: 20px; text-align: center;">
            <button onclick="editEstimate('${estimateData.estimateNumber}')" class="btn btn-primary" style="margin-right: 10px;">
                <i class="fas fa-edit"></i> 견적서 수정
            </button>
            <button onclick="regenerateEstimatePDF('${estimateData.estimateNumber}')" class="btn btn-secondary">
                <i class="fas fa-file-pdf"></i> PDF 재생성
            </button>
        </div>
    ` : '';
    
    return `
        <div class="estimate-detail-card">
            <div class="estimate-header">
                <div class="estimate-number-badge">
                    No. ${estimateData.estimateNumber}
                </div>
                <div>
                    <h3 style="margin: 0; color: #1e293b; font-weight: 800; font-size: var(--font-size-xl); text-shadow: 0 1px 2px rgba(0,0,0,0.1);">${estimateData.title || '정비 견적서'}</h3>
                    <p style="margin: 8px 0 0 0; color: #475569; font-size: var(--font-size-base); font-weight: 600;">
                        ${estimateData.notes || '정비 내용 상세 견적서'}
                    </p>
                </div>
            </div>
            
            <div class="estimate-info-grid">
                <div class="estimate-info-item">
                    <div class="estimate-info-label">고객명</div>
                    <div class="estimate-info-value">
                        <i class="fas fa-user"></i>
                        <span style="font-weight: 800; color: #0f172a; font-size: var(--font-size-lg);">${estimateData.customerName || '정보 없음'}</span>
                    </div>
                </div>
                
                <div class="estimate-info-item">
                    <div class="estimate-info-label">차량번호</div>
                    <div class="estimate-info-value">
                        <i class="fas fa-motorcycle"></i>
                        <span style="font-weight: 900; color: #0f172a; font-size: var(--font-size-xl); letter-spacing: 1px;">${estimateData.carNumber || '정보 없음'}</span>
                    </div>
                </div>
                
                <div class="estimate-info-item">
                    <div class="estimate-info-label">기종</div>
                    <div class="estimate-info-value">
                        <i class="fas fa-cog"></i>
                        <span style="font-weight: 700; color: #0f172a;">${estimateData.bikeModel || '정보 없음'}</span>
                    </div>
                </div>
                
                <div class="estimate-info-item">
                    <div class="estimate-info-label">년식 / 키로수</div>
                    <div class="estimate-info-value">
                        <i class="fas fa-calendar-alt"></i>
                        <span style="font-weight: 700; color: #0f172a;">${estimateData.bikeYear || '-'}년 / ${estimateData.mileage || '-'}km</span>
                    </div>
                </div>
            </div>
            
            <!-- 🔧 견적 항목 상세 -->
            <div style="margin-bottom: var(--space-lg);">
                <h4 style="margin: 0 0 var(--space-md) 0; color: #1e293b; font-weight: 700; font-size: var(--font-size-lg); display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-wrench" style="color: var(--primary-600);"></i>
                    수리 항목 상세
                </h4>
                
                <div style="background: linear-gradient(145deg, #ffffff, #f1f5f9); border: 2px solid var(--secondary-300); border-radius: var(--radius-lg); overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: linear-gradient(135deg, var(--primary-600), var(--primary-700)); color: white;">
                                <th style="padding: var(--space-md); text-align: left; font-size: var(--font-size-sm); font-weight: bold;">항목명</th>
                                <th style="padding: var(--space-md); text-align: right; font-size: var(--font-size-sm); font-weight: bold;">단가</th>
                                <th style="padding: var(--space-md); text-align: center; font-size: var(--font-size-sm); font-weight: bold;">수량</th>
                                <th style="padding: var(--space-md); text-align: right; font-size: var(--font-size-sm); font-weight: bold;">금액</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHTML}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="estimate-total-section">
                <div class="estimate-breakdown-detail">
                    <div class="estimate-breakdown-detail-item">
                        <span class="estimate-breakdown-detail-label">공급가액:</span>
                        <span class="estimate-breakdown-detail-amount">${(estimateData.supplyAmount || estimateData.totalAmount || 0).toLocaleString()}원</span>
                    </div>
                    <div class="estimate-breakdown-detail-item">
                        <span class="estimate-breakdown-detail-label">부가세 (10%):</span>
                        <span class="estimate-breakdown-detail-amount">${(estimateData.vatAmount || Math.round((estimateData.supplyAmount || estimateData.totalAmount || 0) * 0.1)).toLocaleString()}원</span>
                    </div>
                    <div class="estimate-breakdown-detail-separator"></div>
                    <div class="estimate-breakdown-detail-total">
                        <span class="estimate-total-label">합계</span>
                        <span class="estimate-total-amount">${(estimateData.totalAmount || 0).toLocaleString()}원</span>
                    </div>
                </div>
            </div>
            
            <div class="estimate-meta-info">
                <div class="estimate-meta-item">
                    <i class="fas fa-user-tie"></i>
                    <span style="font-weight: 700; color: #0f172a;">작성자: ${estimateData.managerName || '정보 없음'}</span>
                </div>
                
                <div class="estimate-meta-item">
                    <i class="fas fa-clock"></i>
                    <span style="font-weight: 700; color: #0f172a;">${createdTime}</span>
                </div>
                
                <div class="estimate-meta-item" style="grid-column: 1 / -1;">
                    <i class="fas fa-calendar"></i>
                    <span style="font-weight: 700; color: #0f172a;">${createdDate}</span>
                </div>
            </div>
            
            ${editButtonHTML}
        </div>
    `;
}

// 📱 QR 코드 생성 함수 (사이트 접속용)
function generateSimpleQRCode() {
    // TWOHOONS GARAGE 사이트 QR 코드 - qr-server API 사용 (CORS 없음)
    const siteUrl = 'https://leejh5004.github.io/hoons';
    
    // QR Server API를 사용한 QR 코드 생성
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&format=png&data=${encodeURIComponent(siteUrl)}`;
    
    return qrApiUrl;
}

// 전역에서 접근 가능하도록 설정
window.generateSimpleQRCode = generateSimpleQRCode;

// 견적서 관리 함수들을 전역으로 등록
window.saveEstimateToFirebase = saveEstimateToFirebase;
window.searchEstimateByNumber = searchEstimateByNumber;
window.showEstimateSearchModal = showEstimateSearchModal;
window.closeEstimateSearchModal = closeEstimateSearchModal;
window.handleEstimateSearchSubmit = handleEstimateSearchSubmit;
window.showEstimateDetailModal = showEstimateDetailModal;
window.closeEstimateDetailModal = closeEstimateDetailModal;
window.createEstimateDetailHTML = createEstimateDetailHTML;

// =============================================
// 💾 월별 견적서 다운로드 시스템
// =============================================

// 월별 견적서 다운로드 모달 표시
function showMonthlyEstimateModal() {
    // 🔒 관리자 권한 확인
    if (!isAdmin) {
        showNotification('관리자만 월별 다운로드를 사용할 수 있습니다.', 'error');
        return;
    }
    
    const modal = document.getElementById('monthlyEstimateModal');
    if (!modal) {
        showNotification('월별 다운로드 모달을 찾을 수 없습니다.', 'error');
        return;
    }
    
    // 연도 선택 옵션 초기화
    const yearSelect = document.getElementById('downloadYear');
    const monthSelect = document.getElementById('downloadMonth');
    
    // 현재 연도부터 3년 전까지 옵션 추가
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    yearSelect.innerHTML = '';
    for (let year = currentYear; year >= currentYear - 3; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year + '년';
        yearSelect.appendChild(option);
    }
    
    // 현재 월로 설정
    monthSelect.value = currentMonth;
    
    // 진행률 및 미리보기 숨기기
    document.getElementById('downloadProgress').style.display = 'none';
    document.getElementById('downloadPreview').style.display = 'none';
    
    // 모달 표시
    modal.classList.add('active');
    
    console.log('📅 월별 견적서 다운로드 모달 열림');
}

// 월별 견적서 다운로드 모달 닫기
function closeMonthlyEstimateModal() {
    const modal = document.getElementById('monthlyEstimateModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// 월별 견적서 다운로드 실행
async function downloadMonthlyEstimates() {
    try {
        const year = parseInt(document.getElementById('downloadYear').value);
        const month = parseInt(document.getElementById('downloadMonth').value);
        
        if (!year || !month) {
            showNotification('연도와 월을 선택해주세요.', 'error');
            return;
        }
        
        // 진행률 표시
        const progressContainer = document.getElementById('downloadProgress');
        const progressBar = document.getElementById('downloadProgressBar');
        const statusText = document.getElementById('downloadStatusText');
        const previewContainer = document.getElementById('downloadPreview');
        
        progressContainer.style.display = 'block';
        previewContainer.style.display = 'none';
        
        // 단계 1: 견적서 목록 조회
        statusText.textContent = '견적서 목록을 조회하고 있습니다...';
        progressBar.style.width = '10%';
        
        const estimates = await getEstimatesByMonth(year, month);
        
        if (estimates.length === 0) {
            showNotification(`${year}년 ${month}월에 생성된 견적서가 없습니다.`, 'info');
            progressContainer.style.display = 'none';
            return;
        }
        
        // 단계 2: 미리보기 표시
        statusText.textContent = `${estimates.length}개의 견적서를 찾았습니다.`;
        progressBar.style.width = '30%';
        
        showDownloadPreview(estimates, year, month);
        
        // 단계 3: PDF 생성
        statusText.textContent = 'PDF 파일을 생성하고 있습니다...';
        progressBar.style.width = '50%';
        
        const zip = new JSZip();
        const totalEstimates = estimates.length;
        
        for (let i = 0; i < totalEstimates; i++) {
            const estimate = estimates[i];
            const progress = 50 + (i / totalEstimates) * 40;
            
            statusText.textContent = `PDF 생성 중... (${i + 1}/${totalEstimates})`;
            progressBar.style.width = progress + '%';
            
            // PDF 생성 및 ZIP에 추가
            const pdfBlob = await generateEstimatePDFBlob(estimate);
            const fileName = `견적서_${estimate.estimateNumber}_${estimate.customerName}_${estimate.carNumber}.pdf`;
            zip.file(fileName, pdfBlob);
        }
        
        // 단계 4: ZIP 파일 생성 및 다운로드
        statusText.textContent = 'ZIP 파일을 생성하고 있습니다...';
        progressBar.style.width = '95%';
        
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipFileName = `견적서_${year}년_${month}월_${estimates.length}건.zip`;
        
        // 다운로드 실행
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = zipFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // 완료
        statusText.textContent = '다운로드가 완료되었습니다!';
        progressBar.style.width = '100%';
        
        showNotification(`${estimates.length}개의 견적서가 다운로드되었습니다.`, 'success');
        
        // 3초 후 모달 닫기
        setTimeout(() => {
            closeMonthlyEstimateModal();
        }, 3000);
        
    } catch (error) {
        console.error('❌ 월별 다운로드 중 오류:', error);
        showNotification(`다운로드 실패: ${error.message}`, 'error');
        
        // 진행률 숨기기
        document.getElementById('downloadProgress').style.display = 'none';
    }
}

// 월별 견적서 목록 조회
async function getEstimatesByMonth(year, month) {
    try {
        console.log(`📅 ${year}년 ${month}월 견적서 조회 시작`);
        
        // 해당 월의 시작과 끝 날짜 설정
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);
        
        console.log('📅 조회 기간:', startDate.toLocaleDateString('ko-KR'), '~', endDate.toLocaleDateString('ko-KR'));
        
        // Firebase 인덱스 오류 방지를 위해 단순 range 쿼리 사용
        const snapshot = await db.collection('estimates')
            .where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(startDate))
            .where('createdAt', '<=', firebase.firestore.Timestamp.fromDate(endDate))
            .get();
        
        const estimates = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            estimates.push({
                id: doc.id,
                ...data,
                createdAtTimestamp: data.createdAt ? data.createdAt.toDate().getTime() : 0
            });
        });
        
        // 클라이언트 측에서 날짜순 정렬 (최신순)
        estimates.sort((a, b) => b.createdAtTimestamp - a.createdAtTimestamp);
        
        console.log(`✅ ${estimates.length}개의 견적서 조회 완료`);
        return estimates;
        
    } catch (error) {
        console.error('❌ 월별 견적서 조회 중 오류:', error);
        throw error;
    }
}

// 다운로드 미리보기 표시
function showDownloadPreview(estimates, year, month) {
    const previewContainer = document.getElementById('downloadPreview');
    const previewList = document.getElementById('downloadPreviewList');
    
    let totalAmount = 0;
    const previewHTML = estimates.map(estimate => {
        totalAmount += estimate.totalAmount || 0;
        return `
            <div class="download-preview-item">
                <div class="estimate-info">
                    <div class="estimate-number">No. ${estimate.estimateNumber}</div>
                    <div class="estimate-customer">${estimate.customerName} (${estimate.carNumber})</div>
                </div>
                <div class="estimate-amount">${(estimate.totalAmount || 0).toLocaleString()}원</div>
            </div>
        `;
    }).join('');
    
    const summaryHTML = `
        <div class="download-summary">
            <h5>📊 ${year}년 ${month}월 견적서 요약</h5>
            <p>총 ${estimates.length}건 / 총액 ${totalAmount.toLocaleString()}원</p>
        </div>
    `;
    
    previewList.innerHTML = previewHTML + summaryHTML;
    previewContainer.style.display = 'block';
}

// 견적서 PDF Blob 생성
async function generateEstimatePDFBlob(estimateData) {
    try {
        // HTML 생성 (공급가액 기준)
        const supplyAmount = estimateData.supplyAmount || (estimateData.totalAmount ? Math.round(estimateData.totalAmount / 1.1) : 0);
        const htmlContent = createEstimateHTML(
            estimateData.customerName,
            estimateData.carNumber,
            estimateData.title,
            estimateData.items || [],
            supplyAmount,
            estimateData.notes || '',
            estimateData.bikeModel || '',
            estimateData.bikeYear || '',
            estimateData.mileage || '',
            estimateData.managerName || '정비사',
            estimateData.estimateNumber
        );
        
        // 기존 generatePDFFromHTML 로직을 재사용하여 Blob 반환 (공급가액 기준)
        return await generatePDFFromHTML(htmlContent, estimateData.customerName, estimateData.carNumber, true);
        
    } catch (error) {
        console.error('❌ PDF 생성 중 오류:', error);
        throw error;
    }
}

// ===============================================
// TAXATION MANAGEMENT SYSTEM
// ===============================================

// 세무관리 데이터 로딩 (최적화)
async function loadTaxationData() {
    console.log('📊 세무관리 데이터 로딩 중...');
    
    // 🔒 로그인 상태 체크
    if (!currentUser) {
        console.log('🚫 로그인 필요 - 인증 화면으로 이동');
        showNotification('로그인이 필요합니다.', 'error');
        showScreen('loginScreen');
        return;
    }
    
    // 🔒 관리자 권한 확인 및 자동 수정
    const hasAdminAccess = verifyAndFixAdminStatus();
    if (!hasAdminAccess) {
        console.log('🚫 관리자 권한 필요 - 접근 거부');
        showNotification('세무 화면은 관리자만 접근할 수 있습니다.', 'error');
        showScreen('dashboardScreen');
        return;
    }
    
    try {
        // 현재 연도/분기 설정
        const currentYear = new Date().getFullYear();
        const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
        
        document.getElementById('taxationYear').value = currentYear;
        document.getElementById('taxationQuarter').value = currentQuarter;
        
        // 1단계: 캐시된 세무 데이터 먼저 표시
        await loadCachedTaxationData();
        
        // 2단계: 최신 데이터 병렬 로딩
        const loadingPromises = [
            loadTaxationSummary(currentYear, currentQuarter),
            loadTaxationCategories(),
            isAdmin ? loadRecentTransactions() : Promise.resolve()
        ];
        
        await Promise.allSettled(loadingPromises);
        
        console.log('✅ 세무관리 데이터 로딩 완료');
        
    } catch (error) {
        console.error('❌ 세무관리 데이터 로딩 실패:', error);
        showNotification('세무 데이터 로딩에 실패했습니다: ' + error.message, 'error');
    }
}

// 세무 요약 정보 로딩
async function loadTaxationSummary(year, quarter) {
    try {
        console.log(`📊 ${year}년 ${quarter}분기 세무 요약 로딩...`);
        
        // 분기별 기간 계산
        const quarterStartMonth = (quarter - 1) * 3 + 1;
        const quarterEndMonth = quarter * 3;
        
        // 매출 데이터 조회 (기존 견적서 활용)
        const incomeData = await calculateIncomeFromEstimates(year, quarterStartMonth, quarterEndMonth);
        
        // 매입/경비 데이터 조회
        const expenseData = await loadExpenseData(year, quarterStartMonth, quarterEndMonth);
        
        // 부가세 계산
        const vatData = calculateVAT(incomeData, expenseData);
        
        // UI 업데이트
        updateTaxationSummaryUI(incomeData, expenseData, vatData);
        
        console.log('✅ 세무 요약 로딩 완료');
        
    } catch (error) {
        console.error('❌ 세무 요약 로딩 실패:', error);
        throw error;
    }
}

// 견적서 데이터와 직접 입력된 매출 데이터 계산
async function calculateIncomeFromEstimates(year, startMonth, endMonth) {
    try {
        console.log(`💰 ${year}년 ${startMonth}-${endMonth}월 매출 계산 중...`);
        
        let totalIncome = 0;
        let totalSupply = 0;
        let totalVat = 0;
        let count = 0;
        
        // 견적서 매출 세부 데이터
        let estimateSupply = 0;
        let estimateVat = 0;
        let estimateCount = 0;
        
        // 직접 매출 세부 데이터
        let directSupply = 0;
        let directVat = 0;
        let directCount = 0;
        
        // 1. 견적서 데이터에서 매출 계산
        console.log('📄 견적서 데이터 조회 중...');
        let estimateQuery = db.collection('estimates');
        
        if (isAdmin) {
            estimateQuery = estimateQuery.where('createdBy', '==', currentUser.email);
        }
        
        const estimateSnapshot = await estimateQuery.get();
        
        estimateSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.createdAt) {
                const createdDate = data.createdAt.toDate();
                if (createdDate.getFullYear() === year && 
                    createdDate.getMonth() + 1 >= startMonth && 
                    createdDate.getMonth() + 1 <= endMonth) {
                    
                    const supplyAmount = data.supplyAmount || 0;
                    const vatAmount = data.vatAmount || 0;
                    const totalAmount = data.totalAmount || 0;
                    
                    totalSupply += supplyAmount;
                    totalVat += vatAmount;
                    totalIncome += totalAmount;
                    
                    estimateSupply += supplyAmount;
                    estimateVat += vatAmount;
                    estimateCount++;
                    count++;
                }
            }
        });
        
        console.log(`📄 견적서 매출: ${estimateCount}건, ${(estimateSupply + estimateVat).toLocaleString()}원`);
        
        // 2. 직접 입력된 매출 데이터 계산
        console.log('💰 직접 입력 매출 데이터 조회 중...');
        let incomeQuery = db.collection('income');
        
        if (isAdmin) {
            incomeQuery = incomeQuery.where('adminEmail', '==', currentUser.email);
        }
        
        const incomeSnapshot = await incomeQuery.get();
        
        incomeSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.date) {
                const incomeDate = new Date(data.date);
                if (incomeDate.getFullYear() === year && 
                    incomeDate.getMonth() + 1 >= startMonth && 
                    incomeDate.getMonth() + 1 <= endMonth) {
                    
                    const supplyAmount = data.supplyAmount || 0;
                    const vatAmount = data.vatAmount || 0;
                    const totalAmount = data.totalAmount || 0;
                    
                    totalSupply += supplyAmount;
                    totalVat += vatAmount;
                    totalIncome += totalAmount;
                    
                    directSupply += supplyAmount;
                    directVat += vatAmount;
                    directCount++;
                    count++;
                }
            }
        });
        
        console.log(`💰 직접 입력 매출: ${directCount}건, ${(directSupply + directVat).toLocaleString()}원`);
        
        const totalCount = count;
        console.log(`✅ 총 매출 계산 완료: ${totalCount}건, 총액 ${totalIncome.toLocaleString()}원`);
        
        return {
            totalIncome,
            totalSupply,
            totalVat,
            count: totalCount,
            // 세부 분류 데이터 추가
            estimateSupply,
            estimateVat,
            directSupply,
            directVat
        };
        
    } catch (error) {
        console.error('❌ 매출 계산 실패:', error);
        return { 
            totalIncome: 0, 
            totalSupply: 0, 
            totalVat: 0, 
            count: 0,
            estimateSupply: 0,
            estimateVat: 0,
            directSupply: 0,
            directVat: 0
        };
    }
}

// 매입/경비 데이터 로딩
async function loadExpenseData(year, startMonth, endMonth) {
    try {
        console.log(`💳 ${year}년 ${startMonth}-${endMonth}월 경비 로딩 중...`);
        
        // 관리자별 데이터 필터링 - 인덱스 오류 방지를 위해 where만 사용
        let query = db.collection('expense');
        
        if (isAdmin) {
            query = query.where('adminEmail', '==', currentUser.email);
        }
        
        const snapshot = await query.get();
        
        let totalExpense = 0;
        let totalSupply = 0;
        let totalVat = 0;
        let totalDeductibleVat = 0;
        let count = 0;
        
        // 세부 분류 데이터
        let generalSupply = 0;
        let generalVat = 0;
        let simpleSupply = 0;
        let simpleVat = 0;
        let noTaxSupply = 0;
        let deductibleVat = 0;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.date) {
                const expenseDate = new Date(data.date);
                if (expenseDate.getFullYear() === year && 
                    expenseDate.getMonth() + 1 >= startMonth && 
                    expenseDate.getMonth() + 1 <= endMonth) {
                    
                    const supplyAmount = data.supplyAmount || 0;
                    const vatAmount = data.vatAmount || 0;
                    const vatType = data.vatType || 'vat';
                    const deductibleVatAmount = data.deductibleVat || 0;
                    
                    totalSupply += supplyAmount;
                    totalVat += vatAmount;
                    totalDeductibleVat += deductibleVatAmount;
                    totalExpense += data.totalAmount || 0;
                    deductibleVat += deductibleVatAmount;
                    
                    // 세금계산서 유형별 분류
                    if (vatType === 'vat') {
                        generalSupply += supplyAmount;
                        generalVat += vatAmount;
                    } else if (vatType === 'simple') {
                        simpleSupply += supplyAmount;
                        simpleVat += vatAmount;
                    } else if (vatType === 'none') {
                        noTaxSupply += supplyAmount;
                    }
                    
                    count++;
                }
            }
        });
        
        console.log(`✅ 경비 계산 완료: ${count}건, 총액 ${totalExpense.toLocaleString()}원`);
        
        return {
            totalExpense,
            totalSupply,
            totalVat: totalDeductibleVat, // 매입세액공제 가능한 부가세만
            count,
            // 세부 분류 데이터 추가
            generalSupply,
            generalVat,
            simpleSupply,
            simpleVat,
            noTaxSupply,
            deductibleVat
        };
        
    } catch (error) {
        console.error('❌ 경비 로딩 실패:', error);
        
        // 구체적인 에러 정보 로깅
        if (error.code) {
            console.error('📋 에러 코드:', error.code);
        }
        if (error.message) {
            console.error('📋 에러 메시지:', error.message);
        }
        
        // 사용자에게 알림
        let userMessage = '경비 데이터 로딩에 실패했습니다.';
        if (error.code === 'unavailable') {
            userMessage = '네트워크 연결을 확인해주세요.';
        } else if (error.code === 'permission-denied') {
            userMessage = '경비 데이터 접근 권한이 없습니다.';
        }
        
        showNotification(userMessage, 'error');
        
        return { 
            totalExpense: 0, 
            totalSupply: 0, 
            totalVat: 0, 
            count: 0,
            generalSupply: 0,
            generalVat: 0,
            simpleSupply: 0,
            simpleVat: 0,
            noTaxSupply: 0,
            deductibleVat: 0
        };
    }
}

// 부가세 계산
function calculateVAT(incomeData, expenseData) {
    const incomeVat = incomeData.totalVat || 0;
    const expenseVat = expenseData.totalVat || 0;
    const vatToPay = incomeVat - expenseVat;
    
    return {
        incomeVat,
        expenseVat,
        vatToPay: Math.max(0, vatToPay), // 음수면 0으로 처리
        refundAmount: Math.max(0, -vatToPay) // 환급액
    };
}

// 세무 요약 UI 업데이트
function updateTaxationSummaryUI(incomeData, expenseData, vatData) {
    console.log('🖥️ 세무 요약 UI 업데이트 중...');
    
    // 매출 카드 업데이트
    document.getElementById('totalIncome').textContent = `${incomeData.totalIncome.toLocaleString()}원`;
    document.getElementById('incomeSupply').textContent = `${incomeData.totalSupply.toLocaleString()}원`;
    document.getElementById('incomeVat').textContent = `${incomeData.totalVat.toLocaleString()}원`;
    
    // 매입 카드 업데이트
    document.getElementById('totalExpense').textContent = `${expenseData.totalExpense.toLocaleString()}원`;
    document.getElementById('expenseSupply').textContent = `${expenseData.totalSupply.toLocaleString()}원`;
    document.getElementById('expenseVat').textContent = `${expenseData.totalVat.toLocaleString()}원`;
    
    // 부가세 카드 업데이트
    document.getElementById('vatToPay').textContent = `${vatData.vatToPay.toLocaleString()}원`;
    
    // 부가세 상태 업데이트
    const vatStatus = document.getElementById('vatStatus');
    if (vatData.vatToPay > 0) {
        vatStatus.textContent = '납부';
        vatStatus.style.background = '#fef3c7';
        vatStatus.style.color = '#92400e';
    } else if (vatData.refundAmount > 0) {
        vatStatus.textContent = '환급';
        vatStatus.style.background = '#dcfce7';
        vatStatus.style.color = '#166534';
    } else {
        vatStatus.textContent = '해당없음';
        vatStatus.style.background = '#f3f4f6';
        vatStatus.style.color = '#6b7280';
    }
    
    console.log('✅ 세무 요약 UI 업데이트 완료');
}

// 세무 분류 로딩
async function loadTaxationCategories() {
    console.log('📊 세무 분류 로딩 중...');
    
    try {
        // 카테고리별 집계를 위한 맵
        const categoryData = new Map();
        
        // 1. 매출 카테고리 집계 - 인덱스 오류 방지를 위해 where만 사용
        let incomeQuery = db.collection('income');
        if (isAdmin) {
            incomeQuery = incomeQuery.where('adminEmail', '==', currentUser.email);
        }
        
        const incomeSnapshot = await incomeQuery.get();
        incomeSnapshot.forEach(doc => {
            const data = doc.data();
            const category = data.category || '기타';
            const current = categoryData.get(category) || { income: 0, expense: 0 };
            current.income += data.totalAmount || 0;
            categoryData.set(category, current);
        });
        
        // 2. 경비 카테고리 집계 - 인덱스 오류 방지를 위해 where만 사용
        let expenseQuery = db.collection('expense');
        if (isAdmin) {
            expenseQuery = expenseQuery.where('adminEmail', '==', currentUser.email);
        }
        
        const expenseSnapshot = await expenseQuery.get();
        expenseSnapshot.forEach(doc => {
            const data = doc.data();
            const category = data.category || '기타';
            const current = categoryData.get(category) || { income: 0, expense: 0 };
            current.expense += data.totalAmount || 0;
            categoryData.set(category, current);
        });
        
        // 3. 카테고리별 순 손익 계산
        const categories = [];
        categoryData.forEach((amounts, category) => {
            const netAmount = amounts.income - amounts.expense;
            const color = netAmount >= 0 ? '#10b981' : '#ef4444';
            const type = netAmount >= 0 ? '수익' : '손실';
            
            categories.push({
                name: category,
                amount: Math.abs(netAmount),
                netAmount: netAmount,
                income: amounts.income,
                expense: amounts.expense,
                color: color,
                type: type
            });
        });
        
        // 금액순 정렬
        categories.sort((a, b) => Math.abs(b.netAmount) - Math.abs(a.netAmount));
        
        // 상위 4개만 표시
        const topCategories = categories.slice(0, 4);
        
        // 기본 카테고리가 없으면 기본 카테고리들 추가
        if (topCategories.length === 0) {
            topCategories.push(
                { name: '정비서비스', amount: 0, color: '#10b981', type: '매출' },
                { name: '부품구매', amount: 0, color: '#ef4444', type: '경비' },
                { name: '운영비용', amount: 0, color: '#f59e0b', type: '경비' },
                { name: '기타수익', amount: 0, color: '#6366f1', type: '매출' }
            );
        }
        
        // 분류 그리드 업데이트
        const categoryGrid = document.getElementById('categoryGrid');
        categoryGrid.innerHTML = topCategories.map(category => `
            <div class="category-card" style="
                border-left: 4px solid ${category.color}; background: white; padding: 16px; 
                border-radius: 8px; border: 1px solid #e5e7eb; cursor: pointer; 
                transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            " onclick="handleCategoryClick('${category.name}')" 
               onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 8px rgba(0,0,0,0.15)'" 
               onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(0,0,0,0.1)'">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <h4 style="margin: 0; font-weight: 700; color: #1f2937; font-size: 14px;">${category.name}</h4>
                    <span style="font-size: 12px; padding: 2px 8px; border-radius: 12px; background: ${category.color}20; color: ${category.color}; font-weight: 600;">${category.type}</span>
                </div>
                <p style="margin: 0; font-size: 18px; font-weight: 800; color: ${category.color};">${category.amount.toLocaleString()}원</p>
                ${category.amount === 0 ? '<p style="margin: 4px 0 0 0; font-size: 11px; color: #9ca3af;">아직 데이터가 없습니다</p>' : '<p style="margin: 4px 0 0 0; font-size: 11px; color: #6b7280;">클릭하여 상세보기</p>'}
            </div>
        `).join('');
        
        // 다크 모드에서 카드 스타일 적용
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDarkMode) {
            const cards = categoryGrid.querySelectorAll('.category-card');
            cards.forEach(card => {
                card.style.background = '#334155';
                card.style.border = '1px solid #475569';
                card.style.color = '#f1f5f9';
                
                const title = card.querySelector('h4');
                if (title) title.style.color = '#f8fafc';
                
                const hint = card.querySelector('p:last-child');
                if (hint) hint.style.color = '#cbd5e1';
            });
        }
        
        // 전역 함수 직접 호출 테스트
        console.log('전역 함수 확인:', {
            showCategoryDetailModal: typeof window.showCategoryDetailModal,
            showAllTransactions: typeof window.showAllTransactions
        });
        
        console.log('✅ 세무 분류 로딩 완료');
        
    } catch (error) {
        console.error('❌ 세무 분류 로딩 실패:', error);
        
        // 구체적인 에러 메시지 표시
        let errorMessage = '분류 데이터를 불러올 수 없습니다.';
        if (error.code === 'unavailable') {
            errorMessage = '네트워크 연결을 확인해주세요.';
        } else if (error.code === 'permission-denied') {
            errorMessage = '데이터 접근 권한이 없습니다.';
        } else if (error.message) {
            errorMessage = `오류: ${error.message}`;
        }
        
        // 에러 시 기본 카테고리 표시 (재시도 버튼 포함)
        const categoryGrid = document.getElementById('categoryGrid');
        categoryGrid.innerHTML = `
            <div class="category-card" style="border-left: 4px solid #ef4444; background: white; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; text-align: center;">
                <p style="margin: 0 0 8px 0; color: #ef4444; font-weight: 600;">⚠️ 분류 로딩 실패</p>
                <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 14px;">${errorMessage}</p>
                <button onclick="loadTaxationCategories()" style="background: #3b82f6; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">다시 시도</button>
            </div>
        `;
        
        // 사용자에게 알림
        showNotification('세무 분류 로딩에 실패했습니다. 다시 시도해주세요.', 'error');
    }
}

// 최근 거래 로딩 (관리자만 접근 가능)
async function loadRecentTransactions() {
    console.log('📝 최근 거래 로딩 중...');
    
    const recentList = document.getElementById('recentTransactions');
    
    // 🔒 관리자만 최근 거래 접근 가능
    if (!isAdmin) {
        console.log('🚫 일반 사용자는 최근 거래에 접근할 수 없습니다.');
        recentList.innerHTML = `
            <div class="access-denied" style="text-align: center; padding: 40px; color: #f59e0b;">
                <i class="fas fa-lock" style="font-size: 48px; margin-bottom: 16px; opacity: 0.7;"></i>
                <p style="margin: 0; font-size: 16px; font-weight: 600;">관리자만 접근 가능합니다</p>
                <p style="margin: 8px 0 0 0; font-size: 14px; color: #6b7280;">최근 거래는 관리자 권한이 필요합니다.</p>
            </div>
        `;
        return;
    }
    
    try {
        const allTransactions = [];
        
        // 1. 견적서 데이터 조회 (관리자별 필터링) - 인덱스 안전 버전
        const estimateSnapshot = await db.collection('estimates').get();
        estimateSnapshot.forEach(doc => {
            const data = doc.data();
            // 클라이언트 측에서 필터링
            if (data.createdBy === currentUser.email) {
                allTransactions.push({
                    id: doc.id,
                    type: '매출',
                    description: `${data.customerName} - ${data.title}`,
                    amount: data.totalAmount || 0,
                    date: data.createdAt ? data.createdAt.toDate() : new Date(),
                    icon: 'fa-plus',
                    color: '#10b981',
                    timestamp: data.createdAt ? data.createdAt.toDate().getTime() : 0
                });
            }
        });
        
        // 2. 직접 입력 매출 데이터 조회 (관리자별 필터링) - 인덱스 안전 버전
        const incomeSnapshot = await db.collection('income').get();
        incomeSnapshot.forEach(doc => {
            const data = doc.data();
            // 클라이언트 측에서 필터링
            if (data.adminEmail === currentUser.email) {
                const incomeDate = data.createdAt ? data.createdAt.toDate() : new Date(data.date);
                allTransactions.push({
                    id: doc.id,
                    type: '매출',
                    description: `${data.client} - ${data.description}`,
                    amount: data.totalAmount || 0,
                    date: incomeDate,
                    icon: 'fa-plus',
                    color: '#10b981',
                    timestamp: incomeDate.getTime()
                });
            }
        });
        
        // 3. 경비 데이터 조회 (관리자별 필터링) - 인덱스 안전 버전  
        const expenseSnapshot = await db.collection('expense').get();
        expenseSnapshot.forEach(doc => {
            const data = doc.data();
            // 클라이언트 측에서 필터링
            if (data.adminEmail === currentUser.email) {
                const expenseDate = data.createdAt ? data.createdAt.toDate() : new Date(data.date);
                allTransactions.push({
                    id: doc.id,
                    type: '경비',
                    description: `${data.vendor} - ${data.description}`,
                    amount: data.totalAmount || 0,
                    date: expenseDate,
                    icon: 'fa-minus',
                    color: '#ef4444',
                    timestamp: expenseDate.getTime()
                });
            }
        });
        
        // 날짜순 정렬 및 최근 5건만 선택
        const transactions = allTransactions
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 5);
        
        // 최근 거래 UI 업데이트
        if (transactions.length > 0) {
            recentList.innerHTML = transactions.map(tx => `
                <div class="transaction-item" style="display: flex; align-items: center; gap: 12px; padding: 12px; background: white; border-radius: 8px; border: 1px solid #e5e7eb;">
                    <div class="transaction-icon" style="width: 32px; height: 32px; background: ${tx.color}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white;">
                        <i class="fas ${tx.icon}"></i>
                    </div>
                    <div class="transaction-content" style="flex: 1;">
                        <div class="transaction-desc" style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">${tx.description}</div>
                        <div class="transaction-date" style="font-size: 12px; color: #6b7280;">${tx.date.toLocaleDateString('ko-KR')}</div>
                    </div>
                    <div class="transaction-amount" style="font-weight: 700; color: ${tx.color};">
                        ${tx.amount.toLocaleString()}원
                    </div>
                </div>
            `).join('');
        } else {
            recentList.innerHTML = `
                <div class="empty-transactions" style="text-align: center; padding: 40px; color: #6b7280;">
                    <i class="fas fa-receipt" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                    <p style="margin: 0; font-size: 16px;">최근 거래가 없습니다.</p>
                </div>
            `;
        }
        
        // 다크 모드에서 거래 아이템 스타일 적용
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDarkMode) {
            const items = recentList.querySelectorAll('.transaction-item');
            items.forEach(item => {
                item.style.background = '#334155';
                item.style.border = '1px solid #475569';
                
                const desc = item.querySelector('.transaction-desc');
                if (desc) desc.style.color = '#f8fafc';
                
                const date = item.querySelector('.transaction-date');
                if (date) date.style.color = '#cbd5e1';
            });
            
            const emptyDiv = recentList.querySelector('.empty-transactions');
            if (emptyDiv) {
                emptyDiv.style.color = '#cbd5e1';
                const icon = emptyDiv.querySelector('i');
                if (icon) icon.style.color = '#64748b';
            }
        }
        

        
        console.log(`✅ 최근 거래 로딩 완료: ${transactions.length}건 (관리자: ${currentUser.email})`);
        
    } catch (error) {
        console.error('❌ 최근 거래 로딩 실패:', error);
        recentList.innerHTML = `
            <div class="error-transactions" style="text-align: center; padding: 40px; color: #ef4444;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                <p style="margin: 0;">거래 내역을 불러오는데 실패했습니다.</p>
            </div>
        `;
    }
}

// 세무관리 액션 함수들
function showIncomeModal() {
    // 🔒 관리자 권한 확인
    if (!isAdmin) {
        showNotification('관리자만 매출을 등록할 수 있습니다.', 'error');
        return;
    }
    
    // 기존 모달 제거
    const existingModal = document.getElementById('incomeModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // 오늘 날짜 기본값
    const today = new Date().toISOString().split('T')[0];
    
    const modalHTML = `
        <div id="incomeModal" class="modal-overlay active" style="z-index: 10000;">
            <div class="modal-container" style="max-width: min(600px, 95vw); max-height: 85vh; margin: 10px auto;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-arrow-up" style="color: #059669;"></i> 매출 등록
                    </h2>
                    <button class="modal-close" onclick="closeIncomeModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="modal-body" style="padding: 20px; overflow-y: auto;">
                    <form id="incomeForm" onsubmit="saveIncomeData(event)">
                        <!-- 기본 정보 -->
                        <div class="info-section-unified">
                            <h3>📋 매출 정보</h3>
                            <div class="info-form-grid">
                                <div class="info-form-row">
                                    <div class="info-form-col">
                                        <label class="info-form-label">📅 거래일자</label>
                                        <input type="date" id="incomeDate" value="${today}" required class="info-form-input">
                                    </div>
                                    <div class="info-form-col">
                                        <label class="info-form-label">🏢 거래처</label>
                                        <input type="text" id="incomeClient" placeholder="고객명 또는 업체명" required class="info-form-input">
                                    </div>
                                </div>
                                <div>
                                    <label class="info-form-label">📝 거래 내용</label>
                                    <input type="text" id="incomeDescription" placeholder="예: 엔진 오일 교체 및 점검" required class="info-form-input">
                                </div>
                                <div class="info-form-row">
                                    <div class="info-form-col">
                                        <label class="info-form-label">📂 카테고리</label>
                                        <select id="incomeCategory" required class="info-form-input">
                                            <option value="">카테고리 선택</option>
                                            <option value="정비서비스">정비서비스</option>
                                            <option value="부품판매">부품판매</option>
                                            <option value="점검서비스">점검서비스</option>
                                            <option value="기타">기타</option>
                                        </select>
                                    </div>
                                    <div class="info-form-col">
                                        <label class="info-form-label">
                                            💰 공급가액
                                            <button type="button" class="tax-term-help" onclick="showTaxTermPopup('공급가액')" title="공급가액이란?">
                                                <i class="fas fa-question-circle"></i>
                                            </button>
                                        </label>
                                        <input type="number" id="incomeSupplyAmount" placeholder="0" min="0" required class="info-form-input" oninput="calculateIncomeTotal()">
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 세금 정보 -->
                        <div class="info-section-unified">
                            <h3>💸 세금 정보</h3>
                            <div class="income-tax-breakdown">
                                <div class="tax-row">
                                    <span class="tax-label">공급가액:</span>
                                    <span id="incomeSupplyDisplay" class="tax-value">0원</span>
                                </div>
                                <div class="tax-row">
                                    <span class="tax-label">부가세 (10%):</span>
                                    <span id="incomeVatDisplay" class="tax-value">0원</span>
                                </div>
                                <div class="tax-row tax-total">
                                    <span class="tax-label">합계:</span>
                                    <span id="incomeTotalDisplay" class="tax-value total">0원</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 메모 -->
                        <div class="info-section-unified">
                            <h3>📝 메모</h3>
                            <textarea id="incomeMemo" placeholder="추가 메모 (선택사항)" rows="3" class="info-form-input"></textarea>
                        </div>
                    </form>
                </div>
                
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="closeIncomeModal()">
                        <i class="fas fa-times"></i> 취소
                    </button>
                    <button type="submit" form="incomeForm" class="btn btn-primary">
                        <i class="fas fa-save"></i> 저장
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // 거래처 입력 시 자동 완성 기능
    setupIncomeAutoComplete();
    
    // 포커스 설정
    setTimeout(() => {
        document.getElementById('incomeClient').focus();
    }, 100);
}

// 매출 등록 모달 닫기
function closeIncomeModal() {
    const modal = document.getElementById('incomeModal');
    if (modal) {
        modal.remove();
    }
}

// 매출 총액 계산
function calculateIncomeTotal() {
    const supplyAmount = parseFloat(document.getElementById('incomeSupplyAmount').value) || 0;
    const vatAmount = Math.round(supplyAmount * 0.1);
    const totalAmount = supplyAmount + vatAmount;
    
    // 화면에 표시
    document.getElementById('incomeSupplyDisplay').textContent = supplyAmount.toLocaleString() + '원';
    document.getElementById('incomeVatDisplay').textContent = vatAmount.toLocaleString() + '원';
    document.getElementById('incomeTotalDisplay').textContent = totalAmount.toLocaleString() + '원';
}

// 거래처 자동 완성 및 카테고리 추천 설정
async function setupIncomeAutoComplete() {
    try {
        console.log('💡 매출 자동 완성 기능 초기화 중...');
        
        const clientInput = document.getElementById('incomeClient');
        const categorySelect = document.getElementById('incomeCategory');
        
        if (!clientInput || !categorySelect) return;
        
        // 거래처 입력 시 실시간 카테고리 추천
        clientInput.addEventListener('input', async (e) => {
            const clientName = e.target.value.trim();
            if (clientName.length >= 2) {
                const suggestedCategory = await suggestIncomeCategory(clientName);
                if (suggestedCategory && categorySelect.value === '') {
                    categorySelect.value = suggestedCategory;
                    // 추천된 카테고리 시각적 표시
                    showCategorySuggestion(categorySelect, suggestedCategory);
                }
            }
        });
        
        // 자동 완성 데이터 로드
        await loadIncomeAutoCompleteData(clientInput);
        
        console.log('✅ 매출 자동 완성 설정 완료');
        
    } catch (error) {
        console.error('❌ 매출 자동 완성 설정 실패:', error);
    }
}

// 매출 데이터 저장
async function saveIncomeData(event) {
    event.preventDefault();
    
    try {
        showLoadingSpinner(true);
        
        // 폼 데이터 수집
        const incomeData = {
            date: document.getElementById('incomeDate').value,
            client: document.getElementById('incomeClient').value.trim(),
            description: document.getElementById('incomeDescription').value.trim(),
            category: document.getElementById('incomeCategory').value,
            supplyAmount: parseFloat(document.getElementById('incomeSupplyAmount').value) || 0,
            vatAmount: Math.round((parseFloat(document.getElementById('incomeSupplyAmount').value) || 0) * 0.1),
            totalAmount: (parseFloat(document.getElementById('incomeSupplyAmount').value) || 0) + Math.round((parseFloat(document.getElementById('incomeSupplyAmount').value) || 0) * 0.1),
            memo: document.getElementById('incomeMemo').value.trim(),
            adminEmail: currentUser.email,
            adminName: currentUser.name,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // 필수 값 검증
        if (!incomeData.client || !incomeData.description || !incomeData.category || incomeData.supplyAmount <= 0) {
            showNotification('모든 필수 항목을 입력해주세요.', 'error');
            showLoadingSpinner(false);
            return;
        }
        
        // Firebase에 저장
        await db.collection('income').add(incomeData);
        
        // 학습 데이터 저장 (카테고리 패턴 학습)
        await saveClientCategoryLearning(incomeData.client, incomeData.category, 'income');
        
        showNotification('매출이 성공적으로 등록되었습니다.', 'success');
        
        // 모달 닫기
        closeIncomeModal();
        
        // 세무 대시보드 새로고침
        await loadTaxationData();
        
        showLoadingSpinner(false);
        
    } catch (error) {
        console.error('❌ 매출 저장 실패:', error);
        showNotification('매출 등록에 실패했습니다.', 'error');
        showLoadingSpinner(false);
    }
}

// ✏️ 매출 데이터 수정
async function updateIncomeData(event) {
    event.preventDefault();
    
    if (!window.editingIncomeId) {
        showNotification('수정할 매출을 찾을 수 없습니다.', 'error');
        return;
    }
    
    try {
        showLoadingSpinner(true);
        
        // 폼 데이터 수집
        const incomeData = {
            date: document.getElementById('incomeDate').value,
            client: document.getElementById('incomeClient').value.trim(),
            description: document.getElementById('incomeDescription').value.trim(),
            category: document.getElementById('incomeCategory').value,
            supplyAmount: parseFloat(document.getElementById('incomeSupplyAmount').value) || 0,
            vatAmount: Math.round((parseFloat(document.getElementById('incomeSupplyAmount').value) || 0) * 0.1),
            totalAmount: (parseFloat(document.getElementById('incomeSupplyAmount').value) || 0) + Math.round((parseFloat(document.getElementById('incomeSupplyAmount').value) || 0) * 0.1),
            memo: document.getElementById('incomeMemo').value.trim(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // 필수 값 검증
        if (!incomeData.client || !incomeData.description || !incomeData.category || incomeData.supplyAmount <= 0) {
            showNotification('모든 필수 항목을 입력해주세요.', 'error');
            showLoadingSpinner(false);
            return;
        }
        
        // Firebase에 업데이트
        await db.collection('income').doc(window.editingIncomeId).update(incomeData);
        
        // 학습 데이터 저장 (카테고리 패턴 학습)
        await saveClientCategoryLearning(incomeData.client, incomeData.category, 'income');
        
        showNotification('매출이 성공적으로 수정되었습니다.', 'success');
        
        // 수정 모드 플래그 제거
        delete window.editingIncomeId;
        
        // 모달 닫기
        closeIncomeModal();
        
        // 세무 대시보드 새로고침
        await loadTaxationData();
        
    } catch (error) {
        console.error('❌ 매출 수정 실패:', error);
        showNotification('매출 수정 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoadingSpinner(false);
    }
}

function showExpenseModal() {
    // 🔒 관리자 권한 확인
    if (!isAdmin) {
        showNotification('관리자만 경비를 등록할 수 있습니다.', 'error');
        return;
    }
    
    // 기존 모달 제거
    const existingModal = document.getElementById('expenseModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // 오늘 날짜 기본값
    const today = new Date().toISOString().split('T')[0];
    
    const modalHTML = `
        <div id="expenseModal" class="modal-overlay active" style="z-index: 10000;">
            <div class="modal-container" style="max-width: min(600px, 95vw); max-height: 85vh; margin: 10px auto;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-arrow-down" style="color: #dc2626;"></i> 경비 등록
                    </h2>
                    <button class="modal-close" onclick="closeExpenseModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="modal-body" style="padding: 20px; overflow-y: auto;">
                    <form id="expenseForm" onsubmit="saveExpenseData(event)">
                        <!-- 기본 정보 -->
                        <div class="info-section-unified">
                            <h3>📋 경비 정보</h3>
                            <div class="info-form-grid">
                                <div class="info-form-row">
                                    <div class="info-form-col">
                                        <label class="info-form-label">📅 지출일자</label>
                                        <input type="date" id="expenseDate" value="${today}" required class="info-form-input">
                                    </div>
                                    <div class="info-form-col">
                                        <label class="info-form-label">🏪 거래처</label>
                                        <input type="text" id="expenseVendor" placeholder="업체명 또는 상호" required class="info-form-input">
                                    </div>
                                </div>
                                <div>
                                    <label class="info-form-label">📝 지출 내용</label>
                                    <input type="text" id="expenseDescription" placeholder="예: 엔진 오일 구매, 공구 구매" required class="info-form-input">
                                </div>
                                <div class="info-form-row">
                                    <div class="info-form-col">
                                        <label class="info-form-label">📂 카테고리</label>
                                        <select id="expenseCategory" required class="info-form-input">
                                            <option value="">카테고리 선택</option>
                                            <option value="부품구매">부품구매</option>
                                            <option value="공구구매">공구구매</option>
                                            <option value="사무용품">사무용품</option>
                                            <option value="임대료">임대료</option>
                                            <option value="전기료">전기료</option>
                                            <option value="통신료">통신료</option>
                                            <option value="연료비">연료비</option>
                                            <option value="광고선전비">광고선전비</option>
                                            <option value="기타">기타</option>
                                        </select>
                                    </div>
                                    <div class="info-form-col">
                                        <label class="info-form-label">
                                            💳 공급가액
                                            <button type="button" class="tax-term-help" onclick="showTaxTermPopup('공급가액')" title="공급가액이란?">
                                                <i class="fas fa-question-circle"></i>
                                            </button>
                                        </label>
                                        <input type="number" id="expenseSupplyAmount" placeholder="0" min="0" required class="info-form-input" oninput="calculateExpenseTotal()">
                                    </div>
                                </div>
                                <div class="info-form-row">
                                    <div class="info-form-col">
                                        <label class="info-form-label">
                                            🧾 세금계산서
                                            <button type="button" class="tax-term-help" onclick="showTaxTermPopup('매입세액공제')" title="매입세액공제란?">
                                                <i class="fas fa-question-circle"></i>
                                            </button>
                                        </label>
                                        <select id="expenseVatType" class="info-form-input" onchange="calculateExpenseTotal()">
                                            <option value="vat">부가세 포함 (10%)</option>
                                            <option value="simple">간이세금계산서 (매입세액공제 불가)</option>
                                            <option value="none">세금계산서 없음</option>
                                        </select>
                                    </div>
                                    <div class="info-form-col">
                                        <label class="info-form-label">📄 증빙</label>
                                        <select id="expenseProof" class="info-form-input">
                                            <option value="receipt">영수증</option>
                                            <option value="invoice">세금계산서</option>
                                            <option value="card">카드내역</option>
                                            <option value="other">기타</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 세금 정보 -->
                        <div class="info-section-unified">
                            <h3>💸 세금 정보</h3>
                            <div class="expense-tax-breakdown">
                                <div class="tax-row">
                                    <span class="tax-label">공급가액:</span>
                                    <span id="expenseSupplyDisplay" class="tax-value">0원</span>
                                </div>
                                <div class="tax-row">
                                    <span class="tax-label">부가세 (10%):</span>
                                    <span id="expenseVatDisplay" class="tax-value">0원</span>
                                </div>
                                <div class="tax-row tax-deduction">
                                    <span class="tax-label">매입세액공제:</span>
                                    <span id="expenseDeductionDisplay" class="tax-value deduction">0원</span>
                                </div>
                                <div class="tax-row tax-total">
                                    <span class="tax-label">합계:</span>
                                    <span id="expenseTotalDisplay" class="tax-value total">0원</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 메모 -->
                        <div class="info-section-unified">
                            <h3>📝 메모</h3>
                            <textarea id="expenseMemo" placeholder="추가 메모 (선택사항)" rows="3" class="info-form-input"></textarea>
                        </div>
                    </form>
                </div>
                
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="closeExpenseModal()">
                        <i class="fas fa-times"></i> 취소
                    </button>
                    <button type="submit" form="expenseForm" class="btn btn-primary">
                        <i class="fas fa-save"></i> 저장
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // 거래처 입력 시 자동 완성 기능
    setupExpenseAutoComplete();
    
    // 포커스 설정
    setTimeout(() => {
        document.getElementById('expenseVendor').focus();
    }, 100);
}

// 경비 등록 모달 닫기
function closeExpenseModal() {
    const modal = document.getElementById('expenseModal');
    if (modal) {
        modal.remove();
    }
}

// 경비 총액 계산 (매입세액공제 고려)
function calculateExpenseTotal() {
    const supplyAmount = parseFloat(document.getElementById('expenseSupplyAmount').value) || 0;
    const vatType = document.getElementById('expenseVatType').value;
    
    let vatAmount = 0;
    let deductibleVat = 0;
    
    if (vatType === 'vat') {
        // 일반 세금계산서 - 매입세액공제 가능
        vatAmount = Math.round(supplyAmount * 0.1);
        deductibleVat = vatAmount;
    } else if (vatType === 'simple') {
        // 간이세금계산서 - 매입세액공제 불가
        vatAmount = Math.round(supplyAmount * 0.1);
        deductibleVat = 0;
    } else {
        // 세금계산서 없음
        vatAmount = 0;
        deductibleVat = 0;
    }
    
    const totalAmount = supplyAmount + vatAmount;
    
    // 화면에 표시
    document.getElementById('expenseSupplyDisplay').textContent = supplyAmount.toLocaleString() + '원';
    document.getElementById('expenseVatDisplay').textContent = vatAmount.toLocaleString() + '원';
    document.getElementById('expenseDeductionDisplay').textContent = deductibleVat.toLocaleString() + '원';
    document.getElementById('expenseTotalDisplay').textContent = totalAmount.toLocaleString() + '원';
}

// 경비 거래처 자동 완성 및 카테고리 추천 설정
async function setupExpenseAutoComplete() {
    try {
        console.log('💡 경비 자동 완성 기능 초기화 중...');
        
        const vendorInput = document.getElementById('expenseVendor');
        const categorySelect = document.getElementById('expenseCategory');
        
        if (!vendorInput || !categorySelect) return;
        
        // 거래처 입력 시 실시간 카테고리 추천
        vendorInput.addEventListener('input', async (e) => {
            const vendorName = e.target.value.trim();
            if (vendorName.length >= 2) {
                const suggestedCategory = await suggestExpenseCategory(vendorName);
                if (suggestedCategory && categorySelect.value === '') {
                    categorySelect.value = suggestedCategory;
                    // 추천된 카테고리 시각적 표시
                    showCategorySuggestion(categorySelect, suggestedCategory);
                }
            }
        });
        
        // 자동 완성 데이터 로드
        await loadExpenseAutoCompleteData(vendorInput);
        
        console.log('✅ 경비 자동 완성 설정 완료');
        
    } catch (error) {
        console.error('❌ 경비 자동 완성 설정 실패:', error);
    }
}

// 경비 데이터 저장
async function saveExpenseData(event) {
    event.preventDefault();
    
    try {
        showLoadingSpinner(true);
        
        // 폼 데이터 수집
        const supplyAmount = parseFloat(document.getElementById('expenseSupplyAmount').value) || 0;
        const vatType = document.getElementById('expenseVatType').value;
        
        let vatAmount = 0;
        let deductibleVat = 0;
        
        if (vatType === 'vat') {
            vatAmount = Math.round(supplyAmount * 0.1);
            deductibleVat = vatAmount;
        } else if (vatType === 'simple') {
            vatAmount = Math.round(supplyAmount * 0.1);
            deductibleVat = 0;
        }
        
        const expenseData = {
            date: document.getElementById('expenseDate').value,
            vendor: document.getElementById('expenseVendor').value.trim(),
            description: document.getElementById('expenseDescription').value.trim(),
            category: document.getElementById('expenseCategory').value,
            supplyAmount: supplyAmount,
            vatAmount: vatAmount,
            deductibleVat: deductibleVat,
            totalAmount: supplyAmount + vatAmount,
            vatType: vatType,
            proof: document.getElementById('expenseProof').value,
            memo: document.getElementById('expenseMemo').value.trim(),
            adminEmail: currentUser.email,
            adminName: currentUser.name,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // 필수 값 검증
        if (!expenseData.vendor || !expenseData.description || !expenseData.category || expenseData.supplyAmount <= 0) {
            showNotification('모든 필수 항목을 입력해주세요.', 'error');
            showLoadingSpinner(false);
            return;
        }
        
        // Firebase에 저장
        await db.collection('expense').add(expenseData);
        
        // 학습 데이터 저장 (카테고리 패턴 학습)
        await saveClientCategoryLearning(expenseData.vendor, expenseData.category, 'expense');
        
        showNotification('경비가 성공적으로 등록되었습니다.', 'success');
        
        // 모달 닫기
        closeExpenseModal();
        
        // 세무 대시보드 새로고침
        await loadTaxationData();
        
        showLoadingSpinner(false);
        
    } catch (error) {
        console.error('❌ 경비 저장 실패:', error);
        showNotification('경비 등록에 실패했습니다.', 'error');
        showLoadingSpinner(false);
    }
}

// ✏️ 경비 데이터 수정
async function updateExpenseData(event) {
    event.preventDefault();
    
    if (!window.editingExpenseId) {
        showNotification('수정할 경비를 찾을 수 없습니다.', 'error');
        return;
    }
    
    try {
        showLoadingSpinner(true);
        
        // 폼 데이터 수집
        const expenseData = {
            date: document.getElementById('expenseDate').value,
            vendor: document.getElementById('expenseVendor').value.trim(),
            description: document.getElementById('expenseDescription').value.trim(),
            category: document.getElementById('expenseCategory').value,
            supplyAmount: parseFloat(document.getElementById('expenseSupplyAmount').value) || 0,
            vatType: document.getElementById('expenseVatType').value,
            proof: document.getElementById('expenseProof').value,
            memo: document.getElementById('expenseMemo').value.trim(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // 부가세 계산
        if (expenseData.vatType === 'vat') {
            expenseData.vatAmount = Math.round(expenseData.supplyAmount * 0.1);
            expenseData.deductibleVat = expenseData.vatAmount;
            expenseData.totalAmount = expenseData.supplyAmount + expenseData.vatAmount;
        } else if (expenseData.vatType === 'simple') {
            expenseData.vatAmount = Math.round(expenseData.supplyAmount * 0.1);
            expenseData.deductibleVat = 0; // 간이세금계산서는 공제 불가
            expenseData.totalAmount = expenseData.supplyAmount + expenseData.vatAmount;
        } else {
            expenseData.vatAmount = 0;
            expenseData.deductibleVat = 0;
            expenseData.totalAmount = expenseData.supplyAmount;
        }
        
        // 필수 값 검증
        if (!expenseData.vendor || !expenseData.description || !expenseData.category || expenseData.supplyAmount <= 0) {
            showNotification('모든 필수 항목을 입력해주세요.', 'error');
            showLoadingSpinner(false);
            return;
        }
        
        // Firebase에 업데이트
        await db.collection('expense').doc(window.editingExpenseId).update(expenseData);
        
        // 학습 데이터 저장 (카테고리 패턴 학습)
        await saveClientCategoryLearning(expenseData.vendor, expenseData.category, 'expense');
        
        showNotification('경비가 성공적으로 수정되었습니다.', 'success');
        
        // 수정 모드 플래그 제거
        delete window.editingExpenseId;
        
        // 모달 닫기
        closeExpenseModal();
        
        // 세무 대시보드 새로고침
        await loadTaxationData();
        
    } catch (error) {
        console.error('❌ 경비 수정 실패:', error);
        showNotification('경비 수정 중 오류가 발생했습니다.', 'error');
    } finally {
        showLoadingSpinner(false);
    }
}

// ===============================================
// 급여 시스템 - Salary Management System
// ===============================================

// 급여 모달 열기
function showSalaryModal() {
    console.log('💰 급여 모달 열기 시작');
    console.log('👤 현재 사용자:', { isAdmin, currentUser: currentUser?.email });
    
    // 관리자 권한 확인
    if (!isAdmin) {
        console.log('❌ 관리자 권한 없음');
        showNotification('관리자만 접근할 수 있습니다.', 'error');
        return;
    }
    
    const modal = document.getElementById('salaryModal');
    console.log('🔍 급여 모달 요소:', modal);
    
    if (modal) {
        console.log('✅ 급여 모달 활성화');
        modal.classList.add('active');
        
        // 초기 탭 설정
        showSalaryTab('employees');
        
        // 직원 목록 로드
        loadEmployeeList();
        
        // 4대보험 설정 로드
        loadInsuranceSettings();
        
        // 급여 계산 기간 설정
        setupSalaryPeriod();
        
        console.log('✅ 급여 모달 열기 완료');
    } else {
        console.error('❌ 급여 모달 요소를 찾을 수 없음');
        showNotification('급여 관리 모달을 찾을 수 없습니다.', 'error');
    }
}

// 급여 모달 닫기
function closeSalaryModal() {
    console.log('❌ 급여 모달 닫기');
    
    const modal = document.getElementById('salaryModal');
    if (modal) {
        modal.classList.remove('active');
        // 폼 초기화
        resetSalaryForms();
        console.log('✅ 급여 모달 닫기 완료');
    } else {
        console.error('❌ 급여 모달 요소를 찾을 수 없음');
    }
}

// 급여 탭 전환
function showSalaryTab(tabName) {
    console.log('📋 급여 탭 전환:', tabName);
    
    // 모든 탭 버튼 비활성화
    const allTabs = document.querySelectorAll('.salary-tab');
    console.log('🔍 찾은 탭 버튼 수:', allTabs.length);
    allTabs.forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 모든 탭 컨텐츠 숨김
    const allContents = document.querySelectorAll('.salary-tab-content');
    console.log('🔍 찾은 탭 컨텐츠 수:', allContents.length);
    allContents.forEach(content => {
        content.classList.remove('active');
    });
    
    // 선택된 탭 활성화
    const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
    const activeContent = document.getElementById(`${tabName}Tab`);
    
    console.log('🎯 활성화할 탭:', activeTab);
    console.log('🎯 활성화할 컨텐츠:', activeContent);
    
    if (activeTab) {
        activeTab.classList.add('active');
        console.log('✅ 탭 활성화 완료');
    }
    if (activeContent) {
        activeContent.classList.add('active');
        console.log('✅ 컨텐츠 활성화 완료');
    }
    
    // 탭별 데이터 로드
    switch(tabName) {
        case 'employees':
            console.log('👥 직원 목록 로드 시작');
            loadEmployeeList();
            break;
        case 'calculation':
            console.log('🧮 급여 계산 로드 시작');
            loadSalaryCalculation();
            break;
        case 'history':
            console.log('📜 지급 이력 로드 시작');
            loadSalaryHistory();
            break;
        case 'insurance':
            console.log('🛡️ 4대보험 설정 로드 시작');
            loadInsuranceSettings();
            break;
        default:
            console.warn('⚠️ 알 수 없는 탭:', tabName);
    }
}

// 직원 목록 로드
async function loadEmployeeList() {
    try {
        const employeesList = document.getElementById('employeesList');
        if (!employeesList) return;
        
        // Firebase 인덱스 오류 방지를 위해 orderBy 제거 후 클라이언트에서 정렬
        const querySnapshot = await db.collection('employees')
            .where('adminEmail', '==', currentUser.email)
            .get();
        
        if (querySnapshot.empty) {
            employeesList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h3>등록된 직원이 없습니다</h3>
                    <p>첫 번째 직원을 등록해보세요!</p>
                </div>
            `;
            return;
        }
        
        // 클라이언트에서 이름순 정렬
        const employees = querySnapshot.docs.map(doc => ({
            id: doc.id,
            data: doc.data()
        })).sort((a, b) => (a.data.name || '').localeCompare(b.data.name || ''));
        
        const employeesHTML = employees.map(employee => {
            return createEmployeeCard(employee.id, employee.data);
        }).join('');
        
        employeesList.innerHTML = employeesHTML;
        
        // 직원 검색 기능 추가
        setupEmployeeSearch();
        
    } catch (error) {
        console.error('❌ 직원 목록 로드 실패:', error);
        
        // 구체적인 에러 정보 표시
        let errorMessage = '직원 목록을 불러오는데 실패했습니다.';
        if (error.code === 'unavailable') {
            errorMessage = '네트워크 연결을 확인해주세요.';
        } else if (error.code === 'permission-denied') {
            errorMessage = '직원 데이터 접근 권한이 없습니다.';
        }
        
        showNotification(errorMessage, 'error');
        
        // 에러 UI 표시
        const employeesList = document.getElementById('employeesList');
        if (employeesList) {
            employeesList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                    <h3 style="color: #ef4444;">직원 목록 로딩 실패</h3>
                    <p>${errorMessage}</p>
                    <button onclick="loadEmployeeList()" style="background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 8px;">다시 시도</button>
                </div>
            `;
        }
    }
}

// 직원 카드 생성
function createEmployeeCard(employeeId, employee) {
    const statusClass = employee.status === '재직' ? 'success' : 
                       employee.status === '휴직' ? 'warning' : 'error';
    
    return `
        <div class="employee-card" data-employee-id="${employeeId}">
            <div class="employee-info">
                <div class="employee-name">${employee.name}</div>
                <div class="employee-details">
                    <span><i class="fas fa-id-card"></i> ${employee.position}</span>
                    <span><i class="fas fa-building"></i> ${employee.department}</span>
                    <span><i class="fas fa-calendar"></i> ${formatDate(employee.joinDate)}</span>
                    <span class="status-badge ${statusClass}">${employee.status}</span>
                </div>
            </div>
            <div class="employee-actions-btn">
                <button class="btn-edit" onclick="editEmployee('${employeeId}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-delete" onclick="deleteEmployee('${employeeId}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

// 직원 추가 폼 표시
function showAddEmployeeForm(isEditMode = false) {
    console.log('👥 직원 폼 표시:', { isEditMode });
    
    const form = document.getElementById('addEmployeeForm');
    console.log('🔍 직원 폼 요소:', form);
    
    if (form) {
        // CSS 클래스 제거로 표시 (style.display보다 우선순위 높음)
        form.classList.remove('add-employee-form-hidden');
        console.log('✅ 직원 폼 표시 완료');
        
        // 수정 모드가 아닐 때만 사번 자동 생성
        if (!isEditMode) {
            generateEmployeeId();
        }
        
        // 폼 제출 이벤트 설정
        const employeeForm = document.getElementById('employeeForm');
        if (employeeForm) {
            if (isEditMode) {
                // 수정 모드일 때는 이벤트 리스너를 제거하고 나중에 설정
                employeeForm.onsubmit = null;
            } else {
                // 추가 모드일 때는 기본 저장 함수 설정
                employeeForm.onsubmit = saveEmployee;
            }
        }
    } else {
        console.error('❌ 직원 폼 요소를 찾을 수 없음');
        showNotification('직원 폼을 찾을 수 없습니다.', 'error');
    }
}

// 직원 추가 폼 취소
function cancelAddEmployee() {
    console.log('❌ 직원 추가 폼 취소');
    
    const form = document.getElementById('addEmployeeForm');
    if (form) {
        // CSS 클래스 추가로 숨김
        form.classList.add('add-employee-form-hidden');
        resetEmployeeForm();
        
        // 폼 제출 이벤트 원래대로 복원
        const employeeForm = document.getElementById('employeeForm');
        if (employeeForm) {
            employeeForm.onsubmit = saveEmployee;
        }
        console.log('✅ 직원 폼 숨김 완료');
    } else {
        console.error('❌ 직원 폼 요소를 찾을 수 없음');
    }
}

// 사번 자동 생성
async function generateEmployeeId() {
    try {
        const year = new Date().getFullYear().toString().slice(-2);
        const querySnapshot = await db.collection('employees')
            .where('adminEmail', '==', currentUser.email)
            .get();
        
        const nextNumber = (querySnapshot.size + 1).toString().padStart(3, '0');
        const employeeId = `EMP${year}${nextNumber}`;
        
        document.getElementById('empId').value = employeeId;
    } catch (error) {
        console.error('사번 생성 실패:', error);
    }
}

// 직원 저장
async function saveEmployee(event) {
    event.preventDefault();
    console.log('💾 직원 저장 시작');
    
    const formData = {
        name: document.getElementById('empName').value,
        employeeId: document.getElementById('empId').value,
        position: document.getElementById('empPosition').value,
        department: document.getElementById('empDepartment').value,
        joinDate: document.getElementById('empJoinDate').value,
        phone: document.getElementById('empPhone').value,
        baseSalary: parseInt(document.getElementById('empBaseSalary').value) || 0,
        status: document.getElementById('empStatus').value,
        adminEmail: currentUser.email,
        createdAt: new Date().toISOString()
    };
    
    console.log('📋 저장할 데이터:', formData);
    
    try {
        await db.collection('employees').add(formData);
        console.log('✅ 직원 저장 성공');
        showNotification('직원이 성공적으로 등록되었습니다.', 'success');
        
        // 폼 초기화 및 목록 새로고침
        resetEmployeeForm();
        cancelAddEmployee();
        loadEmployeeList();
        
    } catch (error) {
        console.error('❌ 직원 저장 실패:', error);
        showNotification('직원 등록에 실패했습니다.', 'error');
    }
}

// 직원 수정
async function editEmployee(employeeId) {
    console.log('✏️ 직원 수정 시작:', employeeId);
    
    try {
        const doc = await db.collection('employees').doc(employeeId).get();
        if (!doc.exists) {
            showNotification('직원 정보를 찾을 수 없습니다.', 'error');
            return;
        }
        
        const employee = doc.data();
        console.log('👥 직원 정보 로드:', employee);
        
        // 폼에 기존 데이터 입력
        document.getElementById('empName').value = employee.name || '';
        document.getElementById('empId').value = employee.employeeId || '';
        document.getElementById('empPosition').value = employee.position || '';
        document.getElementById('empDepartment').value = employee.department || '';
        document.getElementById('empJoinDate').value = employee.joinDate || '';
        document.getElementById('empPhone').value = employee.phone || '';
        document.getElementById('empBaseSalary').value = employee.baseSalary || '';
        document.getElementById('empStatus').value = employee.status || '재직';
        
        // 수정 모드로 전환
        showAddEmployeeForm(true);
        
        // 폼 제출 이벤트 설정
        const form = document.getElementById('employeeForm');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                console.log('📝 직원 정보 업데이트 시작:', employeeId);
                await updateEmployee(employeeId);
            };
        }
        
    } catch (error) {
        console.error('❌ 직원 정보 로드 실패:', error);
        showNotification('직원 정보를 불러오는데 실패했습니다.', 'error');
    }
}

// 직원 정보 업데이트
async function updateEmployee(employeeId) {
    console.log('📝 직원 정보 업데이트 시작:', employeeId);
    
    const formData = {
        name: document.getElementById('empName').value,
        employeeId: document.getElementById('empId').value,
        position: document.getElementById('empPosition').value,
        department: document.getElementById('empDepartment').value,
        joinDate: document.getElementById('empJoinDate').value,
        phone: document.getElementById('empPhone').value,
        baseSalary: parseInt(document.getElementById('empBaseSalary').value) || 0,
        status: document.getElementById('empStatus').value,
        updatedAt: new Date().toISOString()
    };
    
    console.log('📋 업데이트할 데이터:', formData);
    
    try {
        await db.collection('employees').doc(employeeId).update(formData);
        console.log('✅ 직원 정보 업데이트 성공');
        showNotification('직원 정보가 성공적으로 수정되었습니다.', 'success');
        
        // 폼 초기화 및 목록 새로고침
        resetEmployeeForm();
        cancelAddEmployee();
        loadEmployeeList();
        
        // 폼 제출 이벤트 원래대로 복원
        const form = document.getElementById('employeeForm');
        if (form) {
            form.onsubmit = saveEmployee;
        }
        
    } catch (error) {
        console.error('❌ 직원 정보 수정 실패:', error);
        showNotification('직원 정보 수정에 실패했습니다.', 'error');
    }
}

// 직원 삭제
async function deleteEmployee(employeeId) {
    if (!confirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
        return;
    }
    
    try {
        await db.collection('employees').doc(employeeId).delete();
        showNotification('직원이 성공적으로 삭제되었습니다.', 'success');
        loadEmployeeList();
        
    } catch (error) {
        console.error('직원 삭제 실패:', error);
        showNotification('직원 삭제에 실패했습니다.', 'error');
    }
}

// 직원 검색 기능
function setupEmployeeSearch() {
    const searchInput = document.getElementById('employeeSearch');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const employeeCards = document.querySelectorAll('.employee-card');
            
            employeeCards.forEach(card => {
                const name = card.querySelector('.employee-name').textContent.toLowerCase();
                const details = card.querySelector('.employee-details').textContent.toLowerCase();
                
                if (name.includes(searchTerm) || details.includes(searchTerm)) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    }
}

// 직원 폼 초기화
function resetEmployeeForm() {
    console.log('🔄 직원 폼 초기화');
    
    const form = document.getElementById('employeeForm');
    if (form) {
        form.reset();
    }
    
    // 사번 필드 초기화 (generateEmployeeId는 추가 모드에서만 호출)
    const empIdField = document.getElementById('empId');
    if (empIdField) {
        empIdField.value = '';
    }
}

// 급여 계산 기간 설정
function setupSalaryPeriod() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    // 년도 옵션 추가
    const yearSelect = document.getElementById('salaryYear');
    if (yearSelect) {
        yearSelect.innerHTML = '';
        for (let year = currentYear; year >= currentYear - 5; year--) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = `${year}년`;
            if (year === currentYear) option.selected = true;
            yearSelect.appendChild(option);
        }
    }
    
    // 월 기본값 설정
    const monthSelect = document.getElementById('salaryMonth');
    if (monthSelect) {
        monthSelect.value = currentMonth;
    }
}

// 급여 계산 로드
async function loadSalaryCalculation() {
    try {
        const year = document.getElementById('salaryYear').value;
        const month = document.getElementById('salaryMonth').value;
        
        const calculationList = document.getElementById('salaryCalculationList');
        if (!calculationList) return;
        
        // 직원 목록 가져오기 - 인덱스 오류 방지를 위해 adminEmail만 필터링
        const employeesSnapshot = await db.collection('employees')
            .where('adminEmail', '==', currentUser.email)
            .get();
        
        // 클라이언트에서 재직 중인 직원만 필터링
        const activeEmployees = employeesSnapshot.docs.filter(doc => {
            const employee = doc.data();
            return employee.status === '재직';
        });
        
        if (activeEmployees.length === 0) {
            calculationList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h3>재직 중인 직원이 없습니다</h3>
                    <p>직원을 먼저 등록해주세요!</p>
                </div>
            `;
            return;
        }
        
        const calculationsHTML = [];
        
        for (const doc of activeEmployees) {
            const employee = doc.data();
            const calculation = await calculateEmployeeSalary(doc.id, employee, year, month);
            calculationsHTML.push(createSalaryCalculationCard(doc.id, employee, calculation));
        }
        
        calculationList.innerHTML = calculationsHTML.join('');
        
    } catch (error) {
        console.error('❌ 급여 계산 로드 실패:', error);
        
        // 구체적인 에러 정보 표시
        let errorMessage = '급여 계산을 불러오는데 실패했습니다.';
        if (error.code === 'unavailable') {
            errorMessage = '네트워크 연결을 확인해주세요.';
        } else if (error.code === 'permission-denied') {
            errorMessage = '급여 데이터 접근 권한이 없습니다.';
        }
        
        showNotification(errorMessage, 'error');
        
        // 에러 UI 표시
        const calculationList = document.getElementById('salaryCalculationList');
        if (calculationList) {
            calculationList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                    <h3 style="color: #ef4444;">급여 계산 로딩 실패</h3>
                    <p>${errorMessage}</p>
                    <button onclick="loadSalaryCalculation()" style="background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 8px;">다시 시도</button>
                </div>
            `;
        }
    }
}

// 직원 급여 계산
async function calculateEmployeeSalary(employeeId, employee, year, month) {
    try {
        // 4대보험 설정 로드
        const insuranceSettings = await getInsuranceSettings();
        
        const baseSalary = employee.baseSalary || 0;
        
        // 4대보험 계산
        const nationalPension = Math.min(baseSalary * (insuranceSettings.pensionRate / 100), 
                                       insuranceSettings.pensionLimit * (insuranceSettings.pensionRate / 100));
        const healthInsurance = Math.min(baseSalary * (insuranceSettings.healthRate / 100), 
                                       insuranceSettings.healthLimit * (insuranceSettings.healthRate / 100));
        const employmentInsurance = baseSalary * (insuranceSettings.employmentRate / 100);
        
        // 소득세 간이 계산 (기본 5%)
        const incomeTax = baseSalary * 0.05;
        const localTax = incomeTax * 0.1;
        
        // 총 공제액
        const totalDeduction = nationalPension + healthInsurance + employmentInsurance + incomeTax + localTax;
        
        // 실수령액
        const netSalary = baseSalary - totalDeduction;
        
        return {
            baseSalary,
            nationalPension: Math.floor(nationalPension),
            healthInsurance: Math.floor(healthInsurance),
            employmentInsurance: Math.floor(employmentInsurance),
            incomeTax: Math.floor(incomeTax),
            localTax: Math.floor(localTax),
            totalDeduction: Math.floor(totalDeduction),
            netSalary: Math.floor(netSalary)
        };
        
    } catch (error) {
        console.error('급여 계산 실패:', error);
        return null;
    }
}

// 급여 계산 카드 생성
function createSalaryCalculationCard(employeeId, employee, calculation) {
    if (!calculation) return '';
    
    return `
        <div class="salary-calculation-card">
            <div class="salary-calc-header-card">
                <div class="salary-calc-employee">${employee.name} (${employee.position})</div>
                <div class="salary-calc-status pending">계산 완료</div>
            </div>
            
            <div class="salary-calc-breakdown">
                <div class="salary-calc-section">
                    <h5>지급 내역</h5>
                    <div class="salary-calc-item">
                        <span>기본급</span>
                        <span>${calculation.baseSalary.toLocaleString()}원</span>
                    </div>
                    <div class="salary-calc-item total">
                        <span>총 지급액</span>
                        <span>${calculation.baseSalary.toLocaleString()}원</span>
                    </div>
                </div>
                
                <div class="salary-calc-section">
                    <h5>공제 내역</h5>
                    <div class="salary-calc-item">
                        <span>국민연금</span>
                        <span>${calculation.nationalPension.toLocaleString()}원</span>
                    </div>
                    <div class="salary-calc-item">
                        <span>건강보험</span>
                        <span>${calculation.healthInsurance.toLocaleString()}원</span>
                    </div>
                    <div class="salary-calc-item">
                        <span>고용보험</span>
                        <span>${calculation.employmentInsurance.toLocaleString()}원</span>
                    </div>
                    <div class="salary-calc-item">
                        <span>소득세</span>
                        <span>${calculation.incomeTax.toLocaleString()}원</span>
                    </div>
                    <div class="salary-calc-item">
                        <span>지방세</span>
                        <span>${calculation.localTax.toLocaleString()}원</span>
                    </div>
                    <div class="salary-calc-item total">
                        <span>총 공제액</span>
                        <span>${calculation.totalDeduction.toLocaleString()}원</span>
                    </div>
                </div>
            </div>
            
            <div class="salary-calc-item total" style="margin-top: 1rem; padding: 1rem; background: var(--success); color: white; border-radius: var(--radius-md);">
                <span>실수령액</span>
                <span>${calculation.netSalary.toLocaleString()}원</span>
            </div>
            
            <div class="salary-calc-actions">
                <button class="btn btn-primary" onclick="paySalary('${employeeId}')">
                    <i class="fas fa-money-bill-wave"></i>
                    급여 지급
                </button>
                <button class="btn btn-secondary" onclick="generatePayslip('${employeeId}')">
                    <i class="fas fa-file-alt"></i>
                    급여명세서
                </button>
            </div>
        </div>
    `;
}

// 급여 지급 처리
async function paySalary(employeeId) {
    try {
        const year = document.getElementById('salaryYear').value;
        const month = document.getElementById('salaryMonth').value;
        
        // 직원 정보 가져오기
        const employeeDoc = await db.collection('employees').doc(employeeId).get();
        if (!employeeDoc.exists) {
            showNotification('직원 정보를 찾을 수 없습니다.', 'error');
            return;
        }
        
        const employee = employeeDoc.data();
        const calculation = await calculateEmployeeSalary(employeeId, employee, year, month);
        
        if (!calculation) {
            showNotification('급여 계산에 실패했습니다.', 'error');
            return;
        }
        
        // 급여 지급 기록 저장
        const salaryRecord = {
            employeeId: employeeId,
            employeeName: employee.name,
            year: parseInt(year),
            month: parseInt(month),
            baseSalary: calculation.baseSalary,
            deductions: {
                nationalPension: calculation.nationalPension,
                healthInsurance: calculation.healthInsurance,
                employmentInsurance: calculation.employmentInsurance,
                incomeTax: calculation.incomeTax,
                localTax: calculation.localTax
            },
            totalDeduction: calculation.totalDeduction,
            netSalary: calculation.netSalary,
            paidAt: new Date().toISOString(),
            adminEmail: currentUser.email
        };
        
        await db.collection('salary_records').add(salaryRecord);
        
        showNotification(`${employee.name}님의 급여가 지급되었습니다.`, 'success');
        
        // 급여 이력 탭으로 이동
        showSalaryTab('history');
        
    } catch (error) {
        console.error('급여 지급 실패:', error);
        showNotification('급여 지급에 실패했습니다.', 'error');
    }
}

// 급여명세서 생성
async function generatePayslip(employeeId) {
    showNotification('급여명세서 생성 기능은 준비 중입니다.', 'info');
}

// 급여 이력 로드
async function loadSalaryHistory() {
    try {
        const historyList = document.getElementById('salaryHistoryList');
        if (!historyList) return;
        
        // Firebase 인덱스 오류 방지를 위해 단순 쿼리 사용
        const querySnapshot = await db.collection('salary_records')
            .where('adminEmail', '==', currentUser.email)
            .get();
        
        if (querySnapshot.empty) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <h3>급여 지급 이력이 없습니다</h3>
                    <p>급여를 지급하면 이력이 표시됩니다.</p>
                </div>
            `;
            return;
        }
        
        // 클라이언트 측에서 정렬 및 제한
        const salaryRecords = [];
        querySnapshot.docs.forEach(doc => {
            const record = doc.data();
            salaryRecords.push({
                id: doc.id,
                data: record,
                paidAtTimestamp: record.paidAt ? new Date(record.paidAt).getTime() : 0
            });
        });
        
        // 날짜순 정렬 (최신순)
        salaryRecords.sort((a, b) => b.paidAtTimestamp - a.paidAtTimestamp);
        
        // 최대 50개로 제한
        const limitedRecords = salaryRecords.slice(0, 50);
        
        const historyHTML = limitedRecords.map(item => {
            return createSalaryHistoryItem(item.id, item.data);
        }).join('');
        
        historyList.innerHTML = historyHTML;
        
    } catch (error) {
        console.error('❌ 급여 이력 로드 실패:', error);
        
        // 구체적인 에러 정보 표시
        let errorMessage = '급여 이력을 불러오는데 실패했습니다.';
        if (error.code === 'unavailable') {
            errorMessage = '네트워크 연결을 확인해주세요.';
        } else if (error.code === 'permission-denied') {
            errorMessage = '급여 이력 접근 권한이 없습니다.';
        }
        
        showNotification(errorMessage, 'error');
        
        // 에러 UI 표시
        const historyList = document.getElementById('salaryHistoryList');
        if (historyList) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>
                    <h3 style="color: #ef4444;">급여 이력 로딩 실패</h3>
                    <p>${errorMessage}</p>
                    <button onclick="loadSalaryHistory()" style="background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 8px;">다시 시도</button>
                </div>
            `;
        }
    }
}

// 급여 이력 아이템 생성
function createSalaryHistoryItem(recordId, record) {
    const paidDate = new Date(record.paidAt);
    const period = `${record.year}년 ${record.month}월`;
    
    return `
        <div class="salary-history-item">
            <div class="salary-history-info">
                <div class="salary-history-employee">${record.employeeName}</div>
                <div class="salary-history-period">${period} • ${formatDate(paidDate.toISOString())}</div>
            </div>
            <div class="salary-history-amount">${record.netSalary.toLocaleString()}원</div>
            <div class="salary-history-actions">
                <button class="btn-view" onclick="viewSalaryDetail('${recordId}')">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn-download" onclick="downloadPayslip('${recordId}')">
                    <i class="fas fa-download"></i>
                </button>
            </div>
        </div>
    `;
}

// 급여 상세 보기
async function viewSalaryDetail(recordId) {
    showNotification('급여 상세 보기 기능은 준비 중입니다.', 'info');
}

// 급여명세서 다운로드
async function downloadPayslip(recordId) {
    showNotification('급여명세서 다운로드 기능은 준비 중입니다.', 'info');
}

// 4대보험 설정 로드
async function loadInsuranceSettings() {
    try {
        const doc = await db.collection('insurance_settings').doc(currentUser.email).get();
        
        if (doc.exists) {
            const settings = doc.data();
            document.getElementById('pensionRate').value = settings.pensionRate;
            document.getElementById('healthRate').value = settings.healthRate;
            document.getElementById('employmentRate').value = settings.employmentRate;
            document.getElementById('accidentRate').value = settings.accidentRate;
            document.getElementById('pensionLimit').value = settings.pensionLimit;
            document.getElementById('healthLimit').value = settings.healthLimit;
        }
        
    } catch (error) {
        console.error('4대보험 설정 로드 실패:', error);
    }
}

// 4대보험 설정 저장
async function saveInsuranceSettings() {
    try {
        const settings = {
            pensionRate: parseFloat(document.getElementById('pensionRate').value),
            healthRate: parseFloat(document.getElementById('healthRate').value),
            employmentRate: parseFloat(document.getElementById('employmentRate').value),
            accidentRate: parseFloat(document.getElementById('accidentRate').value),
            pensionLimit: parseInt(document.getElementById('pensionLimit').value),
            healthLimit: parseInt(document.getElementById('healthLimit').value),
            updatedAt: new Date().toISOString()
        };
        
        await db.collection('insurance_settings').doc(currentUser.email).set(settings);
        
        showNotification('4대보험 설정이 저장되었습니다.', 'success');
        
    } catch (error) {
        console.error('4대보험 설정 저장 실패:', error);
        showNotification('4대보험 설정 저장에 실패했습니다.', 'error');
    }
}

// 4대보험 설정 가져오기
async function getInsuranceSettings() {
    try {
        const doc = await db.collection('insurance_settings').doc(currentUser.email).get();
        
        if (doc.exists) {
            return doc.data();
        } else {
            // 기본 설정 반환
            return {
                pensionRate: 4.5,
                healthRate: 3.545,
                employmentRate: 0.9,
                accidentRate: 0.7,
                pensionLimit: 5530000,
                healthLimit: 8730000
            };
        }
        
    } catch (error) {
        console.error('4대보험 설정 가져오기 실패:', error);
        return {
            pensionRate: 4.5,
            healthRate: 3.545,
            employmentRate: 0.9,
            accidentRate: 0.7,
            pensionLimit: 5530000,
            healthLimit: 8730000
        };
    }
}

// 급여 시스템 폼 초기화
function resetSalaryForms() {
    // 직원 추가 폼 숨김
    const addForm = document.getElementById('addEmployeeForm');
    if (addForm) {
        addForm.style.display = 'none';
    }
    
    // 모든 폼 초기화
    const forms = document.querySelectorAll('#salaryModal form');
    forms.forEach(form => form.reset());
    
    // 기본 탭으로 전환
    showSalaryTab('employees');
}

// ===============================================
// 부가세 신고 준비 시스템 - VAT Report System
// ===============================================

// 부가세 신고 모달 열기
async function showTaxReport() {
    console.log('📊 세무 리포트 버튼 클릭됨');
    
    try {
        // 관리자 권한 확인 및 자동 수정
        const hasAdminAccess = verifyAndFixAdminStatus();
        if (!hasAdminAccess) {
            console.log('❌ 관리자 권한 없음');
            showNotification('부가세 신고는 관리자만 접근할 수 있습니다. 관리자 계정으로 로그인해주세요.', 'error');
            return;
        }
        
        console.log('✅ 관리자 권한 확인됨');
        
        const modal = document.getElementById('vatReportModal');
        if (!modal) {
            console.error('❌ vatReportModal 요소를 찾을 수 없습니다.');
            showNotification('부가세 신고 화면을 찾을 수 없습니다. 페이지를 새로고침해주세요.', 'error');
            return;
        }
        
        console.log('✅ 모달 요소 찾음');
        
        // 로딩 시작
        showNotification('부가세 신고 화면을 준비 중입니다...', 'info');
        
        modal.classList.add('active');
        console.log('✅ 모달 활성화됨');
        
        // 초기 탭 설정
        showVatTab('report');
        console.log('✅ 탭 설정 완료');
        
        // 부가세 신고 기간 설정
        setupVatReportPeriod();
        console.log('✅ 기간 설정 완료');
        
        // 초기 부가세 리포트 생성
        await generateVatReport();
        console.log('✅ 리포트 생성 완료');
        
        showNotification('부가세 신고서가 준비되었습니다.', 'success');
        
    } catch (error) {
        console.error('❌ 세무 리포트 모달 열기 실패:', error);
        showNotification(`부가세 신고 화면을 여는데 실패했습니다: ${error.message}`, 'error');
    }
}

// 부가세 신고 모달 닫기
function closeVatReportModal() {
    const modal = document.getElementById('vatReportModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// 부가세 탭 전환
function showVatTab(tabName) {
    // 모든 탭 버튼 비활성화
    document.querySelectorAll('.vat-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 모든 탭 컨텐츠 숨김
    document.querySelectorAll('.vat-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // 선택된 탭 활성화
    const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
    const activeContent = document.getElementById(`${tabName}Tab`);
    
    if (activeTab) activeTab.classList.add('active');
    if (activeContent) activeContent.classList.add('active');
    
    // 탭별 데이터 로드
    switch(tabName) {
        case 'report':
            generateVatReport();
            break;
        case 'simulation':
            setupVatSimulation();
            break;
        case 'schedule':
            loadVatSchedule();
            break;
        case 'analysis':
            loadVatAnalysis();
            break;
    }
}

// 부가세 신고 기간 설정
function setupVatReportPeriod() {
    const currentYear = new Date().getFullYear();
    const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
    
    // 년도 옵션 추가
    const yearSelect = document.getElementById('vatReportYear');
    if (yearSelect) {
        yearSelect.innerHTML = '';
        for (let year = currentYear; year >= currentYear - 5; year--) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = `${year}년`;
            if (year === currentYear) option.selected = true;
            yearSelect.appendChild(option);
        }
    }
    
    // 분기 기본값 설정
    const quarterSelect = document.getElementById('vatReportQuarter');
    if (quarterSelect) {
        quarterSelect.value = currentQuarter;
    }
}

// 부가세 신고서 생성
async function generateVatReport() {
    console.log('📊 부가세 신고서 생성 시작');
    
    try {
        // 관리자 권한 확인
        const hasAdminAccess = verifyAndFixAdminStatus();
        if (!hasAdminAccess) {
            console.log('❌ 관리자 권한 없음');
            showNotification('부가세 신고서 생성은 관리자만 가능합니다.', 'error');
            return;
        }
        
        const yearElement = document.getElementById('vatReportYear');
        const quarterElement = document.getElementById('vatReportQuarter');
        
        if (!yearElement || !quarterElement) {
            console.error('❌ 년도 또는 분기 선택 요소를 찾을 수 없습니다.');
            showNotification('년도 또는 분기 선택 항목을 찾을 수 없습니다. 페이지를 새로고침해주세요.', 'error');
            return;
        }
        
        const year = parseInt(yearElement.value);
        const quarter = parseInt(quarterElement.value);
        
        if (isNaN(year) || isNaN(quarter) || year < 2020 || year > 2030 || quarter < 1 || quarter > 4) {
            console.error('❌ 유효하지 않은 년도 또는 분기 값');
            showNotification('유효하지 않은 년도 또는 분기 값입니다. (2020-2030년, 1-4분기)', 'error');
            return;
        }
        
        // 분기별 월 계산
        const startMonth = (quarter - 1) * 3 + 1;
        const endMonth = quarter * 3;
        
        console.log(`📊 ${year}년 ${quarter}분기 부가세 신고서 생성 중... (${startMonth}월~${endMonth}월)`);
        
        // 매출 및 매입 데이터 로드
        console.log('📊 매출 및 경비 데이터 로딩 중...');
        const [incomeData, expenseData] = await Promise.all([
            calculateIncomeFromEstimates(year, startMonth, endMonth),
            loadExpenseData(year, startMonth, endMonth)
        ]);
        
        // 데이터 검증 및 기본값 설정
        const safeIncomeData = {
            totalIncome: incomeData?.totalIncome || 0,
            totalSupply: incomeData?.totalSupply || 0,
            totalVat: incomeData?.totalVat || 0,
            count: incomeData?.count || 0
        };
        
        const safeExpenseData = {
            totalExpense: expenseData?.totalExpense || 0,
            totalSupply: expenseData?.totalSupply || 0,
            totalVat: expenseData?.totalVat || 0,
            count: expenseData?.count || 0
        };
        
        console.log('📊 데이터 로딩 완료:', { safeIncomeData, safeExpenseData });
        
        // 부가세 계산
        console.log('📊 부가세 계산 중...');
        const vatData = calculateVAT(safeIncomeData, safeExpenseData);
        
        console.log('📊 부가세 계산 완료:', vatData);
        
        // 부가세 신고서 요약 생성
        console.log('📊 부가세 신고서 요약 생성 중...');
        createVatReportSummary(safeIncomeData, safeExpenseData, vatData, year, quarter);
        
        // 부가세 신고서 상세 내역 생성
        console.log('📊 부가세 신고서 상세 내역 생성 중...');
        createVatReportDetails(safeIncomeData, safeExpenseData, year, quarter);
        
        console.log('✅ 부가세 신고서 생성 완료');
        
        // 데이터가 없는 경우 경고 메시지
        if (safeIncomeData.count === 0 && safeExpenseData.count === 0) {
            showNotification('부가세 신고서가 생성되었지만, 해당 기간에 데이터가 없습니다.', 'warning');
        } else {
            showNotification('부가세 신고서가 생성되었습니다.', 'success');
        }
        
    } catch (error) {
        console.error('❌ 부가세 신고서 생성 실패:', error);
        
        // Target ID 충돌 오류 특별 처리
        if (error.code === 'already-exists') {
            console.log('🔄 Target ID 충돌로 인한 부가세 신고서 생성 실패 - 재시도');
            showNotification('데이터 충돌이 발생했습니다. 잠시 후 다시 시도해주세요.', 'warning');
            // 네트워크 재설정 후 재시도 권장
            setTimeout(() => {
                if (db) {
                    cleanupFirebaseListeners();
                }
            }, 1000);
        } else {
            showNotification(`부가세 신고서 생성에 실패했습니다: ${error.message}`, 'error');
        }
    }
}

// 부가세 신고서 요약 생성
function createVatReportSummary(incomeData, expenseData, vatData, year, quarter) {
    const summaryContainer = document.getElementById('vatReportSummary');
    if (!summaryContainer) return;
    
    // 분기별 월 계산
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = quarter * 3;
    
    summaryContainer.innerHTML = `
        <h4>${year}년 ${quarter}분기 부가세 신고서 요약</h4>
        
        <div class="vat-summary-card">
            <div class="vat-summary-item income">
                <div class="vat-summary-label">매출세액</div>
                <div class="vat-summary-amount">${incomeData.totalVat.toLocaleString()}원</div>
                <div style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-tertiary);">
                    공급가액: ${incomeData.totalSupply.toLocaleString()}원
                </div>
            </div>
            
            <div class="vat-summary-item expense">
                <div class="vat-summary-label">매입세액</div>
                <div class="vat-summary-amount">${expenseData.totalVat.toLocaleString()}원</div>
                <div style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-tertiary);">
                    공급가액: ${expenseData.totalSupply.toLocaleString()}원
                </div>
            </div>
            
            <div class="vat-summary-item tax">
                <div class="vat-summary-label">${vatData.vatToPay > 0 ? '납부할 세액' : '환급받을 세액'}</div>
                <div class="vat-summary-amount">${Math.abs(vatData.vatToPay > 0 ? vatData.vatToPay : vatData.refundAmount).toLocaleString()}원</div>
                <div style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-tertiary);">
                    ${vatData.vatToPay > 0 ? '납부 예정' : '환급 예정'}
                </div>
            </div>
        </div>
        
        <div class="vat-filing-info" style="margin-top: 2rem; padding: 1.5rem; background: var(--bg-secondary); border-radius: var(--radius-lg);">
            <h5 style="margin-bottom: 1rem;">신고 및 납부 정보</h5>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                <div>
                    <strong>신고 기한:</strong> ${getVatFilingDeadline(year, quarter)}
                </div>
                <div>
                    <strong>납부 기한:</strong> ${getVatPaymentDeadline(year, quarter)}
                </div>
                <div>
                    <strong>신고 유형:</strong> 일반과세자
                </div>
                <div>
                    <strong>과세 기간:</strong> ${year}.${startMonth.toString().padStart(2, '0')}.01 ~ ${year}.${endMonth.toString().padStart(2, '0')}.${getLastDayOfMonth(year, endMonth)}
                </div>
            </div>
        </div>
    `;
}

// 부가세 신고서 상세 내역 생성
function createVatReportDetails(incomeData, expenseData, year, quarter) {
    const detailsContainer = document.getElementById('vatReportDetails');
    if (!detailsContainer) return;
    
    // 데이터 안전성 확인
    const safeIncomeData = {
        estimateSupply: incomeData.estimateSupply || 0,
        estimateVat: incomeData.estimateVat || 0,
        directSupply: incomeData.directSupply || 0,
        directVat: incomeData.directVat || 0,
        totalSupply: incomeData.totalSupply || 0,
        totalVat: incomeData.totalVat || 0,
        totalIncome: incomeData.totalIncome || 0
    };
    
    const safeExpenseData = {
        generalSupply: expenseData.generalSupply || 0,
        generalVat: expenseData.generalVat || 0,
        simpleSupply: expenseData.simpleSupply || 0,
        simpleVat: expenseData.simpleVat || 0,
        noTaxSupply: expenseData.noTaxSupply || 0,
        totalSupply: expenseData.totalSupply || 0,
        totalVat: expenseData.totalVat || 0,
        totalExpense: expenseData.totalExpense || 0,
        deductibleVat: expenseData.deductibleVat || 0
    };
    
    detailsContainer.innerHTML = `
        <div class="vat-detail-section">
            <h5>📈 매출 세부 내역</h5>
            <table class="vat-detail-table">
                <thead>
                    <tr>
                        <th>구분</th>
                        <th>공급가액</th>
                        <th>부가세</th>
                        <th>합계</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>견적서 매출</td>
                        <td class="amount">${safeIncomeData.estimateSupply.toLocaleString()}원</td>
                        <td class="amount">${safeIncomeData.estimateVat.toLocaleString()}원</td>
                        <td class="amount">${(safeIncomeData.estimateSupply + safeIncomeData.estimateVat).toLocaleString()}원</td>
                    </tr>
                    <tr>
                        <td>직접 매출</td>
                        <td class="amount">${safeIncomeData.directSupply.toLocaleString()}원</td>
                        <td class="amount">${safeIncomeData.directVat.toLocaleString()}원</td>
                        <td class="amount">${(safeIncomeData.directSupply + safeIncomeData.directVat).toLocaleString()}원</td>
                    </tr>
                    <tr style="font-weight: 600; background: var(--bg-secondary);">
                        <td>총 매출</td>
                        <td class="amount">${safeIncomeData.totalSupply.toLocaleString()}원</td>
                        <td class="amount">${safeIncomeData.totalVat.toLocaleString()}원</td>
                        <td class="amount">${safeIncomeData.totalIncome.toLocaleString()}원</td>
                    </tr>
                </tbody>
            </table>
        </div>
        
        <div class="vat-detail-section">
            <h5>📉 매입 세부 내역</h5>
            <table class="vat-detail-table">
                <thead>
                    <tr>
                        <th>구분</th>
                        <th>공급가액</th>
                        <th>부가세</th>
                        <th>매입세액공제</th>
                        <th>합계</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>일반 매입</td>
                        <td class="amount">${safeExpenseData.generalSupply.toLocaleString()}원</td>
                        <td class="amount">${safeExpenseData.generalVat.toLocaleString()}원</td>
                        <td class="amount">${safeExpenseData.generalVat.toLocaleString()}원</td>
                        <td class="amount">${(safeExpenseData.generalSupply + safeExpenseData.generalVat).toLocaleString()}원</td>
                    </tr>
                    <tr>
                        <td>간이과세자 매입</td>
                        <td class="amount">${safeExpenseData.simpleSupply.toLocaleString()}원</td>
                        <td class="amount">${safeExpenseData.simpleVat.toLocaleString()}원</td>
                        <td class="amount">0원</td>
                        <td class="amount">${(safeExpenseData.simpleSupply + safeExpenseData.simpleVat).toLocaleString()}원</td>
                    </tr>
                    <tr>
                        <td>세금계산서 없음</td>
                        <td class="amount">${safeExpenseData.noTaxSupply.toLocaleString()}원</td>
                        <td class="amount">0원</td>
                        <td class="amount">0원</td>
                        <td class="amount">${safeExpenseData.noTaxSupply.toLocaleString()}원</td>
                    </tr>
                    <tr style="font-weight: 600; background: var(--bg-secondary);">
                        <td>총 매입</td>
                        <td class="amount">${safeExpenseData.totalSupply.toLocaleString()}원</td>
                        <td class="amount">${safeExpenseData.totalVat.toLocaleString()}원</td>
                        <td class="amount">${safeExpenseData.deductibleVat.toLocaleString()}원</td>
                        <td class="amount">${safeExpenseData.totalExpense.toLocaleString()}원</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

// 부가세 납부액 시뮬레이션 설정
function setupVatSimulation() {
    const currentYear = new Date().getFullYear();
    const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
    
    // 현재 분기의 기존 데이터 자동 입력
    loadCurrentQuarterData(currentYear, currentQuarter);
}

// 현재 분기 데이터 로드
async function loadCurrentQuarterData(year, quarter) {
    try {
        const startMonth = (quarter - 1) * 3 + 1;
        const endMonth = quarter * 3;
        
        const [incomeData, expenseData] = await Promise.all([
            calculateIncomeFromEstimates(year, startMonth, endMonth),
            loadExpenseData(year, startMonth, endMonth)
        ]);
        
        // 시뮬레이션 입력란에 현재 데이터 표시
        document.getElementById('simIncomeAmount').value = incomeData.totalSupply;
        document.getElementById('simExpenseAmount').value = expenseData.totalSupply;
        
        // 자동 시뮬레이션 실행
        runVatSimulation();
        
    } catch (error) {
        console.error('현재 분기 데이터 로드 실패:', error);
    }
}

// 부가세 시뮬레이션 실행
function runVatSimulation() {
    const incomeAmount = parseInt(document.getElementById('simIncomeAmount').value) || 0;
    const expenseAmount = parseInt(document.getElementById('simExpenseAmount').value) || 0;
    
    // 부가세 계산 (10%)
    const incomeVat = incomeAmount * 0.1;
    const expenseVat = expenseAmount * 0.1;
    const vatToPay = incomeVat - expenseVat;
    
    const resultContainer = document.getElementById('simulationResult');
    if (!resultContainer) return;
    
    resultContainer.innerHTML = `
        <h5>시뮬레이션 결과</h5>
        
        <div class="simulation-result-grid">
            <div class="simulation-item">
                <div class="simulation-item-label">매출 공급가액</div>
                <div class="simulation-item-value">${incomeAmount.toLocaleString()}원</div>
            </div>
            <div class="simulation-item">
                <div class="simulation-item-label">매출세액</div>
                <div class="simulation-item-value">${incomeVat.toLocaleString()}원</div>
            </div>
            <div class="simulation-item">
                <div class="simulation-item-label">매입 공급가액</div>
                <div class="simulation-item-value">${expenseAmount.toLocaleString()}원</div>
            </div>
            <div class="simulation-item">
                <div class="simulation-item-label">매입세액</div>
                <div class="simulation-item-value">${expenseVat.toLocaleString()}원</div>
            </div>
        </div>
        
        <div class="simulation-final-amount">
            <div class="label">${vatToPay >= 0 ? '납부할 부가세' : '환급받을 부가세'}</div>
            <div class="amount">${Math.abs(vatToPay).toLocaleString()}원</div>
        </div>
        
        <div style="margin-top: 1.5rem; padding: 1rem; background: var(--bg-secondary); border-radius: var(--radius-md);">
            <h6 style="margin-bottom: 0.5rem;">💡 시뮬레이션 안내</h6>
            <ul style="margin: 0; padding-left: 1.5rem; font-size: 0.875rem; color: var(--text-secondary);">
                <li>실제 신고 시에는 세무사와 상담을 권장합니다</li>
                <li>간이과세자 매입분은 공제율이 다를 수 있습니다</li>
                <li>기타 공제 및 감면 사항은 포함되지 않았습니다</li>
            </ul>
        </div>
    `;
}

// 부가세 신고 일정 로드
function loadVatSchedule() {
    const currentYear = new Date().getFullYear();
    const scheduleContainer = document.getElementById('scheduleTimeline');
    const checklistContainer = document.getElementById('vatChecklist');
    
    if (scheduleContainer) {
        scheduleContainer.innerHTML = createVatScheduleItems(currentYear);
    }
    
    if (checklistContainer) {
        checklistContainer.innerHTML = createVatChecklist();
    }
}

// 부가세 신고 일정 아이템 생성
function createVatScheduleItems(year) {
    const quarters = [
        { quarter: 1, period: '1-3월', deadline: `${year}.04.25`, status: 'completed' },
        { quarter: 2, period: '4-6월', deadline: `${year}.07.25`, status: 'completed' },
        { quarter: 3, period: '7-9월', deadline: `${year}.10.25`, status: 'pending' },
        { quarter: 4, period: '10-12월', deadline: `${year + 1}.01.25`, status: 'pending' }
    ];
    
    const currentDate = new Date();
    const currentQuarter = Math.ceil((currentDate.getMonth() + 1) / 3);
    
    return quarters.map(item => {
        const isOverdue = item.quarter < currentQuarter && item.status === 'pending';
        const isCurrent = item.quarter === currentQuarter;
        const statusClass = isOverdue ? 'danger' : (isCurrent ? 'warning' : '');
        const statusBadge = isOverdue ? 'overdue' : (item.status === 'completed' ? 'completed' : 'pending');
        
        return `
            <div class="schedule-item ${statusClass}">
                <div class="schedule-date">${item.deadline}</div>
                <div class="schedule-content">
                    <div class="schedule-title">${year}년 ${item.quarter}분기 부가세 신고</div>
                    <div class="schedule-description">${item.period} 과세기간 부가세 신고 및 납부</div>
                </div>
                <div class="schedule-status">
                    <span class="schedule-status-badge ${statusBadge}">
                        ${statusBadge === 'completed' ? '완료' : statusBadge === 'overdue' ? '연체' : '대기'}
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

// 부가세 신고 체크리스트 생성
function createVatChecklist() {
    const checklistItems = [
        '매출 세금계산서 발행 완료',
        '매입 세금계산서 수취 완료',
        '현금영수증 및 신용카드 매출 집계',
        '세무 관련 증빙서류 정리',
        '전분기 이월세액 확인',
        '가산세 및 감면 사항 검토',
        '부가세 신고서 작성',
        '전자신고시스템 접속 확인',
        '납부 계좌 잔액 확인',
        '신고 및 납부 완료'
    ];
    
    return checklistItems.map((item, index) => `
        <div class="checklist-item">
            <input type="checkbox" class="checklist-checkbox" id="checklist-${index}">
            <label for="checklist-${index}" class="checklist-text">${item}</label>
        </div>
    `).join('');
}

// 부가세 분석 리포트 로드
async function loadVatAnalysis() {
    try {
        const currentYear = new Date().getFullYear();
        const analysisData = await generateVatAnalysisData(currentYear);
        
        createVatTrendChart(analysisData.trends);
        createVatBreakdownChart(analysisData.breakdown);
        createAnalysisSummary(analysisData.insights);
        
    } catch (error) {
        console.error('부가세 분석 로드 실패:', error);
        showNotification('부가세 분석을 불러오는데 실패했습니다.', 'error');
    }
}

// 부가세 분석 데이터 생성
async function generateVatAnalysisData(year) {
    const trends = [];
    const breakdown = { income: 0, expense: 0, tax: 0 };
    const insights = [];
    
    // 분기별 트렌드 데이터 생성
    for (let quarter = 1; quarter <= 4; quarter++) {
        const startMonth = (quarter - 1) * 3 + 1;
        const endMonth = quarter * 3;
        
        try {
            const [incomeData, expenseData] = await Promise.all([
                calculateIncomeFromEstimates(year, startMonth, endMonth),
                loadExpenseData(year, startMonth, endMonth)
            ]);
            
            const vatData = calculateVAT(incomeData, expenseData);
            
            trends.push({
                quarter: `${quarter}Q`,
                income: incomeData.totalVat,
                expense: expenseData.totalVat,
                tax: vatData.vatToPay
            });
            
            breakdown.income += incomeData.totalVat;
            breakdown.expense += expenseData.totalVat;
            breakdown.tax += vatData.vatToPay;
            
        } catch (error) {
            console.error(`${quarter}분기 데이터 로드 실패:`, error);
        }
    }
    
    // 인사이트 생성
    if (trends.length > 0) {
        const avgTax = breakdown.tax / trends.length;
        const maxTax = Math.max(...trends.map(t => t.tax));
        const minTax = Math.min(...trends.map(t => t.tax));
        
        insights.push({
            title: '평균 분기별 부가세',
            text: `연평균 분기별 부가세는 ${avgTax.toLocaleString()}원입니다.`
        });
        
        insights.push({
            title: '부가세 변동성',
            text: `최고 ${maxTax.toLocaleString()}원부터 최저 ${minTax.toLocaleString()}원까지 분기별 변동이 있습니다.`
        });
        
        if (breakdown.tax > 0) {
            insights.push({
                title: '연간 납부 예상액',
                text: `${year}년 연간 부가세 납부 예상액은 ${breakdown.tax.toLocaleString()}원입니다.`
            });
        }
    }
    
    return { trends, breakdown, insights };
}

// 부가세 트렌드 차트 생성
function createVatTrendChart(trends) {
    const canvas = document.getElementById('vatTrendChart');
    if (!canvas || !trends.length) return;
    
    // 간단한 차트 구현 (실제로는 Chart.js 등 라이브러리 사용 권장)
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // 배경 클리어
    ctx.clearRect(0, 0, width, height);
    
    // 차트 제목
    ctx.fillStyle = 'var(--text-primary)';
    ctx.font = '16px var(--font-family)';
    ctx.textAlign = 'center';
    ctx.fillText('분기별 부가세 추이', width / 2, 30);
    
    // 간단한 막대 차트
    const barWidth = width / (trends.length * 2);
    const maxValue = Math.max(...trends.map(t => Math.max(t.income, t.expense, t.tax)));
    
    trends.forEach((trend, index) => {
        const x = (index + 0.5) * (width / trends.length);
        const incomeHeight = (trend.income / maxValue) * (height - 80);
        const expenseHeight = (trend.expense / maxValue) * (height - 80);
        const taxHeight = (trend.tax / maxValue) * (height - 80);
        
        // 매출세액 (녹색)
        ctx.fillStyle = '#10b981';
        ctx.fillRect(x - barWidth * 1.5, height - 50 - incomeHeight, barWidth, incomeHeight);
        
        // 매입세액 (주황)
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(x - barWidth * 0.5, height - 50 - expenseHeight, barWidth, expenseHeight);
        
        // 납부세액 (파랑)
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(x + barWidth * 0.5, height - 50 - taxHeight, barWidth, taxHeight);
        
        // 분기 라벨
        ctx.fillStyle = 'var(--text-secondary)';
        ctx.font = '12px var(--font-family)';
        ctx.textAlign = 'center';
        ctx.fillText(trend.quarter, x, height - 20);
    });
}

// 부가세 구성 차트 생성
function createVatBreakdownChart(breakdown) {
    const canvas = document.getElementById('vatBreakdownChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // 배경 클리어
    ctx.clearRect(0, 0, width, height);
    
    // 차트 제목
    ctx.fillStyle = 'var(--text-primary)';
    ctx.font = '16px var(--font-family)';
    ctx.textAlign = 'center';
    ctx.fillText('연간 부가세 구성', width / 2, 30);
    
    // 간단한 도넛 차트
    const centerX = width / 2;
    const centerY = height / 2 + 10;
    const radius = Math.min(width, height) / 4;
    
    const total = breakdown.income + breakdown.expense + Math.abs(breakdown.tax);
    if (total === 0) return;
    
    let currentAngle = -Math.PI / 2;
    
    // 매출세액
    const incomeAngle = (breakdown.income / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + incomeAngle);
    ctx.lineTo(centerX, centerY);
    ctx.fillStyle = '#10b981';
    ctx.fill();
    currentAngle += incomeAngle;
    
    // 매입세액
    const expenseAngle = (breakdown.expense / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + expenseAngle);
    ctx.lineTo(centerX, centerY);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    currentAngle += expenseAngle;
    
    // 납부세액
    const taxAngle = (Math.abs(breakdown.tax) / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + taxAngle);
    ctx.lineTo(centerX, centerY);
    ctx.fillStyle = '#3b82f6';
    ctx.fill();
}

// 분석 요약 생성
function createAnalysisSummary(insights) {
    const summaryContainer = document.getElementById('analysisSummary');
    if (!summaryContainer) return;
    
    summaryContainer.innerHTML = `
        <h5>📊 부가세 분석 인사이트</h5>
        ${insights.map(insight => `
            <div class="analysis-insight">
                <div class="analysis-insight-title">${insight.title}</div>
                <div class="analysis-insight-text">${insight.text}</div>
            </div>
        `).join('')}
        
        <div style="margin-top: 2rem; padding: 1rem; background: var(--warning); color: white; border-radius: var(--radius-md);">
            <h6 style="margin-bottom: 0.5rem;">⚠️ 주의사항</h6>
            <p style="margin: 0; font-size: 0.875rem;">
                이 분석은 입력된 데이터를 기반으로 한 참고 자료입니다. 
                정확한 세무 신고를 위해서는 세무 전문가와 상담하시기 바랍니다.
            </p>
        </div>
    `;
}

// 부가세 데이터 내보내기
async function exportVatData(format) {
    try {
        const year = parseInt(document.getElementById('vatReportYear').value);
        const quarter = parseInt(document.getElementById('vatReportQuarter').value);
        const startMonth = (quarter - 1) * 3 + 1;
        const endMonth = quarter * 3;
        
        const [incomeData, expenseData] = await Promise.all([
            calculateIncomeFromEstimates(year, startMonth, endMonth),
            loadExpenseData(year, startMonth, endMonth)
        ]);
        
        if (format === 'excel') {
            exportToExcel(incomeData, expenseData, year, quarter);
        } else if (format === 'csv') {
            exportToCSV(incomeData, expenseData, year, quarter);
        }
        
    } catch (error) {
        console.error('데이터 내보내기 실패:', error);
        showNotification('데이터 내보내기에 실패했습니다.', 'error');
    }
}

// 엑셀로 내보내기
async function exportToExcel(incomeData, expenseData, year, quarter) {
    try {
        showLoadingSpinner(true);
        
        // 상세 데이터 로드
        const startMonth = (quarter - 1) * 3 + 1;
        const endMonth = quarter * 3;
        const [incomeDetails, expenseDetails] = await Promise.all([
            getIncomeDetailList(year, startMonth, endMonth),
            getExpenseDetailList(year, startMonth, endMonth)
        ]);
        
        // 부가세 계산
        const vatData = calculateVAT(incomeData, expenseData);
        
        // CSV 데이터 생성 (Excel로 열 수 있도록)
        const csvData = [];
        
        // 헤더 정보
        csvData.push([`부가세 신고서 - ${year}년 ${quarter}분기`]);
        csvData.push([]);
        
        // 요약 정보
        csvData.push(['구분', '공급가액', '부가세', '합계']);
        csvData.push(['매출세액', incomeData.totalSupply, incomeData.totalVat, incomeData.totalIncome]);
        csvData.push(['매입세액', expenseData.totalSupply, expenseData.totalVat, expenseData.totalExpense]);
        csvData.push(['매입세액공제', '', expenseData.deductibleVat, expenseData.deductibleVat]);
        csvData.push(['납부세액', '', '', vatData.vatToPay]);
        csvData.push([]);
        
        // 매출 상세 내역
        csvData.push(['매출 상세 내역']);
        csvData.push(['날짜', '거래처', '내용', '카테고리', '공급가액', '부가세', '합계']);
        incomeDetails.forEach(item => {
            csvData.push([
                new Date(item.date).toLocaleDateString('ko-KR'),
                item.client,
                item.description,
                item.category || '정비서비스',
                item.supplyAmount,
                item.vatAmount,
                item.totalAmount
            ]);
        });
        
        csvData.push([]);
        
        // 매입 상세 내역
        csvData.push(['매입 상세 내역']);
        csvData.push(['날짜', '거래처', '내용', '카테고리', '공급가액', '부가세', '합계', '세액공제']);
        expenseDetails.forEach(item => {
            csvData.push([
                new Date(item.date).toLocaleDateString('ko-KR'),
                item.vendor,
                item.description,
                item.category || '기타',
                item.supplyAmount,
                item.vatAmount,
                item.totalAmount,
                item.deductibleVat || item.vatAmount
            ]);
        });
        
        // CSV 파일 생성 (UTF-8 BOM 추가로 한글 지원)
        const csvContent = csvData.map(row => row.join(',')).join('\n');
        // UTF-8 BOM (Byte Order Mark) 추가 - Excel에서 한글이 제대로 표시됩니다
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `부가세신고서_상세내역_${year}년_${quarter}분기.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showLoadingSpinner(false);
        showNotification('Excel 호환 CSV 파일이 다운로드되었습니다.', 'success');
        
    } catch (error) {
        console.error('Excel 내보내기 실패:', error);
        showNotification('Excel 내보내기에 실패했습니다.', 'error');
        showLoadingSpinner(false);
    }
}

// CSV로 내보내기
function exportToCSV(incomeData, expenseData, year, quarter) {
    const csvData = [
        ['구분', '공급가액', '부가세', '합계'],
        ['매출세액', incomeData.totalSupply, incomeData.totalVat, incomeData.totalIncome],
        ['매입세액', expenseData.totalSupply, expenseData.totalVat, expenseData.totalExpense],
        ['납부세액', '', '', incomeData.totalVat - expenseData.totalVat]
    ];
    
    const csvContent = csvData.map(row => row.join(',')).join('\n');
    // UTF-8 BOM (Byte Order Mark) 추가 - Excel에서 한글이 제대로 표시됩니다
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `부가세신고서_${year}년_${quarter}분기.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('CSV 파일이 다운로드되었습니다.', 'success');
}

// 부가세 PDF 신고서 생성
async function generateVatPDF() {
    try {
        showLoadingSpinner(true);
        console.log('📊 부가세 신고서 PDF 생성 시작');
        
        // PDF 라이브러리 로딩 확인 (진행 상황 표시)
        checkPDFLibraryStatus();
        const isPdfReady = await waitForJsPDFLibrary(15000, true);
        if (!isPdfReady) {
            console.error('❌ 부가세 신고서 PDF 라이브러리 로딩 실패');
            showNotification('PDF 라이브러리 로딩 실패. 잠시 후 다시 시도해주세요.', 'error');
            showLoadingSpinner(false);
            
            // 수동 재시도 옵션 제공
            setTimeout(() => {
                const confirmed = confirm('PDF 라이브러리 로딩에 실패했습니다.\n다시 시도하시겠습니까?');
                if (confirmed) {
                    generateVatPDF(); // 재귀 호출로 재시도
                }
            }, 2000);
            return;
        }
        
        console.log('✅ 부가세 신고서 PDF 라이브러리 준비 완료');
        
        const year = parseInt(document.getElementById('vatReportYear').value);
        const quarter = parseInt(document.getElementById('vatReportQuarter').value);
        
        // 분기별 월 계산
        const startMonth = (quarter - 1) * 3 + 1;
        const endMonth = quarter * 3;
        
        console.log(`📄 ${year}년 ${quarter}분기 부가세 신고서 PDF 생성 중...`);
        showNotification('데이터 로딩 중...', 'info');
        
        // 매출 및 매입 데이터 로드
        const [incomeData, expenseData] = await Promise.all([
            calculateIncomeFromEstimates(year, startMonth, endMonth),
            loadExpenseData(year, startMonth, endMonth)
        ]);
        
        // 부가세 계산
        const vatData = calculateVAT(incomeData, expenseData);
        
        showNotification('PDF 생성 중...', 'info');
        
        // 🎨 HTML 방식으로 PDF 생성 (견적서 방식 적용 - 한글 문제 해결)
        await generateVatPDFFromHTML(year, quarter, startMonth, endMonth, incomeData, expenseData, vatData);
        
        showLoadingSpinner(false);
        showNotification('부가세 신고서 PDF가 생성되었습니다.', 'success');
        
    } catch (error) {
        console.error('PDF 생성 실패:', error);
        showNotification('PDF 생성에 실패했습니다.', 'error');
        showLoadingSpinner(false);
    }
}

// 월별 세무 리포트 PDF 생성
async function generateMonthlyTaxReport(year, month) {
    try {
        showLoadingSpinner(true);
        console.log(`📊 ${year}년 ${month}월 세무 리포트 PDF 생성 시작`);
        
        // PDF 라이브러리 로딩 확인 (진행 상황 표시)
        checkPDFLibraryStatus();
        const isPdfReady = await waitForJsPDFLibrary(15000, true);
        if (!isPdfReady) {
            console.error('❌ 월별 세무 리포트 PDF 라이브러리 로딩 실패');
            showNotification('PDF 라이브러리 로딩 실패. 잠시 후 다시 시도해주세요.', 'error');
            showLoadingSpinner(false);
            return;
        }
        
        console.log('✅ 월별 세무 리포트 PDF 라이브러리 준비 완료');
        
        console.log(`📄 ${year}년 ${month}월 세무 리포트 PDF 생성 중...`);
        showNotification('데이터 로딩 중...', 'info');
        
        // 월별 데이터 로드
        const [incomeData, expenseData] = await Promise.all([
            calculateIncomeFromEstimates(year, month, month),
            loadExpenseData(year, month, month)
        ]);
        
        // 부가세 계산
        const vatData = calculateVAT(incomeData, expenseData);
        
        showNotification('PDF 생성 중...', 'info');
        
        // PDF 생성
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        // 헤더 설정
        pdf.setFontSize(18);
        pdf.text('월별 세무 리포트', 105, 20, { align: 'center' });
        
        pdf.setFontSize(12);
        pdf.text(`${year}년 ${month}월`, 105, 30, { align: 'center' });
        
        // 요약 정보
        let yPos = 50;
        pdf.setFontSize(14);
        pdf.text('월별 손익 현황', 20, yPos);
        yPos += 15;
        
        pdf.setFontSize(10);
        pdf.text(`매출 총액: ${incomeData.totalIncome.toLocaleString()}원`, 25, yPos);
        yPos += 7;
        pdf.text(`매입 총액: ${expenseData.totalExpense.toLocaleString()}원`, 25, yPos);
        yPos += 7;
        pdf.text(`순손익: ${(incomeData.totalIncome - expenseData.totalExpense).toLocaleString()}원`, 25, yPos);
        yPos += 15;
        
        // 부가세 현황
        pdf.setFontSize(14);
        pdf.text('부가세 현황', 20, yPos);
        yPos += 15;
        
        pdf.setFontSize(10);
        pdf.text(`매출세액: ${incomeData.totalVat.toLocaleString()}원`, 25, yPos);
        yPos += 7;
        pdf.text(`매입세액공제: ${expenseData.deductibleVat.toLocaleString()}원`, 25, yPos);
        yPos += 7;
        pdf.text(`차감세액: ${vatData.vatToPay.toLocaleString()}원`, 25, yPos);
        yPos += 15;
        
        // 작성 정보
        yPos += 20;
        const today = new Date();
        pdf.setFontSize(8);
        pdf.text(`작성일: ${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`, 20, yPos);
        pdf.text('투훈스 가라지', 150, yPos);
        
        // PDF 저장
        pdf.save(`월별세무리포트_${year}년_${month}월.pdf`);
        
        showLoadingSpinner(false);
        showNotification(`${year}년 ${month}월 세무 리포트가 생성되었습니다.`, 'success');
        
    } catch (error) {
        console.error('월별 리포트 생성 실패:', error);
        showNotification('월별 리포트 생성에 실패했습니다.', 'error');
        showLoadingSpinner(false);
    }
}

// 분기별 세무 리포트 PDF 생성
async function generateQuarterlyTaxReport(year, quarter) {
    try {
        showLoadingSpinner(true);
        console.log(`📊 ${year}년 ${quarter}분기 세무 리포트 PDF 생성 시작`);
        
        // PDF 라이브러리 로딩 확인 (진행 상황 표시)
        checkPDFLibraryStatus();
        const isPdfReady = await waitForJsPDFLibrary(15000, true);
        if (!isPdfReady) {
            console.error('❌ 분기별 세무 리포트 PDF 라이브러리 로딩 실패');
            showNotification('PDF 라이브러리 로딩 실패. 잠시 후 다시 시도해주세요.', 'error');
            showLoadingSpinner(false);
            return;
        }
        
        console.log('✅ 분기별 세무 리포트 PDF 라이브러리 준비 완료');
        
        console.log(`📄 ${year}년 ${quarter}분기 세무 리포트 PDF 생성 중...`);
        showNotification('데이터 로딩 중...', 'info');
        
        // 분기별 월 계산
        const startMonth = (quarter - 1) * 3 + 1;
        const endMonth = quarter * 3;
        
        // 분기별 데이터 로드
        const [incomeData, expenseData] = await Promise.all([
            calculateIncomeFromEstimates(year, startMonth, endMonth),
            loadExpenseData(year, startMonth, endMonth)
        ]);
        
        // 부가세 계산
        const vatData = calculateVAT(incomeData, expenseData);
        
        showNotification('PDF 생성 중...', 'info');
        
        // PDF 생성
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        // 헤더 설정
        pdf.setFontSize(18);
        pdf.text('분기별 세무 리포트', 105, 20, { align: 'center' });
        
        pdf.setFontSize(12);
        pdf.text(`${year}년 ${quarter}분기 (${startMonth}월 ~ ${endMonth}월)`, 105, 30, { align: 'center' });
        
        // 요약 정보
        let yPos = 50;
        pdf.setFontSize(14);
        pdf.text('분기별 손익 현황', 20, yPos);
        yPos += 15;
        
        pdf.setFontSize(10);
        pdf.text(`매출 총액: ${incomeData.totalIncome.toLocaleString()}원`, 25, yPos);
        yPos += 7;
        pdf.text(`매입 총액: ${expenseData.totalExpense.toLocaleString()}원`, 25, yPos);
        yPos += 7;
        pdf.text(`순손익: ${(incomeData.totalIncome - expenseData.totalExpense).toLocaleString()}원`, 25, yPos);
        yPos += 15;
        
        // 부가세 현황
        pdf.setFontSize(14);
        pdf.text('부가세 현황', 20, yPos);
        yPos += 15;
        
        pdf.setFontSize(10);
        pdf.text(`매출세액: ${incomeData.totalVat.toLocaleString()}원`, 25, yPos);
        yPos += 7;
        pdf.text(`매입세액공제: ${expenseData.deductibleVat.toLocaleString()}원`, 25, yPos);
        yPos += 7;
        pdf.text(`차감세액: ${vatData.vatToPay.toLocaleString()}원`, 25, yPos);
        yPos += 15;
        
        // 작성 정보
        yPos += 20;
        const today = new Date();
        pdf.setFontSize(8);
        pdf.text(`작성일: ${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`, 20, yPos);
        pdf.text('투훈스 가라지', 150, yPos);
        
        // PDF 저장
        pdf.save(`분기별세무리포트_${year}년_${quarter}분기.pdf`);
        
        showLoadingSpinner(false);
        showNotification(`${year}년 ${quarter}분기 세무 리포트가 생성되었습니다.`, 'success');
        
    } catch (error) {
        console.error('분기별 리포트 생성 실패:', error);
        showNotification('분기별 리포트 생성에 실패했습니다.', 'error');
        showLoadingSpinner(false);
    }
}

// 연별 세무 리포트 PDF 생성
async function generateYearlyTaxReport(year) {
    try {
        showLoadingSpinner(true);
        console.log(`📊 ${year}년 연별 세무 리포트 PDF 생성 시작`);
        
        // PDF 라이브러리 로딩 확인 (진행 상황 표시)
        checkPDFLibraryStatus();
        const isPdfReady = await waitForJsPDFLibrary(15000, true);
        if (!isPdfReady) {
            console.error('❌ 연별 세무 리포트 PDF 라이브러리 로딩 실패');
            showNotification('PDF 라이브러리 로딩 실패. 잠시 후 다시 시도해주세요.', 'error');
            showLoadingSpinner(false);
            return;
        }
        
        console.log('✅ 연별 세무 리포트 PDF 라이브러리 준비 완료');
        
        console.log(`📄 ${year}년 연별 세무 리포트 PDF 생성 중...`);
        showNotification('데이터 로딩 중...', 'info');
        
        // 연별 데이터 로드
        const [incomeData, expenseData] = await Promise.all([
            calculateIncomeFromEstimates(year, 1, 12),
            loadExpenseData(year, 1, 12)
        ]);
        
        showNotification('PDF 생성 중...', 'info');
        
        // PDF 생성
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        // 헤더 설정
        pdf.setFontSize(18);
        pdf.text('연별 세무 리포트', 105, 20, { align: 'center' });
        
        pdf.setFontSize(12);
        pdf.text(`${year}년`, 105, 30, { align: 'center' });
        
        // 연간 요약
        let yPos = 50;
        pdf.setFontSize(14);
        pdf.text('연간 손익 현황', 20, yPos);
        yPos += 15;
        
        pdf.setFontSize(10);
        pdf.text(`매출 총액: ${incomeData.totalIncome.toLocaleString()}원`, 25, yPos);
        yPos += 7;
        pdf.text(`매입 총액: ${expenseData.totalExpense.toLocaleString()}원`, 25, yPos);
        yPos += 7;
        pdf.text(`순손익: ${(incomeData.totalIncome - expenseData.totalExpense).toLocaleString()}원`, 25, yPos);
        yPos += 15;
        
        // 작성 정보
        yPos += 20;
        const today = new Date();
        pdf.setFontSize(8);
        pdf.text(`작성일: ${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`, 20, yPos);
        pdf.text('투훈스 가라지', 150, yPos);
        
        // PDF 저장
        pdf.save(`연별세무리포트_${year}년.pdf`);
        
        showLoadingSpinner(false);
        showNotification(`${year}년 연별 세무 리포트가 생성되었습니다.`, 'success');
        
    } catch (error) {
        console.error('연별 리포트 생성 실패:', error);
        showNotification('연별 리포트 생성에 실패했습니다.', 'error');
        showLoadingSpinner(false);
    }
}

// 상세 내역 조회 함수들
async function getIncomeDetailList(year, startMonth, endMonth) {
    try {
        const incomeList = [];
        
        // 견적서 데이터
        let estimateQuery = db.collection('estimates')
            .where('status', '==', 'approved');
        
        if (isAdmin) {
            estimateQuery = estimateQuery.where('adminEmail', '==', currentUser.email);
        }
        
        const estimateSnapshot = await estimateQuery.get();
        estimateSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.approvedAt) {
                const approvedDate = new Date(data.approvedAt);
                if (approvedDate.getFullYear() === year && 
                    approvedDate.getMonth() + 1 >= startMonth && 
                    approvedDate.getMonth() + 1 <= endMonth) {
                    
                    incomeList.push({
                        date: data.approvedAt,
                        client: data.customerName || '고객',
                        description: data.title || '정비 서비스',
                        category: '정비서비스',
                        supplyAmount: data.supplyAmount || 0,
                        vatAmount: data.vatAmount || 0,
                        totalAmount: data.totalAmount || 0
                    });
                }
            }
        });
        
        // 직접 등록된 매출 데이터
        let incomeQuery = db.collection('income');
        if (isAdmin) {
            incomeQuery = incomeQuery.where('adminEmail', '==', currentUser.email);
        }
        
        const incomeSnapshot = await incomeQuery.get();
        incomeSnapshot.forEach(doc => {
            const data = doc.data();
            const incomeDate = new Date(data.date);
            if (incomeDate.getFullYear() === year && 
                incomeDate.getMonth() + 1 >= startMonth && 
                incomeDate.getMonth() + 1 <= endMonth) {
                
                incomeList.push({
                    date: data.date,
                    client: data.client || '고객',
                    description: data.description || '매출',
                    category: data.category || '기타',
                    supplyAmount: data.supplyAmount || 0,
                    vatAmount: data.vatAmount || 0,
                    totalAmount: data.totalAmount || 0
                });
            }
        });
        
        // 날짜순 정렬
        return incomeList.sort((a, b) => new Date(b.date) - new Date(a.date));
        
    } catch (error) {
        console.error('매출 상세 내역 조회 실패:', error);
        return [];
    }
}

async function getExpenseDetailList(year, startMonth, endMonth) {
    try {
        const expenseList = [];
        
        let expenseQuery = db.collection('expense');
        if (isAdmin) {
            expenseQuery = expenseQuery.where('adminEmail', '==', currentUser.email);
        }
        
        const expenseSnapshot = await expenseQuery.get();
        expenseSnapshot.forEach(doc => {
            const data = doc.data();
            const expenseDate = new Date(data.date);
            if (expenseDate.getFullYear() === year && 
                expenseDate.getMonth() + 1 >= startMonth && 
                expenseDate.getMonth() + 1 <= endMonth) {
                
                expenseList.push({
                    date: data.date,
                    vendor: data.vendor || '거래처',
                    description: data.description || '매입',
                    category: data.category || '기타',
                    supplyAmount: data.supplyAmount || 0,
                    vatAmount: data.vatAmount || 0,
                    totalAmount: data.totalAmount || 0,
                    deductibleVat: data.deductibleVat || 0
                });
            }
        });
        
        // 날짜순 정렬
        return expenseList.sort((a, b) => new Date(b.date) - new Date(a.date));
        
    } catch (error) {
        console.error('매입 상세 내역 조회 실패:', error);
        return [];
    }
}

// 유틸리티 함수들
function getVatFilingDeadline(year, quarter) {
    const deadlines = ['', '04.25', '07.25', '10.25', '01.25'];
    const deadlineYear = quarter === 4 ? year + 1 : year;
    return `${deadlineYear}.${deadlines[quarter]}`;
}

function getVatPaymentDeadline(year, quarter) {
    return getVatFilingDeadline(year, quarter); // 신고와 납부 기한이 동일
}

function getLastDayOfMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

function toggleCategoryView() {
    const categoryGrid = document.getElementById('categoryGrid');
    const toggleBtn = document.querySelector('.category-toggle i');
    
    if (categoryGrid.classList.contains('expanded')) {
        categoryGrid.classList.remove('expanded');
        toggleBtn.className = 'fas fa-expand-alt';
        showNotification('분류별 현황을 축소했습니다.', 'info');
    } else {
        categoryGrid.classList.add('expanded');
        toggleBtn.className = 'fas fa-compress-alt';
        showNotification('분류별 현황을 확장했습니다.', 'info');
    }
}

// 📊 분류 상세보기 모달
function showCategoryDetailModal(categoryName) {
    console.log('showCategoryDetailModal 시작:', categoryName);
    
    if (!isAdmin) {
        showNotification('관리자만 분류 상세보기에 접근할 수 있습니다.', 'error');
        return;
    }
    
    // 기존 모달이 있다면 제거
    const existingModal = document.getElementById('categoryDetailModal');
    if (existingModal) {
        existingModal.remove();
        console.log('기존 모달 제거됨');
    }
    
    const modalHTML = `
        <div class="modal-overlay active" id="categoryDetailModal" style="
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.5); z-index: 9999; display: flex; 
            align-items: center; justify-content: center; padding: 20px;
        ">
            <div class="modal-content" style="
                background: white; border-radius: 12px; max-width: 800px; 
                width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <div class="modal-header" style="
                    padding: 20px; border-bottom: 2px solid #e5e7eb; 
                    display: flex; justify-content: space-between; align-items: center;
                ">
                    <h3 style="margin: 0; color: #1f2937; font-size: 20px; font-weight: 700;">
                        <i class="fas fa-chart-pie"></i> ${categoryName} 상세보기
                    </h3>
                    <button onclick="closeCategoryDetailModal()" style="
                        background: none; border: none; font-size: 24px; 
                        color: #6b7280; cursor: pointer; padding: 0;
                    ">&times;</button>
                </div>
                
                <div class="modal-body" style="padding: 20px;">
                    <div id="categoryDetailContent">
                        <div style="text-align: center; padding: 40px;">
                            <div class="spinner" style="
                                width: 40px; height: 40px; border: 4px solid #f3f4f6; 
                                border-top: 4px solid #3b82f6; border-radius: 50%; 
                                animation: spin 1s linear infinite; margin: 0 auto 20px;
                            "></div>
                            <p>분류 데이터를 불러오는 중...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    console.log('모달 HTML 추가됨');
    
    // 모달이 실제로 DOM에 추가되었는지 확인
    const modal = document.getElementById('categoryDetailModal');
    if (modal) {
        console.log('모달 DOM 확인됨:', modal);
        modal.style.display = 'flex';
        modal.style.zIndex = '9999';
    } else {
        console.error('모달을 찾을 수 없습니다!');
        return;
    }
    
    // 다크 모드에서 모달 스타일 적용
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDarkMode) {
        const modalContent = document.querySelector('#categoryDetailModal .modal-content');
        const modalHeader = document.querySelector('#categoryDetailModal .modal-header');
        const modalBody = document.querySelector('#categoryDetailModal .modal-body');
        const title = document.querySelector('#categoryDetailModal h3');
        const closeBtn = document.querySelector('#categoryDetailModal button');
        const loadingText = document.querySelector('#categoryDetailModal p');
        
        if (modalContent) modalContent.style.background = '#1e293b';
        if (modalHeader) modalHeader.style.borderBottom = '2px solid #475569';
        if (modalBody) modalBody.style.color = '#f1f5f9';
        if (title) title.style.color = '#f8fafc';
        if (closeBtn) closeBtn.style.color = '#cbd5e1';
        if (loadingText) loadingText.style.color = '#cbd5e1';
    }
    
    // 분류 상세 데이터 로딩
    loadCategoryDetailData(categoryName);
    console.log('showCategoryDetailModal 완료');
}

// 📊 분류 상세 데이터 로딩
async function loadCategoryDetailData(categoryName) {
    console.log('loadCategoryDetailData 시작:', categoryName);
    
    try {
        const content = document.getElementById('categoryDetailContent');
        if (!content) {
            console.error('categoryDetailContent 요소를 찾을 수 없습니다');
            return;
        }
        
        console.log('데이터베이스 조회 시작...');
        
        // 매출 데이터 조회
        let incomeQuery = db.collection('income');
        if (isAdmin) {
            incomeQuery = incomeQuery.where('adminEmail', '==', currentUser.email);
            console.log('관리자 필터 적용:', currentUser.email);
        }
        const incomeSnapshot = await incomeQuery.get();
        console.log('매출 데이터 개수:', incomeSnapshot.size);
        
        // 경비 데이터 조회
        let expenseQuery = db.collection('expense');
        if (isAdmin) {
            expenseQuery = expenseQuery.where('adminEmail', '==', currentUser.email);
        }
        const expenseSnapshot = await expenseQuery.get();
        console.log('경비 데이터 개수:', expenseSnapshot.size);
        
        // 분류별 데이터 필터링
        const incomeData = [];
        const expenseData = [];
        
        console.log('분류별 데이터 필터링 시작...');
        
        incomeSnapshot.forEach(doc => {
            const data = doc.data();
            console.log('매출 데이터 확인:', data.category, 'vs', categoryName);
            if (data.category === categoryName) {
                incomeData.push({
                    id: doc.id,
                    ...data,
                    date: data.createdAt ? data.createdAt.toDate() : new Date(data.date)
                });
            }
        });
        
        expenseSnapshot.forEach(doc => {
            const data = doc.data();
            console.log('경비 데이터 확인:', data.category, 'vs', categoryName);
            if (data.category === categoryName) {
                expenseData.push({
                    id: doc.id,
                    ...data,
                    date: data.createdAt ? data.createdAt.toDate() : new Date(data.date)
                });
            }
        });
        
        console.log('필터링 결과:', {
            incomeData: incomeData.length,
            expenseData: expenseData.length,
            categoryName: categoryName
        });
        
        // 통계 계산
        const totalIncome = incomeData.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
        const totalExpense = expenseData.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
        const netAmount = totalIncome - totalExpense;
        
        // 날짜순 정렬
        const allTransactions = [...incomeData, ...expenseData].sort((a, b) => b.date - a.date);
        
        // UI 업데이트
        content.innerHTML = `
            <div style="margin-bottom: 24px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px;">
                    <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 16px; border-radius: 8px;">
                        <h4 style="margin: 0 0 8px 0; font-size: 14px; opacity: 0.9;">총 매출</h4>
                        <p style="margin: 0; font-size: 24px; font-weight: 700;">${totalIncome.toLocaleString()}원</p>
                    </div>
                    <div style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding: 16px; border-radius: 8px;">
                        <h4 style="margin: 0 0 8px 0; font-size: 14px; opacity: 0.9;">총 경비</h4>
                        <p style="margin: 0; font-size: 24px; font-weight: 700;">${totalExpense.toLocaleString()}원</p>
                    </div>
                    <div style="background: linear-gradient(135deg, ${netAmount >= 0 ? '#10b981' : '#ef4444'}, ${netAmount >= 0 ? '#059669' : '#dc2626'}); color: white; padding: 16px; border-radius: 8px;">
                        <h4 style="margin: 0 0 8px 0; font-size: 14px; opacity: 0.9;">순손익</h4>
                        <p style="margin: 0; font-size: 24px; font-weight: 700;">${netAmount.toLocaleString()}원</p>
                    </div>
                </div>
                
                <div style="background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 20px;">
                    <h4 style="margin: 0 0 8px 0; color: #374151; font-size: 16px;">
                        <i class="fas fa-list"></i> 거래 내역 (${allTransactions.length}건)
                    </h4>
                    <div style="max-height: 400px; overflow-y: auto;">
                        ${allTransactions.length > 0 ? allTransactions.map(tx => `
                            <div style="
                                display: flex; justify-content: space-between; align-items: center;
                                padding: 12px; background: white; border-radius: 6px; margin-bottom: 8px;
                                border-left: 4px solid ${tx.client ? '#10b981' : '#ef4444'};
                            ">
                                <div style="flex: 1;">
                                    <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">
                                        ${tx.client || tx.vendor} - ${tx.description}
                                    </div>
                                    <div style="font-size: 12px; color: #6b7280;">
                                        ${tx.date.toLocaleDateString('ko-KR')} | ${tx.category}
                                    </div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <div style="text-align: right;">
                                        <div style="font-weight: 700; color: ${tx.client ? '#10b981' : '#ef4444'};">
                                            ${tx.totalAmount.toLocaleString()}원
                                        </div>
                                        <div style="font-size: 12px; color: #6b7280;">
                                            ${tx.client ? '매출' : '경비'}
                                        </div>
                                    </div>
                                    <button onclick="editTransaction('${tx.id}', '${tx.client ? 'income' : 'expense'}')" style="
                                        background: #3b82f6; color: white; border: none; padding: 4px 8px;
                                        border-radius: 4px; font-size: 11px; cursor: pointer;
                                        transition: all 0.2s; display: flex; align-items: center; gap: 2px;
                                    " onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">
                                        <i class="fas fa-edit" style="font-size: 9px;"></i>
                                        수정
                                    </button>
                                </div>
                            </div>
                        `).join('') : '<p style="text-align: center; color: #6b7280; padding: 20px;">거래 내역이 없습니다.</p>'}
                    </div>
                </div>
            </div>
        `;
        
    } catch (error) {
        console.error('❌ 분류 상세 데이터 로딩 실패:', error);
        document.getElementById('categoryDetailContent').innerHTML = `
            <div style="text-align: center; padding: 40px; color: #ef4444;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i>
                <p>분류 데이터를 불러오는데 실패했습니다.</p>
                <button onclick="loadCategoryDetailData('${categoryName}')" style="
                    background: #3b82f6; color: white; border: none; padding: 8px 16px; 
                    border-radius: 6px; cursor: pointer; margin-top: 12px;
                ">다시 시도</button>
            </div>
        `;
    }
}

// 📊 분류 상세보기 모달 닫기
function closeCategoryDetailModal() {
    const modal = document.getElementById('categoryDetailModal');
    if (modal) {
        modal.remove();
    }
}

function showAllTransactions() {
    console.log('showAllTransactions 시작');
    
    if (!isAdmin) {
        showNotification('관리자만 전체 거래 내역에 접근할 수 있습니다.', 'error');
        return;
    }
    
    // 기존 모달이 있다면 제거
    const existingModal = document.getElementById('allTransactionsModal');
    if (existingModal) {
        existingModal.remove();
        console.log('기존 전체보기 모달 제거됨');
    }
    
    const modalHTML = `
        <div class="modal-overlay active" id="allTransactionsModal" style="
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.5); z-index: 9999; display: flex; 
            align-items: center; justify-content: center; padding: 20px;
        ">
            <div class="modal-content" style="
                background: white; border-radius: 12px; max-width: 1000px; 
                width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            ">
                <div class="modal-header" style="
                    padding: 20px; border-bottom: 2px solid #e5e7eb; 
                    display: flex; justify-content: space-between; align-items: center;
                ">
                    <h3 style="margin: 0; color: #1f2937; font-size: 20px; font-weight: 700;">
                        <i class="fas fa-list"></i> 전체 거래 내역
                    </h3>
                    <button onclick="closeAllTransactionsModal()" style="
                        background: none; border: none; font-size: 24px; 
                        color: #6b7280; cursor: pointer; padding: 0;
                    ">&times;</button>
                </div>
                
                <div class="modal-body" style="padding: 20px;">
                    <div style="margin-bottom: 20px;">
                        <div style="display: flex; gap: 12px; margin-bottom: 16px;">
                            <input type="text" id="transactionSearch" placeholder="거래 검색..." style="
                                flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; 
                                border-radius: 6px; font-size: 14px;
                            ">
                            <select id="transactionFilter" style="
                                padding: 8px 12px; border: 1px solid #d1d5db; 
                                border-radius: 6px; font-size: 14px;
                            ">
                                <option value="all">전체</option>
                                <option value="income">매출만</option>
                                <option value="expense">경비만</option>
                            </select>
                        </div>
                    </div>
                    
                    <div id="allTransactionsContent">
                        <div style="text-align: center; padding: 40px;">
                            <div class="spinner" style="
                                width: 40px; height: 40px; border: 4px solid #f3f4f6; 
                                border-top: 4px solid #3b82f6; border-radius: 50%; 
                                animation: spin 1s linear infinite; margin: 0 auto 20px;
                            "></div>
                            <p>거래 내역을 불러오는 중...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    console.log('전체보기 모달 HTML 추가됨');
    
    // 모달이 실제로 DOM에 추가되었는지 확인
    const modal = document.getElementById('allTransactionsModal');
    if (modal) {
        console.log('전체보기 모달 DOM 확인됨:', modal);
        modal.style.display = 'flex';
        modal.style.zIndex = '9999';
    } else {
        console.error('전체보기 모달을 찾을 수 없습니다!');
        return;
    }
    
    // 전체 거래 데이터 로딩
    loadAllTransactionsData();
    
    // 검색 및 필터 이벤트 리스너 추가
    setTimeout(() => {
        const searchInput = document.getElementById('transactionSearch');
        const filterSelect = document.getElementById('transactionFilter');
        
        if (searchInput) {
            searchInput.addEventListener('input', filterTransactions);
        }
        if (filterSelect) {
            filterSelect.addEventListener('change', filterTransactions);
        }
    }, 100);
    
    console.log('showAllTransactions 완료');
}

// 📊 전체 거래 데이터 로딩
async function loadAllTransactionsData() {
    try {
        const content = document.getElementById('allTransactionsContent');
        
        // 모든 거래 데이터 수집
        const allTransactions = [];
        
        // 1. 견적서 데이터 조회
        const estimateSnapshot = await db.collection('estimates').get();
        estimateSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.createdBy === currentUser.email) {
                allTransactions.push({
                    id: doc.id,
                    type: '매출',
                    description: `${data.customerName} - ${data.title}`,
                    amount: data.totalAmount || 0,
                    date: data.createdAt ? data.createdAt.toDate() : new Date(),
                    category: '견적서',
                    icon: 'fa-plus',
                    color: '#10b981',
                    timestamp: data.createdAt ? data.createdAt.toDate().getTime() : 0,
                    source: 'estimate'
                });
            }
        });
        
        // 2. 직접 입력 매출 데이터 조회
        const incomeSnapshot = await db.collection('income').get();
        incomeSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.adminEmail === currentUser.email) {
                const incomeDate = data.createdAt ? data.createdAt.toDate() : new Date(data.date);
                allTransactions.push({
                    id: doc.id,
                    type: '매출',
                    description: `${data.client} - ${data.description}`,
                    amount: data.totalAmount || 0,
                    date: incomeDate,
                    category: data.category || '기타',
                    icon: 'fa-plus',
                    color: '#10b981',
                    timestamp: incomeDate.getTime(),
                    source: 'income',
                    data: data
                });
            }
        });
        
        // 3. 경비 데이터 조회
        const expenseSnapshot = await db.collection('expense').get();
        expenseSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.adminEmail === currentUser.email) {
                const expenseDate = data.createdAt ? data.createdAt.toDate() : new Date(data.date);
                allTransactions.push({
                    id: doc.id,
                    type: '경비',
                    description: `${data.vendor} - ${data.description}`,
                    amount: data.totalAmount || 0,
                    date: expenseDate,
                    category: data.category || '기타',
                    icon: 'fa-minus',
                    color: '#ef4444',
                    timestamp: expenseDate.getTime(),
                    source: 'expense',
                    data: data
                });
            }
        });
        
        // 날짜순 정렬
        allTransactions.sort((a, b) => b.timestamp - a.timestamp);
        
        // 전역 변수에 저장 (필터링용)
        window.allTransactionsData = allTransactions;
        
        // UI 업데이트
        renderAllTransactions(allTransactions);
        
    } catch (error) {
        console.error('❌ 전체 거래 데이터 로딩 실패:', error);
        document.getElementById('allTransactionsContent').innerHTML = `
            <div style="text-align: center; padding: 40px; color: #ef4444;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 16px;"></i>
                <p>거래 내역을 불러오는데 실패했습니다.</p>
                <button onclick="loadAllTransactionsData()" style="
                    background: #3b82f6; color: white; border: none; padding: 8px 16px; 
                    border-radius: 6px; cursor: pointer; margin-top: 12px;
                ">다시 시도</button>
            </div>
        `;
    }
}

// 📊 전체 거래 렌더링
function renderAllTransactions(transactions) {
    const content = document.getElementById('allTransactionsContent');
    
    if (transactions.length === 0) {
        content.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6b7280;">
                <i class="fas fa-receipt" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;"></i>
                <p style="margin: 0; font-size: 16px;">거래 내역이 없습니다.</p>
            </div>
        `;
        return;
    }
    
    // 통계 계산
    const totalIncome = transactions.filter(t => t.type === '매출').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === '경비').reduce((sum, t) => sum + t.amount, 0);
    const netAmount = totalIncome - totalExpense;
    
    content.innerHTML = `
        <div style="margin-bottom: 20px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px;">
                <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 16px; border-radius: 8px;">
                    <h4 style="margin: 0 0 8px 0; font-size: 14px; opacity: 0.9;">총 매출</h4>
                    <p style="margin: 0; font-size: 20px; font-weight: 700;">${totalIncome.toLocaleString()}원</p>
                </div>
                <div style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding: 16px; border-radius: 8px;">
                    <h4 style="margin: 0 0 8px 0; font-size: 14px; opacity: 0.9;">총 경비</h4>
                    <p style="margin: 0; font-size: 20px; font-weight: 700;">${totalExpense.toLocaleString()}원</p>
                </div>
                <div style="background: linear-gradient(135deg, ${netAmount >= 0 ? '#10b981' : '#ef4444'}, ${netAmount >= 0 ? '#059669' : '#dc2626'}); color: white; padding: 16px; border-radius: 8px;">
                    <h4 style="margin: 0 0 8px 0; font-size: 14px; opacity: 0.9;">순손익</h4>
                    <p style="margin: 0; font-size: 20px; font-weight: 700;">${netAmount.toLocaleString()}원</p>
                </div>
            </div>
        </div>
        
        <div style="max-height: 500px; overflow-y: auto;">
            ${transactions.map(tx => `
                <div class="transaction-item" style="
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 16px; background: white; border-radius: 8px; margin-bottom: 12px;
                    border-left: 4px solid ${tx.color}; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    transition: all 0.2s;
                " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <div style="
                                width: 24px; height: 24px; background: ${tx.color}; 
                                border-radius: 50%; display: flex; align-items: center; 
                                justify-content: center; color: white; font-size: 12px;
                            ">
                                <i class="fas ${tx.icon}"></i>
                            </div>
                            <div style="font-weight: 600; color: #1f2937; font-size: 14px;">
                                ${tx.description}
                            </div>
                            <span style="
                                font-size: 11px; padding: 2px 6px; border-radius: 10px; 
                                background: ${tx.color}20; color: ${tx.color}; font-weight: 600;
                            ">${tx.category}</span>
                        </div>
                        <div style="font-size: 12px; color: #6b7280;">
                            ${tx.date.toLocaleDateString('ko-KR')} | ${tx.type}
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="text-align: right;">
                            <div style="font-weight: 700; color: ${tx.color}; font-size: 16px;">
                                ${tx.amount.toLocaleString()}원
                            </div>
                            <div style="font-size: 11px; color: #6b7280;">
                                ${tx.source === 'estimate' ? '견적서' : tx.source === 'income' ? '직접입력' : '경비'}
                            </div>
                        </div>
                        <button onclick="editTransaction('${tx.id}', '${tx.source}')" style="
                            background: #3b82f6; color: white; border: none; padding: 6px 12px;
                            border-radius: 6px; font-size: 12px; cursor: pointer;
                            transition: all 0.2s; display: flex; align-items: center; gap: 4px;
                        " onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">
                            <i class="fas fa-edit" style="font-size: 10px;"></i>
                            수정
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// 🔍 거래 필터링
function filterTransactions() {
    const searchTerm = document.getElementById('transactionSearch')?.value?.toLowerCase() || '';
    const filterType = document.getElementById('transactionFilter')?.value || 'all';
    
    if (!window.allTransactionsData) return;
    
    let filteredTransactions = window.allTransactionsData;
    
    // 타입 필터링
    if (filterType !== 'all') {
        filteredTransactions = filteredTransactions.filter(tx => {
            if (filterType === 'income') return tx.type === '매출';
            if (filterType === 'expense') return tx.type === '경비';
            return true;
        });
    }
    
    // 검색어 필터링
    if (searchTerm) {
        filteredTransactions = filteredTransactions.filter(tx => 
            tx.description.toLowerCase().includes(searchTerm) ||
            tx.category.toLowerCase().includes(searchTerm)
        );
    }
    
    renderAllTransactions(filteredTransactions);
}

// ✏️ 거래 수정
async function editTransaction(transactionId, source) {
    if (!isAdmin) {
        showNotification('관리자만 거래를 수정할 수 있습니다.', 'error');
        return;
    }
    
    try {
        if (source === 'income') {
            // 매출 수정
            const doc = await db.collection('income').doc(transactionId).get();
            if (doc.exists) {
                const data = doc.data();
                showIncomeModal();
                
                // 폼에 기존 데이터 채우기
                setTimeout(() => {
                    document.getElementById('incomeDate').value = data.date;
                    document.getElementById('incomeClient').value = data.client || '';
                    document.getElementById('incomeDescription').value = data.description || '';
                    document.getElementById('incomeCategory').value = data.category || '';
                    document.getElementById('incomeSupplyAmount').value = data.supplyAmount || '';
                    document.getElementById('incomeMemo').value = data.memo || '';
                    
                    // 수정 모드 설정
                    window.editingIncomeId = transactionId;
                    
                    // 제출 버튼 변경
                    const submitBtn = document.querySelector('#incomeModal button[type="submit"]');
                    if (submitBtn) {
                        submitBtn.innerHTML = '<i class="fas fa-save"></i> 수정';
                        submitBtn.onclick = updateIncomeData;
                    }
                }, 100);
            }
        } else if (source === 'expense') {
            // 경비 수정
            const doc = await db.collection('expense').doc(transactionId).get();
            if (doc.exists) {
                const data = doc.data();
                showExpenseModal();
                
                // 폼에 기존 데이터 채우기
                setTimeout(() => {
                    document.getElementById('expenseDate').value = data.date;
                    document.getElementById('expenseVendor').value = data.vendor || '';
                    document.getElementById('expenseDescription').value = data.description || '';
                    document.getElementById('expenseCategory').value = data.category || '';
                    document.getElementById('expenseSupplyAmount').value = data.supplyAmount || '';
                    document.getElementById('expenseVatType').value = data.vatType || 'vat';
                    document.getElementById('expenseProof').value = data.proof || 'receipt';
                    document.getElementById('expenseMemo').value = data.memo || '';
                    
                    // 수정 모드 설정
                    window.editingExpenseId = transactionId;
                    
                    // 제출 버튼 변경
                    const submitBtn = document.querySelector('#expenseModal button[type="submit"]');
                    if (submitBtn) {
                        submitBtn.innerHTML = '<i class="fas fa-save"></i> 수정';
                        submitBtn.onclick = updateExpenseData;
                    }
                }, 100);
            }
        } else if (source === 'estimate') {
            // 견적서 수정
            const doc = await db.collection('estimates').doc(transactionId).get();
            if (doc.exists) {
                const data = doc.data();
                showEstimateModal();
                
                // 폼에 기존 데이터 채우기
                setTimeout(() => {
                    console.log('견적서 수정 데이터:', data);
                    
                    // 기본 정보 채우기
                    document.getElementById('estimateCarNumber').value = data.carNumber || '';
                    document.getElementById('estimateCustomerName').value = data.customerName || '';
                    document.getElementById('estimateBikeModel').value = data.bikeModel || '';
                    document.getElementById('estimateBikeYear').value = data.bikeYear || '';
                    document.getElementById('estimateMileage').value = data.mileage || '';
                    document.getElementById('estimateTitle').value = data.title || '';
                    document.getElementById('estimateNotes').value = data.notes || '';
                    
                    // 견적 항목 채우기
                    if (data.items && data.items.length > 0) {
                        // 기존 항목들 제거
                        const itemsContainer = document.getElementById('estimateItems');
                        itemsContainer.innerHTML = '';
                        
                        // 데이터의 항목들로 새로 생성
                        data.items.forEach((item, index) => {
                            if (index === 0) {
                                // 첫 번째 항목은 기존 항목 수정
                                const firstItem = itemsContainer.querySelector('.estimate-item-card');
                                if (firstItem) {
                                    firstItem.querySelector('.item-name').value = item.name || '';
                                    firstItem.querySelector('.item-price').value = item.price || '';
                                    firstItem.querySelector('.item-quantity').value = item.quantity || 1;
                                }
                            } else {
                                // 추가 항목들 생성
                                addEstimateItem();
                                const newItem = itemsContainer.lastElementChild;
                                newItem.querySelector('.item-name').value = item.name || '';
                                newItem.querySelector('.item-price').value = item.price || '';
                                newItem.querySelector('.item-quantity').value = item.quantity || 1;
                            }
                        });
                        
                        // 총액 계산
                        calculateTotal();
                    }
                    
                    // 수정 모드 설정
                    window.editingEstimateNumber = transactionId;
                    
                    // 제출 버튼 변경
                    const submitBtn = document.querySelector('#estimateModal button[type="submit"]');
                    if (submitBtn) {
                        submitBtn.innerHTML = '<i class="fas fa-save"></i> 수정';
                        submitBtn.onclick = updateEstimate;
                    }
                    
                    // 모달 제목 변경
                    const modalTitle = document.querySelector('#estimateModal .modal-title');
                    if (modalTitle) {
                        modalTitle.innerHTML = '<i class="fas fa-file-invoice-dollar"></i> 견적서 수정';
                    }
                }, 100);
            }
        } else {
            showNotification('알 수 없는 거래 유형입니다.', 'error');
        }
        
    } catch (error) {
        console.error('❌ 거래 수정 실패:', error);
        showNotification('거래 수정 중 오류가 발생했습니다.', 'error');
    }
}

// 📊 전체 거래 모달 닫기
function closeAllTransactionsModal() {
    const modal = document.getElementById('allTransactionsModal');
    if (modal) {
        modal.remove();
    }
}

// 세무 리포트 옵션 모달
async function showTaxReportOptions() {
    console.log('🎯 showTaxReportOptions 함수 호출됨');
    console.log('🔍 현재 상태 확인:');
    console.log('  - currentUser:', currentUser);
    console.log('  - isAdmin:', isAdmin);
    console.log('  - ADMIN_EMAILS:', ADMIN_EMAILS);
    
    if (currentUser && currentUser.email) {
        console.log('  - 현재 사용자 이메일:', currentUser.email);
        console.log('  - 관리자 이메일 포함 여부:', ADMIN_EMAILS.includes(currentUser.email));
    }
    
    // 관리자 권한 확인 및 자동 수정
    const hasAdminAccess = verifyAndFixAdminStatus();
    if (!hasAdminAccess) {
        console.log('❌ 관리자 권한 없음');
        console.log('🔧 가능한 해결책:');
        console.log('  1. 관리자 이메일로 로그인하세요:', ADMIN_EMAILS);
        console.log('  2. 또는 브라우저 콘솔에서 setupAdminUser() 실행');
        showNotification('관리자만 접근할 수 있습니다.', 'error');
        return;
    }
    
    console.log('✅ 관리자 권한 확인됨');
    
    // PDF 라이브러리 로딩 확인 (상세한 진행 상황 표시)
    console.log('📊 PDF 라이브러리 상태 확인 중...');
    checkPDFLibraryStatus();
    
    showNotification('세무 리포트 준비 중...', 'info');
    const isPdfReady = await waitForJsPDFLibrary(15000, true);
    if (!isPdfReady) {
        console.error('❌ 세무 리포트용 PDF 라이브러리 로딩 실패');
        
        // 사용자에게 재시도 옵션 제공
        const retryButton = `
            <div style="margin-top: 10px;">
                <button onclick="showTaxReportOptions()" style="
                    background: #3b82f6; 
                    color: white; 
                    border: none; 
                    padding: 8px 16px; 
                    border-radius: 6px; 
                    cursor: pointer;
                    margin-right: 8px;
                ">다시 시도</button>
                <button onclick="location.reload()" style="
                    background: #6b7280; 
                    color: white; 
                    border: none; 
                    padding: 8px 16px; 
                    border-radius: 6px; 
                    cursor: pointer;
                ">페이지 새로고침</button>
            </div>
        `;
        
                 showNotification('PDF 라이브러리 로딩 실패. 인터넷 연결을 확인하고 다시 시도해주세요.' + retryButton, 'error');
         
         // 5초 후 도움말 자동 표시
         setTimeout(() => {
             console.log('🆘 PDF 라이브러리 문제 해결 도움말 자동 표시');
             showPDFLibraryHelp();
         }, 5000);
         
         return;
    }
    
    console.log('✅ 세무 리포트용 PDF 라이브러리 준비 완료');
    
    // 기존 모달 제거
    const existingModal = document.querySelector('.modal-overlay');
    if (existingModal) {
        console.log('🗑️ 기존 모달 제거');
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <h2 class="modal-title">
                    <i class="fas fa-download"></i>
                    세무 리포트 생성
                </h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="report-options">
                    <div class="report-option">
                        <h3>월별 세무 리포트</h3>
                        <p>특정 월의 세무 현황을 PDF로 생성합니다.</p>
                        <div class="form-row">
                            <select id="monthlyYear" class="form-control">
                                <option value="2024">2024년</option>
                                <option value="2023">2023년</option>
                            </select>
                            <select id="monthlyMonth" class="form-control">
                                <option value="1">1월</option>
                                <option value="2">2월</option>
                                <option value="3">3월</option>
                                <option value="4">4월</option>
                                <option value="5">5월</option>
                                <option value="6">6월</option>
                                <option value="7">7월</option>
                                <option value="8">8월</option>
                                <option value="9">9월</option>
                                <option value="10">10월</option>
                                <option value="11">11월</option>
                                <option value="12">12월</option>
                            </select>
                            <button class="btn btn-primary" onclick="generateMonthlyReport()">월별 리포트 생성</button>
                        </div>
                    </div>
                    
                    <div class="report-option">
                        <h3>분기별 세무 리포트</h3>
                        <p>특정 분기의 세무 현황을 PDF로 생성합니다.</p>
                        <div class="form-row">
                            <select id="quarterlyYear" class="form-control">
                                <option value="2024">2024년</option>
                                <option value="2023">2023년</option>
                            </select>
                            <select id="quarterlyQuarter" class="form-control">
                                <option value="1">1분기</option>
                                <option value="2">2분기</option>
                                <option value="3">3분기</option>
                                <option value="4">4분기</option>
                            </select>
                            <button class="btn btn-primary" onclick="generateQuarterlyReport()">분기별 리포트 생성</button>
                        </div>
                    </div>
                    
                    <div class="report-option">
                        <h3>연별 세무 리포트</h3>
                        <p>특정 연도의 세무 현황을 PDF로 생성합니다.</p>
                        <div class="form-row">
                            <select id="yearlyYear" class="form-control">
                                <option value="2024">2024년</option>
                                <option value="2023">2023년</option>
                            </select>
                            <button class="btn btn-primary" onclick="generateYearlyReport()">연별 리포트 생성</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    console.log('✅ 모달 HTML 생성 완료');
    
    // 모달 스타일 강제 적용
    modal.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: rgba(0, 0, 0, 0.8) !important;
        z-index: 9999 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
    `;
    
    // 모달 컨테이너 스타일도 강제 적용
    const modalContainer = modal.querySelector('.modal-container');
    if (modalContainer) {
        modalContainer.style.cssText = `
            background: white !important;
            border-radius: 12px !important;
            padding: 24px !important;
            max-width: 800px !important;
            width: 90% !important;
            max-height: 80% !important;
            overflow-y: auto !important;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1) !important;
        `;
    }
    
    console.log('✅ 모달 스타일 적용 완료');
    
    document.body.appendChild(modal);
    console.log('✅ 모달 DOM 추가 완료');
    
    // 모달이 실제로 추가되었는지 확인
    const addedModal = document.querySelector('.modal-overlay');
    console.log('🔍 추가된 모달 확인:', addedModal);
    
    // 현재 날짜 기준으로 기본값 설정
    setTimeout(() => {
        try {
            const now = new Date();
            const monthlyYear = document.getElementById('monthlyYear');
            if (monthlyYear) {
                monthlyYear.value = now.getFullYear();
                console.log('✅ 기본값 설정 완료');
            } else {
                console.error('❌ monthlyYear 요소를 찾을 수 없음');
            }
            
            // 다른 기본값들도 설정
            const monthlyMonth = document.getElementById('monthlyMonth');
            const quarterlyYear = document.getElementById('quarterlyYear');
            const quarterlyQuarter = document.getElementById('quarterlyQuarter');
            const yearlyYear = document.getElementById('yearlyYear');
            
            if (monthlyMonth) monthlyMonth.value = now.getMonth() + 1;
            if (quarterlyYear) quarterlyYear.value = now.getFullYear();
            if (quarterlyQuarter) quarterlyQuarter.value = Math.ceil((now.getMonth() + 1) / 3);
            if (yearlyYear) yearlyYear.value = now.getFullYear();
            
        } catch (error) {
            console.error('❌ 기본값 설정 실패:', error);
        }
    }, 100);
    
    console.log('🎉 showTaxReportOptions 함수 완료');
}

function generateMonthlyReport() {
    const year = parseInt(document.getElementById('monthlyYear').value);
    const month = parseInt(document.getElementById('monthlyMonth').value);
    generateMonthlyTaxReport(year, month);
    document.querySelector('.modal-overlay').remove();
}

function generateQuarterlyReport() {
    const year = parseInt(document.getElementById('quarterlyYear').value);
    const quarter = parseInt(document.getElementById('quarterlyQuarter').value);
    generateQuarterlyTaxReport(year, quarter);
    document.querySelector('.modal-overlay').remove();
}

function generateYearlyReport() {
    const year = parseInt(document.getElementById('yearlyYear').value);
    generateYearlyTaxReport(year);
    document.querySelector('.modal-overlay').remove();
}

// ===============================================
// 초보자 도움말 시스템 - Beginner Help System
// ===============================================

// 세무 도움말 센터 열기
function showTaxHelpCenter() {
    const modal = document.getElementById('taxHelpModal');
    if (modal) {
        modal.classList.add('active');
        // 기본 탭을 가이드로 설정
        showHelpTab('guide');
    }
}

// 세무 도움말 센터 닫기
function closeTaxHelpModal() {
    const modal = document.getElementById('taxHelpModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// 도움말 탭 전환
function showHelpTab(tabName) {
    // 모든 탭 버튼 비활성화
    document.querySelectorAll('.help-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 모든 탭 컨텐츠 숨김
    document.querySelectorAll('.help-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // 선택된 탭 활성화
    const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
    const activeContent = document.getElementById(`${tabName}Tab`);
    
    if (activeTab) activeTab.classList.add('active');
    if (activeContent) activeContent.classList.add('active');
}

// FAQ 토글
function toggleFAQ(questionElement) {
    const faqItem = questionElement.parentElement;
    const answer = faqItem.querySelector('.faq-answer');
    const chevron = questionElement.querySelector('i');
    
    // 다른 FAQ 항목들 닫기
    document.querySelectorAll('.faq-item').forEach(item => {
        if (item !== faqItem) {
            item.classList.remove('active');
            const otherAnswer = item.querySelector('.faq-answer');
            const otherChevron = item.querySelector('.faq-question i');
            if (otherAnswer) otherAnswer.style.display = 'none';
            if (otherChevron) {
                otherChevron.classList.remove('fa-chevron-down');
                otherChevron.classList.add('fa-chevron-right');
            }
        }
    });
    
    // 현재 FAQ 토글
    if (faqItem.classList.contains('active')) {
        faqItem.classList.remove('active');
        answer.style.display = 'none';
        chevron.classList.remove('fa-chevron-down');
        chevron.classList.add('fa-chevron-right');
    } else {
        faqItem.classList.add('active');
        answer.style.display = 'block';
        chevron.classList.remove('fa-chevron-right');
        chevron.classList.add('fa-chevron-down');
    }
}

// 초보자 모드 변수
let beginnerMode = localStorage.getItem('beginnerMode') === 'true';

// 초보자 모드 활성화
function enableBeginnerMode() {
    beginnerMode = true;
    localStorage.setItem('beginnerMode', 'true');
    
    // 도움말 모달 닫기
    closeTaxHelpModal();
    
    // 초보자 모드 UI 적용
    applyBeginnerMode();
    
    showNotification('🎓 초보자 모드가 활성화되었습니다! 더 자세한 설명과 도움말을 제공합니다.', 'success');
}

// 초보자 모드 비활성화
function disableBeginnerMode() {
    beginnerMode = false;
    localStorage.setItem('beginnerMode', 'false');
    
    // 초보자 모드 UI 제거
    removeBeginnerMode();
    
    showNotification('초보자 모드가 비활성화되었습니다.', 'info');
}

// 초보자 모드 UI 적용
function applyBeginnerMode() {
    // 도움말 버튼 스타일 변경
    const helpBtn = document.querySelector('.help-toggle-btn');
    if (helpBtn) {
        helpBtn.classList.add('beginner-active');
        helpBtn.title = '초보자 모드 활성화됨 (클릭하여 도움말 보기)';
    }
    
    // 매출/경비 등록 버튼에 상세 설명 추가
    addBeginnerTooltips();
    
    // 초보자 모드 표시
    showBeginnerModeIndicator();
}

// 초보자 모드 UI 제거
function removeBeginnerMode() {
    const helpBtn = document.querySelector('.help-toggle-btn');
    if (helpBtn) {
        helpBtn.classList.remove('beginner-active');
        helpBtn.title = '세무 도움말';
    }
    
    // 툴팁 제거
    removeBeginnerTooltips();
    
    // 초보자 모드 표시 제거
    hideBeginnerModeIndicator();
}

// 초보자 모드 표시
function showBeginnerModeIndicator() {
    // 기존 표시기 제거
    const existingIndicator = document.querySelector('.beginner-mode-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // 새 표시기 생성
    const indicator = document.createElement('div');
    indicator.className = 'beginner-mode-indicator';
    indicator.innerHTML = `
        <div class="beginner-indicator-content">
            <i class="fas fa-graduation-cap"></i>
            <span>초보자 모드</span>
            <button onclick="disableBeginnerMode()" title="초보자 모드 끄기">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(indicator);
}

// 초보자 모드 표시 제거
function hideBeginnerModeIndicator() {
    const indicator = document.querySelector('.beginner-mode-indicator');
    if (indicator) {
        indicator.remove();
    }
}

// 초보자 툴팁 추가
function addBeginnerTooltips() {
    // 매출 등록 버튼
    const incomeBtn = document.querySelector('[onclick="showIncomeModal()"]');
    if (incomeBtn && !incomeBtn.hasAttribute('data-beginner-tooltip')) {
        incomeBtn.setAttribute('data-beginner-tooltip', '고객에게 제공한 서비스나 판매한 상품의 수입을 기록합니다. 견적서 시스템에서 자동으로 생성되거나 직접 입력할 수 있습니다.');
        incomeBtn.setAttribute('data-beginner-added', 'true');
    }
    
    // 경비 등록 버튼
    const expenseBtn = document.querySelector('[onclick="showExpenseModal()"]');
    if (expenseBtn && !expenseBtn.hasAttribute('data-beginner-tooltip')) {
        expenseBtn.setAttribute('data-beginner-tooltip', '사업을 위해 지출한 비용을 기록합니다. 부품 구매, 공구 구입, 임대료, 전기료 등이 포함됩니다. 세금계산서가 있으면 매입세액공제를 받을 수 있습니다.');
        expenseBtn.setAttribute('data-beginner-added', 'true');
    }
    
    // 급여 관리 버튼
    const salaryBtn = document.querySelector('[onclick="showSalaryModal()"]');
    console.log('💰 급여 관리 버튼 찾기:', salaryBtn);
    
    if (salaryBtn && !salaryBtn.hasAttribute('data-beginner-tooltip')) {
        salaryBtn.setAttribute('data-beginner-tooltip', '직원의 급여와 4대보험(국민연금, 건강보험, 고용보험, 산재보험)을 관리합니다. 급여 계산 시 자동으로 세금과 보험료가 계산됩니다.');
        salaryBtn.setAttribute('data-beginner-added', 'true');
        
        // 클릭 이벤트 리스너 추가 (기존 onclick과 함께)
        if (!salaryBtn.hasAttribute('data-click-listener')) {
            salaryBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('💰 급여 관리 버튼 클릭됨');
                showSalaryModal();
            });
            salaryBtn.setAttribute('data-click-listener', 'true');
        }
    }
    
    // 부가세 신고 버튼
    const vatBtn = document.querySelector('[onclick="showTaxReport()"]');
    if (vatBtn && !vatBtn.hasAttribute('data-beginner-tooltip')) {
        vatBtn.setAttribute('data-beginner-tooltip', '분기별 부가세 신고서를 작성하고 납부세액을 계산합니다. 매출세액에서 매입세액공제를 차감한 금액을 납부하게 됩니다.');
        vatBtn.setAttribute('data-beginner-added', 'true');
    }
    
    // 툴팁 이벤트 리스너 추가
    document.querySelectorAll('[data-beginner-tooltip]').forEach(element => {
        if (!element.hasAttribute('data-tooltip-listener')) {
            element.addEventListener('mouseenter', showBeginnerTooltip);
            element.addEventListener('mouseleave', hideBeginnerTooltip);
            element.setAttribute('data-tooltip-listener', 'true');
        }
    });
}

// 초보자 툴팁 제거
function removeBeginnerTooltips() {
    document.querySelectorAll('[data-beginner-added="true"]').forEach(element => {
        element.removeAttribute('data-beginner-tooltip');
        element.removeAttribute('data-beginner-added');
        element.removeAttribute('data-tooltip-listener');
        element.removeEventListener('mouseenter', showBeginnerTooltip);
        element.removeEventListener('mouseleave', hideBeginnerTooltip);
    });
    
    // 툴팁 엘리먼트 제거
    const tooltip = document.querySelector('.beginner-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

// 초보자 툴팁 표시
function showBeginnerTooltip(event) {
    if (!beginnerMode) return;
    
    const element = event.target.closest('[data-beginner-tooltip]');
    if (!element) return;
    
    const tooltipText = element.getAttribute('data-beginner-tooltip');
    
    // 기존 툴팁 제거
    hideBeginnerTooltip();
    
    // 새 툴팁 생성
    const tooltip = document.createElement('div');
    tooltip.className = 'beginner-tooltip';
    tooltip.innerHTML = `
        <div class="tooltip-content">
            <div class="tooltip-header">
                <i class="fas fa-lightbulb"></i>
                <span>도움말</span>
            </div>
            <div class="tooltip-text">${tooltipText}</div>
        </div>
    `;
    
    document.body.appendChild(tooltip);
    
    // 위치 조정
    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let top = rect.top - tooltipRect.height - 10;
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    
    // 화면 경계 조정
    if (top < 10) {
        top = rect.bottom + 10;
        tooltip.classList.add('below');
    }
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }
    
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    
    // 애니메이션
    setTimeout(() => {
        tooltip.classList.add('show');
    }, 10);
}

// 초보자 툴팁 숨김
function hideBeginnerTooltip() {
    const tooltip = document.querySelector('.beginner-tooltip');
    if (tooltip) {
        tooltip.classList.remove('show');
        setTimeout(() => {
            tooltip.remove();
        }, 200);
    }
}

// 세무 용어 팝업
function showTaxTermPopup(term) {
    const termDefinitions = {
        '공급가액': {
            title: '공급가액 💰',
            definition: '부가세를 제외한 순수한 재화나 서비스의 가격',
            example: '정비비 100,000원 + 부가세 10,000원 = 총 110,000원일 때, 공급가액은 100,000원',
            tip: '영수증에는 총액이 적혀있어도 공급가액을 따로 계산해야 합니다.'
        },
        '부가세': {
            title: '부가가치세 (VAT) 📊',
            definition: '재화나 서비스 거래 시 부과되는 세금 (10%)',
            example: '공급가액 100,000원 × 10% = 부가세 10,000원',
            tip: '매출세액(받은 부가세)에서 매입세액(낸 부가세)을 차감하여 신고합니다.'
        },
        '매입세액공제': {
            title: '매입세액공제 ↩️',
            definition: '사업용 구매 시 낸 부가세를 돌려받는 것',
            example: '부품 구매 시 낸 부가세 5,000원을 환급받음',
            tip: '세금계산서나 신용카드 영수증이 있어야 공제받을 수 있습니다.'
        }
    };
    
    const definition = termDefinitions[term];
    if (!definition) return;
    
    const popup = document.createElement('div');
    popup.className = 'tax-term-popup';
    popup.innerHTML = `
        <div class="popup-content">
            <div class="popup-header">
                <h4>${definition.title}</h4>
                <button onclick="this.closest('.tax-term-popup').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="popup-body">
                <p><strong>의미:</strong> ${definition.definition}</p>
                <p><strong>예시:</strong> ${definition.example}</p>
                <p><strong>팁:</strong> ${definition.tip}</p>
            </div>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    setTimeout(() => {
        popup.classList.add('show');
    }, 10);
}

// 페이지 로드 시 초보자 모드 확인
document.addEventListener('DOMContentLoaded', function() {
    // 기존 초기화 이후에 실행
    setTimeout(() => {
        if (beginnerMode) {
            applyBeginnerMode();
        }
    }, 1000);
});

// ===============================================
// 자동 카테고리 분류 시스템
// ===============================================

// 매출 카테고리 추천
async function suggestIncomeCategory(clientName) {
    try {
        // 1. 학습된 데이터에서 찾기 (최우선)
        const learnedMatch = await findLearnedCategory(clientName, 'income');
        if (learnedMatch) {
            console.log(`🧠 학습된 매치: ${clientName} → ${learnedMatch}`);
            return learnedMatch;
        }
        
        // 2. 기존 거래 데이터에서 찾기
        const exactMatch = await findExactClientMatch(clientName, 'income');
        if (exactMatch) {
            console.log(`🎯 거래 기록 매치: ${clientName} → ${exactMatch}`);
            return exactMatch;
        }
        
        // 3. 키워드 기반 매칭
        const keywordMatch = getIncomeKeywordMatch(clientName);
        if (keywordMatch) {
            console.log(`🔍 키워드 매치: ${clientName} → ${keywordMatch}`);
            return keywordMatch;
        }
        
        // 4. 기본값
        return '정비서비스';
        
    } catch (error) {
        console.error('❌ 매출 카테고리 추천 실패:', error);
        return null;
    }
}

// 경비 카테고리 추천
async function suggestExpenseCategory(vendorName) {
    try {
        // 1. 학습된 데이터에서 찾기 (최우선)
        const learnedMatch = await findLearnedCategory(vendorName, 'expense');
        if (learnedMatch) {
            console.log(`🧠 학습된 매치: ${vendorName} → ${learnedMatch}`);
            return learnedMatch;
        }
        
        // 2. 기존 거래 데이터에서 찾기
        const exactMatch = await findExactClientMatch(vendorName, 'expense');
        if (exactMatch) {
            console.log(`🎯 거래 기록 매치: ${vendorName} → ${exactMatch}`);
            return exactMatch;
        }
        
        // 3. 키워드 기반 매칭
        const keywordMatch = getExpenseKeywordMatch(vendorName);
        if (keywordMatch) {
            console.log(`🔍 키워드 매치: ${vendorName} → ${keywordMatch}`);
            return keywordMatch;
        }
        
        // 4. 기본값
        return '기타';
        
    } catch (error) {
        console.error('❌ 경비 카테고리 추천 실패:', error);
        return null;
    }
}

// 정확한 거래처 매치 찾기
async function findExactClientMatch(name, type) {
    try {
        const collectionName = type === 'income' ? 'income' : 'expense';
        const fieldName = type === 'income' ? 'client' : 'vendor';
        
        let query = db.collection(collectionName);
        if (isAdmin) {
            query = query.where('adminEmail', '==', currentUser.email);
        }
        
        const snapshot = await query.get();
        const categoryCount = new Map();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const clientName = data[fieldName];
            
            if (clientName && clientName.toLowerCase().includes(name.toLowerCase())) {
                const category = data.category;
                if (category) {
                    categoryCount.set(category, (categoryCount.get(category) || 0) + 1);
                }
            }
        });
        
        // 가장 많이 사용된 카테고리 반환
        if (categoryCount.size > 0) {
            return [...categoryCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
        }
        
        return null;
        
    } catch (error) {
        console.error('❌ 정확한 매치 검색 실패:', error);
        return null;
    }
}

// 매출 키워드 기반 매칭
function getIncomeKeywordMatch(clientName) {
    const name = clientName.toLowerCase();
    
    // 키워드 매핑 테이블
    const keywordMaps = [
        { keywords: ['정비', '수리', '점검', '정비소', '카센터', '모터스'], category: '정비서비스' },
        { keywords: ['부품', '파츠', '타이어', '오일', '배터리', '브레이크'], category: '부품판매' },
        { keywords: ['검사', '점검', '진단', '검진', '테스트'], category: '점검서비스' },
        { keywords: ['개인', '고객', '손님', '개별'], category: '정비서비스' }
    ];
    
    for (const map of keywordMaps) {
        if (map.keywords.some(keyword => name.includes(keyword))) {
            return map.category;
        }
    }
    
    return null;
}

// 경비 키워드 기반 매칭
function getExpenseKeywordMatch(vendorName) {
    const name = vendorName.toLowerCase();
    
    // 키워드 매핑 테이블
    const keywordMaps = [
        { keywords: ['부품', '파츠', '오일', '타이어', '배터리', '브레이크', '엔진', '필터'], category: '부품구매' },
        { keywords: ['공구', '툴', '장비', '기계', '렌치', '드라이버', '잭'], category: '공구구매' },
        { keywords: ['사무', '용품', '펜', '종이', '노트', '파일', '복사', '프린터'], category: '사무용품' },
        { keywords: ['임대', '월세', '전세', '렌트', '리스'], category: '임대료' },
        { keywords: ['전기', '전력', '한전', '전기세'], category: '전기료' },
        { keywords: ['통신', '인터넷', 'kt', 'skt', 'lg', '핸드폰', '전화'], category: '통신료' },
        { keywords: ['주유', '기름', '연료', '휘발유', '경유', 'gs', 's-oil'], category: '연료비' },
        { keywords: ['광고', '홍보', '마케팅', '전단', '간판', '홈페이지'], category: '광고선전비' }
    ];
    
    for (const map of keywordMaps) {
        if (map.keywords.some(keyword => name.includes(keyword))) {
            return map.category;
        }
    }
    
    return null;
}

// 카테고리 추천 시각적 표시
function showCategorySuggestion(selectElement, suggestedCategory) {
    // 애니메이션 클래스 추가
    selectElement.classList.add('category-recommended');
    
    // 스마트 추천 배지 추가
    addSmartSuggestionBadge(selectElement);
    
    // 2초 후 효과 제거
    setTimeout(() => {
        selectElement.classList.remove('category-recommended');
        removeSmartSuggestionBadge(selectElement);
    }, 3000);
    
    // 토스트 알림 (더 상세한 정보 포함)
    const reason = getRecommendationReason(suggestedCategory);
    showNotification(`🤖 AI 추천: "${suggestedCategory}" ${reason}`, 'info');
}

// 스마트 추천 배지 추가
function addSmartSuggestionBadge(element) {
    // 기존 배지 제거
    removeSmartSuggestionBadge(element);
    
    const badge = document.createElement('span');
    badge.className = 'smart-suggestion-badge';
    badge.textContent = 'AI';
    badge.style.position = 'absolute';
    badge.style.top = '-8px';
    badge.style.right = '-8px';
    
    // 부모 요소에 상대 위치 설정
    const parent = element.parentNode;
    if (parent) {
        parent.style.position = 'relative';
        parent.appendChild(badge);
    }
}

// 스마트 추천 배지 제거
function removeSmartSuggestionBadge(element) {
    const parent = element.parentNode;
    if (parent) {
        const existingBadge = parent.querySelector('.smart-suggestion-badge');
        if (existingBadge) {
            existingBadge.remove();
        }
    }
}

// 추천 이유 설명
function getRecommendationReason(category) {
    const reasons = {
        '정비서비스': '(정비/수리 관련 키워드 감지)',
        '부품판매': '(부품/파츠 관련 키워드 감지)',
        '점검서비스': '(검사/점검 관련 키워드 감지)',
        '부품구매': '(부품/오일 관련 키워드 감지)',
        '공구구매': '(공구/장비 관련 키워드 감지)',
        '연료비': '(주유/연료 관련 키워드 감지)',
        '전기료': '(전기/전력 관련 키워드 감지)',
        '통신료': '(통신/인터넷 관련 키워드 감지)',
        '광고선전비': '(광고/홍보 관련 키워드 감지)'
    };
    
    return reasons[category] || '(이전 거래 패턴 분석)';
}

// 거래처-카테고리 학습 데이터 저장
async function saveClientCategoryLearning(clientName, category, type) {
    try {
        const learningData = {
            clientName: clientName.toLowerCase().trim(),
            category: category,
            type: type, // 'income' or 'expense'
            adminEmail: currentUser.email,
            count: 1,
            lastUsed: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // 기존 학습 데이터가 있는지 확인
        const learningId = `${type}_${currentUser.email}_${clientName.toLowerCase().trim()}_${category}`;
        const existingDoc = await db.collection('category_learning').doc(learningId).get();
        
        if (existingDoc.exists) {
            // 기존 데이터 업데이트 (사용 횟수 증가)
            await db.collection('category_learning').doc(learningId).update({
                count: firebase.firestore.FieldValue.increment(1),
                lastUsed: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log(`📚 학습 데이터 업데이트: ${clientName} → ${category}`);
        } else {
            // 새로운 학습 데이터 생성
            await db.collection('category_learning').doc(learningId).set(learningData);
            console.log(`📚 새로운 학습 데이터: ${clientName} → ${category}`);
        }
        
    } catch (error) {
        console.error('❌ 학습 데이터 저장 실패:', error);
        // 학습 데이터 저장 실패는 전체 프로세스를 중단하지 않음
    }
}

// 학습된 카테고리 조회 (findExactClientMatch 개선 버전)
async function findLearnedCategory(clientName, type) {
    try {
        let query = db.collection('category_learning')
            .where('type', '==', type)
            .where('adminEmail', '==', currentUser.email);
        
        const snapshot = await query.get();
        const matches = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const learnedName = data.clientName;
            
            // 유사도 계산 (정확한 매치, 포함 관계 등)
            if (learnedName === clientName.toLowerCase().trim()) {
                // 정확한 매치
                matches.push({ category: data.category, score: data.count * 10, type: 'exact' });
            } else if (learnedName.includes(clientName.toLowerCase()) || clientName.toLowerCase().includes(learnedName)) {
                // 부분 매치
                matches.push({ category: data.category, score: data.count * 5, type: 'partial' });
            }
        });
        
        // 점수순 정렬하여 가장 적합한 카테고리 반환
        if (matches.length > 0) {
            matches.sort((a, b) => b.score - a.score);
            console.log(`🧠 학습된 카테고리: ${clientName} → ${matches[0].category} (${matches[0].type} match)`);
            return matches[0].category;
        }
        
        return null;
        
    } catch (error) {
        console.error('❌ 학습된 카테고리 조회 실패:', error);
        return null;
    }
}

// 매출 자동 완성 데이터 로드
async function loadIncomeAutoCompleteData(inputElement) {
    try {
        let query = db.collection('income');
        if (isAdmin) {
            query = query.where('adminEmail', '==', currentUser.email);
        }
        
        const snapshot = await query.get();
        const clients = new Set();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.client) {
                clients.add(data.client);
            }
        });
        
        // 견적서 고객도 포함
        let estimateQuery = db.collection('estimates');
        if (isAdmin) {
            estimateQuery = estimateQuery.where('createdBy', '==', currentUser.email);
        }
        
        const estimateSnapshot = await estimateQuery.get();
        estimateSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.customerName) {
                clients.add(data.customerName);
            }
        });
        
        setupAutoComplete(inputElement, Array.from(clients));
        
    } catch (error) {
        console.error('❌ 매출 자동 완성 데이터 로드 실패:', error);
    }
}

// 경비 자동 완성 데이터 로드
async function loadExpenseAutoCompleteData(inputElement) {
    try {
        let query = db.collection('expense');
        if (isAdmin) {
            query = query.where('adminEmail', '==', currentUser.email);
        }
        
        const snapshot = await query.get();
        const vendors = new Set();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.vendor) {
                vendors.add(data.vendor);
            }
        });
        
        setupAutoComplete(inputElement, Array.from(vendors));
        
    } catch (error) {
        console.error('❌ 경비 자동 완성 데이터 로드 실패:', error);
    }
}

// 자동 완성 UI 설정
function setupAutoComplete(inputElement, dataList) {
    // 기존 datalist 제거
    const existingDatalist = document.getElementById(inputElement.id + '_datalist');
    if (existingDatalist) {
        existingDatalist.remove();
    }
    
    // 새로운 datalist 생성
    const datalist = document.createElement('datalist');
    datalist.id = inputElement.id + '_datalist';
    
    dataList.forEach(item => {
        const option = document.createElement('option');
        option.value = item;
        datalist.appendChild(option);
    });
    
    // input에 datalist 연결
    inputElement.setAttribute('list', datalist.id);
    inputElement.parentNode.appendChild(datalist);
    
    console.log(`📝 자동 완성 설정 완료: ${dataList.length}개 항목`);
}

// 자동완성 데이터 로드 함수
async function loadAutoCompleteData() {
    try {
        console.log('📝 자동완성 데이터 로드 시작...');
        console.log('🔍 현재 상태:', { isAdmin, currentUser: currentUser?.email, db: !!db });
        
        const parts = new Set();
        const prices = {};
        const carNumbers = new Set();
        const customerNames = new Set();
        const bikeModels = new Set();
        
        // 견적서에서 부품명과 가격 데이터 수집
        try {
            const estimatesSnapshot = await safeFirebaseQuery('loadAutoCompleteEstimates', async () => {
                let estimatesQuery = db.collection('estimates');
                if (isAdmin && currentUser?.email) {
                    estimatesQuery = estimatesQuery.where('createdBy', '==', currentUser.email);
                }
                
                console.log('🔍 견적서 쿼리 실행 중...');
                return await estimatesQuery.get();
            });
            
            if (!estimatesSnapshot) {
                console.log('⚠️ Estimates query returned null, skipping...');
            } else {
                console.log(`📊 견적서 문서 수: ${estimatesSnapshot.size}`);
                
                estimatesSnapshot.forEach(doc => {
                    const data = doc.data();
                    console.log('📋 견적서 데이터:', data);
                    
                    // 차량번호, 고객명, 기종 수집
                    if (data.carNumber) {
                        carNumbers.add(data.carNumber);
                        console.log(`🚗 차량번호 추가: ${data.carNumber}`);
                    }
                    if (data.customerName) {
                        customerNames.add(data.customerName);
                        console.log(`👤 고객명 추가: ${data.customerName}`);
                    }
                    if (data.bikeModel) {
                        bikeModels.add(data.bikeModel);
                        console.log(`🏍️ 기종 추가: ${data.bikeModel}`);
                    }
                    
                    // 부품명과 가격 수집
                    if (data.items && Array.isArray(data.items)) {
                        data.items.forEach(item => {
                            console.log('🔧 견적 항목:', item);
                            if (item.part) {
                                parts.add(item.part);
                                if (item.price && !prices[item.part]) {
                                    prices[item.part] = item.price;
                                    console.log(`💰 견적서에서 가격 추가: ${item.part} = ${item.price}원`);
                                }
                            }
                        });
                    }
                });
            }
        } catch (firebaseError) {
            console.warn('⚠️ 견적서 쿼리 실패:', firebaseError);
        }
        
        // 정비 기록에서도 부품명 수집
        try {
            const maintenanceSnapshot = await safeFirebaseQuery('loadAutoCompleteMaintenance', async () => {
                let maintenanceQuery = db.collection('maintenance');
                if (isAdmin && currentUser?.email) {
                    maintenanceQuery = maintenanceQuery.where('adminEmail', '==', currentUser.email);
                }
                
                console.log('🔍 정비 기록 쿼리 실행 중...');
                return await maintenanceQuery.get();
            });
            
            if (!maintenanceSnapshot) {
                console.log('⚠️ Maintenance query returned null, skipping...');
            } else {
                console.log(`📊 정비 기록 문서 수: ${maintenanceSnapshot.size}`);
                
                maintenanceSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.parts && Array.isArray(data.parts)) {
                        data.parts.forEach(part => {
                            if (part.name) {
                                parts.add(part.name);
                                if (part.price && !prices[part.name]) {
                                    prices[part.name] = part.price;
                                }
                            }
                        });
                    }
                });
            }
        } catch (firebaseError) {
            console.warn('⚠️ 정비 기록 쿼리 실패:', firebaseError);
        }
        
        // 실제 데이터가 없을 때만 기본 부품명 추가
        if (parts.size === 0) {
            console.log('📝 실제 데이터가 없어 기본 부품명 추가');
            
            // 카테고리별 부품명 정의
            const categorizedParts = {
                engine: [
                    { name: '오일교환', price: 25000 },
                    { name: '에어필터', price: 15000 },
                    { name: '스파크플러그', price: 12000 },
                    { name: '연료탱크', price: 245850 },
                    { name: '페달 콤프 기어', price: 6490 },
                    { name: '고무 기억', price: 770 },
                    { name: '로드타이', price: 2310 },
                    { name: '암기어', price: 2640 }
                ],
                brake: [
                    { name: '브레이크패드', price: 45000 },
                    { name: '브레이크레버', price: 15000 },
                    { name: '브레이크호스', price: 25000 }
                ],
                electrical: [
                    { name: '헤드라이트', price: 129910 },
                    { name: '배터리교체', price: 55000 },
                    { name: '시거잭', price: 18000 },
                    { name: '연료계', price: 25000 },
                    { name: '속도계', price: 30000 }
                ],
                body: [
                    { name: '미러', price: 71280 },
                    { name: '미러 (좌.우)', price: 71280 },
                    { name: '사이드미러', price: 20000 },
                    { name: '윙카 (좌.우)', price: 124520 },
                    { name: '카울 (좌.우)', price: 128480 },
                    { name: '시트', price: 35000 },
                    { name: '윈드실드', price: 45000 }
                ],
                suspension: [
                    { name: '타이어교체', price: 80000 },
                    { name: '포크 어셈브리 (좌.우)', price: 328460 },
                    { name: '스템 서브 스티어링 어셈브리', price: 67540 }
                ],
                control: [
                    { name: '핸들바', price: 40000 },
                    { name: '액셀레버', price: 15000 },
                    { name: '기어레버', price: 12000 },
                    { name: '레바 (좌.우)', price: 50000 }
                ],
                transmission: [
                    { name: '체인교체', price: 30000 },
                    { name: '클러치', price: 65000 }
                ],
                service: [
                    { name: '기술료', price: 55000 }
                ],
                accessories: [
                    { name: 'agv 헬멧', price: 700000 }
                ]
            };
            
            // 자주 사용하는 부품 우선순위
            const popularParts = [
                '오일교환', '브레이크패드', '헤드라이트', '타이어교체', 
                '배터리교체', '미러', '기술료'
            ];
            
            // 모든 부품을 카테고리별로 추가
            Object.values(categorizedParts).flat().forEach(part => {
                parts.add(part.name);
                if (!prices[part.name]) {
                    prices[part.name] = part.price;
                }
            });
            
            // 카테고리 정보 저장
            window.autoCompleteCategories = categorizedParts;
            window.popularParts = popularParts;
            
            console.log('📊 카테고리별 부품명 추가 완료');
        } else {
            console.log('✅ 실제 작성한 데이터 사용');
        }
        
        console.log(`✅ 자동완성 데이터 로드 완료: ${parts.size}개 부품, ${Object.keys(prices).length}개 가격`);
        console.log('📋 수집된 부품명:', Array.from(parts));
        console.log('💰 수집된 가격:', prices);
        
        // 브랜드별 부품명 정의 (실제 견적서 기반)
        const brandParts = {
            honda: {
                'CBR125R': {
                    '헤드라이트': 129910,
                    '스템 서브 스티어링 어셈브리': 67540,
                    '포크 어셈브리 (좌.우)': 328460,
                    '연료탱크': 245850,
                    '페달 콤프 기어': 6490,
                    '고무 기억': 770,
                    '로드타이': 2310,
                    '암기어': 2640,
                    '윙카 (좌.우)': 124520,
                    '카울 (좌.우)': 128480,
                    '미러 (좌.우)': 71280,
                    '레바 (좌.우)': 50000
                },
                        'PCX150': {
            '오일교환': 25000,
            '브레이크패드': 45000,
            '타이어교체': 80000,
            '에어필터': 15000,
            '헤드라이트': 35000,
            '배터리교체': 55000,
            '미러': 25000,
            '시트': 35000
        },
        'PCX125': {
            '헤드라이트': 352660,
            '사이드미러 우측': 10890,
            '핸들바': 54560,
            '프론트 바디커버': 46090,
            '사이드커버 바닦 우측': 23650,
            '리어 바디 커버': 51590,
            '머플러': 341000,
            '머플러 커버': 22330,
            '핸들 열선': 100000,
            '기술료': 55000
        },
                'CBR250R': {
                    '헤드라이트': 150000,
                    '브레이크패드': 60000,
                    '타이어교체': 120000,
                    '카울 (좌.우)': 180000,
                    '미러 (좌.우)': 80000
                }
            },
            yamaha: {
                'NMAX': {
                    '오일교환': 28000,
                    '브레이크패드': 48000,
                    '타이어교체': 85000,
                    '헤드라이트': 38000,
                    '배터리교체': 58000
                },
                'MT-03': {
                    '헤드라이트': 140000,
                    '브레이크패드': 55000,
                    '타이어교체': 110000,
                    '카울 (좌.우)': 160000
                }
            },
            kawasaki: {
                'Ninja 250': {
                    '헤드라이트': 160000,
                    '브레이크패드': 65000,
                    '타이어교체': 130000,
                    '카울 (좌.우)': 200000
                }
            },
            bmw: {
                'R1250RT': {
                    '파이널기어 오일': 25000,
                    '샤프트 구리스 도포': 50000,
                    '스롤들바디 청소': 80000,
                    '오일교환 필터 포함': 130000
                },
                'R1200RT': {
                    '파이널기어 오일': 25000,
                    '샤프트 구리스 도포': 50000,
                    '스롤들바디 청소': 80000,
                    '오일교환 필터 포함': 130000
                },
                'R1200GS': {
                    '파이널기어 오일': 25000,
                    '샤프트 구리스 도포': 50000,
                    '스롤들바디 청소': 80000,
                    '오일교환 필터 포함': 130000
                },
                'R1250GS': {
                    '파이널기어 오일': 25000,
                    '샤프트 구리스 도포': 50000,
                    '스롤들바디 청소': 80000,
                    '오일교환 필터 포함': 130000
                }
            }
        };
        
        // 전역 변수에 저장
        window.autoCompleteData = {
            parts: Array.from(parts),
            prices: prices,
            carNumbers: Array.from(carNumbers),
            customerNames: Array.from(customerNames),
            bikeModels: Array.from(bikeModels)
        };
        
        // 브랜드 정보 저장
        window.brandParts = brandParts;
        console.log('💾 자동완성 데이터 전역 저장 완료');
        console.log('📊 수집된 데이터:');
        console.log('  - 부품명:', Array.from(parts));
        console.log('  - 차량번호:', Array.from(carNumbers));
        console.log('  - 고객명:', Array.from(customerNames));
        console.log('  - 기종:', Array.from(bikeModels));
        
    } catch (error) {
        console.error('❌ 자동완성 데이터 로드 실패:', error);
    }
}

// 자동완성에 데이터 추가 함수 (강화된 버전)
function addToAutoComplete(partName, price = null) {
    if (!window.autoCompleteData) {
        window.autoCompleteData = { parts: [], prices: {} };
    }
    
    // 부품명 추가
    if (partName && !window.autoCompleteData.parts.includes(partName)) {
        window.autoCompleteData.parts.push(partName);
        console.log(`📝 새로운 부품명 추가: ${partName}`);
    }
    
    // 가격 추가 (새로운 가격이면 업데이트)
    if (price && partName) {
        const oldPrice = window.autoCompleteData.prices[partName];
        window.autoCompleteData.prices[partName] = price;
        
        if (oldPrice && oldPrice !== price) {
            console.log(`💰 가격 업데이트: ${partName} ${oldPrice}원 → ${price}원`);
        } else if (!oldPrice) {
            console.log(`💰 새로운 가격 추가: ${partName} = ${price}원`);
        }
    }
    
    // Firebase에 저장 (선택사항)
    if (db && currentUser && partName) {
        saveAutoCompleteToFirebase(partName, price);
    }
    
    console.log(`📝 자동완성 데이터 추가: ${partName} (${price ? price + '원' : '가격 없음'})`);
}

// 부품 카테고리 확인 함수
function getPartCategory(partName) {
    if (!window.autoCompleteCategories) return '기타';
    
    for (const [category, parts] of Object.entries(window.autoCompleteCategories)) {
        if (parts.some(p => p.name === partName)) {
            return category;
        }
    }
    return '기타';
}

// 자동완성 점수 계산 함수 (기종별 우선순위 포함)
function calculateScore(part, searchValue, bikeModel = '') {
    let score = 0;
    
    // 정확한 시작 일치 (가장 높은 점수)
    if (part.toLowerCase().startsWith(searchValue.toLowerCase())) {
        score += 10;
    }
    
    // 부분 포함 (중간 점수)
    if (part.toLowerCase().includes(searchValue.toLowerCase())) {
        score += 5;
    }
    
    // 자주 사용하는 부품 우선순위
    if (window.popularParts && window.popularParts.includes(part)) {
        score += 3;
    }
    
    // 기종별 부품 우선순위 (가장 높은 점수)
    if (bikeModel && getBikeSpecificParts(bikeModel).includes(part)) {
        score += 15;
        console.log(`🏍️ 기종별 부품 우선순위: ${part} (${bikeModel})`);
    }
    
    // 카테고리별 우선순위
    const category = getPartCategory(part);
    const categoryPriority = {
        'engine': 2,
        'brake': 2,
        'electrical': 1,
        'body': 1,
        'suspension': 1,
        'control': 1,
        'transmission': 1,
        'service': 3,
        'accessories': 1
    };
    score += categoryPriority[category] || 0;
    
    return score;
}

// 카테고리 라벨 함수
function getCategoryLabel(category) {
    const labels = {
        'engine': '엔진',
        'brake': '브레이크',
        'electrical': '전기',
        'body': '외관',
        'suspension': '서스펜션',
        'control': '제어',
        'transmission': '변속',
        'service': '서비스',
        'accessories': '액세서리',
        '기타': '기타'
    };
    return labels[category] || '기타';
}

// 카테고리 색상 함수
function getCategoryColor(category) {
    const colors = {
        'engine': '#e74c3c',
        'brake': '#f39c12',
        'electrical': '#3498db',
        'body': '#9b59b6',
        'suspension': '#2ecc71',
        'control': '#e67e22',
        'transmission': '#1abc9c',
        'service': '#34495e',
        'accessories': '#95a5a6',
        '기타': '#7f8c8d'
    };
    return colors[category] || '#7f8c8d';
}

// 기종별 부품명 가져오기 함수
function getBikeSpecificParts(bikeModel) {
    if (!window.brandParts || !bikeModel) return [];
    
    // 브랜드별로 검색
    for (const [brand, models] of Object.entries(window.brandParts)) {
        for (const [model, parts] of Object.entries(models)) {
            if (bikeModel.toLowerCase().includes(model.toLowerCase()) || 
                model.toLowerCase().includes(bikeModel.toLowerCase())) {
                console.log(`🏍️ 기종 매칭: ${bikeModel} → ${model}`);
                return Object.keys(parts);
            }
        }
    }
    
    return [];
}

// 기종별 가격 가져오기 함수
function getBikeSpecificPrice(bikeModel, partName) {
    if (!window.brandParts || !bikeModel || !partName) return null;
    
    // 브랜드별로 검색
    for (const [brand, models] of Object.entries(window.brandParts)) {
        for (const [model, parts] of Object.entries(models)) {
            if (bikeModel.toLowerCase().includes(model.toLowerCase()) || 
                model.toLowerCase().includes(bikeModel.toLowerCase())) {
                return parts[partName] || null;
            }
        }
    }
    
    return null;
}

// 자동완성 도움말 표시 함수
function showAutoCompleteHelp(inputElement, message) {
    // 기존 도움말 제거
    const existingHelp = document.querySelector('.autocomplete-help');
    if (existingHelp) {
        existingHelp.remove();
    }
    
    // 새 도움말 생성
    const helpDiv = document.createElement('div');
    helpDiv.className = 'autocomplete-help';
    helpDiv.textContent = message;
    helpDiv.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: #fff3cd;
        border: 1px solid #ffeaa7;
        border-top: none;
        padding: 8px 12px;
        font-size: 12px;
        color: #856404;
        z-index: 1000;
        border-radius: 0 0 8px 8px;
    `;
    
    inputElement.parentNode.style.position = 'relative';
    inputElement.parentNode.appendChild(helpDiv);
    
    // 3초 후 자동 제거
    setTimeout(() => {
        if (helpDiv.parentNode) {
            helpDiv.remove();
        }
    }, 3000);
}

// Firebase에 자동완성 데이터 저장
async function saveAutoCompleteToFirebase(partName, price = null) {
    try {
        const autoCompleteRef = db.collection('autoComplete').doc(currentUser.uid);
        await autoCompleteRef.set({
            parts: window.autoCompleteData.parts,
            prices: window.autoCompleteData.prices,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log(`💾 자동완성 데이터 Firebase 저장: ${partName}`);
    } catch (error) {
        console.warn('⚠️ 자동완성 데이터 Firebase 저장 실패:', error);
    }
}

// 간단한 자동완성 드롭다운 생성 함수
function createSimpleAutoCompleteDropdown(inputElement, suggestions) {
    // 기존 드롭다운 제거
    const existingDropdown = document.querySelector('.autocomplete-dropdown');
    if (existingDropdown) {
        existingDropdown.remove();
    }
    
    if (!suggestions || suggestions.length === 0) return;
    
    // 새 드롭다운 생성
    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    dropdown.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: white;
        border: 1px solid #ddd;
        border-top: none;
        max-height: 200px;
        overflow-y: auto;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        border-radius: 0 0 8px 8px;
    `;
    
    suggestions.forEach(suggestion => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.textContent = suggestion;
        item.style.cssText = `
            padding: 10px 12px;
            cursor: pointer;
            border-bottom: 1px solid #eee;
            transition: background-color 0.2s;
        `;
        
        item.addEventListener('click', () => {
            inputElement.value = suggestion;
            dropdown.remove();
        });
        
        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = '#f8f9fa';
        });
        
        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = 'white';
        });
        
        dropdown.appendChild(item);
    });
    
    inputElement.parentNode.style.position = 'relative';
    inputElement.parentNode.appendChild(dropdown);
}

// 자동완성 드롭다운 생성 함수 (개선된 UI)
function createAutoCompleteDropdown(inputElement, suggestions) {
    // 기존 드롭다운 제거
    const existingDropdown = document.querySelector('.autocomplete-dropdown');
    if (existingDropdown) {
        existingDropdown.remove();
    }
    
    if (!suggestions || suggestions.length === 0) return;
    
    // 새 드롭다운 생성
    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    dropdown.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: white;
        border: 1px solid #ddd;
        border-top: none;
        max-height: 240px;
        overflow-y: auto;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        border-radius: 0 0 8px 8px;
    `;
    
    suggestions.forEach(suggestion => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        
        // 카테고리 배지
        const categoryBadge = document.createElement('span');
        categoryBadge.textContent = getCategoryLabel(suggestion.category);
        categoryBadge.style.cssText = `
            background: ${getCategoryColor(suggestion.category)};
            color: white;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            margin-right: 8px;
        `;
        
        // 부품명과 가격을 함께 표시
        const nameSpan = document.createElement('span');
        nameSpan.textContent = suggestion.name;
        nameSpan.style.cssText = `
            font-weight: 500;
            color: #333;
            flex: 1;
        `;
        
        const priceSpan = document.createElement('span');
        priceSpan.textContent = suggestion.price ? `${suggestion.price.toLocaleString()}원` : '';
        priceSpan.style.cssText = `
            color: #666;
            font-size: 12px;
            margin-left: 8px;
        `;
        
        item.appendChild(categoryBadge);
        item.appendChild(nameSpan);
        item.appendChild(priceSpan);
        
        item.style.cssText = `
            padding: 10px 12px;
            cursor: pointer;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: background-color 0.2s;
        `;
        
        item.addEventListener('click', () => {
            inputElement.value = suggestion.name;
            
            // 가격도 자동으로 설정
            const priceInput = inputElement.closest('.estimate-item-card').querySelector('.item-price');
            if (priceInput && suggestion.price) {
                priceInput.value = suggestion.price;
                // 총액 재계산
                calculateTotal();
            }
            
            dropdown.remove();
        });
        
        item.addEventListener('mouseenter', () => {
            item.style.backgroundColor = '#f8f9fa';
        });
        
        item.addEventListener('mouseleave', () => {
            item.style.backgroundColor = 'white';
        });
        
        dropdown.appendChild(item);
    });
    
    // input 요소에 드롭다운 추가
    inputElement.parentNode.style.position = 'relative';
    inputElement.parentNode.appendChild(dropdown);
    
    // 외부 클릭 시 드롭다운 닫기
    document.addEventListener('click', function closeDropdown(e) {
        if (!inputElement.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.remove();
            document.removeEventListener('click', closeDropdown);
        }
    });
}

// Firebase 캐시 강제 정리 함수
async function clearFirebaseCache() {
    console.log('🧹 Firebase 캐시 정리 시작...');
    
    try {
        // 모든 리스너 정리
        cleanupFirebaseListeners();
        
        // 네트워크 비활성화 후 재활성화
        if (db) {
            await db.disableNetwork();
            console.log('📴 Firebase 네트워크 비활성화');
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await db.enableNetwork();
            console.log('📶 Firebase 네트워크 재활성화');
        }
        
        // 쿼리 큐 정리
        queryQueue.clear();
        
        console.log('✅ Firebase 캐시 정리 완료');
        showNotification('Firebase 캐시가 정리되었습니다.', 'success');
        
        return true;
        
    } catch (error) {
        console.error('❌ Firebase 캐시 정리 실패:', error);
        showNotification('캐시 정리에 실패했습니다: ' + error.message, 'error');
        return false;
    }
}

// 관리자 상태 디버깅 함수
function checkAdminStatus() {
    console.log('🔍 관리자 상태 확인:');
    console.log('  - currentUser:', currentUser);
    console.log('  - isAdmin:', isAdmin);
    console.log('  - ADMIN_EMAILS:', ADMIN_EMAILS);
    
    if (currentUser && currentUser.email) {
        console.log('  - 현재 사용자 이메일:', currentUser.email);
        console.log('  - 관리자 이메일 포함 여부:', ADMIN_EMAILS.includes(currentUser.email));
        
        if (!isAdmin && ADMIN_EMAILS.includes(currentUser.email)) {
            console.log('⚠️ 관리자 이메일이지만 isAdmin이 false입니다. setupAdminUser() 실행을 권장합니다.');
        }
    } else {
        console.log('❌ 로그인되지 않았습니다.');
    }
    
    return {
        currentUser,
        isAdmin,
        adminEmails: ADMIN_EMAILS,
        isLoggedIn: !!currentUser,
        isAdminEmail: currentUser ? ADMIN_EMAILS.includes(currentUser.email) : false,
        canAccessTax: isAdmin && currentUser && ADMIN_EMAILS.includes(currentUser.email)
    };
}

// 관리자 권한 확인 및 자동 수정 함수
function verifyAndFixAdminStatus() {
    console.log('🔧 관리자 권한 확인 및 수정 중...');
    
    const status = checkAdminStatus();
    console.log('📊 상태 확인 결과:', status);
    
    // 관리자 이메일로 로그인했지만 권한이 없는 경우 수정
    if (status.isLoggedIn && status.isAdminEmail && !status.isAdmin) {
        console.log('🔧 관리자 권한 자동 수정 중...');
        isAdmin = true;
        console.log('✅ 관리자 권한이 설정되었습니다.');
        
        // UI 업데이트
        updateUI();
        
        showNotification('관리자 권한이 활성화되었습니다.', 'success');
        return true;
    }
    
    return status.canAccessTax;
}

// PDF 라이브러리 로딩 체크 및 대기 함수 (개선된 버전)
async function waitForJsPDFLibrary(maxWaitTime = 15000, showProgress = true) {
    console.log('📄 jsPDF 라이브러리 로딩 확인 중...');
    
    // 이미 로드된 경우
    if (typeof window.jspdf !== 'undefined' && window.jspdf.jsPDF) {
        console.log('✅ jsPDF 라이브러리가 이미 로드되어 있습니다.');
        if (showProgress) {
            showNotification('PDF 라이브러리 로딩 완료', 'success');
        }
        return true;
    }
    
    // 프로그레스 표시를 위한 변수
    let progressCounter = 0;
    const maxProgress = Math.floor(maxWaitTime / 100);
    
    if (showProgress) {
        showNotification('PDF 라이브러리 로딩 중... (0%)', 'info');
    }
    
    // 로딩 대기 (개선된 버전)
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
        // 라이브러리 로딩 체크
        if (typeof window.jspdf !== 'undefined' && window.jspdf.jsPDF) {
            console.log('✅ jsPDF 라이브러리 로딩 완료');
            if (showProgress) {
                showNotification('PDF 라이브러리 로딩 완료!', 'success');
            }
            return true;
        }
        
        // 진행률 계산 및 표시
        progressCounter++;
        if (showProgress && progressCounter % 10 === 0) { // 1초마다 업데이트
            const progress = Math.min(Math.floor((progressCounter / maxProgress) * 100), 99);
            showNotification(`PDF 라이브러리 로딩 중... (${progress}%)`, 'info');
        }
        
        // 중간에 수동으로 라이브러리 로드 시도
        if (progressCounter === 30) { // 3초 후 수동 로드 시도
            console.log('🔄 jsPDF 라이브러리 수동 로드 시도...');
            await tryLoadJsPDFManually();
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.error('❌ jsPDF 라이브러리 로딩 실패 - 시간 초과');
    
    if (showProgress) {
        showNotification('PDF 라이브러리 로딩에 실패했습니다. 재시도 중...', 'warning');
        
        // 마지막으로 수동 로드 시도
        const manualLoadSuccess = await tryLoadJsPDFManually();
        if (manualLoadSuccess) {
            showNotification('PDF 라이브러리 로딩 성공!', 'success');
            return true;
        }
    }
    
    return false;
}

// jsPDF 라이브러리 수동 로드 함수
async function tryLoadJsPDFManually() {
    try {
        console.log('🔧 jsPDF 수동 로드 시도...');
        
        // 기존 스크립트 태그 확인
        const existingScript = document.querySelector('script[src*="jspdf"]');
        if (existingScript) {
            console.log('📄 기존 jsPDF 스크립트 태그 발견');
        }
        
        // 다른 CDN으로 시도
        const cdnUrls = [
            'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
            'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js',
            'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
        ];
        
        for (const url of cdnUrls) {
            try {
                console.log(`🌐 CDN 시도: ${url}`);
                
                // 새로운 스크립트 태그 생성
                const script = document.createElement('script');
                script.src = url;
                script.async = false;
                
                // 로딩 완료 대기
                const loaded = await new Promise((resolve) => {
                    script.onload = () => {
                        console.log(`✅ CDN 로드 성공: ${url}`);
                        resolve(true);
                    };
                    script.onerror = () => {
                        console.log(`❌ CDN 로드 실패: ${url}`);
                        resolve(false);
                    };
                    
                    // 타임아웃 설정
                    setTimeout(() => {
                        console.log(`⏰ CDN 로드 타임아웃: ${url}`);
                        resolve(false);
                    }, 5000);
                    
                    document.head.appendChild(script);
                });
                
                if (loaded && typeof window.jspdf !== 'undefined' && window.jspdf.jsPDF) {
                    console.log('✅ jsPDF 수동 로드 성공');
                    return true;
                }
                
            } catch (error) {
                console.warn(`⚠️ CDN 로드 오류: ${url}`, error);
            }
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ jsPDF 수동 로드 실패:', error);
        return false;
    }
}

// PDF 라이브러리 상태 확인 함수
function checkPDFLibraryStatus() {
    const status = {
        jsPDF: typeof window.jspdf !== 'undefined' && window.jspdf.jsPDF,
        html2canvas: typeof html2canvas !== 'undefined',
        scriptTags: {
            jsPDF: !!document.querySelector('script[src*="jspdf"]'),
            html2canvas: !!document.querySelector('script[src*="html2canvas"]')
        }
    };
    
    console.log('📊 PDF 라이브러리 상태:', status);
    return status;
}

// QR코드 라이브러리 로딩 체크 및 대기 함수
async function waitForQRCodeLibrary(maxWaitTime = 10000) {
    console.log('🔗 QRCode 라이브러리 로딩 확인 중...');
    
    // 이미 로드된 경우
    if (typeof QRCode !== 'undefined') {
        console.log('✅ QRCode 라이브러리가 이미 로드되어 있습니다.');
        return true;
    }
    
    // 로딩 대기
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitTime) {
        if (typeof QRCode !== 'undefined') {
            console.log('✅ QRCode 라이브러리 로딩 완료');
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.error('❌ QRCode 라이브러리 로딩 실패 - 시간 초과');
    return false;
}

// Target ID 충돌 해결 함수 (사용자용)
async function fixTargetIdConflict() {
    console.log('🔧 사용자 요청으로 Target ID 충돌 해결 시도');
    showNotification('Target ID 충돌을 해결하고 있습니다...', 'info');
    
    try {
        // 1. 모든 리스너 정리
        cleanupFirebaseListeners();
        
        // 2. 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 3. Firebase 네트워크 재설정
        if (db) {
            await db.disableNetwork();
            await new Promise(resolve => setTimeout(resolve, 500));
            await db.enableNetwork();
        }
        
        // 4. 대시보드 데이터 다시 로드
        if (currentUser) {
            await loadDashboardData();
        }
        
        showNotification('Target ID 충돌이 해결되었습니다. 정상적으로 작동합니다.', 'success');
        console.log('✅ Target ID 충돌 해결 완료');
        
    } catch (error) {
        console.error('❌ Target ID 충돌 해결 실패:', error);
        showNotification('충돌 해결에 실패했습니다. 페이지를 새로고침해주세요.', 'error');
    }
}

// 전역 함수 등록 통합 함수
function registerGlobalFunctions() {
    const globalFunctions = {
        // Firebase 관련
        clearFirebaseCache, checkAdminStatus, verifyAndFixAdminStatus,
        checkFirebaseConnection, attemptFirebaseReconnection, monitorFirebaseConnection,
        cleanupFirebaseListeners, safeFirebaseQuery, fixTargetIdConflict,
        
        // PDF 라이브러리 관련
        waitForJsPDFLibrary, waitForQRCodeLibrary, tryLoadJsPDFManually,
        checkPDFLibraryStatus, fixPDFLibraryIssue, showPDFLibraryHelp, showConsoleHelp,
        
        // 세무 관리 관련
        loadTaxationData, showIncomeModal, closeIncomeModal, calculateIncomeTotal,
        setupIncomeAutoComplete, saveIncomeData, showExpenseModal, closeExpenseModal,
        calculateExpenseTotal, setupExpenseAutoComplete, saveExpenseData,
        suggestIncomeCategory, suggestExpenseCategory, showCategorySuggestion,
        addSmartSuggestionBadge, removeSmartSuggestionBadge, getRecommendationReason,
        saveClientCategoryLearning, findLearnedCategory, setupAutoComplete,
        
        // 급여 관리 관련
        showSalaryModal, closeSalaryModal, showSalaryTab, cancelAddEmployee,
        saveEmployee, editEmployee, deleteEmployee, paySalary, showAddEmployeeForm,
        loadSalaryCalculation, loadSalaryHistory, saveInsuranceSettings,
        generatePayslip, viewSalaryDetail, downloadPayslip,
        
        // 세무 리포트 관련
        showTaxReport, setupAdminUser, showTaxReportOptions, closeVatReportModal,
        showVatTab, generateVatReport, generateMonthlyReport, generateQuarterlyReport,
        generateYearlyReport, showTaxHelpCenter, closeTaxHelpModal, showHelpTab,
        toggleFAQ, enableBeginnerMode, disableBeginnerMode, showTaxTermPopup,
        exportVatData, generateVatPDF, runVatSimulation,
        
        // 분류 및 거래 관련
        toggleCategoryView, showAllTransactions, showCategoryDetailModal,
        closeCategoryDetailModal, loadCategoryDetailData, closeAllTransactionsModal,
        loadAllTransactionsData, renderAllTransactions, filterTransactions,
        editTransaction, updateIncomeData, updateExpenseData,
        
        // 견적서 관련
        showMonthlyEstimateModal, closeMonthlyEstimateModal,
        downloadMonthlyEstimates, getEstimatesByMonth,
        
        // 정비 관리 관련
        updateMaintenanceStatus
    };
    
    // 전역 함수 등록
    Object.entries(globalFunctions).forEach(([name, func]) => {
        if (typeof func === 'function') {
            window[name] = func;
        }
    });
    
            // console.log('✅ 전역 함수 등록 완료:', Object.keys(globalFunctions).length + '개');
}

// 전역 함수 등록 실행
registerGlobalFunctions();

// 통합 디버깅 및 복구 시스템
const DebugSystem = {
    // 정비이력 로딩 디버깅
    async debugMaintenanceLoading() {
        console.log('🔍 정비이력 로딩 디버깅 시작...');
        
        // 1. 사용자 정보 확인
        console.log('👤 현재 사용자 정보:', {
            uid: currentUser?.uid,
            email: currentUser?.email,
            carNumber: currentUser?.carNumber,
            role: currentUser?.role,
            isAdmin: isAdmin
        });
        
        // 2. Firebase 연결 상태 확인
        console.log('🔥 Firebase 연결 상태:', {
            db: !!db,
            auth: !!firebase.auth(),
            projectId: firebase.app().options.projectId
        });
        
        // 3. 데이터베이스 직접 조회 테스트
        try {
            console.log('📊 데이터베이스 조회 테스트...');
            const maintenanceSnapshot = await db.collection('maintenance').get();
            console.log('✅ 정비 데이터 개수:', maintenanceSnapshot.size);
            
            const incomeSnapshot = await db.collection('income').get();
            console.log('✅ 매출 데이터 개수:', incomeSnapshot.size);
            
            const expenseSnapshot = await db.collection('expense').get();
            console.log('✅ 경비 데이터 개수:', expenseSnapshot.size);
            
            const estimatesSnapshot = await db.collection('estimates').get();
            console.log('✅ 견적서 데이터 개수:', estimatesSnapshot.size);
            
            // 4. 관리자별 데이터 확인
            if (isAdmin) {
                console.log('👨‍💼 관리자별 데이터 확인...');
                const adminMaintenance = await db.collection('maintenance')
                    .where('adminEmail', '==', currentUser.email)
                    .get();
                console.log('✅ 관리자 정비 데이터:', adminMaintenance.size);
                
                const adminIncome = await db.collection('income')
                    .where('adminEmail', '==', currentUser.email)
                    .get();
                console.log('✅ 관리자 매출 데이터:', adminIncome.size);
                
                const adminExpense = await db.collection('expense')
                    .where('adminEmail', '==', currentUser.email)
                    .get();
                console.log('✅ 관리자 경비 데이터:', adminExpense.size);
            }
            
        } catch (error) {
            console.error('❌ 데이터베이스 조회 오류:', error);
        }
    },
    
    // 데이터 복구
    async recoverData() {
        console.log('🔄 데이터 복구 시도...');
        
        try {
            // 1. 캐시 클리어
            clearCachedData();
            console.log('✅ 캐시 클리어 완료');
            
            // 2. 리스너 정리
            cleanupFirebaseListeners();
            console.log('✅ 리스너 정리 완료');
            
            // 3. 데이터 재로딩
            await loadMaintenanceTimeline();
            await updateTodayStats();
            await updatePendingStats();
            await updateMonthStats();
            await updateAverageStats();
            await loadNotifications();
            
            console.log('✅ 데이터 재로딩 완료');
            
            // 4. UI 새로고침
            showScreen('dashboard');
            console.log('✅ UI 새로고침 완료');
            
        } catch (error) {
            console.error('❌ 데이터 복구 실패:', error);
        }
    },
    
    // 시스템 상태 점검
    checkSystemStatus() {
        console.log('🔍 시스템 상태 점검...');
        console.log('📊 현재 상태:', {
            user: currentUser?.email || 'null',
            isAdmin: isAdmin,
            db: !!db,
            online: navigator.onLine,
            theme: currentTheme,
            viewMode: currentViewMode
        });
    }
};

// 디버깅 함수들을 전역으로 노출
window.debugMaintenanceLoading = DebugSystem.debugMaintenanceLoading.bind(DebugSystem);
window.recoverData = DebugSystem.recoverData.bind(DebugSystem);
window.checkSystemStatus = DebugSystem.checkSystemStatus.bind(DebugSystem);
window.handleCategoryClick = handleCategoryClick;
window.handleViewAllClick = handleViewAllClick;

// 카테고리 클릭 핸들러
function handleCategoryClick(categoryName) {
    console.log('카테고리 클릭 핸들러 호출됨:', categoryName);
    
    // 함수 존재 확인
    if (typeof showCategoryDetailModal === 'function') {
        console.log('showCategoryDetailModal 함수 호출');
        showCategoryDetailModal(categoryName);
    } else if (typeof window.showCategoryDetailModal === 'function') {
        console.log('window.showCategoryDetailModal 함수 호출');
        window.showCategoryDetailModal(categoryName);
    } else {
        console.error('showCategoryDetailModal 함수를 찾을 수 없습니다');
        showNotification('상세보기 기능을 불러올 수 없습니다.', 'error');
    }
}

// 전체보기 클릭 핸들러
function handleViewAllClick() {
    console.log('전체보기 클릭 핸들러 호출됨');
    
    // 함수 존재 확인
    if (typeof showAllTransactions === 'function') {
        console.log('showAllTransactions 함수 호출');
        showAllTransactions();
    } else if (typeof window.showAllTransactions === 'function') {
        console.log('window.showAllTransactions 함수 호출');
        window.showAllTransactions();
    } else {
        console.error('showAllTransactions 함수를 찾을 수 없습니다');
        showNotification('전체보기 기능을 불러올 수 없습니다.', 'error');
    }
}

// closeDetailModal 함수 정의 (closeMaintenanceDetailModal과 동일)
window.closeDetailModal = function() {
    console.log('closeDetailModal 호출됨 - closeMaintenanceDetailModal로 리다이렉트');
    closeMaintenanceDetailModal();
};

// 🔧 PDF 한글 폰트 지원 함수들
function setupKoreanPDFFont(pdf) {
    try {
        console.log('📄 PDF 한글 폰트 설정 중...');
        
        // 한글 지원을 위한 폰트 설정
        // 기본 폰트로 시작하되 한글 텍스트 처리 개선
        pdf.setFont('helvetica', 'normal');
        
        // 한글 텍스트를 위한 인코딩 설정
        if (pdf.internal && pdf.internal.getFont) {
            const font = pdf.internal.getFont();
            if (font && font.encoding) {
                // UTF-8 인코딩 강제 설정
                font.encoding = 'UTF-8';
            }
        }
        
        console.log('✅ PDF 한글 폰트 설정 완료');
        return true;
    } catch (error) {
        console.warn('⚠️ PDF 한글 폰트 설정 실패:', error);
        // 기본 설정으로 fallback
        pdf.setFont('helvetica', 'normal');
        return false;
    }
}

// 🔧 PDF 한글 텍스트 안전 출력 함수
function addKoreanText(pdf, text, x, y, options = {}) {
    try {
        // 한글 텍스트 전처리
        const processedText = text.toString().trim();
        
        // 텍스트가 비어있으면 건너뛰기
        if (!processedText) return;
        
        // 한글 포함 여부 확인
        const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(processedText);
        
        if (hasKorean) {
            // 한글이 포함된 경우 특별 처리
            // UTF-8 바이트 배열로 변환하여 처리
            try {
                const bytes = new TextEncoder().encode(processedText);
                const decoded = new TextDecoder('utf-8').decode(bytes);
                pdf.text(decoded, x, y, options);
            } catch (encodeError) {
                // 인코딩 실패 시 원본 텍스트 사용
                console.warn('⚠️ 텍스트 인코딩 실패, 원본 사용:', processedText);
                pdf.text(processedText, x, y, options);
            }
        } else {
            // 영어/숫자만 있는 경우 기본 처리
            pdf.text(processedText, x, y, options);
        }
    } catch (error) {
        console.warn('⚠️ PDF 텍스트 출력 실패:', error, '텍스트:', text);
        // 기본 출력으로 fallback
        try {
            pdf.text(text.toString(), x, y, options);
        } catch (fallbackError) {
            console.error('❌ PDF 텍스트 fallback도 실패:', fallbackError);
        }
    }
}

// 🎨 HTML 방식 부가세 신고서 PDF 생성 (한글 문제 해결)
async function generateVatPDFFromHTML(year, quarter, startMonth, endMonth, incomeData, expenseData, vatData) {
    try {
        console.log('📄 부가세 신고서 PDF 변환 시작... (HTML → 이미지 → PDF)');
        
        // HTML 템플릿 생성
        const today = new Date();
        const todayStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
        const deadline = getVatFilingDeadline(year, quarter);
        
        const vatHTML = `
            <div style="
                width: 794px; 
                padding: 40px; 
                background: white; 
                font-family: 'Noto Sans KR', 'Inter', sans-serif;
                color: #333;
                font-size: 14px;
                line-height: 1.5;
            ">
                <div style="text-align: center; margin-bottom: 40px; border-bottom: 2px solid #333; padding-bottom: 20px;">
                    <h1 style="margin: 0; font-size: 32px; font-weight: bold; color: #333;">부가가치세 신고서</h1>
                    <p style="margin: 15px 0 5px 0; font-size: 18px; color: #666;">신고기간: ${year}년 ${quarter}분기 (${startMonth}월 ~ ${endMonth}월)</p>
                    <p style="margin: 0; font-size: 14px; color: #999;">신고일자: ${todayStr}</p>
                </div>
                
                <div style="margin-bottom: 30px; background: #f8f9fa; padding: 25px; border-radius: 12px;">
                    <h3 style="margin: 0 0 20px 0; color: #333; font-size: 20px;">사업자 정보</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div>
                            <p style="margin: 8px 0; font-size: 16px;"><strong>사업자명:</strong> 투훈스 게러지</p>
                            <p style="margin: 8px 0; font-size: 16px;"><strong>업태:</strong> 서비스업</p>
                        </div>
                        <div>
                            <p style="margin: 8px 0; font-size: 16px;"><strong>사업자등록번호:</strong> 123-45-67890</p>
                            <p style="margin: 8px 0; font-size: 16px;"><strong>종목:</strong> 이륜차정비</p>
                        </div>
                    </div>
                </div>
                
                <div style="margin-bottom: 30px;">
                    <h3 style="margin: 0 0 20px 0; color: #333; font-size: 22px; border-left: 5px solid #333; padding-left: 15px;">1. 매출 현황</h3>
                    <div style="background: #f8f9fa; padding: 25px; border-radius: 12px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 25px; text-align: center;">
                            <div style="background: white; padding: 20px; border-radius: 8px;">
                                <p style="margin: 0 0 8px 0; color: #333; font-size: 16px;">공급가액</p>
                                <p style="margin: 0; font-size: 20px; font-weight: bold; color: #333;">${incomeData.totalSupply.toLocaleString()}원</p>
                            </div>
                            <div style="background: white; padding: 20px; border-radius: 8px;">
                                <p style="margin: 0 0 8px 0; color: #333; font-size: 16px;">부가세액</p>
                                <p style="margin: 0; font-size: 20px; font-weight: bold; color: #333;">${incomeData.totalVat.toLocaleString()}원</p>
                            </div>
                            <div style="background: white; padding: 20px; border-radius: 8px;">
                                <p style="margin: 0 0 8px 0; color: #333; font-size: 16px;">합계</p>
                                <p style="margin: 0; font-size: 20px; font-weight: bold; color: #333;">${incomeData.totalIncome.toLocaleString()}원</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div style="margin-bottom: 30px;">
                    <h3 style="margin: 0 0 20px 0; color: #333; font-size: 22px; border-left: 5px solid #333; padding-left: 15px;">2. 매입 현황</h3>
                    <div style="background: #f8f9fa; padding: 25px; border-radius: 12px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 20px; text-align: center;">
                            <div style="background: white; padding: 20px; border-radius: 8px;">
                                <p style="margin: 0 0 8px 0; color: #333; font-size: 14px;">공급가액</p>
                                <p style="margin: 0; font-size: 18px; font-weight: bold; color: #333;">${expenseData.totalSupply.toLocaleString()}원</p>
                            </div>
                            <div style="background: white; padding: 20px; border-radius: 8px;">
                                <p style="margin: 0 0 8px 0; color: #333; font-size: 14px;">부가세액</p>
                                <p style="margin: 0; font-size: 18px; font-weight: bold; color: #333;">${expenseData.totalVat.toLocaleString()}원</p>
                            </div>
                            <div style="background: white; padding: 20px; border-radius: 8px;">
                                <p style="margin: 0 0 8px 0; color: #333; font-size: 14px;">매입세액공제</p>
                                <p style="margin: 0; font-size: 18px; font-weight: bold; color: #333;">${expenseData.deductibleVat.toLocaleString()}원</p>
                            </div>
                            <div style="background: white; padding: 20px; border-radius: 8px;">
                                <p style="margin: 0 0 8px 0; color: #333; font-size: 14px;">합계</p>
                                <p style="margin: 0; font-size: 18px; font-weight: bold; color: #333;">${expenseData.totalExpense.toLocaleString()}원</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div style="margin-bottom: 40px;">
                    <h3 style="margin: 0 0 20px 0; color: #333; font-size: 22px; border-left: 5px solid #333; padding-left: 15px;">3. 부가세 계산</h3>
                    <div style="background: #f8f9fa; padding: 25px; border-radius: 12px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 25px; margin-bottom: 20px;">
                            <div style="background: white; padding: 20px; border-radius: 8px; text-align: center;">
                                <p style="margin: 0 0 8px 0; color: #333; font-size: 16px;">매출세액</p>
                                <p style="margin: 0; font-size: 20px; font-weight: bold; color: #333;">${incomeData.totalVat.toLocaleString()}원</p>
                            </div>
                            <div style="background: white; padding: 20px; border-radius: 8px; text-align: center;">
                                <p style="margin: 0 0 8px 0; color: #333; font-size: 16px;">매입세액공제</p>
                                <p style="margin: 0; font-size: 20px; font-weight: bold; color: #333;">${expenseData.deductibleVat.toLocaleString()}원</p>
                            </div>
                        </div>
                        
                        <div style="text-align: center; padding: 25px; background: white; border-radius: 12px; border: 3px solid #333;">
                            ${vatData.vatToPay > 0 ? `
                                <p style="margin: 0 0 8px 0; color: #333; font-size: 18px;">납부할 세액</p>
                                <p style="margin: 0; font-size: 28px; font-weight: bold; color: #333;">${vatData.vatToPay.toLocaleString()}원</p>
                            ` : vatData.refundAmount > 0 ? `
                                <p style="margin: 0 0 8px 0; color: #333; font-size: 18px;">환급받을 세액</p>
                                <p style="margin: 0; font-size: 28px; font-weight: bold; color: #333;">${vatData.refundAmount.toLocaleString()}원</p>
                            ` : `
                                <p style="margin: 0 0 8px 0; color: #333; font-size: 18px;">납부할 세액</p>
                                <p style="margin: 0; font-size: 28px; font-weight: bold; color: #333;">0원</p>
                            `}
                        </div>
                    </div>
                </div>
                
                <div style="margin-bottom: 40px;">
                    <h3 style="margin: 0 0 20px 0; color: #333; font-size: 22px; border-left: 5px solid #333; padding-left: 15px;">신고 및 납부 일정</h3>
                    <div style="background: #f8f9fa; padding: 25px; border-radius: 12px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 25px; text-align: center;">
                            <div style="background: white; padding: 20px; border-radius: 8px;">
                                <p style="margin: 0 0 8px 0; color: #333; font-size: 16px;">신고 마감일</p>
                                <p style="margin: 0; font-size: 18px; font-weight: bold; color: #333;">${deadline}</p>
                            </div>
                            <div style="background: white; padding: 20px; border-radius: 8px;">
                                <p style="margin: 0 0 8px 0; color: #333; font-size: 16px;">납부 마감일</p>
                                <p style="margin: 0; font-size: 18px; font-weight: bold; color: #333;">${deadline}</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 50px; text-align: center; border-top: 2px solid #ddd; padding-top: 30px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center;">
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
                            <p style="margin: 0 0 15px 0; font-size: 16px;">신고인</p>
                            <p style="margin: 0; font-size: 18px; font-weight: bold;">투훈스 게러지 (인)</p>
                        </div>
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
                            <p style="margin: 0 0 15px 0; font-size: 16px;">작성일</p>
                            <p style="margin: 0; font-size: 18px; font-weight: bold;">${todayStr}</p>
                        </div>
                    </div>
                </div>
                
                <div style="text-align: center; margin-top: 40px; font-size: 14px; color: #999;">- 1 -</div>
            </div>
        `;
        
        // 임시 div 생성
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = vatHTML;
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '-9999px';
        tempDiv.style.background = 'white';
        document.body.appendChild(tempDiv);
        
        // 잠시 대기 (DOM 렌더링 완료 대기)
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // html2canvas로 이미지 생성
        const canvas = await html2canvas(tempDiv.firstElementChild, {
            scale: 2,
            backgroundColor: '#ffffff',
            width: 794,
            allowTaint: true,
            useCORS: true,
            logging: false
        });
        
        // 임시 div 제거
        document.body.removeChild(tempDiv);
        
        // PDF 생성
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        // 캔버스를 이미지로 변환
        const imgData = canvas.toDataURL('image/png');
        
        // A4 크기 계산
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        // 이미지 크기 조정
        const imgWidth = pdfWidth;
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;
        
        // 페이지가 길면 여러 페이지로 분할
        let position = 0;
        let pageHeight = pdfHeight;
        
        while (position < imgHeight) {
            // 현재 페이지에 이미지 추가
            pdf.addImage(
                imgData, 
                'PNG', 
                0, 
                position === 0 ? 0 : -position, 
                imgWidth, 
                imgHeight
            );
            
            position += pageHeight;
            
            // 다음 페이지가 필요하면 추가
            if (position < imgHeight) {
                pdf.addPage();
            }
        }
        
        // PDF 저장
        const fileName = `부가세신고서_${year}년_${quarter}분기.pdf`;
        pdf.save(fileName);
        
        console.log('✅ 부가세 신고서 PDF 생성 완료 (한글 문제 해결됨!)');
        
    } catch (error) {
        console.error('❌ 부가세 신고서 PDF 생성 오류:', error);
        throw error;
    }
}