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
    
    // Check authentication state
    firebase.auth().onAuthStateChanged(handleAuthStateChange);
    
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
                currentUser = {
                    uid: user.uid,
                    email: user.email,
                    name: userData.name,
                    carNumber: userData.carNumber,
                    role: userData.role || 'user'
                };
                
                // 관리자 이메일 체크로 관리자 권한 부여
                const adminEmails = ['admin@admin.com', 'admin1@admin.com', 'admin2@admin.com'];
                isAdmin = adminEmails.includes(user.email) || currentUser.role === 'admin';
                
                console.log('👤 User role:', currentUser.role);
                console.log('🔧 Is admin (email check):', adminEmails.includes(user.email));
                console.log('🔧 Is admin (final):', isAdmin);
                
                // Switch to dashboard
                showScreen('dashboardScreen');
                updateUI();
                loadDashboardData();
                
                showNotification(`환영합니다, ${currentUser.name}님!`, 'success');
            } else {
                console.error('❌ User document not found');
                showNotification('사용자 정보를 찾을 수 없습니다.', 'error');
                await firebase.auth().signOut();
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
        showNotification('로그아웃되었습니다.', 'info');
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
    }
    
    // Create and show profile modal
    showContextMenu(options);
}

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
            document.body.removeChild(menu);
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
        document.body.removeChild(menu);
        document.body.removeChild(overlay);
    });
    
    document.body.appendChild(overlay);
    document.body.appendChild(menu);
}

// =============================================
// Dashboard System
// =============================================

async function loadDashboardData() {
    console.log('📊 Loading dashboard data...');
    
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
    }
}

async function updatePendingStats() {
    try {
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
    }
}

async function updateMonthStats() {
    try {
        // 단순한 쿼리로 변경 - 인덱스 오류 방지
        let query = db.collection('maintenance');
        
        if (!isAdmin && currentUser && currentUser.carNumber) {
            query = query.where('carNumber', '==', currentUser.carNumber);
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
        // 단순한 쿼리로 변경 - 인덱스 오류 방지
        let query = db.collection('maintenance');
        
        if (!isAdmin && currentUser && currentUser.carNumber) {
            query = query.where('carNumber', '==', currentUser.carNumber);
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
        
        // 관리자가 아닌 경우 차량번호로 필터링
        let filteredMaintenances = maintenances;
        if (!isAdmin && currentUser && currentUser.carNumber) {
            filteredMaintenances = maintenances.filter(m => 
                m.carNumber === currentUser.carNumber
            );
            console.log('🚗 Filtered by car number:', currentUser.carNumber, filteredMaintenances.length);
        } else if (isAdmin) {
            console.log('👨‍💼 Admin user - showing all maintenance records');
        }
        
        // 상태별 필터 적용
        const currentFilter = window.currentFilter || 'all';
        console.log('🔍 Current filter:', currentFilter);
        
        if (currentFilter !== 'all') {
            const beforeFilterCount = filteredMaintenances.length;
            filteredMaintenances = filteredMaintenances.filter(m => {
                switch (currentFilter) {
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
        renderRealMaintenanceTimeline(filteredMaintenances);
        
        // 로딩 완료 후 스피너 숨기기
        showLoadingSpinner(false);
        
    } catch (error) {
        console.error('❌ Error loading timeline:', error);
        showNotification('정비 이력 로딩 실패: ' + error.message, 'error');
        
        // 오류 발생 시에도 스피너 숨기기
        showLoadingSpinner(false);
        
        // 오류 시 테스트 데이터라도 보여주기
        renderRealMaintenanceTimeline([]);
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

function renderRealMaintenanceTimeline(maintenances) {
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
    
    // 실제 데이터로 카드 생성
    const cardsHtml = maintenances.map((maintenance, index) => {
        console.log(`🏗️ Building real card ${index + 1}:`, maintenance.type, maintenance.carNumber);
        
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
        
        return `
            <div style="background: ${gradient}; color: white; padding: 25px; margin: 15px 0; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); cursor: pointer;" onclick="showMaintenanceDetail('${maintenance.id}')">
                <h3 style="margin: 0 0 15px 0; font-size: 20px;">
                    ${typeIcon} ${maintenance.type || '정비'}
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
                <p style="margin: 15px 0 0 0; line-height: 1.5;">
                    ${(maintenance.description || '설명이 없습니다.').substring(0, 100)}${(maintenance.description || '').length > 100 ? '...' : ''}
                </p>
            </div>
        `;
    }).join('');
    
    container.innerHTML = cardsHtml;
    console.log('✅ Real timeline rendered successfully with', maintenances.length, 'cards');
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
    }
}

function resetMaintenanceForm() {
    currentStep = 1;
    uploadedPhotos = { before: null, during: null, after: null };
    
    const form = document.getElementById('maintenanceForm');
    if (form) {
        form.reset();
    }
    
    // Reset type selector
    document.querySelectorAll('.type-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    // Reset photo uploads
    resetPhotoUploads();
    
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
            adminName: currentUser.name,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            photos: []
        };
        
        // Firestore에 저장
        const docRef = await db.collection('maintenance').add(formData);
        console.log('✅ Maintenance added with ID:', docRef.id);
        
        // 사진 업로드 (있는 경우)
        if (uploadedPhotos.before || uploadedPhotos.during || uploadedPhotos.after) {
            await uploadMaintenancePhotos(docRef.id);
        }
        
        showNotification('정비 이력이 성공적으로 등록되었습니다!', 'success');
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
        // 이미지 리사이즈
        const resizedFile = await resizeImage(file);
        
        // Base64로 변환하여 임시 저장
        const base64 = await convertToBase64(resizedFile);
        uploadedPhotos[type] = base64;
        
        // 미리보기 표시
        showPhotoPreview(base64, type);
        
        showNotification(`${type} 사진이 업로드되었습니다.`, 'success');
        
    } catch (error) {
        console.error('❌ Error uploading photo:', error);
        showNotification('사진 업로드 실패: ' + error.message, 'error');
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

    // 도장(관리자 이름) 노출 조건: 승인/거절 상태일 때만
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
                    <i class="fas fa-check"></i> 승인
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
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (container.contains(notification)) {
                container.removeChild(notification);
            }
        }, 300);
    }, 5000);
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
        // This would be connected to real notification count
        badge.textContent = '0';
        badge.style.display = 'none';
    }
}

// 검색 및 필터 초기화 함수
function initializeSearchAndFilters() {
    const quickSearch = document.getElementById('quickSearch');
    const filterChips = document.querySelectorAll('.filter-chip');
    
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

// 정비 타입별 아이콘과 색상 가져오기 함수
function getTypeIconAndColor(type) {
    const types = {
        '일반점검': { icon: 'fa-tools', color: '#4bc0c0' },
        '엔진오일교체': { icon: 'fa-oil-can', color: '#ff6347' },
        '타이어교체': { icon: 'fa-circle-notch', color: '#d4ac0d' },
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

// 정비 타입 정보 가져오기 함수 (createMaintenanceCard에서 사용)
function getMaintenanceTypeInfo(type) {
    const types = {
        '일반점검': { icon: 'fas fa-tools', color: '#4bc0c0' },
        '엔진오일교체': { icon: 'fas fa-oil-can', color: '#ff6347' },
        '타이어교체': { icon: 'fas fa-circle-notch', color: '#d4ac0d' },
        '브레이크정비': { icon: 'fas fa-car-brake', color: '#ff9f40' },
        '기타': { icon: 'fas fa-wrench', color: '#666' }
    };
    return types[type] || types['기타'];
}

// 상태 정보 가져오기 함수 (createMaintenanceCard에서 사용)
function getStatusInfo(status) {
    const statusInfo = {
        'approved': { icon: 'fas fa-check-double', text: '승인됨' },
        'rejected': { icon: 'fas fa-times', text: '거절됨' },
        'pending': { icon: 'fas fa-clock', text: '대기중' },
        'in-progress': { icon: 'fas fa-cog fa-spin', text: '진행중' },
        'completed': { icon: 'fas fa-check', text: '완료' }
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
        if (userName) {
            userName.textContent = `오토바이 번호: ${currentUser.carNumber}`;
        }
        showNotification('오토바이 번호가 수정되었습니다.', 'success');
        
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
    for (const [type, file] of Object.entries(uploadedPhotos)) {
        if (file) {
            try {
                // 이미지를 Base64로 변환
                const base64Image = await convertToBase64(file);
                // ImgBB API 호출
                const formData = new FormData();
                formData.append('key', IMGBB_API_KEY);
                formData.append('image', base64Image.split(',')[1]);
                formData.append('name', `maintenance_${maintenanceId}_${type}_${Date.now()}`);
                const response = await fetch('https://api.imgbb.com/1/upload', {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();
                if (result.success) {
                    photos.push({
                        type,
                        url: result.data.url,
                        thumbnailUrl: result.data.thumb ? result.data.thumb.url : result.data.url,
                        createdAt: new Date().toISOString(),
                        filename: `${type}_${Date.now()}.jpg`
                    });
                } else {
                    throw new Error('이미지 업로드 실패');
                }
            } catch (err) {
                showNotification(`${type} 사진 업로드 실패: ${err.message}`, 'error');
            }
        }
    }
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
    
    // 기존 모달 제거
    const existingModal = document.getElementById('maintenanceDetailModal');
    if (existingModal) {
        existingModal.remove();
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
                    
                    ${maintenance.photos && maintenance.photos.length > 0 ? `
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                            <h4 style="margin: 0 0 15px 0; color: #333;">📸 사진 (${maintenance.photos.length}장)</h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
                                ${maintenance.photos.map(photo => `
                                    <img src="${photo}" alt="정비 사진" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px; cursor: pointer;" onclick="showPhotoModal('${photo}')">
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 12px;">
                        <h4 style="margin: 0 0 15px 0; color: #333;">ℹ️ 추가 정보</h4>
                        <p style="margin: 5px 0; color: #666;">🆔 ID: ${maintenance.id}</p>
                        <p style="margin: 5px 0; color: #666;">📅 등록일: ${maintenance.createdAt ? new Date(maintenance.createdAt.toDate()).toLocaleString('ko-KR') : '없음'}</p>
                        ${maintenance.adminEmail ? `<p style="margin: 5px 0; color: #666;">👨‍💼 관리자: ${maintenance.adminEmail}</p>` : ''}
                    </div>
                </div>
                
                <div class="modal-footer" style="padding: 20px; border-top: 1px solid #e5e5e5;">
                    <button class="btn btn-secondary" onclick="closeMaintenanceDetailModal()">
                        <i class="fas fa-times"></i> 닫기
                    </button>
                    ${isAdmin && maintenance.status === 'pending' ? `
                        <button class="btn btn-success" onclick="updateMaintenanceStatus('${maintenance.id}', 'approved'); closeMaintenanceDetailModal();">
                            <i class="fas fa-check"></i> 승인
                        </button>
                        <button class="btn btn-danger" onclick="updateMaintenanceStatus('${maintenance.id}', 'rejected'); closeMaintenanceDetailModal();">
                            <i class="fas fa-times"></i> 거절
                        </button>
                    ` : ''}
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
        modal.remove();
    }
}

// 사진 확대 모달
function showPhotoModal(photoUrl) {
    const photoModalHTML = `
        <div id="photoModal" class="modal-overlay active" style="background: rgba(0,0,0,0.9);" onclick="closePhotoModal()">
            <div class="modal-container" style="max-width: 90vw; max-height: 90vh; background: transparent; box-shadow: none;">
                <img src="${photoUrl}" alt="정비 사진" style="width: 100%; height: 100%; object-fit: contain; border-radius: 8px;">
                <button class="modal-close" onclick="closePhotoModal()" style="position: absolute; top: 20px; right: 20px; background: rgba(0,0,0,0.5); color: white;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', photoModalHTML);
}

function closePhotoModal() {
    const modal = document.getElementById('photoModal');
    if (modal) {
        modal.remove();
    }
}

// 전역 함수로 등록
window.showMaintenanceDetail = showMaintenanceDetail;
window.closeMaintenanceDetailModal = closeMaintenanceDetailModal;
window.showPhotoModal = showPhotoModal;
window.closePhotoModal = closePhotoModal;

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
                status: 'approved',
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
                status: 'approved',
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