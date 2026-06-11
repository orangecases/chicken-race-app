(function() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    // 개발자 비밀번호 확인 (?k=7382)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('kit') === '1226') {
        localStorage.setItem('auth_token_temp', 'true'); 
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    const isDev = localStorage.getItem('auth_token_temp') === 'true';
    
    // 네이티브 앱(안드로이드/iOS) 브릿지 확인
    const isApp = !!(window.AndroidBridge || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.showAd));

    // 💡 통과 조건에 해당하면 여기서 스크립트 종료 -> 정상적으로 게임 화면 로드
    if (isLocal || isDev || isApp) return;

    // 🚨 일반 웹 접속자 차단 로직 (게임 화면이 아예 안 보이게 HTML 덮어쓰기)
    
    // 1. 현재 로딩 중인 페이지를 강제로 백지화합니다.
    document.open();
    
    // 2. 백지 위에 예쁜 앱 다운로드 랜딩 페이지를 즉석에서 그립니다.
    document.write(`
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Chicken Race - 모바일 앱 다운로드</title>
            <style>
                body {
                    margin: 0; padding: 0; background-color: #ffdeeb; 
                    display: flex; flex-direction: column; align-items: center; justify-content: center; 
                    height: 100vh; font-family: 'Pretendard', sans-serif; text-align: center;
                }
                .container {
                    background: white; padding: 40px 30px; border-radius: 20px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.1); width: 80%; max-width: 400px;
                }
                h1 { color: #d81b60; margin: 10px 0 20px 0; font-size: 28px; }
                p { color: #555; margin-bottom: 30px; line-height: 1.6; font-size: 16px; word-break: keep-all; }
                .btn-group { display: flex; flex-direction: column; gap: 15px; }
                .btn { 
                    padding: 15px 20px; border-radius: 12px; text-decoration: none; font-weight: bold; 
                    color: white; font-size: 16px; display: flex; align-items: center; justify-content: center;
                }
                .btn.apple { background-color: #000; }
                .btn.google { background-color: #1a73e8; }
                .emoji { margin-right: 8px; font-size: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div style="font-size: 60px; margin-bottom: 10px;">🐔</div>
                <h1>Chicken Race</h1>
                <p>이 게임은 <strong>모바일 앱 전용</strong>입니다.<br>지금 바로 스토어에서 앱을 다운로드하고 전 세계 유저들과 짜릿한 레이스를 즐겨보세요!</p>
                <div class="btn-group">
                    <a href="#" class="btn apple"><span class="emoji">🍎</span> App Store에서 받기</a>
                    <a href="#" class="btn google"><span class="emoji">▶️</span> Google Play에서 받기</a>
                </div>
            </div>
        </body>
        </html>
    `);
    
    // 3. 더 이상 HTML을 읽지 않도록 닫아버립니다. (게임 화면 차단 완료)
    document.close();
})();