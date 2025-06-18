// 관리자 이메일 목록
const ADMIN_EMAILS = ['admin1@admin.com', 'admin2@admin.com', 'admin3@admin.com'];

// 관리자 이메일 → 이름 변환 캐시
const adminNameCache = {};

// 전역 변수
let currentUser = null;
let isAdmin = false;

// 사진 업로드 관련 변수
let uploadedPhotos = {
    before: null,
    during: null,
    after: null
};

// UI 업데이트 함수
function updateUI() {
    const userName = document.getElementById('userName');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const maintenanceList = document.getElementById('maintenanceList');
    const logoutBtn = document.getElementById('logoutBtn');
    const addBtnBox = document.getElementById('addBtnBox');
    const searchBox = document.getElementById('searchBox');
    const updateCarNumberBtn = document.getElementById('updateCarNumberBtn');

    if (userName) {
        userName.textContent = isAdmin ? 
            `관리자 (${currentUser.email})` : 
            `오토바이 번호: ${currentUser.carNumber}`;
    }
    
    if (updateCarNumberBtn) {
        updateCarNumberBtn.style.display = isAdmin ? 'none' : 'inline-block';
    }
    
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'none';
    if (maintenanceList) maintenanceList.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'block';
    if (addBtnBox) addBtnBox.style.display = isAdmin ? 'block' : 'none';
    if (searchBox) searchBox.style.display = 'block';
}

// 알림 표시 함수
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

// DOM이 로드된 후 실행
document.addEventListener('DOMContentLoaded', () => {
    // 초기 history state 추가
    history.pushState({ page: 'main' }, '');

    // DOM 요소
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const maintenanceList = document.getElementById('maintenanceList');
    const maintenanceForm = document.getElementById('maintenanceForm');
    const maintenanceItems = document.getElementById('maintenanceItems');
    const addMaintenanceBtn = document.getElementById('addMaintenanceBtn');
    const logoutBtn = document.getElementById('logoutBtn');
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
            const carNumber = document.getElementById('regCarNumber').value.trim().toLowerCase().replace(/\s+/g, '');
            
            if (!email || !password || !carNumber) {
                showNotification('모든 정보를 입력하세요.', 'error');
                return;
            }
            
            auth.createUserWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    const uid = userCredential.user.uid;
                    return db.collection('users').doc(uid).set({ 
                        email, 
                        carNumber,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
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
                .then(() => {
                    showNotification('로그인 성공!', 'success');
                })
                .catch(err => {
                    console.error('Login error:', err);
                    showNotification('로그인 실패: ' + err.message, 'error');
                });
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
        console.log('Auth state changed:', user ? user.email : 'logged out');
        
        if (user) {
            // users 컬렉션이 삭제된 상황을 처리
            db.collection('users').doc(user.uid).get()
                .then(doc => {
                    console.log('User doc:', doc.exists ? 'exists' : 'not found');
                    
                    if (!doc.exists) {
                        // users 컬렉션이 없거나 문서가 없는 경우
                        console.log('Users collection or document not found, attempting to recover...');
                        
                        // 현재 로그인된 사용자의 이메일로 users 컬렉션 재생성
                        return db.collection('users').doc(user.uid).set({
                            email: user.email,
                            carNumber: user.email.split('@')[0], // 임시 오토바이 번호 (이메일 아이디 사용)
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                            isRecovered: true // 복구된 계정 표시
                        }).then(() => {
                            showNotification('계정 정보가 복구되었습니다. 오토바이 번호를 수정해주세요.', 'info');
                            return db.collection('users').doc(user.uid).get();
                        });
                    }
                    return doc;
                })
                .then(doc => {
                    if (doc.exists) {
                        const userData = doc.data();
                        console.log('User data:', userData);
                        
                        currentUser = {
                            uid: user.uid,
                            email: user.email,
                            carNumber: userData.carNumber
                        };
                        isAdmin = ADMIN_EMAILS.includes(user.email);
                        
                        console.log('Current user:', currentUser);
                        console.log('Is admin:', isAdmin);
                        
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
            const loginForm = document.getElementById('loginForm');
            const registerForm = document.getElementById('registerForm');
            const maintenanceList = document.getElementById('maintenanceList');
            const logoutBtn = document.getElementById('logoutBtn');
            const addBtnBox = document.getElementById('addBtnBox');
            const searchBox = document.getElementById('searchBox');
            const maintenanceItems = document.getElementById('maintenanceItems');
            const updateCarNumberBtn = document.getElementById('updateCarNumberBtn');
            
            if (loginForm) loginForm.style.display = 'block';
            if (registerForm) registerForm.style.display = 'none';
            if (maintenanceList) maintenanceList.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (addBtnBox) addBtnBox.style.display = 'none';
            if (searchBox) searchBox.style.display = 'none';
            if (maintenanceItems) maintenanceItems.innerHTML = '';
            if (updateCarNumberBtn) updateCarNumberBtn.style.display = 'none';
        }
    });

    // 정비 이력 입력 모달 열기/닫기 함수
    window.openMaintenanceInputModal = function() {
        const modal = document.getElementById('maintenanceInputModal');
        const backdrop = document.getElementById('modalBackdrop');
        if (modal && backdrop) {
            // 모달 내용 동적 생성
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2><i class="fas fa-tools"></i> 새 정비 이력 입력</h2>
                        <button class="close-btn" onclick="closeMaintenanceInputModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="newMaintenanceModalForm">
                            <div class="input-group">
                                <div class="input-label">
                                    <i class="fas fa-motorcycle"></i>
                                    <label for="maintenanceCarNumberModal">오토바이 번호</label>
                                </div>
                                <input type="text" id="maintenanceCarNumberModal" required>
                            </div>
                            
                            <div class="input-group">
                                <div class="input-label">
                                    <i class="fas fa-calendar"></i>
                                    <label for="maintenanceDateModal">정비 날짜</label>
                                </div>
                                <input type="date" id="maintenanceDateModal" required>
                            </div>
                            
                            <div class="input-group">
                                <div class="input-label">
                                    <i class="fas fa-tachometer-alt"></i>
                                    <label for="maintenanceMileageModal">키로수 (km)</label>
                                </div>
                                <input type="number" id="maintenanceMileageModal" required>
                            </div>
                            
                            <div class="input-group">
                                <div class="input-label">
                                    <i class="fas fa-wrench"></i>
                                    <label for="maintenanceTypeModal">정비 종류</label>
                                </div>
                                <select id="maintenanceTypeModal" required>
                                    <option value="">선택하세요</option>
                                    <option value="일반점검">일반점검</option>
                                    <option value="엔진오일교체">엔진오일교체</option>
                                    <option value="타이어교체">타이어교체</option>
                                    <option value="브레이크정비">브레이크정비</option>
                                    <option value="기타">기타</option>
                                </select>
                            </div>
                            
                            <div class="input-group">
                                <div class="input-label">
                                    <i class="fas fa-comment"></i>
                                    <label for="descriptionModal">정비 내용</label>
                                </div>
                                <textarea id="descriptionModal" rows="4" required></textarea>
                            </div>
                            
                            <div class="photos-section">
                                <div class="photos-title">
                                    <i class="fas fa-camera"></i>
                                    정비 사진
                                </div>
                                <div class="photos-grid">
                                    <div class="photo-item">
                                        <input type="file" class="photo-input" data-type="before" accept="image/*">
                                        <div id="beforePhotoPreview" class="photo-preview" title="정비 전 사진">
                                            <i class="fas fa-camera"></i>
                                        </div>
                                    </div>
                                    <div class="photo-item">
                                        <input type="file" class="photo-input" data-type="during" accept="image/*">
                                        <div id="duringPhotoPreview" class="photo-preview" title="정비 중 사진">
                                            <i class="fas fa-camera"></i>
                                        </div>
                                    </div>
                                    <div class="photo-item">
                                        <input type="file" class="photo-input" data-type="after" accept="image/*">
                                        <div id="afterPhotoPreview" class="photo-preview" title="정비 후 사진">
                                            <i class="fas fa-camera"></i>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" onclick="closeMaintenanceInputModal()">
                                    <i class="fas fa-times"></i> 취소
                                </button>
                                <button type="submit" class="btn btn-primary">
                                    <i class="fas fa-save"></i> 저장
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            `;
            
            // 이벤트 리스너 다시 연결
            setupPhotoInputListeners();
            setupMaintenanceFormListener();
            
            modal.classList.add('show');
            backdrop.classList.add('show');
        }
    }

    // 정비 이력 입력 모달 닫기 함수
    window.closeMaintenanceInputModal = function() {
        const modal = document.getElementById('maintenanceInputModal');
        const backdrop = document.getElementById('modalBackdrop');
        if (modal && backdrop) {
            modal.classList.remove('show');
            backdrop.classList.remove('show');
            // 폼 초기화
            const form = document.getElementById('newMaintenanceModalForm');
            if (form) {
                form.reset();
            }
            // 사진 미리보기 초기화
            document.querySelectorAll('.photo-preview').forEach(preview => {
                preview.innerHTML = '';
            });
            // 업로드된 사진 데이터 초기화
            uploadedPhotos = { before: null, during: null, after: null };
        }
    }

    // 사진 입력 이벤트 리스너 설정 함수
    function setupPhotoInputListeners() {
        document.querySelectorAll('.photo-input').forEach(input => {
            const type = input.dataset.type;
            const previewId = `${type}PhotoPreview`;
            const previewDiv = document.getElementById(previewId);

            if (previewDiv) {
                previewDiv.addEventListener('click', () => {
                    input.click();
                });
            }

            input.addEventListener('change', async function(e) {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    if (!file.type.startsWith('image/')) {
                        showNotification('이미지 파일만 업로드 가능합니다.', 'error');
                        return;
                    }
                    if (file.size > 5 * 1024 * 1024) {
                        showNotification('파일 크기는 5MB를 초과할 수 없습니다.', 'error');
                        return;
                    }
                    previewDiv.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> 처리중...</div>';

                    // const resizedImage = await resizeImage(file);
                    const resizedImage = file; // 원본 파일 그대로 사용
                    previewDiv.innerHTML = '';
                    const previewContainer = document.createElement('div');
                    previewContainer.className = 'preview-container';
                    const img = document.createElement('img');
                    img.src = URL.createObjectURL(resizedImage);
                    img.onload = () => URL.revokeObjectURL(img.src);
                    previewContainer.appendChild(img);
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'remove-photo';
                    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
                    removeBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        previewContainer.remove();
                        uploadedPhotos[type] = null;
                        input.value = '';
                        previewDiv.innerHTML = '';
                    };
                    previewContainer.appendChild(removeBtn);
                    previewDiv.appendChild(previewContainer);
                    uploadedPhotos[type] = resizedImage;
                } catch (err) {
                    console.error('사진 처리 중 오류:', err);
                    showNotification('사진 처리 중 문제가 발생했습니다.', 'error');
                    previewDiv.innerHTML = '';
                }
            });
        });
    }

    // 정비 폼 이벤트 리스너 설정 함수
    function setupMaintenanceFormListener() {
        const form = document.getElementById('newMaintenanceModalForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!isAdmin) return;

                try {
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

                    const docRef = await db.collection('maintenance').add(maintenanceData);
                    const photos = await uploadMaintenancePhotos(docRef.id);
                    
                    if (photos.length > 0) {
                        await docRef.update({ photos });
                    }

                    closeMaintenanceInputModal();
                    form.reset();
                    uploadedPhotos = { before: null, during: null, after: null };
                    loadMaintenanceHistory();
                    showNotification('정비 이력이 저장되었습니다.', 'success');
                    
                } catch (err) {
                    console.error('정비 이력 저장 중 오류:', err);
                    showNotification('정비 이력 저장 실패: ' + err.message, 'error');
                }
            });
        }
    }

    // 정비 이력 상세 보기 모달 열기
    window.showMaintenanceDetail = function(maintenance) {
        const modal = document.getElementById('maintenanceDetailModal');
        const backdrop = document.getElementById('modalBackdrop');
        
        if (!modal || !backdrop) return;

        const typeInfo = getTypeIconAndColor(maintenance.type);

        // 모달 내용 업데이트
        modal.innerHTML = `
            <div class="modal-content" onclick="event.stopPropagation();">
                <div class="modal-header">
                    <h2><i class="fas fa-tools"></i> 정비 이력 상세</h2>
                    <button class="close-btn" onclick="closeMaintenanceDetailModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="detail-info">
                        <div class="detail-title-row">
                            <div class="detail-type" style="color: ${typeInfo.color}">
                                <i class="fas ${typeInfo.icon}"></i> ${maintenance.type || ''}
                            </div>
                            <div class="detail-date">${maintenance.date || ''}</div>
                        </div>
                        <div class="detail-status ${maintenance.status}">${getStatusText(maintenance.status)}</div>
                        <div class="detail-info-row">
                            <div class="detail-motorcycle-number">
                                <i class="fas fa-motorcycle"></i> 오토바이 번호: ${maintenance.carNumber}
                            </div>
                            <div class="spacer"></div>
                            ${maintenance.mileage ? `
                                <div class="detail-mileage" style="color: ${typeInfo.color}">
                                    <i class="fas fa-tachometer-alt"></i> 키로수: ${maintenance.mileage}km
                                </div>
                            ` : ''}
                        </div>
                        <div class="detail-description">${maintenance.description || ''}</div>
                        ${maintenance.adminName ? `
                            <div class="detail-admin">
                                <i class="fas fa-user-shield"></i> 관리자: ${maintenance.adminName}
                            </div>
                        ` : ''}
                    </div>
                    
                    ${maintenance.photos && maintenance.photos.length > 0 ? `
                        <div class="photos-section">
                            <div class="photos-title">
                                <i class="fas fa-camera"></i> 정비 사진
                            </div>
                            <div class="photos-grid">
                                ${maintenance.photos.map(photo => `
                                    <div class="photo-item" data-type="${photo.type}">
                                        <div class="photo-label">
                                            ${photo.type === 'before' ? 
                                              '<i class="fas fa-exclamation-triangle"></i> 정비 전' : 
                                              photo.type === 'during' ? 
                                              '<i class="fas fa-cog"></i> 정비 중' : 
                                              '<i class="fas fa-check-circle"></i> 정비 후'}
                                        </div>
                                        <div class="photo-preview">
                                            <img src="${photo.thumbnailUrl}" 
                                                 onclick="window.open('${photo.url}', '_blank')" 
                                                 alt="${photo.type} 사진"
                                                 class="detail-photo">
                                        </div>
                                        <div class="photo-actions">
                                            ${getPhotoTimeLeftHtml(photo)}
                                            <button class="download-btn" 
                                                    onclick="event.stopPropagation(); downloadImage('${photo.url}', 'maintenance_${maintenance.id}_${photo.type}.jpg')">
                                                <i class="fas fa-download"></i> 다운로드
                                            </button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        // CSS 스타일 수정
        const style = document.createElement('style');
        style.textContent = `
            .photo-input {
                display: none;
            }
            
            .preview-container {
                position: relative;
                width: 100%;
                height: 100%;
                background: #fff;
                border-radius: 8px;
                overflow: hidden;
            }
            
            .preview-container img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            .remove-photo {
                position: absolute;
                top: 8px;
                right: 8px;
                background: rgba(0, 0, 0, 0.5);
                color: white;
                border: none;
                border-radius: 50%;
                width: 24px;
                height: 24px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background-color 0.2s;
                z-index: 1;
            }
            
            .remove-photo:hover {
                background: rgba(0, 0, 0, 0.7);
            }
            
            .loading-spinner {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100%;
                color: #666;
            }
            
            .photo-preview {
                position: relative;
                width: 100%;
                height: 200px;
                background: #f5f5f5;
                border: 2px dashed #ddd;
                border-radius: 8px;
                overflow: hidden;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }
            
            .photo-preview:hover {
                border-color: #999;
                background: #eee;
            }
            
            .photo-preview:empty::before {
                content: "\\f030";  /* 카메라 아이콘 */
                font-family: "Font Awesome 5 Free";
                font-weight: 900;
                font-size: 2em;
                color: #999;
                margin-bottom: 8px;
            }
            
            .photo-preview:empty::after {
                content: "사진 추가";
                color: #666;
                font-size: 14px;
            }

            .modal-content {
                background: white;
                border-radius: 12px;
                max-width: 700px;
                width: 90%;
                margin: 20px auto;
                position: relative;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }

            .modal-header {
                background: #007bff;
                color: white;
                padding: 15px 20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .modal-header h2 {
                margin: 0;
                font-size: 1.5em;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .modal-body {
                padding: 15px;
                max-height: calc(100vh - 200px);
                overflow-y: auto;
            }

            .input-group {
                margin-bottom: 20px;
            }

            .input-label {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
                color: #666;
            }

            .input-label i {
                color: #007bff;
            }

            input[type="text"],
            input[type="date"],
            input[type="number"],
            select,
            textarea {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #ddd;
                border-radius: 6px;
                font-size: 16px;
            }

            select {
                background-color: white;
            }

            textarea {
                resize: vertical;
                min-height: 100px;
            }

            .photos-section {
                margin-top: 15px;
            }

            .photos-title {
                font-size: 1.1em;
                color: #333;
                margin-bottom: 12px;
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .photos-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 12px;
                margin-bottom: 15px;
            }

            .photo-item {
                display: flex;
                flex-direction: column;
                gap: 6px;
                position: relative;
                border-radius: 6px;
                padding: 8px;
                transition: all 0.3s ease;
                background: #fff;
            }

            .photo-item[data-type="before"] {
                background: rgba(255, 99, 71, 0.1);
                border: 2px solid rgba(255, 99, 71, 0.3);
            }

            .photo-item[data-type="during"] {
                background: rgba(255, 206, 86, 0.1);
                border: 2px solid rgba(255, 206, 86, 0.3);
            }

            .photo-item[data-type="after"] {
                background: rgba(75, 192, 192, 0.1);
                border: 2px solid rgba(75, 192, 192, 0.3);
            }

            .photo-item:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            }

            .photo-preview {
                width: 100%;
                height: 120px;
                border-radius: 4px;
                overflow: hidden;
                position: relative;
            }

            .detail-photo {
                width: 100%;
                height: 100%;
                object-fit: cover;
                cursor: pointer;
                transition: transform 0.2s;
            }

            .detail-photo:hover {
                transform: scale(1.05);
            }

            .photo-label {
                font-size: 0.85em;
                font-weight: 600;
                text-align: center;
                padding: 4px;
                border-radius: 4px;
                margin-bottom: 2px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
            }

            .photo-item[data-type="before"] .photo-label {
                background: rgba(255, 99, 71, 0.2);
                color: #ff6347;
            }

            .photo-item[data-type="during"] .photo-label {
                background: rgba(255, 206, 86, 0.2);
                color: #d4ac0d;
            }

            .photo-item[data-type="after"] .photo-label {
                background: rgba(75, 192, 192, 0.2);
                color: #4bc0c0;
            }

            .photo-actions {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .countdown {
                font-size: 0.8em;
                color: #666;
                display: flex;
                align-items: center;
                gap: 3px;
            }

            .countdown.urgent {
                color: #ff6347;
            }

            .download-btn {
                padding: 3px 6px;
                font-size: 0.85em;
            }

            @media (max-width: 768px) {
                .modal-content {
                    width: 95%;
                    margin: 10px;
                }

                .modal-body {
                    padding: 12px;
                }

                .photos-grid {
                    grid-template-columns: repeat(3, 1fr);
                    gap: 8px;
                }
                
                .photo-preview {
                    height: 100px;
                }
                
                .detail-row {
                    gap: 8px;
                }

                .photo-label {
                    font-size: 0.8em;
                    padding: 3px;
                }

                .download-btn {
                    padding: 2px 4px;
                    font-size: 0.8em;
                }
            }

            @media (max-width: 480px) {
                .photos-grid {
                    grid-template-columns: repeat(2, 1fr);
                }
            }
        `;
        document.head.appendChild(style);

        // 모달 표시
        modal.classList.add('show');
        backdrop.classList.add('show');
        history.pushState({ page: 'detail', modalId: 'maintenanceDetail' }, '');
    }

    // 사진 남은 시간 HTML 생성 함수
    function getPhotoTimeLeftHtml(photo) {
        const createdAt = new Date(photo.createdAt);
        const now = new Date();
        const expiryDate = new Date(createdAt);
        expiryDate.setDate(expiryDate.getDate() + 30);
        const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
        const timeLeftText = daysLeft > 0 ? `삭제까지 ${daysLeft}일 남음` : '곧 삭제됨';
        const urgentClass = daysLeft <= 7 ? 'urgent' : '';
        
        return `
            <div class="countdown ${urgentClass}">
                <i class="fas fa-clock"></i>
                ${timeLeftText}
            </div>
        `;
    }

    // 정비 이력 상세 보기 모달 닫기
    window.closeMaintenanceDetailModal = function() {
        const modal = document.getElementById('maintenanceDetailModal');
        const backdrop = document.getElementById('modalBackdrop');
        
        if (!modal || !backdrop) return;

        modal.classList.remove('show');
        backdrop.classList.remove('show');
    }

    // 사진 아이템 생성 함수
    function createPhotoItem(label, photoData) {
        if (!photoData || !photoData.url) return '';

        const uploadTime = new Date(photoData.uploadTime);
        const expirationTime = new Date(uploadTime.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30일 후
        const now = new Date();
        const remainingDays = Math.ceil((expirationTime - now) / (1000 * 60 * 60 * 24));
        
        const countdownClass = remainingDays <= 5 ? 'urgent' : '';
        const countdownText = remainingDays > 0 
            ? `${remainingDays}일 후 삭제됩니다.`
            : '만료되었습니다.';

        return `
            <div class="photo-item">
                <div class="photo-label">${label}</div>
                <img src="${photoData.url}" alt="${label}" class="detail-photo" 
                    onclick="window.open('${photoData.url}', '_blank')">
                <div class="photo-actions">
                    <div class="countdown ${countdownClass}">
                        <i class="fas fa-clock"></i>
                        ${countdownText}
                    </div>
                    <a href="${photoData.url}" class="download-btn" 
                        download="${label}_${new Date().toISOString().split('T')[0]}"
                        target="_blank"
                        onclick="event.stopPropagation()">
                        <i class="fas fa-download"></i>
                        다운로드
                    </a>
                </div>
            </div>
        `;
    }

    // 앱 시작 시 popstate 이벤트 리스너 추가
    window.addEventListener('popstate', handlePopState);

    // 사진 미리보기 및 업로드 처리
    document.querySelectorAll('.photo-input').forEach(input => {
        const type = input.dataset.type;
        const previewId = `${type}PhotoPreview`;
        const previewDiv = document.getElementById(previewId);

        // 미리보기 영역 클릭 시 파일 선택 창 열기
        if (previewDiv) {
            previewDiv.addEventListener('click', () => {
                input.click();
            });
        }

        input.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;

            try {
                if (!file.type.startsWith('image/')) {
                    showNotification('이미지 파일만 업로드 가능합니다.', 'error');
                    return;
                }
                if (file.size > 5 * 1024 * 1024) {
                    showNotification('파일 크기는 5MB를 초과할 수 없습니다.', 'error');
                    return;
                }
                previewDiv.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> 처리중...</div>';

                // const resizedImage = await resizeImage(file);
                const resizedImage = file; // 원본 파일 그대로 사용
                previewDiv.innerHTML = '';
                const previewContainer = document.createElement('div');
                previewContainer.className = 'preview-container';
                const img = document.createElement('img');
                img.src = URL.createObjectURL(resizedImage);
                img.onload = () => URL.revokeObjectURL(img.src);
                previewContainer.appendChild(img);
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-photo';
                removeBtn.innerHTML = '<i class="fas fa-times"></i>';
                removeBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    previewContainer.remove();
                    uploadedPhotos[type] = null;
                    input.value = '';
                    previewDiv.innerHTML = '';
                };
                previewContainer.appendChild(removeBtn);
                previewDiv.appendChild(previewContainer);
                uploadedPhotos[type] = resizedImage;
            } catch (err) {
                console.error('사진 처리 중 오류:', err);
                showNotification('사진 처리 중 문제가 발생했습니다.', 'error');
                previewDiv.innerHTML = '';
            }
        });
    });

    // 오토바이 번호 수정 함수
    window.updateCarNumber = async function() {
        if (!currentUser) return;

        const modal = document.getElementById('carNumberModal');
        const newCarNumber = document.getElementById('newCarNumber').value.trim().toLowerCase();
        
        if (!newCarNumber) {
            showNotification('오토바이 번호를 입력해주세요.', 'error');
            return;
        }

        try {
            // 현재 번호와 동일한 경우 변경하지 않음
            if (newCarNumber === currentUser.carNumber) {
                showNotification('현재 번호와 동일합니다.', 'info');
                return;
            }

            // 중복 체크
            const snapshot = await db.collection('users')
                .where('carNumber', '==', newCarNumber)
                .get();

            if (!snapshot.empty) {
                showNotification('이미 등록된 오토바이 번호입니다.', 'error');
                return;
            }

            // 번호 업데이트
            await db.collection('users').doc(currentUser.uid).update({
                carNumber: newCarNumber,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // 정비 이력의 차량번호도 함께 업데이트
            const maintenanceSnapshot = await db.collection('maintenance')
                .where('carNumber', '==', currentUser.carNumber)
                .get();

            const batch = db.batch();
            maintenanceSnapshot.forEach(doc => {
                batch.update(doc.ref, { 
                    carNumber: newCarNumber,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            await batch.commit();

            currentUser.carNumber = newCarNumber;
            updateUI();
            closeCarNumberModal();
            showNotification('오토바이 번호가 수정되었습니다.', 'success');
            
            // 정비 이력 목록 새로고침
            loadMaintenanceHistory();
        } catch (error) {
            console.error('Error updating car number:', error);
            showNotification('오토바이 번호 수정 실패: ' + error.message, 'error');
        }
    }

    // 오토바이 번호 수정 모달 열기
    window.openCarNumberModal = function() {
        const modal = document.getElementById('carNumberModal');
        const backdrop = document.getElementById('modalBackdrop');
        const input = document.getElementById('newCarNumber');
        
        if (modal && backdrop && input) {
            input.value = currentUser ? currentUser.carNumber : '';
            modal.classList.add('show');
            backdrop.classList.add('show');
            input.focus();
        }
    }

    // 오토바이 번호 수정 모달 닫기
    window.closeCarNumberModal = function() {
        const modal = document.getElementById('carNumberModal');
        const backdrop = document.getElementById('modalBackdrop');
        
        if (modal && backdrop) {
            modal.classList.remove('show');
            backdrop.classList.remove('show');
            document.getElementById('newCarNumber').value = '';
        }
    }

    // 오토바이 번호 수정 버튼 이벤트 리스너
    const updateCarNumberBtn = document.getElementById('updateCarNumberBtn');
    if (updateCarNumberBtn) {
        updateCarNumberBtn.addEventListener('click', () => {
            if (!currentUser) {
                showNotification('로그인이 필요합니다.', 'error');
                return;
            }
            openCarNumberModal();
        });
    }

    // 모달 클릭 이벤트 처리
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            // 모달 바깥(백드롭) 클릭 시에만 닫기
            if (e.target === modal) {
                if (modal.id === 'maintenanceDetailModal') {
                    closeMaintenanceDetailModal();
                } else if (modal.id === 'maintenanceInputModal') {
                    closeMaintenanceInputModal();
                } else if (modal.id === 'carNumberModal') {
                    closeCarNumberModal();
                }
            }
            // 모달 내부 클릭은 아무 처리도 하지 않음
        });

        // 터치 이벤트 처리
        modal.addEventListener('touchmove', (e) => {
            if (e.target.closest('.modal-content')) {
                e.stopPropagation();
            }
        }, { passive: true });
    });

    // 백드롭 클릭 이벤트 처리
    const backdrop = document.getElementById('modalBackdrop');
    if (backdrop) {
        backdrop.addEventListener('click', (e) => {
            // 백드롭 클릭 시에만 모달 닫기
            if (e.target === backdrop) {
                const activeModals = document.querySelectorAll('.modal.show');
                activeModals.forEach(modal => {
                    if (modal.id === 'maintenanceDetailModal') {
                        closeMaintenanceDetailModal();
                    } else if (modal.id === 'maintenanceInputModal') {
                        closeMaintenanceInputModal();
                    } else if (modal.id === 'carNumberModal') {
                        closeCarNumberModal();
                    }
                });
            }
        });

        // 백드롭 터치 이벤트 처리
        backdrop.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });
    }

    // 정비 이력 상세 보기 모달 스크롤 개선
    const detailModal = document.getElementById('maintenanceDetailModal');
    if (detailModal) {
        detailModal.addEventListener('touchstart', (e) => {
            const modalBody = detailModal.querySelector('.modal-body');
            if (modalBody) {
                const touchY = e.touches[0].clientY;
                const modalRect = modalBody.getBoundingClientRect();
                
                // 모달 내부 영역인 경우에만 스크롤 허용
                if (touchY >= modalRect.top && touchY <= modalRect.bottom) {
                    e.stopPropagation();
                }
            }
        }, { passive: true });
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

// 정비카드 생성 함수
async function createMaintenanceCard(maintenance) {
    const card = document.createElement('div');
    card.className = 'maintenance-card';
    
    // 클릭 이벤트에서 이벤트 전파 중단 추가
    card.addEventListener('click', (e) => {
        e.stopPropagation();
        showMaintenanceDetail(maintenance);
    });

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

// 정비 타입 아이콘 가져오기 함수
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

// 상태 텍스트 가져오기 함수
function getStatusText(status) {
    const statusTexts = {
        'approved': '승인됨',
        'rejected': '거절됨',
        'pending': '대기중'
    };
    return statusTexts[status] || status;
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

// 정비 상태 업데이트 함수
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

// 정비 이력 상세 보기 모달 열기
window.showMaintenanceDetail = function(maintenance) {
    const modal = document.getElementById('maintenanceDetailModal');
    const backdrop = document.getElementById('modalBackdrop');
    
    if (!modal || !backdrop) return;

    const typeInfo = getTypeIconAndColor(maintenance.type);

    // 모달 내용 업데이트
    modal.innerHTML = `
        <div class="modal-content" onclick="event.stopPropagation();">
            <div class="modal-header">
                <h2><i class="fas fa-tools"></i> 정비 이력 상세</h2>
                <button class="close-btn" onclick="closeMaintenanceDetailModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="detail-info">
                    <div class="detail-title-row">
                        <div class="detail-type" style="color: ${typeInfo.color}">
                            <i class="fas ${typeInfo.icon}"></i> ${maintenance.type || ''}
                        </div>
                        <div class="detail-date">${maintenance.date || ''}</div>
                    </div>
                    <div class="detail-status ${maintenance.status}">${getStatusText(maintenance.status)}</div>
                    <div class="detail-info-row">
                        <div class="detail-motorcycle-number">
                            <i class="fas fa-motorcycle"></i> 오토바이 번호: ${maintenance.carNumber}
                        </div>
                        <div class="spacer"></div>
                        ${maintenance.mileage ? `
                            <div class="detail-mileage" style="color: ${typeInfo.color}">
                                <i class="fas fa-tachometer-alt"></i> 키로수: ${maintenance.mileage}km
                            </div>
                        ` : ''}
                    </div>
                    <div class="detail-description">${maintenance.description || ''}</div>
                    ${maintenance.adminName ? `
                        <div class="detail-admin">
                            <i class="fas fa-user-shield"></i> 관리자: ${maintenance.adminName}
                        </div>
                    ` : ''}
                </div>
                
                ${maintenance.photos && maintenance.photos.length > 0 ? `
                    <div class="photos-section">
                        <div class="photos-title">
                            <i class="fas fa-camera"></i> 정비 사진
                        </div>
                        <div class="photos-grid">
                            ${maintenance.photos.map(photo => `
                                <div class="photo-item" data-type="${photo.type}">
                                    <div class="photo-label">
                                        ${photo.type === 'before' ? 
                                          '<i class="fas fa-exclamation-triangle"></i> 정비 전' : 
                                          photo.type === 'during' ? 
                                          '<i class="fas fa-cog"></i> 정비 중' : 
                                          '<i class="fas fa-check-circle"></i> 정비 후'}
                                    </div>
                                    <div class="photo-preview">
                                        <img src="${photo.thumbnailUrl}" 
                                             onclick="window.open('${photo.url}', '_blank')" 
                                             alt="${photo.type} 사진"
                                             class="detail-photo">
                                    </div>
                                    <div class="photo-actions">
                                        ${getPhotoTimeLeftHtml(photo)}
                                        <button class="download-btn" 
                                                onclick="event.stopPropagation(); downloadImage('${photo.url}', 'maintenance_${maintenance.id}_${photo.type}.jpg')">
                                            <i class="fas fa-download"></i> 다운로드
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    // CSS 스타일 수정
    const style = document.createElement('style');
    style.textContent = `
        .photo-input {
            display: none;
        }
        
        .preview-container {
            position: relative;
            width: 100%;
            height: 100%;
            background: #fff;
            border-radius: 8px;
            overflow: hidden;
        }
        
        .preview-container img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .remove-photo {
            position: absolute;
            top: 8px;
            right: 8px;
            background: rgba(0, 0, 0, 0.5);
            color: white;
            border: none;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s;
            z-index: 1;
        }
        
        .remove-photo:hover {
            background: rgba(0, 0, 0, 0.7);
        }
        
        .loading-spinner {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #666;
        }
        
        .photo-preview {
            position: relative;
            width: 100%;
            height: 200px;
            background: #f5f5f5;
            border: 2px dashed #ddd;
            border-radius: 8px;
            overflow: hidden;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }
        
        .photo-preview:hover {
            border-color: #999;
            background: #eee;
        }
        
        .photo-preview:empty::before {
            content: "\\f030";  /* 카메라 아이콘 */
            font-family: "Font Awesome 5 Free";
            font-weight: 900;
            font-size: 2em;
            color: #999;
            margin-bottom: 8px;
        }
        
        .photo-preview:empty::after {
            content: "사진 추가";
            color: #666;
            font-size: 14px;
        }

        .modal-content {
            background: white;
            border-radius: 12px;
            max-width: 700px;
            width: 90%;
            margin: 20px auto;
            position: relative;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .modal-header {
            background: #007bff;
            color: white;
            padding: 15px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .modal-header h2 {
            margin: 0;
            font-size: 1.5em;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .modal-body {
            padding: 15px;
            max-height: calc(100vh - 200px);
            overflow-y: auto;
        }

        .input-group {
            margin-bottom: 20px;
        }

        .input-label {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            color: #666;
        }

        .input-label i {
            color: #007bff;
        }

        input[type="text"],
        input[type="date"],
        input[type="number"],
        select,
        textarea {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 16px;
        }

        select {
            background-color: white;
        }

        textarea {
            resize: vertical;
            min-height: 100px;
        }

        .photos-section {
            margin-top: 15px;
        }

        .photos-title {
            font-size: 1.1em;
            color: #333;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .photos-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 15px;
        }

        .photo-item {
            display: flex;
            flex-direction: column;
            gap: 6px;
            position: relative;
            border-radius: 6px;
            padding: 8px;
            transition: all 0.3s ease;
            background: #fff;
        }

        .photo-item[data-type="before"] {
            background: rgba(255, 99, 71, 0.1);
            border: 2px solid rgba(255, 99, 71, 0.3);
        }

        .photo-item[data-type="during"] {
            background: rgba(255, 206, 86, 0.1);
            border: 2px solid rgba(255, 206, 86, 0.3);
        }

        .photo-item[data-type="after"] {
            background: rgba(75, 192, 192, 0.1);
            border: 2px solid rgba(75, 192, 192, 0.3);
        }

        .photo-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }

        .photo-preview {
            width: 100%;
            height: 120px;
            border-radius: 4px;
            overflow: hidden;
            position: relative;
        }

        .detail-photo {
            width: 100%;
            height: 100%;
            object-fit: cover;
            cursor: pointer;
            transition: transform 0.2s;
        }

        .detail-photo:hover {
            transform: scale(1.05);
        }

        .photo-label {
            font-size: 0.85em;
            font-weight: 600;
            text-align: center;
            padding: 4px;
            border-radius: 4px;
            margin-bottom: 2px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }

        .photo-item[data-type="before"] .photo-label {
            background: rgba(255, 99, 71, 0.2);
            color: #ff6347;
        }

        .photo-item[data-type="during"] .photo-label {
            background: rgba(255, 206, 86, 0.2);
            color: #d4ac0d;
        }

        .photo-item[data-type="after"] .photo-label {
            background: rgba(75, 192, 192, 0.2);
            color: #4bc0c0;
        }

        .photo-actions {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .countdown {
            font-size: 0.8em;
            color: #666;
            display: flex;
            align-items: center;
            gap: 3px;
        }

        .countdown.urgent {
            color: #ff6347;
        }

        .download-btn {
            padding: 3px 6px;
            font-size: 0.85em;
        }

        @media (max-width: 768px) {
            .modal-content {
                width: 95%;
                margin: 10px;
            }

            .modal-body {
                padding: 12px;
            }

            .photos-grid {
                grid-template-columns: repeat(3, 1fr);
                gap: 8px;
            }
            
            .photo-preview {
                height: 100px;
            }
            
            .detail-row {
                gap: 8px;
            }

            .photo-label {
                font-size: 0.8em;
                padding: 3px;
            }

            .download-btn {
                padding: 2px 4px;
                font-size: 0.8em;
            }
        }

        @media (max-width: 480px) {
            .photos-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    `;
    document.head.appendChild(style);

    // 모달 표시
    modal.classList.add('show');
    backdrop.classList.add('show');
    history.pushState({ page: 'detail', modalId: 'maintenanceDetail' }, '');
}

// 정비 이력 상세 보기 모달 닫기
window.closeMaintenanceDetailModal = function() {
    const modal = document.getElementById('maintenanceDetailModal');
    const backdrop = document.getElementById('modalBackdrop');
    
    if (!modal || !backdrop) return;

    modal.classList.remove('show');
    backdrop.classList.remove('show');
}

// 정비 타입별 아이콘과 색상 가져오기
function getTypeIconAndColor(type) {
    const types = {
        '일반점검': { icon: 'fa-tools', color: '#4bc0c0', bgColor: 'rgba(75, 192, 192, 0.1)' },
        '엔진오일교체': { icon: 'fa-oil-can', color: '#ff6347', bgColor: 'rgba(255, 99, 71, 0.1)' },
        '타이어교체': { icon: 'fa-circle-notch', color: '#d4ac0d', bgColor: 'rgba(212, 172, 13, 0.1)' },
        '브레이크정비': { icon: 'fa-brake', color: '#ff9f40', bgColor: 'rgba(255, 159, 64, 0.1)' },
        '기타': { icon: 'fa-wrench', color: '#666', bgColor: 'rgba(102, 102, 102, 0.1)' }
    };
    return types[type] || types['기타'];
}

// popstate 이벤트 핸들러
function handlePopState(event) {
    const state = event.state;
    const maintenanceDetailModal = document.getElementById('maintenanceDetailModal');
    
    // 상세 페이지에서 뒤로가기 시
    if (state && state.page === 'detail') {
        closeMaintenanceDetailModal();
        history.pushState({ page: 'main' }, '');
        return;
    }
    
    // 메인 페이지에서 뒤로가기 시 (한 번만 물어보기)
    if (!state || state.page === 'main') {
        // 모달이 열려있으면 닫기만 하고 종료하지 않음
        if (maintenanceDetailModal && maintenanceDetailModal.classList.contains('show')) {
            closeMaintenanceDetailModal();
            history.pushState({ page: 'main' }, '');
            return;
        }
        
        // 모달이 닫혀있는 상태에서 뒤로가기 시 종료 여부 확인
        if (confirm('앱을 종료하시겠습니까?')) {
            window.close();
        } else {
            history.pushState({ page: 'main' }, '');
        }
    }
}

// 앱 시작 시 popstate 이벤트 리스너 추가
window.addEventListener('popstate', handlePopState);

// 사진 다운로드 함수 추가
async function downloadImage(url, filename) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);
    } catch (error) {
        console.error('이미지 다운로드 중 오류:', error);
        showNotification('이미지 다운로드에 실패했습니다.', 'error');
    }
} 