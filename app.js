// Firebase 관련 함수 import
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    setDoc,
    updateDoc,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyDu_DVHYKmxb8LNTO4lVNdXp2K-ZU8qClE",
    authDomain: "hoons-a02bc.firebaseapp.com",
    projectId: "hoons-a02bc",
    storageBucket: "hoons-a02bc.appspot.com",
    messagingSenderId: "129637551362",
    appId: "1:129637551362:web:3bb671f51fdb3a2cd9061b"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 관리자 이메일 목록
const ADMIN_EMAILS = ['admin1@admin.com', 'admin2@admin.com', 'admin3@admin.com'];

// 전역 변수
let currentUser = null;
let isAdmin = false;
let lastDoc = null;
let isLoading = false;
const ITEMS_PER_PAGE = 10;

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
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('regEmail').value.trim().toLowerCase();
            const password = document.getElementById('regPassword').value;
            const carNumber = document.getElementById('regCarNumber').value.trim().toLowerCase().replace(/\\s+/g, '');
            
            if (!email || !password || !carNumber) {
                showNotification('모든 정보를 입력하세요.', 'error');
                return;
            }
            
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await setDoc(doc(db, 'users', userCredential.user.uid), { email, carNumber });
                showNotification('회원가입이 완료되었습니다! 로그인 해주세요.', 'success');
                registerForm.style.display = 'none';
                loginForm.style.display = 'block';
            } catch (err) {
                showNotification('회원가입 실패: ' + err.message, 'error');
            }
        });
    }

    // 로그인
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value.trim().toLowerCase();
            const password = document.getElementById('password').value;
            
            if (!email || !password) {
                showNotification('이메일과 비밀번호를 입력하세요.', 'error');
                return;
            }
            
            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (err) {
                showNotification('로그인 실패: ' + err.message, 'error');
            }
        });
    }

    // 로그아웃
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            signOut(auth);
        });
    }

    // 검색
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
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
            if (maintenanceForm) {
                maintenanceForm.style.display = 'block';
            }
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
        newMaintenanceForm.addEventListener('submit', async (e) => {
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
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            try {
                await addDoc(collection(db, 'maintenance'), maintenanceData);
                maintenanceForm.style.display = 'none';
                newMaintenanceForm.reset();
                loadMaintenanceHistory();
                showNotification('정비 이력이 저장되었습니다.', 'success');
            } catch (err) {
                showNotification('정비 이력 저장 실패: ' + err.message, 'error');
            }
        });
    }

    // 인증 상태 감지
    onAuthStateChanged(auth, async user => {
        if (user) {
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    currentUser = {
                        uid: user.uid,
                        email: user.email,
                        carNumber: userDoc.data().carNumber
                    };
                    isAdmin = ADMIN_EMAILS.includes(user.email);
                    
                    // UI 업데이트
                    if (userName) {
                        userName.textContent = isAdmin ? 
                            `관리자 (${user.email})` : 
                            `차량번호: ${currentUser.carNumber}`;
                    }
                    
                    // 화면 표시 설정
                    if (loginForm) loginForm.style.display = 'none';
                    if (registerForm) registerForm.style.display = 'none';
                    if (maintenanceList) maintenanceList.style.display = 'block';
                    if (logoutBtn) logoutBtn.style.display = 'block';
                    if (addBtnBox) addBtnBox.style.display = 'block';
                    if (searchBox) searchBox.style.display = 'block';
                    
                    // 정비 이력 로드
                    loadMaintenanceHistory();
                } else {
                    auth.signOut();
                    showNotification('사용자 정보를 찾을 수 없습니다.', 'error');
                }
            } catch (error) {
                console.error('Error fetching user data:', error);
                showNotification('사용자 정보를 불러오는데 실패했습니다.', 'error');
            }
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
        }
    });

    // 스크롤 이벤트 최적화
    const maintenanceContainer = document.querySelector('.maintenance-container');
    if (maintenanceContainer) {
        maintenanceContainer.addEventListener('scroll', throttle(() => {
            const { scrollTop, scrollHeight, clientHeight } = maintenanceContainer;
            
            // 스크롤이 90% 이상 내려갔을 때 추가 로드
            if (scrollTop + clientHeight >= scrollHeight * 0.9) {
                loadMaintenanceHistory('', false);
            }

            // 맨 위로 가기 버튼 표시/숨김
            const scrollToTop = document.getElementById('scrollToTop');
            if (scrollToTop) {
                scrollToTop.classList.toggle('visible', scrollTop > clientHeight);
            }
        }, 100));
    }

    // 맨 위로 가기 버튼 클릭 이벤트
    const scrollToTop = document.getElementById('scrollToTop');
    if (scrollToTop) {
        scrollToTop.addEventListener('click', () => {
            const maintenanceContainer = document.querySelector('.maintenance-container');
            if (maintenanceContainer) {
                maintenanceContainer.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
        });
    }
});

// 정비 이력 불러오기
async function loadMaintenanceHistory(search = '', isInitialLoad = true) {
    const maintenanceItems = document.getElementById('maintenanceItems');
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (!maintenanceItems) return;

    if (isInitialLoad) {
        maintenanceItems.innerHTML = '';
        lastDoc = null;
    }

    if (isLoading) return;
    isLoading = true;

    if (loadingSpinner) {
        loadingSpinner.classList.add('visible');
    }

    try {
        // 쿼리 생성
        let q = collection(db, 'maintenance');
        const constraints = [];

        if (isAdmin) {
            constraints.push(where('adminEmail', '==', currentUser.email));
        } else if (currentUser) {
            constraints.push(where('carNumber', '==', currentUser.carNumber));
        }

        constraints.push(orderBy('createdAt', 'desc'));
        
        if (lastDoc) {
            constraints.push(startAfter(lastDoc));
        }
        
        constraints.push(limit(ITEMS_PER_PAGE));

        q = query(q, ...constraints);
        const snapshot = await getDocs(q);

        if (snapshot.empty && isInitialLoad) {
            maintenanceItems.innerHTML = '<div class="no-data">정비 이력이 없습니다.</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        
        snapshot.forEach(doc => {
            lastDoc = doc;
            const data = doc.data();
            const maintenance = { ...data, id: doc.id };

            if (search && search.trim() !== '') {
                const s = search.trim().toLowerCase();
                if (!((maintenance.type && maintenance.type.toLowerCase().includes(s)) ||
                    (maintenance.description && maintenance.description.toLowerCase().includes(s)))) {
                    return;
                }
            }

            const card = createMaintenanceCard(maintenance);
            fragment.appendChild(card);
        });

        maintenanceItems.appendChild(fragment);
    } catch (error) {
        console.error('Error loading maintenance list:', error);
        showNotification('정비 이력을 불러오는데 실패했습니다.', 'error');
    } finally {
        isLoading = false;
        loadingSpinner?.classList.remove('visible');
    }
}

// 정비 카드 생성 최적화
function createMaintenanceCard(maintenance) {
    const card = document.createElement('div');
    card.className = 'maintenance-card glass-card';
    
    // 버튼 이벤트를 위임하여 처리
    if (!isAdmin && currentUser && 
        maintenance.carNumber === currentUser.carNumber && 
        maintenance.status === 'pending') {
        card.addEventListener('click', (e) => {
            if (e.target.matches('.btn-success')) {
                approveMaintenance(maintenance.id);
            } else if (e.target.matches('.btn-danger')) {
                rejectMaintenance(maintenance.id);
            }
        });
    }
    
    card.innerHTML = getMaintenanceCardHTML(maintenance);
    return card;
}

// HTML 생성 함수 분리
function getMaintenanceCardHTML(maintenance) {
    const typeIcon = getTypeIcon(maintenance.type);
    const statusClass = maintenance.status || 'pending';
    const statusIcon = getStatusIcon(maintenance.status);
    
    const actionButtons = (!isAdmin && currentUser && 
        maintenance.carNumber === currentUser.carNumber && 
        maintenance.status === 'pending') ? `
        <div class="maintenance-card-actions">
            <button class="btn btn-success btn-sm">
                <i class="fas fa-check"></i> 승인
            </button>
            <button class="btn btn-danger btn-sm">
                <i class="fas fa-times"></i> 거절
            </button>
        </div>
    ` : '';
    
    return `
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
            ${actionButtons}
        </div>
    `;
}

// 승인/거절 함수 최적화
function approveMaintenance(id) {
    if (!currentUser) return;
    
    const updateData = {
        status: 'approved',
        updatedAt: serverTimestamp()
    };

    updateMaintenanceStatus(id, updateData, '승인');
}

function rejectMaintenance(id) {
    if (!currentUser) return;
    
    const updateData = {
        status: 'rejected',
        updatedAt: serverTimestamp()
    };

    updateMaintenanceStatus(id, updateData, '거절');
}

async function updateMaintenanceStatus(id, updateData, action) {
    try {
        const maintenanceRef = doc(db, 'maintenance', id);
        await updateDoc(maintenanceRef, {
            ...updateData,
            updatedAt: serverTimestamp()
        });
        
        showNotification(`정비 이력이 ${action}되었습니다.`, action === '승인' ? 'success' : 'error');
        const card = document.querySelector(`[data-maintenance-id="${id}"]`);
        if (card) {
            loadMaintenanceHistory('', true);
        }
    } catch (error) {
        console.error(`Error ${action} maintenance:`, error);
        showNotification(`${action} 처리 중 오류가 발생했습니다.`, 'error');
    }
}

// 스크롤 이벤트 최적화
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
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
    const statusMap = {
        'pending': '대기중',
        'in-progress': '진행중',
        'completed': '완료',
        'rejected': '거절됨',
        'approved': '승인'
    };
    return statusMap[status] || status;
} 