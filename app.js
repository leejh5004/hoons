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

    // 오토바이 번호 수정 버튼 이벤트 추가
    const updateCarNumberBtn = document.getElementById('updateCarNumberBtn');
    if (updateCarNumberBtn) {
        updateCarNumberBtn.addEventListener('click', () => {
            showCarNumberUpdateModal();
        });
    }

    // ESC 키로 모달 닫기만 유지
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            // 모든 모달 닫기
            closeMaintenanceInputModal();
            closeCarNumberModal();
            closeMaintenanceDetailModal();
        }
    });

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
        
        if (modal) {
            console.log('정비 이력 입력 모달 열기 시작');
            
            // 폼 초기화
            const form = document.getElementById('newMaintenanceModalForm');
            if (form) {
                form.reset();
            }
            
            // 사진 미리보기 초기화
            uploadedPhotos = { before: null, during: null, after: null };
            
            // 사진 미리보기 영역 초기화
            const photoTypes = ['before', 'during', 'after'];
            photoTypes.forEach(type => {
                const previewDiv = document.getElementById(`${type}PhotoPreview`);
                const img = document.getElementById(`${type}PhotoImg`);
                if (previewDiv && img) {
                    img.src = '';
                    img.style.display = 'none';
                    const placeholder = previewDiv.querySelector('.photo-placeholder');
                    if (placeholder) {
                        placeholder.style.display = 'flex';
                    }
                    // 기존 제거 버튼 제거
                    const existingRemoveBtn = previewDiv.querySelector('button');
                    if (existingRemoveBtn) {
                        existingRemoveBtn.remove();
                    }
                }
            });
            
            console.log('모달 초기화 완료, 이벤트 리스너 설정 시작');
            
            // 이벤트 리스너 설정
            setupPhotoInputListeners();
            setupMaintenanceFormListener();
            
            console.log('이벤트 리스너 설정 완료, 모달 표시');
            
            // 모달과 백드롭 표시
            modal.classList.add('show');
            if (backdrop) {
                backdrop.style.display = 'block';
            }
            
            // 모달 백드롭 클릭 이벤트 (중복 방지)
            if (!modal.hasAttribute('data-backdrop-added')) {
                modal.setAttribute('data-backdrop-added', 'true');
                modal.addEventListener('click', function(e) {
                    if (e.target === modal) {
                        closeMaintenanceInputModal();
                    }
                });
            }
            
            console.log('정비 이력 입력 모달 열기 완료');
        }
    }

    // 정비 이력 입력 모달 닫기 함수
    window.closeMaintenanceInputModal = function() {
        const modal = document.getElementById('maintenanceInputModal');
        const backdrop = document.getElementById('modalBackdrop');
        
        if (modal) {
            modal.classList.remove('show');
        }
        
        if (backdrop) {
            backdrop.style.display = 'none';
        }
        
        // 폼 초기화 및 리스너 속성 제거
        const form = document.getElementById('newMaintenanceModalForm');
        if (form) {
            form.reset();
            form.removeAttribute('data-listener-added');
        }
        
        // 모달 백드롭 이벤트 속성 제거
        const inputModal = document.getElementById('maintenanceInputModal');
        if (inputModal) {
            inputModal.removeAttribute('data-backdrop-added');
        }
        
        // 사진 입력 리스너 속성 제거
        const photoInputs = ['beforePhoto', 'duringPhoto', 'afterPhoto'];
        photoInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.removeAttribute('data-listener-added');
            }
        });
        
        // 사진 미리보기 초기화
        uploadedPhotos = { before: null, during: null, after: null };
        
        // 사진 미리보기 영역 초기화
        const photoTypes = ['before', 'during', 'after'];
        photoTypes.forEach(type => {
            const previewDiv = document.getElementById(`${type}PhotoPreview`);
            const img = document.getElementById(`${type}PhotoImg`);
            if (previewDiv && img) {
                img.src = '';
                img.style.display = 'none';
                const placeholder = previewDiv.querySelector('.photo-placeholder');
                if (placeholder) {
                    placeholder.style.display = 'flex';
                }
                // 기존 제거 버튼 제거
                const existingRemoveBtn = previewDiv.querySelector('button');
                if (existingRemoveBtn) {
                    existingRemoveBtn.remove();
                }
            }
        });
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

    // 사진 입력 이벤트 리스너 설정 함수 (중복 방지)
    function setupPhotoInputListeners() {
        const photoInputs = [
            { id: 'beforePhoto', type: 'before', previewId: 'beforePhotoPreview', imgId: 'beforePhotoImg' },
            { id: 'duringPhoto', type: 'during', previewId: 'duringPhotoPreview', imgId: 'duringPhotoImg' },
            { id: 'afterPhoto', type: 'after', previewId: 'afterPhotoPreview', imgId: 'afterPhotoImg' }
        ];
        photoInputs.forEach(({ id, type, previewId, imgId }) => {
            const input = document.getElementById(id);
            const previewDiv = document.getElementById(previewId);
            const img = document.getElementById(imgId);
            if (input && previewDiv && img && !input.hasAttribute('data-listener-added')) {
                input.setAttribute('data-listener-added', 'true');
                
                input.addEventListener('change', function(e) {
                    const file = e.target.files[0];
                    if (!file) return;
                    // 미리보기: FileReader로 즉시 띄움
                    const reader = new FileReader();
                    reader.onload = function(ev) {
                        img.src = ev.target.result;
                        img.style.display = 'block';
                        // placeholder, 버튼 모두 완전히 제거
                        const placeholder = previewDiv.querySelector('.photo-placeholder');
                        if (placeholder) placeholder.remove();
                        const btn = previewDiv.parentElement.querySelector('label[for="' + id + '"]');
                        if (btn) btn.style.display = 'none';
                        // 기존 제거 버튼 제거
                        const oldBtn = previewDiv.querySelector('button');
                        if (oldBtn) oldBtn.remove();
                        // 제거 버튼 추가
                        const removeBtn = document.createElement('button');
                        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
                        removeBtn.style.cssText = `position:absolute;top:5px;right:5px;background:rgba(255,0,0,0.8);color:white;border:none;border-radius:50%;width:30px;height:30px;cursor:pointer;z-index:10;`;
                        removeBtn.onclick = (ev2) => {
                            ev2.preventDefault();
                            ev2.stopPropagation();
                            img.src = '';
                            img.style.display = 'none';
                            input.value = '';
                            uploadedPhotos[type] = null;
                            // placeholder, 버튼 다시 보이게
                            if (btn) btn.style.display = '';
                            // placeholder 복원
                            if (!previewDiv.querySelector('.photo-placeholder')) {
                                const ph = document.createElement('div');
                                ph.className = 'photo-placeholder';
                                ph.innerHTML = '<i class="fas fa-camera"></i><span>사진 추가</span>';
                                previewDiv.appendChild(ph);
                            }
                            removeBtn.remove();
                        };
                        previewDiv.appendChild(removeBtn);
                    };
                    reader.readAsDataURL(file);
                    // 업로드용 파일 저장
                    uploadedPhotos[type] = file;
                });
            }
        });
    }

    // 정비 폼 이벤트 리스너 설정 함수 (중복 방지)
    function setupMaintenanceFormListener() {
        const form = document.getElementById('newMaintenanceModalForm');
        if (form && !form.hasAttribute('data-listener-added')) {
            form.setAttribute('data-listener-added', 'true');
            
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
        if (!modal) return;

        const typeInfo = getTypeIconAndColor(maintenance.type);
        
        // 모달 내용 업데이트
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            const modalBody = modalContent.querySelector('.modal-body');
            if (modalBody) {
                modalBody.innerHTML = `
                    <div class="maintenance-detail-content">
                        <div class="detail-header mb-3">
                            <div class="detail-type h5 mb-2" style="color: ${typeInfo.color}">
                                <i class="fas ${typeInfo.icon}"></i> ${maintenance.type || ''}
                            </div>
                            <div class="detail-date text-muted mb-1">${maintenance.date || ''}</div>
                            <div class="detail-status mb-3">
                                <span class="status-badge ${maintenance.status}">${getStatusText(maintenance.status)}</span>
                            </div>
                        </div>
                        <div class="detail-info">
                            <div class="detail-motorcycle-number mb-2">
                                <i class="fas fa-motorcycle"></i> <strong>오토바이 번호:</strong> ${maintenance.carNumber}
                            </div>
                            ${maintenance.mileage ? `
                                <div class="detail-mileage mb-2">
                                    <i class="fas fa-tachometer-alt"></i> <strong>키로수:</strong> ${maintenance.mileage}km
                                </div>
                            ` : ''}
                            <div class="detail-description mb-3">
                                <strong>상세 설명:</strong><br>
                                ${maintenance.description || '설명이 없습니다.'}
                            </div>
                        </div>
                        <div class="detail-footer">
                            ${maintenance.adminName ? `
                                <div class="detail-admin text-muted">
                                    <i class="fas fa-user-shield"></i> 관리자: ${maintenance.adminName}
                                </div>
                            ` : ''}
                        </div>
                        <div class="detail-photos mt-4">
                            ${maintenance.photos && maintenance.photos.length > 0 ? `
                                <h6><i class="fas fa-camera"></i> 정비 사진</h6>
                                <div class="row g-2">
                                    ${maintenance.photos.map(photo => `
                                        <div class="col-md-4">
                                            <div class="card">
                                                <img src="${photo.thumbnailUrl || photo.url}" 
                                                     class="card-img-top" 
                                                     alt="${photo.type} 사진"
                                                     style="height: 150px; object-fit: cover; cursor: pointer;"
                                                     onclick="window.open('${photo.url}', '_blank')">
                                                <div class="card-body p-2">
                                                    <small class="text-muted">
                                                        ${photo.type === 'before' ? '정비 전' : 
                                                          photo.type === 'during' ? '정비 중' : '정비 후'}
                                                    </small>
                                                </div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }
        }
        
        // 모달 표시
        modal.classList.add('show');
        
        const backdrop = document.getElementById('modalBackdrop');
        if (backdrop) {
            backdrop.style.display = 'block';
        }
        
        // 모달 백드롭 클릭 이벤트 (중복 방지)
        if (!modal.hasAttribute('data-backdrop-added')) {
            modal.setAttribute('data-backdrop-added', 'true');
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    closeMaintenanceDetailModal();
                }
            });
        }
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
        
        if (modal) {
            modal.classList.remove('show');
            modal.removeAttribute('data-backdrop-added');
        }
        
        if (backdrop) {
            backdrop.style.display = 'none';
        }
    }

    // 사진 아이템 생성 함수
    function createPhotoItem(label, photoData) {
        if (!photoData || !photoData.url) return '';

        // Base64 데이터인지 확인
        const isBase64 = photoData.url.startsWith('data:image/');
        
        // 파일명 생성
        const filename = photoData.filename || `${label}_${new Date().toISOString().split('T')[0]}.jpg`;

        return `
            <div class="photo-item">
                <div class="photo-label">${label}</div>
                <img src="${photoData.url}" alt="${label}" class="detail-photo" 
                    onclick="downloadImage('${photoData.url}', '${filename}')">
                <div class="photo-actions">
                    <a href="#" class="download-btn" 
                        onclick="downloadImage('${photoData.url}', '${filename}'); return false;">
                        <i class="fas fa-download"></i>
                        다운로드
                    </a>
                </div>
            </div>
        `;
    }

    // 전역 모달 함수들
    window.showCarNumberUpdateModal = function() {
        const modal = document.getElementById('carNumberModal');
        const backdrop = document.getElementById('modalBackdrop');
        const newCarNumberInput = document.getElementById('newCarNumber');
        
        if (modal && newCarNumberInput && currentUser) {
            newCarNumberInput.value = currentUser.carNumber || '';
            modal.classList.add('show');
            
            if (backdrop) {
                backdrop.style.display = 'block';
            }
            
            // 모달 백드롭 클릭 이벤트 (중복 방지)
            if (!modal.hasAttribute('data-backdrop-added')) {
                modal.setAttribute('data-backdrop-added', 'true');
                modal.addEventListener('click', function(e) {
                    if (e.target === modal) {
                        closeCarNumberModal();
                    }
                });
            }
            
            // 포커스 설정 (에러 방지)
            setTimeout(() => {
                try {
                    newCarNumberInput.focus();
                } catch (e) {
                    console.log('Focus error ignored:', e);
                }
            }, 100);
        }
    }

    window.closeCarNumberModal = function() {
        const modal = document.getElementById('carNumberModal');
        const backdrop = document.getElementById('modalBackdrop');
        
        if (modal) {
            modal.classList.remove('show');
            modal.removeAttribute('data-backdrop-added');
        }
        
        if (backdrop) {
            backdrop.style.display = 'none';
        }
    }

    window.submitCarNumberUpdate = function() {
        const newCarNumberInput = document.getElementById('newCarNumber');
        if (!newCarNumberInput || !newCarNumberInput.value.trim()) {
            showNotification('오토바이 번호를 입력해주세요.', 'error');
            return;
        }
        
        updateCarNumber(newCarNumberInput.value);
        closeCarNumberModal();
    }

    // UI 업데이트 함수
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

    // 사진 다운로드 함수
    async function downloadImage(url, filename) {
        try {
            console.log('다운로드 시작:', filename);
            
            let blob;
            
            // Base64 데이터인지 확인
            if (url.startsWith('data:image/')) {
                // Base64 데이터를 Blob으로 변환
                const response = await fetch(url);
                blob = await response.blob();
            } else {
                // 일반 URL에서 다운로드
                const response = await fetch(url);
                blob = await response.blob();
            }
            
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
            
            // 실패 시 새 창에서 열기
            try {
                window.open(url, '_blank');
                showNotification('새 창에서 이미지가 열렸습니다.', 'info');
            } catch (fallbackError) {
                console.error('폴백 다운로드도 실패:', fallbackError);
                showNotification('다운로드에 실패했습니다.', 'error');
            }
        }
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