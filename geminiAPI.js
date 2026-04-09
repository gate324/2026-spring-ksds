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

let respondentWindow = null;

function syncToRespondent(panoramaSrc) {
    if (respondentWindow && !respondentWindow.closed) {
        try {
            const tags = [...currentKeyEmotions, ...currentAtmosphere, ...currentKeyElements].map(t => `#${t}`);
            const questionToDisplay = currentSelectedQuestion || "잠시만 기다려주세요. 질문을 준비하고 있습니다.";
            const cartoonImgEl = document.getElementById("geminiImg");
            const cartoonSrc = cartoonImgEl ? cartoonImgEl.src : "";
            
            respondentWindow.postMessage({
                type: 'syncAll',
                narrative: initialNarrative || currentNarrative,
                question: questionToDisplay,
                parameters: tags,
                panoramaSrc: panoramaSrc,
                cartoonSrc: cartoonSrc
            }, '*');
        } catch (e) {
            console.error("응답자 탭 동기화 실패:", e);
        }
    }
}

const geminiInput = document.getElementById("geminiInput");
const geminiBtn = document.getElementById("geminiBtn");
const geminiImg = document.getElementById("geminiImg");
const saveImgBtn = document.getElementById("SaveImg");

const imageCard = document.getElementById("imageCard");
const narrativeTextEl = document.getElementById("narrativeText");
const expandBtn = document.getElementById("expandBtn");
const panoramaFullscreen = document.getElementById("panoramaFullscreen");
const closeFullscreenBtn = document.getElementById("closeFullscreenBtn");
const panoramaLoading = document.getElementById("panoramaLoading");
const mainContainer = document.querySelector('main.container');
const remixToggleBtn = document.getElementById("remixToggleBtn");
const closeRightSidebarBtn = document.getElementById("closeRightSidebarBtn");
const remixSubmitBtn = document.getElementById("remixSubmitBtn");
const remixInput = document.getElementById("remixInput");

const questionReplyArea = document.getElementById("questionReplyArea");
const replyInput = document.getElementById("replyInput");
const replySubmitBtn = document.getElementById("replySubmitBtn");
const historyLogList = document.getElementById("historyLogList");

const historyToggleBtn = document.getElementById("historyToggleBtn");
const historyListEl = document.getElementById("historyList");
const historyEmptyEl = document.getElementById("historyEmpty");

let sceneCommitted = false;
let sceneHistory = [];
let isRestoring = false;
let initialNarrative = ""; 
let currentNarrative = "";
let currentPrompt = "";
let currentKeyEmotions = [];
let currentAtmosphere = [];
let currentKeyElements = [];
let panoramaViewer = null;
let currentPanoramaImgSrc = null;
let currentSceneNumber = 1;
let currentVariationNumber = 1;
let currentEditMode = 'remix';
let interactionLog = [];

let allInterviews = [];
let currentInterviewId = null;
let currentInterviewMeta = {};
let currentInterviewGoal = ""; 
let currentSelectedQuestion = "";

function resetGlobalState() {
    sceneCommitted = false;
    sceneHistory = [];
    interactionLog = [];
    initialNarrative = "";
    currentNarrative = "";
    currentPrompt = "";
    currentKeyEmotions = [];
    currentAtmosphere = [];
    currentKeyElements = [];
    currentPanoramaImgSrc = null;
    currentSceneNumber = 1;
    currentVariationNumber = 1;
    currentSelectedQuestion = "";
    currentInterviewGoal = "";
    
    if (geminiImg) geminiImg.src = "";
    if (narrativeTextEl) narrativeTextEl.innerHTML = "";
    const ic = document.getElementById('imageCard');
    if (ic) ic.classList.remove("has-image");
    const hl = document.getElementById('historyList');
    if (hl) hl.innerHTML = '<div class="history-empty" id="historyEmpty">아직 생성된 장면이 없습니다.</div>';
    
    const listEl = document.getElementById('aiQuestionsList');
    if (listEl) listEl.innerHTML = '<p class="placeholder">인터뷰를 시작하면 AI가 추천하는 질문들이 여기에 표시됩니다.</p>';
    const sendBtn = document.getElementById('sendQuestionBtn');
    if (sendBtn) sendBtn.disabled = true;

    const hll = document.getElementById('historyLogList');
    if (hll) hll.innerHTML = '<p class="empty-msg">기록된 답변이 없습니다.</p>';
}

function saveCurrentInterviewState() {
    if (!currentInterviewId) return;
    
    const existingIndex = allInterviews.findIndex(i => i.id === currentInterviewId);
    const interviewData = {
        id: currentInterviewId,
        date: new Date().toLocaleDateString('ko-KR'),
        meta: JSON.parse(JSON.stringify(currentInterviewMeta)),
        sceneHistory: JSON.parse(JSON.stringify(sceneHistory)), 
        interactionLog: [...interactionLog],
        initialNarrative, currentNarrative, currentPrompt, currentKeyEmotions, currentAtmosphere, currentKeyElements,
        currentPanoramaImgSrc, currentSceneNumber, currentVariationNumber,
        currentInterviewGoal
    };
    
    if (existingIndex >= 0) {
        allInterviews[existingIndex] = interviewData;
    } else {
        allInterviews.push(interviewData);
    }
    renderHomeInterviewList();
}

function renderHomeInterviewList() {
    const historyContainer = document.querySelector('.home-section .history-list');
    if (!historyContainer) return;
    
    if (allInterviews.length === 0) {
        historyContainer.classList.add('home-empty');
        historyContainer.innerHTML = `
            <i class="fas fa-folder-open"></i>
            <p>아직 저장된 인터뷰가 없습니다. 새 인터뷰를 생성해보세요.</p>
        `;
        return;
    }
    
    historyContainer.classList.remove('home-empty');
    historyContainer.innerHTML = '<div class="interview-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:20px; width:100%;"></div>';
    const grid = historyContainer.querySelector('.interview-grid');
    
    allInterviews.slice().reverse().forEach(interview => {
        const card = document.createElement('div');
        card.className = 'interview-card';
        const thumbSrc = (interview.sceneHistory && interview.sceneHistory.length > 0 && interview.sceneHistory[0].imgSrc) ? interview.sceneHistory[0].imgSrc : '';
        
        card.innerHTML = `
            <div style="height:160px; background:#f1f5f9; overflow:hidden;">
                ${thumbSrc ? `<img src="${thumbSrc}" style="width:100%; height:100%; object-fit:cover;">` : '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#94a3b8;"><i class="fas fa-image fa-2x"></i></div>'}
            </div>
            <div style="padding:16px;">
                <div style="font-size:12px; color:#64748b; margin-bottom:4px;">${interview.date}</div>
                <h3 style="font-size:16px; font-weight:700; color:#1e293b; margin-bottom:8px;">${interview.meta.topic || '주제 없음'}</h3>
                <div style="font-size:13px; color:#475569;">${interview.meta.name || '응답자'} (${interview.meta.gender || '미상'}, ${interview.meta.age || '미상'})</div>
            </div>
        `;
        
        card.onclick = () => loadInterview(interview.id);
        grid.appendChild(card);
    });
}

function loadInterview(id) {
    const interview = allInterviews.find(i => i.id === id);
    if (!interview) return;
    
    currentInterviewId = interview.id;
    currentInterviewMeta = JSON.parse(JSON.stringify(interview.meta));
    sceneHistory = JSON.parse(JSON.stringify(interview.sceneHistory));
    interactionLog = JSON.parse(JSON.stringify(interview.interactionLog));
    initialNarrative = interview.initialNarrative || interview.currentNarrative || "";
    currentNarrative = interview.currentNarrative || "";
    currentPrompt = interview.currentPrompt || "";
    currentKeyEmotions = [...(interview.currentKeyEmotions || [])];
    currentAtmosphere = [...(interview.currentAtmosphere || [])];
    currentKeyElements = [...(interview.currentKeyElements || [])];
    currentPanoramaImgSrc = interview.currentPanoramaImgSrc || null;
    currentSceneNumber = interview.currentSceneNumber || 1;
    currentVariationNumber = interview.currentVariationNumber || 1;
    currentInterviewGoal = interview.currentInterviewGoal || "";
    sceneCommitted = true;
    
    document.getElementById("headerTopicDisplay").textContent = `| ${currentInterviewMeta.topic}`;
    document.getElementById("profileNameDisplay").textContent = currentInterviewMeta.name;
    document.getElementById("profileAgeDisplay").textContent = currentInterviewMeta.age;
    document.getElementById("profileGenderDisplay").textContent = currentInterviewMeta.gender;
    
    if (narrativeTextEl) narrativeTextEl.innerHTML = currentNarrative;
    if (geminiImg && sceneHistory.length > 0) {
        geminiImg.src = sceneHistory[sceneHistory.length - 1].imgSrc; 
        document.getElementById('imageCard').classList.add("has-image");
    }
    
    displayKeywords();
    renderHistorySidebar();
    
    document.getElementById('homeSection').style.display = 'none';
    document.getElementById('mainSection').style.display = 'grid'; 
    document.getElementById('headerRightArea').classList.remove('is-hidden');
}

document.getElementById('logoBtn')?.addEventListener('click', () => {
    document.getElementById('mainSection').style.display = 'none';
    document.getElementById('homeSection').style.display = 'block';
    document.getElementById('headerRightArea').classList.add('is-hidden'); 
    document.getElementById('headerTopicDisplay').textContent = '';
    renderHomeInterviewList();
});

const PROMPT_STYLE = {
    getFixedElements: () => {
        const profileCard = document.querySelector('.user-profile-card');
        const name = profileCard?.dataset.name || '인물';
        const gender = profileCard?.dataset.gender || '남성';
        const age = profileCard?.dataset.age || '20대';
        
        return `
스타일: 따뜻하고 부드러운 조명의 미니어쳐 3D 카툰 렌더링 스타일입니다. 클레이 애니메이션처럼 부드러운 질감과 둥글둥글한 형태를 가집니다. 전체적으로 귀엽고 친근하며, 현실적이면서도 과장되지 않은 자연스러운 분위기를 연출합니다.
캐릭터: ${name}, ${age} ${gender} 캐릭터입니다. 일상적인 한국인의 외모를 가진 캐릭터로 표현해주세요.`;
    }
};

function displayKeywords() {
    const emotionTagsContainer = document.getElementById('emotionTags');
    const atmosphereTagsContainer = document.getElementById('atmosphereTags');
    const elementTagsContainer = document.getElementById('elementTags');
    
    if (!emotionTagsContainer || !atmosphereTagsContainer || !elementTagsContainer) return;
    
    emotionTagsContainer.innerHTML = '';
    currentKeyEmotions.forEach(emotion => {
        const tag = document.createElement('span');
        tag.className = 'keyword-tag emotion-tag';
        tag.textContent = emotion;
        emotionTagsContainer.appendChild(tag);
    });
    
    atmosphereTagsContainer.innerHTML = '';
    currentAtmosphere.forEach(atmo => {
        const tag = document.createElement('span');
        tag.className = 'keyword-tag atmosphere-tag';
        tag.textContent = atmo;
        atmosphereTagsContainer.appendChild(tag);
    });
    
    elementTagsContainer.innerHTML = '';
    currentKeyElements.forEach(element => {
        const tag = document.createElement('span');
        tag.className = 'keyword-tag element-tag';
        tag.textContent = element;
        elementTagsContainer.appendChild(tag);
    });
    
    const keywordsPanel = document.getElementById('keywordsPanel');
    if (keywordsPanel && keywordsPanel.classList.contains('collapsed')) {
        keywordsPanel.classList.remove('collapsed');
    }
}

async function generateNarrativeWithAI() {
    const topic = document.getElementById("prepTopic")?.value.trim() || "지정되지 않은 주제";
    const name = document.getElementById("prepName")?.value.trim() || "응답자";
    const age = document.getElementById("prepAge")?.value.trim() || "미상";
    const gender = document.querySelector('input[name="prepGender"]:checked')?.value || "성별 미상";
    const prepNotes = document.getElementById("prepNotes")?.value.trim() || "특이사항 없음";

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

# CONTEXT
## 인터뷰 주제
${topic}
## 캐릭터 정보
- 이름: ${name}
- 성별: ${gender}
- 나이대: ${age}
${prepNotes !== "특이사항 없음" ? `- 특이사항: ${prepNotes}` : ""}
${currentInterviewGoal ? `## 인터뷰 목표\n${currentInterviewGoal}` : ""}

# TASK
사용자가 제공한 경험 데이터를 바탕으로, 당시 상황을 생생하게 재현하는 1인칭 시점의 내러티브를 작성하세요. 구체적이고 감각적인 묘사가 필요합니다. 목표를 염두에 두고 첫 장면을 상상하여 작성하세요.

# OUTPUT DIRECTIVES
1. narrative (string): 5-8문장으로 구성된 자연스러운 스토리
   - 1인칭 시점(“나는 …했다”, “나는 …라고 느꼈다”)으로 작성합니다.
   - 일기처럼 자연스럽지만, 연구자가 읽기에도 명료한 문장을 사용합니다. 과도한 수사나 비유는 지양하고, 구체적인 상황 묘사에 집중하세요.
   - 사용자가 말하지 않은 세부(조명, 소리, 주변 사람 수 등)는 “한국의 일상적 상황에서 자연스러운 수준”에서만 보수적으로 보완합니다.
2. key_emotions: 반드시 3-5개의 구체적인 감정 키워드 (오직 한국어로만 작성, 예: "불안함", "당황스러움")
3. atmosphere: 반드시 3-5개의 분위기 키워드 (오직 한국어로만 작성, 예: "어수선한", "차가운")
4. key_elements: 반드시 3-5개의 시각적/맥락적 요소 (오직 한국어로만 작성, 예: "복잡한 화면", "뒷사람")
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

function buildBasePrompt(narrativeText) {
    const prompt = `# ROLE
You are an expert 3D cartoon scene illustrator specialized in creating warm, friendly, and emotionally expressive character scenes.

# TASK
Generate a 3D cartoon illustration that accurately depicts the following user experience scenario.

# CONTEXT & STYLE
${PROMPT_STYLE.getFixedElements()}

# INPUT: SCENE NARRATIVE
${narrativeText || "A user experiencing a moment in their daily life"}

# OUTPUT DIRECTIVES
1. Camera: Medium Shot
2. Capture emotional atmosphere and relevant environmental elements
3. Warm, relatable, empathetic tone.
`;
    currentPrompt = prompt;
    return prompt;
}

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
        thumb.appendChild(img);

        const meta = document.createElement("div");
        meta.className = "history-meta";
        const time = document.createElement("div");
        time.className = "history-time";
        time.textContent = entry.time;

        const text = document.createElement("div");
        text.className = "history-text";
        text.textContent = entry.narrativeText.length > 50 ? entry.narrativeText.substring(0, 50) + '...' : entry.narrativeText;

        meta.appendChild(time);
        meta.appendChild(text);
        item.appendChild(thumb);
        item.appendChild(meta);

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
        respondentWindow.postMessage({ type: 'toggleLoading', value: show }, '*');
    }
}

function startLoading() {
    if (!imageCard) return;
    imageCard.classList.add("is-loading");
    syncLoadingToRespondent(true);
}

function stopLoading() {
    if (!imageCard) return;
    imageCard.classList.remove("is-loading");
    syncLoadingToRespondent(false);
}

function onNewImageLoaded() {
    if (isRestoring) {
        stopLoading();
        if (imageCard) imageCard.classList.add("has-image");
        return;
    }
    if (imageCard) imageCard.classList.add("has-image");
    if (mainContainer) mainContainer.classList.add('show-left');
    renderHistorySidebar();
}

function updateInputInfoSummary() {
    const inputSummary = document.getElementById('inputSummary');
    if (!inputSummary) return;

    const topic = document.getElementById('prepTopic')?.value.trim() || '';
    const name = document.getElementById('prepName')?.value.trim() || '';
    const age = document.getElementById('prepAge')?.value.trim() || '';
    const gender = document.querySelector('input[name="prepGender"]:checked')?.value || '';
    const notes = document.getElementById('prepNotes')?.value.trim() || '';
    const goal = document.getElementById('prepGoal')?.value.trim() || '';

    if (!topic && !name && !notes && !goal) {
        inputSummary.innerHTML = '<p class="info-placeholder">인터뷰를 시작하면 입력한 정보가 여기에 표시됩니다.</p>';
        return;
    }

    let html = '';
    if (topic) html += `<div class="info-row"><span class="label">주제:</span><span>${topic}</span></div>`;
    if (name) html += `<div class="info-row"><span class="label">이름:</span><span>${name}</span></div>`;
    if (age) html += `<div class="info-row"><span class="label">나이:</span><span>${age}</span></div>`;
    if (gender) html += `<div class="info-row"><span class="label">성별:</span><span>${gender}</span></div>`;
    if (notes) html += `<div class="info-row"><span class="label">특이사항:</span><span>${notes}</span></div>`;
    if (goal) html += `<div class="info-row"><span class="label">인터뷰 목표:</span><span>${goal}</span></div>`;

    inputSummary.innerHTML = html;
    
    const inputInfoPanel = document.getElementById('inputInfoPanel');
    if (inputInfoPanel && inputInfoPanel.classList.contains('collapsed')) {
        inputInfoPanel.classList.remove('collapsed');
    }
}

if (geminiImg) {
    geminiImg.addEventListener("load", onNewImageLoaded);
}

async function generatePanoramaImage(modificationContext = '') {
    if (!currentNarrative) throw new Error('현재 내러티브가 없습니다.');
    
    const panoramaPrompt = `You are an expert photographer specializing in 360-degree equirectangular panoramic photography.

# TASK
Generate a photorealistic 360-degree equirectangular panorama of the environment described below. This must be in the exact equirectangular projection format (2:1 aspect ratio) suitable for 360-degree immersive viewing.

# SCENE CONTEXT
Situation: ${currentNarrative}
${modificationContext ? `User's Additional Request: ${modificationContext}` : ''}

# CRITICAL FORMAT REQUIREMENTS
1. **Projection**: MUST be equirectangular (also called spherical or lat-long projection)
2. **Aspect Ratio**: MUST be exactly 2:1 (width is twice the height)
3. **Coverage**: Full 360x180 degree spherical coverage
4. **Horizon**: Must be at the vertical center of the image
5. **Edge Continuity (CRITICAL)**:
   - The leftmost and rightmost pixels MUST connect seamlessly to form a continuous 360-degree loop
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
- Maintain consistent perspective distortion across the entire 360-degree view
- Test mentally: if you stitched left and right edges together, they should align perfectly

# REFERENCE
The output should look similar to Google Street View panoramas - a complete 360-degree environmental capture that wraps seamlessly without any visible seam when viewed in a panoramic viewer.

# TONE
Photorealistic, immersive, and architecturally accurate. Focus on the spatial experience and environmental ambiance. Prioritize seamless edge continuity for proper 360-degree viewing.`;
    
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: panoramaPrompt }] }],
        generationConfig: { temperature: 0.3, topK: 32, topP: 1, maxOutputTokens: 8192 },
    });
    
    const response = result.response;
    const candidates = response.candidates;
    if (candidates && candidates[0]?.content?.parts) {
        const imagePart = candidates[0].content.parts.find(p => p.inlineData && p.inlineData.mimeType && p.inlineData.mimeType.startsWith('image/'));
        if (imagePart && imagePart.inlineData && imagePart.inlineData.data) {
            return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
        }
    }
    throw new Error('파노라마 이미지를 생성할 수 없습니다.');
}

async function updateNarrativeWithModification(selectedQuestion, userAnswer) {
    const schema = {
        description: "Updated narrative with user modifications",
        type: SchemaType.OBJECT,
        properties: {
            narrative: { type: SchemaType.STRING, nullable: false },
            key_emotions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, nullable: false },
            atmosphere: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, nullable: false },
            key_elements: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, nullable: false }
        },
        required: ["narrative", "key_emotions", "atmosphere", "key_elements"],
    };

    const prompt = `# ROLE
당신은 사용자 경험 시나리오 작가입니다. 기존 내러티브를 사용자의 수정 요청에 따라 업데이트하는 전문가입니다.
# CONTEXT
## 현재 내러티브 (업데이트 전)
${currentNarrative}
## 인터뷰 질의응답
### 질문
${selectedQuestion}
### 답변
${userAnswer}
# TASK
응답자의 답변을 분석하여, 기존 내러티브에 새롭게 드러난 정보를 자연스럽게 통합하세요. 과거의 실제 사건만을 반영하세요.
새롭게 추출되는 키워드(key_emotions, atmosphere, key_elements)는 반드시 한국어로만 작성하세요.
`;

    const result = await textModel.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema },
    });
    
    const narrativeData = JSON.parse((await result.response).text());
    currentKeyEmotions = narrativeData.key_emotions || [];
    currentAtmosphere = narrativeData.atmosphere || [];
    currentKeyElements = narrativeData.key_elements || [];
    
    displayKeywords();
    
    return {
        narrative: narrativeData.narrative,
        key_emotions: currentKeyEmotions,
        atmosphere: currentAtmosphere,
        key_elements: currentKeyElements
    };
}

async function modifyImageWithInput(currentImageSrc, modificationText, updatedNarrative) {
    const base64Match = currentImageSrc.match(/^data:([^;]+);base64,(.+)$/);
    if (!base64Match) throw new Error('올바른 base64 이미지 형식이 아닙니다.');
    
    const mimeType = base64Match[1];
    const base64Data = base64Match[2];
    
    const modificationPrompt = `Modify the provided image according to the user's request while maintaining the overall style and composition.
    Current Narrative: ${updatedNarrative}
    Modification Request: ${modificationText}`;
    
    currentPrompt = modificationPrompt;
    
    const result = await model.generateContent({
        contents: [{
            role: "user",
            parts: [
                { inlineData: { mimeType: mimeType, data: base64Data } },
                { text: modificationPrompt }
            ]
        }],
        generationConfig: { imageConfig: { aspectRatio: "16:9" }, responseModalities: ["image"] },
    });
    
    const imgData = (await result.response).candidates[0].content.parts[0].inlineData;
    return `data:${imgData.mimeType};base64,${imgData.data}`;
}


// 💡 질문 확정 및 응답자 화면 갱신 함수
function syncQuestionToRespondent(q) {
    if (!q) return;
    currentSelectedQuestion = q;
    
    if (respondentWindow && !respondentWindow.closed) {
        respondentWindow.postMessage({ type: 'syncQuestion', question: currentSelectedQuestion }, '*');
    }
    
    const replyArea = document.getElementById("questionReplyArea");
    if (replyArea) {
        replyArea.classList.remove('disabled');
        const input = document.getElementById("replyInput");
        input.placeholder = "답변을 여기에 기록해주세요.";
        input.focus({ preventScroll: true });
    }
}

function notifyTypingToRespondent() {
    if (respondentWindow && !respondentWindow.closed) {
        respondentWindow.postMessage({ 
            type: 'syncQuestion', 
            question: '인터뷰 질문을 작성 중입니다...'
        }, '*');
    }
    
    // 작성 중일 때는 답변을 미리 입력하지 못하게 차단
    const replyArea = document.getElementById("questionReplyArea");
    if (replyArea) {
        replyArea.classList.add('disabled');
    }
}

// 💡 직접 입력 질문 전송 핸들러
function sendCustomQuestion() {
    const customRadio = document.getElementById('customQuestionRadio');
    if (customRadio) customRadio.checked = true;
    
    const customInput = document.getElementById('customQuestionInput');
    const q = customInput ? customInput.value.trim() : "";
    
    if (!q) return alert("직접 입력할 질문을 작성해주세요.");
    syncQuestionToRespondent(q);
}

const sendQuestionBtn = document.getElementById('sendQuestionBtn');
if (sendQuestionBtn) {
    sendQuestionBtn.addEventListener('click', sendCustomQuestion);
}

const customRadio = document.getElementById('customQuestionRadio');
if (customRadio) {
    customRadio.addEventListener('change', (e) => {
        if (e.target.checked) notifyTypingToRespondent();
    });
}

const customInput = document.getElementById('customQuestionInput');
if (customInput) {
    customInput.addEventListener('focus', () => {
        if (customRadio && !customRadio.checked) {
            customRadio.checked = true;
            notifyTypingToRespondent();
        } else if (customRadio && customRadio.checked) {
            notifyTypingToRespondent();
        }
    });
    
    customInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendCustomQuestion();
        }
    });
    
    customInput.addEventListener('input', () => {
        if (customRadio) customRadio.checked = true;
        
        if (sendQuestionBtn) {
            sendQuestionBtn.disabled = customInput.value.trim() === '';
        }
    });
}

// 💡 3개의 질문 선택지를 제안하도록 수정된 함수
async function generateNextQuestion(narrative) {
    const listEl = document.getElementById('aiQuestionsList');
    if (!listEl) return;
    
    listEl.innerHTML = '<p class="placeholder"><i class="fas fa-spinner fa-spin"></i> AI가 다음 질문을 고민하고 있습니다...</p>';
    
    const replyArea = document.getElementById("questionReplyArea");
    if (replyArea) replyArea.classList.add('disabled');

    const qaLogs = interactionLog.filter(log => log.type === 'question_answer');
    const qaCount = qaLogs.length;

    let prompt = "";

    if (qaCount === 0) {
        prompt = `
# ROLE
당신은 UX 리서치 심층면담 전문 인터뷰어입니다.

# CONTEXT
- 인터뷰 주제: ${currentInterviewMeta.topic}
- 응답자 특이사항: ${currentInterviewMeta.notes || "없음"}
- 인터뷰 최종 목표: ${currentInterviewGoal}

# TASK
이제 막 인터뷰를 시작했습니다. 응답자가 편안하게 자신의 경험을 이야기할 수 있도록, **인터뷰 주제와 관련된 가장 첫 번째 개방형 질문 3가지 옵션**을 생성하세요.

# GUIDELINES (CRITICAL)
1. **절대 불필요한 미사여구를 쓰지 마세요.** 2. 인터뷰어가 소리 내어 읽기 쉽고, 응답자가 바로 이해할 수 있도록 **짧고 명확한 구어체**로 작성하세요.
3. 임의로 상황을 기정사실화하여 묻지 마세요.
4. 다른 설명 없이 오직 질문 3개만 배열로 출력하세요.
`;
    } else if (qaCount < 5) {
        const previousQA = qaLogs.map((log, index) => `[${index + 1}번째 질문과 답변]\nQ: ${log.question}\nA: ${log.answer}`).join('\n\n');
        prompt = `
# ROLE
당신은 UX 리서치 심층면담 전문 인터뷰어입니다. 예리하지만 간결한 꼬리 질문을 던집니다.

# INTERVIEW GOAL
${currentInterviewGoal}

# CURRENT CONTEXT
## 이전 질의응답 내역
${previousQA}

# TASK
이전 질의응답 중 **가장 마지막 답변(A)**을 철저히 분석하여, 인터뷰 목표를 달성하기 위해 파고들어야 할 **다음 꼬리 질문 3가지 옵션**을 생성하세요.

# GUIDELINES (CRITICAL)
1. **미사여구를 완전히 빼고 핵심만 직접적으로 물어보세요.**
2. 응답자가 말한 핵심 단어를 짧게 인용하고 바로 본론(이유, 감정, 상황)을 물어보세요. 
3. 인터뷰어가 입으로 바로 소리 내어 말하기 편한, 자연스럽고 짧은 구어체 문장으로 작성하세요.
4. 오직 질문 3개만 배열로 출력하세요.
`;
    } else {
        const previousQA = qaLogs.map((log, index) => `[${index + 1}번째 질문과 답변]\nQ: ${log.question}\nA: ${log.answer}`).join('\n\n');
        prompt = `
# ROLE
당신은 UX 리서치 심층면담 전문 인터뷰어입니다. 대화의 맥락을 파악하여 적절한 질문을 던집니다.

# INTERVIEW GOAL
${currentInterviewGoal}

# CURRENT CONTEXT
## 이전 질의응답 내역
${previousQA}

# TASK
이전 질의응답을 전체적으로 분석하여, 사용자의 핵심 페인 포인트와 이탈 원인이 파악되었다면 해결책이나 개선 방향을 묻는 질문 3가지 옵션을, 아직 원인 파악이 더 필요하다면 예리한 꼬리 질문 3가지 옵션을 생성하세요.

# GUIDELINES (CRITICAL)
1. **미사여구를 완전히 빼고 핵심만 직접적으로 물어보세요.** 2. 이전 질문을 절대 반복하지 마세요.
3. 오직 질문 3개만 배열로 출력하세요.
`;
    }

    const schema = {
        description: "List of 3 interview question options",
        type: SchemaType.OBJECT,
        properties: {
            questions: {
                type: SchemaType.ARRAY,
                items: { type: SchemaType.STRING },
                description: "3 different interview questions"
            }
        },
        required: ["questions"],
    };

    try {
        const result = await textModel.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema: schema },
        });
        
        const responseText = await result.response.text();
        const data = JSON.parse(responseText);
        const questions = data.questions || [];

        listEl.innerHTML = '';
        questions.forEach((q, idx) => {
            const id = `ai_q_${idx}`;
            const div = document.createElement('div');
            div.className = 'ai-question-item';
            div.innerHTML = `
                <input type="radio" name="selectedQuestion" id="${id}" value="${q}">
                <label for="${id}">${q}</label>
            `;
            listEl.appendChild(div);

            // 💡 AI 질문 선택 시 즉시 응답자에게 전송
            const radioInput = div.querySelector('input');
            radioInput.addEventListener('click', (e) => {
                if (e.target.checked) {
                    syncQuestionToRespondent(e.target.value);
                }
            });
        });

        // 커스텀 입력 초기화
        if (customInput) customInput.value = '';
        if (sendQuestionBtn) sendQuestionBtn.disabled = true;
        
    } catch (error) {
        console.error("질문 생성 오류:", error);
        listEl.innerHTML = "<p>질문을 생성하는 중 오류가 발생했습니다. 다시 시도해주세요.</p>";
    }
}


if (historyToggleBtn) {
    historyToggleBtn.addEventListener("click", () => {
        const historyPanel = document.getElementById("historyPanel");
        if (historyPanel) historyPanel.classList.toggle('collapsed');
    });
}

function addChatBubble(type, text) {
    if (!historyLogList) return;
    const emptyMsg = historyLogList.querySelector(".empty-msg");
    if (emptyMsg) emptyMsg.remove();

    const bubbleRow = document.createElement("div");
    bubbleRow.classList.add("chat-row");

    if (type === "question") {
        bubbleRow.classList.add("chat-left"); 
        bubbleRow.innerHTML = `<div class="chat-bubble question">${text}</div>`;
    } else if (type === "answer") {
        bubbleRow.classList.add("chat-right");
        bubbleRow.innerHTML = `<div class="chat-bubble answer">${text}</div>`;
    }

    historyLogList.appendChild(bubbleRow);
    historyLogList.scrollTo({ top: historyLogList.scrollHeight, behavior: 'smooth' });
}

if (replySubmitBtn) {
    replySubmitBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!sceneCommitted) return alert('먼저 장면을 만들어주세요.');

        const answer = replyInput.value.trim();
        if (!answer) return alert('답변을 입력해주세요.');
        
        replySubmitBtn.disabled = true;
        const originalHTML = replySubmitBtn.innerHTML;
        replySubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>생성 중...</span>';
        replySubmitBtn.style.backgroundColor = '#94a3b8';
        replySubmitBtn.style.cursor = 'not-allowed';
        
        try {
            if (!currentNarrative) return alert('먼저 초기 장면을 생성해주세요.');

            addChatBubble("question", currentSelectedQuestion);
            addChatBubble("answer", answer);

            const currentQA = {
                type: 'question_answer',
                timestamp: new Date().toLocaleString("ko-KR", { hour12: false }),
                question: currentSelectedQuestion,
                answer: answer,
                narrative: currentNarrative,
                keyEmotions: [...currentKeyEmotions],
                atmosphere: [...currentAtmosphere],
                keyElements: [...currentKeyElements],
            };
            interactionLog.push(currentQA);

            const nextQuestionPromise = generateNextQuestion(currentNarrative);
            const narrativeUpdatePromise = updateNarrativeWithModification(currentQA.question, answer);

            const [_, updatedNarrativeData] = await Promise.all([nextQuestionPromise, narrativeUpdatePromise]);

            currentNarrative = updatedNarrativeData.narrative;
            currentKeyEmotions = updatedNarrativeData.key_emotions || [];
            currentAtmosphere = updatedNarrativeData.atmosphere || [];
            currentKeyElements = updatedNarrativeData.key_elements || [];
            
            if (narrativeTextEl) narrativeTextEl.innerHTML = currentNarrative;
            displayKeywords();

            currentQA.narrative = currentNarrative;
            currentQA.keyEmotions = [...currentKeyEmotions];
            currentQA.atmosphere = [...currentAtmosphere];
            currentQA.keyElements = [...currentKeyElements];

            const currentImageSrc = geminiImg?.src || '';
            const currentPanoramaSrc = currentPanoramaImgSrc || null;
            
            sceneHistory.push({
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
            });
            
            renderHistorySidebar(); 

            // 💡 이미지 정보(cartoonSrc) 누락 버그 픽스 유지
            if (respondentWindow && !respondentWindow.closed) {
                const tags = [...currentKeyEmotions, ...currentAtmosphere, ...currentKeyElements].map(t => `#${t}`);
                const cartoonImgEl = document.getElementById("geminiImg");
                const cartoonSrc = cartoonImgEl ? cartoonImgEl.src : "";
                
                respondentWindow.postMessage({
                    type: 'syncAll',
                    narrative: initialNarrative || currentNarrative, 
                    question: currentSelectedQuestion, 
                    parameters: tags,
                    panoramaSrc: currentPanoramaSrc,
                    cartoonSrc: cartoonSrc
                }, '*');
            }

            replyInput.value = '';
        } catch (error) {
            console.error('장면 진화 오류:', error);
            alert('장면을 업데이트하는 중 오류가 발생했습니다.');
        } finally {
            replySubmitBtn.disabled = false;
            replySubmitBtn.innerHTML = originalHTML;
            replySubmitBtn.style.backgroundColor = '';
            replySubmitBtn.style.cursor = '';
        }
    });
}

if (remixSubmitBtn) {
    remixSubmitBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!sceneCommitted) return alert('먼저 장면을 만들어주세요.');
        
        const request = remixInput.value.trim();
        const modificationCommand = request ? request : "현재 설정된 맥락 파라미터에 맞춰서 이미지를 조절해줘.";
        
        try {
            startLoading();
            if (currentEditMode === 'remix') {
                const currentImageSrc = geminiImg?.src;
                if (!currentImageSrc) throw new Error('현재 이미지가 없습니다.');
                
                const modifiedImageSrc = await modifyImageWithInput(currentImageSrc, modificationCommand, currentNarrative);
                if (geminiImg) geminiImg.src = modifiedImageSrc;
                
                try {
                    const newPanoramaSrc = await generatePanoramaImage(modificationCommand);
                    if (newPanoramaSrc) {
                        currentPanoramaImgSrc = newPanoramaSrc;
                        updatePanoramaBtnState(true);
                    }
                } catch (e) { console.warn("파노라마 재생성 실패", e); }
                
                currentVariationNumber++;
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
                
                interactionLog.push({
                    type: 'image_modify',
                    timestamp: new Date().toLocaleString("ko-KR", { hour12: false }),
                    sceneNumber: currentSceneNumber,
                    variationNumber: currentVariationNumber,
                    request: modificationCommand,
                });

                // 💡 [수정된 부분] 이미지 수정이 끝난 후 응답자 화면에 동기화 함수 호출
                syncToRespondent(currentPanoramaImgSrc);
            }
            remixInput.value = '';
        } catch (error) {
            console.error('이미지 처리 오류:', error);
            alert('이미지 처리 중 오류가 발생했습니다.');
        } finally { stopLoading(); }
    });
}

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
    remixToggleBtn.addEventListener("click", () => document.getElementById("rightSidebar").classList.add('active'));
}

if (closeRightSidebarBtn) {
    closeRightSidebarBtn.addEventListener("click", () => document.getElementById("rightSidebar").classList.remove('active'));
}

if (expandBtn) {
    expandBtn.onclick = () => {
        if (!panoramaFullscreen) return;
        const currentScene = sceneHistory[sceneHistory.length - 1];

        if (currentScene && currentScene.panoramaImgSrc) {
            panoramaFullscreen.style.display = 'flex';
            if (panoramaLoading) panoramaLoading.style.display = "none";
            const panoramaNarrativeText = document.getElementById("panoramaNarrativeText");
            if (panoramaNarrativeText) panoramaNarrativeText.innerHTML = currentScene.narrativeText || currentNarrative;

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

if (closeFullscreenBtn) {
    closeFullscreenBtn.addEventListener("click", () => {
        if (panoramaFullscreen) panoramaFullscreen.style.display = 'none';
        if (panoramaViewer) {
            panoramaViewer.destroy();
            panoramaViewer = null;
        }
    });
}

document.querySelectorAll('.panel-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
        const panel = document.getElementById(toggle.dataset.target);
        if (panel) panel.classList.toggle('collapsed');
    });
});

const exportBtn = document.getElementById('nextStepBtn');
if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
        if (sceneHistory.length === 0) return alert('내보낼 장면이 없습니다.');
        try {
            exportBtn.disabled = true;
            exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 내보내는 중...';
            
            const zip = new JSZip();
            const profileCard = document.querySelector('.user-profile-card');
            const respondentName = profileCard?.dataset.name || '응답자';
            const respondentGender = profileCard?.dataset.gender || '미상';
            const respondentAge = profileCard?.dataset.age || '미상';
            
            const topic = document.getElementById("prepTopic")?.value.trim() || "지정되지 않은 주제";
            const prepNotes = document.getElementById("prepNotes")?.value.trim() || "특이사항 없음";
            
            const mainFolder = zip.folder(respondentName);
            
            let logText = `[주제: ${topic}]\n\n[인터뷰 대상자 정보]\n이름: ${respondentName}\n성별: ${respondentGender}\n나이: ${respondentAge}\n`;
            if (prepNotes !== "특이사항 없음") logText += `특이사항: ${prepNotes}\n`;
            if (currentInterviewGoal) logText += `\n인터뷰 목표: ${currentInterviewGoal}\n`;
            logText += `\n${'='.repeat(60)}\n\n[로그 데이터]\n\n`;
            
            interactionLog.forEach((log) => {
                if (log.type === 'initial_response') {
                    logText += `## 초기 응답\n# Narrative:\n${log.narrative}\n\n# Key Emotions:\n${log.keyEmotions.join(', ')}\n\n# Atmosphere:\n${log.atmosphere.join(', ')}\n\n# Key Elements:\n${log.keyElements.join(', ')}\n\n${'='.repeat(60)}\n\n`;
                } else if (log.type === 'question_answer') {
                    logText += `## 질의응답\n질문: ${log.question}\n답변: ${log.answer}\n\n수정된 Narrative:\n${log.narrative}\n\n# Key Emotions:\n${log.keyEmotions.join(', ')}\n\n# Atmosphere:\n${log.atmosphere.join(', ')}\n\n# Key Elements:\n${log.keyElements.join(', ')}\n\n${'='.repeat(60)}\n\n`;
                } else if (log.type === 'image_modify') {
                    logText += `## 이미지 수정 요청\n수정 요청 내용: ${log.request}\n\n${'='.repeat(60)}\n\n`;
                }
            });
            
            mainFolder.file('interview_log.txt', logText);
            
            const imageMap = new Map();
            sceneHistory.forEach((scene) => {
                imageMap.set(`${scene.sceneNumber || 1}-${scene.variationNumber || 1}`, scene);
            });
            
            for (const [key, scene] of imageMap) {
                if (scene.imgSrc && scene.imgSrc.startsWith('data:')) {
                    mainFolder.file(`scene_${key}.png`, scene.imgSrc.split(',')[1], { base64: true });
                }
                if (scene.panoramaImgSrc && scene.panoramaImgSrc.startsWith('data:')) {
                    mainFolder.file(`scene_${key}_panorama.png`, scene.panoramaImgSrc.split(',')[1], { base64: true });
                }
            }
            
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
        } catch (error) {
            console.error('내보내기 오류:', error);
            alert('내보내기 중 오류가 발생했습니다.');
            exportBtn.disabled = false;
            exportBtn.innerHTML = '<i class="fas fa-file-export"></i> 내보내기';
        }
    });
}

const saveInterviewBtn = document.getElementById('saveInterviewBtn');
if (saveInterviewBtn) {
    saveInterviewBtn.addEventListener('click', () => {
        saveCurrentInterviewState();
        document.getElementById('mainSection').style.display = 'none';
        document.getElementById('homeSection').style.display = 'block';
        document.getElementById('headerRightArea').classList.add('is-hidden');
        document.getElementById('headerTopicDisplay').textContent = '';
        if (panoramaViewer) {
            panoramaViewer.destroy();
            panoramaViewer = null;
        }
    });
}

const openPrepModalBtn = document.getElementById('openPrepModalBtn');
const closePrepModalBtn = document.getElementById('closePrepModalBtn');
const prepModalOverlay = document.getElementById('prepModalOverlay');

if (openPrepModalBtn) openPrepModalBtn.addEventListener('click', () => prepModalOverlay.style.display = 'flex');
if (closePrepModalBtn) closePrepModalBtn.addEventListener('click', () => prepModalOverlay.style.display = 'none');

const startInterviewBtn = document.getElementById("startInterviewBtn");
if (startInterviewBtn) {
    startInterviewBtn.addEventListener("click", async () => {
        resetGlobalState();

        const topic = document.getElementById("prepTopic").value.trim() || "주제 미상";
        const name = document.getElementById("prepName").value.trim() || "응답자";
        const age = document.getElementById("prepAge").value.trim() || "미상";
        const gender = document.querySelector('input[name="prepGender"]:checked')?.value || "남성";
        const prepNotes = document.getElementById("prepNotes")?.value.trim() || "";
        const prepGoal = document.getElementById("prepGoal")?.value.trim() || "지정된 목표 없음";

        currentInterviewId = Date.now();
        currentInterviewGoal = prepGoal;
        currentInterviewMeta = { topic, name, age, gender, notes: prepNotes, goal: prepGoal };

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
        
        const profileCard = document.querySelector('.user-profile-card');
        if (profileCard) {
            profileCard.dataset.name = name;
            profileCard.dataset.gender = gender;
            profileCard.dataset.age = age;
        }

        updateInputInfoSummary();

        sceneCommitted = true;
        startLoading();
        updatePanoramaBtnState(false);
        
        try {
            const result = await generateNarrativeWithAI();
            currentNarrative = result.narrative; 
            initialNarrative = currentNarrative; 
            if (narrativeTextEl) narrativeTextEl.innerHTML = currentNarrative;

            currentPrompt = buildBasePrompt(currentNarrative);
            const imgRes = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: currentPrompt }] }],
                generationConfig: { imageConfig: { aspectRatio: "16:9" }, responseModalities: ["image"] },
            });
            const imgData = imgRes.response.candidates[0].content.parts[0].inlineData;
            const newImgSrc = `data:${imgData.mimeType};base64,${imgData.data}`;
            if (geminiImg) geminiImg.src = newImgSrc;

            let panoramaSrc = null;
            try {
                panoramaSrc = await generatePanoramaImage();
                if (panoramaSrc) {
                    updatePanoramaBtnState(true);
                    currentPanoramaImgSrc = panoramaSrc;
                }
            } catch (e) { console.warn("파노라마 생성 실패", e); }

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
            
            interactionLog.push({
                type: 'initial_response',
                timestamp: new Date().toLocaleString("ko-KR", { hour12: false }),
                narrative: currentNarrative,
                keyEmotions: [...currentKeyEmotions],
                atmosphere: [...currentAtmosphere],
                keyElements: [...currentKeyElements],
            });
            
            renderHistorySidebar();
            
            await generateNextQuestion(currentNarrative);
            displayKeywords();
            
            setTimeout(() => { syncToRespondent(panoramaSrc); }, 1000);
            document.getElementById('imageCard').classList.add("has-image");
        } catch (error) {
            console.error("초기 생성 오류:", error);
        } finally { stopLoading(); }
    });
}

function updatePanoramaBtnState(isReady) {
    const expandBtn = document.getElementById("expandBtn");
    if (!expandBtn) return;
    if (isReady) {
        expandBtn.disabled = false;
        expandBtn.style.opacity = "1";
        expandBtn.style.cursor = "pointer";
        expandBtn.style.backgroundColor = "#1e293b";
        expandBtn.style.color = "#ffffff";
        expandBtn.style.filter = "none";
        expandBtn.classList.add("active"); 
    } else {
        expandBtn.disabled = true;
        expandBtn.style.opacity = "0.5";
        expandBtn.style.backgroundColor = "#94a3b8";
        expandBtn.style.cursor = "not-allowed";
        expandBtn.classList.remove("active");
    }
}