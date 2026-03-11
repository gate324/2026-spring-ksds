import { GoogleGenerativeAI, SchemaType } from "https://esm.run/@google/generative-ai";

let apiKey = sessionStorage.getItem('gemini_api_key');

if (!apiKey) {
    apiKey = prompt('Gemini API 키를 입력해주세요');
    if (apiKey && apiKey.trim()) {
        sessionStorage.setItem('gemini_api_key', apiKey.trim());
    } else {
        alert('API 키를 입력해주세요.');
    }
}

const genAI = new GoogleGenerativeAI(apiKey || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });
const textModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

let respondentWindow = null; // 응답자 화면 윈도우 객체

// 응답자 화면 탭에 파노라마 데이터 전송 (연동)
function syncToRespondent(panoramaSrc) {
    if (respondentWindow && !respondentWindow.closed) {
        try {
            const tags = [...currentKeyEmotions, ...currentAtmosphere, ...currentKeyElements].map(t => `#${t}`);
            const questionToDisplay = currentSelectedQuestion || "응답을 기다리고 있습니다...";
            
            respondentWindow.postMessage({
                type: 'syncAll',
                narrative: currentNarrative,
                question: questionToDisplay,
                parameters: tags,
                panoramaSrc: panoramaSrc
            }, '*');
        } catch (e) {
            console.error("응답자 탭 동기화 실패:", e);
        }
    }
}

// ============================================
// DOM 요소 참조
// ============================================

// 기본 입출력
const geminiInput = document.getElementById("geminiInput"); // 프롬프트 입력 (숨김)
const geminiBtn = document.getElementById("geminiBtn"); // 실제 API 호출 버튼 (숨김)
const geminiImg = document.getElementById("geminiImg"); // 생성된 이미지 표시
const saveImgBtn = document.getElementById("SaveImg"); // 이미지 저장

// UI 컨트롤
const imageCard = document.getElementById("imageCard"); // 이미지 카드 컨테이너
const narrativeTextEl = document.getElementById("narrativeText"); // 내러티브 텍스트 표시
const expandBtn = document.getElementById("expandBtn"); // 확대 버튼
const panoramaFullscreen = document.getElementById("panoramaFullscreen"); // 파노라마 전체 화면
const closeFullscreenBtn = document.getElementById("closeFullscreenBtn"); // 축소 버튼
const panoramaLoading = document.getElementById("panoramaLoading"); // 파노라마 로딩
const mainContainer = document.querySelector('main.container');
const remixToggleBtn = document.getElementById("remixToggleBtn");
const closeRightSidebarBtn = document.getElementById("closeRightSidebarBtn");
const remixSubmitBtn = document.getElementById("remixSubmitBtn");
const remixInput = document.getElementById("remixInput");

const questionReplyArea = document.getElementById("questionReplyArea");
const replyInput = document.getElementById("replyInput");
const replySubmitBtn = document.getElementById("replySubmitBtn");
const panoramaNarrativeText = document.getElementById("panoramaNarrativeText");

let currentSelectedQuestion = "";

// 히스토리
const historyToggleBtn = document.getElementById("historyToggleBtn"); // 히스토리 패널 토글
const historyListEl = document.getElementById("historyList"); // 히스토리 목록 컨테이너
const historyEmptyEl = document.getElementById("historyEmpty"); // 히스토리 없음 메시지

// 전역 상태
let sceneCommitted = false; // 장면이 커밋되었는지 여부
let sceneHistory = []; // 장면 히스토리: [{id, time, imgSrc, panoramaImgSrc, narrativeHtml, narrativeText, prompt, keyEmotions, keyElements, sceneNumber, variationNumber}]
let isRestoring = false; // 히스토리에서 복원 중인지 여부
let currentNarrative = ""; // 현재 생성된 내러티브
let currentPrompt = ""; // 현재 생성에 사용된 프롬프트
let currentKeyEmotions = []; // 현재 주요 감정
let currentAtmosphere = []; // 현재 분위기 키워드
let currentKeyElements = []; // 현재 핵심 요소
let panoramaViewer = null; // Pannellum 뷰어 인스턴스
let currentPanoramaImgSrc = null; // 현재 파노라마 이미지 소스
let currentSceneNumber = 1; // 현재 장면 번호
let currentVariationNumber = 1; // 현재 장면의 변형 번호
let currentEditMode = 'remix'; // 'remix' 또는 'create'
let interactionLog = []; // 인터뷰 인터랙션 로그

// ============================================
// 프롬프트 스타일 정의
// ============================================

const PROMPT_STYLE = {
    // 고정 요소: 사용자 프로필 정보를 동적으로 가져와서 프롬프트에 포함
    getFixedElements: () => {
        const profileCard = document.querySelector('.user-profile-card');
        const name = profileCard?.dataset.name || '인물';
        const gender = profileCard?.dataset.gender || '남성';
        const age = profileCard?.dataset.age || '20대';
        
        return `
스타일: 따뜻하고 부드러운 조명의 미니어쳐 3D 카툰 렌더링 스타일입니다. 클레이 애니메이션처럼 부드러운 질감과 둥글둥글한 형태를 가집니다. 전체적으로 귀엽고 친근하며, 현실적이면서도 과장되지 않은 자연스러운 분위기를 연출합니다.
캐릭터: ${name}, ${age} ${gender} 캐릭터입니다. 일상적인 한국인의 외모를 가진 캐릭터로 표현해주세요.
        `;
    }
};

// ============================================
// 핵심 API 호출 함수
// ============================================

// Gemini API 호출 버튼 클릭 이벤트 (Text-to-Image)
geminiBtn?.addEventListener("click", async () => {
    if (geminiInput.value.trim() === "") {
        alert("프롬프트를 입력해주세요!");
        return;
    }
    
    const parts = [{ text: geminiInput.value }];

    // 버튼 로딩 상태 설정
    geminiBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; 
    geminiBtn.disabled = true;

    const result = await model.generateContent({
        contents: [{ role: "user", parts: parts }],
        generationConfig: {
            imageConfig: { aspectRatio: "16:9" },
            responseModalities: ["image"],
        },
    });

    // 생성된 이미지 표시
    const response = await result.response;
    
    // 오류 방지: 응답 구조 확인
    if (!response.candidates || !response.candidates[0]?.content?.parts) {
        console.error('API 응답 오류:', response);
        alert('이미지 생성에 실패했습니다. 다시 시도해주세요.');
        geminiBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        geminiBtn.disabled = false;
        return;
    }
    
    const imgData = response.candidates[0].content.parts[0].inlineData;
    geminiImg.src = `data:${imgData.mimeType};base64,${imgData.data}`;

    // 버튼 원래 상태로 복구
    geminiBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    geminiBtn.disabled = false;
});

// ============================================
// 보조 함수들
// ============================================

// 키워드 패널 표시
function displayKeywords() {
    const emotionTagsContainer = document.getElementById('emotionTags');
    const atmosphereTagsContainer = document.getElementById('atmosphereTags');
    const elementTagsContainer = document.getElementById('elementTags');
    
    if (!emotionTagsContainer || !atmosphereTagsContainer || !elementTagsContainer) return;
    
    // 감정 키워드 표시
    emotionTagsContainer.innerHTML = '';
    currentKeyEmotions.forEach(emotion => {
        const tag = document.createElement('span');
        tag.className = 'keyword-tag emotion-tag';
        tag.textContent = emotion;
        emotionTagsContainer.appendChild(tag);
    });
    
    // 분위기 키워드 표시
    atmosphereTagsContainer.innerHTML = '';
    currentAtmosphere.forEach(atmo => {
        const tag = document.createElement('span');
        tag.className = 'keyword-tag atmosphere-tag';
        tag.textContent = atmo;
        atmosphereTagsContainer.appendChild(tag);
    });
    
    // 요소 키워드 표시
    elementTagsContainer.innerHTML = '';
    currentKeyElements.forEach(element => {
        const tag = document.createElement('span');
        tag.className = 'keyword-tag element-tag';
        tag.textContent = element;
        elementTagsContainer.appendChild(tag);
    });
    
    // 키워드 패널 표시 (collapsed 상태 해제)
    const keywordsPanel = document.getElementById('keywordsPanel');
    if (keywordsPanel && keywordsPanel.classList.contains('collapsed')) {
        keywordsPanel.classList.remove('collapsed');
    }
}

// 이미지 저장 버튼 (사용자가 이미지를 다운로드)
saveImgBtn?.addEventListener("click", async () => {
    if (!geminiImg?.src || geminiImg.src.includes("Img.png")) {
        alert("저장할 이미지가 없습니다.");
        return;
    }

    const res = await fetch(geminiImg.src);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "gemini_image.png";
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
});



// Gemini API로 초기 가설 내러티브 자동 생성 (준비 데이터 기반)
async function generateNarrativeWithAI() {
    // 준비 단계 데이터 가져오기
    const topic = document.getElementById("prepTopic")?.value.trim() || "지정되지 않은 주제";
    const name = document.getElementById("prepName")?.value.trim() || "응답자";
    const age = document.getElementById("prepAge")?.value.trim() || "미상";
    const gender = document.querySelector('input[name="prepGender"]:checked')?.value || "성별 미상";
    const prepNotes = document.getElementById("prepNotes")?.value.trim() || "특이사항 없음";
    
    // 사전 질문 리스트 모으기
    const questionInputs = document.querySelectorAll('.prep-question-input');
    const questions = Array.from(questionInputs).map(input => input.value.trim()).filter(val => val !== "").join(", ");

    const schema = {
        description: "Narrative description of a contextual inquiry scene",
        type: SchemaType.OBJECT,
        properties: {
            narrative: { type: SchemaType.STRING, description: "The main narrative text in Korean", nullable: false },
            key_emotions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Key emotions", nullable: false },
            atmosphere: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Atmosphere keywords", nullable: false },
            key_elements: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Important visual elements", nullable: false }
        },
        required: ["narrative", "key_emotions", "atmosphere", "key_elements"],
    };

    const prompt = `
# ROLE
당신은 UX 리서치 맥락에서 사용자의 과거 경험을 장면(scene) 단위 내러티브로 재구성하는 전문가입니다. 사용자의 응답을 기반으로, 한 순간의 경험을 시간적, 공간적, 감정적 맥락까지 포함한 짧지만 구체적인 이야기로 정리합니다. 사용자의 경험을 깊이 이해하고 생생한 내러티브로 표현하는 데 탁월한 능력을 가지고 있습니다.

# BACKGROUND
내러티브는 인물, 배경, 사건이 시간적 순서와 인과관계를 가지며 배열된 이야기 구조입니다. 한 장면을 효과적으로 묘사하는 내러티브는 다음 4요소를 포함할 때 이해와 몰입이 높아집니다.

1) 상황 제시(orientation): 언제, 어디서, 누구와, 무엇을 하고 있었는지
2) 사건 전개(complicating action): 그때 무슨 일이 일어났고, 사용자가 어떤 행동을 했는지
3) 평가/감정(evaluation): 그 순간 어떤 감정을 가지고 생각을 했고, 왜 중요한지
4) 결과/여운(result/coda): 그 일의 결과와, 지금 돌아봤을 때 남아 있는 느낌이 무엇인지

UX 문맥에서는 이 4요소를 "상황(when/where/who/what) – 행동 – 감정/생각 – 결과/의미"로 정리할 수 있습니다.

# TASK
사용자가 제공한 경험 데이터(CONTEXT)를 바탕으로, 당시 상황을 생생하게 재현하는 1인칭 시점의 내러티브를 작성하세요. 단순한 설명이 아니라, 마치 그 장면을 실제로 보는 듯한 구체적이고 감각적인 묘사가 필요합니다.

# CONTEXT
## 인터뷰 주제
${topic}

## 캐릭터 정보
- 이름: ${name}
- 성별: ${gender}
- 나이대: ${age}
${prepNotes !== "특이사항 없음" ? `- 특이사항: ${prepNotes}` : ""}

${questions ? `## 사전 질문\n${questions}` : ""}

# TASK
※ 중요: 사전 질문은 단순히 사용자의 경험을 이해하기 위한 참고 자료일 뿐, 내러티브에 직접 포함되어야 하는 사건은 아닙니다. 사용자가 실제로 경험한 과거의 특정 순간에 집중하세요.

# OUTPUT DIRECTIVES
## Format Requirements
1. narrative (string): 5-8문장으로 구성된 자연스러운 스토리
   - 1인칭 시점(“나는 …했다”, “나는 …라고 느꼈다”)으로 작성합니다.
   - 일기처럼 자연스럽지만, 연구자가 읽기에도 명료한 문장을 사용합니다. 과도한 수사나 비유는 지양하고, 구체적인 상황 묘사에 집중하세요.
   - 사용자가 말하지 않은 세부(조명, 소리, 주변 사람 수 등)는 “한국의 일상적 상황에서 자연스러운 수준”에서만 보수적으로 보완합니다.

2. key_emotions (array of strings): **반드시 3-5개의 구체적인 감정 키워드를 배열로 제공하세요**
   - 예시: ["불안함", "당혹스러움", "호기심"]
   - 사용자 입력에서 유추되는 감정만 포함
   - 추상적이거나 모호한 표현 피하기 (예: "그저 그렇다", "복잡하다")

3. atmosphere (array of strings): **반드시 3-5개의 분위기 키워드를 배열로 제공하세요**
   - 예시: ["긴장감", "분주함", "조용함"]
   - 사용자 입력에 기반한 분위기 키워드
   - 장소, 시간대, 주변 환경에 의향을 받을 수 있음

4. key_elements (array of strings): **반드시 3-5개의 시각적/맥락적 요소를 배열로 제공하세요**
   - 예시: ["셀프 계산대", "대형 마트 내부", "터치 스크린"]
   - 사용자가 언급한 구체적 요소만 포함
   - 장면의 핵심 사물, 공간, 인터페이스 등

**중요: 모든 필드는 반드시 제공되어야 하며, 빈 배열이 아닌 유효한 값들을 포함해야 합니다.**

# TONE
생생하고 사실적이며, 공감적인 톤을 유지하세요. 사용자의 경험을 존중하고 그 순간의 감정을 진지하게 다루되, 지나치게 감상적이거나 문학적이지 않도록 자연스럽게 작성하세요.
`;

    try {
        const result = await textModel.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema: schema },
        });
        
        const response = await result.response;
        const narrativeData = JSON.parse(response.text());
        
        currentKeyEmotions = narrativeData.key_emotions || [];
        currentAtmosphere = narrativeData.atmosphere || [];
        currentKeyElements = narrativeData.key_elements || [];
        
        displayKeywords();
        return {
            narrative: narrativeData.narrative,
            keyEmotions: currentKeyEmotions,
            atmosphere: currentAtmosphere,
            keyElements: currentKeyElements
        };
    } catch (error) {
        console.error("초기 내러티브 생성 실패:", error);
        return '';
    }
}

// 기본 프롬프트 생성 (내러티브 기반)
function buildBasePrompt(narrativeText) {
    // 프롬프트 엔지니어링 원칙 적용: 4 Elements + 6 Components
    const prompt = `# ROLE
You are an expert 3D cartoon scene illustrator specialized in creating warm, friendly, and emotionally expressive character scenes.

# TASK
Generate a 3D cartoon illustration that accurately depicts the following user experience scenario in a visually engaging and emotionally authentic way.

# CONTEXT & STYLE
## Visual Style
- Style: Warm and soft-lit 3D cartoon rendering style
- Texture: Clay animation-like smooth texture with round, gentle forms
- Mood: Cute, friendly, realistic yet not exaggerated, natural atmosphere

## Character Specification
${PROMPT_STYLE.getFixedElements()}

# INPUT: SCENE NARRATIVE
${narrativeText || "A user experiencing a moment in their daily life"}

# OUTPUT DIRECTIVES
## Camera & Composition
Use Medium Shot as default: Show character from waist up with surrounding context visible

## Visual Requirements
1. Accurately reflect the character's gender, age, and appearance
2. Capture the emotional atmosphere described in the narrative
3. Include relevant environmental elements that support the story
4. Maintain consistency with the 3D cartoon aesthetic
5. Ensure the scene is clear, focused, and emotionally resonant

# TONE
The image should feel warm, relatable, and empathetic. Avoid dramatic or exaggerated expressions. Maintain a natural, everyday life quality that viewers can connect with emotionally.`;
    
    // 현재 프롬프트 저장
    currentPrompt = prompt;
    
    return prompt;
}

// 히스토리 사이드바 렌더링
function renderHistorySidebar() {
    if (!historyListEl) return;

    if (historyEmptyEl) {
        historyEmptyEl.style.display = sceneHistory.length ? "none" : "block";
    }

    const existingItems = historyListEl.querySelectorAll(".history-item");
    existingItems.forEach((el) => el.remove());

    const frag = document.createDocumentFragment();
    sceneHistory.slice().reverse().forEach((entry) => {
        const item = document.createElement("div");
        item.className = "history-item";
        item.dataset.id = String(entry.id);

        const thumb = document.createElement("div");
        thumb.className = "history-thumb";
        const img = document.createElement("img");
        img.src = entry.imgSrc;
        img.alt = "scene thumbnail";
        thumb.appendChild(img);

        const meta = document.createElement("div");
        meta.className = "history-meta";

        const time = document.createElement("div");
        time.className = "history-time";
        time.textContent = entry.time;

        const text = document.createElement("div");
        text.className = "history-text";
        const truncatedText = entry.narrativeText.length > 50 
            ? entry.narrativeText.substring(0, 50) + '...' 
            : entry.narrativeText;
        text.textContent = truncatedText;

        meta.appendChild(time);
        meta.appendChild(text);
        item.appendChild(thumb);
        item.appendChild(meta);

        // 히스토리 항목 클릭 시 복원
        item.addEventListener("click", () => {
            if (!geminiImg || !narrativeTextEl) return;
            isRestoring = true;

            geminiImg.src = entry.imgSrc;
            narrativeTextEl.innerHTML = entry.narrativeHtml;
            currentNarrative = entry.narrativeText;
            currentPrompt = entry.prompt || "";
            currentKeyEmotions = entry.keyEmotions || [];
            currentAtmosphere = entry.atmosphere || [];
            currentKeyElements = entry.keyElements || [];
            currentPanoramaImgSrc = entry.panoramaImgSrc || null;
            
            // 키워드 패널 업데이트
            displayKeywords();

            if (imageCard) {
                imageCard.classList.add("has-image");
                imageCard.classList.remove("is-loading");
            }

            setTimeout(() => { isRestoring = false; }, 0);
        });

        frag.appendChild(item);
    });

    historyListEl.appendChild(frag);
}

function syncLoadingToRespondent(show) {
    if (respondentWindow && !respondentWindow.closed) {
        // 응답자 화면에 로딩 메시지 전송 로직 (응답자 페이지에 toggleLoading 함수 필요)
        respondentWindow.postMessage({ type: 'toggleLoading', value: show }, '*');
    }
}

// 로딩 시작
function startLoading() {
    if (!imageCard) return;
    if (respondentWindow && !respondentWindow.closed) {
    respondentWindow.postMessage({ type: 'toggleLoading', value: true }, '*'); // 종료 시 false
}
    imageCard.classList.add("is-loading");
    syncLoadingToRespondent(true);
}

// 로딩 중지
function stopLoading() {
    if (!imageCard) return;
    if (respondentWindow && !respondentWindow.closed) {
    respondentWindow.postMessage({ type: 'toggleLoading', value: true }, '*');
}
    imageCard.classList.remove("is-loading");
    
    syncLoadingToRespondent(false);
}

// 새 이미지 로드 완료 시 처리
function onNewImageLoaded() {
    if (isRestoring) {
        stopLoading();
        if (!imageCard) return;
        imageCard.classList.add("has-image");
        return;
    }

    if (!imageCard) return;
    imageCard.classList.add("has-image");

    if (mainContainer) {
        mainContainer.classList.add('show-left');
    }

    const interactionArea = document.querySelector('.interaction-area');
    if (interactionArea) {
        interactionArea.style.display = 'flex';
    }

    renderHistorySidebar();
}

// 입력 정보 요약 업데이트 (사이드바 패널에 표시)
function updateInputInfoSummary() {
    const inputSummary = document.getElementById('inputSummary');
    if (!inputSummary) return;

    // 준비 모달의 정보 가져오기
    const topic = document.getElementById('prepTopic')?.value.trim() || '';
    const name = document.getElementById('prepName')?.value.trim() || '';
    const age = document.getElementById('prepAge')?.value.trim() || '';
    const gender = document.querySelector('input[name="prepGender"]:checked')?.value || '';
    const notes = document.getElementById('prepNotes')?.value.trim() || '';
    
    // 사전 질문 가져오기
    const questionInputs = document.querySelectorAll('.prep-question-input');
    const questions = Array.from(questionInputs)
        .map(input => input.value.trim())
        .filter(val => val !== "");

    if (!topic && !name && !notes && questions.length === 0) {
        inputSummary.innerHTML = '<p class="info-placeholder">인터뷰를 시작하면 입력한 정보가 여기에 표시됩니다.</p>';
        return;
    }

    let html = '';
    if (topic) html += `<div class="info-row"><span class="label">주제:</span><span>${topic}</span></div>`;
    if (name) html += `<div class="info-row"><span class="label">이름:</span><span>${name}</span></div>`;
    if (age) html += `<div class="info-row"><span class="label">나이:</span><span>${age}</span></div>`;
    if (gender) html += `<div class="info-row"><span class="label">성별:</span><span>${gender}</span></div>`;
    if (notes) html += `<div class="info-row"><span class="label">특이사항:</span><span>${notes}</span></div>`;
    if (questions.length > 0) {
        html += `<div class="info-row"><span class="label">사전 질문:</span><span>${questions.length}개</span></div>`;
    }

    inputSummary.innerHTML = html;
    
    // 입력 정보 패널 펼치기
    const inputInfoPanel = document.getElementById('inputInfoPanel');
    if (inputInfoPanel && inputInfoPanel.classList.contains('collapsed')) {
        inputInfoPanel.classList.remove('collapsed');
    }
}

// ============================================
// ============================================

// 이미지 로드 완료 시 자동 처리
if (geminiImg) {
    geminiImg.addEventListener("load", onNewImageLoaded);
}

// 360도 파노라마 실사 이미지 생성
async function generatePanoramaImage(modificationContext = '') {
    if (!currentNarrative) {
        throw new Error('현재 내러티브가 없습니다.');
    }
    
    // 강제 할당하던 where 변수 삭제
    // AI에게 내러티브를 분석하여 장소를 스스로 유추하도록 프롬프트 수정
    
    const panoramaPrompt = `# ROLE
You are an expert photographer specializing in 360-degree equirectangular panoramic photography.

# TASK
Generate a photorealistic 360-degree equirectangular panorama of the environment described in the Scene Context below. 
Analyze the 'Situation' (narrative) to determine the most appropriate location, time, and setting for this panorama.

# SCENE CONTEXT
Situation (Narrative): ${currentNarrative}
${modificationContext ? `User's Additional Request: ${modificationContext}` : ''}

# CRITICAL FORMAT REQUIREMENTS
1. **Projection**: MUST be equirectangular (also called spherical or lat-long projection)
2. **Aspect Ratio**: MUST be exactly 2:1 (width is twice the height)
3. **Coverage**: Full 360×180 degree spherical coverage
4. **Horizon**: Must be at the vertical center of the image
5. **Edge Continuity (CRITICAL)**: 
   - The leftmost and rightmost pixels MUST connect seamlessly to form a continuous 360° loop
   - Architectural elements, walls, floors, and ceilings at the edges must align perfectly
   - Lighting and color temperature must match at both edges
   - No visible seam or discontinuity when edges wrap around

# VISUAL STYLE
- Style: Photorealistic street photography
- Quality: High-resolution, sharp, clear details
- Perspective: Eye-level view (approximately 1.6m height)
- Lighting: Natural, realistic lighting matching the scene context
- Atmosphere: Authentic, immersive environmental detail
- Cultural Context: All scenes must depict typical Korean everyday environments with Korean-style architecture, signage (in Korean), and cultural elements appropriate to South Korea

# CONTENT REQUIREMENTS
- **NO CHARACTERS OR PEOPLE**: Show only the environment, architecture, and objects
- Include: Buildings, furniture, fixtures, ambient elements, spatial context inferred from the narrative
- Exclude: Any human figures, characters, or representations of people
- Korean Context: Include Korean-style elements such as Korean signage, typical Korean architecture, Korean brands, and culturally appropriate environmental details
- Details: Realistic textures, materials, depth, and spatial relationships

# EDGE CONNECTION GUIDELINES
- Imagine the camera is at the center of a sphere, capturing everything around it
- The leftmost edge and rightmost edge are the same view direction, just wrapped
- Ensure continuous patterns: if a wall starts at the right edge, it should continue at the left edge
- Maintain consistent perspective distortion across the entire 360° view
- Test mentally: if you stitched left and right edges together, they should align perfectly

# REFERENCE
The output should look similar to Google Street View panoramas - a complete 360-degree environmental capture that wraps seamlessly without any visible seam when viewed in a panoramic viewer.

# TONE
Photorealistic, immersive, and architecturally accurate. Focus on the spatial experience and environmental ambiance inferred from the narrative. Prioritize seamless edge continuity for proper 360° viewing.`;
    
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: panoramaPrompt }] }],
        generationConfig: {
            temperature: 0.3,
            topK: 32,
            topP: 1,
            maxOutputTokens: 8192,
        },
    });
    
    const response = result.response;
    const candidates = response.candidates;
    
    if (candidates && candidates[0]?.content?.parts) {
        const parts = candidates[0].content.parts;
        const imagePart = parts.find(p => p.inlineData && p.inlineData.mimeType && p.inlineData.mimeType.startsWith('image/'));
        
        if (imagePart && imagePart.inlineData && imagePart.inlineData.data) {
            const mimeType = imagePart.inlineData.mimeType;
            const base64Data = imagePart.inlineData.data;
            return `data:${mimeType};base64,${base64Data}`;
        }
    }
    
    throw new Error('파노라마 이미지를 생성할 수 없습니다.');
}

// 현재 내러티브 기반 업데이트 (수정 요청 반영)
async function updateNarrativeWithModification(selectedQuestion, userAnswer) {
    if (!currentNarrative || !selectedQuestion || !userAnswer) {
        throw new Error('현재 내러티브, 질문 또는 답변이 없습니다.');
    }
    
    // 내러티브 스키마 정의
    const schema = {
        description: "Updated narrative with user modifications",
        type: SchemaType.OBJECT,
        properties: {
            narrative: {
                type: SchemaType.STRING,
                description: "The updated narrative text in Korean",
                nullable: false,
            },
            key_emotions: {
                type: SchemaType.ARRAY,
                items: { type: SchemaType.STRING },
                description: "Key emotions in the updated scene (in Korean)",
                nullable: false,
            },
            atmosphere: {
                type: SchemaType.ARRAY,
                items: { type: SchemaType.STRING },
                description: "Atmosphere keywords of the updated scene (in Korean)",
                nullable: false,
            },
            key_elements: {
                type: SchemaType.ARRAY,
                items: { type: SchemaType.STRING },
                description: "Key visual elements in the updated scene (in Korean)",
                nullable: false,
            }
        },
        required: ["narrative", "key_emotions", "atmosphere", "key_elements"],
    };

    const prompt = `# ROLE
당신은 사용자 경험 시나리오 작가입니다. 기존 내러티브를 사용자의 수정 요청에 따라 업데이트하는 전문가입니다.

# CONTEXT
※ **현재 상황**: 인터뷰어와 응답자 간의 심층 면담이 진행 중입니다. 인터뷰어가 심층 질문을 던졌고, 응답자가 답변했습니다. 이 답변을 바탕으로 기존 내러티브를 업데이트해야 합니다.

## 현재 내러티브 (업데이트 전)
${currentNarrative}

## 현재 키워드
- 주요 감정: ${currentKeyEmotions.join(', ')}
- 분위기: ${currentAtmosphere.join(', ')}
- 핵심 요소: ${currentKeyElements.join(', ')}

## 인터뷰 질의응답
### 인터뷰어의 질문
${selectedQuestion}

### 응답자의 답변
${userAnswer}

# TASK
인터뷰어의 질문에 대한 응답자의 답변을 분석하여, 기존 내러티브에 새롭게 드러난 정보를 자연스럽게 통합하세요. 답변에서 드러난 맥락, 감정, 구체적 디테일을 반영하여 더 풍부하고 정확한 내러티브로 업데이트하세요.

# CRITICAL DISTINCTION
※ **실제 사건 vs 희망사항 구분**
- 응답자의 답변에서 **실제로 일어난 과거의 사건**만을 내러티브에 포함하세요.
- "좋았을 텐데", "했으면 좋겠다", "했어야 했다", "했다면" 같은 표현은 **희망사항이나 후회**이므로 사건으로 취급하지 마세요.
- 예시:
  - 잘못된 해석: "더 친절했으면 좋았을 텐데" → "직원은 친절했다" (실제로 일어나지 않은 일)
  - 올바른 해석: "더 친절했으면 좋았을 텐데" → "직원의 태도가 무뚝하게 느껴져서 아쉬움이 남았다"

# OUTPUT DIRECTIVES
## Format Requirements
1. narrative (string): 5-8문장의 업데이트된 내러티브
   - 기존 내러티브의 흐름을 유지하면서 수정 사항을 반영
   - 자연스럽고 일관된 흐름 유지
   - 구체적이고 감각적인 묘사
   - 1인칭 시점 유지

2. key_emotions (array of strings): **반드시 3-5개의 구체적인 감정 키워드를 배열로 제공하세요**
   - 예시: ["불안함", "당혹스러움", "호기심", "안도감"]
   - 업데이트된 내러티브에서 유추되는 감정만 포함
   - 추상적이거나 모호한 표현 피하기
   - 사용자의 답변에서 드러나는 감정 변화를 반영

3. atmosphere (array of strings): **반드시 3-5개의 분위기 키워드를 배열로 제공하세요**
   - 예시: ["긴장감", "분주함", "조용함", "따뜻함"]
   - 업데이트된 상황의 분위기 키워드
   - 장소, 시간대, 주변 환경의 영향을 반영

4. key_elements (array of strings): **반드시 3-5개의 시각적/맥락적 요소를 배열로 제공하세요**
   - 예시: ["계산대", "터치스크린", "긴 줄", "형광등"]
   - 업데이트된 장면의 핵심 사물, 공간, 인터페이스 등
   - 사용자가 언급한 새로운 요소를 반드시 포함
   - **중요**: 사용자가 희망했지만 실제로 일어나지 않은 것들은 포함하지 마세요

**중요: 모든 필드(narrative, key_emotions, atmosphere, key_elements)는 반드시 제공되어야 하며, 빈 배열이 아닌 유효한 값들을 포함해야 합니다. 각 배열은 최소 3개 이상의 항목을 포함해야 합니다.**

# TONE
인터뷰 상황을 염두에 두고, 응답자의 답변을 존중하며 사실적이고 공감적인 톤을 유지하세요. 응답자가 실제로 경험한 것과 희망했던 것을 혼동하지 말고, 답변에서 드러난 진실된 경험만을 내러티브에 반영하세요.`;

    try {
        const result = await textModel.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        });
        
        const response = await result.response;
        const text = response.text();
        
        const narrativeData = JSON.parse(text);
        
        // 데이터 검증
        if (!narrativeData.narrative) {
            console.error('내러티브가 비어있습니다.');
            throw new Error('내러티브가 생성되지 않았습니다.');
        }
        if (!narrativeData.key_emotions || narrativeData.key_emotions.length === 0) {
            console.error('주요 감정이 비어있습니다.');
        }
        if (!narrativeData.atmosphere || narrativeData.atmosphere.length === 0) {
            console.error('분위기가 비어있습니다.');
        }
        if (!narrativeData.key_elements || narrativeData.key_elements.length === 0) {
            console.error('핵심 요소가 비어있습니다.');
        }
        
        // 키워드 데이터 저장
        currentKeyEmotions = narrativeData.key_emotions || [];
        currentAtmosphere = narrativeData.atmosphere || [];
        currentKeyElements = narrativeData.key_elements || [];
        
        // 키워드 패널에 표시
        displayKeywords();
        
        return {
            narrative: narrativeData.narrative,
            key_emotions: currentKeyEmotions,
            atmosphere: currentAtmosphere,
            key_elements: currentKeyElements
        };
    } catch (error) {
        console.error("내러티브 업데이트 실패:", error);
        console.error("에러 상세:", error.message);
        throw error;
    }
}

// 현재 이미지 기반 수정 (Image-to-Image)
async function modifyImageWithInput(currentImageSrc, modificationText, updatedNarrative) {
    if (!currentImageSrc || !modificationText || !updatedNarrative) {
        throw new Error('이미지, 수정 요청 또는 내러티브가 없습니다.');
    }
    
    // base64 이미지를 inlineData 형식으로 변환
    const base64Match = currentImageSrc.match(/^data:([^;]+);base64,(.+)$/);
    if (!base64Match) {
        throw new Error('올바른 base64 이미지 형식이 아닙니다.');
    }
    
    const mimeType = base64Match[1];
    const base64Data = base64Match[2];
    
    const modificationPrompt = `# ROLE
You are an expert 3D cartoon scene illustrator specialized in modifying existing scenes based on user feedback.

# TASK
Modify the provided image according to the user's modification request while maintaining the overall style and composition. The modification should be seamlessly integrated into the existing scene.

# CONTEXT & STYLE
## Visual Style
- Style: Warm and soft-lit 3D cartoon rendering style
- Texture: Clay animation-like smooth texture with round, gentle forms
- Mood: Cute, friendly, realistic yet not exaggerated, natural atmosphere

## Character Specification
${PROMPT_STYLE.getFixedElements()}

# CURRENT SCENE DESCRIPTION
${updatedNarrative}

# USER MODIFICATION REQUEST
${modificationText}

# OUTPUT DIRECTIVES
## Camera & Composition
- Use Medium Shot as default: Show character from waist up with surrounding context visible
- Maintain the same camera angle and composition as the original image
- Apply modifications while preserving the overall scene structure

## Modification Guidelines
1. Keep the character's appearance and position consistent with the original
2. Apply the requested modifications naturally and seamlessly
3. Maintain the 3D cartoon aesthetic and warm atmosphere
4. Ensure visual coherence between original and modified elements
5. Preserve the emotional tone described in the narrative

# TONE
The modified image should feel like a natural evolution of the original scene, with the requested changes integrated smoothly and authentically.`;
    
    currentPrompt = modificationPrompt;
    
    const result = await model.generateContent({
        contents: [{
            role: "user",
            parts: [
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                    }
                },
                { text: modificationPrompt }
            ]
        }],
        generationConfig: {
            imageConfig: { aspectRatio: "16:9" },
            responseModalities: ["image"],
        },
    });
    
    const response = await result.response;
    
    if (!response.candidates || !response.candidates[0]?.content?.parts) {
        throw new Error('이미지 수정에 실패했습니다.');
    }
    
    const imgData = response.candidates[0].content.parts[0].inlineData;
    return `data:${imgData.mimeType};base64,${imgData.data}`;
}

// 공통: 내러티브 재생성 및 이미지 생성
async function regenerateSceneWithNarrative(userModification = "") {
    // 내러티브 재생성
    let narrativeHtml = "";
    if (narrativeTextEl) {
        try {
            const result = await generateNarrativeWithAI();
            if (result && result.narrative) {
                narrativeHtml = result.narrative;
                narrativeTextEl.innerHTML = narrativeHtml;
                currentNarrative = narrativeHtml.replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
            }
        } catch (error) {
            console.error("내러티브 재생성 중 오류:", error);
        }
    }
    
    if (geminiInput) {
        const basePrompt = buildBasePrompt(currentNarrative);
        geminiInput.value = userModification 
            ? `${basePrompt}\n\n추가 수정 요청:\n${userModification}` 
            : basePrompt;
    }
    
    triggerGeminiGenerate();
    await adjustContextParameters(currentNarrative);
}

// 히스토리 토글 버튼
if (historyToggleBtn) {
    historyToggleBtn.addEventListener("click", () => {
        const historyPanel = document.getElementById("historyPanel");
        if (historyPanel) {
            historyPanel.classList.toggle('collapsed');
        }
    });
}

// 장면 만들기 버튼
// 심층 질문 3개 생성
async function generateDeepQuestions(narrative) {
    const questionListEl = document.getElementById('aiQuestionList');
    if (!questionListEl) return;

    // 심층 질문 생성을 위한 프롬프트 설계
    const prompt = `
# ROLE
당신은 질적 연구에서 심층면담(in-depth interview)과 사진유도면담을 수행하는 UX 리서치 보조 인터뷰어입니다. 당신의 목표는 사용자가 이미 말한 내용과 사용자의 경험을 재현한 장면을 바탕으로, 그 경험의 맥락, 감정, 의미를 더 깊게 탐색할 수 있는 열린 질문을 생성하는 것입니다.

# TASK
<제공된 사용자의 내러티브를 분석하여, 아래의 사고 질문 유형 중 가장 적합한 3가지를 선택해 사용자의 경험 속 심층적인 페인 포인트(Pain Points), 감정의 변화, 물리적/심리적 장애물을 파악하기 위한 '심층 질문' 3개를 생성하세요.>

# STRATEGY: 사고 질문 유형
생성하는 3개의 질문은 아래 5가지 유형 중 가장 적합한 것을 선택하여 구성하세요.
1. 발산형: 문제를 해결해 가는 과정에서 다양한 정보를 정보를 탐색하고 상상력을 발휘하여 여러 가지 해결책을 생각할 수 있도록 하는 질문.
2. 정보 요구형: 특정 문제를 해결하기 위해 정보나 대안을 모색하거나 이해되지 않은 것에 관해 설명을 구하여 구체적인 추가 세부 정보를 얻기 위한 질문.
3. 평가형: 특정 정보, 의견, 주장 또는 상황에 관한 판단과 평가를 요구하는 질문으로, 사용자가 자기 생각이나 입장을 명확히 유도하는 질문.
4. 비교형: 두 개 이상의 대안, 아이디어, 개념 등을 비교하여 차이점이나 유사점을 파악하는 질문.
5. 인과관계형: 사건이나 상황 간의 인과관계를 탐구하는 질문, 어떤 원인이 특정 결과를 초래했는지 이해하고자 하는 질문.

# NARRATIVE
"${narrative}"

# QUESTION GUIDELINES
1. 질문은 항상 열린 질문(open-ended question)이어야 합니다. "예/아니오"로 끝날 수 있는 질문은 작성하지 않습니다. 참여자를 평가하거나 정답을 요구하는 뉘앙스(“정말 그랬나요?”, “그게 맞나요?” 등)는 피합니다.
2. 사용자가 실제로 쓴 핵심 표현(예: “당혹스러웠다”, “기다림이 길게 느껴졌다”)을 질문에 인용합니다. 예시로 사용자가 "조금 당혹스러웠다"고 했다면, "어떤 점이 가장 당혹스럽게 느껴졌나요?"처럼 질문합니다. 이는 필수적이지는 않지만, 사용자가 자신의 경험을 더 깊이 탐색하도록 돕는 효과적인 방법입니다.

# OUTPUT FORMAT
- 다른 설명 없이 3개의 질문 리스트만 번호 없이 한 줄씩 출력하세요.
`;

    try {
        const result = await textModel.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        const questions = text.split('\n')
            .filter(q => q.trim().length > 0)
            .map(q => q.replace(/^\d+[\.\)\s]*/, '').trim())
            .slice(0, 3);

        // UI 업데이트
        questionListEl.innerHTML = questions.map(q => `
            <div class="question-item" onclick="window.appendQuestionToInput('${q.replace(/'/g, "\\'").trim()}')">
                <i class="fas fa-lightbulb"></i>
                <span class="question-text">${q}</span>
            </div>
        `).join('');

        // 💡 [수정할 부분] 숨겨져 있던 심층 질문 전체 영역을 화면에 표시합니다.
        const aiDeepQuestionSection = document.getElementById('aiDeepQuestionSection');
        if (aiDeepQuestionSection) {
            aiDeepQuestionSection.style.display = 'flex';
        }

    } catch (error) {
        console.error("심층 질문 생성 오류:", error);
        questionListEl.innerHTML = '<div class="question-item">분석 중 오류가 발생했습니다.</div>';
    }
}

// 클릭 시 하단 입력창에 질문을 넣어주는 함수
window.appendQuestionToInput = function(question) {
    // 모든 섹션의 질문 하이라이트 초기화
    document.querySelectorAll('.question-item').forEach(el => el.classList.remove('selected'));
    
    // 클릭된 텍스트와 일치하는 모든 요소 찾기 (사전/AI 질문 공통)
    const allItems = document.querySelectorAll('.question-item');
    allItems.forEach(item => {
        if (item.textContent.trim().includes(question.trim())) {
            item.classList.add('selected');
        }
    });

    // 답변 영역 활성화
    const replyArea = document.getElementById("questionReplyArea");
    if (replyArea) {
        replyArea.classList.remove('disabled');
        const input = document.getElementById("replyInput");
        input.placeholder = `선택된 질문에 대한 답변을 입력해주세요.`;
        input.focus({ preventScroll: true });
    }
    
    if (respondentWindow && !respondentWindow.closed) {
    respondentWindow.postMessage({ type: 'syncQuestion', question: question }, '*');
}

    currentSelectedQuestion = question;
    // (이후 응답자 탭 동기화 로직 유지)
};

// ============================================
// 1. 심층 질문 답변 제출 (스토리 진화 모드 + 질문 재생성)
// ============================================
if (replySubmitBtn) {
    replySubmitBtn.addEventListener("click", async (e) => {
        e.preventDefault();

        if (!sceneCommitted) {
            alert('먼저 장면을 만들어주세요.');
            return;
        }

        const answer = replyInput.value.trim();
        if (!answer) {
            alert('답변을 입력해주세요.');
            return;
        }
        
        // 버튼 비활성화 및 로딩 상태
        replySubmitBtn.disabled = true;
        const originalHTML = replySubmitBtn.innerHTML;
        replySubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>반영 중...</span>';
        replySubmitBtn.style.backgroundColor = '#94a3b8';
        replySubmitBtn.style.cursor = 'not-allowed';
        
        try {
            // [1] 내러티브 업데이트 전 검증
            if (!currentNarrative) {
                alert('먼저 초기 장면을 생성해주세요.');
                replySubmitBtn.disabled = false;
                replySubmitBtn.innerHTML = originalHTML;
                replySubmitBtn.style.backgroundColor = '';
                replySubmitBtn.style.cursor = '';
                return;
            }

            // [3] 내러티브 업데이트 (AI 호출)
            const updatedNarrativeData = await updateNarrativeWithModification(currentSelectedQuestion, answer);
            
            // 전역 변수에 즉시 할당
            currentNarrative = updatedNarrativeData.narrative;
            currentKeyEmotions = updatedNarrativeData.key_emotions || [];
            currentAtmosphere = updatedNarrativeData.atmosphere || [];
            currentKeyElements = updatedNarrativeData.key_elements || [];
            
            // 화면에 내러티브 표시
            if (narrativeTextEl) {
                narrativeTextEl.innerHTML = currentNarrative;
            }
            
            // 키워드 패널 업데이트
            displayKeywords();

            // [4] 심층 질문 재생성
            await generateDeepQuestions(currentNarrative);

            // [5] 히스토리 저장 (기존 이미지 유지)
            const currentImageSrc = geminiImg?.src || '';
            const currentPanoramaSrc = currentPanoramaImgSrc || null;
            
            const newSceneEntry = {
                id: Date.now(),
                time: new Date().toLocaleString("ko-KR", { hour12: false }),
                imgSrc: currentImageSrc,
                panoramaImgSrc: currentPanoramaSrc,
                narrativeHtml: currentNarrative,
                narrativeText: currentNarrative,
                prompt: currentPrompt || "",
                keyEmotions: [...currentKeyEmotions],
                atmosphere: [...currentAtmosphere],
                keyElements: [...currentKeyElements],
                sceneNumber: currentSceneNumber,
                variationNumber: currentVariationNumber,
            };
            sceneHistory.push(newSceneEntry);
            
            // 로그 기록
            interactionLog.push({
                type: 'question_answer',
                timestamp: new Date().toLocaleString("ko-KR", { hour12: false }),
                question: currentSelectedQuestion,
                answer: answer,
                narrative: currentNarrative,
                keyEmotions: [...currentKeyEmotions],
                atmosphere: [...currentAtmosphere],
                keyElements: [...currentKeyElements],
            });
            renderHistorySidebar(); 

            // [6] 응답자 화면 동기화
            if (respondentWindow && !respondentWindow.closed) {
                const tags = [...currentKeyEmotions, ...currentAtmosphere, ...currentKeyElements].map(t => `#${t}`);
                respondentWindow.postMessage({
                    type: 'syncAll',
                    narrative: currentNarrative,
                    question: currentSelectedQuestion,
                    parameters: tags,
                    panoramaSrc: currentPanoramaSrc
                }, '*');
            }

            // [7] 기타 UI 정리
            replyInput.value = '';
            currentSelectedQuestion = "";
            if (questionReplyArea) {
                questionReplyArea.classList.add('disabled');
                document.querySelectorAll('.question-item').forEach(el => el.classList.remove('selected'));
            }
            
        } catch (error) {
            console.error('장면 진화 오류:', error);
            alert('장면을 업데이트하는 중 오류가 발생했습니다.');
        } finally {
            // 버튼 복원
            replySubmitBtn.disabled = false;
            replySubmitBtn.innerHTML = originalHTML;
            replySubmitBtn.style.backgroundColor = '';
            replySubmitBtn.style.cursor = '';
        }
    });
}

// ============================================
// 2. 이미지 리믹스 & 새 장면 생성 제출
// ============================================
if (remixSubmitBtn) {
    remixSubmitBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!sceneCommitted) {
            alert('먼저 장면을 만들어주세요.');
            return;
        }
        
        const request = remixInput.value.trim();
        const modificationCommand = request ? request : "현재 설정된 맥락 파라미터(분위기, 밀도, 거리)에 맞춰서 이미지를 조절해줘.";
        
        try {
            startLoading();
            
            if (currentEditMode === 'remix') {
                // REMIX 모드: 현재 이미지 수정
                const currentImageSrc = geminiImg?.src;
                if (!currentImageSrc) throw new Error('현재 이미지가 없습니다.');
                
                // 이미지 수정
                const modifiedImageSrc = await modifyImageWithInput(currentImageSrc, modificationCommand, currentNarrative);
                if (geminiImg) geminiImg.src = modifiedImageSrc;
                
                // 파노라마 재생성 (사용자의 수정 요청 반영)
                try {
                    const newPanoramaSrc = await generatePanoramaImage(modificationCommand);
                    if (newPanoramaSrc) {
                        currentPanoramaImgSrc = newPanoramaSrc;
                        updatePanoramaBtnState(true);
                    }
                } catch (e) {
                    console.warn("파노라마 재생성 실패", e);
                }
                
                // 변형 번호 증가 (같은 scene의 다른 버전)
                currentVariationNumber++;
                
                // 히스토리 저장
                sceneHistory.push({
                    id: Date.now(),
                    time: new Date().toLocaleString("ko-KR", { hour12: false }),
                    imgSrc: modifiedImageSrc,
                    panoramaImgSrc: currentPanoramaImgSrc,
                    narrativeHtml: currentNarrative,
                    narrativeText: currentNarrative,
                    prompt: currentPrompt,
                    keyEmotions: [...currentKeyEmotions],
                    atmosphere: [...currentAtmosphere],
                    keyElements: [...currentKeyElements],
                    sceneNumber: currentSceneNumber,
                    variationNumber: currentVariationNumber,
                });
                renderHistorySidebar();
                
                // 로그 기록
                interactionLog.push({
                    type: 'image_modify',
                    timestamp: new Date().toLocaleString("ko-KR", { hour12: false }),
                    sceneNumber: currentSceneNumber,
                    variationNumber: currentVariationNumber,
                    request: modificationCommand,
                });
            }
            
            // UI 초기화
            remixInput.value = '';
            
        } catch (error) {
            console.error('이미지 처리 오류:', error);
            alert('이미지 처리 중 오류가 발생했습니다.');
        } finally {
            stopLoading();
        }
    });
}

// ============================================
// 3. 우측 사이드바(리믹스 패널) 토글 및 모드 선택
// ============================================
const remixModeBtn = document.getElementById('remixModeBtn');
const createModeBtn = document.getElementById('createModeBtn');

if (remixModeBtn) {
    remixModeBtn.addEventListener('click', () => {
        currentEditMode = 'remix';
        remixModeBtn.classList.add('active');
        createModeBtn?.classList.remove('active');
    });
}

if (createModeBtn) {
    createModeBtn.addEventListener('click', () => {
        currentEditMode = 'create';
        createModeBtn.classList.add('active');
        remixModeBtn?.classList.remove('active');
    });
}

if (remixToggleBtn) {
    remixToggleBtn.addEventListener("click", () => {
        mainContainer.classList.toggle('show-right');
        remixToggleBtn.classList.toggle('active');
    });
}
if (closeRightSidebarBtn) {
    closeRightSidebarBtn.addEventListener("click", () => {
        mainContainer.classList.remove('show-right');
        if (remixToggleBtn) remixToggleBtn.classList.remove('active');
    });
}

// 확대 버튼 - 360도 파노라마 뷰
if (expandBtn) {
    expandBtn.onclick = () => {
        if (!panoramaFullscreen) return;

        // 가장 최근 장면 가져오기
        const currentScene = sceneHistory[sceneHistory.length - 1];

        if (currentScene && currentScene.panoramaImgSrc) {
            panoramaFullscreen.style.display = 'flex';
            
            // 파노라마 로딩 숨김 처리 (이전 수정 사항 반영)
            const panoramaLoading = document.getElementById("panoramaLoading");
            if (panoramaLoading) {
                panoramaLoading.style.display = "none";
            }

            // 💡 [추가된 부분] 현재 상황(내러티브) 텍스트를 화면에 표시합니다.
            const panoramaNarrativeText = document.getElementById("panoramaNarrativeText");
            if (panoramaNarrativeText) {
                // 히스토리에 저장된 내러티브 텍스트를 가져와서 덮어씌웁니다.
                panoramaNarrativeText.innerHTML = currentScene.narrativeText || currentNarrative;
            }

            if (panoramaViewer) panoramaViewer.destroy();
            panoramaViewer = pannellum.viewer('panoramaViewer', {
                "type": "equirectangular",
                "panorama": currentScene.panoramaImgSrc,
                "autoLoad": true,
                "showControls": true,
                "hfov": 110
            });
            
            syncToRespondent(currentScene.panoramaImgSrc);
        } else {
            alert("파노라마 이미지를 불러오는 중입니다. 잠시만 기다려주세요.");
        }
    };
}

// 축소 버튼 - 전체 화면 닫기
if (closeFullscreenBtn) {
    closeFullscreenBtn.addEventListener("click", () => {
        if (panoramaFullscreen) {
            panoramaFullscreen.style.display = 'none';
        }
        if (panoramaViewer) {
            panoramaViewer.destroy();
            panoramaViewer = null;
        }
    });
}

// 사이드바 패널 토글
document.querySelectorAll('.panel-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
        const targetId = toggle.dataset.target;
        const panel = document.getElementById(targetId);
        if (panel) {
            panel.classList.toggle('collapsed');
        }
    });
});

// 내보내기
const exportBtn = document.getElementById('nextStepBtn');
if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
        if (sceneHistory.length === 0) {
            alert('내보낼 장면이 없습니다. 먼저 장면을 생성해주세요.');
            return;
        }
        
        try {
            exportBtn.disabled = true;
            exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 내보내는 중...';
            
            const zip = new JSZip();
            
            // 응답자 정보 가져오기
            const profileCard = document.querySelector('.user-profile-card');
            const respondentName = profileCard?.dataset.name || '응답자';
            const respondentGender = profileCard?.dataset.gender || '미상';
            const respondentAge = profileCard?.dataset.age || '미상';
            
            // 준비 단계 정보 가져오기
            const topic = document.getElementById("prepTopic")?.value.trim() || "지정되지 않은 주제";
            const prepNotes = document.getElementById("prepNotes")?.value.trim() || "특이사항 없음";
            
            // 사전 질문 리스트 모으기
            const questionInputs = document.querySelectorAll('.prep-question-input');
            const prepQuestions = Array.from(questionInputs)
                .map(input => input.value.trim())
                .filter(val => val !== "");
            
            // 응답자 이름으로 폴더 생성
            const mainFolder = zip.folder(respondentName);
            if (!mainFolder) throw new Error('폴더 생성 실패');
            
            // 통합 로그 생성
            let logText = `[주제: ${topic}]\n\n`;
            logText += `[인터뷰 대상자 정보]\n`;
            logText += `이름: ${respondentName}\n`;
            logText += `성별: ${respondentGender}\n`;
            logText += `나이: ${respondentAge}\n`;
            if (prepNotes !== "특이사항 없음") {
                logText += `특이사항: ${prepNotes}\n`;
            }
            if (prepQuestions.length > 0) {
                logText += `\n사전 준비 질문:\n`;
                prepQuestions.forEach((q, i) => {
                    logText += `${i + 1}. ${q}\n`;
                });
            }
            logText += `\n${'='.repeat(60)}\n\n`;
            
            logText += `[로그 데이터]\n\n`;
            
            // 로그 순서대로 정리
            interactionLog.forEach((log, idx) => {
                if (log.type === 'initial_response') {
                    logText += `## 초기 응답\n`;
                    logText += `# Narrative:\n${log.narrative}\n\n`;
                    logText += `# Key Emotions:\n${log.keyEmotions.join(', ')}\n\n`;
                    logText += `# Atmosphere:\n${log.atmosphere.join(', ')}\n\n`;
                    logText += `# Key Elements:\n${log.keyElements.join(', ')}\n\n`;
                    logText += `${'='.repeat(60)}\n\n`;
                    
                } else if (log.type === 'question_answer') {
                    logText += `## 질의응답\n`;
                    logText += `질문: ${log.question}\n`;
                    logText += `답변: ${log.answer}\n\n`;
                    logText += `수정된 Narrative:\n${log.narrative}\n\n`;
                    logText += `# Key Emotions:\n${log.keyEmotions.join(', ')}\n\n`;
                    logText += `# Atmosphere:\n${log.atmosphere.join(', ')}\n\n`;
                    logText += `# Key Elements:\n${log.keyElements.join(', ')}\n\n`;
                    logText += `${'='.repeat(60)}\n\n`;
                    
                } else if (log.type === 'image_modify') {
                    logText += `## 이미지 수정 요청 (Remix)\n`;
                    logText += `생성된 이미지: scene_${log.sceneNumber}-${log.variationNumber}.png\n`;
                    logText += `수정 요청 내용: ${log.request}\n\n`;
                    logText += `${'='.repeat(60)}\n\n`;
                    
                } else if (log.type === 'scene_create') {
                    logText += `## 새 장면 생성 (Create)\n`;
                    logText += `생성된 이미지: scene_${log.sceneNumber}-${log.variationNumber}.png\n`;
                    logText += `생성 요청 내용: ${log.request}\n\n`;
                    logText += `Narrative:\n${log.narrative}\n\n`;
                    logText += `# Key Emotions:\n${log.keyEmotions.join(', ')}\n\n`;
                    logText += `# Atmosphere:\n${log.atmosphere.join(', ')}\n\n`;
                    logText += `# Key Elements:\n${log.keyElements.join(', ')}\n\n`;
                    logText += `${'='.repeat(60)}\n\n`;
                }
            });
            
            // 통합 로그 파일 저장
            mainFolder.file('interview_log.txt', logText);
            
            // 이미지 저장 (scene_1-1.png 형식)
            const imageMap = new Map(); // sceneNumber-variationNumber를 키로 사용
            
            sceneHistory.forEach((scene) => {
                const sceneNum = scene.sceneNumber || 1;
                const varNum = scene.variationNumber || 1;
                const imageKey = `${sceneNum}-${varNum}`;
                
                // 같은 번호의 이미지가 여러 개 있을 경우 마지막 것만 저장
                imageMap.set(imageKey, scene);
            });
            
            // 이미지 파일 저장
            for (const [key, scene] of imageMap) {
                // 메인 이미지 저장
                if (scene.imgSrc && scene.imgSrc.startsWith('data:')) {
                    const base64Data = scene.imgSrc.split(',')[1];
                    mainFolder.file(`scene_${key}.png`, base64Data, { base64: true });
                }
                
                // 파노라마 이미지 저장
                if (scene.panoramaImgSrc && scene.panoramaImgSrc.startsWith('data:')) {
                    const panoramaBase64Data = scene.panoramaImgSrc.split(',')[1];
                    mainFolder.file(`scene_${key}_panorama.png`, panoramaBase64Data, { base64: true });
                }
            }
            
            // ZIP 생성 및 다운로드
            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${respondentName}_${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            exportBtn.disabled = false;
            exportBtn.innerHTML = '<i class="fas fa-file-export"></i> 내보내기';
            
            alert(`인터뷰 데이터가 성공적으로 내보내졌습니다.`);
        } catch (error) {
            console.error('내보내기 오류:', error);
            alert('내보내기 중 오류가 발생했습니다: ' + error.message);
            exportBtn.disabled = false;
            exportBtn.innerHTML = '<i class="fas fa-file-export"></i> 내보내기';
        }
    });
}

/// ============================================
// 0단계 & 1단계: 모달 제어 및 동적 질문 추가
// ============================================
const openPrepModalBtn = document.getElementById('openPrepModalBtn');
const closePrepModalBtn = document.getElementById('closePrepModalBtn');
const prepModalOverlay = document.getElementById('prepModalOverlay');
const addQuestionBtn = document.getElementById('addQuestionBtn');
const dynamicQuestionContainer = document.getElementById('dynamicQuestionContainer');

if (openPrepModalBtn) openPrepModalBtn.addEventListener('click', () => prepModalOverlay.style.display = 'flex');
if (closePrepModalBtn) closePrepModalBtn.addEventListener('click', () => prepModalOverlay.style.display = 'none');

if (addQuestionBtn) {
    addQuestionBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'prep-question-input inline-textarea';
        input.style.width = '100%';
        input.style.marginTop = '0';
        input.placeholder = '질문을 입력하세요';
        dynamicQuestionContainer.appendChild(input);
    });
}

// ============================================
// 인터뷰 시작 (원클릭 풀-오토메이션: 내러티브->이미지->파노라마->연동)
// ============================================
const startInterviewBtn = document.getElementById("startInterviewBtn");
if (startInterviewBtn) {
    startInterviewBtn.addEventListener("click", async () => {
        // [1] 데이터 수집 및 UI 초기 세팅
        const topic = document.getElementById("prepTopic").value.trim() || "주제 미상";
        const name = document.getElementById("prepName").value.trim() || "응답자";
        const age = document.getElementById("prepAge").value.trim() || "미상";
        const gender = document.querySelector('input[name="prepGender"]:checked')?.value || "남성";
        const questionInputs = document.querySelectorAll('.prep-question-input');
        const questions = Array.from(questionInputs).map(i => i.value.trim()).filter(v => v !== "");

        // [2] 탭 열기 및 레이아웃 전환
        respondentWindow = window.open('respondent.html', 'respondentTab');
        prepModalOverlay.style.display = 'none';
        document.getElementById('homeSection').style.display = 'none';
        document.getElementById('mainSection').style.display = 'grid';
        
        const headerRight = document.getElementById('headerRightArea');
        if (headerRight) headerRight.classList.remove('is-hidden');

        document.getElementById("headerTopicDisplay").textContent = `| ${topic}`;
        document.getElementById("profileNameDisplay").textContent = name;
        document.getElementById("profileAgeDisplay").textContent = age;
        document.getElementById("profileGenderDisplay").textContent = gender;
        
        // 프로필 카드에 dataset 설정 (프롬프트에서 사용)
        const profileCard = document.querySelector('.user-profile-card');
        if (profileCard) {
            profileCard.dataset.name = name;
            profileCard.dataset.gender = gender;
            profileCard.dataset.age = age;
        }

        if (questions.length > 0) {
            document.getElementById("prepQuestionList").innerHTML = questions.map(q => `
                <div class="question-item" onclick="appendQuestionToInput('${q.replace(/'/g, "\\'").trim()}')">
                    <i class="fas fa-comment-alt"></i>
                    <span class="question-text">${q}</span>
                </div>
            `).join('');
        }
        
        // 입력 정보 표시
        updateInputInfoSummary();

        // [3] 자동 생성 시작
        sceneCommitted = true;
        startLoading();
        updatePanoramaBtnState(false); // 생성 전 버튼 비활성화
        
        try {
            // ① 내러티브 생성
            const result = await generateNarrativeWithAI();
            currentNarrative = result.narrative; 
            if (narrativeTextEl) narrativeTextEl.innerHTML = currentNarrative;

            // ② 이미지 생성
            currentPrompt = buildBasePrompt(currentNarrative);
            const imgRes = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: currentPrompt }] }],
                generationConfig: { imageConfig: { aspectRatio: "16:9" }, responseModalities: ["image"] },
            });
            const imgData = imgRes.response.candidates[0].content.parts[0].inlineData;
            const newImgSrc = `data:${imgData.mimeType};base64,${imgData.data}`;
            if (geminiImg) geminiImg.src = newImgSrc;

            // ③ 파노라마 생성 및 버튼 활성화
            let panoramaSrc = null;
            try {
                panoramaSrc = await generatePanoramaImage();
                if (panoramaSrc) {
                    updatePanoramaBtnState(true); // 성공 시 활성화
                    currentPanoramaImgSrc = panoramaSrc; // 전역 변수에 저장
                }
            } catch (e) { console.warn("파노라마 생성 실패", e); }

            // ④ 후속 작업 (히스토리 저장 및 심층 질문)
            sceneHistory.push({
                id: Date.now(),
                time: new Date().toLocaleString("ko-KR", { hour12: false }),
                imgSrc: newImgSrc,
                panoramaImgSrc: panoramaSrc,
                narrativeHtml: currentNarrative,
                narrativeText: currentNarrative,
                prompt: currentPrompt,
                keyEmotions: currentKeyEmotions,
                atmosphere: currentAtmosphere,
                keyElements: currentKeyElements,
                sceneNumber: currentSceneNumber,
                variationNumber: currentVariationNumber,
            });
            
            // 초기 응답 로그 기록
            interactionLog.push({
                type: 'initial_response',
                timestamp: new Date().toLocaleString("ko-KR", { hour12: false }),
                narrative: currentNarrative,
                keyEmotions: [...currentKeyEmotions],
                atmosphere: [...currentAtmosphere],
                keyElements: [...currentKeyElements],
            });
            
            renderHistorySidebar();
            
            await generateDeepQuestions(currentNarrative);
            displayKeywords();
            
            // ⑤ 동기화
            setTimeout(() => { syncToRespondent(panoramaSrc); }, 1000);
            
            document.getElementById('imageCard').classList.add("has-image");
        } catch (error) {
            console.error("초기 생성 오류:", error);
        } finally {
            stopLoading();
        }
    });
}

function updatePanoramaBtnState(isReady) {
    const expandBtn = document.getElementById("expandBtn");
    if (!expandBtn) return;

    if (isReady) {
        expandBtn.disabled = false;
        expandBtn.style.opacity = "1";
        expandBtn.style.cursor = "pointer";
        expandBtn.style.backgroundColor = "#1e293b"; // 이미지 수정 버튼과 같은 검은색 계열
        expandBtn.style.color = "#ffffff";
        expandBtn.style.filter = "none";
        expandBtn.classList.add("active"); 
    } else {
        expandBtn.disabled = true;
        expandBtn.style.opacity = "0.5";
        expandBtn.style.backgroundColor = "#94a3b8"; // 비활성화 시 회색
        expandBtn.style.cursor = "not-allowed";
        expandBtn.classList.remove("active");
    }
}

// ============================================
// 스토리보드 (최종 저장 및 리뷰) 기능 구현부
// ============================================
const storyboardSection = document.getElementById('storyboardSection');
const mainSection = document.getElementById('mainSection');
const timelineThumbnails = document.getElementById('timelineThumbnails');
const sbNarrative = document.getElementById('sbNarrative');
const sbQaLog = document.getElementById('sbQaLog');
const sbKeywords = document.getElementById('sbKeywords');
const sbSceneTitle = document.getElementById('sbSceneTitle');
const closeStoryboardBtn = document.getElementById('closeStoryboardBtn');

// 💡 HTML에 직접 추가한 버튼 가져오기 (동적 생성 코드 삭제됨)
const openStoryboardBtn = document.getElementById('openStoryboardBtn');

let sbPanoramaViewer = null;
let currentEditingSceneIndex = 0;

// [1] 스토리보드 열기 (최종 단계 진입)
if (openStoryboardBtn) {
    openStoryboardBtn.addEventListener('click', () => {
        if (sceneHistory.length === 0) {
            alert('아직 생성된 씬(Scene)이 없습니다. 인터뷰를 먼저 진행해주세요.');
            return;
        }
        
        // 최종 정리 화면으로 전환
        mainSection.style.display = 'none';
        storyboardSection.style.display = 'flex';
        
        renderTimeline();
        loadSceneToStoryboard(0); // 첫 번째 씬 로드
    });
}

// [2] 인터뷰 화면으로 돌아가기 (선택 사항: 닫기 버튼을 누를 경우)
if (closeStoryboardBtn) {
    closeStoryboardBtn.addEventListener('click', () => {
        storyboardSection.style.display = 'none';
        mainSection.style.display = 'grid'; 
        
        if (sbPanoramaViewer) {
            sbPanoramaViewer.destroy();
            sbPanoramaViewer = null;
        }
    });
}

// [3] 하단 타임라인 썸네일 렌더링
function renderTimeline() {
    timelineThumbnails.innerHTML = '';
    
    sceneHistory.forEach((scene, index) => {
        const thumb = document.createElement('div');
        thumb.className = `sb-thumbnail ${index === currentEditingSceneIndex ? 'active' : ''}`;
        thumb.onclick = () => loadSceneToStoryboard(index);
        
        const imgSrc = scene.panoramaImgSrc || scene.imgSrc || '';
        thumb.innerHTML = `
            <img src="${imgSrc}" alt="Scene ${index + 1}">
            <div class="sb-thumb-label">Scene ${index + 1}</div>
        `;
        timelineThumbnails.appendChild(thumb);
    });
}

// [4] 특정 씬의 데이터를 화면에 로드
function loadSceneToStoryboard(index) {
    currentEditingSceneIndex = index;
    const scene = sceneHistory[index];
    
    document.querySelectorAll('.sb-thumbnail').forEach((el, i) => {
        el.classList.toggle('active', i === index);
    });

    sbSceneTitle.textContent = `Scene ${index + 1}`;
    sbNarrative.value = scene.narrativeText || '';

    sbKeywords.innerHTML = '';
    const allKeywords = [...(scene.keyEmotions || []), ...(scene.atmosphere || []), ...(scene.keyElements || [])];
    allKeywords.forEach(kw => {
        const span = document.createElement('span');
        span.className = 'keyword-tag atmosphere-tag';
        span.textContent = kw;
        sbKeywords.appendChild(span);
    });

    // 질의응답 로그 매칭
    const relatedLog = interactionLog.find(log => log.type === 'question_answer' && log.narrative === scene.narrativeText);
    if (relatedLog) {
        sbQaLog.innerHTML = `
            <p><strong>Q.</strong> ${relatedLog.question}</p>
            <p style="margin-top: 8px; color:#5b6df5;"><strong>A.</strong> ${relatedLog.answer}</p>
        `;
    } else {
        sbQaLog.innerHTML = '<p class="info-placeholder">이 씬에서 진행된 추가 질의응답이 없습니다.</p>';
    }

    // 파노라마 뷰어 렌더링
    if (sbPanoramaViewer) sbPanoramaViewer.destroy();
    
    if (scene.panoramaImgSrc) {
        sbPanoramaViewer = pannellum.viewer('storyboardViewer', {
            "type": "equirectangular",
            "panorama": scene.panoramaImgSrc,
            "autoLoad": true,
            "showControls": true
        });
    } else {
        document.getElementById('storyboardViewer').innerHTML = '<div style="color:white; padding: 40px; text-align:center;">파노라마 이미지가 생성되지 않은 씬입니다.</div>';
    }
}

// [5] 텍스트 수정 시 실시간 반영
sbNarrative.addEventListener('input', (e) => {
    if(sceneHistory[currentEditingSceneIndex]) {
        sceneHistory[currentEditingSceneIndex].narrativeText = e.target.value;
    }
});