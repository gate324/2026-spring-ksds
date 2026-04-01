# 2026-spring-ksds

Gemini 기반 인터뷰 장면 생성/진행/기록/내보내기 도구입니다.  
인터뷰 준비 정보(주제, 응답자 프로필, 사전 질문)를 입력하면 AI가 **내러티브 + 장면 이미지 + 360 파노라마**를 생성하고, 심층 질의응답을 통해 장면을 진화시키며, 최종적으로 스토리보드 검토와 ZIP 내보내기를 지원합니다.

---

## 1) 툴의 목적

본 프로젝트의 목적은 다음 4가지를 하나의 인터페이스에서 연결하는 것입니다.

1. **인터뷰 맥락 생성**: 준비 입력값을 기반으로 초기 장면을 자동 생성
2. **심층 탐색**: 질문-답변 루프를 통해 내러티브와 키워드를 점진 업데이트
3. **시각화**: 2D 카툰 장면 + 360 파노라마를 병행 제공
4. **산출물화**: 장면 히스토리, 로그, 이미지를 ZIP으로 패키징

---

## 2) 정보 구조도 (IA)

### 2-1. 화면 구조

```text
Home (인터뷰 목록)
└─ 새 인터뷰 준비 모달
	├─ 주제
	├─ 대상자 정보(이름/나이/성별/특이사항)
	└─ 사전 질문(동적 추가)

Main (질문자 화면)
├─ Header
│  ├─ 내보내기
│  ├─ 스토리보드
│  └─ 저장하기
├─ Left Sidebar
│  ├─ 프로필 카드
│  ├─ 입력 정보
│  ├─ 키워드(감정/분위기/요소)
│  └─ 보관함(장면 히스토리)
├─ Center Visual
│  ├─ 생성 이미지(카툰)
│  ├─ 내러티브 오버레이
│  ├─ 파노라마 진입 버튼
│  └─ 이미지 수정(리믹스) 패널
├─ Question Area
│  ├─ 사전 준비 질문
│  ├─ AI 심층 질문
│  └─ 답변 입력/제출
└─ Right Sidebar
	└─ 인터뷰 기록(질문/답변 버블)

Storyboard Modal
├─ 메인 뷰어(일러스트/파노라마 토글)
├─ 씬 상세(내러티브, QA, 키워드, 메모)
└─ 타임라인 썸네일

Respondent Window (별도 탭)
└─ 파노라마 + 현재 상황 + 현재 질문 오버레이
```

### 2-2. 데이터 구조

```text
allInterviews[]
└─ interview
	├─ id, date
	├─ meta { topic, name, age, gender, notes, prepQuestions }
	├─ sceneHistory[]
	│  └─ scene { id, time, imgSrc, panoramaImgSrc, narrativeText, prompt,
	│             keyEmotions[], atmosphere[], keyElements[], sceneNumber, variationNumber, memo }
	├─ interactionLog[]
	│  └─ { type: initial_response | question_answer | image_modify | scene_create, ... }
	└─ current snapshot fields
```

### 2-3. 처리 흐름(고수준)

```text
준비 입력
 -> 내러티브 생성(text model)
 -> 장면 이미지 생성(image model)
 -> 파노라마 생성(image model)
 -> sceneHistory / interactionLog 저장
 -> 응답자 화면 동기화(postMessage)
 -> 심층 질문 생성(text model)
 -> 답변 반영(내러티브/키워드 갱신)
 -> 필요 시 리믹스/파노라마 재생성
 -> 내보내기(zip)
```

---

## 3) 기능 목록

### A. 인터뷰 준비/시작
- 새 인터뷰 준비 모달(주제/대상자/특이사항/사전 질문)
- 인터뷰 시작 시 메인 화면 전환 + 응답자 탭 오픈
- 초기 상태 리셋 후 자동 생성 파이프라인 실행

### B. AI 생성
- 초기 내러티브 생성(JSON 스키마 기반: narrative, key_emotions, atmosphere, key_elements)
- 내러티브 기반 카툰 장면 생성(16:9)
- 내러티브 기반 360 파노라마 생성(2:1 equirectangular 지향 프롬프트)
- 내러티브 기반 심층 질문 3개 자동 생성

### C. 인터뷰 진행
- 질문 선택 후 답변 제출
- 답변을 반영해 내러티브/키워드 재생성
- 장면 히스토리 누적 및 보관함 복원
- 응답자 화면 질문/상황/파노라마 실시간 동기화

### D. 이미지 수정/탐색
- 현재 장면에 대한 리믹스 요청(text + image)
- 리믹스 후 파노라마 재생성 시도
- 파노라마 전체화면 뷰어(Pannellum)

### E. 스토리보드/저장/내보내기
- 스토리보드 모달(씬별 리뷰, 내러티브 편집, 메모 작성)
- 인터뷰 상태 저장 후 홈 목록 카드로 복귀
- ZIP 내보내기
  - `interview_log.txt`
  - `scene_{scene-variation}.png`
  - `scene_{scene-variation}_panorama.png`

---

## 4) 사용자 플로우

### 4-1. 질문자(메인) 플로우
1. Home에서 **새 인터뷰 생성** 클릭
2. 준비 정보 입력 후 **인터뷰 시작하기**
3. 자동으로 초기 장면/파노라마/심층 질문 생성
4. 질문 선택 → 답변 입력 → 내러티브/키워드 업데이트 반복
5. 필요 시 이미지 리믹스 및 파노라마 확인
6. 스토리보드에서 씬별 검토/메모
7. 저장(목록 복귀) 또는 ZIP 내보내기

### 4-2. 응답자(별도 탭) 플로우
1. 인터뷰 시작 시 `respondent.html` 자동 오픈
2. 질문자 화면의 최신 상황/질문/파노라마를 수신
3. 몰입형 파노라마 뷰 + 질문 오버레이로 응답 맥락 유지

---

## 5) 파일 구조와 역할

```text
.
├─ index.html         # 메인 UI 마크업 (홈/메인/스토리보드/모달)
├─ style.css          # 메인 스타일 (레이아웃/컴포넌트/스토리보드/반응형)
├─ geminiAPI.js       # 핵심 로직 (상태관리, AI 호출, 이벤트, 동기화, 내보내기)
├─ respondent.html    # 응답자 전용 파노라마 뷰 페이지
├─ respondent.css     # 응답자 페이지 오버레이/인터랙션 스타일
├─ respondent.js      # 응답자 페이지 뷰어 초기화 및 postMessage 수신
├─ package.json       # 의존성
└─ README.md
```

---

## 6) 개발 과정 정리 (코드 기반)

아래는 현재 코드 구조를 기준으로 재구성한 개발 단계입니다.

### 단계 1. 단일 생성 화면 구축
- 메인 입력/생성/이미지 표시 기본 골격 구성
- Gemini API 호출 및 이미지 렌더링 연결

### 단계 2. 인터뷰 준비 흐름 확장
- 홈 화면 + 준비 모달 + 대상자 프로필 반영
- 사전 질문 동적 추가 및 인터뷰 시작 자동화

### 단계 3. 내러티브 중심 구조로 전환
- 텍스트 모델로 내러티브/키워드 생성
- 키워드 패널(감정/분위기/요소) 및 입력정보 요약 도입

### 단계 4. 양면 화면(질문자/응답자) 동기화
- 응답자 탭 분리
- `postMessage` 기반 `syncAll`, `syncQuestion`, `toggleLoading` 구현

### 단계 5. 장면 진화 루프 추가
- 질문/답변 반영 내러티브 업데이트
- 심층 질문 재생성
- 히스토리 누적 및 복원 기능 고도화

### 단계 6. 파노라마/스토리보드/산출물 완성
- 360 파노라마 생성 및 뷰어 연동
- 스토리보드 모달(씬 단위 검토/메모)
- ZIP 내보내기(로그 + 이미지 자산)

---

## 7) 실행 방법

### 7-1. 준비
- Node.js 설치
- 패키지 설치

```bash
npm install
```

### 7-2. 실행
정적 페이지 기반이므로 로컬 서버로 `index.html`을 열어 사용합니다.  
예: VS Code Live Server 또는 임의의 정적 서버.

### 7-3. API 키
- 첫 진입 시 Gemini API 키 입력 프롬프트가 표시됩니다.
- 키는 `sessionStorage`에 저장되며 브라우저 세션 동안 유지됩니다.

---

## 8) 사용 기술

- Frontend: HTML, CSS, Vanilla JavaScript (ES Module)
- AI: Google Generative AI (`@google/generative-ai`)
- Panorama Viewer: Pannellum
- Export: JSZip
- UI Icon: Font Awesome

---

## 9) 참고 메모 (운영/유지보수)

- 새 인터뷰 시작 시 전역 상태와 인터뷰 기록 UI를 함께 초기화해야 이전 세션 흔적이 남지 않습니다.
- 히스토리/스토리보드/내보내기는 모두 `sceneHistory`, `interactionLog` 일관성에 의존하므로 구조 변경 시 이 2개 배열의 스키마 동기화가 핵심입니다.