# Twohoons Log - 오토바이 정비 관리 시스템

Vite + React와 Firebase를 사용하여 제작된 오토바이 정비 관리 시스템입니다. 고객과 정비사는 작업을 등록하고 상태를 추적하며, 관련된 모든 정보를 관리할 수 있습니다.

## 🚀 기술 스택

- **Frontend**: React 18 + Vite
- **Styling**: TailwindCSS
- **Database**: Firebase Firestore
- **Image Upload**: imgbb API
- **Icons**: Lucide React
- **Routing**: React Router DOM
- **PDF Generation**: jsPDF + jspdf-autotable
- **File Download**: JSZip

## 📁 프로젝트 구조

```
twohoons-log/
├── src/
│   ├── firebase/
│   │   └── firebaseConfig.js      # Firebase 설정
│   ├── pages/
│   │   ├── Dashboard.jsx          # 메인 대시보드
│   │   ├── Customers.jsx          # 고객 관리
│   │   ├── Jobs.jsx               # 작업 관리
│   │   ├── PublicRepairView.jsx   # 고객용 정비 확인 페이지
│   │   └── ClaimView.jsx          # 보험사 제출용 보고서
│   ├── utils/
│   │   ├── uploadImage.js         # 이미지 업로드 유틸리티
│   │   ├── generatePdf.js         # PDF 생성 유틸리티
│   │   └── downloadZip.js         # ZIP 다운로드 유틸리티
│   ├── App.jsx                    # 메인 앱 컴포넌트
│   ├── main.jsx                   # 앱 진입점
│   └── index.css                  # 전역 스타일
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## 🎨 디자인 특징

- **다크 테마**: `#0D1A2B` 배경색
- **Glassmorphism**: 반투명 카드 디자인
- **파란색 포인트**: `#3FB8FF` 브랜드 컬러
- **반응형**: 모바일/태블릿/데스크톱 지원
- **현대적 UI**: Inter + Pretendard 폰트

## 🛠️ 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. Firebase 설정

프로젝트 루트에 `.env` 파일을 생성하고 Firebase 프로젝트 설정을 추가하세요:

```bash
# .env 파일 생성
touch .env
```

`.env` 파일에 다음 내용을 추가하세요:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

**Firebase 프로젝트 설정 가져오는 방법:**
1. [Firebase Console](https://console.firebase.google.com/)에 접속
2. 프로젝트 선택 또는 새 프로젝트 생성
3. 프로젝트 설정 (⚙️) → 일반 탭
4. "내 앱" 섹션에서 웹 앱 추가 또는 기존 앱 선택
5. Firebase SDK 설정에서 `firebaseConfig` 객체의 값들을 복사하여 `.env` 파일에 붙여넣기

### 3. imgbb API 키 설정
`src/utils/uploadImage.js` 파일에서 imgbb API 키를 설정하세요:

```javascript
const response = await fetch(`https://api.imgbb.com/1/upload?key=YOUR_IMGBB_API_KEY`, {
```

### 4. 개발 서버 실행
```bash
npm run dev
```

### 5. 빌드
```bash
npm run build
```

## 📋 주요 기능

### 대시보드 (Dashboard)
- **요약 카드**: 총 작업 수, 진행 중인 작업, 승인 대기 작업
- **작업 목록**: 각 작업의 상세 정보 표시
- **타임라인**: 작업 진행 상태 시각화
- **승인/거부**: 승인 대기 상태 작업 관리

### 고객 관리 (Customers)
- **고객 목록**: 고객 정보 및 차량 정보 표시
- **검색 기능**: 고객명, 전화번호, 이메일로 검색
- **고객 추가**: 새 고객 등록 기능

### 작업 관리 (Jobs)
- **작업 목록**: 모든 작업의 상태별 분류
- **필터링**: 상태별 작업 필터링
- **검색 기능**: 작업번호, 고객명, 차량번호로 검색
- **보험용 보고서**: 각 작업의 보험사 제출용 자료 생성

### 고객용 정비 확인 (PublicRepairView)
- **URL**: `/public/:vin` (차량번호로 접근)
- **정비 상태 확인**: 로그인 없이 정비 진행 상황 확인
- **승인/거절**: 정비 완료 후 고객 승인 기능
- **모바일 친화적**: 반응형 디자인

### 보험사 제출용 보고서 (ClaimView)
- **URL**: `/claim/:id` (작업 ID로 접근)
- **보고서 형태**: 공공기관용 문서 스타일
- **PDF 다운로드**: 정비 내용을 PDF로 생성
- **이미지 ZIP 다운로드**: 작업 사진들을 ZIP 파일로 다운로드
- **인증 불필요**: 비공개 링크 방식으로 접근

## 🔥 Firebase Firestore 구조

### jobs 컬렉션
```javascript
{
  id: "job-id",
  jobNumber: "JOB-2024-001",
  customerName: "고객명",
  customerPhone: "010-1234-5678",
  customerEmail: "customer@example.com",
  vehicleInfo: {
    brand: "Honda",
    model: "CBR600RR",
    year: "2020",
    plateNumber: "12가3456"
  },
  serviceDetails: "정비 내용",
  status: "In Progress", // "In Progress", "Pending Approval", "Completed"
  receivedDate: "2024-01-15",
  estimatedCompletion: "2024-01-20",
  timeline: [
    { step: "Received", date: "2024-01-15", completed: true },
    { step: "In Progress", date: "2024-01-16", completed: true },
    { step: "Pending Approval", date: null, completed: false },
    { step: "Completed", date: null, completed: false }
  ],
  totalCost: 150000
}
```

### customers 컬렉션
```javascript
{
  id: "customer-id",
  name: "고객명",
  phone: "010-1234-5678",
  email: "customer@example.com",
  address: "주소",
  joinDate: "2023-01-15",
  totalJobs: 5,
  totalSpent: 750000,
  vehicles: [
    {
      brand: "Honda",
      model: "CBR600RR",
      year: "2020",
      plateNumber: "12가3456"
    }
  ]
}
```

## 🎯 작업 상태

1. **Received**: 작업 접수
2. **In Progress**: 작업 진행 중
3. **Pending Approval**: 고객 승인 대기
4. **Completed**: 작업 완료

## 📱 반응형 디자인

- **모바일**: 320px 이상
- **태블릿**: 768px 이상
- **데스크톱**: 1024px 이상

## 🔧 커스터마이징

### 색상 변경
`tailwind.config.js`에서 브랜드 컬러를 변경할 수 있습니다:

```javascript
colors: {
  'dark': '#0D1A2B',
  'primary': '#3FB8FF', // 이 부분을 변경
}
```

### 폰트 변경
`src/index.css`에서 폰트를 변경할 수 있습니다:

```css
body {
  font-family: 'Inter', 'Pretendard', ...;
}
```

## 🚀 배포

### GitHub Pages 배포

1.  `package.json`의 `homepage` 주소를 자신의 배포 주소로 수정합니다.
2.  `vite.config.js`의 `base` 경로를 자신의 저장소 이름으로 수정합니다.
3.  아래 명령어를 실행하여 빌드 및 배포를 진행합니다.

    ```bash
    npm run deploy
    ```

    이 명령어는 `predeploy` 스크립트에 의해 자동으로 `npm run build`를 실행한 후, `gh-pages`를 사용하여 `dist` 폴더의 내용을 배포합니다.

## 📄 라이선스

MIT License

## 🤝 기여

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 지원

문제가 있거나 질문이 있으시면 이슈를 생성해 주세요. 