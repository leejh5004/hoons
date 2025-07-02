/*
 * TWOHOONS GARAGE - Mobile First Management System
 * Modern motorcycle maintenance management app
 */

// Global variables
let currentUser = null;
let isAdmin = false;
let db = null;
let uploadedPhotos = { before: null, during: null, after: null };
let adminNameCache = {};
let currentStep = 1;
let currentTheme = 'light';
let currentViewMode = 'card'; // 'card' or 'list'

// 📸 사진 보존 기간 설정 (30일)
const PHOTO_RETENTION_DAYS = 30;

// 📅 삭제 경고 기간 설정 (5일 전부터 경고)
const DELETE_WARNING_DAYS = 5;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 TWOHOONS GARAGE - Starting application...');
    
    // Initialize Firebase
    if (typeof firebase !== 'undefined') {
        db = firebase.firestore();
        console.log('✅ Firebase initialized');
    } else {
        console.error('❌ Firebase not loaded');
        return;
    }
    
    // Initialize app components
    initializeAuthSystem();
    initializeThemeSystem();
    initializeNavigation();
    initializeModals();
    initializeEventListeners();
    initializeSearchAndFilters();
    loadViewMode();
    
    // Check authentication state
    firebase.auth().onAuthStateChanged(handleAuthStateChange);
    
    // 📸 사진 정리 시스템 시작 (5초 후 실행 - 앱 로딩 완료 후)
    setTimeout(() => {
        schedulePhotoCleanup();
        checkPhotoWarnings(); // 삭제 임박 사진 경고 체크
    }, 5000);
    
    console.log('✅ Application initialized successfully');
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
}

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

async function handleAuthStateChange(user) {
    if (user) {
        console.log('✅ User authenticated:', user.email);
        
        try {
            // Get user data from Firestore
            const userDoc = await db.collection('users').doc(user.uid).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                
                // 관리자 이메일 체크
                const adminEmails = ['admin@admin.com', 'admin1@admin.com', 'admin2@admin.com'];
                const isAdminEmail = adminEmails.includes(user.email);
                
                currentUser = {
                    uid: user.uid,
                    email: user.email,
                    name: userData.name || (isAdminEmail ? '관리자' : '사용자'),
                    carNumber: userData.carNumber || (isAdminEmail ? 'admin1' : ''),
                    role: userData.role || (isAdminEmail ? 'admin' : 'user')
                };
                
                // 관리자 권한 부여
                isAdmin = isAdminEmail || currentUser.role === 'admin';
                
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
                
                console.log('👤 User role:', currentUser.role);
                console.log('🔧 Is admin (email check):', adminEmails.includes(user.email));
                console.log('🔧 Is admin (final):', isAdmin);
                
                // Switch to dashboard
                showScreen('dashboardScreen');
                updateUI();
                loadDashboardData();
                
                // Initialize notification system after user is loaded
                initializeNotificationSystem();
                
                showNotification(`환영합니다, ${currentUser.name}님!`, 'success');
            } else {
                console.log('📄 User document not found, creating new user...');
                
                // 관리자 이메일 체크
                const adminEmails = ['admin@admin.com', 'admin1@admin.com', 'admin2@admin.com'];
                const isAdminEmail = adminEmails.includes(user.email);
                
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
                    console.log('✅ Admin user document created');
                    
                } else {
                    // 일반 사용자는 문서가 없으면 로그아웃
                    console.error('❌ User document not found');
                    showNotification('사용자 정보를 찾을 수 없습니다.', 'error');
                    await firebase.auth().signOut();
                    return;
                }
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
        await firebase.auth().signOut();
        
        // 🔒 모든 사용자 데이터 완전 초기화
        currentUser = null;
        isAdmin = false;
        
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
        showScreen('auth');
        
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
// Navigation System
// =============================================

function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const profileBtn = document.getElementById('profileBtn');
    
    // Bottom navigation
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const screen = item.dataset.screen;
            
            // Update active nav item
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // Handle navigation
            switch (screen) {
                case 'dashboard':
                    showScreen('dashboardScreen');
                    loadDashboardData();
                    break;
                case 'add':
                    openMaintenanceModal();
                    break;
                case 'search':
                    focusSearchInput();
                    break;
                case 'profile':
                    showProfileOptions();
                    break;
            }
        });
    });
    
    // Profile button
    if (profileBtn) {
        profileBtn.addEventListener('click', showProfileOptions);
    }
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
    const options = [
        { text: '로그아웃', action: handleLogout, icon: 'fas fa-sign-out-alt' }
    ];
    
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
                                <input type="text" id="newCarNumber" value="${currentCarNumber}" 
                                       placeholder="예: 12가3456" required>
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
    
    // 입력 필드에 포커스
    setTimeout(() => {
        const input = document.getElementById('newCarNumber');
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);
}

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
    
    const notificationBtn = document.getElementById('notificationBtn');
    if (notificationBtn) {
        notificationBtn.addEventListener('click', showNotificationPanel);
    }
    
    // 기존 알림 로딩
    loadNotifications();
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
        <div id="notificationPanel" class="notification-panel">
            <div class="notification-panel-header">
                <h3><i class="fas fa-bell"></i> 알림</h3>
                <button class="clear-all-btn" onclick="clearAllNotifications()">
                    <i class="fas fa-check-double"></i> 모두 읽음
                </button>
            </div>
            <div class="notification-panel-body" id="notificationPanelBody">
                ${notifications.length > 0 ? 
                    notifications.map(notification => createNotificationItem(notification)).join('') :
                    '<div class="no-notifications"><i class="fas fa-inbox"></i><p>새로운 알림이 없습니다</p></div>'
                }
            </div>
        </div>
        <div class="notification-panel-backdrop" onclick="closeNotificationPanel()"></div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', panelHTML);
    
    // 모든 알림을 읽음으로 표시
    markAllAsRead();
}

// 알림 패널 닫기
function closeNotificationPanel() {
    const panel = document.getElementById('notificationPanel');
    const backdrop = document.querySelector('.notification-panel-backdrop');
    
    try {
        if (panel) panel.remove();
        if (backdrop) backdrop.remove();
    } catch (error) {
        console.log('Panel/backdrop already removed:', error);
    }
}

// 알림 아이템 생성
function createNotificationItem(notification) {
    const timeAgo = getTimeAgo(notification.createdAt);
    const iconClass = getNotificationIcon(notification.type);
    const statusColor = getNotificationColor(notification.type);
    
    return `
        <div class="notification-item ${notification.read ? 'read' : 'unread'}" data-id="${notification.id}">
            <div class="notification-icon" style="background: ${statusColor}">
                <i class="${iconClass}"></i>
            </div>
            <div class="notification-content">
                <h4 class="notification-title">${notification.title}</h4>
                <p class="notification-message">${notification.message}</p>
                <span class="notification-time">${timeAgo}</span>
            </div>
            ${!notification.read ? '<div class="unread-indicator"></div>' : ''}
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
    
    try {
        await db.collection('notifications').add({
            ...notification,
            userId: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('✅ Notification saved to Firebase');
    } catch (error) {
        console.error('❌ Error saving notification:', error);
    }
}

// Firebase에서 알림 로딩
async function loadNotifications() {
    if (!currentUser) return;
    
    try {
        const snapshot = await db.collection('notifications')
            .where('userId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
        
        notifications = [];
        unreadCount = 0;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const notification = {
                id: doc.id,
                ...data,
                createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString()
            };
            
            notifications.push(notification);
            if (!notification.read) {
                unreadCount++;
            }
        });
        
        updateNotificationBadge();
        console.log('📱 Loaded notifications:', notifications.length);
        
    } catch (error) {
        console.error('❌ Error loading notifications:', error);
    }
}

// 모든 알림을 읽음으로 표시
async function markAllAsRead() {
    if (unreadCount === 0) return;
    
    try {
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
        
    } catch (error) {
        console.error('❌ Error marking notifications as read:', error);
    }
}

// 모든 알림 지우기
async function clearAllNotifications() {
    try {
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
        
    } catch (error) {
        console.error('❌ Error clearing notifications:', error);
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
// Dashboard System
// =============================================

async function loadDashboardData() {
    console.log('📊 Loading dashboard data...');
    
    // 🔒 로그인 상태 체크 - 보안 강화
    if (!currentUser) {
        console.log('🚫 Not logged in - redirecting to auth screen');
        showNotification('로그인이 필요합니다.', 'error');
        showScreen('auth');
        return;
    }
    
    try {
        // Show loading
        showLoadingSpinner(true);
        
        // Load statistics
        await Promise.all([
            updateTodayStats(),
            updatePendingStats(),
            updateMonthStats(),
            updateAverageStats(),
            loadMaintenanceTimeline()
        ]);
        
        showLoadingSpinner(false);
        
    } catch (error) {
        console.error('❌ Error loading dashboard:', error);
        showNotification('대시보드 로딩 실패', 'error');
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
        
        const today = new Date().toISOString().split('T')[0];
        let query = db.collection('maintenance').where('date', '==', today);
        
        if (isAdmin) {
            query = query.where('adminEmail', '==', currentUser.email);
        } else {
            query = query.where('carNumber', '==', currentUser.carNumber);
        }
        
        const snapshot = await query.get();
        const count = snapshot.size;
        
        updateStatCard('todayCount', count);
        
    } catch (error) {
        console.error('❌ Error updating today stats:', error);
        updateStatCard('todayCount', 0);
    }
}

async function updatePendingStats() {
    try {
        // 🔒 로그인 상태 체크
        if (!currentUser) {
            updateStatCard('pendingCount', 0);
            return;
        }
        
        let query = db.collection('maintenance').where('status', '==', 'pending');
        
        if (isAdmin) {
            query = query.where('adminEmail', '==', currentUser.email);
        } else {
            query = query.where('carNumber', '==', currentUser.carNumber);
        }
        
        const snapshot = await query.get();
        const count = snapshot.size;
        
        updateStatCard('pendingCount', count);
        
    } catch (error) {
        console.error('❌ Error updating pending stats:', error);
        updateStatCard('pendingCount', 0);
    }
}

async function updateMonthStats() {
    try {
        // 🔒 로그인 상태 체크
        if (!currentUser) {
            updateStatCard('monthCount', 0);
            return;
        }
        
        // 단순한 쿼리로 변경 - 인덱스 오류 방지
        let query = db.collection('maintenance');
        
        // 권한별 필터링
        if (!isAdmin && currentUser && currentUser.carNumber) {
            query = query.where('carNumber', '==', currentUser.carNumber);
        } else if (isAdmin && currentUser) {
            query = query.where('adminEmail', '==', currentUser.email);
        }
        
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
        
        updateStatCard('monthCount', monthCount);
        
    } catch (error) {
        console.error('❌ Error updating month stats:', error);
        updateStatCard('monthCount', 0);
    }
}

async function updateAverageStats() {
    try {
        // 🔒 로그인 상태 체크
        if (!currentUser) {
            updateStatCard('averageDays', '-');
            return;
        }
        
        // 단순한 쿼리로 변경 - 인덱스 오류 방지
        let query = db.collection('maintenance');
        
        // 권한별 필터링
        if (!isAdmin && currentUser && currentUser.carNumber) {
            query = query.where('carNumber', '==', currentUser.carNumber);
        } else if (isAdmin && currentUser) {
            query = query.where('adminEmail', '==', currentUser.email);
        }
        
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
                updateStatCard('averageDays', `${averageDays}일`);
            } else {
                updateStatCard('averageDays', '-');
            }
        } else {
            updateStatCard('averageDays', '-');
        }
        
    } catch (error) {
        console.error('❌ Error updating average stats:', error);
        updateStatCard('averageDays', '-');
    }
}

function updateStatCard(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value;
    }
}

function showLoadingSpinner(show) {
    const spinner = document.getElementById('loadingSpinner');
    const content = document.getElementById('timelineContent');
    
    if (spinner) {
        spinner.style.display = show ? 'block' : 'none';
    }
    
    if (content) {
        content.style.display = show ? 'none' : 'block';
    }
}

// =============================================
// Maintenance Timeline
// =============================================

async function loadMaintenanceTimeline(searchTerm = '') {
    console.log('📋 Loading maintenance timeline...');
    console.log('👤 Current user:', currentUser);
    console.log('🔧 Is admin:', isAdmin);
    
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
    
    // 로딩 스피너 표시
    showLoadingSpinner(true);
    
    try {
        // 간단한 쿼리로 시작 (orderBy 제거)
        let query = db.collection('maintenance');
        
        console.log('🔍 Executing simple query...');
        const snapshot = await query.get();
        console.log('📊 Found documents:', snapshot.size);
        
        const maintenances = [];
        
        snapshot.docs.forEach((doc) => {
            const data = doc.data();
            const maintenance = { 
                ...data, 
                id: doc.id,
                // 날짜 포맷 보정
                date: data.date || data.createdAt?.toDate?.()?.toISOString()?.split('T')[0] || '2024-01-01'
            };
            
            maintenances.push(maintenance);
            console.log('📋 Added maintenance:', maintenance.id, maintenance.type, maintenance.carNumber);
        });
        
        // 날짜순 정렬 (클라이언트에서)
        maintenances.sort((a, b) => {
            const dateA = new Date(a.date || '2024-01-01');
            const dateB = new Date(b.date || '2024-01-01');
            return dateB - dateA; // 최신순
        });
        
        // 권한별 필터링
        let filteredMaintenances = maintenances;
        if (!isAdmin && currentUser && currentUser.carNumber) {
            // 일반 사용자: 자신의 차량번호만
            filteredMaintenances = maintenances.filter(m => 
                m.carNumber === currentUser.carNumber
            );
            console.log('🚗 User filtered by car number:', currentUser.carNumber, filteredMaintenances.length);
        } else if (isAdmin && currentUser) {
            // 관리자: 자신이 작업한 정비만
            filteredMaintenances = maintenances.filter(m => 
                m.adminEmail === currentUser.email
            );
            console.log('👨‍💼 Admin filtered by email:', currentUser.email, filteredMaintenances.length);
        }
        
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
        
        console.log('✅ About to render', filteredMaintenances.length, 'maintenances');
        await renderRealMaintenanceTimeline(filteredMaintenances);
        
        // 로딩 완료 후 스피너 숨기기
        showLoadingSpinner(false);
        
    } catch (error) {
        console.error('❌ Error loading timeline:', error);
        showNotification('정비 이력 로딩 실패: ' + error.message, 'error');
        
        // 오류 발생 시에도 스피너 숨기기
        showLoadingSpinner(false);
        
        // 오류 시 테스트 데이터라도 보여주기
        await renderRealMaintenanceTimeline([]);
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
        const photoIndicator = photoCount > 0 ? ` <span style="background: rgba(255,255,255,0.3); padding: 2px 6px; border-radius: 12px; font-size: 12px; margin-left: 8px;">📸${photoCount}</span>` : '';
        
        return `
            <div class="maintenance-card-view" style="background: ${gradient}; color: white; padding: 25px; margin: 15px 0; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); cursor: pointer;" onclick="showMaintenanceDetail('${maintenance.id}')">
                <h3 style="margin: 0 0 15px 0; font-size: 20px;">
                    ${typeIcon} ${maintenance.type || '정비'}${photoIndicator}
                </h3>
                <p style="margin: 5px 0; opacity: 0.9;">
                    📅 ${maintenance.date || '날짜 없음'}
                </p>
                <p style="margin: 5px 0; opacity: 0.9;">
                    🏍️ 차량번호: ${maintenance.carNumber || '없음'}
                </p>
                <p style="margin: 5px 0; opacity: 0.9;">
                    📋 상태: <span style="background: ${statusColor}; padding: 4px 8px; border-radius: 4px; font-size: 12px; color: white;">${getStatusText(maintenance.status) || maintenance.status || '없음'}</span>
                </p>
                ${maintenance.mileage ? `<p style="margin: 5px 0; opacity: 0.9;">📏 주행거리: ${maintenance.mileage}km</p>` : ''}
                ${(maintenance.status === 'approved' || maintenance.status === 'rejected') && maintenance.adminName ? `<p style="margin: 5px 0; opacity: 0.9;">👨‍💼 관리자: ${maintenance.adminName}</p>` : ''}
                ${photoDeleteInfo}
                <p style="margin: 15px 0 0 0; line-height: 1.5;">
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
    initializeMaintenanceModal();
    initializeSearchAndFilters();
}

function initializeMaintenanceModal() {
    const fab = document.getElementById('addMaintenanceFab');
    const prevBtn = document.getElementById('prevStep');
    const nextBtn = document.getElementById('nextStep');
    const submitBtn = document.getElementById('submitForm');
    const form = document.getElementById('maintenanceForm');
    
    if (fab) {
        fab.addEventListener('click', openMaintenanceModal);
    }
    
    if (prevBtn) {
        prevBtn.addEventListener('click', goToPreviousStep);
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', goToNextStep);
    }
    
    if (form) {
        form.addEventListener('submit', handleMaintenanceSubmit);
    }
    
    // Initialize type selector
    initializeTypeSelector();
    initializePhotoUpload();
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
    }
}

function closeMaintenanceModal() {
    const modal = document.getElementById('maintenanceModal');
    if (modal) {
        modal.classList.remove('active');
        resetMaintenanceForm();
        
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
    
    // Reset type selector
    document.querySelectorAll('.type-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    // 사진 리셋은 모달을 완전히 닫을 때만 수행
    // uploadedPhotos 초기화와 resetPhotoUploads() 제거
    
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
async function handleMaintenanceSubmit(e) {
    e.preventDefault();
    
    if (!validateCurrentStep()) {
        return;
    }
    
    try {
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
        
        console.log('📝 Creating maintenance with status:', formData.status);
        
        // 수정 모드인지 확인
        if (window.editingMaintenanceId) {
            // 수정 모드
            console.log('📝 Updating existing maintenance:', window.editingMaintenanceId);
            
            // 수정 시에는 상태를 변경하지 않음 (진행중 유지)
            delete formData.status;
            delete formData.createdAt;
            formData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            
            await db.collection('maintenance').doc(window.editingMaintenanceId).update(formData);
            console.log('✅ Maintenance updated successfully');
            
            // 사진 업로드 (있는 경우)
            if (uploadedPhotos.before || uploadedPhotos.during || uploadedPhotos.after) {
                const photos = await uploadMaintenancePhotos(window.editingMaintenanceId);
                if (photos.length > 0) {
                    // 기존 사진에 새 사진 추가
                    const currentDoc = await db.collection('maintenance').doc(window.editingMaintenanceId).get();
                    const currentPhotos = currentDoc.data().photos || [];
                    const allPhotos = [...currentPhotos, ...photos];
                    
                    await db.collection('maintenance').doc(window.editingMaintenanceId).update({
                        photos: allPhotos
                    });
                    console.log('✅ Photos updated for maintenance record:', allPhotos.length);
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
            console.log('📸 During photo exists:', !!uploadedPhotos.during);  
            console.log('📸 After photo exists:', !!uploadedPhotos.after);
            
            if (uploadedPhotos.before || uploadedPhotos.during || uploadedPhotos.after) {
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
        if (uploadedPhotos.before || uploadedPhotos.during || uploadedPhotos.after) {
            setTimeout(() => {
                showNotification(`📸 등록된 사진은 ${PHOTO_RETENTION_DAYS}일 후 자동 삭제됩니다.`, 'info');
            }, 2000);
        }
        }
        
        closeMaintenanceModal();
        
        // 대시보드 데이터 새로고침
        loadDashboardData();
        
    } catch (error) {
        console.error('❌ Error submitting maintenance:', error);
        showNotification('정비 이력 등록 실패: ' + error.message, 'error');
    }
}

// 타입 선택기 초기화 함수
function initializeTypeSelector() {
    const typeOptions = document.querySelectorAll('.type-option');
    const typeInput = document.getElementById('maintenanceType');
    
    typeOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove selected from all options
            typeOptions.forEach(opt => opt.classList.remove('selected'));
            // Add selected to clicked option
            option.classList.add('selected');
            // Update hidden input value
            if (typeInput) {
                typeInput.value = option.dataset.type;
            }
        });
    });
}

// 사진 업로드 초기화 함수
function initializePhotoUpload() {
    console.log('🖼️ Initializing photo upload...');
    
    // 사진 업로드 영역 클릭 이벤트
    const photoAreas = document.querySelectorAll('.photo-upload-area');
    console.log('📸 Found photo areas:', photoAreas.length);
    
    photoAreas.forEach((area, index) => {
        const type = area.dataset.type;
        console.log(`📸 Setting up area ${index + 1}:`, type);
        
        // 기존 이벤트 제거 후 새로 추가
        area.replaceWith(area.cloneNode(true));
        const newArea = document.querySelectorAll('.photo-upload-area')[index];
        
        newArea.addEventListener('click', () => {
            console.log('📸 Photo area clicked:', type);
            const fileInput = document.getElementById(`${type}Photo`);
            if (fileInput) {
                fileInput.click();
            } else {
                console.error('❌ File input not found:', `${type}Photo`);
            }
        });
    });
    
    // 파일 입력 이벤트
    const photoInputs = ['beforePhoto', 'duringPhoto', 'afterPhoto'];
    
    photoInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            console.log('📸 Setting up file input:', inputId);
            
            // 기존 이벤트 제거 후 새로 추가
            input.replaceWith(input.cloneNode(true));
            const newInput = document.getElementById(inputId);
            
            newInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                console.log('📸 File selected:', file?.name);
                
                if (file) {
                    const photoType = inputId.replace('Photo', '');
                    console.log('📸 Processing photo type:', photoType);
                    handlePhotoUpload(file, photoType);
                }
            });
        } else {
            console.error('❌ Photo input not found:', inputId);
        }
    });
    
    console.log('✅ Photo upload initialization complete');
}

// 사진 업로드 처리 함수
async function handlePhotoUpload(file, type) {
    try {
        console.log(`📸 Processing ${type} photo upload:`, file.name, file.size, 'bytes');
        
        // 이미지 리사이즈
        const resizedFile = await resizeImage(file);
        console.log(`📸 Resized ${type} photo:`, resizedFile.size, 'bytes');
        
        // Base64로 변환하여 임시 저장
        const base64 = await convertToBase64(resizedFile);
        console.log(`📸 Converted ${type} to base64:`, base64.length, 'characters');
        console.log(`📸 Base64 preview for ${type}:`, base64.substring(0, 50) + '...');
        
        uploadedPhotos[type] = base64;
        console.log(`📸 Saved ${type} to uploadedPhotos. Current keys:`, Object.keys(uploadedPhotos));
        
        // 미리보기 표시
        showPhotoPreview(base64, type);
        
        showNotification(`${type} 사진이 업로드되었습니다.`, 'success');
        
    } catch (error) {
        console.error(`❌ Error uploading ${type} photo:`, error);
        showNotification(`${type} 사진 업로드 실패: ${error.message}`, 'error');
    }
}

// 사진 미리보기 표시 함수
function showPhotoPreview(base64, type) {
    console.log('🖼️ Showing photo preview for:', type);
    
    // 업로드 영역 찾기
    const uploadArea = document.querySelector(`[data-type="${type}"]`);
    if (!uploadArea) {
        console.error('❌ Upload area not found for:', type);
        return;
    }
    
    const placeholder = uploadArea.querySelector('.upload-placeholder');
    const preview = uploadArea.querySelector('.photo-preview');
    
    if (placeholder && preview) {
        // 플레이스홀더 숨기고 미리보기 표시
        placeholder.style.display = 'none';
        preview.style.display = 'block';
        
        const img = preview.querySelector('img');
        if (img) {
            img.src = base64;
        }
        
        console.log('✅ Photo preview updated for:', type);
    } else {
        console.error('❌ Preview elements not found for:', type);
    }
}

// 사진 제거 함수
function removePhoto(type) {
    console.log('🗑️ Removing photo:', type);
    
    uploadedPhotos[type] = null;
    
    // 업로드 영역 찾기
    const uploadArea = document.querySelector(`[data-type="${type}"]`);
    if (uploadArea) {
        const placeholder = uploadArea.querySelector('.upload-placeholder');
        const preview = uploadArea.querySelector('.photo-preview');
        
        if (placeholder && preview) {
            // 미리보기 숨기고 플레이스홀더 표시
            preview.style.display = 'none';
            placeholder.style.display = 'flex';
            
            console.log('✅ Photo preview hidden for:', type);
        }
    }
    
    // 파일 입력 초기화
    const input = document.getElementById(`${type}Photo`);
    if (input) {
        input.value = '';
    }
    
    showNotification(`${type} 사진이 제거되었습니다.`, 'info');
}

// 전역 함수로 만들어서 HTML에서 호출 가능하게 함
window.removePhoto = removePhoto;

// 사진 업로드 리셋 함수
function resetPhotoUploads() {
    uploadedPhotos = { before: null, during: null, after: null };
    
    ['before', 'during', 'after'].forEach(type => {
        const previewContainer = document.getElementById(`${type}Preview`);
        if (previewContainer) {
            previewContainer.innerHTML = '';
        }
        const input = document.getElementById(`${type}Photo`);
        if (input) {
            input.value = '';
        }
    });
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

            // 도장(관리자 이름) 노출 조건: 확인/거절 상태일 때만
    const showAdminSeal = maintenance.status === 'approved' || maintenance.status === 'rejected';

    card.innerHTML = `
        <div class="maintenance-card-header">
            <span class="maintenance-type-icon">${getTypeIcon(maintenance.type)}</span>
            <span class="maintenance-card-title">${maintenance.type || ''}</span>
            <span class="maintenance-date text-muted mb-1">${maintenance.date || ''}</span>
            <span class="maintenance-status-badge ${maintenance.status}">${getStatusText(maintenance.status)}</span>
        </div>
        <div class="maintenance-card-body">
            <div class="maintenance-motorcycle-number">
                <i class="fas fa-motorcycle"></i> 오토바이 번호: ${maintenance.carNumber}
            </div>
            ${maintenance.mileage ? `
                <div class="maintenance-mileage">
                    <i class="fas fa-tachometer-alt"></i> 키로수: ${maintenance.mileage}km
                </div>
            ` : ''}
            <div class="maintenance-description">${maintenance.description || ''}</div>
        </div>
        <div class="maintenance-card-footer">
            ${showAdminSeal ? `
                <span class="maintenance-admin">
                    <i class="fas fa-user-shield"></i> 관리자: ${adminName}
                </span>
            ` : ''}
            ${!isAdmin && maintenance.status === 'pending' ? `
                <button class="btn btn-success btn-sm" onclick="event.stopPropagation(); updateMaintenanceStatus('${maintenance.id}', 'approved')">
                                            <i class="fas fa-check"></i> 확인
                </button>
                <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); updateMaintenanceStatus('${maintenance.id}', 'rejected')">
                    <i class="fas fa-times"></i> 거절
                </button>
            ` : ''}
        </div>
    `;
    return card;
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
        
        // 권한 체크: 관리자는 진행중 상태만 완료로 변경 가능, 사용자는 완료된 것만 확인/거절 가능
        if (isAdmin && maintenanceData.status === 'in-progress' && newStatus === 'completed') {
            await completeMaintenanceWork(maintenanceId);
            return;
        } else if (!isAdmin && maintenanceData.status === 'completed' && ['approved', 'rejected'].includes(newStatus)) {
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

// 알림 표시
function showNotification(message, type = 'info') {
    const container = document.getElementById('notificationContainer');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: var(--space-sm);">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;
    
    container.appendChild(notification);
    
    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Auto hide after 1.5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            try {
                if (notification.parentNode) {
                    notification.remove();
                }
            } catch (error) {
                console.log('Notification already removed:', error);
            }
        }, 300);
    }, 1500);
}

function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'warning': return 'exclamation-triangle';
        default: return 'info-circle';
    }
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

function updateUI() {
    // Update FAB visibility
    const fab = document.getElementById('addMaintenanceFab');
    if (fab) {
        fab.style.display = isAdmin ? 'flex' : 'none';
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
    
    if (quickSearch) {
        quickSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value;
            loadMaintenanceTimeline(searchTerm);
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

// 대시보드 데이터 로딩 함수 (완전 구현)
function loadDashboardData() {
    console.log('📊 Loading dashboard data...');
    
    // 🔒 로그인 상태 체크 - 보안 강화
    if (!currentUser) {
        console.log('🚫 Not logged in - redirecting to auth screen');
        showNotification('로그인이 필요합니다.', 'error');
        showScreen('auth');
        return;
    }
    
    // 통계 업데이트
    updateTodayStats();
    updatePendingStats(); 
    updateMonthStats();
    updateAverageStats();
    
    // 정비 이력 로딩
    loadMaintenanceTimeline();
}

// 이벤트 리스너 초기화 함수
function initializeEventListeners() {
    console.log('🎯 Initializing event listeners...');
    
    // 보기 전환 버튼 이벤트 리스너
    const viewToggle = document.getElementById('viewToggle');
    if (viewToggle) {
        viewToggle.addEventListener('click', toggleViewMode);
    }
    
    // 페이지 새로고침 시 로그인 화면 표시
    window.addEventListener('beforeunload', () => {
        showScreen('loginScreen');
    });
    
    // 키보드 단축키
    document.addEventListener('keydown', (e) => {
        // ESC 키로 모달 닫기
        if (e.key === 'Escape') {
            closeMaintenanceModal();
        }
    });
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
        
        // UI 업데이트 - 사용자 정보가 표시되는 곳이 있다면 업데이트
        console.log('✅ Car number updated in currentUser:', currentUser.carNumber);
        
        showNotification('오토바이 번호가 수정되었습니다.', 'success');
        
        // 대시보드 데이터 새로고침
        loadDashboardData();
        
    } catch (error) {
        console.error('Error updating car number:', error);
        showNotification('오토바이 번호 수정 실패: ' + error.message, 'error');
    }
}

// 이미지 리사이즈 함수 (toBlob 실패 시 toDataURL로 fallback, PNG도 지원)
async function resizeImage(file) {
    return new Promise((resolve, reject) => {
        if (file.size <= 1024 * 1024) {
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
                    const maxSize = 800;
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
                    }, 'image/jpeg', 0.8);
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

// ImgBB 업로드만 사용하는 함수로 고정
async function uploadMaintenancePhotos(maintenanceId) {
    const photos = [];
    console.log('📸 Uploading photos for maintenance:', maintenanceId);
    console.log('📸 Photos to upload:', uploadedPhotos);
    console.log('📸 uploadedPhotos keys:', Object.keys(uploadedPhotos));
    
    // 각 타입별로 명시적으로 확인
    const photoTypes = ['before', 'during', 'after'];
    
    for (const type of photoTypes) {
        const base64Data = uploadedPhotos[type];
        console.log(`📸 Checking ${type} photo:`, !!base64Data, base64Data ? 'length: ' + base64Data.length : 'no data');
        
        if (base64Data && base64Data.trim()) {
            try {
                console.log(`📸 Starting upload for ${type} photo...`);
                
                // Base64 데이터 검증
                if (!base64Data.includes('data:image')) {
                    console.error(`❌ Invalid base64 format for ${type}:`, base64Data.substring(0, 50));
                    continue;
                }
                
                // Base64 데이터에서 data:image/... 부분 제거
                const base64Image = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
                
                if (!base64Image || base64Image.length < 100) {
                    console.error(`❌ Invalid base64 content for ${type}:`, base64Image ? base64Image.length : 'empty');
                    continue;
                }
                
                // ImgBB API 호출
                const formData = new FormData();
                formData.append('key', IMGBB_API_KEY);
                formData.append('image', base64Image);
                formData.append('name', `maintenance_${maintenanceId}_${type}_${Date.now()}`);
                
                console.log(`📸 Calling ImgBB API for ${type}...`);
                const response = await fetch('https://api.imgbb.com/1/upload', {
                    method: 'POST',
                    body: formData
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const result = await response.json();
                console.log(`📸 ImgBB response for ${type}:`, result.success ? 'SUCCESS' : 'FAILED', result.error);
                
                if (result.success) {
                    const photoData = {
                        type,
                        url: result.data.url,
                        thumbnailUrl: result.data.thumb ? result.data.thumb.url : result.data.url,
                        deleteUrl: result.data.delete_url, // 🗑️ 삭제 URL 저장
                        imgbbId: result.data.id, // 📸 imgbb ID 저장
                        createdAt: new Date().toISOString(),
                        filename: `${type}_${Date.now()}.jpg`
                    };
                    
                    photos.push(photoData);
                    console.log(`✅ ${type} photo uploaded successfully:`, result.data.url);
                    console.log(`🗑️ Delete URL saved:`, result.data.delete_url);
                } else {
                    console.error(`❌ ImgBB upload failed for ${type}:`, result);
                    showNotification(`${type} 사진 업로드 실패: ${result.error?.message || '알 수 없는 오류'}`, 'error');
                }
            } catch (err) {
                console.error(`❌ Error uploading ${type} photo:`, err);
                showNotification(`${type} 사진 업로드 실패: ${err.message}`, 'error');
            }
        } else {
            console.log(`📸 No ${type} photo to upload`);
        }
    }
    
    console.log('📸 Final uploaded photos count:', photos.length);
    console.log('📸 Final uploaded photos:', photos.map(p => ({ type: p.type, url: p.url })));
    return photos;
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
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                        <h3 style="margin: 0 0 10px 0; font-size: 20px;">${typeIcon} ${maintenance.type || '정비'}</h3>
                        <p style="margin: 5px 0; opacity: 0.9;">📅 날짜: ${formatDate(maintenance.date) || '날짜 없음'}</p>
                        <p style="margin: 5px 0; opacity: 0.9;">🏍️ 차량번호: ${maintenance.carNumber || '없음'}</p>
                        <p style="margin: 5px 0; opacity: 0.9;">
                            📋 상태: <span style="background: ${statusInfo.color}; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                                ${statusInfo.text || maintenance.status || '없음'}
                            </span>
                        </p>
                        ${maintenance.mileage ? `<p style="margin: 5px 0; opacity: 0.9;">📏 주행거리: ${maintenance.mileage}km</p>` : ''}
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                        <h4 style="margin: 0 0 15px 0; color: #333;">📝 상세 설명</h4>
                        <p style="line-height: 1.6; color: #555; white-space: pre-wrap;">${maintenance.description || '설명이 없습니다.'}</p>
                    </div>
                    
                    ${(() => {
                        // 🔄 신규 방식과 기존 방식 모두 지원하는 사진 처리
                        let photos = [];
                        
                        // 1️⃣ 신규 방식: photos 배열 확인
                        if (maintenance.photos && maintenance.photos.length > 0) {
                            console.log('📸 신규 방식 사진 발견:', maintenance.photos.length + '개');
                            photos = maintenance.photos.map(photo => ({
                                url: photo.url,
                                type: photo.type === 'before' ? '정비 전' : 
                                      photo.type === 'during' ? '정비 중' : 
                                      photo.type === 'after' ? '정비 후' : photo.type
                            }));
                        } 
                        // 2️⃣ 기존 방식: 개별 필드 확인
                        else {
                            console.log('📸 기존 방식 사진 확인 중...');
                            if (maintenance.beforePhoto) {
                                photos.push({ url: maintenance.beforePhoto, type: '정비 전' });
                                console.log('📸 정비 전 사진 발견');
                            }
                            if (maintenance.duringPhoto) {
                                photos.push({ url: maintenance.duringPhoto, type: '정비 중' });
                                console.log('📸 정비 중 사진 발견');
                            }
                            if (maintenance.afterPhoto) {
                                photos.push({ url: maintenance.afterPhoto, type: '정비 후' });
                                console.log('📸 정비 후 사진 발견');
                            }
                        }
                        
                        const hasPhotos = photos.length > 0;
                        console.log('📸 총 발견된 사진:', photos.length + '개');
                        
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
                            
                            return `
                                <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                                    <h4 style="margin: 0 0 15px 0; color: #333;">📸 사진 (${photos.length}장)</h4>
                                    ${photoDeleteInfo}
                                    
                                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px;">
                                        ${photos.map(photo => `
                                            <div style="position: relative; background: white; border-radius: 10px; padding: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                                                <img src="${photo.url}" alt="${photo.type}" 
                                                     style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px; cursor: pointer;" 
                                                     onclick="showPhotoModal('${photo.url}')"
                                                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                                <div style="display: none; width: 100%; height: 150px; background: #ddd; border-radius: 8px; align-items: center; justify-content: center; color: #666; flex-direction: column;">
                                                    <i class="fas fa-image" style="font-size: 24px; margin-bottom: 8px;"></i>
                                                    <span style="font-size: 12px;">이미지 로딩 실패</span>
                                                </div>
                                                <div style="margin-top: 8px; text-align: center;">
                                                    <span style="font-size: 12px; font-weight: bold; color: #666;">${photo.type}</span>
                                                    <br>
                                                    <button onclick="downloadPhoto('${photo.url}', '${maintenance.type || '정비'}_${photo.type}_${maintenance.date || 'unknown'}.jpg'); event.stopPropagation();" 
                                                            style="background: #28a745; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; margin-top: 4px;">
                                                        <i class="fas fa-download"></i> 다운로드
                                                    </button>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                    
                                    <div style="margin-top: 15px; text-align: center;">
                                        <button onclick="downloadAllPhotos('${maintenance.id}', '${maintenance.type || '정비'}', '${maintenance.date || 'unknown'}')" 
                                                style="background: #007bff; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-size: 14px; cursor: pointer;">
                                            <i class="fas fa-download"></i> 모든 사진 다운로드
                                        </button>
                                    </div>
                                </div>
                            `;
                        }
                        return '';
                    })()}
                    
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 12px;">
                        <h4 style="margin: 0 0 15px 0; color: #333;">ℹ️ 추가 정보</h4>
                        <p style="margin: 5px 0; color: #666;">🆔 ID: ${maintenance.id}</p>
                        <p style="margin: 5px 0; color: #666;">📅 등록일: ${maintenance.createdAt ? new Date(maintenance.createdAt.toDate()).toLocaleString('ko-KR') : '없음'}</p>
                        ${maintenance.adminName ? `<p style="margin: 5px 0; color: #666;">👨‍💼 관리자: ${maintenance.adminName}</p>` : ''}
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
                            // 관리자 화면
                            if (maintenance.status === 'in-progress') {
                                console.log('⚙️ In-progress status - showing edit/complete buttons');
                                // 진행중: 수정 + 완료 버튼
                                return `
                                    <button class="btn btn-primary" onclick="editMaintenance('${maintenance.id}')">
                                        <i class="fas fa-edit"></i> 수정
                                    </button>
                                    <button class="btn btn-success" onclick="completeMaintenanceWork('${maintenance.id}'); closeMaintenanceDetailModal();">
                                        <i class="fas fa-check-circle"></i> 정비완료
                                    </button>
                                `;
                            } else {
                                console.log('❌ Status not in-progress, no admin buttons shown. Current status:', maintenance.status);
                                console.log('❌ Expected status: "in-progress", actual status: "' + maintenance.status + '"');
                                // 상태가 in-progress가 아닌 경우에도 정보 표시용 버튼을 제공
                                return `
                                    <div style="padding: 10px; background: #f8f9fa; border-radius: 8px; color: #666; text-align: center;">
                                        상태: ${maintenance.status} (진행중인 정비만 수정/완료 가능)
                                    </div>
                                `;
                            }
                        } else {
                            console.log('👤 User view detected');
                            // 사용자 화면
                            if (maintenance.status === 'completed') {
                                console.log('✅ Completed status - showing approve/reject buttons');
                                // 완료됨: 확인/거절 버튼
                                return `
                                    <button class="btn btn-success" onclick="updateMaintenanceStatus('${maintenance.id}', 'approved'); closeMaintenanceDetailModal();">
                                        <i class="fas fa-thumbs-up"></i> 확인
                                    </button>
                                    <button class="btn btn-danger" onclick="updateMaintenanceStatus('${maintenance.id}', 'rejected'); closeMaintenanceDetailModal();">
                                        <i class="fas fa-thumbs-down"></i> 거절
                                    </button>
                                `;
                            } else {
                                console.log('❌ Status not completed, no user buttons shown. Current status:', maintenance.status);
                                console.log('❌ Expected status: "completed", actual status: "' + maintenance.status + '"');
                                // 상태 정보 표시
                                return `
                                    <div style="padding: 10px; background: #f8f9fa; border-radius: 8px; color: #666; text-align: center;">
                                        상태: ${maintenance.status} (완료된 정비만 확인/거절 가능)
                                    </div>
                                `;
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
            modal.remove();
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
        
        // 진행중 상태만 수정 가능
        if (maintenance.status !== 'in-progress') {
            showNotification('진행중인 정비만 수정할 수 있습니다.', 'error');
            return;
        }
        
        // 상세 모달 닫기
        closeMaintenanceDetailModal();
        
        // 정비 등록 모달 열고 기존 데이터로 채우기
        openMaintenanceModal();
        
        // 데이터 채우기
        setTimeout(() => {
            document.getElementById('carNumber').value = maintenance.carNumber || '';
            document.getElementById('maintenanceDate').value = maintenance.date || '';
            document.getElementById('maintenanceType').value = maintenance.type || '';
            document.getElementById('mileage').value = maintenance.mileage || '';
            document.getElementById('description').value = maintenance.description || '';
            
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
            
            console.log('✅ Maintenance edit form populated');
        }, 100);
        
    } catch (error) {
        console.error('❌ Error editing maintenance:', error);
        showNotification('정비 수정 중 오류가 발생했습니다: ' + error.message, 'error');
    }
}

// 전역 함수로 등록
window.showMaintenanceDetail = showMaintenanceDetail;
window.closeMaintenanceDetailModal = closeMaintenanceDetailModal;
window.showPhotoModal = showPhotoModal;
window.closePhotoModal = closePhotoModal;
window.editMaintenance = editMaintenance;
window.completeMaintenanceWork = completeMaintenanceWork;

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
        const adminEmails = ['admin@admin.com', 'admin1@admin.com', 'admin2@admin.com'];
        
        if (adminEmails.includes(currentUser.email)) {
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
        
        // 30일 전 날짜 계산
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - PHOTO_RETENTION_DAYS);
        const cutoffTimestamp = firebase.firestore.Timestamp.fromDate(cutoffDate);
        
        console.log(`📅 삭제 기준일: ${cutoffDate.toLocaleDateString('ko-KR')} (${PHOTO_RETENTION_DAYS}일 전)`);
        
        // 30일 이상 된 정비 이력 찾기
        const oldMaintenances = await db.collection('maintenance')
            .where('createdAt', '<', cutoffTimestamp)
            .get();
        
        if (oldMaintenances.empty) {
            console.log('✅ 삭제할 오래된 사진이 없습니다.');
            return;
        }
        
        console.log(`🔍 ${oldMaintenances.size}개의 오래된 정비 이력 발견`);
        
        let processedMaintenances = 0;
        let totalMaintenances = 0;
        let totalPhotosFromDB = 0;
        let totalPhotosFromImgbb = 0;
        let failedPhotosFromImgbb = 0;
        
        // 각 정비 이력의 사진들 삭제
        for (const doc of oldMaintenances.docs) {
            const maintenanceId = doc.id;
            const data = doc.data();
            
            // 사진이 있는지 확인 (신규/기존 방식 모두 체크)
            const hasPhotos = (data.photos && data.photos.length > 0) || 
                             data.beforePhoto || data.duringPhoto || data.afterPhoto;
            
            if (hasPhotos) {
                totalMaintenances++;
                const result = await deleteMaintenancePhotos(maintenanceId, data);
                
                if (result.success) {
                    processedMaintenances++;
                    totalPhotosFromDB += result.totalPhotos;
                    totalPhotosFromImgbb += result.deletedFromImgbb;
                    failedPhotosFromImgbb += result.failedFromImgbb;
                }
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
        
        // 정비 데이터 가져오기
        const doc = await db.collection('maintenance').doc(maintenanceId).get();
        if (!doc.exists) {
            showNotification('정비 이력을 찾을 수 없습니다.', 'error');
            return;
        }
        
        const maintenance = doc.data();
        const photos = [];
        
        // 사진 URL 수집
        if (maintenance.beforePhoto) {
            photos.push({ url: maintenance.beforePhoto, type: '정비전', filename: `${maintenanceType}_정비전_${maintenanceDate}.jpg` });
        }
        if (maintenance.duringPhoto) {
            photos.push({ url: maintenance.duringPhoto, type: '정비중', filename: `${maintenanceType}_정비중_${maintenanceDate}.jpg` });
        }
        if (maintenance.afterPhoto) {
            photos.push({ url: maintenance.afterPhoto, type: '정비후', filename: `${maintenanceType}_정비후_${maintenanceDate}.jpg` });
        }
        
        if (photos.length === 0) {
            showNotification('다운로드할 사진이 없습니다.', 'warning');
            return;
        }
        
        // 순차적으로 다운로드 (동시 다운로드는 브라우저에서 제한될 수 있음)
        let downloadCount = 0;
        for (const photo of photos) {
            try {
                await downloadPhoto(photo.url, photo.filename);
                downloadCount++;
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
    
    const modalHTML = `
        <div id="estimateModal" class="modal-overlay active">
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
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                            <h3 style="margin: 0 0 15px 0; font-size: 18px;">📋 기본 정보</h3>
                                                         <div style="display: flex; flex-direction: column; gap: 15px;">
                                 <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                                     <div style="flex: 1; min-width: 200px;">
                                         <label style="display: block; margin-bottom: 5px; font-size: 14px; opacity: 0.9;">🚗 차량번호</label>
                                         <input type="text" id="estimateCarNumber" placeholder="12가3456" required
                                                style="width: 100%; padding: 10px; border: none; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                                     </div>
                                     <div style="flex: 1; min-width: 200px;">
                                         <label style="display: block; margin-bottom: 5px; font-size: 14px; opacity: 0.9;">👤 고객명</label>
                                         <input type="text" id="estimateCustomerName" placeholder="홍길동" required
                                                style="width: 100%; padding: 10px; border: none; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                                     </div>
                                 </div>
                                 <div style="display: flex; gap: 15px; flex-wrap: wrap; margin-top: 15px;">
                                     <div style="flex: 1; min-width: 150px;">
                                         <label style="display: block; margin-bottom: 5px; font-size: 14px; opacity: 0.9;">🏍️ 기종</label>
                                         <input type="text" id="estimateBikeModel" placeholder="혼다 PCX150"
                                                style="width: 100%; padding: 10px; border: none; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                                     </div>
                                     <div style="flex: 1; min-width: 100px;">
                                         <label style="display: block; margin-bottom: 5px; font-size: 14px; opacity: 0.9;">📅 년식</label>
                                         <input type="text" id="estimateBikeYear" placeholder="2023"
                                                style="width: 100%; padding: 10px; border: none; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                                     </div>
                                     <div style="flex: 1; min-width: 120px;">
                                         <label style="display: block; margin-bottom: 5px; font-size: 14px; opacity: 0.9;">📏 키로수</label>
                                         <input type="text" id="estimateMileage" placeholder="15,000km"
                                                style="width: 100%; padding: 10px; border: none; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                                     </div>
                                 </div>
                             </div>
                                                             <div>
                                     <label style="display: block; margin-bottom: 5px; font-size: 14px; opacity: 0.9;">🔧 정비 내용</label>
                                     <input type="text" id="estimateTitle" placeholder="엔진 오일 교체 및 점검" required
                                            style="width: 100%; padding: 10px; border: none; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                                 </div>
                        </div>
                        
                        <!-- 견적 항목 -->
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                                <h3 style="margin: 0; font-size: 18px; color: #333;">💰 견적 항목</h3>
                                <button type="button" onclick="addEstimateItem()" 
                                        style="background: #28a745; color: white; border: none; padding: 8px 12px; border-radius: 6px; font-size: 14px; cursor: pointer;">
                                    <i class="fas fa-plus"></i> 항목 추가
                                </button>
                            </div>
                            
                            <div id="estimateItems">
                                <!-- 기본 항목 1개 -->
                                <div class="estimate-item" style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #ddd;">
                                                                         <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: stretch;">
                                         <div style="flex: 2; min-width: 150px;">
                                             <input type="text" placeholder="항목명 (예: 엔진오일)" class="item-name" required
                                                    style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
                                         </div>
                                         <div style="flex: 1; min-width: 80px;">
                                             <input type="number" placeholder="가격" class="item-price" min="0" required
                                                    style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;" 
                                                    oninput="calculateTotal()">
                                         </div>
                                         <div style="flex: 0.5; min-width: 60px;">
                                             <input type="number" placeholder="수량" class="item-quantity" min="1" value="1" required
                                                    style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;" 
                                                    oninput="calculateTotal()">
                                         </div>
                                         <div style="flex: 0; min-width: 40px;">
                                             <button type="button" onclick="removeEstimateItem(this)" 
                                                     style="width: 100%; height: 36px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                                                 <i class="fas fa-trash"></i>
                                             </button>
                                         </div>
                                     </div>
                                </div>
                            </div>
                            
                            <!-- 총액 표시 -->
                            <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 8px; text-align: right;">
                                <h4 style="margin: 0; font-size: 20px; color: #333;">
                                    💰 총 견적액: <span id="totalAmount" style="color: #007bff; font-weight: bold;">0</span>원
                                </h4>
                            </div>
                        </div>
                        
                        <!-- 추가 메모 -->
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 10px; font-size: 16px; font-weight: 600; color: #333;">📝 추가 메모</label>
                                                         <textarea id="estimateNotes" placeholder="견적서에 포함할 추가 설명이나 주의사항을 입력하세요..." 
                                       style="width: 100%; height: 80px; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; resize: vertical; box-sizing: border-box;"></textarea>
                        </div>
                    </form>
                </div>
                
                                 <div class="modal-footer" style="
                     padding: 15px 20px; 
                     border-top: 1px solid #e5e5e5; 
                     display: flex; 
                     gap: 10px; 
                     flex-wrap: wrap; 
                     justify-content: space-between;
                     position: sticky;
                     bottom: 0;
                     background: white;
                     z-index: 10;
                 ">
                     <button class="btn btn-secondary" onclick="closeEstimateModal()" style="
                         flex: 1; 
                         min-width: 90px;
                         max-width: 110px;
                         padding: 12px 8px;
                         font-size: 13px;
                     ">
                         <i class="fas fa-times"></i> 취소
                     </button>
                     <button class="btn btn-primary" onclick="generateEstimatePDF()" style="
                         flex: 2; 
                         min-width: 140px;
                         padding: 12px 8px;
                         font-size: 13px;
                         white-space: nowrap;
                         text-overflow: ellipsis;
                         overflow: hidden;
                     ">
                         <i class="fas fa-file-pdf"></i> 견적서 생성
                     </button>
                 </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // 초기 총액 계산
    calculateTotal();
}

// 견적서 모달 닫기
function closeEstimateModal() {
    const modal = document.getElementById('estimateModal');
    if (modal) {
        modal.remove();
    }
}

// 견적 항목 추가
function addEstimateItem() {
    const itemsContainer = document.getElementById('estimateItems');
    const itemHTML = `
        <div class="estimate-item" style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #ddd;">
                         <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: stretch;">
                 <div style="flex: 2; min-width: 150px;">
                     <input type="text" placeholder="항목명 (예: 브레이크패드)" class="item-name" required
                            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
                 </div>
                 <div style="flex: 1; min-width: 80px;">
                     <input type="number" placeholder="가격" class="item-price" min="0" required
                            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;" 
                            oninput="calculateTotal()">
                 </div>
                 <div style="flex: 0.5; min-width: 60px;">
                     <input type="number" placeholder="수량" class="item-quantity" min="1" value="1" required
                            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;" 
                            oninput="calculateTotal()">
                 </div>
                 <div style="flex: 0; min-width: 40px;">
                     <button type="button" onclick="removeEstimateItem(this)" 
                             style="width: 100%; height: 36px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                         <i class="fas fa-trash"></i>
                     </button>
                 </div>
             </div>
        </div>
    `;
    
    itemsContainer.insertAdjacentHTML('beforeend', itemHTML);
    calculateTotal();
}

// 견적 항목 제거
function removeEstimateItem(button) {
    const item = button.closest('.estimate-item');
    if (document.querySelectorAll('.estimate-item').length > 1) {
        item.remove();
        calculateTotal();
    } else {
        showNotification('최소 1개의 항목은 필요합니다.', 'warning');
    }
}

// 총액 계산
function calculateTotal() {
    const items = document.querySelectorAll('.estimate-item');
    let total = 0;
    
    items.forEach(item => {
        const price = parseFloat(item.querySelector('.item-price').value) || 0;
        const quantity = parseInt(item.querySelector('.item-quantity').value) || 0;
        total += price * quantity;
    });
    
    document.getElementById('totalAmount').textContent = total.toLocaleString();
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
        const itemElements = document.querySelectorAll('.estimate-item');
        let hasValidItem = false;
        
        itemElements.forEach(item => {
            const name = item.querySelector('.item-name').value.trim();
            const price = parseFloat(item.querySelector('.item-price').value) || 0;
            const quantity = parseInt(item.querySelector('.item-quantity').value) || 0;
            
            if (name && price > 0 && quantity > 0) {
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
        const totalAmount = items.reduce((sum, item) => sum + item.total, 0);
        
        showNotification('PDF 견적서를 생성하는 중...', 'info');
        
        // 현재 관리자 이름 가져오기 (강제 업데이트 v2)
        const currentUser = auth.currentUser;
        const userEmail = currentUser ? currentUser.email.toLowerCase() : '';
        let currentManagerName = '정비사';
        
        if (userEmail.includes('admin2')) {
            currentManagerName = '황태훈';
            console.log('✅ ADMIN2 감지 → 황태훈 확정!');
        } else if (userEmail.includes('admin1')) {
            currentManagerName = '이정훈';
            console.log('✅ ADMIN1 감지 → 이정훈 확정!');
        }
        
        console.log('🚀 이메일:', userEmail);
        console.log('🚀 최종 관리자 이름:', currentManagerName);
        
        // 🎨 HTML 견적서 템플릿 생성
        const estimateHTML = createEstimateHTML(customerName, carNumber, title, items, totalAmount, notes, bikeModel, bikeYear, mileage, currentManagerName);
        
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
function createEstimateHTML(customerName, carNumber, title, items, totalAmount, notes, bikeModel = '', bikeYear = '', mileage = '', managerName = '정비사') {
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
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px;
                border-radius: 10px;
                margin-bottom: 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
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
                    ">
                        <svg width="40" height="40" viewBox="0 0 40 40" style="background: rgba(255,255,255,0.1); border-radius: 50%;">
                            <circle cx="20" cy="20" r="18" fill="#667eea" stroke="white" stroke-width="1"/>
                            <text x="20" y="16" text-anchor="middle" fill="white" font-size="8" font-weight="bold" font-family="Arial">TW</text>
                            <text x="20" y="28" text-anchor="middle" fill="white" font-size="6" font-weight="bold" font-family="Arial">GARAGE</text>
                        </svg>
                    </div>
                    <div>
                        <h1 style="margin: 0; font-size: 28px; font-weight: bold;">TWOHOONS GARAGE</h1>
                        <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">이륜차 정비소</p>
                    </div>
                </div>
                <div style="text-align: right;">
                    <h2 style="margin: 0; font-size: 24px; font-weight: bold;">견적서</h2>
                    <p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">ESTIMATE</p>
                </div>
            </div>
            
            <!-- 📋 기본 정보 - 편지 스타일 -->
            <div style="
                background: #f8f9fa;
                border: 1px solid #e9ecef;
                border-radius: 6px;
                padding: 15px;
                margin-bottom: 15px;
            ">
                <h3 style="margin: 0 0 12px 0; color: #667eea; font-size: 15px; font-weight: bold; text-align: center;">견적 의뢰서</h3>
                
                <!-- 편지 스타일 레이아웃 -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start;">
                    <!-- 왼쪽: 고객 정보 -->
                    <div>
                        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; font-weight: bold; border-bottom: 1px solid #667eea; padding-bottom: 4px;">고객 정보</h4>
                        <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 15px; align-items: center;">
                            <span style="font-weight: 600; color: #666;">고객명:</span>
                            <span style="color: #333;">${customerName}</span>
                            
                            <span style="font-weight: 600; color: #666;">차량번호:</span>
                            <span style="color: #333;">${carNumber}</span>
                            
                            <span style="font-weight: 600; color: #666;">기종:</span>
                            <span style="color: #333;">${bikeModel || '-'}</span>
                            
                            <span style="font-weight: 600; color: #666;">년식:</span>
                            <span style="color: #333;">${bikeYear || '-'}</span>
                            
                            <span style="font-weight: 600; color: #666;">키로수:</span>
                            <span style="color: #333;">${mileage || '-'}</span>
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
                            ">견적서 No. ${Date.now().toString().slice(-6)}</div>
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
                
                <!-- 총액 - 편지 스타일 -->
                <div style="
                    margin-top: 12px;
                    padding: 12px 15px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border-radius: 6px;
                    text-align: center;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 15px; font-weight: 600;">총 견적액</span>
                        <span style="font-size: 18px; font-weight: bold;">${totalAmount.toLocaleString()}원</span>
                    </div>
                </div>
            </div>
            
            ${notes ? `
            <!-- 📝 추가 메모 - 편지 스타일 -->
            <div style="
                background: #f8f9fa;
                border: 1px solid #e9ecef;
                border-radius: 8px;
                padding: 15px;
                margin-bottom: 15px;
            ">
                <h4 style="margin: 0 0 8px 0; color: #667eea; font-size: 13px; font-weight: bold; border-bottom: 1px solid #667eea; padding-bottom: 3px;">특별 사항</h4>
                <div style="
                    background: white;
                    border: 1px solid #e9ecef;
                    border-radius: 4px;
                    padding: 12px;
                    white-space: pre-wrap;
                    font-size: 12px;
                    line-height: 1.4;
                    color: #333;
                    font-style: italic;
                ">${notes}</div>
            </div>
            ` : ''}
            
            <!-- ✍️ 서명란 - 편지 스타일 -->
            <div style="margin-top: 15px; background: #f8f9fa; padding: 15px; border-radius: 6px; border: 1px solid #e9ecef;">
                <div style="text-align: center; margin-bottom: 12px;">
                    <h4 style="margin: 0; color: #667eea; font-size: 13px; font-weight: bold;">서명란</h4>
                    <p style="margin: 3px 0 0 0; color: #666; font-size: 11px;">위 견적서 내용에 동의하며 서명합니다.</p>
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
                padding: 10px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border-radius: 6px;
                text-align: center;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            ">
                <div style="margin-bottom: 6px;">
                    <span style="font-size: 13px; font-weight: bold;">TWOHOONS GARAGE</span>
                    <span style="margin: 0 8px; opacity: 0.7;">|</span>
                    <span style="font-size: 11px; opacity: 0.9;">이륜차 정비 서비스</span>
                </div>
                <div style="font-size: 11px; opacity: 0.8;">
                    견적서 생성일: ${new Date().toLocaleString('ko-KR')}
                </div>
            </div>
        </div>
    `;
}

// 🎨 HTML을 PDF로 변환
async function generatePDFFromHTML(htmlContent, customerName, carNumber) {
    try {
        // 임시 div 생성
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '-9999px';
        tempDiv.style.background = 'white';
        document.body.appendChild(tempDiv);
        
        // 잠시 대기 (DOM 렌더링 완료 대기)
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // html2canvas로 이미지 생성
        const canvas = await html2canvas(tempDiv.firstElementChild, {
            scale: 2,
            backgroundColor: '#ffffff',
            width: 794,
            height: null
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
        const fileName = `견적서_${customerName}_${carNumber}_${new Date().toISOString().slice(0, 10)}.pdf`;
        pdf.save(fileName);
        
        showNotification('PDF 견적서가 성공적으로 생성되었습니다! 🎉', 'success');
        closeEstimateModal();
        
    } catch (error) {
        console.error('❌ PDF 생성 오류:', error);
        showNotification('PDF 생성 중 오류가 발생했습니다.', 'error');
    }
}