import { GoogleGenerativeAI, SchemaType } from "https://esm.run/@google/generative-ai";

// API 키 가져오기 또는 입력받기
console.log('API 키 초기화 시작...');
let apiKey = sessionStorage.getItem('gemini_api_key');
console.log('저장된 API 키:', apiKey ? '존재함' : '없음');

if (!apiKey) {
    console.log('API 키 입력 요청 중...');
    apiKey = prompt('Gemini API 키를 입력해주세요');
    if (apiKey && apiKey.trim()) {
        sessionStorage.setItem('gemini_api_key', apiKey.trim());
    } else {
        alert('API 키를 입력해주세요.');
    }
}

// API 초기화
const genAI = new GoogleGenerativeAI(apiKey || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" }); // 이미지 생성용 모델
const textModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // 텍스트 생성용 모델

console.log('Gemini API 초기화 완료');

let respondentWindow = null; // 응답자 화면 윈도우 객체

// 응답자 화면 탭에 파노라마 데이터 전송 (연동)
function syncToRespondent(panoramaSrc) {
    if (respondentWindow && !respondentWindow.closed) {
        try {
            const tags = [...currentKeyEmotions, ...currentAtmosphere, ...currentKeyElements].map(t => `#${t}`);
            const questionToDisplay = currentSelectedQuestion || "응답을 기다리고 있습니다...";
            
            // 💡 [수정] 직접 함수 호출 대신 postMessage를 사용하여 안정적으로 데이터 전달
            respondentWindow.postMessage({
                type: 'syncAll',
                narrative: currentNarrative,
                question: questionToDisplay,
                parameters: tags,
                panoramaSrc: panoramaSrc
            }, '*');
            
            console.log("응답자 화면 동기화 완료");
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

// 시나리오 입력 (5W1H)
const sceneWhoInput = document.getElementById("sceneWhoInput"); // 누가
const sceneWhatInput = document.getElementById("sceneWhatInput"); // 무엇을
const sceneWhenInput = document.getElementById("sceneWhenInput"); // 언제
const sceneWhereInput = document.getElementById("sceneWhereInput"); // 어디서
const sceneWhyInput = document.getElementById("sceneWhyInput"); // 왜
const sceneHowInput = document.getElementById("sceneHowInput"); // 어떻게
const sceneCommitBtn = document.getElementById("sceneCommitBtn"); // 장면 만들기 버튼

// UI 컨트롤
const imageCard = document.getElementById("imageCard"); // 이미지 카드 컨테이너
const narrativeTextEl = document.getElementById("narrativeText"); // 내러티브 텍스트 표시
const sceneGenerateBtn = document.getElementById("sceneGenerateBtn"); // 생성하기 버튼
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
const selectedQuestionLabel = document.getElementById("selectedQuestionLabel");
const replyInput = document.getElementById("replyInput");
const replySubmitBtn = document.getElementById("replySubmitBtn");
const panoramaNarrativeText = document.getElementById("panoramaNarrativeText");

let currentSelectedQuestion = "";

// 맥락 파라미터
const sliders = document.querySelectorAll(".slider"); // 맥락 파라미터 슬라이더

// 히스토리
const historyToggleBtn = document.getElementById("historyToggleBtn"); // 히스토리 패널 토글
const historyListEl = document.getElementById("historyList"); // 히스토리 목록 컨테이너
const historyEmptyEl = document.getElementById("historyEmpty"); // 히스토리 없음 메시지

// 전역 상태
let sceneCommitted = false; // 장면이 커밋되었는지 여부
let sceneHistory = []; // 장면 히스토리: [{id, time, imgSrc, panoramaImgSrc, narrativeHtml, narrativeText, prompt, keyEmotions, keyElements}]
let isRestoring = false; // 히스토리에서 복원 중인지 여부
let currentNarrative = ""; // 현재 생성된 내러티브
let currentPrompt = ""; // 현재 생성에 사용된 프롬프트
let currentKeyEmotions = []; // 현재 주요 감정
let currentAtmosphere = []; // 현재 분위기 키워드
let currentKeyElements = []; // 현재 핵심 요소
let panoramaViewer = null; // Pannellum 뷰어 인스턴스

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
캐릭터: ${name}, ${age} ${gender} 캐릭터입니다. 갈색의 짧고 단정한 머리, 동그란 갈색 테 안경을 쓰고 있습니다. 회색의 짜임이 있는 니트 스웨터와 갈색 바지를 입고 있습니다.
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

    // API 호출
    console.log('====== 이미지 생성 프롬프트 ======');
    console.log(parts[0].text || '(이미지 포함)');
    console.log('===================================');
    
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

    // 내러티브 스키마 정의
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
당신은 UX 리서치 맥락에서 인터뷰 대상자의 기본 프로필과 리서치 주제만을 바탕으로, 심층 인터뷰의 출발점이 될 '초기 상황(Baseline Scene)' 내러티브를 생생하게 구성하는 전문가입니다.

# BACKGROUND
대상자가 해당 경험에 막 진입하는 첫 순간을 구체적인 장면으로 묘사하여, 대상자가 당시의 기억을 쉽게 떠올릴 수 있도록 돕습니다. 대상자의 성향(특이사항)을 반영하여 '가장 개연성 있는 가설적 상황'을 구성하세요.

# CONTEXT
## 캐릭터 정보
- 이름: ${name}
- 성별: ${gender}
- 나이대: ${age}
- 특이사항: ${prepNotes}

# INPUT DATA
## 리서치 정보
- 인터뷰 주제: ${topic}
- 탐색 방향(사전 질문): ${questions} (이 질문들로 대화가 이어질 수 있는 초기 상황을 세팅하세요)

# OUTPUT DIRECTIVES
1. narrative: 5-8문장으로 구성된 자연스러운 1인칭 스토리. 대상자가 '인터뷰 주제' 상황에 처음 마주한 순간의 행동과 심리를 '특이사항'에 맞게 구체적으로 묘사.
2. key_emotions: 주요 감정 3-5개
3. atmosphere: 분위기 키워드 3-5개
4. key_elements: 중요한 시각적/맥락적 요소 3-5개

# TONE
생생하고 공감적인 톤. 과장되지 않게 일상적이고 자연스럽게 묘사.
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

// 슬라이더 값을 레이블로 변환 (3단계: 0=낮음, 1=보통, 2=높음)
function labelForSlider(scale, value) {
    const v = Number(value);
    if (scale === "light") {
        if (v === 0) return "어두움";
        if (v === 1) return "보통";
        return "밝음";
    }
    if (scale === "people") {
        if (v === 0) return "한적함";
        if (v === 1) return "보통";
        return "붐빔";
    }
    if (scale === "distance") {
        if (v === 0) return "클로즈업";
        if (v === 1) return "중간";
        return "원경";
    }
    return "";
}

// 슬라이더 레이블 초기화 및 이벤트 바인딩
function setupSliderLabels() {
    sliders.forEach((slider) => {
        const row = slider.closest(".adjuster-row");
        const label = row?.querySelector(".value-label");
        const scale = slider.dataset.scale;
        if (!label || !scale) return;
        const apply = () => {
            label.textContent = labelForSlider(scale, slider.value);
        };
        slider.addEventListener("input", apply);
        apply();
    });
}

// 카메라 각도 결정 (거리 슬라이더 기반: 0=클로즈업, 1=중간, 2=원경)
function getCameraAngle() {
    const distanceSlider = Array.from(sliders).find(s => s.dataset.scale === "distance");
    if (!distanceSlider) return "Medium Shot";
    const v = Number(distanceSlider.value);
    if (v === 0) return "Close-Up Shot";
    if (v === 1) return "Medium Shot";
    return "Wide Shot";
}

// 맥락 요약 생성 (슬라이더 값들을 자연어로 변환)
function buildContextSummary() {
    let summaryParts = [];
    sliders.forEach((slider) => {
        const scale = slider.dataset.scale;
        const v = Number(slider.value);
        if (scale === "light") {
            if (v === 0) summaryParts.push("조명이 어둡고 차분한 분위기");
            else if (v === 1) summaryParts.push("자연스러운 일상 조명");
            else summaryParts.push("밝고 화사한 조명");
        } else if (scale === "people") {
            if (v === 0) summaryParts.push("주변에 사람이 거의 없는 한적한 분위기");
            else if (v === 1) summaryParts.push("일상적인 수준의 인파");
            else summaryParts.push("사람들로 붐비는 활기찬 분위기");
        }
    });
    return summaryParts.join(", ");
}

// 기본 프롬프트 생성 (내러티브 기반)
function buildBasePrompt(narrativeText) {
    const contextSummary = buildContextSummary();
    const cameraAngle = getCameraAngle();
    
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
Camera Angle: ${cameraAngle}
- Close-Up Shot: Focus on character's face and upper body, capture detailed facial expressions and emotions
- Medium Shot: Show character from waist up with surrounding context visible
- Wide Shot: Full body view with complete environment, show spatial relationships and overall scene

## Environmental Context
${contextSummary}

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



// 맥락 파라미터 자동 조절 (AI 기반)
async function adjustContextParameters(narrativeText) {
    if (!narrativeText) return;
    
    // 맥락 파라미터 스키마 정의
    const schema = {
        description: "Contextual parameters for scene generation",
        type: SchemaType.OBJECT,
        properties: {
            light: {
                type: SchemaType.INTEGER,
                description: "Lighting/atmosphere level: 0=dark, 1=normal, 2=bright",
                nullable: false,
            },
            people: {
                type: SchemaType.INTEGER,
                description: "Crowd density: 0=empty, 1=normal, 2=crowded",
                nullable: false,
            },
            distance: {
                type: SchemaType.INTEGER,
                description: "Camera distance: 0=close-up, 1=medium, 2=wide",
                nullable: false,
            }
        },
        required: ["light", "people", "distance"],
    };
    
    const prompt = `# ROLE
당신은 시각적 장면 분석 전문가입니다. 텍스트 내러티브를 분석하여 적절한 시각적 맥락 파라미터를 추천하는 능력을 가지고 있습니다.

# TASK
제공된 장면 내러티브를 분석하여, 이미지 생성에 필요한 3가지 맥락 파라미터의 최적값을 결정하세요.

# INPUT: NARRATIVE
${narrativeText}

# OUTPUT DIRECTIVES
다음 3가지 파라미터의 값을 0, 1, 2 중에서 선택하여 JSON 형식으로 반환하세요:

1. light (분위기): 0=어두움, 1=보통, 2=밝음
2. people (밀도): 0=한적함, 1=보통, 2=붐빔
3. distance (거리): 0=클로즈업, 1=중간, 2=원경`;

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
        
        // JSON 파싱 (스키마를 사용했으므로 이미 JSON 형식)
        const params = JSON.parse(text);
        
        console.log('====== 파싱된 파라미터 ======');
        console.log(params);
        
        // 슬라이더 값 업데이트
        sliders.forEach((slider) => {
            const scale = slider.dataset.scale;
            if (params[scale] !== undefined) {
                slider.value = params[scale];
                // 레이블도 업데이트
                const row = slider.closest(".adjuster-row");
                const label = row?.querySelector(".value-label");
                if (label) {
                    label.textContent = labelForSlider(scale, params[scale]);
                }
            }
        });
        
        console.log('맥락 파라미터가 자동으로 조절되었습니다.');
    } catch (error) {
        console.error("맥락 파라미터 자동 조절 실패:", error);
    }
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
        text.textContent = entry.narrativeText;

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
    respondentWindow.postMessage({ type: 'toggleLoading', value: true }, '*'); // 종료 시 false
}
    imageCard.classList.remove("is-loading");
    
    syncLoadingToRespondent(false);

    if (sceneCommitBtn) {
        sceneCommitBtn.disabled = false;
        sceneCommitBtn.classList.remove('loading');
        sceneCommitBtn.textContent = '장면 만들기';
    }
}

// 비주얼 모드로 전환 (이미지가 생성된 상태)
function ensureVisualMode() {
    if (!imageCard) return;
    imageCard.classList.add("has-image");
}

// Gemini API 호출 트리거
function triggerGeminiGenerate() {
    if (!geminiBtn) return;
    startLoading();
    geminiBtn.click();
}

// 새 이미지 로드 완료 시 처리
function onNewImageLoaded() {
    if (isRestoring) {
        stopLoading();
        ensureVisualMode();
        return;
    }

    ensureVisualMode();

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

    const who = sceneWhoInput?.value.trim();
    const what = sceneWhatInput?.value.trim();
    const when = sceneWhenInput?.value.trim();
    const where = sceneWhereInput?.value.trim();
    const why = sceneWhyInput?.value.trim();
    const how = sceneHowInput?.value.trim();

    if (!who && !what && !when && !where && !why && !how) {
        inputSummary.innerHTML = '<p class="info-placeholder">장면을 생성하면 입력한 정보가 여기에 표시됩니다.</p>';
        return;
    }

    let html = '';
    if (when) html += `<div class="info-row"><span class="label">언제:</span><span>${when}</span></div>`;
    if (where) html += `<div class="info-row"><span class="label">어디서:</span><span>${where}</span></div>`;
    if (who) html += `<div class="info-row"><span class="label">누가:</span><span>${who}</span></div>`;
    if (what) html += `<div class="info-row"><span class="label">무엇을:</span><span>${what}</span></div>`;
    if (why) html += `<div class="info-row"><span class="label">왜:</span><span>${why}</span></div>`;
    if (how) html += `<div class="info-row"><span class="label">어떻게:</span><span>${how}</span></div>`;

    inputSummary.innerHTML = html;
}

// ============================================
// ============================================

// 슬라이더 레이블 초기화
setupSliderLabels();

// 이미지 로드 완료 시 자동 처리
if (geminiImg) {
    geminiImg.addEventListener("load", onNewImageLoaded);
}

// 360도 파노라마 실사 이미지 생성
async function generatePanoramaImage() {
    if (!currentNarrative) {
        throw new Error('현재 내러티브가 없습니다.');
    }
    
    const where = sceneWhereInput?.value.trim() || '장소';
    
    const panoramaPrompt = `# ROLE
You are an expert photographer specializing in 360-degree equirectangular panoramic photography.

# TASK
Generate a photorealistic 360-degree equirectangular panorama of the environment described below. This must be in the exact equirectangular projection format (2:1 aspect ratio) suitable for 360-degree immersive viewing.

# SCENE CONTEXT
Location: ${where}
Situation: ${currentNarrative}

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

# CONTENT REQUIREMENTS
- **NO CHARACTERS OR PEOPLE**: Show only the environment, architecture, and objects
- Include: Buildings, furniture, fixtures, ambient elements, spatial context
- Exclude: Any human figures, characters, or representations of people
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
Photorealistic, immersive, and architecturally accurate. Focus on the spatial experience and environmental ambiance. Prioritize seamless edge continuity for proper 360° viewing.`;

    console.log('══════ 파노라마 이미지 생성 프롬프트 ══════');
    console.log(panoramaPrompt);
    console.log('═══════════════════════════════');
    
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
async function updateNarrativeWithModification(userModification) {
    if (!currentNarrative || !userModification) {
        throw new Error('현재 내러티브나 수정 요청이 없습니다.');
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

# TASK
기존 내러티브에 사용자의 수정 요청을 반영하여 새로운 내러티브를 작성하세요. 수정된 부분을 자연스럽게 통합하여 일관된 이야기를 만드세요.

# CONTEXT
## 현재 내러티브
${currentNarrative}

## 사용자 수정 요청
${userModification}

# OUTPUT DIRECTIVES
1. narrative (string): 5-8문장의 업데이트된 내러티브
   - 기존 내러티브의 흥름을 유지하면서 수정 사항을 반영
   - 자연스럽고 일관된 흐름 유지
   - 구체적이고 감각적인 묘사

2. key_emotions (array): 업데이트된 장면의 주요 감정 3-5개
3. atmosphere (array): 업데이트된 분위기 키워드 3-5개
4. key_elements (array): 업데이트된 핵심 요소 3-5개

# TONE
사실적이고 공감적이며, 사용자의 수정 의도를 정확하게 반영한 톤을 유지하세요.`;

    console.log('══════ 내러티브 업데이트 프롬프트 ══════');
    console.log(prompt);
    console.log('═════════════════════════');

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
        
        console.log('══════ 업데이트된 내러티브 데이터 ══════');
        console.log('내러티브:', narrativeData.narrative);
        console.log('주요 감정:', narrativeData.key_emotions);
        console.log('분위기:', narrativeData.atmosphere);
        console.log('핵심 요소:', narrativeData.key_elements);
        
        // 키워드 데이터 저장
        currentKeyEmotions = narrativeData.key_emotions || [];
        currentAtmosphere = narrativeData.atmosphere || [];
        currentKeyElements = narrativeData.key_elements || [];
        
        // 키워드 패널에 표시
        displayKeywords();
        
        return {
            narrative: narrativeData.narrative,
            keyEmotions: currentKeyEmotions,
            atmosphere: currentAtmosphere,
            keyElements: currentKeyElements
        };
    } catch (error) {
        console.error("내러티브 업데이트 실패:", error);
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
    
    const contextSummary = buildContextSummary();
    const cameraAngle = getCameraAngle();
    
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
Camera Angle: ${cameraAngle}
- Maintain the same camera angle and composition as the original image
- Apply modifications while preserving the overall scene structure

## Environmental Context
${contextSummary}

## Modification Guidelines
1. Keep the character's appearance and position consistent with the original
2. Apply the requested modifications naturally and seamlessly
3. Maintain the 3D cartoon aesthetic and warm atmosphere
4. Ensure visual coherence between original and modified elements
5. Preserve the emotional tone described in the narrative

# TONE
The modified image should feel like a natural evolution of the original scene, with the requested changes integrated smoothly and authentically.`;
    
    console.log('══════ 이미지 수정 프롬프트 ══════');
    console.log(modificationPrompt);
    console.log('══════════════════════');
    
    // 현재 프롬프트 저장
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
if (sceneCommitBtn) {
    sceneCommitBtn.addEventListener("click", async () => {
        if (sceneCommitBtn.disabled) return;
        
        sceneCommitBtn.disabled = true;
        sceneCommitBtn.classList.add('loading');
        sceneCommitBtn.textContent = '생성 중';
        
        sceneCommitted = true;
        updateInputInfoSummary();

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
                console.error("내러티브 생성 중 오류:", error);
                currentNarrative = "";
            }
        }

        if (geminiInput) {
            const basePrompt = buildBasePrompt(currentNarrative);
            geminiInput.value = basePrompt;
        }

        triggerGeminiGenerate();
        
        // 맥락 파라미터 자동 조절
        await adjustContextParameters(currentNarrative);
    });
}

// 심층 질문 3개 생성
async function generateDeepQuestions(narrative) {
    const questionListEl = document.getElementById('aiQuestionList');
    if (!questionListEl) return;

    // 심층 질문 생성을 위한 프롬프트 설계
    const prompt = `
# ROLE
당신은 질적 연구에서 심층면담(in-depth interview)과 사진유도면담을 수행하는 UX 리서치 보조 인터뷰어입니다. 당신의 목표는 사용자가 이미 말한 내용과 사용자의 경험을 재현한 장면을 바탕으로, 그 경험의 맥락, 감정, 의미를 더 깊게 탐색할 수 있는 열린 질문을 생성하는 것입니다.

# BACKGROUND
질적 연구에서 심층면담은, 참여자의 경험을 따라가며 후속 질문을 던지는 순환적 과정입니다. 좋은 후속 질문은 연구자의 해석을 강요하지 않고, 참여자가 자신의 말과 경험을 스스로 확장하고 해석하도록 돕는 것입니다.

심층 질문은 특히 다음 네 축을 균형 있게 다룰 때 효과적입니다.
1) 상황(Context): 시간, 장소, 동반자, 주변 환경
2) 행동(Action): 사용자의 구체적인 행동 순서 및 선택
3) 감정/생각(Emotion/Cognition): 당시 느낀 감정, 생각, 기대·불안
4) 의미/결과(Meaning/Outcome): 그 경험이 이후 행동과 태도에 준 영향, 기억에 남는 이유

네 축을 직접적으로 언급하기보다는 사용자가 자신의 경험을 더욱 풍부하게 설명할 수 있도록 유도하는 질문이 필요합니다.

# TASK
<제공된 사용자의 내러티브를 분석하여, 사용자의 경험 속 심층적인 페인 포인트(Pain Points), 감정의 변화, 물리적/심리적 장애물을 파악하기 위한 '심층 질문' 3개를 생성하세요.>

# NARRATIVE
"${narrative}"

# QUESTION GUIDELINES
1. 질문은 항상 열린 질문(open-ended question)이어야 합니다. "예/아니오"로 끝날 수 있는 질문은 작성하지 않습니다. 참여자를 평가하거나 정답을 요구하는 뉘앙스(“정말 그랬나요?”, “그게 맞나요?” 등)는 피합니다.
2. 사용자가 실제로 쓴 핵심 표현(예: “당혹스러웠다”, “기다림이 길게 느껴졌다”)을 질문 안에 인용합니다. 예시로 사용자가 "조금 당혹스러웠다"고 했다면, "어떤 점이 가장 당혹스럽게 느껴졌나요?"처럼 질문합니다. 이는 필수적이지는 않지만, 사용자가 자신의 경험을 더 깊이 탐색하도록 돕는 효과적인 방법입니다.
3. 매 턴마다 상황, 행동, 감정/생각, 의미/결과 네 축 중 가장 덜 채워진 축을 첫 질문으로 한 가지 반드시 포함시킵니다. 예를 들어, 사용자가 자신의 행동과 감정에 대해서는 많이 설명했지만, 상황과 의미에 대해서는 덜 언급했다면, 첫 질문은 상황이나 의미에 대한 것이어야 합니다.

# OUTPUT FORMAT
- 다른 설명 없이 3개의 질문 리스트만 번호 없이 한 줄씩 출력하세요.
`;

    try {
        const result = await model.generateContent(prompt);
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
            sceneCommitBtn?.click();
            return;
        }

        const answer = replyInput.value.trim();
        if (!answer) {
            alert('답변을 입력해주세요.');
            return;
        }
        
        try {
            // [1] 생성 시작: 전체 로딩 켜기 & 파노라마 버튼 비활성화
            startLoading();
            updatePanoramaBtnState(false); 

            // [2] 내러티브 업데이트 (AI 호출)
            const contextData = `질문: ${currentSelectedQuestion}\n답변: ${answer}\n이 답변의 심리적, 상황적 맥락을 반영하여 기존 내러티브를 업데이트해줘.`;
            const updatedNarrativeData = await updateNarrativeWithModification(contextData);
            
            // 💡 중요: 전역 변수에 즉시 할당 (에러 방지)
            currentNarrative = updatedNarrativeData.narrative;
            
            if (narrativeTextEl) {
                narrativeTextEl.innerHTML = currentNarrative;
            }
            
            // [3] 메인 이미지 수정
            const currentImageSrc = geminiImg?.src;
            if (!currentImageSrc) throw new Error('현재 이미지가 없습니다.');
            
            const modifiedImageSrc = await modifyImageWithInput(
                currentImageSrc, 
                "사용자의 답변에 따라 새롭게 업데이트된 상황과 감정 변화를 반영하여 이미지를 자연스럽게 다시 그려줘.", 
                currentNarrative
            );
            if (geminiImg) geminiImg.src = modifiedImageSrc;

            // [4] 파노라마 생성 (currentNarrative가 설정된 후 호출)
            let newPanoramaSrc = null;
            try {
                // 💡 생성 중임을 알리는 '파노라마 전용 로딩'은 generatePanoramaImage 내부에서 제어됨
                newPanoramaSrc = await generatePanoramaImage(); 
                
                // ✅ 파노라마 로드 완료 후 버튼 상태 업데이트 (색상 및 활성화)
                if (newPanoramaSrc) {
                    updatePanoramaBtnState(true); 
                    // 관리자 화면의 전역 변수에도 소스 저장 (전체화면 열기용)
                    currentPanoramaImgSrc = newPanoramaSrc; 
                }
            } catch (pError) {
                console.warn("파노라마 생성 실패:", pError);
                updatePanoramaBtnState(false);
            }

            // [5] 심층 질문 생성 (이 작업이 완료될 때까지 로딩 스피너 유지)
            await generateDeepQuestions(currentNarrative);

            // [6] 히스토리 저장
            const newSceneEntry = {
                id: Date.now(),
                time: new Date().toLocaleString("ko-KR", { hour12: false }),
                imgSrc: modifiedImageSrc,
                panoramaImgSrc: newPanoramaSrc,
                narrativeHtml: currentNarrative,
                narrativeText: currentNarrative,
                prompt: currentPrompt || "",
                keyEmotions: [...currentKeyEmotions],
                atmosphere: [...currentAtmosphere],
                keyElements: [...currentKeyElements],
            };
            sceneHistory.push(newSceneEntry);
            renderHistorySidebar(); 

            // [7] 응답자 화면 동기화
            if (respondentWindow && !respondentWindow.closed) {
                const tags = [...currentKeyEmotions, ...currentAtmosphere, ...currentKeyElements].map(t => `#${t}`);
                respondentWindow.postMessage({
                    type: 'syncAll',
                    narrative: currentNarrative,
                    question: currentSelectedQuestion,
                    parameters: tags,
                    panoramaSrc: newPanoramaSrc
                }, '*');
            }

            // [8] 기타 UI 정리
            await adjustContextParameters(currentNarrative);
            replyInput.value = '';
            currentSelectedQuestion = ""; // 💡 [추가] 다음 턴을 위해 선택한 질문 초기화
            if (questionReplyArea) {
                questionReplyArea.classList.add('disabled');
                document.querySelectorAll('.question-item').forEach(el => el.classList.remove('selected'));
            }
            
        } catch (error) {
            console.error('장면 진화 오류:', error);
            alert('장면을 업데이트하는 중 오류가 발생했습니다.');
            updatePanoramaBtnState(false);
        } finally {
            // [9] 모든 프로세스(이미지+파노라마+질문) 종료 후 로딩 끄기
            stopLoading(); 
        }
    });
}

// ============================================
// 2. 이미지 리믹스 제출 (내러티브 고정 + 시각적 요소만 수정)
// ============================================
if (remixSubmitBtn) {
    remixSubmitBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!sceneCommitted) {
            sceneCommitBtn?.click();
            return;
        }
        
        const request = remixInput.value.trim();
        const modificationCommand = request ? request : "현재 설정된 맥락 파라미터(분위기, 밀도, 거리)에 맞춰서 이미지를 조절해줘.";
        
        try {
            startLoading();
            
            // 내러티브는 건드리지 않고, 이미지만 수정
            const currentImageSrc = geminiImg?.src;
            if (!currentImageSrc) throw new Error('현재 이미지가 없습니다.');
            
            const modifiedImageSrc = await modifyImageWithInput(currentImageSrc, modificationCommand, currentNarrative);
            if (geminiImg) geminiImg.src = modifiedImageSrc;
            
            // UI 초기화
            remixInput.value = '';
            
        } catch (error) {
            console.error('이미지 리믹스 오류:', error);
            alert('이미지 수정 중 오류가 발생했습니다.');
        } finally {
            stopLoading();
        }
    });
}

// ============================================
// 3. 우측 사이드바(리믹스 패널) 토글
// ============================================
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
            
            // 각 장면을 폴더별로 저장
            for (let i = 0; i < sceneHistory.length; i++) {
                const scene = sceneHistory[i];
                const folderName = `scene_${i + 1}_${scene.time.replace(/[:/\s]/g, '-')}`;
                const folder = zip.folder(folderName);
                
                // 이미지 저장
                if (scene.imgSrc && scene.imgSrc.startsWith('data:')) {
                    const base64Data = scene.imgSrc.split(',')[1];
                    folder.file('image.png', base64Data, { base64: true });
                }
                
                // 파노라마 이미지 저장
                if (scene.panoramaImgSrc && scene.panoramaImgSrc.startsWith('data:')) {
                    const panoramaBase64Data = scene.panoramaImgSrc.split(',')[1];
                    folder.file('panorama_360.png', panoramaBase64Data, { base64: true });
                }
                
                // 내러티브 저장
                folder.file('narrative.txt', scene.narrativeText || '내러티브 없음');
                
                // 프롬프트 저장
                folder.file('prompt.txt', scene.prompt || '프롬프트 정보 없음');
                
                // 키워드 저장
                if (scene.keyEmotions && scene.keyEmotions.length > 0) {
                    folder.file('key_emotions.txt', scene.keyEmotions.join('\n'));
                }
                if (scene.keyElements && scene.keyElements.length > 0) {
                    folder.file('key_elements.txt', scene.keyElements.join('\n'));
                }
                
                // 메타데이터 저장
                const metadata = {
                    id: scene.id,
                    time: scene.time,
                    narrativeHtml: scene.narrativeHtml,
                    narrativeText: scene.narrativeText,
                    keyEmotions: scene.keyEmotions || [],
                    atmosphere: scene.atmosphere || [],
                    keyElements: scene.keyElements || []
                };
                folder.file('metadata.json', JSON.stringify(metadata, null, 2));
            }
            
            // ZIP 생성 및 다운로드
            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `contextual_inquiry_${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            exportBtn.disabled = false;
            exportBtn.textContent = '내보내기';
            
            alert(`${sceneHistory.length}개의 장면이 성공적으로 내보내졌습니다.`);
        } catch (error) {
            console.error('내보내기 오류:', error);
            alert('내보내기 중 오류가 발생했습니다.');
            exportBtn.disabled = false;
            exportBtn.textContent = '내보내기';
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
        document.getElementById("mainTopicDisplay").textContent = `현재 주제: ${topic}`;
        document.getElementById("profileNameDisplay").textContent = name;
        document.getElementById("profileAgeDisplay").textContent = age;
        document.getElementById("profileGenderDisplay").textContent = gender;

        if (questions.length > 0) {
            document.getElementById("prepQuestionList").innerHTML = questions.map(q => `
                <div class="question-item" onclick="appendQuestionToInput('${q.replace(/'/g, "\\'").trim()}')">
                    <i class="fas fa-comment-alt"></i>
                    <span class="question-text">${q}</span>
                </div>
            `).join('');
        }

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
                if (panoramaSrc) updatePanoramaBtnState(true); // 성공 시 활성화
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
            });
            renderHistorySidebar();
            
            await generateDeepQuestions(currentNarrative);
            await adjustContextParameters(currentNarrative);
            
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