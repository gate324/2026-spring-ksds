let viewer;

function initPanorama(imageUrl) {
    if (viewer) viewer.destroy();
    viewer = pannellum.viewer('panoramaViewer', {
        "type": "equirectangular",
        "panorama": imageUrl,
        "autoLoad": true,
        "showControls": false,
        "compass": false
    });
}

// UI를 한 번에 업데이트하는 통합 함수
function updateInterviewUI(narrative, question, parameters) {
    document.getElementById('panoramaNarrativeText').textContent = narrative;
    document.getElementById('panoramaQuestionText').textContent = question;
    
    const tagContainer = document.getElementById('parameterTags');
    tagContainer.innerHTML = ''; // 기존 태그 초기화
    
    // 파라미터 배열을 돌면서 태그 HTML 생성
    parameters.forEach(param => {
        const span = document.createElement('span');
        span.className = 'param-tag';
        span.textContent = param;
        tagContainer.appendChild(span);
    });
}

// ==========================================
// 테스트 실행 구역
// ==========================================
const testImageUrl = 'https://pannellum.org/images/alma.jpg';
const testNarrative = '당신은 지금 조용한 숲 속에 있습니다. 나무 위로 딱따구리가 올라가는 소리가 들립니다.';
const testQuestion = '지금 보이는 이 숲의 분위기가, 기획하시던 게임의 첫 스테이지 느낌과 얼마나 비슷한가요?';

// 이전에 언급하신 메타데이터(분위기, 요소, 감정 등)를 배열로 넘겨줍니다.
const testParameters = ['#평화로운', '#울창한 숲', '#딱따구리', '#긴장감 없는', '#아침 햇살'];

// ==========================================
// UI 자동 숨김/표시 로직 (인터랙티브 오버레이)
// ==========================================
let uiTimeout;
const container = document.querySelector('.panorama-container');

function showUI() {
    // 1. UI 표시 (클래스 추가)
    container.classList.add('ui-active');
    
    // 2. 이전에 설정된 숨기기 타이머가 있다면 취소
    clearTimeout(uiTimeout);
    
    // 3. 3초(3000ms) 동안 아무 조작이 없으면 다시 UI 숨김
    uiTimeout = setTimeout(() => {
        container.classList.remove('ui-active');
    }, 3000); 
}

// 마우스를 움직이거나, 클릭하거나, 화면을 터치할 때마다 showUI 함수 실행
window.addEventListener('mousemove', showUI);
window.addEventListener('click', showUI);
window.addEventListener('touchstart', showUI);

// 처음 화면이 로드되었을 때 UI를 한 번 보여줌
setTimeout(showUI, 500);

// 기존 코드 하단에 추가
window.addEventListener('message', function(event) {
    const data = event.data;
    const loadingOverlay = document.getElementById('respondentLoading');

    // 로딩 스피너 제어
    if (data.type === 'toggleLoading') {
        if (loadingOverlay) loadingOverlay.style.display = data.value ? 'flex' : 'none';
    }

    // [중요] 통합 데이터 수신 (장면 전환 시 한 번에 업데이트)
    if (data.type === 'syncAll') {
        updateInterviewUI(data.narrative, data.question, data.parameters);
        if (data.panoramaSrc) {
            initPanorama(data.panoramaSrc);
        }
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }

    // 기존 질문 동기화 유지
    if (data.type === 'syncQuestion') {
        const questionText = document.getElementById('panoramaQuestionText');
        if (questionText) questionText.textContent = data.question;
    }
});