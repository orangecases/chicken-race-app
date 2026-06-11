(function() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    // 개발자 비밀번호 확인 (?k=7382)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('k') === '7382') {
        localStorage.setItem('auth_token_temp', 'true'); 
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    const isDev = localStorage.getItem('auth_token_temp') === 'true';
    
    // 네이티브 앱(안드로이드/iOS) 브릿지 확인
    const isApp = !!(window.AndroidBridge || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.showAd));

    // 💡 통과 조건(앱이거나 개발자)에 해당하면 여기서 스크립트 종료 -> 정상적으로 게임 화면 로드
    if (isLocal || isDev || isApp) return;

    // 🚨 일반 웹 접속자 차단 로직 (랜딩 페이지로 주소 강제 이동)
    // replace()를 사용하면 브라우저 '뒤로 가기'를 눌러도 게임 화면으로 돌아올 수 없습니다.
    window.location.replace('/landing.html');
})();