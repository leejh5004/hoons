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

    // 정비 이력 입력 모달 열기 함수
    window.openMaintenanceInputModal = function() {
        if (!isAdmin) {
            showNotification('관리자만 정비 이력을 추가할 수 있습니다.', 'error');
            return;
        }

        const modal = document.getElementById('maintenanceInputModal');
        const backdrop = document.getElementById('modalBackdrop');
        
        if (modal && backdrop) {
            console.log('정비 이력 입력 모달 열기 시작');
            
            // 모달 내용 업데이트
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title">
                            <i class="fas fa-tools"></i>
                            <span>새 정비 이력 입력</span>
                        </h2>
                        <button class="modal-close" onclick="closeMaintenanceInputModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="newMaintenanceModalForm">
                            <div class="mb-3">
                                <label for="maintenanceCarNumberModal" class="form-label">오토바이 번호</label>
                                <input type="text" class="form-control" id="maintenanceCarNumberModal" required>
                            </div>
                            <div class="mb-3">
                                <label for="maintenanceDateModal" class="form-label">정비 날짜</label>
                                <input type="date" class="form-control" id="maintenanceDateModal" required>
                            </div>
                            <div class="mb-3">
                                <label for="maintenanceMileageModal" class="form-label">키로수</label>
                                <input type="number" class="form-control" id="maintenanceMileageModal" placeholder="현재 주행거리 (km)" min="0" step="1" required>
                            </div>
                            <div class="mb-3">
                                <label for="maintenanceTypeModal" class="form-label">정비 종류</label>
                                <select class="form-control" id="maintenanceTypeModal" required>
                                    <option value="">선택하세요</option>
                                    <option value="일반점검">일반점검</option>
                                    <option value="엔진오일교체">엔진오일교체</option>
                                    <option value="타이어교체">타이어교체</option>
                                    <option value="브레이크정비">브레이크정비</option>
                                    <option value="기타">기타</option>
                                </select>
                            </div>

                            <!-- 사진 업로드 섹션 -->
                            <div class="form-group mt-4">
                                <label class="form-label">정비 사진</label>
                                <div class="photo-upload-container">
                                    <div class="photo-upload-group">
                                        <label class="photo-label">정비 전</label>
                                        <div class="photo-preview" id="beforePhotoPreview">
                                            <input type="file" class="photo-input" id="beforePhoto" accept="image/*" data-type="before" capture="environment">
                                            <div class="photo-placeholder">
                                                <i class="fas fa-camera"></i>
                                                <span>사진 추가</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="photo-upload-group">
                                        <label class="photo-label">정비 중</label>
                                        <div class="photo-preview" id="duringPhotoPreview">
                                            <input type="file" class="photo-input" id="duringPhoto" accept="image/*" data-type="during" capture="environment">
                                            <div class="photo-placeholder">
                                                <i class="fas fa-camera"></i>
                                                <span>사진 추가</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="photo-upload-group">
                                        <label class="photo-label">정비 후</label>
                                        <div class="photo-preview" id="afterPhotoPreview">
                                            <input type="file" class="photo-input" id="afterPhoto" accept="image/*" data-type="after" capture="environment">
                                            <div class="photo-placeholder">
                                                <i class="fas fa-camera"></i>
                                                <span>사진 추가</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="mb-3">
                                <label for="descriptionModal" class="form-label">상세 설명</label>
                                <textarea class="form-control" id="descriptionModal" rows="3" required></textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer maintenance-footer-fixed">
                        <button type="submit" class="btn btn-primary" form="newMaintenanceModalForm">
                            <i class="fas fa-save me-1"></i>저장
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="closeMaintenanceInputModal()">
                            <i class="fas fa-times me-1"></i>취소
                        </button>
                    </div>
                </div>
            `;
            
            console.log('모달 HTML 설정 완료, 이벤트 리스너 설정 시작');
            
            // 이벤트 리스너 다시 연결
            setupPhotoInputListeners();
            setupMaintenanceFormListener();
            
            console.log('이벤트 리스너 설정 완료, 모달 표시');
            
            modal.classList.add('show');
            backdrop.classList.add('show');
            
            console.log('정비 이력 입력 모달 열기 완료');
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

    // PC/모바일에 따라 사진 입력 input의 capture 속성을 동적으로 설정
    function setPhotoInputCapture() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        document.querySelectorAll('.photo-input').forEach(input => {
            if (isMobile) {
                input.setAttribute('capture', 'environment');
            } else {
                input.removeAttribute('capture');
            }
        });
    }

    // 사진 입력 이벤트 리스너 설정 함수 (강화된 클릭 처리)
    function setupPhotoInputListeners() {
        console.log('사진 업로드 리스너 설정 시작');
        // 기존 이벤트 리스너 제거 (중복 방지)
        document.querySelectorAll('.photo-preview').forEach(preview => {
            const newPreview = preview.cloneNode(true);
            preview.parentNode.replaceChild(newPreview, preview);
        });
        document.querySelectorAll('.photo-input').forEach((input, index) => {
            const type = input.dataset.type;
            const previewId = `${type}PhotoPreview`;
            const previewDiv = document.getElementById(previewId);
            console.log(`설정 중: ${type} (${index + 1}/3)`, { input, previewDiv });
            if (previewDiv) {
                const clickHandler = (e) => {
                    console.log(`${type} 클릭 이벤트 발생`);
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                        input.click();
                        console.log(`${type} input.click() 성공`);
                    } catch (error) {
                        console.error(`${type} input.click() 실패:`, error);
                    }
                };
                previewDiv.addEventListener('click', clickHandler);
                previewDiv.addEventListener('touchstart', clickHandler);
                previewDiv.addEventListener('mousedown', clickHandler);
                previewDiv.addEventListener('focus', () => {
                    console.log(`${type} focus 이벤트 발생`);
                    input.click();
                });
                let lastTap = 0;
                previewDiv.addEventListener('touchend', (e) => {
                    const currentTime = new Date().getTime();
                    const tapLength = currentTime - lastTap;
                    if (tapLength < 500 && tapLength > 0) {
                        e.preventDefault();
                        return;
                    }
                    lastTap = currentTime;
                });
            }
            input.addEventListener('change', async function(e) {
                console.log(`${type} 파일 선택됨:`, e.target.files[0]);
                const file = e.target.files[0];
                if (!file) {
                    console.log(`${type} 파일이 선택되지 않음`);
                    return;
                }
                try {
                    if (!file.type.startsWith('image/')) {
                        showNotification('이미지 파일만 업로드 가능합니다.', 'error');
                        return;
                    }
                    if (file.size > 5 * 1024 * 1024) {
                        showNotification('파일 크기는 5MB를 초과할 수 없습니다.', 'error');
                        return;
                    }
                    console.log(`${type} 이미지 처리 시작`);
                    previewDiv.innerHTML = '<div class="loading-spinner" style="display: flex; align-items: center; justify-content: center; height: 100px; color: #007bff;"><i class="fas fa-spinner fa-spin" style="font-size: 2em; margin-right: 10px;"></i> 처리중...</div>';
                    const resizedImage = await resizeImage(file);
                    console.log(`${type} 이미지 리사이즈 완료:`, resizedImage);
                    previewDiv.innerHTML = '';
                    const previewContainer = document.createElement('div');
                    previewContainer.className = 'preview-container';
                    previewContainer.style.cssText = `
                        position: relative;
                        width: 100%;
                        height: 100%;
                        border-radius: 8px;
                        overflow: hidden;
                        background: #fff;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    `;
                    const img = document.createElement('img');
                    img.style.cssText = `
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                        border-radius: 8px;
                    `;
                    const blobUrl = URL.createObjectURL(resizedImage);
                    img.src = blobUrl;
                    img.alt = `${type} 사진 미리보기`;
                    img.onload = () => {
                        console.log(`${type} 이미지 로드 완료`);
                        URL.revokeObjectURL(blobUrl);
                    };
                    img.onerror = () => {
                        console.error(`${type} 이미지 로드 실패`);
                        URL.revokeObjectURL(blobUrl);
                    };
                    previewContainer.appendChild(img);
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'remove-photo';
                    removeBtn.innerHTML = '<i class="fas fa-times"></i>';
                    removeBtn.style.cssText = `
                        position: absolute;
                        top: 5px;
                        right: 5px;
                        background: rgba(255,0,0,0.8);
                        color: white;
                        border: none;
                        border-radius: 50%;
                        width: 30px;
                        height: 30px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        z-index: 10;
                    `;
                    removeBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log(`${type} 사진 제거 버튼 클릭`);
                        previewContainer.remove();
                        uploadedPhotos[type] = null;
                        input.value = '';
                        previewDiv.innerHTML = `
                            <div class="photo-placeholder">
                                <i class="fas fa-camera"></i>
                                <span>사진 추가</span>
                            </div>
                        `;
                        console.log(`${type} 사진 제거됨`);
                    };
                    previewContainer.appendChild(removeBtn);
                    previewDiv.appendChild(previewContainer);
                    uploadedPhotos[type] = resizedImage;
                    console.log(`${type} 사진 업로드 완료, 미리보기 표시됨`);
                    showNotification(`${type} 사진이 업로드되었습니다.`, 'success');
                } catch (err) {
                    console.error(`${type} 사진 처리 중 오류:`, err);
                    showNotification('사진 처리 중 문제가 발생했습니다.', 'error');
                    previewDiv.innerHTML = `
                        <div class="photo-placeholder">
                            <i class="fas fa-camera"></i>
                            <span>사진 추가</span>
                        </div>
                    `;
                }
            });
            input.addEventListener('click', (e) => {
                console.log(`${type} input 직접 클릭됨`);
            });
        });
        // PC/모바일에 따라 capture 속성 동적 적용
        setPhotoInputCapture();
        console.log('사진 업로드 리스너 설정 완료');
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
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-tools"></i> 정비 이력 상세</h2>
                    <button class="close-btn" onclick="closeMaintenanceDetailModal()" aria-label="닫기">
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
                        </div>
                        ${maintenance.mileage ? `
                            <div class="detail-mileage" style="color: ${typeInfo.color}; margin-top: 4px;">
                                <i class="fas fa-tachometer-alt"></i> 키로수: ${maintenance.mileage}km
                            </div>
                        ` : ''}
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
                                                 alt="${photo.type} 사진">
                                        </div>
                                        <div class="photo-actions">
                                            ${getPhotoTimeLeftHtml(photo)}
                                            <button class="download-btn" 
                                                    onclick="event.stopPropagation(); downloadImage('${photo.url}', '${photo.type}_${new Date().toISOString().split('T')[0]}')">
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
        const detailStyle = document.createElement('style');
        detailStyle.textContent = `
            .detail-info {
                background: #f8f9fa;
                border-radius: 8px;
                padding: 15px;
                margin-bottom: 15px;
            }

            .detail-title-row {
                display: flex;
                align-items: center;
                gap: 15px;
                margin-bottom: 8px;
            }

            .detail-type {
                font-size: 1.2em;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .detail-date {
                color: #666;
                margin-left: auto;
            }

            .detail-status {
                padding: 6px 10px;
                border-radius: 4px;
                font-size: 0.9em;
                font-weight: 500;
                margin-bottom: 12px;
                display: inline-block;
            }

            .detail-info-row {
                display: flex;
                align-items: center;
                gap: 20px;
                margin-bottom: 12px;
                flex-wrap: nowrap;
            }

            .spacer {
                width: 20px;
            }

            .detail-motorcycle-number,
            .detail-mileage {
                display: flex;
                align-items: center;
                gap: 8px;
                white-space: nowrap;
            }

            .detail-motorcycle-number {
                color: #666;
            }

            .detail-description {
                margin-top: 12px;
                padding: 12px;
                background: white;
                border-radius: 6px;
                white-space: pre-wrap;
                line-height: 1.5;
            }

            .detail-admin {
                margin-top: 12px;
                color: #666;
                display: flex;
                align-items: center;
                gap: 8px;
            }
        `;
        document.head.appendChild(detailStyle);

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
                // 파일 타입 체크
                if (!file.type.startsWith('image/')) {
                    showNotification('이미지 파일만 업로드 가능합니다.', 'error');
                    return;
                }

                // 파일 크기 체크 (5MB 제한)
                if (file.size > 5 * 1024 * 1024) {
                    showNotification('파일 크기는 5MB를 초과할 수 없습니다.', 'error');
                    return;
                }

                // 로딩 표시
                previewDiv.innerHTML = '<div class="loading-spinner" style="display: flex; align-items: center; justify-content: center; height: 100px; color: #007bff;"><i class="fas fa-spinner fa-spin" style="font-size: 2em; margin-right: 10px;"></i> 처리중...</div>';

                // 이미지 리사이징
                const resizedImage = await resizeImage(file);
                
                // 기존 미리보기 제거
                previewDiv.innerHTML = '';
                
                // 새 미리보기 컨테이너 생성
                const previewContainer = document.createElement('div');
                previewContainer.className = 'preview-container';
                previewContainer.style.cssText = `
                    position: relative;
                    width: 100%;
                    height: 100%;
                    border-radius: 8px;
                    overflow: hidden;
                    background: #fff;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                `;
                
                // 이미지 생성
                const img = document.createElement('img');
                img.style.cssText = `
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    border-radius: 8px;
                `;
                
                // Blob URL 생성 및 이미지 로드
                const blobUrl = URL.createObjectURL(resizedImage);
                img.src = blobUrl;
                img.alt = `${type} 사진 미리보기`;
                
                img.onload = () => {
                    console.log(`${type} 이미지 로드 완료`);
                    URL.revokeObjectURL(blobUrl);
                };
                
                img.onerror = () => {
                    console.error(`${type} 이미지 로드 실패`);
                    URL.revokeObjectURL(blobUrl);
                };
                
                previewContainer.appendChild(img);
                
                // 제거 버튼 생성
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-photo';
                removeBtn.innerHTML = '<i class="fas fa-times"></i>';
                removeBtn.style.cssText = `
                    position: absolute;
                    top: 5px;
                    right: 5px;
                    background: rgba(255,0,0,0.8);
                    color: white;
                    border: none;
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    z-index: 10;
                `;
                
                removeBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log(`${type} 사진 제거 버튼 클릭`);
                    previewContainer.remove();
                    uploadedPhotos[type] = null;
                    input.value = '';
                    
                    // 원래 placeholder로 복원
                    previewDiv.innerHTML = `
                        <div class="photo-placeholder">
                            <i class="fas fa-camera"></i>
                            <span>사진 추가</span>
                        </div>
                    `;
                    console.log(`${type} 사진 제거됨`);
                };
                
                previewContainer.appendChild(removeBtn);
                previewDiv.appendChild(previewContainer);
                uploadedPhotos[type] = resizedImage;
                
                console.log(`${type} 사진 업로드 완료, 미리보기 표시됨`);
                showNotification(`${type} 사진이 업로드되었습니다.`, 'success');
                
            } catch (err) {
                console.error(`${type} 사진 처리 중 오류:`, err);
                showNotification('사진 처리 중 문제가 발생했습니다.', 'error');
                
                // 오류 시 원래 placeholder로 복원
                previewDiv.innerHTML = `
                    <div class="photo-placeholder">
                        <i class="fas fa-camera"></i>
                        <span>사진 추가</span>
                    </div>
                `;
            }
        });
    });

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
    `;
    document.head.appendChild(style);

    // CSS 스타일 수정
    const modalStyle = document.createElement('style');
    modalStyle.textContent = `
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
    document.head.appendChild(modalStyle);
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

// 정비 이력 상세 보기 모달 열기
window.showMaintenanceDetail = function(maintenance) {
    const modal = document.getElementById('maintenanceDetailModal');
    const backdrop = document.getElementById('modalBackdrop');
    
    if (!modal || !backdrop) return;

    const typeInfo = getTypeIconAndColor(maintenance.type);

    // 모달 내용 업데이트
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2><i class="fas fa-tools"></i> 정비 이력 상세</h2>
                <button class="close-btn" onclick="closeMaintenanceDetailModal()" aria-label="닫기">
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
                    </div>
                    ${maintenance.mileage ? `
                        <div class="detail-mileage" style="color: ${typeInfo.color}; margin-top: 4px;">
                            <i class="fas fa-tachometer-alt"></i> 키로수: ${maintenance.mileage}km
                        </div>
                    ` : ''}
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
                                             alt="${photo.type} 사진">
                                    </div>
                                    <div class="photo-actions">
                                        ${getPhotoTimeLeftHtml(photo)}
                                        <button class="download-btn" 
                                                onclick="event.stopPropagation(); downloadImage('${photo.url}', '${photo.type}_${new Date().toISOString().split('T')[0]}')">
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
    const detailStyle = document.createElement('style');
    detailStyle.textContent = `
        .detail-info {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
        }

        .detail-title-row {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 8px;
        }

        .detail-type {
            font-size: 1.2em;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .detail-date {
            color: #666;
            margin-left: auto;
        }

        .detail-status {
            padding: 6px 10px;
            border-radius: 4px;
            font-size: 0.9em;
            font-weight: 500;
            margin-bottom: 12px;
            display: inline-block;
        }

        .detail-info-row {
            display: flex;
            align-items: center;
            gap: 20px;
            margin-bottom: 12px;
            flex-wrap: nowrap;
        }

        .spacer {
            width: 20px;
        }

        .detail-motorcycle-number,
        .detail-mileage {
            display: flex;
            align-items: center;
            gap: 8px;
            white-space: nowrap;
        }

        .detail-motorcycle-number {
            color: #666;
        }

        .detail-description {
            margin-top: 12px;
            padding: 12px;
            background: white;
            border-radius: 6px;
            white-space: pre-wrap;
            line-height: 1.5;
        }

        .detail-admin {
            margin-top: 12px;
            color: #666;
            display: flex;
            align-items: center;
            gap: 8px;
        }
    `;
    document.head.appendChild(detailStyle);

    // 모달 표시
    modal.classList.add('show');
    backdrop.classList.add('show');
    history.pushState({ page: 'detail', modalId: 'maintenanceDetail' }, '');
}

// 정비 타입 아이콘 가져오기 함수 수정
function getTypeIcon(type) {
    const typeInfo = getTypeIconAndColor(type);
    return `<i class="fas ${typeInfo.icon}"></i>`;
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
            userName.textContent = `오토바이 번호: ${currentUser.carNumber}`;
        }
        showNotification('오토바이 번호가 수정되었습니다.', 'success');
        
    } catch (error) {
        console.error('Error updating car number:', error);
        showNotification('오토바이 번호 수정 실패: ' + error.message, 'error');
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
        showNotification('오토바이 번호를 입력해주세요.', 'error');
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
            `오토바이 번호: ${currentUser.carNumber}`;
    }
    
    const updateCarNumberBtn = document.getElementById('updateCarNumberBtn');
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

// 이미지 리사이징 함수 수정
async function resizeImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const url = URL.createObjectURL(file);
            const img = new Image();
            
            img.onload = function() {
                URL.revokeObjectURL(url);
                
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // 최대 크기 설정 (1920px)
                const maxSize = 1920;
                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = (height / width) * maxSize;
                        width = maxSize;
                    } else {
                        width = (width / height) * maxSize;
                        height = maxSize;
                    }
                }

                // 항상 세로가 더 길게 설정
                if (width > height) {
                    canvas.width = height;
                    canvas.height = width;
                } else {
                    canvas.width = width;
                    canvas.height = height;
                }
                
                const ctx = canvas.getContext('2d');
                
                // 이미지를 항상 정방향으로 그리기
                if (width > height) {
                    // 가로가 더 길면 90도 회전
                    ctx.translate(canvas.width/2, canvas.height/2);
                    ctx.rotate(-Math.PI/2);
                    ctx.drawImage(img, -height/2, -width/2, height, width);
                } else {
                    // 세로가 더 길면 그대로 그리기
                    ctx.drawImage(img, 0, 0, width, height);
                }
                
                canvas.toBlob(blob => {
                    resolve(new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    }));
                    canvas.width = 1;
                    canvas.height = 1;
                }, 'image/jpeg', 0.8);
            };
            
            img.onerror = reject;
            img.src = url;
        };
        reader.onerror = reject;
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

// Firebase Storage 대신 ImgBB로 사진 업로드
async function uploadMaintenancePhotos(maintenanceId) {
    const photos = [];
    
    for (const [type, file] of Object.entries(uploadedPhotos)) {
        if (file) {
            try {
                // 이미지를 Base64로 변환
                const base64Image = await convertToBase64(file);
                
                // ImgBB API 호출을 위한 FormData 생성
                const formData = new FormData();
                formData.append('key', IMGBB_API_KEY);
                formData.append('image', base64Image.split(',')[1]);
                formData.append('name', `maintenance_${maintenanceId}_${type}_${Date.now()}`);
                
                // ImgBB API 호출
                const response = await fetch('https://api.imgbb.com/1/upload', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    photos.push({
                        type,
                        url: result.data.url,               // 원본 이미지 URL
                        thumbnailUrl: result.data.thumb.url, // 썸네일 URL (자동 생성)
                        deleteUrl: result.data.delete_url,   // 삭제 URL (필요시 사용)
                        createdAt: new Date().toISOString() // serverTimestamp() 대신 ISO 문자열 사용
                    });
                } else {
                    throw new Error('이미지 업로드 실패');
                }
                
            } catch (err) {
                console.error(`${type} 사진 업로드 중 오류:`, err);
                showNotification(`${type} 사진 업로드 실패`, 'error');
            }
        }
    }
    
    return photos;
}

// 파일을 Base64로 변환하는 함수
function convertToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
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

// 사진 다운로드 함수 (바로 다운로드)
async function downloadImage(url, filename) {
    try {
        console.log('다운로드 시작:', url, filename);
        
        // 모든 기기에서 직접 다운로드 시도
        const response = await fetch(url);
        const blob = await response.blob();
        
        // Blob URL 생성
        const blobUrl = window.URL.createObjectURL(blob);
        
        // 다운로드 링크 생성
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        a.style.display = 'none';
        
        // DOM에 추가하고 클릭
        document.body.appendChild(a);
        a.click();
        
        // 정리
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
        }, 100);
        
        showNotification('다운로드가 시작되었습니다.', 'success');
        
    } catch (error) {
        console.error('다운로드 실패:', error);
        
        // 실패 시 직접 링크로 다운로드 시도
        try {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.target = '_blank';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showNotification('다운로드 링크가 생성되었습니다.', 'info');
        } catch (fallbackError) {
            console.error('폴백 다운로드도 실패:', fallbackError);
            showNotification('다운로드에 실패했습니다. 브라우저 설정을 확인해주세요.', 'error');
        }
    }
} 