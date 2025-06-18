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
        newMaintenanceModalForm.addEventListener('submit', async (e) => {
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

                // 먼저 정비이력 문서 생성
                const docRef = await db.collection('maintenance').add(maintenanceData);
                
                // 사진 업로드
                const photos = await uploadMaintenancePhotos(docRef.id);
                
                // 사진 정보 업데이트
                if (photos.length > 0) {
                    await docRef.update({ photos });
                }

                closeMaintenanceInputModal();
                newMaintenanceModalForm.reset();
                
                // 사진 미리보기 초기화
                document.querySelectorAll('.photo-preview').forEach(preview => {
                    const img = preview.querySelector('img');
                    const removeBtn = preview.querySelector('.remove-photo');
                    if (img) img.remove();
                    if (removeBtn) removeBtn.remove();
                });
                uploadedPhotos = { before: null, during: null, after: null };
                
                loadMaintenanceHistory();
                showNotification('정비 이력이 저장되었습니다.', 'success');
                
            } catch (err) {
                console.error('정비 이력 저장 중 오류:', err);
                showNotification('정비 이력 저장 실패: ' + err.message, 'error');
            }
        });
    }

    // 정비 이력 상세 보기 모달 열기
    window.showMaintenanceDetail = function(maintenance) {
        const modal = document.getElementById('maintenanceDetailModal');
        const backdrop = document.getElementById('modalBackdrop');
        
        if (!modal || !backdrop) return;

        // 모달 내용 업데이트
        const detailType = modal.querySelector('.detail-type');
        const detailDate = modal.querySelector('.detail-date');
        const detailStatus = modal.querySelector('.detail-status');
        const detailCarNumber = modal.querySelector('.detail-motorcycle-number');
        const detailMileage = modal.querySelector('.detail-mileage');
        const detailDescription = modal.querySelector('.detail-description');
        const detailAdmin = modal.querySelector('.detail-admin');
        const detailPhotos = modal.querySelector('.detail-photos');

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
            detailCarNumber.innerHTML = `<i class="fas fa-motorcycle"></i> 오토바이 번호: ${maintenance.carNumber}`;
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

        // 사진 표시
        if (detailPhotos && maintenance.photos && maintenance.photos.length > 0) {
            detailPhotos.innerHTML = `
                <div class="photos-title">정비 사진</div>
                <div class="photos-grid">
                    ${maintenance.photos.map(photo => {
                        // 생성 시간을 Date 객체로 변환
                        const createdAt = new Date(photo.createdAt);
                        const now = new Date();
                        
                        // 30일 후 날짜 계산
                        const expiryDate = new Date(createdAt);
                        expiryDate.setDate(expiryDate.getDate() + 30);
                        
                        // 남은 일수 계산
                        const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
                        
                        // 남은 시간 문자열 생성
                        const timeLeftText = daysLeft > 0 ? 
                            `삭제까지 ${daysLeft}일 남음` : 
                            '곧 삭제됨';
                        
                        return `
                            <div class="photo-item">
                                <div class="photo-label">${photo.type === 'before' ? '정비 전' : 
                                                         photo.type === 'during' ? '정비 중' : '정비 후'}</div>
                                <img src="${photo.thumbnailUrl}" 
                                     onclick="window.open('${photo.url}', '_blank')" 
                                     alt="${photo.type} 사진"
                                     class="detail-photo">
                                <div class="photo-actions">
                                    <div class="countdown ${daysLeft <= 7 ? 'urgent' : ''}">${timeLeftText}</div>
                                    <button class="download-btn" 
                                           onclick="event.stopPropagation(); downloadImage('${photo.url}', 'maintenance_${maintenance.id}_${photo.type}.jpg')">
                                        <i class="fas fa-download"></i> 다운로드
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else if (detailPhotos) {
            detailPhotos.innerHTML = '';
        }

        // 모달 표시
        modal.classList.add('show');
        backdrop.classList.add('show');

        // history state 추가
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
                previewDiv.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> 처리중...</div>';

                // 이미지 리사이징
                const resizedImage = await resizeImage(file);
                
                // 기존 미리보기 제거
                previewDiv.innerHTML = '';
                
                // 새 미리보기 컨테이너 생성
                const previewContainer = document.createElement('div');
                previewContainer.className = 'preview-container';
                
                // 이미지 미리보기 생성
                const img = document.createElement('img');
                img.src = URL.createObjectURL(resizedImage);
                img.onload = () => URL.revokeObjectURL(img.src); // 메모리 해제
                previewContainer.appendChild(img);
                
                // 삭제 버튼 추가
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-photo';
                removeBtn.innerHTML = '<i class="fas fa-times"></i>';
                removeBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    previewContainer.remove();
                    uploadedPhotos[type] = null;
                    input.value = '';
                    // 미리보기 영역 초기화 (카메라 아이콘 표시)
                    previewDiv.innerHTML = '';
                };
                previewContainer.appendChild(removeBtn);
                
                // 미리보기 추가
                previewDiv.appendChild(previewContainer);
                
                // 업로드된 파일 저장
                uploadedPhotos[type] = resizedImage;
                
            } catch (err) {
                console.error('사진 처리 중 오류:', err);
                showNotification('사진 처리 중 문제가 발생했습니다.', 'error');
                previewDiv.innerHTML = ''; // 에러 시 미리보기 초기화
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
    if (addBtnBox) addBtnBox.style.display = 'block';
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
                
                // EXIF 방향 정보에 따라 캔버스 크기 조정
                const orientation = getImageOrientation(e.target.result);
                if (orientation > 4 && orientation < 9) {
                    [width, height] = [height, width];
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                
                // EXIF 방향에 따른 변환 적용
                ctx.save();
                switch (orientation) {
                    case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
                    case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
                    case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
                    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
                    case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
                    case 7: ctx.transform(0, -1, -1, 0, height, width); break;
                    case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
                }
                
                ctx.drawImage(img, 0, 0, width, height);
                ctx.restore();
                
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
        reader.readAsArrayBuffer(file);
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