// guard.js 파일 내용
(function() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('kit') === '1226') {
        localStorage.setItem('auth_token_temp', 'true'); 
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    const isDev = localStorage.getItem('auth_token_temp') === 'true';
    const isApp = !!(window.AndroidBridge || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.showAd));

    if (isLocal || isDev || isApp) return;

    alert("🐔 Chicken Race는 모바일 앱 전용 게임입니다!\nApp Store 또는 Google Play에서 다운로드해 주세요.");
    window.location.href = "https://www.google.com"; 
})();