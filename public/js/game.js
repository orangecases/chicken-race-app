/**
 * 📢 치킨 런 - 앱 버전
 */

// [1. 전역 변수 및 게임 설정]

// 💡 안드로이드 상태표시줄 방어용 여백 변수 설정
if (window.AndroidBridge) {
    document.documentElement.style.setProperty('--android-safe-area', '2.2rem'); 
}

// 💡 안드로이드 & iOS 통합 네이티브 통신 브릿지 (전역 함수)
window.invokeNativeApp = function(action, data = null) {
    // 1. 안드로이드 (AndroidBridge) 호출
    if (window.AndroidBridge && typeof window.AndroidBridge[action] === 'function') {
        if (data !== null) window.AndroidBridge[action](data);
        else window.AndroidBridge[action]();
    } 
    // 2. 아이폰 iOS (WKWebView) 호출
    else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers[action]) {
        if (data !== null) window.webkit.messageHandlers[action].postMessage(data);
        else window.webkit.messageHandlers[action].postMessage('');
    } 
    // 3. 일반 웹 브라우저 (PC 테스트용)
    else {
        console.log(`[Web Debug] Native action '${action}' called with data:`, data);
    }
};
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const GAME_WIDTH = 1248;
const GAME_HEIGHT = 880;
canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;

const STATE = { IDLE: 'idle', PLAYING: 'playing', PAUSED: 'paused', CRASHED: 'crashed', GAMEOVER: 'gameover' };
let gameState = STATE.PLAYING;
let gameFrame = 0;
let score = 0;
let level = 1; // [신규] 레벨 변수
let myScores = []; // 내 기록 배열
let bestScore = 0; // 최고 기록 (myScores에서 파생)
let top100Scores = []; // Top 100 더미 데이터
let nextLevelFrameThreshold = 400; // 난이도 상승 기준 (약 6.5초)
let currentGameMode = 'single';
let isGameReady = false;
let gameLoopId = null;
let isEffectOn = true; // 효과음 상태
let isBgmOn = true;    // 배경음악 상태
let isLoggedIn = false; // [신규] 로그인 상태
let currentUser = null; // [신규] 로그인한 사용자 정보
let unsubscribeUserData = null; // [신규] 유저 데이터 리스너 해제 함수
let guestCoins = parseInt(localStorage.getItem('chickenRunGuestCoins') || '10'); // [FIX] 삭제되었던 게스트 코인 변수 복원
let hasRevived = false; // [신규] 1회 부활 여부 체크
let continueTimerId = null; // [신규] 카운트다운 타이머 아이디
let multiGamePlayers = []; // [신규] 멀티플레이 참여자 목록
let unsubscribeParticipantsListener = null; // [신규] 멀티플레이 참가자 실시간 리스너
let autoActionTimer = null; // [신규] 자동 액션 타이머
let lastFirestoreUpdateTime = 0; // [3단계] Firestore 업데이트 쓰로틀링용
const FIRESTORE_UPDATE_INTERVAL = 1000; // [3단계] 1초 간격으로 업데이트
let isJumpPressed = false; // [신규] 점프 버튼 누름 상태 유지 변수
let displayedMyRecordsCount = 20; // [신규] 내 기록 표시 개수 (무한 스크롤용)
let nicknameCache = {};


// [수정] 관리자 식별 방식을 이메일에서 UID로 변경합니다.
// 아래 배열에 Firebase Console > Authentication에서 확인한 관리자 계정의 UID를 추가하세요.
const ADMIN_UIDS = ["51FsLG2SFlMOVhxtNNtwHdtT55O2"]; // 예: "Abc123xyz..."



// [수정] 페이지네이션(Pagination) 설정: 1만개 이상의 방이 있어도 앱이 원활하게 동작하도록 합니다.
let lastVisibleRoomDoc = null; // 마지막으로 불러온 방의 문서 참조
let isFetchingRooms = false;   // 방 목록을 불러오는 중인지 여부 (중복 호출 방지)
let currentRoomLimit = 15;     // [신규] 현재 불러올 방의 개수 (limit)
let currentMyRoomLimit = 15;   // [신규] 참가중 탭의 목록 노출 개수 (limit)
let unsubscribeRoomListener = null; // [신규] 실시간 리스너 해제 함수
const ROOMS_PER_PAGE = 15;     // 한 번에 불러올 방의 개수
let allRoomsLoaded = false;    // 모든 방을 다 불러왔는지 여부 (더보기 버튼 표시 제어)
let myRooms = [];              // [신규] 참가중인 방 목록 데이터 별도 저장
let unsubscribeMyRoomsListeners = []; // [신규] '내 방' 목록 실시간 리스너 해제 함수 배열
let lastJoinedRoomIdsJSON = ''; // [신규] 참가중인 방 목록 변경 감지용 변수



// [신규] 광고 시스템 설정
const AD_CONFIG = {
    REWARD: 10,      // 1회당 지급 코인
    DAILY_LIMIT: 10, // 일일 최대 시청 횟수
    DURATION: 10000  // [신규] 광고 시청 시간 (10초, ms 단위)
};

// [데이터] 방 정보 및 현재 진행 상태
let currentRoom = null;
let targetRoom = null; // [신규] 비밀번호 입력 중인 대상 방
// [수정] raceRooms는 이제 Firestore에서 실시간으로 데이터를 받아오므로, 로컬 더미 데이터는 제거합니다.
let raceRooms = [];
let unlockedRoomIds = []; // [신규] 비밀번호 해제된 방 ID 목록

// 물리 설정
let baseGameSpeed = 10; // 이 값은 게임 중에 점차 증가합니다.
let gameSpeed = 10;
let speedMultiplier = 1;
const FRICTION = 0.96;
const GRAVITY = 1.2;
const JUMP_FORCE = 30;
const FLOOR_Y = GAME_HEIGHT - 124 - 128;

// [2. 리소스 로딩]
const imageSources = {
    sky: 'assets/images/gamebg-sky.png', floor: 'assets/images/element_floor.png',
    chickenRun1: 'assets/images/chickenRun_01.png', chickenRun2: 'assets/images/chickenRun_02.png',
    chickenShock: 'assets/images/chicken_shock.png', chickenDead: 'assets/images/chicken_dead.png',
    eagle: 'assets/images/obstacle_eagle.png', dog1: 'assets/images/dogRun_01.png',
    dog2: 'assets/images/dogRun_02.png', dog3: 'assets/images/dogRun_03.png',
    fire1: 'assets/images/fireBurn_01.png', fire2: 'assets/images/fireBurn_02.png',
    fire3: 'assets/images/fireBurn_03.png', fire4: 'assets/images/fireBurn_04.png',
    fire5: 'assets/images/fireBurn_05.png', fire6: 'assets/images/fireBurn_06.png',
    // [신규] 깃털 이미지 추가
    featherLg: 'assets/images/feather_lg.png', featherMd: 'assets/images/feather_md.png', featherSm: 'assets/images/feather_sm.png'
};
const images = {};
let loadedCount = 0;
const totalImages = Object.keys(imageSources).length;
for (let key in imageSources) {
    images[key] = new Image(); images[key].src = imageSources[key];
    images[key].onload = () => { loadedCount++; if (loadedCount === totalImages) isGameReady = true; };
}
// [신규] 오디오 리소스 로딩
const audioSources = {
    bgm: 'assets/sounds/bgm.mp3',
    jump: 'assets/sounds/jump.mp3',
    crash: 'assets/sounds/chicken-cluking.mp3',
    feather: 'assets/sounds/feather.mp3',
    start: 'assets/sounds/game-start.mp3'
};
const audios = {};
for (let key in audioSources) {
    audios[key] = new Audio(audioSources[key]);
    if (key === 'bgm') { audios[key].loop = true; audios[key].volume = 0.2; } // [수정] 배경음악 볼륨 하향 (0.5 -> 0.2)
}

// [3. 게임 객체 클래스]

class ScrollingBackground {
    constructor(imageKey, speedRatio, width, height) {
        this.imageKey = imageKey; this.speedRatio = speedRatio; this.width = width; this.height = height; this.x = 0;
    }
    draw(yPosition) {
        const img = images[this.imageKey];
        if (!img || !img.complete) return;
        // [FIX] 게임이 'PLAYING' 또는 'CRASHED' 상태일 때 배경을 스크롤하여 자연스러운 감속 효과를 줍니다.
        if (gameState === STATE.PLAYING || gameState === STATE.CRASHED) {
            this.x -= gameSpeed * this.speedRatio;
            if (this.x <= -this.width) this.x = 0;
        }
        // [수정] 이미지 루프 시 틈새가 보이지 않도록 너비를 살짝(2px) 늘려서 겹치게 그립니다.
        ctx.drawImage(img, this.x, yPosition, this.width + 2, this.height);
        ctx.drawImage(img, this.x + this.width, yPosition, this.width + 2, this.height);
    }
}
const skyBg = new ScrollingBackground('sky', 0.2, 1248, 756);
const floorBg = new ScrollingBackground('floor', 1.0, 1248, 124);

const chicken = {
    width: 128, height: 128, x: 100, y: FLOOR_Y, dy: 0, isJumping: false, frameDelay: 8, isBoosting: false, targetX: 100,
    boostProgress: 0, // [신규] 부스트 게이지 (0~100)
    crashFrame: 0,
    isInvincible: false, // 💡 [추가] 무적 상태 플래그
    update() {
        if (gameState === STATE.PLAYING) {
            if (this.isJumping) {
                this.y += this.dy; this.dy += GRAVITY;
                if (this.y > FLOOR_Y) { this.y = FLOOR_Y; this.dy = 0; this.isJumping = false; }
            } else {
                // [신규] 바닥에 있고 점프 버튼을 누르고 있으면 연속 점프
                if (isJumpPressed) {
                    this.jump();
                }
            }
            if (this.isBoosting) {
                this.targetX = 550; this.frameDelay = 4; this.x += (this.targetX - this.x) * 0.008;
                this.boostProgress = Math.min(100, this.boostProgress + 0.5); // [수정] 부스트 시 게이지 상승
            }
            else {
                this.targetX = 100; this.frameDelay = 8; this.x += (this.targetX - this.x) * 0.005;
                this.boostProgress = Math.max(0, this.boostProgress - 1); // [수정] 미사용 시 게이지 하락
            }
        } else if (gameState === STATE.CRASHED) {
            this.crashFrame++;
            this.y += this.dy; this.dy += GRAVITY;
            if (this.y >= FLOOR_Y) { this.y = FLOOR_Y; this.dy = 0; }
        }
    },
    draw() {
        // 💡 [추가] 무적 상태일 때 0.15초 간격으로 깜빡이는 효과 (그리기를 건너뜀)
        if (this.isInvincible && Math.floor(Date.now() / 80) % 2 === 0) return;
        let sprite;
        if (gameState === STATE.PLAYING) {
            sprite = (Math.floor(gameFrame / this.frameDelay) % 2 === 0) ? images.chickenRun1 : images.chickenRun2;
        } else if (gameState === STATE.CRASHED) {
            sprite = (this.crashFrame < 15) ? images.chickenShock : images.chickenDead;
        } else if (gameState === STATE.GAMEOVER) {
            sprite = images.chickenDead;
        } else {
            // [FIX] IDLE(준비), PAUSED(일시정지) 상태에서는 기본 달리기 자세로 보이도록 수정
            sprite = images.chickenRun1;
        }
        if (sprite && sprite.complete) ctx.drawImage(sprite, this.x, this.y, this.width, this.height);
    },
    jump() { if (!this.isJumping && gameState === STATE.PLAYING) { this.isJumping = true; this.dy = -JUMP_FORCE; playSound('jump'); } },
    /**
     * [신규] 점프를 중간에 멈추는 함수.
     * 상승 중일 때(dy < 0) 호출되면, 상승 속도를 줄여 낮은 점프를 만듭니다.
     */
    cutJump() {
        // 상승 속도가 일정 값 이상일 때만 적용하여 너무 낮은 점프가 되는 것을 방지
        // [수정] -20은 너무 낮고, -25는 너무 높다는 피드백을 반영하여 중간값인 -22로 조정
        // 적당한 높이의 숏 점프(소점프)가 가능하도록 설정
        if (this.dy < -17) { this.dy = -17; }
    }
};

class Dog {
    constructor() {
        this.width = 320; this.height = 144; this.initialX = -350; this.x = this.initialX; this.y = GAME_HEIGHT - 124 - 144;
        this.frame = 0; this.frameDelay = 5; this.targetX = this.initialX;
    }
    update() {
        if (gameState !== STATE.PLAYING) {
            this.targetX = this.initialX;
            this.x += (this.targetX - this.x) * 0.05;
        } else {
            if (chicken.isBoosting) {
                // [유지] 다가오는 속도는 만족하셨으므로 0.04 그대로 둡니다.
                this.targetX = Math.min(50, chicken.x - 300);
                this.x += (this.targetX - this.x) * 0.04;
            } else {
                this.targetX = this.initialX;
                // 💡 [수정] 멀어질 때의 속도를 확 줄여서(0.04 -> 0.015) 화면에 조금 더 오래 머물게 합니다!
                this.x += (this.targetX - this.x) * 0.015;
            }
        }
        this.frame++;
    }
    draw() {
        let frameIndex = (Math.floor(this.frame / this.frameDelay) % 3) + 1;
        let sprite = images['dog' + frameIndex];
        if (sprite && sprite.complete) ctx.drawImage(sprite, this.x, this.y, this.width, this.height);
    }
}
const dog = new Dog();

class Obstacle {
    constructor(type) {
        this.type = type; this.markedForDeletion = false;
        if (type === 'fire') {
            this.width = 168; this.height = 168; this.y = GAME_HEIGHT - 124 - 168;
            this.frame = 0; this.maxFrame = 6; this.frameDelay = 4;
            // [수정] 불꽃 장애물의 판정 범위를 줄여서(width: 80->50) 피하기 쉽게 조정
            this.hitbox = { xOffset: 60, yOffset: 40, width: 50, height: 100 };
        } else {
            this.width = 280; this.height = 144; this.y = GAME_HEIGHT - 124 - 168 - 120;
            this.frame = 0; this.hitbox = { xOffset: 20, yOffset: 40, width: 240, height: 60 };
        }
        this.x = GAME_WIDTH;
    }
    update() {
        if (this.type === 'eagle') this.x -= (gameSpeed + 7); // [수정] 독수리가 게임 속도보다 항상 빠르게 날아옴
        else this.x -= gameSpeed;
        this.frame++;
        if (this.x < -this.width) this.markedForDeletion = true;
    }
    draw() {
        if (this.type === 'fire') {
            let frameIndex = (Math.floor(this.frame / this.frameDelay) % this.maxFrame) + 1;
            let sprite = images['fire' + frameIndex];
            if (sprite) ctx.drawImage(sprite, this.x, this.y, this.width, this.height);
        } else if (images.eagle) {
            ctx.drawImage(images.eagle, this.x, this.y, this.width, this.height);
        }
    }
}

let obstacles = [];
let feathers = []; // [신규] 깃털 파티클 배열
let obstacleTimer = 0;

// [신규] 깃털 파티클 클래스
class Feather {
    constructor(x, y) {
        this.x = x; this.y = y;
        const types = ['featherLg', 'featherMd', 'featherSm'];
        this.imageKey = types[Math.floor(Math.random() * types.length)];

        // 폭발하듯 퍼지는 초기 속도 (사방으로 퍼짐)
        const angle = Math.random() * Math.PI * 2;
        const speed = 5 + Math.random() * 15;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed - 1; // [수정] 위쪽으로 솟구치는 힘을 줄임 (-5 -> -2)

        this.gravity = 0.4; // 가볍게 떨어지도록 낮은 중력
        this.friction = 0.94; // 공기 저항

        this.rotation = Math.random() * 360;
        this.rotationSpeed = (Math.random() - 0.5) * 15; // 빙글빙글 회전

        this.scale = 0.4 + Math.random() * 0.6; // 크기 랜덤
        this.opacity = 1;
        this.fadeSpeed = 0.01 + Math.random() * 0.02; // 천천히 사라짐

        this.flip = Math.random() < 0.5 ? 1 : -1; // [핵심] 좌우 반전 (1: 원본-왼쪽, -1: 반전-오른쪽)

        // 좌우 흔들림 (Sway) - 떨어질 때 살랑거리는 효과
        this.swayPhase = Math.random() * Math.PI * 2;
        this.swaySpeed = 0.1;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.vx *= this.friction;

        // 공기 저항으로 인한 좌우 흔들림 추가
        this.x += Math.sin(this.swayPhase) * 2;
        this.swayPhase += this.swaySpeed;

        this.rotation += this.rotationSpeed;
        this.opacity -= this.fadeSpeed;
    }
    draw() {
        if (this.opacity <= 0) return;
        const img = images[this.imageKey];
        if (!img || !img.complete) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.opacity);
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation * Math.PI / 180);
        ctx.scale(this.scale * this.flip, this.scale); // 좌우 반전 적용
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();
    }
}

function createFeatherExplosion(x, y) {
    // 충돌 시 15~25개의 깃털 생성
    const count = 15 + Math.floor(Math.random() * 10);
    for (let i = 0; i < count; i++) {
        feathers.push(new Feather(x, y));
    }
    playSound('feather'); // [신규] 깃털 효과음 재생
}

function handleObstacles() {
    if (gameState === STATE.PLAYING) {
        obstacleTimer += speedMultiplier;

        let spawnThreshold = 0;
        let patternMode = 0; // 0: 단일(1단계), 1: 복합(2단계), 2: 초고속 전용(3단계)

        if (level <= 3) {
            // 🟢 1단계: 부스트 학습 (여유로움)
            spawnThreshold = 130 + Math.random() * 50; 
            patternMode = 0;
        } else if (level <= 7) {
            // 🟡 2단계: 패턴 대응 구간 (밀도 높음, 억까 있음)
            spawnThreshold = 65 + Math.random() * 35;
            patternMode = 1;
        } else {
            // 🔴 3단계 (LV 8~): 초고속 서바이벌 구간
            // 💡 [핵심 수정] 속도가 엄청 빠르므로 프레임 간격을 대폭 줄여 화면을 꽉 채웁니다!
            spawnThreshold = 45 + Math.random() * 30; 
            patternMode = 2; // 초고속 전용 패턴 활성화
        }

        if (obstacleTimer > spawnThreshold) {
            obstacleTimer = 0; 

            if (patternMode === 1) {
                // [기존 유지] 2단계 억까 패턴
                const patternType = Math.random();
                if (patternType < 0.25) { 
                    obstacles.push(new Obstacle('fire'));
                } else if (patternType < 0.5) { 
                    obstacles.push(new Obstacle('eagle'));
                } else if (patternType < 0.75) { // 좁은 이중 불꽃 (긴 점프 필요)
                    const fire1 = new Obstacle('fire');
                    const fire2 = new Obstacle('fire');
                    fire2.x = fire1.x + 140;
                    obstacles.push(fire1, fire2);
                } else { // 떨어진 이중 불꽃 (따닥 점프)
                    const fire1 = new Obstacle('fire');
                    const fire2 = new Obstacle('fire');
                    fire2.x = fire1.x + 260;
                    obstacles.push(fire1, fire2);
                    obstacleTimer = -20; 
                }
            } else if (patternMode === 2) {
                // 💡 [신규 추가] 3단계 초고속 패턴
                // 좁은 이중 불꽃(140px)은 속도가 너무 빠르면 절대 피할 수 없으므로 빼고,
                // 리듬감 있게 계속 점프해야 하는 패턴으로 재구성합니다.
                const patternType = Math.random();
                if (patternType < 0.4) { 
                    obstacles.push(new Obstacle('fire'));
                } else if (patternType < 0.7) { 
                    obstacles.push(new Obstacle('eagle'));
                } else { 
                    // 속도가 매우 빠르므로, 거리를 350px로 넉넉히 벌려준 쾌속 이중 점프 패턴!
                    const fire1 = new Obstacle('fire');
                    const fire2 = new Obstacle('fire');
                    fire2.x = fire1.x + 350;
                    obstacles.push(fire1, fire2);
                    obstacleTimer = -30; // 연속 패턴이 끝난 후 잠깐의 숨고르기
                }
            } else {
                // 1단계 (단일 장애물)
                obstacles.push(new Obstacle(Math.random() < 0.5 ? 'fire' : 'eagle'));
            }
        }
    }
    obstacles.forEach(obs => {
        obs.update(); obs.draw();
        if (gameState === STATE.PLAYING && !chicken.isInvincible) {
            const pX = chicken.x + 30, pY = chicken.y + 30, pW = chicken.width - 60, pH = chicken.height - 40;
            const oX = obs.x + obs.hitbox.xOffset, oY = obs.y + obs.hitbox.yOffset, oW = obs.hitbox.width, oH = obs.hitbox.height;
            if (pX < oX + oW && pX + pW > oX && pY < oY + oH && pY + pH > oY) {
                gameState = STATE.CRASHED;
                chicken.crashFrame = 0;
                // [신규] 깃털 폭발 효과 생성
                createFeatherExplosion(chicken.x + chicken.width / 2, chicken.y + chicken.height / 2);
                chicken.dy = -5;
                playSound('crash'); // [신규] 충돌 효과음 재생
            }
        }
    });
    obstacles = obstacles.filter(obs => !obs.markedForDeletion);
}

// [4. 핵심 제어 함수]

/**
 * [신규] 코인 UI 업데이트 함수
 * 프로필 모달, 게임 오버레이(시작/일시정지/종료)의 코인 수치를 동기화합니다.
 */
function updateCoinUI() {
    // [수정] 로그인 여부에 따라 코인 표시 (게스트 코인 지원)
    const coinVal = currentUser ? currentUser.coins : guestCoins;
    if (document.getElementById('profile-coin-count')) document.getElementById('profile-coin-count').innerText = coinVal;
    document.querySelectorAll('.coin-stat strong').forEach(el => {
        el.innerText = coinVal;
    });
    // [신규] 코인 변동 시 유저 정보 저장 (영속성 유지)
    // [신규] 광고 버튼 텍스트 업데이트 (남은 횟수 표시)
    const btnRecharge = document.getElementById('btn-recharge-coin');
    if (btnRecharge) {
        const adData = getAdData();
        btnRecharge.innerText = `충전 (${adData.count}/${AD_CONFIG.DAILY_LIMIT})`;
    }
}

/**
 * [신규] 게임 시작/재시작 버튼의 코인 비용 표시를 업데이트합니다.
 */
function updateButtonCosts() {
    const startCostVal = document.querySelector('#btn-race-start .play-cost strong');
    const restartCostSpan = document.querySelector('#btn-restart .play-cost');
    const restartCostVal = document.querySelector('#btn-restart .play-cost strong');

    if (currentGameMode === 'single') {
        if (startCostVal) startCostVal.innerText = '1';
        if (restartCostSpan) restartCostSpan.style.display = 'flex';
        if (restartCostVal) restartCostVal.innerText = '1';
    } else if (currentGameMode === 'multi' && currentRoom) {
        // 멀티모드: 시작 버튼에는 방 설정 시의 시도 횟수(비용) 표시
        // 이미 지불했는지 확인하여 비용 표시 (지불했으면 0)
        const userRoomState = (currentUser && currentUser.joinedRooms) ? currentUser.joinedRooms[currentRoom.id] : null;
        // 💡 횟수와 상관없이 지불 안 했으면 무조건 2코인으로 표시!
        const cost = (userRoomState && userRoomState.isPaid) ? 0 : 2;
        if (startCostVal) startCostVal.innerText = cost;
        // 멀티모드: 재시작 버튼에서는 코인 표시 숨김 (이미 지불됨)
        if (restartCostSpan) restartCostSpan.style.display = 'none';
    }
}

/**
 * [신규] 게임 컨트롤러의 표시 상태를 설정하고, 그에 따라 #scene-game에 클래스를 토글합니다.
 * @param {boolean} visible - 컨트롤러를 표시할지 여부
 */
function setControlsVisibility(visible) {
    const controlContainer = document.getElementById('control-container');
    const sceneGame = document.getElementById('scene-game');
    if (controlContainer && sceneGame) {
        if (visible) {
            controlContainer.classList.remove('slide-out');
            sceneGame.classList.remove('controls-hidden');
        } else {
            controlContainer.classList.add('slide-out');
            sceneGame.classList.add('controls-hidden');
        }
    }
}

// [신규] 사운드 재생 헬퍼 함수
function playSound(key) {
    // bgm일 때는 isBgmOn을 확인하고, 그 외의 효과음일 때는 isEffectOn을 확인합니다.
    if (key === 'bgm' && !isBgmOn) return;
    if (key !== 'bgm' && !isEffectOn) return;

    // 🟢 BGM을 포함한 모든 사운드를 iOS 네이티브로 넘김 (key !== 'bgm' 조건 삭제)
    if (window.webkit && window.webkit.messageHandlers.playSound) {
        window.webkit.messageHandlers.playSound.postMessage(key);
        return; 
    }

    // 3. 기존 로직 (안드로이드, 일반 웹 브라우저용)
    if (!audios[key]) return;
    
    if (key === 'bgm') {
        audios[key].volume = 0.5;
        audios[key].play().catch((e) => console.warn('BGM 재생 실패:', e));
    } else {
        const sound = audios[key].cloneNode();
        if (key === 'jump') sound.volume = 0.1;
        else if (key === 'crash' || key === 'feather' || key === 'start') sound.volume = 0.8;
        else sound.volume = 0.1;
        sound.play().catch((e) => console.warn('효과음 재생 실패:', e));
    }
}

function pauseBGM() {
    // 🟢 네이티브 BGM 일시정지 브릿지 호출
    if (window.webkit && window.webkit.messageHandlers.pauseBGM) {
        window.webkit.messageHandlers.pauseBGM.postMessage("bgm");
        return;
    }
    if (audios['bgm']) audios['bgm'].pause();
}

function stopBGM() {
    // 🟢 네이티브 BGM 정지 브릿지 호출
    if (window.webkit && window.webkit.messageHandlers.stopBGM) {
        window.webkit.messageHandlers.stopBGM.postMessage("bgm");
        return;
    }
    if (audios['bgm']) { audios['bgm'].pause(); audios['bgm'].currentTime = 0; }
}

function clearAutoActionTimer() {
    if (autoActionTimer) {
        clearInterval(autoActionTimer);
        autoActionTimer = null;
    }
    // 모든 메시지 숨김
    document.querySelectorAll('.time-message').forEach(el => el.style.display = 'none');
}

function startAutoActionTimer(duration, type, selector) {
    // [수정] 이미 타이머가 실행 중인 경우 (예: 홈화면에 나갔다 온 경우),
    // 타이머를 새로 시작하지 않고, 메시지만 다시 보이도록 처리합니다.
    if (autoActionTimer && type === 'deductAttempt') {
        clearAutoActionTimer();
    }

    if (autoActionTimer) {
        const el = document.querySelector(selector);
        if (el) el.style.display = 'block';
        return;
    }
    const el = document.querySelector(selector);
    if (!el) return;

    el.style.display = 'block';
    let timeLeft = duration;

    const updateText = () => {
        if (type === 'exit') el.innerText = `${timeLeft}초 후 자동 아웃`; // 로비 퇴장
        else if (type === 'deductAttempt') el.innerText = `${timeLeft}초 후 1회 차감`; // 시도 횟수 차감
        else el.innerText = `${timeLeft}초 후 자동 시작`;
    };
    updateText();

    autoActionTimer = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearAutoActionTimer();
            if (type === 'exit') {
                // [FIX] 시작 화면 타임아웃은 '완전 퇴장'으로 처리해야 합니다.
                exitToLobby(true);
            } else if (type === 'deductAttempt') { // [신규] 시도 횟수 차감 로직
                if (currentGameMode === 'multi' && currentRoom) {
                    // [수정] 사용자별 시도 횟수 차감
                    if (currentUser && currentUser.joinedRooms[currentRoom.id]) {
                        currentUser.joinedRooms[currentRoom.id].usedAttempts++;
                        saveUserDataToFirestore(); // [FIX] 시도 횟수 변경 시 서버에 즉시 저장
                    }
                    const myId = currentUser ? currentUser.id : 'me';
                    handleGameOverUI(); // UI 갱신 및 다음 타이머 시작 또는 게임 오버 처리
                }
            }
            else { // [기존] 자동 시작/재개 (일시정지 화면에서만 유효)
                if (gameState === STATE.PAUSED) togglePause();
            }
        } else {
            updateText();
        }
    }, 1000);
}

function resetGame() {
    clearAutoActionTimer(); // 타이머 초기화
    lastFrameTime = 0;
    if (continueTimerId) {
        clearInterval(continueTimerId);
        continueTimerId = null;
    }
    gameState = STATE.IDLE; // 초기 상태를 IDLE(대기)로 설정
    stopBGM();

    // 💡 [기획] 멀티플레이 재시작 시 난이도 유지 확인
    const isMultiRetry = (currentGameMode === 'multi' && currentRoom &&
                         currentUser && currentUser.joinedRooms[currentRoom.id]?.usedAttempts > 0);

    if (!isMultiRetry) {
        // 싱글 게임이거나 멀티 첫 판일 때: 1레벨부터 새출발
        baseGameSpeed = 15;
        gameSpeed = baseGameSpeed;
        level = 1;
        nextLevelFrameThreshold = 400;
    } else {
        // 멀티플레이 재시작 시: 기존 레벨과 기본 속도 유지
        console.log(`🚀 멀티플레이 재시작: 난이도 유지 (LV.${level}, Speed:${baseGameSpeed})`);
        gameSpeed = baseGameSpeed;
    }

    // 🚨 공통 초기화 항목 (여기서 중복으로 레벨을 덮어씌우던 코드를 삭제했습니다!)
    hasRevived = false;
    chicken.isInvincible = false;
    gameFrame = 0;
    score = 0;
    isJumpPressed = false;
    obstacleTimer = 0;
    skyBg.x = 0; floorBg.x = 0; obstacles = []; feathers = [];
    chicken.y = FLOOR_Y; chicken.dy = 0; chicken.x = 100; chicken.targetX = 100;
    chicken.isBoosting = false; chicken.boostProgress = 0; chicken.crashFrame = 0;
    dog.x = dog.initialX; dog.targetX = dog.initialX;

    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('game-start-screen').classList.add('hidden');
    document.getElementById('game-pause-screen').classList.add('hidden');
    document.getElementById('game-continue-screen').classList.add('hidden');

    const btnJump = document.getElementById('btn-jump');
    if (btnJump) btnJump.classList.remove('pressed');
    const btnBoost = document.getElementById('btn-boost');
    if (btnBoost) btnBoost.classList.remove('pressed');

    // HUD 점수 및 레벨 초기화/갱신
    const scoreEl = document.querySelector('.hud-score');
    const levelEl = document.querySelector('.hud-level');
    if (scoreEl) {
        scoreEl.querySelector('.score-val').innerText = '0';
        scoreEl.classList.remove('green', 'yellow', 'orange', 'red');
    }
    if (levelEl) {
        // 유지된 레벨이 화면에 즉시 표시됩니다.
        levelEl.innerText = 'LV.' + level;
    }

    const btnPauseToggle = document.getElementById('btn-pause-toggle');
    if (btnPauseToggle) btnPauseToggle.classList.remove('paused');
}

function drawStaticFrame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    skyBg.draw(0); floorBg.draw(GAME_HEIGHT - 124);
    dog.draw(); chicken.draw();
}

/**
 * 💡 [신규] 뱃지 코인 교환 함수
 */
async function exchangeBadge(rank) {
    if (!isLoggedIn || !currentUser || !currentUser.badges[rank] || currentUser.badges[rank] <= 0) return;

    // 보상 설정
    const rewards = { 1: 3, 2: 2, 3: 1 };
    const rewardCoin = rewards[rank];

    // 1. 데이터 업데이트
    currentUser.badges[rank] -= 1;
    currentUser.coins += rewardCoin;

    // 2. 효과음 및 애니메이션
    playSound('start'); // '띠링' 소리 (game-start.mp3)
    showCoinFloatingAnimation(rank);

    // 3. 서버 저장 및 UI 갱신
    await saveUserDataToFirestore();
    showUserProfile(); // 버튼 활성/비활성 상태 즉시 갱신
    updateCoinUI();
}

/**
 * 💡 [신규] 코인 상승 애니메이션
 */
function showCoinFloatingAnimation(rank) {
    const btn = document.getElementById(`btn-exchange-${rank}`);
    if (!btn) return;

    const coinImg = document.createElement('img');
    coinImg.src = 'assets/images/icon_coin.png';
    
    // transform 대신 margin-left를 사용하여 정확한 중앙 정렬
    coinImg.style.cssText = `
        position: absolute; 
        width: 1.25rem; 
        height: 1.25rem; 
        left: 50%; 
        top: 0; 
        margin-left: -0.625rem; /* 1.25rem의 정확한 절반을 왼쪽으로 이동 */
        pointer-events: none;
        animation: coin-up-fade 0.8s ease-out forwards;
        z-index: 100;
    `;

    // 애니메이션 CSS 추가 (최초 1회만)
    if (!document.getElementById('coin-anim-style')) {
        const style = document.createElement('style');
        style.id = 'coin-anim-style';
        style.innerHTML = `
            @keyframes coin-up-fade {
                0% { transform: translateY(0); opacity: 1; }
                100% { transform: translateY(-80px); opacity: 0; } /* 위로 80px 상승 */
            }
        `;
        document.head.appendChild(style);
    }

    btn.style.position = 'relative';
    btn.appendChild(coinImg);
    
    setTimeout(() => coinImg.remove(), 800);
}

/**
 *  Firebase Firestore에 점수 저장
 */
function saveScoreToFirebase(finalScore) {
    const userNickname = (currentUser && currentUser.nickname) ? currentUser.nickname : "지나가던 병아리";
    const uid = (currentUser && currentUser.id) ? currentUser.id : null;

    // 게스트 유저는 글로벌 랭킹에 저장하지 않음
    if (!uid) {
        console.log("⚠️ 게스트 기록은 글로벌 랭킹에 등록되지 않습니다.");
        return;
    }

    const rankRef = db.collection("rankings").doc(uid); // 고유 ID(uid)로 덮어쓰기 설정

    rankRef.get().then((doc) => {
        if (doc.exists) {
            const currentBest = doc.data().score || 0;
            // 기존 점수보다 높을 때만 갱신
            if (finalScore > currentBest) {
                rankRef.update({
                    nickname: userNickname,
                    score: finalScore,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                }).then(() => console.log("✅ 최고 점수가 랭킹에 갱신되었습니다!"));
            }
        } else {
            // 기록이 아예 없으면 새로 생성
            rankRef.set({
                uid: uid,
                nickname: userNickname,
                score: finalScore,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => console.log("✅ 랭킹에 새 기록이 등록되었습니다!"));
        }
    }).catch((error) => {
        console.error("❌ 랭킹 점수 저장 실패:", error);
    });
}

function handleGameOverUI() {
    const govTitle = document.getElementById('gov-title');
    const govMsg = document.getElementById('gov-message');
    const btnRestart = document.getElementById('btn-restart');
    const btnDeleteRoom = document.getElementById('btn-delete-room');
    const govScreen = document.getElementById('game-over-screen');
    stopBGM(); // [신규] 게임 오버 시 BGM 정지

    if (currentGameMode === 'single') {
        const finalScore = Math.floor(score);

        // [신규] 이번 기록을 '내 기록'에 저장
        saveMyScore(finalScore);
        saveScoreToFirebase(finalScore); // [신규] Firebase에 점수 저장
        govTitle.innerText = "GAME OVER";
        govMsg.innerText = ``; // 기록 메시지를 표시하지 않도록 비워둡니다.
        btnRestart.style.display = 'block';
        if (btnDeleteRoom) btnDeleteRoom.style.display = 'none';
    } else {
        if (!currentRoom) return;

        const myId = currentUser ? currentUser.id : 'me';
        const userUsedAttempts = (currentUser && currentUser.joinedRooms[currentRoom.id]) ? currentUser.joinedRooms[currentRoom.id].usedAttempts : 0;
        const myPlayer = multiGamePlayers.find(p => p.id === myId);
        if (!myPlayer) return;

        const participantDocRef = db.collection('rooms').doc(currentRoom.id).collection('participants').doc(myId);

        // [FIX] myPlayer.attemptsLeft는 onSnapshot에 의해 덮어쓰여질 수 있으므로, 지역 변수로 남은 횟수를 명확하게 계산하고 사용합니다.
        const attemptsLeft = currentRoom.attempts - userUsedAttempts;

        // [FIX] 충돌 직후 점수가 NaN이 되는 문제 해결
        let validScore = score;
        if (isNaN(validScore)) validScore = 0;

        // [FIX] 랭킹 표시용 점수(displayScore) 계산
        let finalDisplayScore = 0;
        if (currentRoom.rankType === 'total') {
            finalDisplayScore = (myPlayer.totalScore || 0);
        } else {
            finalDisplayScore = (myPlayer.bestScore || 0);
        }

        if (attemptsLeft > 0) { // 남은 시도 횟수가 있을 경우
            govTitle.innerText = "WOOPS!";
            govMsg.innerText = `남은 횟수 : ${attemptsLeft}/${currentRoom.attempts}`;
            myPlayer.status = 'waiting'; // 대기 상태로 변경
            // [2단계] Firestore 상태 업데이트
            participantDocRef.update({ status: 'waiting' }).catch(e => console.error("상태 업데이트 실패(waiting)", e));
            startAutoActionTimer(30, 'deductAttempt', '#game-over-screen .time-message'); // [수정] 1회 차감 타이머 시작
            btnRestart.style.display = 'block';
            if (btnDeleteRoom) btnDeleteRoom.style.display = 'none';
        } else {
            govTitle.innerText = "GAME OVER";
            govMsg.innerText = "모든 시도 횟수를 사용했습니다.";

            // [신규] 멀티플레이 상태 업데이트 (탈락/종료)
            if (myPlayer) myPlayer.status = 'dead';
            // [2단계] Firestore 상태 업데이트
            participantDocRef.update({ status: 'dead' }).catch(e => console.error("상태 업데이트 실패(dead)", e));

            btnRestart.style.display = 'none';
            if (btnDeleteRoom) btnDeleteRoom.style.display = 'block';
        }

        // [리팩토링] 최종 점수 업데이트 로직을 if/else 블록 밖으로 이동하여 중복을 제거합니다.
        participantDocRef.update({
            totalScore: myPlayer.totalScore,
            bestScore: myPlayer.bestScore,
            displayScore: finalDisplayScore
        }).then(() => {
            console.log(`✅ 최종 점수(${Math.floor(finalDisplayScore)})를 서버에 저장했습니다.`);
        }).catch(error => {
            console.error("❌ 최종 점수 서버 저장 실패:", error);
        });
    }

    govScreen.classList.remove('hidden');
    setControlsVisibility(false); // [수정] 게임 종료 시 컨트롤 버튼 숨김

    renderRoomLists(); // 목록 갱신
    renderMultiRanking(); // [신규] 게임 오버 시 랭킹 즉시 갱신
}

/**
 * [3단계] 멀티플레이 게임 상태를 실시간으로 처리하고 Firestore와 동기화합니다.
 * 이 함수는 gameLoop 내에서 호출됩니다.
 */
function handleMultiplayerTick() {
    if (currentGameMode !== 'multi' || !currentRoom || !currentUser) return;

    // 1. 최종 결과가 확정된 방은 더 이상 업데이트하지 않습니다.
    if (currentRoom.status === 'finished') return;

    const now = Date.now();
    const myId = currentUser.id;
    const isHost = currentUser.id === currentRoom.creatorUid;
    const isAdmin = currentUser && currentUser.isAdmin; // [신규] 관리자 여부 확인
    const participantsRef = db.collection('rooms').doc(currentRoom.id).collection('participants');

    // 2. 플레이어 자신의 로컬 점수를 즉시 업데이트합니다. (UI 반응성용)
    const myPlayer = multiGamePlayers.find(p => p.id === myId);
    // [FIX] playing 뿐만 아니라 crashed 상태에서도 점수 동기화
    if (myPlayer && (gameState === STATE.PLAYING || gameState === STATE.CRASHED)) {
        myPlayer.score = score;
    }

    // 3. Firestore 업데이트 (쓰로틀링 적용)
    if (now - lastFirestoreUpdateTime > FIRESTORE_UPDATE_INTERVAL) {
        lastFirestoreUpdateTime = now;
        const batch = db.batch();

        // 3a. 내 정보 업데이트 (내가 플레이 중일 때만)
        if (myPlayer && (myPlayer.status === 'playing' || myPlayer.status === 'waiting')) {
            const myDocRef = participantsRef.doc(myId);

            const currentRunScore = (typeof score === 'number' && !isNaN(score)) ? score : 0;

            const displayScore = (currentRoom.rankType === 'total')
                ? (myPlayer.totalScore || 0) + currentRunScore
                : Math.max((myPlayer.bestScore || 0), currentRunScore);

            if (!isNaN(displayScore)) {
                batch.update(myDocRef, {
                    displayScore: Math.floor(displayScore)
                });
            }
        }

        // 3b. 봇 정보 업데이트 (방장 또는 관리자 수행)
        if (isHost || isAdmin) {
            multiGamePlayers.forEach(bot => {
                if (!bot.isBot || bot.status === 'dead') return;

                let { status, score, totalScore, bestScore, attemptsLeft, startDelay, targetScore } = bot;
                score = score || 0;
                totalScore = totalScore || 0;
                bestScore = bestScore || 0;
                startDelay = startDelay || 0;
                targetScore = targetScore || 1500;
                attemptsLeft = attemptsLeft !== undefined ? attemptsLeft : currentRoom.attempts;

                if (status === 'waiting') {
                    startDelay -= (FIRESTORE_UPDATE_INTERVAL / 16.67);
                    if (startDelay <= 0) status = 'playing';
                } else if (status === 'playing') {
                    score += baseGameSpeed * 0.05 * (bot.speedFactor || 1) * (FIRESTORE_UPDATE_INTERVAL / 16.67);
                    if (score >= targetScore) {
                        attemptsLeft -= 1;
                        if (currentRoom.rankType === 'total') totalScore += score;
                        else bestScore = Math.max(bestScore, score);
                        score = 0;
                        targetScore = 750 + Math.floor(Math.random() * 1500); // [수정] 봇 목표 점수 하향 조정
                        if (attemptsLeft > 0) {
                            status = 'waiting';
                            startDelay = 60 + Math.floor(Math.random() * 120);
                        } else {
                            status = 'dead';
                        }
                    }
                }

                const botDisplayScore = (currentRoom.rankType === 'total') ? totalScore + score : Math.max(bestScore, score);

                if (isNaN(botDisplayScore)) {
                    console.error("Bot display score is NaN! Skipping update for bot:", bot.id);
                    return;
                }

                const botDocRef = participantsRef.doc(bot.id);
                batch.update(botDocRef, {
                    status,
                    displayScore: Math.floor(botDisplayScore),
                    score,
                    totalScore: Math.floor(totalScore),
                    bestScore: Math.floor(bestScore),
                    attemptsLeft,
                    startDelay,
                    targetScore
                });
            });
        }

        batch.commit().catch(err => console.error("Firestore 일괄 업데이트 실패:", err));
    }

    // 4. 모든 플레이어의 게임 종료 여부 확인
    const isRoomFull = currentRoom && multiGamePlayers.length >= currentRoom.limit;
    const areAllPlayersDead = multiGamePlayers.length > 0 && multiGamePlayers.every(p => p.status === 'dead');

    if (isRoomFull && areAllPlayersDead && currentRoom.status !== 'finished') {
        currentRoom.status = 'finished';
        db.collection('rooms').doc(currentRoom.id).update({ status: 'finished' })
            .then(() => console.log(`✅ 방 [${currentRoom.id}] 상태를 'finished'로 최종 변경했습니다.`));
    }
}

// 💡 [신규 추가] 60 FPS 고정을 위한 타이머 변수
let lastFrameTime = 0;
const TARGET_FPS = 60;
const FRAME_INTERVAL = 1000 / TARGET_FPS; // 약 16.66ms

function gameLoop(timestamp) {
    // 1. 모니터 주사율에 맞춰 무한 반복을 예약합니다. (맨 위에 한 번만 배치)
    gameLoopId = requestAnimationFrame(gameLoop);

    // 2. 최초 실행 시 timestamp가 없으면 현재 시간을 강제로 넣어줍니다.
    if (!timestamp) timestamp = performance.now();
    if (!lastFrameTime) lastFrameTime = timestamp;

    // 3. 이전 프레임에서부터 지나간 시간(경과 시간)을 계산합니다.
    const deltaTime = timestamp - lastFrameTime;

    // 4. 🚨 [핵심] 16.66ms(60FPS 기준)가 아직 안 지났다면 이번 턴의 그리기는 무시(return)합니다!
    if (deltaTime < FRAME_INTERVAL) return;

    // 5. 다음 프레임 계산을 위해 마지막 실행 시간을 갱신합니다. (초과된 시간 오차 보정)
    lastFrameTime = timestamp - (deltaTime % FRAME_INTERVAL);

    // [신규] IDLE 상태: 게임 시작 전 대기 상태 (봇 시뮬레이션은 계속 수행)
    if (gameState === STATE.IDLE) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        skyBg.draw(0); floorBg.draw(GAME_HEIGHT - 124);
        dog.draw(); chicken.draw(); // 정적 그리기

        // [핵심] 대기 상태에서도 멀티플레이 로직(봇 점수 계산 등)은 계속 실행되어야 함
        handleMultiplayerTick();
        return; 
    }

    if (gameState === STATE.PLAYING) {
        // 1. 부스트 보너스 계산 (하이리스크 하이리턴)
        let boostBonus = 0;
        if (chicken.boostProgress >= 100) boostBonus = 0.6;     // MAX 도달 시에만: +60% (RED)
        else if (chicken.boostProgress >= 70) boostBonus = 0.4; // 70% 이상: +40% (ORANGE)
        else if (chicken.boostProgress >= 40) boostBonus = 0.25;// 40% 이상: +25% (YELLOW)
        else if (chicken.boostProgress >= 10) boostBonus = 0.1; // 10% 이상: +10% (GREEN)

        // 2. 거리(점수) 계산: 게임 속도에 보너스 배율 적용
        score += (gameSpeed * 0.05) * (1 + boostBonus);

        // 3. 난이도 조절: 시간에 따라 게임 속도 증가 (프레임 기준)
        if (gameFrame >= nextLevelFrameThreshold) {
            baseGameSpeed += 1.0;           
            nextLevelFrameThreshold += 400; 
            level++;
            const levelEl = document.querySelector('.hud-level');
            if (levelEl) levelEl.innerText = 'LV.' + level;
        }

        // 4. HUD 점수판 업데이트
        const scoreEl = document.querySelector('.hud-score');
        if (scoreEl) {
            scoreEl.classList.remove('green', 'yellow', 'orange', 'red');
            if (chicken.boostProgress >= 100) scoreEl.classList.add('red');
            else if (chicken.boostProgress >= 70) scoreEl.classList.add('orange');
            else if (chicken.boostProgress >= 40) scoreEl.classList.add('yellow');
            else if (chicken.boostProgress >= 10) scoreEl.classList.add('green');

            let displayVal = Math.floor(score);
            if (currentGameMode === 'multi' && currentRoom && currentRoom.rankType === 'total') {
                const myId = currentUser ? currentUser.id : 'me';
                const myPlayer = multiGamePlayers.find(p => p.id === myId);
                if (myPlayer) displayVal += Math.floor(myPlayer.totalScore);
            }
            scoreEl.querySelector('.score-val').innerText = displayVal.toLocaleString();
        }
        const myRankingScoreEl = document.getElementById('my-ranking-score');
        if (myRankingScoreEl) {
            const realTimeRankingScore = calculateMyLocalDisplayScore();
            myRankingScoreEl.innerHTML = `${Math.floor(realTimeRankingScore).toLocaleString()}<small>M</small>`;
        }

        // 부스트 및 기본 속도 조절
        if (chicken.isBoosting) {
            if (gameSpeed < baseGameSpeed + 5) gameSpeed += 0.2; 
            speedMultiplier = 2;
        } else {
            if (gameSpeed > baseGameSpeed) gameSpeed -= 0.2; 
            else gameSpeed = baseGameSpeed; 
            speedMultiplier = 1;
        }
    } else if (gameState === STATE.CRASHED) {
        gameSpeed *= FRICTION;
        if (gameSpeed < 0.1) {
            gameSpeed = 0;
            if (chicken.y >= FLOOR_Y) {
                if (currentGameMode === 'single' && !hasRevived) {
                    // 💡 [수정] 코인이 1개 이상이면 이어하기 창, 0개면 바로 결과창(게임오버) 직행!
                    const currentCoins = currentUser ? currentUser.coins : guestCoins;
                    if (currentCoins >= 1) {
                        showContinueScreen(); 
                    } else {
                        gameState = STATE.GAMEOVER;
                        handleGameOverUI();
                    }
                } else {
                    gameState = STATE.GAMEOVER;
                    if (currentGameMode === 'multi' && currentRoom && currentUser) {
                        const myId = currentUser.id;
                        const myPlayer = multiGamePlayers.find(p => p.id === myId);
                        if (myPlayer) {
                            if (currentRoom.rankType === 'total') {
                                if (isNaN(score)) score = 0;
                                myPlayer.totalScore = (myPlayer.totalScore || 0) + score;
                            } else {
                                myPlayer.bestScore = Math.max((myPlayer.bestScore || 0), score);
                            }
                            myPlayer.score = 0; 
                            score = 0;          
                        }
                        if (currentUser && currentUser.joinedRooms[currentRoom.id]) {
                            currentUser.joinedRooms[currentRoom.id].usedAttempts++;
                            saveUserDataToFirestore(); 
                        }
                    }
                    handleGameOverUI();
                }
            }
        }
    }

    // [3단계] 멀티플레이 실시간 로직 처리
    handleMultiplayerTick();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    skyBg.draw(0); floorBg.draw(GAME_HEIGHT - 124);
    dog.update(); dog.draw();
    handleObstacles(); chicken.update(); chicken.draw();
    feathers.forEach(f => { f.update(); f.draw(); });
    feathers = feathers.filter(f => f.opacity > 0); 

    gameFrame++;
}

// [5. UI 렌더링 및 장면 제어]

/**
 * [신규] 내 최고 점수의 전체 순위를 계산합니다.
 */
function getMyOverallRank(myBestScore) {
    if (myBestScore <= 0) return null;
    for (let i = 0; i < top100Scores.length; i++) {
        if (myBestScore > top100Scores[i].score) return i + 1;
    }
    return top100Scores.length + 1;
}

/**
 * [신규] '내 기록'을 localStorage에 저장하고 목록을 다시 그립니다.
 */
async function saveMyScore(newScore) {
    if (newScore <= 0) return;

    const scoreEntry = {
        score: newScore,
        date: new Date().toISOString()
    };
    const MAX_SCORES = 50; // 최대 50개 기록 저장

    // 🚨 1. 게스트 유저일 경우: 서버 대신 로컬 스토리지(기기)에 저장!
    if (!currentUser) {
        let guestScores = JSON.parse(localStorage.getItem('chickenRunGuestScores') || '[]');
        guestScores.push(scoreEntry);
        guestScores.sort((a, b) => b.score - a.score);
        
        if (guestScores.length > MAX_SCORES) {
            guestScores.length = MAX_SCORES;
        }

        // 로컬 스토리지에 덮어쓰기
        localStorage.setItem('chickenRunGuestScores', JSON.stringify(guestScores));

        // 화면 업데이트용 변수 동기화
        myScores = guestScores;
        bestScore = guestScores.length > 0 ? guestScores[0].score : 0;
        renderMyRecordList();
        console.log("✅ 게스트의 '내 기록'이 기기에 안전하게 저장되었습니다.");
        return; // 여기서 함수 종료! 서버로는 안 보냄
    }

    // --- (아래는 원래 있던 로그인 유저용 서버 저장 로직 그대로 두시면 됩니다!) ---
    const userScores = currentUser.myScores || [];
    userScores.push(scoreEntry);
    userScores.sort((a, b) => b.score - a.score);

    if (userScores.length > MAX_SCORES) {
        userScores.length = MAX_SCORES;
    }

    const newBestScore = userScores.length > 0 ? userScores[0].score : 0;

    currentUser.myScores = userScores;
    currentUser.bestScore = newBestScore;
    myScores = currentUser.myScores;
    bestScore = currentUser.bestScore;
    renderMyRecordList();

    try {
        const userRef = db.collection("users").doc(currentUser.id);
        await userRef.update({
            myScores: userScores,
            bestScore: newBestScore
        });
        console.log("✅ '내 기록'이 서버에 성공적으로 업데이트되었습니다.");
    } catch (error) {
        console.error("❌ '내 기록' 서버 업데이트 실패:", error);
    }
}

/**
 * [신규] '내 기록' 탭의 목록을 그립니다.
 */
function renderMyRecordList(append = false) {
    const listEl = document.querySelector('#content-my-record .score-list');
    if (!listEl) return;

    if (!append) {
        listEl.innerHTML = '';
        displayedMyRecordsCount = 20; // 초기화
    }

    if (myScores.length === 0) {
        listEl.innerHTML = '<li><div class="info" style="text-align:center; width:100%;"><p>아직 기록이 없습니다. 첫 도전을 해보세요!</p></div></li>';
        return;
    }

    const myRank = getMyOverallRank(bestScore);

    // 현재 표시된 개수 이후부터 다음 20개를 가져옴
    const currentItemsCount = listEl.querySelectorAll('li:not(.top)').length + (listEl.querySelector('li.top') ? 1 : 0);
    const startIndex = append ? currentItemsCount : 0;

    // [보정] 표시할 개수가 전체 데이터 길이를 넘지 않도록 설정
    const itemsToShow = myScores.slice(startIndex, Math.min(displayedMyRecordsCount, myScores.length));

    itemsToShow.forEach((record, idx) => {
        const globalIndex = startIndex + idx;
        const li = document.createElement('li');
        const d = new Date(record.date);
        const dateString = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일<br />${d.getHours()}시 ${d.getMinutes()}분`;

        if (globalIndex === 0 && bestScore > 0) {
            li.className = 'top';
            const rankText = myRank ? `${myRank}위` : '순위 없음';
            li.innerHTML = `<div class="info"><label><img class="top" src="assets/images/icon_top.png"/><small>${rankText}</small></label><p class="score-display">${record.score.toLocaleString()}<small>M</small></p></div><div class="more"><span>${dateString}</span></div>`;
        } else {
            li.innerHTML = `<div class="info"><p class="score-display">${record.score.toLocaleString()}<small>M</small></p></div><div class="more"><span>${dateString}</span></div>`;
        }
        listEl.appendChild(li);
    });
}

/**
 * 'Top 100' 탭의 목록을 그립니다.
 */
function renderTop100List() {
    const listEl = document.querySelector('#content-top-100 .score-list');
    if (!listEl) return;
    
    // 리스트를 비울 때, 안내 문구를 가장 먼저 고정으로 넣어줍니다!
    listEl.innerHTML = '<li class="notice">※ 로그인 사용자의 점수만 순위에 기록됩니다.</li>';

    // 💡 데이터를 아직 못 가져와서 배열이 비어있을 때 '로딩 중' 표시!
    if (top100Scores.length === 0) {
        listEl.innerHTML += '<li><div class="info" style="text-align:center; width:100%;"><p>랭킹 데이터를 불러오는 중입니다...</p></div></li>';
        return;
    }

    top100Scores.forEach(entry => {
        const rank = entry.rank;
        const li = document.createElement('li');
        let rankDisplay = (rank === 1) ? `<img class="icon" src="assets/images/icon_flag1th.png" />` : (rank === 2) ? `<img class="icon" src="assets/images/icon_flag2th.png" />` : (rank === 3) ? `<img class="icon" src="assets/images/icon_flag3th.png" />` : `${rank}<small>th</small>`;

        li.innerHTML = `<span class="stat">${rankDisplay}</span><div class="info"><p class="score-display">${entry.score.toLocaleString()}<small>M</small></p></div><div class="more"><span>${entry.name}</span></div>`;
        listEl.appendChild(li);
    });
}

/**
 * [수정] Firestore에서 직접 여러 사용자의 닉네임을 조회합니다.
 * - Cloud Function의 CORS 이슈를 해결하기 위해 직접 조회 방식을 사용합니다.
 * @param {string[]} uids - 닉네임을 조회할 사용자 UID 배열
 * @returns {Promise<Object>} UID를 키로, 닉네임을 값으로 하는 객체
 */
async function fetchNicknames(uids) {
    if (!uids || uids.length === 0) return {};
    
    const uniqueUids = [...new Set(uids)];
    const nicknameMap = {};
    const uidsToFetch = [];

    // 1. 이미 알고 있는 닉네임은 캐시에서 바로 꺼냅니다.
    uniqueUids.forEach(uid => {
        if (nicknameCache[uid]) {
            nicknameMap[uid] = nicknameCache[uid];
        } else {
            uidsToFetch.push(uid);
        }
    });

    // 2. 모르는 닉네임이 있을 때만 Firestore에 물어봅니다.
    if (uidsToFetch.length > 0) {
        try {
            await Promise.all(uidsToFetch.map(async (uid) => {
                if (!uid) return;
                const userDoc = await db.collection("users").doc(uid).get();
                const name = userDoc.exists ? (userDoc.data().nickname || '알수없음') : '알수없음';
                
                // 캐시에 저장
                nicknameCache[uid] = name;
                nicknameMap[uid] = name;
            }));
            console.log("📡 Firestore에서 새 닉네임 로드 완료:", uidsToFetch);
        } catch (error) {
            console.error("❌ 닉네임 로드 실패:", error);
        }
    }

    return nicknameMap;
}

/**
 * [신규] 서버 랭킹 데이터를 화면에 표시
 */
async function displayRankings(rankData) {
    // 💡 [중복 필터링] 동일한 UID를 가진 기존의 과거 기록들이 있다면 가장 높은 점수 하나만 걸러냅니다.
    const uniqueRankData = [];
    const seenUids = new Set();

    rankData.forEach(data => {
        if (data.uid) {
            if (!seenUids.has(data.uid)) {
                seenUids.add(data.uid);
                uniqueRankData.push(data);
            }
        } else {
            // UID가 없는 게스트 기록(혹시 있다면) 그대로 표시
            uniqueRankData.push(data);
        }
    });

    const uids = uniqueRankData.filter(data => data.uid).map(data => data.uid);
    const uniqueUids = [...new Set(uids)];

    const nicknameMap = {};

    // 직접 Firestore에서 닉네임들을 병렬로 가져옵니다.
    try {
        await Promise.all(uniqueUids.map(async (uid) => {
            const userDoc = await db.collection("users").doc(uid).get();
            if (userDoc.exists) {
                nicknameMap[uid] = userDoc.data().nickname;
            }
        }));
    } catch (err) {
        console.warn("⚠️ 일부 닉네임을 최신화하지 못했습니다:", err);
    }

    // 💡 필터링된 배열(uniqueRankData)을 기준으로 등수를 다시 매깁니다.
    top100Scores = uniqueRankData.map((data, index) => ({
        rank: index + 1,
        score: data.score,
        name: (data.uid && nicknameMap[data.uid]) || data.nickname || '지나가던 병아리'
    }));
    
    renderTop100List();
}

async function loadLeaderboard() {
    try {
        const querySnapshot = await db.collection("rankings")
            .orderBy("score", "desc")
            .limit(100)
            .get();

        console.log("🏆 랭킹 데이터를 가져왔습니다:");
        const rankData = [];
        querySnapshot.forEach((doc) => {
            rankData.push(doc.data());
        });
        await displayRankings(rankData);
    } catch (error) {
        console.error("❌ 랭킹 불러오기 실패:", error);
    }
}

/**
 * [신규] Firestore 문서 데이터를 로컬 방 객체 형식으로 변환하는 헬퍼 함수입니다.
 */
function mapFirestoreDocToRoom(doc) {
    const roomData = doc.data();
    return {
        id: doc.id,
        title: roomData.title,
        limit: roomData.maxPlayers,
        current: roomData.currentPlayers,
        attempts: roomData.attempts,
        status: roomData.status,
        rankType: roomData.rankType,
        isLocked: !!roomData.password,
        password: roomData.password,
        creatorUid: roomData.creatorUid,
        createdAt: roomData.createdAt 
    };
}

let roomFetchPromise = null; 

function fetchRaceRooms(loadMore = false) {
    if (roomFetchPromise && !loadMore) return roomFetchPromise;

    let resolvePromise;
    roomFetchPromise = new Promise((resolve, reject) => {
        resolvePromise = resolve; // Promise 종료를 나중에 제어하기 위해 저장
        
        if (loadMore) {
            currentRoomLimit += ROOMS_PER_PAGE;
        } else {
            currentRoomLimit = ROOMS_PER_PAGE;
        }

        if (unsubscribeRoomListener) {
            unsubscribeRoomListener();
            unsubscribeRoomListener = null;
        }

        let isFirstCallback = true;

        unsubscribeRoomListener = db.collection('rooms')
            .orderBy('createdAt', 'desc')
            // 💡 [수정] 필터링 돼서 모자라는 일이 없도록, 요청한 개수보다 +20개를 더 여유 있게 가져옵니다.
            .limit(currentRoomLimit + 20)
            .onSnapshot((querySnapshot) => {

                if (querySnapshot.metadata.fromCache) {
                    console.log("⏳ 캐시 데이터 무시, 서버 응답 대기 중...");
                    return;
                }

                if (isFirstCallback) {
                    const newRooms = [];
                    querySnapshot.forEach(doc => {
                        const roomData = mapFirestoreDocToRoom(doc);

                        if (roomData.current < roomData.limit && roomData.status !== 'finished') {
                            newRooms.push(roomData);
                        }
                    });

                    raceRooms = newRooms;
                    isFirstCallback = false;

                    // 💡 [수정] 파이어베이스에서 가져온 진짜 문서 개수가 (limit + 20)보다 적다면,
                    // 서버에 있는 방을 바닥까지 다 긁어온 것입니다!
                    if (querySnapshot.docs.length < currentRoomLimit + 20) {
                        allRoomsLoaded = true;
                    } else {
                        allRoomsLoaded = false;
                    }

                    if (resolvePromise) {
                        resolvePromise();
                        resolvePromise = null;
                    }

                } else {
                    // 화면에 머무는 동안의 실시간 동기화 (Laila님 의도대로 작동하는 마법의 구간)
                    querySnapshot.docChanges().forEach((change) => {
                        const roomData = mapFirestoreDocToRoom(change.doc);
                        const index = raceRooms.findIndex(r => r.id === roomData.id);

                        if (change.type === 'modified') {
                            // 1. 이미 배열에 있는 방이 마감됨 -> index가 있으므로 정보가 덮어씌워지고 '마감' 표시로 변경됨
                            // 2. 마감돼서 배열에 없던 방에 빈자리가 생김 -> index가 없으므로 무시됨 (새로고침 전까지 안 보임)
                            if (index > -1) Object.assign(raceRooms[index], roomData);
                        } else if (change.type === 'removed') {
                            if (index > -1) raceRooms[index].current = 0;
                        }
                    });
                }

                renderRaceRoomList();
                updateLoadMoreButtons();

            }, (error) => {
                console.error("❌ 방 목록 리스너 오류:", error);
                if (loader) loader.classList.add('hidden');
                reject(error);
            });
    });

    return roomFetchPromise;
}

/**
 * [신규] 참가중인 방 목록을 별도로 불러옵니다.
 */
async function fetchMyRooms() {
    if (!isLoggedIn || !currentUser || !currentUser.joinedRooms) {
        myRooms = [];
        renderMyRoomList();
        updateLoadMoreButtons();
        return;
    }
    const roomIds = Object.keys(currentUser.joinedRooms).sort(); 
    if (roomIds.length === 0) {
        myRooms = [];
        renderMyRoomList();
        updateLoadMoreButtons();
        return;
    }

    const currentJoinedRoomIdsJSON = JSON.stringify(roomIds);
    if (unsubscribeMyRoomsListeners.length > 0 && lastJoinedRoomIdsJSON === currentJoinedRoomIdsJSON) {
        renderMyRoomList();
        updateLoadMoreButtons();
        return;
    }
    lastJoinedRoomIdsJSON = currentJoinedRoomIdsJSON;

    unsubscribeMyRoomsListeners.forEach(unsub => unsub());
    unsubscribeMyRoomsListeners = [];

    myRooms = [];
    const targetIds = roomIds.slice(0, currentMyRoomLimit);

    targetIds.forEach(roomId => {
        const unsub = db.collection('rooms').doc(roomId)
            .onSnapshot(doc => {
                const index = myRooms.findIndex(r => r.id === roomId);

                if (doc.exists) {
                    const roomData = mapFirestoreDocToRoom(doc);
                    if (index > -1) {
                        Object.assign(myRooms[index], roomData);
                    } else {
                        myRooms.push(roomData);
                    }
                } else {
                    if (index > -1) {
                        myRooms.splice(index, 1);
                    }
                    // 💡 [신규 추가] 서버에서 방이 강제 삭제되었다면, 내 유저 데이터의 찌꺼기 기록도 함께 청소합니다!
                    if (currentUser && currentUser.joinedRooms && currentUser.joinedRooms[roomId]) {
                        delete currentUser.joinedRooms[roomId];
                        db.collection("users").doc(currentUser.id).update({
                            [`joinedRooms.${roomId}`]: firebase.firestore.FieldValue.delete()
                        }).catch(e => console.warn("찌꺼기 방 삭제 실패:", e));
                    }
                }
                myRooms.sort((a, b) => {
                    const timeA = a.createdAt?.toMillis() || 0;
                    const timeB = b.createdAt?.toMillis() || 0;
                    return timeB - timeA;
                });
                renderRoomLists(); 
            }, error => {
                console.error(`❌ 내 방 [${roomId}] 실시간 수신 오류:`, error);
            });

        unsubscribeMyRoomsListeners.push(unsub);
    });
}

/**
 * [신규] 사용자 정보 모달을 열고 데이터를 채웁니다.
 */
function showUserProfile() {
    if (!currentUser) {
        document.getElementById('scene-auth').classList.remove('hidden');
        return;
    }

    const scene = document.getElementById('scene-user-profile');
    if (!scene) return;

    // [수정 포인트] 이메일이 있으면 이메일을, 없으면 고유 ID(UID)를 보여줍니다.
    // UID가 너무 길면 뒷부분만 잘라서 보여주는 식으로 가독성을 높일 수 있습니다.
    const displayId = currentUser.id;
    document.getElementById('profile-id').value = displayId;
    document.getElementById('profile-nickname').value = currentUser.nickname || '';
    document.getElementById('badge-count-1').innerText = (currentUser.badges && currentUser.badges['1']) || 0;
    document.getElementById('badge-count-2').innerText = (currentUser.badges && currentUser.badges['2']) || 0;
    document.getElementById('badge-count-3').innerText = (currentUser.badges && currentUser.badges['3']) || 0;

    updateCoinUI();

    scene.classList.remove('hidden');

    for (let i = 1; i <= 3; i++) {
        const count = currentUser.badges[i] || 0;
        document.getElementById(`badge-count-${i}`).innerText = count;
        const btn = document.getElementById(`btn-exchange-${i}`);
        if (btn) btn.disabled = (count <= 0);
    }
}

/**
 * [신규] 게임을 일시정지하거나 이어합니다.
 */
function togglePause() {
    if (gameState === STATE.GAMEOVER || gameState === STATE.CRASHED) return;

    const scenePauseMenu = document.getElementById('game-pause-screen');
    const btnPauseToggle = document.getElementById('btn-pause-toggle');

    if (gameState === STATE.PAUSED) {
        clearAutoActionTimer();
        if (currentGameMode === 'multi') {
            const myId = currentUser ? currentUser.id : 'me';
            const myPlayer = multiGamePlayers.find(p => p.id === myId);
            if (myPlayer) myPlayer.status = 'playing';
        }
        gameState = STATE.PLAYING;
        scenePauseMenu.classList.add('hidden');
        btnPauseToggle.classList.remove('paused');
        lastFrameTime = 0;
        gameLoopId = requestAnimationFrame(gameLoop); 
    } else {
        pauseBGM();
        if (currentGameMode === 'multi') {
            const myId = currentUser ? currentUser.id : 'me';
            const myPlayer = multiGamePlayers.find(p => p.id === myId);
            if (myPlayer) myPlayer.status = 'paused';
        }
        gameState = STATE.PAUSED;
        cancelAnimationFrame(gameLoopId); 
        scenePauseMenu.classList.remove('hidden');
        btnPauseToggle.classList.add('paused');

        if (currentGameMode === 'multi') {
            startAutoActionTimer(30, 'start', '#game-pause-screen .time-message');
        }
    }
}

/**
// 💡 [신규] 이어하기(부활) 관련 핵심 로직
 */

function showContinueScreen() {
    gameState = STATE.GAMEOVER; // 화면 일시정지 효과
    stopBGM(); // 카운트다운 압박을 위해 BGM 정지
    setControlsVisibility(false);
    
    const continueScreen = document.getElementById('game-continue-screen');
    const timerDisplay = document.getElementById('continue-timer-display');
    const btnYes = document.getElementById('btn-continue-yes');
    
    // 코인이 부족하면 '계속' 버튼을 회색으로 만들고 클릭을 막음 (비용 1코인으로 설정)
    const cost = 1; 
    const currentCoins = currentUser ? currentUser.coins : guestCoins;
    
    // 버튼 내 비용 숫자 텍스트를 2로 업데이트
    const costText = btnYes.querySelector('.play-cost strong');
    if(costText) costText.innerText = cost;

    if (currentCoins < cost) {
        btnYes.style.opacity = '0.5';
        btnYes.style.pointerEvents = 'none'; 
    } else {
        btnYes.style.opacity = '1';
        btnYes.style.pointerEvents = 'auto';
    }

    continueScreen.classList.remove('hidden');
    
    // 5초 카운트다운 시작
    let continueCountdown = 5;
    timerDisplay.innerText = continueCountdown;
    
    if (continueTimerId) clearInterval(continueTimerId);
    continueTimerId = setInterval(() => {
        // 💡 1. 만약 이미 0초에 도달한 상태로 1초(대기)가 지났다면? -> 게임 오버!
        if (continueCountdown <= 0) {
            proceedToGameOver(); 
        } 
        // 💡 2. 아직 0초가 아니라면? -> 1을 빼고 화면에 그리기
        else {
            continueCountdown--;
            timerDisplay.innerText = continueCountdown;
        }
    }, 1000);
}

function proceedToGameOver() {
    if (continueTimerId) clearInterval(continueTimerId);
    document.getElementById('game-continue-screen').classList.add('hidden');
    handleGameOverUI(); // 진짜 게임 오버 처리 (서버 저장 등)
}

function resumeFromContinue() {
    const cost = 1; // 이어하기 비용 1코인
    const currentCoins = currentUser ? currentUser.coins : guestCoins;
    if (currentCoins < cost) return; // (안전장치) 코인 없으면 작동안함

    if (continueTimerId) clearInterval(continueTimerId);
    
    // 1. 코인 차감 로직
    if (currentUser) {
        currentUser.coins -= cost;
        syncCoinsToServer(currentUser.coins);
    } else {
        guestCoins -= cost;
        localStorage.setItem('chickenRunGuestCoins', guestCoins);
    }
    updateCoinUI();

    // 2. 화면 가리기 및 버튼 다시 보이기
    document.getElementById('game-continue-screen').classList.add('hidden');
    setControlsVisibility(true);

    // 3. 닭 부활 및 무적 상태 돌입!
    hasRevived = true; // 이번 판 부활권 사용 완료 마킹
    gameState = STATE.PLAYING;
    gameSpeed = baseGameSpeed; // 죽었을 때 0이 된 속도를 복구
    chicken.y = FLOOR_Y;
    chicken.dy = 0;
    chicken.isJumping = false;
    chicken.isInvincible = true; // 무적 On!
    chicken.crashFrame = 0; // 죽은 애니메이션 프레임 리셋
    
    playSound('bgm');

    // 3초 뒤에 무적(깜빡임) 해제
    setTimeout(() => {
        chicken.isInvincible = false;
    }, 4000);
}

/**
 * [신규] 싱글 플레이 시작/재시작 시 코인을 차감합니다.
 * @returns {boolean} 코인 차감에 성공하여 게임을 시작할 수 있으면 true, 아니면 false.
 */
function handleSinglePlayerStartCost() {
    if (currentGameMode !== 'single') return true; // 싱글 모드가 아니면 항상 통과

    const cost = 1; // 싱글 플레이 1회 비용
    const currentCoins = currentUser ? currentUser.coins : guestCoins;

    // 💡 1. 코인이 0개일 때: 바로 광고 시청 모달을 띄우고 게임 시작을 막습니다.
    if (currentCoins < cost) {
        if (typeof window.showCoinShortageModal === 'function') {
            window.showCoinShortageModal();
        }
        return false; // 게임 시작 취소
    }

    // 💡 2. 코인이 있을 때: 정상적으로 1코인 차감 후 게임 시작 허락!
    if (currentUser) {
        currentUser.coins -= cost;
        syncCoinsToServer(currentUser.coins);
    } else {
        guestCoins -= cost;
        localStorage.setItem('chickenRunGuestCoins', guestCoins);
    }
    
    updateCoinUI();
    return true; // 게임 시작 진행
}

/**
 * [신규] 게임 플레이를 시작하는 핵심 로직 (애니메이션 및 상태 변경)
 */
function executeGameStart() {
    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    
    // 멀티플레이 시, 내 상태를 'playing'으로 변경하고 서버에 알림
    if (currentGameMode === 'multi' && currentUser) {
        const myId = currentUser.id;
        const myPlayer = multiGamePlayers.find(p => p.id === myId);
        if (myPlayer) {
            myPlayer.status = 'playing';
            const participantDocRef = db.collection('rooms').doc(currentRoom.id).collection('participants').doc(myId);
            participantDocRef.update({ status: 'playing' }).catch(e => console.error("상태 업데이트 실패(playing)", e));
        }
    }
    playSound('start');
    playSound('bgm'); 
    gameState = STATE.PLAYING; 
    gameLoop();
}

/**
 * [신규] 서버에서 사용자를 방에서 퇴장시키는 백엔드 로직.
 */
async function performServerExit(roomId, isFullExit) {
    if (!currentUser || !roomId) return;

    const myId = currentUser.id;
    const roomRef = db.collection('rooms').doc(roomId);

    try {
        if (isFullExit) {
            console.log(`🚀 Server Exit: Performing FULL exit from room [${roomId}].`);

            const participantsSnapshot = await roomRef.collection('participants').get();
            const myParticipantDoc = participantsSnapshot.docs.find(doc => doc.id === myId);

            if (myParticipantDoc) {
                await db.runTransaction(async (transaction) => {
                    const roomDoc = await transaction.get(roomRef);
                    if (!roomDoc.exists) return;

                    const roomData = roomDoc.data();
                    transaction.delete(myParticipantDoc.ref);

                    const newPlayerCount = roomData.currentPlayers - 1;
                    if (newPlayerCount <= 0) {
                        // 💡 [수정] 방이 텅 비어서 폭파될 때, 하위 참가자(봇 포함) 데이터도 함께 싹 지워줍니다!
                        participantsSnapshot.docs.forEach(doc => {
                            transaction.delete(doc.ref);
                        });
                        transaction.delete(roomRef);
                    } else {
                        const updates = { currentPlayers: firebase.firestore.FieldValue.increment(-1) };
                        if (roomData.creatorUid === myId) {
                            const otherPlayers = participantsSnapshot.docs.map(d => d.data()).filter(p => p.id !== myId);
                            if (otherPlayers.length > 0) {
                                updates.creatorUid = otherPlayers[0].id;
                            }
                        }
                        transaction.update(roomRef, updates);
                    }
                });
            }

            if (currentUser.joinedRooms[roomId]) {
                delete currentUser.joinedRooms[roomId];
                await db.collection("users").doc(myId).update({
                    [`joinedRooms.${roomId}`]: firebase.firestore.FieldValue.delete()
                });
            }
        } else { // Soft Exit (Forfeit)
            console.log(`🚀 Server Exit: Performing SOFT exit (forfeit) from room [${roomId}].`);

            const roomDoc = await roomRef.get();
            if (!roomDoc.exists) return;
            const roomData = roomDoc.data();

            if (currentUser.joinedRooms[roomId]) {
                await db.collection("users").doc(myId).update({
                    [`joinedRooms.${roomId}.usedAttempts`]: roomData.attempts
                });
            }

            const participantRef = roomRef.collection('participants').doc(myId);
            await participantRef.update({ status: 'dead' });

            // 🚨 [신규 추가] 내가 포기함(dead)으로써 방의 모든 인원이 dead 상태가 되었는지 즉시 확인합니다.
            const participantsSnapshot = await roomRef.collection('participants').get();
            let allDead = true;
            participantsSnapshot.forEach(doc => {
                const pData = doc.data();
                // 내 상태는 방금 dead로 업데이트 했으므로 dead로 간주, 나머지는 실제 DB 상태 확인
                if (pData.id !== myId && pData.status !== 'dead') {
                    allDead = false;
                }
            });

            const isRoomFull = roomData.currentPlayers >= roomData.maxPlayers;
            
            // 모든 조건이 충족되었다면 방을 즉시 'finished' 처리합니다.
            if (isRoomFull && allDead && roomData.status !== 'finished') {
                await roomRef.update({ status: 'finished' });
                console.log(`✅ 방 [${roomId}] 상태를 'finished'로 최종 변경했습니다 (Home버튼 퇴장).`);
            }
        }
    } catch (error) {
        console.error(`❌ Server exit from room [${roomId}] failed:`, error);
    }
}

/**
 * [신규] 게임을 종료하고 로비(인트로) 화면으로 돌아갑니다.
 */
async function exitToLobby(isFullExit = false) { 
    sessionStorage.removeItem('activeRoomId');

    // 💡 [핵심 수정] 싱글 플레이 중(이어하기 화면 등)에 홈으로 나갈 때 지금까지의 점수 강제 저장!
    if (currentGameMode === 'single' && score > 0) {
        // 이어하기 카운트다운 중이거나, 일시정지 상태에서 홈으로 나간 경우
        if (continueTimerId || gameState === STATE.PAUSED) {
            const finalScore = Math.floor(score);
            saveMyScore(finalScore);
            saveScoreToFirebase(finalScore);
            score = 0; // 중복 저장 방지
            console.log("💾 로비 퇴장: 싱글 플레이 점수가 안전하게 저장되었습니다.");
        }
    }

    // 💡 홈 버튼으로 나갈 때, 이어하기 카운트다운을 즉시 종료하고 화면을 닫습니다.
    if (continueTimerId) {
        clearInterval(continueTimerId);
        continueTimerId = null;
    }
    const continueScreen = document.getElementById('game-continue-screen');
    if (continueScreen) continueScreen.classList.add('hidden');

    if (unsubscribeParticipantsListener) {
        unsubscribeParticipantsListener();
        unsubscribeParticipantsListener = null;
        console.log("🎧 Participants listener detached.");
    }

    stopBGM();
    if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }

    if (currentGameMode === 'multi' && currentRoom && currentUser) {
        await performServerExit(currentRoom.id, isFullExit);
    }

    multiGamePlayers = [];
    clearAutoActionTimer();
    currentRoom = null; 

    updateCoinUI();

    // [수정] 로비로 돌아올 때, 항상 최신 방 목록을 가져오도록 강제합니다.
    // 캐시된 Promise를 초기화하여 fetchRaceRooms가 항상 서버에서 새 데이터를 가져오게 합니다.
    roomFetchPromise = null;
    fetchRaceRooms(false);
    fetchMyRooms();

    document.getElementById('scene-intro').classList.remove('hidden');
    document.getElementById('scene-game').classList.add('hidden');
    document.getElementById('btn-pause-toggle').classList.remove('paused');
}

/**
 * [신규] 멀티플레이 방 참가를 시도하는 통합 함수.
 */
async function attemptToJoinRoom(room) {
    if (!isLoggedIn) {
        const sceneAuth = document.getElementById('scene-auth');
        if (sceneAuth) {
            sceneAuth.classList.remove('hidden');
            const authMsg = sceneAuth.querySelector('.auth-message');
            if (authMsg) {
                authMsg.style.display = 'block';
                authMsg.innerText = '멀티플레이는 로그인 후 이용 가능합니다.';
            }
        }
        return;
    }

    const hasJoined = currentUser && currentUser.joinedRooms && currentUser.joinedRooms[room.id];

    if (hasJoined) {
        const roomRef = db.collection('rooms').doc(room.id);
        try {
            const roomDoc = await roomRef.get();
            if (roomDoc.exists) {
                const serverData = roomDoc.data();
                room.current = serverData.currentPlayers;
                room.status = serverData.status;
            }
        } catch (error) {
            console.error("❌ 재입장 시 방 정보 갱신 실패:", error);
        }
        enterGameScene('multi', room);
        return;
    }

    const cost = 2;
    if (currentUser.coins < cost) {
        alert(`코인이 부족합니다. (필요: ${cost}, 보유: ${currentUser.coins})`);
        return;
    }

    const roomRef = db.collection('rooms').doc(room.id);
    try {
        await db.runTransaction(async (transaction) => {
            const roomDoc = await transaction.get(roomRef);
            if (!roomDoc.exists) { throw "레이스룸이 존재하지 않습니다."; }

            const serverRoomData = roomDoc.data();
            if (serverRoomData.currentPlayers >= serverRoomData.maxPlayers) { throw "방이 가득 찼습니다."; }

            const updates = { currentPlayers: firebase.firestore.FieldValue.increment(1) };
            if (serverRoomData.status === 'finished') {
                updates.status = 'inprogress';
            }
            transaction.update(roomRef, updates);

            const myParticipantRef = roomRef.collection('participants').doc(currentUser.id);
            const myParticipantData = {
                id: currentUser.id,
                name: currentUser.nickname,
                isBot: false,
                totalScore: 0,
                bestScore: 0,
                status: 'waiting',
                displayScore: 0,
                attemptsLeft: serverRoomData.attempts
            };
            transaction.set(myParticipantRef, myParticipantData);
        });

        console.log(`✅ 방 [${room.id}] 입장 트랜잭션 성공. (인원수 증가 및 참가자 등록 완료)`);

        room.current++;

        if (currentUser.joinedRooms) {
            const unstartedJoinedRoomIds = Object.keys(currentUser.joinedRooms).filter(id => {
                const roomState = currentUser.joinedRooms[id];
                return roomState && roomState.usedAttempts === 0 && id !== room.id;
            });
            unstartedJoinedRoomIds.forEach(idToLeave => {
                const roomToLeave = raceRooms.find(r => r.id === idToLeave);
                const roomState = currentUser.joinedRooms[idToLeave];
                if (roomToLeave && roomState && roomState.isPaid) { currentUser.coins += roomToLeave.attempts; }
                delete currentUser.joinedRooms[idToLeave];
            });
        }
        const newJoinedRoomData = { usedAttempts: 0, isPaid: false };
        currentUser.joinedRooms[room.id] = newJoinedRoomData;

        await db.collection("users").doc(currentUser.id).update({
            [`joinedRooms.${room.id}`]: newJoinedRoomData
        });

        enterGameScene('multi', room);
    } catch (error) {
        console.error("❌ 방 입장 실패:", error);
        alert(String(error)); 
        renderRoomLists(); 
    }
}

/**
 * [신규] 멀티플레이 랭킹 목록을 렌더링합니다.
 */
async function renderMultiRanking() {
    const listEl = document.getElementById('multi-score-list');
    if (!listEl || !currentRoom) return;

    // [수정] 닉네임 조회를 위해 봇이 아닌 플레이어 ID 목록을 추출합니다.
    const playerIds = multiGamePlayers.filter(p => !p.isBot && p.id).map(p => p.id);
    const uniquePlayerIds = [...new Set(playerIds)];

    // [수정] Cloud Function을 호출하여 최신 닉네임 맵을 가져옵니다.
    const nicknameMap = await fetchNicknames(uniquePlayerIds);

    // [수정] 가져온 최신 닉네임으로 플레이어 목록을 업데이트합니다.
    const playersWithUpdatedNames = multiGamePlayers.map(p => {
        if (!p.isBot && nicknameMap[p.id]) {
            return { ...p, name: nicknameMap[p.id] };
        }
        return p;
    });

    const isTotalMode = currentRoom.rankType === 'total';
    const myId = currentUser ? currentUser.id : 'me';

    const sortedPlayers = [...playersWithUpdatedNames].sort((a, b) => {
        const scoreA = a.id === myId ? calculateMyLocalDisplayScore() : (a.displayScore || 0);
        const scoreB = b.id === myId ? calculateMyLocalDisplayScore() : (b.displayScore || 0);
        return scoreB - scoreA;
    });

    const isAllFinished = playersWithUpdatedNames.every(p => p.status === 'dead');

    listEl.innerHTML = '';
    sortedPlayers.forEach((p, index) => {
        const rank = index + 1;
        const li = document.createElement('li');

        const isHost = currentRoom.creatorUid && p.id === currentRoom.creatorUid;
        const hostIndicatorText = isHost ? `(방장)` : '';
        const hostIconHtml = isHost ? `<img class="master-key-icon" src="assets/images/icon_masterkey.png">` : '';

        let charClass = 'character';
        let charImg = 'assets/images/chicken_back.png'; 

        if (p.status === 'playing') {
            charClass += ' active';
            charImg = 'assets/images/chickenRun.gif';
        } else if (p.status === 'dead') {
            charClass += ' dead';
            charImg = isAllFinished ? 'assets/images/chicken_front.png' : 'assets/images/chicken_dead.png';
        }

        if (p.id === myId) {
            charClass += ' me';
        }

        let statHtml = '';
        if (p.status === 'waiting' && p.displayScore === 0) {
            statHtml = `<span class="more">대기중</span>`;
        } else {
            let rankDisplay = '';
            if (rank === 1) rankDisplay = `<img class="icon" src="assets/images/icon_flag1th.png"/>`;
            else if (rank === 2) rankDisplay = `<img class="icon" src="assets/images/icon_flag2th.png"/>`;
            else if (rank === 3) rankDisplay = `<img class="icon" src="assets/images/icon_flag3th.png"/>`;
            else rankDisplay = `${rank}<small>th</small>`;
            statHtml = `<span class="stat">${rankDisplay}</span>`;
        }

        let botControlButtonsHTML = '';
        if (currentUser && currentUser.isAdmin && p.isBot) { 
            // 🚨 봇이 이미 삭제(hidden) 처리되었다면 투명도 0.3 적용 및 클릭 방지
            const deleteBtnStyle = p.hidden ? 'opacity: 0.3; pointer-events: none; cursor: default;' : '';
            // (선택) 텍스트도 '삭제됨'으로 바꾸면 더 직관적이야! 원치 않으면 '목록삭제'로 유지해도 무방해.
            const deleteBtnText = p.hidden ? '삭제됨' : '목록삭제'; 

            botControlButtonsHTML = `
                <div>
                    <button class="debug-btn" data-bot-id="${p.id}" data-action="force-start">게임실행</button>
                    <button class="debug-btn" data-bot-id="${p.id}" data-action="force-end">게임종료</button>
                    <button class="debug-btn" data-bot-id="${p.id}" data-action="force-delete" style="${deleteBtnStyle}">${deleteBtnText}</button>
                </div>
            `;
        }

        let finalPlayerScore = p.displayScore || 0;
        if (p.id === myId) {
            finalPlayerScore = calculateMyLocalDisplayScore();
        }

        // 🚨 [추가된 부분] 만약 지금 그리는 사람이 '나'라면 이름표를 만들고, 아니면 빈칸으로 둡니다.
        let scoreSpanId = (p.id === myId) ? 'id="my-ranking-score"' : '';

        li.innerHTML = `
            <div class="${charClass}">
                <img src="${charImg}">
                ${hostIconHtml}
            </div>
            <div class="info">
                <small>${p.name} ${hostIndicatorText}</small>
                <p class="score-display">
                    <span ${scoreSpanId}>${Math.floor(finalPlayerScore).toLocaleString()}<small>M</small></span>
                    ${botControlButtonsHTML}
                </p>
            </div>
            ${statHtml}
        `;
        listEl.appendChild(li);
    });
}

/**
 * [신규] 현재 플레이어의 로컬 점수를 실시간으로 계산하여 반환합니다.
 */
function calculateMyLocalDisplayScore() {
    if (!currentUser || !currentRoom) return 0;

    const myId = currentUser.id;
    const myPlayer = multiGamePlayers.find(p => p.id === myId);
    if (!myPlayer) return 0;

    const currentRunScore = (gameState === STATE.PLAYING || gameState === STATE.CRASHED) ? score : 0;

    let displayScore = 0;
    if (currentRoom.rankType === 'total') {
        displayScore = (myPlayer.totalScore || 0) + currentRunScore;
    } else {
        displayScore = Math.max((myPlayer.bestScore || 0), currentRunScore);
    }
    return displayScore;
}

/**
 * [수정] 더보기 버튼 상태 업데이트 (숨기지 않고 텍스트/스타일 변경)
 */
/**
 * [수정] 더보기 버튼 상태 업데이트 (버튼 자체를 완전히 숨김)
 */
function updateLoadMoreButtons() {
    const loader = document.getElementById('race-room-loader');
    const myLoader = document.getElementById('my-room-loader');

    // 1. 레이스룸 탭 제어
    if (loader) {
        // 모든 방을 불러왔다면 로더(버튼 영역)를 완전히 숨깁니다.
        if (allRoomsLoaded || raceRooms.length === 0) {
            loader.classList.add('hidden');
        } else {
            loader.classList.remove('hidden');
        }
    }

    // 2. 참가중 탭 제어
    if (myLoader) {
        const totalMyRooms = (isLoggedIn && currentUser && currentUser.joinedRooms) ? Object.keys(currentUser.joinedRooms).length : 0;
        // 로그인이 안되어있거나, 방이 없거나, 모든 방을 다 불렀다면 완전히 숨깁니다.
        if (!isLoggedIn || totalMyRooms <= currentMyRoomLimit) {
            myLoader.classList.add('hidden');
        } else {
            myLoader.classList.remove('hidden');
        }
    }
}

/**
 * [신규] 통합 렌더링 호출용 래퍼 함수 (누락된 함수 복원)
 */
function renderRoomLists() {
    renderRaceRoomList();
    renderMyRoomList();
    updateLoadMoreButtons();
}


/**
 * [수정] 레이스룸 목록만 렌더링하는 함수 (끝에 도달 시 텍스트 추가)
 */
function renderRaceRoomList() {
    const raceRoomList = document.querySelector('#content-race-room .score-list');
    if (!raceRoomList) return;
    raceRoomList.innerHTML = '';

    const allMyJoinedRoomIds = (isLoggedIn && currentUser && currentUser.joinedRooms) ? Object.keys(currentUser.joinedRooms) : [];

    const raceRoomsToRender = raceRooms
        .filter(r => r.current > 0 && !allMyJoinedRoomIds.includes(r.id))
        .slice(0, currentRoomLimit);

    raceRoomsToRender.forEach(room => {
        const userRoomState = (isLoggedIn && currentUser && currentUser.joinedRooms) ? currentUser.joinedRooms[room.id] : null;

        const lockImg = room.isLocked ? `<img class="lock" src="assets/images/icon_lock.png">` : '';

        const debugButtonsHTML = (currentUser && currentUser.isAdmin)
            ? `<button class="debug-btn" data-room-id="${room.id}" data-action="add">+</button><button class="debug-btn" data-room-id="${room.id}" data-action="remove">-</button>`
            : '';
        const raceLi = document.createElement('li');

        if (userRoomState && (userRoomState.isPaid || userRoomState.usedAttempts > 0)) {
            raceLi.classList.add('already-joined');
        }

        const isFull = room.current >= room.limit;
        const statusClass = isFull ? 'finished' : 'inprogress';
        const aggIcon = room.limit >= 4 ? '<img class="agg" src="assets/images/icon_agg.png">' : '';
        const statusText = isFull ? `${aggIcon}마감: ${room.current}/${room.limit}명` : `${aggIcon}모집: ${room.current}/${room.limit}명`;

        const isJoinable = !isFull || (isFull && userRoomState);
        if (!isJoinable) {
            raceLi.classList.add('disabled');
        }

        raceLi.innerHTML = `
            <div class="info">
                <label>
                    <span class="${statusClass}">${statusText}</span>
                    <img class="coin" src="assets/images/icon_coin.png">
                    <span class="game_info">X <strong>2</strong></span>
                </label>
                <p>${room.title} ${debugButtonsHTML}</p>
            </div>
            ${lockImg}
            <span class="stat"><img class="chevron" src="assets/images/ico128-chevron.png"/></span>`;

        raceLi.onclick = (e) => {
            if (e.target.closest('.debug-btn')) return;

            // 💡 1. 로그인 여부 먼저 확인 (로그인 안 했으면 알아서 로그인 안내 창이 뜹니다)
            if (!isLoggedIn) {
                attemptToJoinRoom(room);
                return;
            }

            // 💡 2. 이미 입장료를 지불하고 참여 중인 방인지 확인 (참여 중이면 코인 불필요)
            const userRoomState = (currentUser && currentUser.joinedRooms) ? currentUser.joinedRooms[room.id] : null;
            const hasJoined = !!userRoomState;

            // 💡 3. 처음 들어가는 방인데 코인이 부족할 경우 -> 비번 묻기 전에 바로 광고 모달 호출!
            const cost = 2; // 멀티게임 입장료
            if (!hasJoined && currentUser.coins < cost) {
                window.showCoinShortageModal();
                return; // 여기서 멈춤 (비번창 띄우지 않음)
            }

            // 💡 4. 모든 관문을 통과했다면 기존 로직(비번창 띄우기 or 바로 입장) 진행
            if (room.isLocked && !unlockedRoomIds.includes(room.id)) {
                showPasswordInput(room);
            } else {
                attemptToJoinRoom(room);
            }
        };
        raceRoomList.appendChild(raceLi);
    });

    // 💡 [수정] 빈 목록 처리 및 마지막 도달 텍스트 메시지 표시
    if (raceRoomList.children.length === 0) {
        raceRoomList.innerHTML = '<li><div class="info" style="text-align:center; width:100%;"><p>참여 가능한 레이스룸이 없습니다.</p></div></li>';
    } else if (allRoomsLoaded) {
        // 리스트 끝에 도착하면 깔끔한 텍스트 블록 추가
        const noMoreLi = document.createElement('li');
        noMoreLi.style.cssText = "pointer-events: none; background: transparent; border: none; box-shadow: none; padding: 1.5rem 1rem; justify-content: center;";
        noMoreLi.innerHTML = '<div class="info" style="text-align:center; width:100%;"><p>더 이상 불러올 방이 없습니다.</p></div>';
        raceRoomList.appendChild(noMoreLi);
    }
}

/**
 * [수정] 참가중인 방 목록만 렌더링하는 함수 (끝에 도달 시 텍스트 추가)
 */
function renderMyRoomList() {
    const myRoomList = document.querySelector('#content-my-rooms .score-list');
    if (!myRoomList) return;
    myRoomList.innerHTML = '';

    myRooms.forEach(room => {
        const userRoomState = (isLoggedIn && currentUser && currentUser.joinedRooms) ? currentUser.joinedRooms[room.id] : null;
        if (userRoomState && !userRoomState.hidden) {
            const debugButtonsHTML = (currentUser && currentUser.isAdmin)
                ? `<button class="debug-btn" data-room-id="${room.id}" data-action="add">+</button><button class="debug-btn" data-room-id="${room.id}" data-action="remove">-</button>`
                : '';

            const userUsedAttempts = userRoomState.usedAttempts;
            const isRoomGloballyFinished = room.status === "finished";

            const myRoomStatusText = isRoomGloballyFinished ? "종료" : `진행중 (${room.current}/${room.limit}명)`;
            const myRoomStatusClass = isRoomGloballyFinished ? "finished" : "inprogress";

            const myLi = document.createElement('li');
            myLi.innerHTML = `
                <div class="info">
                    <label>
                        <span class="${myRoomStatusClass}">${myRoomStatusText}</span>
                    </label>
                    <p>${room.title} ${debugButtonsHTML}</p>
                </div>
                <span class="stat"><img class="chevron" src="assets/images/ico128-chevron.png"/></span>`;
            myLi.onclick = (e) => {
                if (e.target.closest('.debug-btn')) return;
                if (!isLoggedIn) {
                    const sceneAuth = document.getElementById('scene-auth');
                    if (sceneAuth) {
                        sceneAuth.classList.remove('hidden');
                        const authMsg = sceneAuth.querySelector('.auth-message');
                        if (authMsg) {
                            authMsg.style.display = 'block';
                            authMsg.innerText = '멀티플레이는 로그인 후 이용 가능합니다.';
                        }
                    }
                    return;
                }
                enterGameScene('multi', room);
            };
            myRoomList.appendChild(myLi);
        }
    });

    // 💡 [수정] 빈 목록 처리 및 마지막 도달 텍스트 메시지 표시
    if (!isLoggedIn) {
        myRoomList.innerHTML = '<li><div class="info" style="text-align:center; width:100%;"><p>로그인 후 이용 가능합니다.</p></div></li>';
    } else if (myRoomList.children.length === 0) {
        myRoomList.innerHTML = '<li><div class="info" style="text-align:center; width:100%;"><p>참가중인 레이스룸이 없습니다.</p></div></li>';
    } else {
        const totalMyRooms = (currentUser && currentUser.joinedRooms) ? Object.keys(currentUser.joinedRooms).length : 0;
        if (totalMyRooms <= currentMyRoomLimit) {
            // 리스트 끝에 도착하면 깔끔한 텍스트 블록 추가
            const noMoreLi = document.createElement('li');
            noMoreLi.style.cssText = "pointer-events: none; background: transparent; border: none; box-shadow: none; padding: 1.5rem 1rem; justify-content: center;";
            noMoreLi.innerHTML = '<div class="info" style="text-align:center; width:100%;"><p>더 이상 불러올 방이 없습니다.</p></div>';
            myRoomList.appendChild(noMoreLi);
        }
    }
}

async function enterGameScene(mode, roomData = null) { 
    if (!isGameReady) { alert("리소스 로딩 중!"); return; }

    if (mode === 'multi' && !isLoggedIn) {
        const sceneAuth = document.getElementById('scene-auth');
        if (sceneAuth) {
            sceneAuth.classList.remove('hidden');
            const authMsg = sceneAuth.querySelector('.auth-message');
            if (authMsg) {
                authMsg.style.display = 'block';
                authMsg.innerText = '멀티플레이는 로그인 후 이용 가능합니다.';
            }
        }
        return;
    }

    currentGameMode = mode;
    currentRoom = roomData;

    if (mode === 'multi' && roomData) {
        sessionStorage.setItem('activeRoomId', roomData.id);
    } else if (mode === 'single') {
        sessionStorage.setItem('activeRoomId', 'single_player_mode');
    }

    updateButtonCosts();

    document.getElementById('scene-intro').classList.add('hidden');
    document.getElementById('scene-game').classList.remove('hidden');

    // 🚨 서버 통신(await)을 기다리기 전에 캔버스와 모든 UI를 즉시 삭제
    resetGame();
    setControlsVisibility(false);
    drawStaticFrame();

    if (mode === 'single') {
        currentRoom = { attempts: 1, usedAttempts: 0, title: "싱글 테스트", status: "inprogress" };
        document.getElementById('view-single-mode').classList.remove('hidden');
        document.getElementById('view-multi-rank').classList.add('hidden');
    } else {
        document.getElementById('view-single-mode').classList.add('hidden');
        document.getElementById('view-multi-rank').classList.remove('hidden');

        const rankSpan = document.querySelector('#view-multi-rank .list-title span');
        if (rankSpan) {
            rankSpan.innerText = currentRoom.rankType === 'total' ? '(점수합산)' : '(최고점수)';
        }

        const listTitle = document.querySelector('#view-multi-rank .list-title');
        if (listTitle) {
            const oldButtons = listTitle.querySelector('.debug-btn-group');
            if (oldButtons) oldButtons.remove();

            if (currentUser && currentUser.isAdmin) { 
                const buttonGroup = document.createElement('div');
                buttonGroup.className = 'debug-btn-group';
                buttonGroup.style.marginLeft = 'auto'; 
                buttonGroup.innerHTML = `<button class="debug-btn" data-room-id="${currentRoom.id}" data-action="add">+</button><button class="debug-btn" data-room-id="${currentRoom.id}" data-action="remove">-</button>`;
                listTitle.appendChild(buttonGroup);
            }
        }
    }

    // --- 멀티플레이어 모드 로직 ---
    if (mode === 'multi') {
        if (!gameLoopId) {
            gameLoop();
        }
        // 🚨 방에 들어오자마자 예전 랭킹 화면을 즉시 지우고 로딩 표시!
        const listEl = document.getElementById('multi-score-list');
        if (listEl) listEl.innerHTML = '<li style="justify-content:center; padding:2rem 0;"><div class="info"><p style="text-align:center;">랭킹 데이터를 불러오는 중...</p></div></li>';

        const myPlayerId = currentUser.id;
        const roomRef = db.collection('rooms').doc(currentRoom.id);
        const participantsRef = roomRef.collection('participants');

        try {
            const initialParticipantsSnapshot = await participantsRef.get();
            multiGamePlayers = initialParticipantsSnapshot.docs.map(doc => doc.data());

            if (unsubscribeParticipantsListener) unsubscribeParticipantsListener(); 
            unsubscribeParticipantsListener = participantsRef.onSnapshot((snapshot) => {
                multiGamePlayers = snapshot.docs.map(doc => doc.data());
                renderMultiRanking();
            }, (error) => {
                console.error("❌ Participants listener error:", error);
            });

        } catch (error) {
            console.error("❌ 참가자 목록 로딩 또는 리스너 설정 실패:", error);
            alert("방에 참가하는 중 오류가 발생했습니다. 로비로 돌아갑니다.");
            exitToLobby(false); 
            return;
        }

        const userRoomState = currentUser.joinedRooms[currentRoom.id];
        const userUsedAttempts = userRoomState ? userRoomState.usedAttempts : 0;
        const myPlayerInRoom = multiGamePlayers.find(p => p.id === myPlayerId); 

        const isMyGameOver = userUsedAttempts >= currentRoom.attempts;
        const isRoomFinished = currentRoom.status === 'finished';

        if (myPlayerInRoom && (isMyGameOver || isRoomFinished)) {
            if (myPlayerInRoom) myPlayerInRoom.status = 'dead';

            resetGame();
            gameState = STATE.GAMEOVER;
            gameSpeed = 0;
            drawStaticFrame();
            document.getElementById('game-over-screen').classList.remove('hidden');
            handleGameOverUI();
            renderMultiRanking();

            if (gameLoopId) cancelAnimationFrame(gameLoopId);
            gameLoop();

            return; 
        }

        // 2. 일시정지 상태에서 재입장
        if (myPlayerInRoom && myPlayerInRoom.status === 'paused') {
            drawStaticFrame();
            gameState = STATE.PAUSED;
            document.getElementById('game-pause-screen').classList.remove('hidden');
            document.getElementById('btn-pause-toggle').classList.add('paused');
            startAutoActionTimer(30, 'start', '#game-pause-screen .time-message');
            renderMultiRanking();
            return;
        }

        if (myPlayerInRoom && userUsedAttempts > 0) {
            myPlayerInRoom.status = 'waiting';
            drawStaticFrame();
            gameState = STATE.GAMEOVER; 
            document.getElementById('game-over-screen').classList.remove('hidden');
            handleGameOverUI();
            renderMultiRanking();
            return;
        }

        if (myPlayerInRoom) myPlayerInRoom.status = 'waiting';

        resetGame();
        setControlsVisibility(false);
        drawStaticFrame();
        document.getElementById('game-start-screen').classList.remove('hidden');

        // 💡 방을 만든 사람(방장)이 아직 게임을 한 번도 안 했다면 타이머 면제!
        const isHost = currentRoom && currentUser && currentRoom.creatorUid === currentUser.id;
        const usedAttempts = (currentUser && currentUser.joinedRooms[currentRoom.id]) ? currentUser.joinedRooms[currentRoom.id].usedAttempts : 0;
        
        if (isHost && usedAttempts === 0) {
            const timeMsgEl = document.querySelector('#game-start-screen .time-message');
            if (timeMsgEl) timeMsgEl.style.display = 'none'; // 타이머 글씨 숨김
        } else {
            // 방장이 아니거나 방장이어도 이미 한 판 했다면 정상적으로 15초 타이머 작동
            startAutoActionTimer(15, 'exit', '#game-start-screen .time-message');
        }
        
        renderMultiRanking();
    } else { 
        resetGame();
        setControlsVisibility(false);
        drawStaticFrame();
        document.getElementById('game-start-screen').classList.remove('hidden');
    }
}

/**
 * [신규] 비밀번호 입력 모달을 띄웁니다.
 */
function showPasswordInput(room) {
    targetRoom = room;
    const scene = document.getElementById('scene-password-input');
    const input = document.getElementById('input-room-password');
    const msg = document.getElementById('password-message');

    if (input) input.value = '';
    if (msg) {
        msg.innerText = '';
        msg.style.display = 'none'; 
    }
    if (scene) scene.classList.remove('hidden');
}

/**
 * [신규] 홈 버튼 클릭 시 처리 (상태에 따라 확인 팝업 또는 즉시 이동)
 */
function handleHomeButtonClick() {
    let isInProgress = false;

    if (gameState === STATE.PAUSED) {
        isInProgress = true;
    } else if (gameState === STATE.GAMEOVER) {
        if (currentGameMode === 'multi' && currentRoom) {
            const userRoomState = (currentUser && currentUser.joinedRooms) ? currentUser.joinedRooms[currentRoom.id] : null;
            const usedAttempts = userRoomState ? userRoomState.usedAttempts : 0;
            const attemptsLeft = currentRoom.attempts - usedAttempts;

            if (attemptsLeft > 0) {
                isInProgress = true;
            }
        }
    }

    if (isInProgress) {
        const sceneExitConfirm = document.getElementById('scene-exit-confirm');
        if (sceneExitConfirm) sceneExitConfirm.classList.remove('hidden');
    } else {
        const userRoomState = (currentUser && currentRoom) ? currentUser.joinedRooms[currentRoom.id] : null;
        const hasStartedPlaying = userRoomState && (userRoomState.isPaid || userRoomState.usedAttempts > 0);
        exitToLobby(!hasStartedPlaying);
    }
}

/**
 * [신규] 현재 방을 목록에서 삭제하고 로비로 이동
 * [수정] 현재 방을 서버에서 완전히 삭제하고 내 정보에서도 지웁니다.
 */
async function deleteCurrentRoom() {
    if (!currentRoom || !currentRoom.id || !currentUser) {
        console.warn("삭제할 방 정보가 없습니다. 로비로 이동합니다.");
        exitToLobby(false);
        return;
    }

    const roomId = currentRoom.id;
    const myId = currentUser.id;

    try {
        console.log(`🧨 방 폭파 및 데이터 정리 시작: ${roomId}`);

        // 1. [추가] 내 유저 문서의 joinedRooms에서 이 방 ID를 완전히 삭제합니다.
        await db.collection("users").doc(myId).update({
            [`joinedRooms.${roomId}`]: firebase.firestore.FieldValue.delete()
        });

        // 2. 실제 방 문서를 삭제합니다.
        await db.collection('rooms').doc(roomId).delete();

        console.log(`✅ 방 [${roomId}]과 유저 데이터가 성공적으로 삭제되었습니다.`);

        currentRoom = null;
        exitToLobby(false); // 로비로 이동
    } catch (error) {
        console.error(`❌ 방 [${roomId}] 삭제 실패:`, error);
        alert("방을 삭제하는 중 오류가 발생했습니다.");
    }
}

/**
 * [수정] '참가중인 목록'에서 내 정보를 완전히 삭제합니다.
 */
// 💡 방 생명주기 논리를 반영한 목록 삭제 함수
async function removeFromMyRooms() {
    if (!currentRoom || !currentRoom.id || !currentUser) return;

    const roomId = currentRoom.id;
    const myId = currentUser.id;
    const roomRef = db.collection('rooms').doc(roomId);
    const participantsRef = roomRef.collection('participants');

    try {
        console.log(`🗑️ 내 목록에서 방 [${roomId}] 숨김 및 상태 업데이트 시작...`);

        // 1. [내 유저 정보 업데이트] 
        // 🚨 삭제(delete)하지 않고 hidden: true를 주어 내 탭(레이스룸, 참가중)에서 완벽히 숨깁니다.
        if (currentUser.joinedRooms[roomId]) currentUser.joinedRooms[roomId].hidden = true;
        await db.collection("users").doc(myId).update({
            [`joinedRooms.${roomId}.hidden`]: true
        });

        // 2. [방의 참가자 서류 업데이트]
        // 방 내부 참여자 명부에서도 나를 hidden: true로 마킹합니다.
        await participantsRef.doc(myId).update({ hidden: true });

     // 3. [방 폭파 조건 및 게임 완료 조건 체크]
        const participantsSnapshot = await participantsRef.get();
        const roomDoc = await roomRef.get();
        const roomData = roomDoc.exists ? roomDoc.data() : null;
        if (!roomData) return; // 방 데이터가 아예 없으면 종료

        let shouldExplode = true; // 참여했던 모든 사람이 전부 목록 삭제를 눌렀는가?
        let allDead = true;       // 현재 참여한 사람들이 모두 게임을 끝냈는가?

        participantsSnapshot.forEach(doc => {
            const data = doc.data();
            if (!data.hidden) shouldExplode = false;
            if (data.status !== 'dead') allDead = false;
        });

        // 🚨 [핵심 버그 수정] 방의 현재 참여 인원이 최대 정원(limit)에 도달하지 않았다면 절대 폭파 금지!
        if (roomData.currentPlayers < roomData.maxPlayers) {
            shouldExplode = false;
        }

        // 4. 진짜로 참여했던 '모든' 사람이 삭제를 눌렀고 & '정원이 꽉 찼던 방'일 경우에만 완전 폭파!
        if (shouldExplode) {
            console.log(`💣 참여했던 모든 참가자가 삭제를 눌렀으므로 방 [${roomId}]을 완전히 폭파합니다.`);
            const batch = db.batch();
            participantsSnapshot.forEach(doc => { batch.delete(doc.ref); });
            batch.delete(roomRef);
            await batch.commit();
        }
        // 5. 방은 폭파되지 않았지만(대기 상태), 정원이 꽉 찬 상태에서 모두 완료되었다면 심판(서버) 호출!
        else {
            if (roomData.currentPlayers >= roomData.maxPlayers && allDead && roomData.status !== 'finished') {
                await roomRef.update({ status: 'finished' });
                console.log(`✅ 방 [${roomId}] 정원이 차고 모두 종료되어 'finished' 처리되었습니다. (서버 심판 발동)`);
            } else {
                console.log(`⏳ 방 [${roomId}]은 자리가 남았거나 대기 중이므로 대기 상태를 유지합니다.`);
            }
        }

        console.log("✅ 데이터 처리 완료. 로비로 이동합니다.");
        await exitToLobby(false);

    } catch (error) {
        console.error("❌ 목록 삭제 처리 중 오류 발생:", error);
        alert("처리에 실패했습니다.");
    }
}

// 🌟 [수정됨] 이제 브라우저 금고(localStorage)가 아니라, 서버에 저장된 내 정보(currentUser)를 확인합니다!
function getAdData() {
    const todayStr = getTodayString();
    
    if (!currentUser) {
        // [비로그인(게스트) 유저]
        let guestAdData = JSON.parse(localStorage.getItem('chickenRunGuestAdData') || '{"count": 0, "date": ""}');
        // 날짜가 다르면(어제 본 거면) 횟수 초기화
        if (guestAdData.date !== todayStr) {
            guestAdData.count = 0;
            guestAdData.date = todayStr;
            localStorage.setItem('chickenRunGuestAdData', JSON.stringify(guestAdData));
        }
        return { count: guestAdData.count, date: guestAdData.date };
    }
    
    // [로그인 유저]
    if (currentUser.lastAdDate !== todayStr) {
        currentUser.adCount = 0;
        currentUser.lastAdDate = todayStr;
    }
    
    return { 
        count: currentUser.adCount || 0, 
        date: currentUser.lastAdDate 
    };
}

/**
 * [수정됨] 광고 시청 시뮬레이션 및 보상 지급 (앱 연동 기능 추가!)
 */
function watchAdAndGetReward() {
    let adTimerInterval = null; 
    // 🔒 [원상복구] 로그인을 안 한 유저(웹 환경)는 광고 보상을 받을 수 없도록 막습니다!

    const adData = getAdData();
    if (adData.count >= AD_CONFIG.DAILY_LIMIT) {
        alert(`오늘의 광고 시청 횟수를 모두 소진했습니다.\n(매일 자정에 초기화됩니다.)`);
        return;
    }

    // 🌟 [핵심 마법] 만약 이 게임이 '스마트폰 앱'으로 포장되어 실행 중이라면?!
    if (window.AndroidBridge || (window.webkit && window.webkit.messageHandlers.showAd)) {
        console.log("📱 스마트폰 앱 환경 감지됨! 네이티브 구글 광고를 부릅니다.");
        window.invokeNativeApp('showAd'); 
        return;
    }

    // 💻 앱이 아니라면 (기존처럼 컴퓨터 인터넷 창이라면) 10초짜리 가짜 광고를 보여줍니다.
    console.log("💻 인터넷 브라우저 환경 감지됨! 테스트용 가짜 광고를 실행합니다.");
    
    let adOverlay = document.getElementById('scene-ad-overlay');
    if (!adOverlay) {
        adOverlay = document.createElement('div');
        adOverlay.id = 'scene-ad-overlay';
        document.body.appendChild(adOverlay);
    } else {
        adOverlay.classList.remove('hidden');
    }

    adOverlay.innerHTML = `
        <div id="ad-view-loading" class="ad-view">
            <div class="ad-ui-container">
                <div class="ad-progress-bar-wrapper">
                    <div id="ad-progress-bar"></div>
                </div>
            </div>

            <button id="btn-ad-close-video">✕ Close</button>

            <p>광고 영상이 재생되는 중입니다...</p>
            <div class="spinner"></div>
        </div>

        <div id="ad-view-finished" class="ad-view" style="display:none;">
            <img src="assets/images/icon_coin.png" style="width:4rem; image-rendering: pixelated;">
            <p style="font-size: 1.5rem; color: #ffd02d; font-family: 'KoreanYNMYTM';">보상 획득!</p>
            <p style="font-size: 1rem;">+${AD_CONFIG.REWARD} 코인</p>
            <div style="width: 100%; display: flex; justify-content: center;">
                <button id="btn-ad-close" class="pixelbtn pixelbtn--primary">닫기</button>
            </div>
        </div>
    `;

    const progressBar = document.getElementById('ad-progress-bar');
    const btnCloseVideo = document.getElementById('btn-ad-close-video');

    btnCloseVideo.onclick = () => {
        clearInterval(adTimerInterval);
        adOverlay.classList.add('hidden');
        alert('광고를 건너뛰어 보상을 받지 못했습니다.');
    };

    const adStartTime = Date.now();
    adTimerInterval = setInterval(() => {
        const elapsedTime = Date.now() - adStartTime;
        const progress = Math.min(100, (elapsedTime / AD_CONFIG.DURATION) * 100);

        if (progressBar) progressBar.style.width = `${progress}%`;

        if (elapsedTime >= AD_CONFIG.DURATION) {
            clearInterval(adTimerInterval);

            if (btnCloseVideo) {
                btnCloseVideo.innerText = "시청완료 ❯❯";

                // ✨ 수정 후: '시청완료' 클릭 시, 화면 변경과 서버 통신이 모두 들어있는 보상 함수를 호출합니다!
                btnCloseVideo.onclick = () => {
                    if (typeof window.giveRewardFromApp === 'function') {
                        window.giveRewardFromApp(); // 💰 실제 코인 지급 및 서버 저장 실행!
                    }
                };
            }
        }
    }, 50); 

    const btnCloseReward = document.getElementById('btn-ad-close');
    if (btnCloseReward) {
        btnCloseReward.onclick = () => {
            adOverlay.classList.add('hidden');
        };
    }
}

// 🌟 [최종 수정됨] 앱에서 광고 시청 완료 신호가 오면, 예쁜 보상 화면을 즉석에서 그려서 띄우기!
window.giveRewardFromApp = function() {
    console.log("🎁 띠링! 보상 지급 신호 도착!");
    const todayStr = getTodayString();

    if (currentUser) {
        // [로그인 유저 보상 처리]
        currentUser.coins += AD_CONFIG.REWARD;
        currentUser.adCount = (currentUser.adCount || 0) + 1;
        currentUser.lastAdDate = todayStr;
        syncAdRewardToServer(currentUser.coins, currentUser.adCount, currentUser.lastAdDate);
    } else {
        // [비로그인(게스트) 보상 처리 신규 추가]
        guestCoins += AD_CONFIG.REWARD;
        localStorage.setItem('chickenRunGuestCoins', guestCoins.toString());
        
        // 게스트 시청 횟수 증가
        let guestAdData = JSON.parse(localStorage.getItem('chickenRunGuestAdData') || '{"count": 0, "date": ""}');
        guestAdData.count += 1;
        guestAdData.date = todayStr;
        localStorage.setItem('chickenRunGuestAdData', JSON.stringify(guestAdData));
    }

    // 화면의 코인 숫자 업데이트
    updateCoinUI();

    // ==========================================
    // 아래는 예쁜 보상 화면 띄우기 로직 (기존 코드 유지)
    // ==========================================
    let adOverlay = document.getElementById('scene-ad-overlay');

    if (!adOverlay) {
        adOverlay = document.createElement('div');
        adOverlay.id = 'scene-ad-overlay';
        adOverlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9999; display:flex; justify-content:center; align-items:center;";
        document.body.appendChild(adOverlay);

        adOverlay.innerHTML = `
            <div id="ad-view-finished" class="ad-view" style="display:flex; flex-direction:column; align-items:center; text-align:center;">
                <img src="assets/images/icon_coin.png" style="width:5rem; image-rendering: pixelated; margin-bottom:1rem;">
                <p style="font-size: 2rem; color: #ffd02d; font-family: 'KoreanYNMYTM', sans-serif; margin-bottom:0.5rem; text-shadow: 2px 2px 0px #000;">보상 획득!</p>
                <p style="font-size: 1.2rem; color: white; margin-bottom:2rem; font-weight:bold;">+${AD_CONFIG.REWARD} 코인</p>
                <button id="btn-ad-close" class="pixelbtn pixelbtn--primary" style="font-size: 1.2rem; padding: 10px 40px;">닫기</button>
            </div>
        `;
    } else {
        adOverlay.classList.remove('hidden');
        adOverlay.style.display = 'flex';
        const viewLoading = document.getElementById('ad-view-loading');
        const viewFinished = document.getElementById('ad-view-finished');
        if (viewLoading) viewLoading.style.display = 'none';
        if (viewFinished) viewFinished.style.display = 'flex';
    }

    // '닫기' 버튼을 누르면 화면이 사라지도록 연결
    const btnCloseReward = document.getElementById('btn-ad-close');
    if (btnCloseReward) {
        btnCloseReward.onclick = () => {
            adOverlay.style.display = 'none';
            adOverlay.classList.add('hidden');
        };
    }
};

/**
 * [개발용] 광고 시청 횟수를 초기화합니다.
 */
function resetAdCount() {
    localStorage.removeItem('chickenRunAdData');
    console.log('광고 시청 횟수 데이터가 초기화되었습니다.');
    alert('광고 시청 횟수가 초기화되었습니다.');
    updateCoinUI();
}

/**
 * [개발용] 모든 방의 참가자 정보를 초기화하여 목록을 리셋합니다.
 */
function resetRoomData() {
    if (confirm('정말로 모든 방의 참가자 정보를 초기화하시겠습니까? 방이 모두 "모집중" 상태로 돌아갑니다.')) {
        localStorage.removeItem('chickenRunRoomStates');
        console.log('방 데이터가 초기화되었습니다. 페이지를 새로고침합니다.');
        alert('방 데이터가 초기화되었습니다. 페이지를 새로고침합니다.');
    }
}

/**
 * 구글 로그인 함수
 */
function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');

    if (window.AndroidBridge) {
        window.invokeNativeApp('requestGoogleLogin');
    } else {
        // 💡 'google'이라고 명시해서 저장합니다.
        sessionStorage.setItem('pendingLoginProvider', 'google'); 
        firebase.auth().signInWithRedirect(provider);
    }
}

/**
 * 애플 로그인
 */
async function loginWithApple() {
    const provider = new firebase.auth.OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');

    try {
        // 💡 'apple'이라고 명시해서 저장합니다.
        sessionStorage.setItem('pendingLoginProvider', 'apple');
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        firebase.auth().signInWithRedirect(provider);
    } catch (error) {
        alert("애플 로그인 오류: " + error.message);
        if (window.resetLoginButtons) window.resetLoginButtons();
    }
}

/**
 * [신규] 서버에서 유저 데이터를 불러오거나, 신규 유저일 경우 생성합니다.
 */
async function loadUserData(user) {
    const userRef = db.collection("users").doc(user.uid);

    if (unsubscribeUserData) {
        unsubscribeUserData();
        unsubscribeUserData = null;
    }

    try {
        const providerInfo = user.providerData && user.providerData[0] ? user.providerData[0] : null;
        const extractedEmail = user.email || (providerInfo ? providerInfo.email : null);
        const extractedNickname = (providerInfo ? providerInfo.displayName : null) || user.displayName;
        let providerSuffix = "";
        if (providerInfo) {
            const providerId = providerInfo.providerId;
            if (providerId.includes('google')) providerSuffix = " (Google)";
            else if (providerId.includes('apple')) providerSuffix = " (Apple)";
        }
        const finalNickname = (extractedNickname || '이름없음') + providerSuffix;

        const initialUserData = {
            id: user.uid,
            email: extractedEmail,
            nickname: finalNickname,
            coins: 10,
            badges: { '1': 0, '2': 0, '3': 0 },
            joinedRooms: {}
        };

        const docSnap = await userRef.get();
        let initialLoadComplete = false;
        
        unsubscribeUserData = userRef.onSnapshot(async (snapshot) => {
            if (!snapshot.exists) {
                console.log("🆕 신규 유저 감지: Firestore에 문서를 생성합니다.");
                try {
                    // 초기 데이터를 서버에 생성 (set)
                    await userRef.set(initialUserData);
                    // 생성 직후에는 리스너가 다시 돌면서 snapshot.exists가 true가 됩니다.
                    return; 
                } catch (err) {
                    console.error("❌ 유저 문서 생성 실패:", err);
                    return;
                }
            }

            const userData = snapshot.data();
            const correctEmail = user.email || (providerInfo ? providerInfo.email : null);
            const isAdminUser = ADMIN_UIDS.includes(user.uid);

            // 💡 여기서 서버의 모든 데이터(광고 횟수 포함)가 currentUser로 쏙 들어옵니다!
            currentUser = { ...currentUser, ...userData, email: correctEmail || userData.email, isAdmin: isAdminUser };

            // 🌟 [신규 추가] 로그인 직후 '오늘 날짜'를 체크해서, 어제 본 기록이면 화면을 0회로 리셋해줍니다!
            const todayStr = getTodayString(); 
            if (currentUser.lastAdDate !== todayStr) {
                currentUser.adCount = 0;
                currentUser.lastAdDate = todayStr;
                // (서버에는 유저가 오늘 첫 광고를 볼 때 알아서 1회로 갱신되어 저장되니 여기서 굳이 저장 안 해도 됩니다!)
            }

            // [신규] Firestore에서 불러온 데이터로 '내 기록' 관련 변수 초기화
            myScores = currentUser.myScores || [];
            bestScore = currentUser.bestScore || 0;
            renderMyRecordList(); 

            if (!initialLoadComplete) {
                initialLoadComplete = true;

                if (correctEmail && userData.email !== correctEmail) {
                    userRef.update({ email: correctEmail }).then(() => console.log("🔧 Firestore의 이메일 정보를 최신 정보로 수정했습니다."));
                }

                const lastActiveRoomId = sessionStorage.getItem('activeRoomId');
                if (lastActiveRoomId) {
                    sessionStorage.removeItem('activeRoomId');
                    if (lastActiveRoomId === 'single_player_mode') {
                        console.log('⚠️ 비정상 종료 감지: 싱글 플레이 게임을 종료 처리했습니다.');
                    } else {
                        console.log(`⚠️ 비정상 종료 감지: 방 [${lastActiveRoomId}]에서 퇴장 처리를 시작합니다.`);
                        const userRoomState = userData.joinedRooms ? userData.joinedRooms[lastActiveRoomId] : null;
                        const hasStartedPlaying = userRoomState && (userRoomState.isPaid || userRoomState.usedAttempts > 0);
                        performServerExit(lastActiveRoomId, !hasStartedPlaying);
                    }
                }

                console.log(`[Auth] User: ${currentUser.email}, IsAdmin: ${isAdminUser}`);
                isLoggedIn = true;
                document.getElementById('scene-auth').classList.add('hidden');
                roomFetchPromise = null;
                fetchRaceRooms(false);
                fetchMyRooms();
            }

            updateCoinUI();
            fetchMyRooms();
        }, (error) => {
            console.error("❌ 유저 데이터 실시간 수신 실패:", error);
        });
    } catch (error) {
        console.error("❌ 유저 데이터 초기 로딩/생성 실패:", error);
        alert("유저 정보를 불러오는 중 오류가 발생했습니다.");
    }
}

/**
 * [신규] 서버에 코인 수량만 업데이트하는 함수 (효율적)
 */
async function syncCoinsToServer(newCoinAmount) {
    if (!currentUser) return;
    const user = firebase.auth().currentUser;
    if (user) {
        try {
            await db.collection("users").doc(user.uid).update({
                coins: newCoinAmount
            });
            console.log("💰 서버 코인 동기화 완료:", newCoinAmount);
        } catch (error) {
            console.error("❌ 코인 동기화 실패:", error);
        }
    }
}

// 🌟 [추가] 오늘 날짜를 "YYYY-MM-DD" 형태로 깔끔하게 뽑아주는 계산기
function getTodayString() {
    const today = new Date();
    return `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
}

// 🌟 [추가] 코인 + 광고 본 횟수 + 날짜를 서버(Firestore)에 한 방에 덮어씌우는 함수!
async function syncAdRewardToServer(newCoinAmount, newAdCount, todayDate) {
    if (!currentUser) return;
    const user = firebase.auth().currentUser;
    if (user) {
        try {
            await db.collection("users").doc(user.uid).update({
                coins: newCoinAmount,
                adCount: newAdCount,
                lastAdDate: todayDate
            });
            console.log("🔒 서버 철벽 방어 완료! 코인:", newCoinAmount, "광고 횟수:", newAdCount);
        } catch (error) {
            console.error("❌ 서버 동기화 실패:", error);
        }
    }
}
/**
 * [신규] 유저 객체 전체를 서버에 저장하는 함수 (닉네임, 뱃지 등)
 */
async function saveUserDataToFirestore() {
    if (!currentUser) return;
    const user = firebase.auth().currentUser;
    if (user) {
        try {
            await db.collection("users").doc(user.uid).set(currentUser, { merge: true });
            console.log("💾 유저 데이터 전체 저장 완료");
        } catch (error) {
            console.error("❌ 유저 데이터 전체 저장 실패:", error);
        }
    }
}

/**
 * [개발용] 코인 수량을 강제로 설정합니다.
 * @param {number} amount - 설정할 코인의 양
 */
function setCoins(amount) {
    const newAmount = parseInt(amount);
    if (isNaN(newAmount) || newAmount < 0) {
        console.error("❌ 유효하지 않은 숫자입니다. 0 이상의 숫자를 입력해주세요.");
        return;
    }

    if (currentUser) { // 로그인 유저
        currentUser.coins = newAmount;
        saveUserDataToFirestore(); // 서버에 저장하면 onSnapshot 리스너가 UI를 자동으로 업데이트합니다.
        console.log(`💰 [로그인 유저] 코인을 ${newAmount}개로 설정하고 서버에 저장했습니다. 잠시 후 UI가 갱신됩니다.`);
    } else { // 게스트 유저
        guestCoins = newAmount;
        localStorage.setItem('chickenRunGuestCoins', newAmount.toString());
        updateCoinUI(); // 게스트는 수동으로 UI를 갱신해야 합니다.
        console.log(`💰 [게스트 유저] 코인이 ${newAmount}개로 설정되었습니다.`);
    }
}

// [6. 이벤트 리스너]
document.addEventListener('DOMContentLoaded', () => {

    // 코인 부족 모달 제어
    const sceneCoinShortage = document.getElementById('scene-coin-shortage');
    const btnShortageCancel = document.getElementById('btn-shortage-cancel');
    const btnShortageWatchAd = document.getElementById('btn-shortage-watch-ad');

    // 어디서든 부를 수 있게 전역 함수로 설정
    window.showCoinShortageModal = function() {
        const adData = getAdData(); // 만들어두었던 횟수 조회 함수 호출
        const adCountDisplay = document.getElementById('ad-count-display');
        
        if (adCountDisplay) {
            // 현재 시청 횟수와 최대 제한 횟수(10회)를 화면에 반영
            adCountDisplay.innerText = `(${adData.count}/${AD_CONFIG.DAILY_LIMIT} 시청 완료)`;
        }
        
        if (sceneCoinShortage) sceneCoinShortage.classList.remove('hidden');
    };

    if (btnShortageCancel) {
        btnShortageCancel.onclick = () => {
            sceneCoinShortage.classList.add('hidden');
        };
    }

    if (btnShortageWatchAd) {
        btnShortageWatchAd.onclick = () => {
            sceneCoinShortage.classList.add('hidden'); // 모달을 닫고
            watchAdAndGetReward(); // 곧바로 광고 실행!
        };
    }

    // 💡 페이지 로드 시 로그인 결과 확인
    firebase.auth().getRedirectResult()
        .then((result) => {
            sessionStorage.removeItem('pendingLoginProvider'); // 메모장 지우기
            if (result.user) {
                console.log("✅ 리다이렉트 로그인 성공!");
                waitForUserAndShowProfile();
            } else {
                if (window.resetLoginButtons) window.resetLoginButtons();
            }
        }).catch((error) => {
            console.error("❌ 로그인 처리 에러:", error.message);
            sessionStorage.removeItem('pendingLoginProvider');
            if (window.resetLoginButtons) window.resetLoginButtons();
        });

    // 2. 로그아웃 함수 수정
    window.handleLogout = function() {
        console.log("👋 로그아웃 시도 중...");
        firebase.auth().signOut().then(() => {
            alert("로그아웃 되었습니다.");
            // 💡 페이지를 새로고침하여 모든 UI 상태를 초기화합니다.
            location.reload();
        }).catch((error) => {
            alert("로그아웃 중 오류 발생: " + error.message);
        });
    };

    // 로컬 스토리지에서 '내 기록'을 불러오는 로직을 제거합니다.
    // 이제 모든 기록은 onAuthStateChanged를 통해 Firestore에서 가져옵니다.
    renderMyRecordList(); // 초기에는 "기록 없음" 상태로 렌더링됩니다.
    renderTop100List();

    const btnLoadMore = document.getElementById('btn-load-more');
    if (btnLoadMore) {
        btnLoadMore.onclick = () => {
            fetchRaceRooms(true);
        };
    }

    const btnLoadMoreMy = document.getElementById('btn-load-more-my');
    if (btnLoadMoreMy) {
        btnLoadMoreMy.onclick = () => {
            currentMyRoomLimit += 10;
            fetchMyRooms();
        };
    }

    const handleDebugBotAction = async (e) => {
        if (!currentUser || !currentUser.isAdmin) return;

        const target = e.target.closest('.debug-btn');
        if (!target) return;

        if (!target.dataset.roomId) return;

        e.stopPropagation(); 
        const roomId = target.dataset.roomId;
        const action = target.dataset.action;

        const roomRef = db.collection('rooms').doc(roomId);
        const participantsRef = roomRef.collection('participants');

        try {
            if (action === 'add') {
                await db.runTransaction(async (transaction) => {
                    const roomDoc = await transaction.get(roomRef);
                    if (!roomDoc.exists) throw "존재하지 않는 방입니다.";
                    const roomData = roomDoc.data();

                    if (roomData.currentPlayers >= roomData.maxPlayers) {
                        console.warn(`[Debug] 방 [${roomId}]이(가) 가득 찼습니다.`);
                        return; 
                    }

                    const botId = `bot_debug_${Date.now()}`;
                    const botNames = ["달려라치킨", "양념반후라이드반", "치킨은살안쪄", "다이어트내일부터", "꼬꼬댁꼬꼬", "1일1닭", "치킨마스터", "병아리반장", "구구구", "닭다리살인마", "치킨무많이", "뿌링클매니아", "BBQVIP", "교촌레드콤보", "야식참는중"];
                    
                    // 🟢 무작위로 하나를 뽑고, 뒤에 붙던 '_1234' 같은 숫자는 제거해서 깔끔하게 만듭니다.
                    const randomName = botNames[Math.floor(Math.random() * botNames.length)];
                    
                    const botData = {
                        id: botId,
                        name: randomName,
                        isBot: true,
                        score: 0,
                        totalScore: 0,
                        bestScore: 0,
                        status: 'waiting',
                        displayScore: 0,
                        attemptsLeft: roomData.attempts,
                        startDelay: 60 + Math.floor(Math.random() * 120), 
                        targetScore: 750 + Math.floor(Math.random() * 1500) 
                    };
                    transaction.set(participantsRef.doc(botId), botData);
                    const updates = { currentPlayers: firebase.firestore.FieldValue.increment(1) };
                    if (roomData.status === 'finished') {
                        updates.status = 'inprogress';
                    }
                    transaction.update(roomRef, updates);
                });
            } else if (action === 'remove') {
                const botQuerySnapshot = await participantsRef.where('isBot', '==', true).limit(1).get();
                if (botQuerySnapshot.empty) {
                    console.warn(`[Debug] 방 [${roomId}]에 제거할 봇이 없습니다.`);
                    return;
                }
                const botToRemoveRef = botQuerySnapshot.docs[0].ref;

                await db.runTransaction(async (transaction) => {
                    const roomDoc = await transaction.get(roomRef);
                    if (!roomDoc.exists) throw "존재하지 않는 방입니다.";
                    const roomData = roomDoc.data();

                    transaction.delete(botToRemoveRef);

                    const newPlayerCount = roomData.currentPlayers - 1;
                    if (newPlayerCount <= 0) {
                        transaction.delete(roomRef);
                    } else {
                        const updates = { currentPlayers: firebase.firestore.FieldValue.increment(-1) };
                        if (roomData.status === 'finished') {
                            updates.status = 'inprogress';
                        }
                        transaction.update(roomRef, updates);
                    }
                });
            }

            console.log(`[Debug] 방 [${roomId}]의 참가자 정보를 성공적으로 수정했습니다.`);

            const isInGame = !document.getElementById('scene-game').classList.contains('hidden');
            if (!isInGame) {
                fetchRaceRooms(false);
                fetchMyRooms();
            }
        } catch (error) {
            console.error("❌ 디버그 인원 수정 실패:", error);
        }
    };

    // [리팩토링] 여러 곳에 분산된 디버그 버튼 리스너를 상위 컨테이너(#app-container) 하나로 통합하여 코드 중복을 줄이고 관리를 용이하게 합니다.
    document.getElementById('app-container').addEventListener('click', handleDebugBotAction);
    const handleBotControlAction = async (e) => {
        const target = e.target.closest('.debug-btn[data-bot-id]');
        if (!target || !currentRoom) return;

        e.stopPropagation(); 

        const botId = target.dataset.botId;
        const action = target.dataset.action;
        const participantRef = db.collection('rooms').doc(currentRoom.id).collection('participants').doc(botId);

        try {
            switch (action) {
                case 'force-start':
                    console.log(`[Debug] Bot [${botId}] 강제 시작`);
                    const roomRefForStart = db.collection('rooms').doc(currentRoom.id);
                    await db.runTransaction(async (transaction) => {
                        const roomDoc = await transaction.get(roomRefForStart);
                        if (!roomDoc.exists) return;

                        transaction.update(participantRef, { status: 'playing' });

                        if (roomDoc.data().status === 'finished') {
                            transaction.update(roomRefForStart, { status: 'inprogress' });
                        }
                    });
                    break;
                case 'force-end':
                    console.log(`[Debug] Bot [${botId}] 강제 종료`);
                    await participantRef.update({ status: 'dead' });
                    break;
                case 'force-delete':
                    console.log(`[Debug] Bot [${botId}] '목록 삭제' 시뮬레이션 시작`);
                    try {
                        const roomRefForDelete = db.collection('rooms').doc(currentRoom.id);
                        const participantRef = roomRefForDelete.collection('participants').doc(botId);

                        // 봇도 명부에서 hidden: true 처리
                        await participantRef.update({ hidden: true });

                        // 💡 [추가] 방 정보를 먼저 가져옵니다.
                        const roomDoc = await roomRefForDelete.get();
                        const roomData = roomDoc.exists ? roomDoc.data() : null;

                        const participantsSnapshot = await roomRefForDelete.collection('participants').get();
                        let shouldExplode = true;
                        let allDead = true;

                        participantsSnapshot.forEach(doc => {
                            const data = doc.data();
                            if (!data.hidden) shouldExplode = false;
                            if (data.status !== 'dead') allDead = false;
                        });

                        // 🚨 [핵심 버그 수정] 봇 삭제 시에도 방 정원이 차지 않았다면 폭파 방지!
                        if (roomData && roomData.currentPlayers < roomData.maxPlayers) {
                            shouldExplode = false;
                        }

                        if (shouldExplode) {
                            console.log(`💣 봇을 포함한 모든 참가자가 삭제함. 방 [${currentRoom.id}] 완전 삭제!`);
                            const batch = db.batch();
                            participantsSnapshot.forEach(doc => { batch.delete(doc.ref); });
                            batch.delete(roomRefForDelete);
                            await batch.commit();
                            exitToLobby(false);
                        } else {
                            if (roomData) {
                                if (roomData.currentPlayers >= roomData.maxPlayers && allDead && roomData.status !== 'finished') {
                                    await roomRefForDelete.update({ status: 'finished' });
                                    console.log(`✅ 봇 목록 삭제로 방 [${currentRoom.id}] 정원 충족 종료.`);
                                }
                            }
                        }
                    } catch (err) {
                        console.error("❌ 봇 삭제 시뮬레이션 오류:", err);
                    }
                    break;
            }
        } catch (error) {
            console.error(`[Debug] 봇 컨트롤 실패 (Action: ${action}):`, error);
        }
    };
    document.getElementById('multi-score-list').addEventListener('click', handleBotControlAction);

    const myRecordScrollArea = document.querySelector('#content-my-record .list-scroll-area');
    if (myRecordScrollArea) {
        myRecordScrollArea.onscroll = () => {
            if (myRecordScrollArea.scrollTop + myRecordScrollArea.clientHeight >= myRecordScrollArea.scrollHeight - 50) {
                if (displayedMyRecordsCount < myScores.length && displayedMyRecordsCount < 100) {
                    displayedMyRecordsCount += 20;
                    renderMyRecordList(true); 
                }
            }
        };
    }

    const sceneCreateRoom = document.getElementById('scene-create-room');
    const btnCreateOpen = document.getElementById('btn-create-room-open');
    const btnCreateConfirm = document.getElementById('btn-create-confirm');
    const btnCreateCancel = document.getElementById('btn-create-cancel');
    const btnRaceStart = document.getElementById('btn-race-start');
    const btnSingle = document.getElementById('btn-login-single');
    const btnRestart = document.getElementById('btn-restart');
    const controlContainer = document.getElementById('control-container');
    const btnSoundToggle = document.getElementById('btn-sound-toggle');
    const btnMember = document.getElementById('btn-member');
    const btnExitFromStart = document.getElementById('btn-exit-from-start'); 
    const btnExitFromPause = document.getElementById('btn-exit-from-pause'); 
    const btnExitFromGameover = document.getElementById('btn-exit-from-gameover'); 
    const btnDeleteRoom = document.getElementById('btn-delete-room'); 
    const btnPauseToggle = document.getElementById('btn-pause-toggle');
    const btnResumeGame = document.getElementById('btn-resume-game');

    const rankTypeGroup = document.getElementById('group-rank-type');
    if (rankTypeGroup) {
        rankTypeGroup.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                rankTypeGroup.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
            }
        });
    }

    const inputAttempts = document.getElementById('input-room-attempts');
    const displayAttempts = document.getElementById('display-attempts');

    // 💡 비용(displayCost) 관련 코드를 삭제하고 시도 횟수만 업데이트하도록 수정
    if (inputAttempts && displayAttempts) {
        const updateAttempts = () => {
            const attempts = inputAttempts.value;
            displayAttempts.innerText = attempts;
        };
        inputAttempts.addEventListener('input', updateAttempts);
        updateAttempts();
    }

    const inputLimit = document.getElementById('input-room-limit');
    const displayLimit = document.getElementById('display-limit');
    if (inputLimit && displayLimit) {
        const updateLimit = () => {
            displayLimit.innerText = inputLimit.value;
        };
        inputLimit.addEventListener('input', updateLimit);
        updateLimit();
    }
    
    const rangeInputs = document.querySelectorAll('.modal-theme-orange input[type="range"]');
    rangeInputs.forEach(range => {
        const updateRangeProgress = () => {
            const value = (range.value - range.min) / (range.max - range.min) * 100;
            range.style.setProperty('--progress-percent', `${value}%`);
        };
        range.addEventListener('input', updateRangeProgress);
        updateRangeProgress();

        // 💡 [여기에 추가!] 슬라이더를 터치할 때마다 강제로 키보드를 내리고 포커스를 없앱니다.
        range.addEventListener('touchstart', () => {
            if (document.activeElement) {
                document.activeElement.blur(); 
            }
        }, { passive: true });
    });

    const btnJump = document.getElementById('btn-jump');
    const btnBoost = document.getElementById('btn-boost');

    if (btnJump) {
        const handleJumpStart = (e) => { e.preventDefault(); isJumpPressed = true; btnJump.classList.add('pressed'); };
        const handleJumpEnd = (e) => { e.preventDefault(); isJumpPressed = false; chicken.cutJump(); btnJump.classList.remove('pressed'); };
        
        btnJump.addEventListener('mousedown', handleJumpStart);
        btnJump.addEventListener('mouseup', handleJumpEnd);
        btnJump.addEventListener('mouseleave', handleJumpEnd);
        btnJump.addEventListener('touchstart', handleJumpStart, { passive: false });
        btnJump.addEventListener('touchend', handleJumpEnd);
        btnJump.addEventListener('touchcancel', handleJumpEnd); 
    }

    if (btnBoost) {
        const handleBoostStart = (e) => { e.preventDefault(); chicken.isBoosting = true; btnBoost.classList.add('pressed'); };
        const handleBoostEnd = (e) => { e.preventDefault(); chicken.isBoosting = false; btnBoost.classList.remove('pressed'); };
        
        btnBoost.addEventListener('mousedown', handleBoostStart);
        btnBoost.addEventListener('mouseup', handleBoostEnd);
        btnBoost.addEventListener('mouseleave', handleBoostEnd);
        btnBoost.addEventListener('touchstart', handleBoostStart, { passive: false });
        btnBoost.addEventListener('touchend', handleBoostEnd);
        btnBoost.addEventListener('touchcancel', handleBoostEnd);
    }

    // [신규] PC 환경 스페이스바 점프 이벤트 추가
    window.addEventListener('keydown', (e) => {
        // 입력창(비밀번호, 닉네임, 방제 등)에 포커스가 있을 때는 스페이스바 점프 방지
        const targetTag = e.target.tagName.toLowerCase();
        if (targetTag === 'input' || targetTag === 'textarea') return;

        if (e.code === 'Space') {
            e.preventDefault(); // 스페이스바로 인한 화면 스크롤 방지
            if (!isJumpPressed && gameState === STATE.PLAYING) {
                isJumpPressed = true;
                if (btnJump) btnJump.classList.add('pressed');
                chicken.jump(); // 닭 점프 실행
            }
        }
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.key.toLowerCase() === 'b') {
            const btnBoost = document.getElementById('btn-boost');
            
            if (btnBoost && btnBoost.offsetParent !== null) { 
                // 1. 이미 눌려있는 상태면 중복 실행 방지 (키보드 꾹 누를 때 연속 발생 방지)
                if (btnBoost.classList.contains('pressed')) return; 

                // 2. 시각 효과 적용
                btnBoost.classList.add('pressed'); 
                
                // 3. ✨ [핵심 수정] 단순 click() 대신 모바일 터치와 마우스 클릭 이벤트를 동시에 강제 발생!
                btnBoost.dispatchEvent(new Event('touchstart'));
                btnBoost.dispatchEvent(new Event('mousedown'));
                btnBoost.dispatchEvent(new PointerEvent('pointerdown'));
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        const targetTag = e.target.tagName.toLowerCase();
        if (targetTag === 'input' || targetTag === 'textarea') return;

        if (e.code === 'Space') {
            e.preventDefault();
            isJumpPressed = false;
            if (btnJump) btnJump.classList.remove('pressed');
            chicken.cutJump(); // 스페이스바를 떼면 소점프 처리
        }
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.key.toLowerCase() === 'b') {
            const btnBoost = document.getElementById('btn-boost');
            if (btnBoost) {
                btnBoost.classList.remove('pressed'); 
                
                // ✨ 뗄 때도 터치 종료 이벤트를 발생시켜 게임 로직이 정상 종료되도록 처리
                btnBoost.dispatchEvent(new Event('touchend'));
                btnBoost.dispatchEvent(new Event('mouseup'));
                btnBoost.dispatchEvent(new PointerEvent('pointerup'));
            }
        }
    });

    const scenePasswordInput = document.getElementById('scene-password-input');
    const btnPasswordConfirm = document.getElementById('btn-password-confirm');
    const btnPasswordCancel = document.getElementById('btn-password-cancel');

    const sceneExitConfirm = document.getElementById('scene-exit-confirm');
    const btnExitConfirm = document.getElementById('btn-exit-confirm');
    const btnExitCancel = document.getElementById('btn-exit-cancel');

    const sceneDeleteRoomConfirm = document.getElementById('scene-delete-room-confirm');
    const btnDeleteRoomConfirm = document.getElementById('btn-delete-room-confirm');
    const btnDeleteRoomCancel = document.getElementById('btn-delete-room-cancel');

    const sceneAuth = document.getElementById('scene-auth');

    const sceneUserProfile = document.getElementById('scene-user-profile');
    const btnProfileConfirm = document.getElementById('btn-profile-confirm');
    const btnLogout = document.getElementById('btn-logout');
    const btnRechargeCoin = document.getElementById('btn-recharge-coin');

    const btnGoogleLogin = document.getElementById('btnGoogleLogin');
    const btnAppleLogin = document.getElementById('btnAppleLogin');

    /**
     * 로그인 버튼들을 초기 상태로 되돌리는 함수 (취소 시 사용)
     * 로그인 버튼 UI 컨트롤러 (스피너 추가 및 일관성 유지)
     */
    (function() {
        const gBtn = document.getElementById('btnGoogleLogin');
        const aBtn = document.getElementById('btnAppleLogin');
        const group = document.querySelector('.sns-login-group');

        if (!gBtn || !aBtn) return;

        // 스피너 애니메이션 CSS 전역 추가
        if (!document.getElementById('spinner-style')) {
            const style = document.createElement('style');
            style.id = 'spinner-style';
            style.innerHTML = `@keyframes btn-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
            document.head.appendChild(style);
        }

        // UI 리셋 함수
        window.resetLoginButtons = function() {
            if (group) group.style.gap = '0.75rem';
            [gBtn, aBtn].forEach(btn => {
                btn.classList.remove('hide', 'loading');
                const inner = btn.querySelector('.inner-btn-group');
                if (inner) { inner.classList.add('hidden'); inner.innerHTML = ''; }
                const isG = btn.id.includes('Google');
                btn.querySelector('.btn-text').innerHTML = isG ? 'Google<br>계정으로 로그인' : 'Apple<br>계정으로 로그인';
            });
        };

        // ✅ UI를 '로딩 상태(스피너)'로 변경하는 함수 (Redirect 복귀 시에도 사용)
        window.setButtonLoadingUI = function(platform) {
            const clicked = platform === 'google' ? gBtn : aBtn;
            const other = platform === 'google' ? aBtn : gBtn;

            if (group) group.style.gap = '0';
            other.classList.add('hide');
            clicked.classList.add('loading');

            const name = platform === 'google' ? 'Google' : 'Apple';

            // 💡 [수정] 구글은 짙은 회색/검정 스피너, 애플은 반투명/흰색 스피너로 색상 분기
            const isGoogle = platform === 'google';
            const spinBaseColor = isGoogle ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.3)'; // 멈춰있는 둥근 바탕 선
            const spinTopColor = isGoogle ? '#191919' : '#fff';                           // 빙글빙글 도는 포인트 선

            // 스피너 HTML에 변수(색상) 적용
            const spinnerHtml = `<div style="margin: 10px auto; width: 30px; height: 30px; border: 3px solid ${spinBaseColor}; border-top: 3px solid ${spinTopColor}; border-radius: 50%; animation: btn-spin 1s linear infinite;"></div>`;

            clicked.querySelector('.btn-text').innerHTML = `${name} 계정으로<br><span style="font-size:0.9rem;">로그인 중입니다.</span>${spinnerHtml}`;

            const inner = clicked.querySelector('.inner-btn-group');
            inner.classList.remove('hidden');
            inner.innerHTML = `
                <button onclick="event.stopPropagation(); window.resetLoginButtons();">취소</button>
                <button id="retry-login-btn">다시 시도</button>
            `;
            inner.querySelector('#retry-login-btn').onclick = (e) => {
                e.stopPropagation();
                callActualLogin(platform);
            };
        };

        function callActualLogin(platform) {
            console.log(`📡 ${platform} 로그인 실제 호출`);
            if (platform === 'google') {
                if (window.AndroidBridge) window.AndroidBridge.requestGoogleLogin();
                else if (typeof loginWithGoogle === 'function') loginWithGoogle();
            } else {
                if (typeof loginWithApple === 'function') loginWithApple();
            }
        }

        function startTransition(platform) {
            const clicked = platform === 'google' ? gBtn : aBtn;
            if (clicked.classList.contains('loading')) return; // 중복 방지

            // 버튼 UI를 로딩 상태로 변경
            window.setButtonLoadingUI(platform);

            // 0.5초 애니메이션 후 첫 실행
            setTimeout(() => {
                callActualLogin(platform);
            }, 500);
        }

        gBtn.onclick = () => startTransition('google');
        aBtn.onclick = () => startTransition('apple');

        // ⭐️ [여기에 추가!] 새로고침 되어 돌아왔을 때 메모장을 보고 버튼 스피너를 다시 돌립니다.
        const pendingProvider = sessionStorage.getItem('pendingLoginProvider');
        if (pendingProvider) {
            const sceneAuth = document.getElementById('scene-auth');
            if (sceneAuth) sceneAuth.classList.remove('hidden'); // 로그인 모달 띄우기
            window.setButtonLoadingUI(pendingProvider); // 해당 버튼 스피너 작동!
        }
    })();

    // 🟢 센스 있는 랜덤 방 제목 자판기! (마음껏 추가하세요)
    let currentRandomTitle = "이 구역 미친 닭 누구야?";
    const funRoomTitles = [
        "이 구역 미친 닭 누구야?",
        "오늘 저녁은 치킨이닭!",
        "양념 반 후라이드 반",
        "닭가슴살은 이제 그만",
        "날지 못하는 새들의 반란",
        "1등하면 치킨 사드림",
        "아무나 들어와라 꼬꼬",
        "계란으로 바위치기",
        "내가 조선의 국모닭",
        "닭들의 숨막히는 레이스",
        "치킨런 실사판 대개봉",
        "알 낳고 갈래?",
        "닭다리 걸고 한판 승부!",
        "파닭파닭 거리지마라",
        "내 스피드는 시속 100km닭",
        "빨리 안 오면 다 튀겨버림",
        "너희들은 뛰니? 나는 난닭",
        "초보만 오세요 (진짜임)",
        "고인물 출입 금지",
        "나보다 빠른 닭 나와봐",
        "치킨 냄새 맡고 왔습니다",
        "다이어트 중인데 치킨 먹어도 됨?",
        "순살파 vs 뼈닭파 대결",
        "간장치킨 땡기는 레이스",
        "마지막에 웃는 닭은 누구?",
        "닭치고 뛰어!",
        "너의 등짝을 쪼아주마",
        "날개 달린 자들의 경주",
        "알에서 깨어난 지 5분 됨",
        "K-치킨의 위엄을 보여주마",
        "치킨런: 닭들의 반란",
        "오늘도 치킨은 달린다",
        "치킨 먹고 힘내자",
        "닭들의 숨막히는 레이스",
    ];

    if (btnCreateOpen) {
        btnCreateOpen.onclick = () => {
            if (!isLoggedIn) {
                if (sceneAuth) {
                    sceneAuth.classList.remove('hidden');
                    const authMsg = sceneAuth.querySelector('.auth-message');
                    if (authMsg) {
                        authMsg.style.display = 'block';
                        authMsg.innerText = '방 만들기는 로그인 후 이용 가능합니다.';
                    }
                }
                return;
            }

            // 🟢 방 만들기 창을 열 때마다 랜덤으로 제목 하나를 뽑습니다.
            currentRandomTitle = funRoomTitles[Math.floor(Math.random() * funRoomTitles.length)];
            
            const titleInputEl = document.getElementById('input-room-title');
            if (titleInputEl) {
                titleInputEl.value = ''; // 기존에 적혀있던 글씨 비우기
                titleInputEl.placeholder = `${currentRandomTitle} (최대 20자)`; // 옅은 글씨로 추천 제목 띄우기
            }

            document.getElementById('input-room-password-create').value = ''; 
            sceneCreateRoom.classList.remove('hidden');
        };
    }

    if (btnCreateCancel) btnCreateCancel.onclick = () => sceneCreateRoom.classList.add('hidden');

    if (btnMember) {
        btnMember.onclick = () => {
            if (isLoggedIn && currentUser) {
                // 1. 로그인 상태면 바로 프로필 화면을 띄웁니다.
                showUserProfile();
            } else {
                // 2. 로그아웃 상태면 UI를 리셋하고 로그인 모달을 띄웁니다.
                if (window.resetLoginButtons) window.resetLoginButtons();
                
                // ReferenceError 방지를 위해 ID로 직접 찾거나 sceneAuth 변수 사용
                const authScene = document.getElementById('scene-auth');
                if (authScene) {
                    const authMsg = authScene.querySelector('.auth-message');
                    if (authMsg) authMsg.style.display = 'none';
                    authScene.classList.remove('hidden');
                }
            }
        };
    }

    if (btnProfileConfirm) {
        btnProfileConfirm.onclick = () => {
            const newNickname = document.getElementById('profile-nickname').value.trim();
            if (newNickname && currentUser) {
                currentUser.nickname = newNickname;
                saveUserDataToFirestore(); 
                console.log('닉네임 변경됨:', currentUser.nickname);
            }
            if (sceneUserProfile) sceneUserProfile.classList.add('hidden');
        };
    }

    if (btnLogout) {
        btnLogout.onclick = () => {
            firebase.auth().signOut().catch((error) => {
                console.error('❌ 로그아웃 실패:', error);
                alert('로그아웃 중 오류가 발생했습니다.');
            });
        };
    }

    if (btnRechargeCoin) {
        btnRechargeCoin.onclick = () => {
            watchAdAndGetReward();
        };
    }

    if (btnCreateConfirm) {
        btnCreateConfirm.onclick = async () => {
            const user = firebase.auth().currentUser;
            if (!user) {
                alert("방을 만들려면 로그인이 필요합니다.");
                return;
            }

            const titleInput = document.getElementById('input-room-title').value;
            const passwordInput = document.getElementById('input-room-password-create').value.trim();
            const limitInput = document.getElementById('input-room-limit').value;
            const attemptsInput = document.getElementById('input-room-attempts').value;
            const activeRankBtn = document.querySelector('#group-rank-type button.active');
            const rankType = activeRankBtn ? activeRankBtn.dataset.val : 'best';
            const attempts = parseInt(attemptsInput) || 3;
            const cost = 2; // 💡 [기획] 멀티 입장료 2코인 고정
            if (currentUser.coins < cost) {
                window.showCoinShortageModal(); // 💡 얼럿 대신 광고 모달 띄우기
                return;
            }

            try {
                const roomRef = db.collection("rooms").doc(); 

                const roomData = {
                    title: titleInput || currentRandomTitle,
                    password: passwordInput.length > 0 ? passwordInput : null,
                    maxPlayers: parseInt(limitInput) || 5,
                    currentPlayers: 1, 
                    creatorUid: user.uid,
                    attempts: parseInt(document.getElementById('input-room-attempts').value) || 3,
                    rankType: 'total', // 💡 [기획] 무조건 합산 방식으로 고정
                    status: "inprogress",
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                const initialBatch = db.batch();
                const creatorRef = roomRef.collection('participants').doc(user.uid);
                const creatorData = { id: user.uid, name: currentUser.nickname, isBot: false, score: 0, totalScore: 0, bestScore: 0, status: 'waiting', displayScore: 0, attemptsLeft: attempts };
                initialBatch.set(roomRef, roomData);
                initialBatch.set(creatorRef, creatorData);
                await initialBatch.commit();
                console.log("✅ 1단계: 방 및 생성자 정보 생성 완료! ID:", roomRef.id);
                
                // [수정] 관리자 계정으로 방 생성 시에만 봇을 추가합니다.
                if (currentUser && currentUser.isAdmin) {
                    const botBatch = db.batch();
                    const botRef = roomRef.collection('participants').doc(`bot_${Date.now()}`);
                    
                    // 🟢 방 생성 시 기본으로 들어오는 봇도 랜덤 닉네임 적용
                    const initBotNames = ["초보지만열심히", "닭다리내꺼", "치킨런장인", "황금올리브", "야식은치킨", "달리는통닭", "계란이먼저냐"];
                    const randomInitName = initBotNames[Math.floor(Math.random() * initBotNames.length)];
                    
                    const botData = { id: botRef.id, name: randomInitName, isBot: true, score: 0, totalScore: 0, bestScore: 0, status: 'waiting', displayScore: 0, attemptsLeft: attempts, startDelay: 60, targetScore: 750 }; 
                    botBatch.set(botRef, botData);

                    botBatch.update(roomRef, { currentPlayers: firebase.firestore.FieldValue.increment(1) });
                    await botBatch.commit();
                    console.log("✅ 2단계: 초기 봇 추가 완료!");
    
                    roomData.currentPlayers = 2; 
                }
                const newRoomForGame = mapFirestoreDocToRoom({ id: roomRef.id, data: () => roomData });

                raceRooms.unshift(newRoomForGame);

                const newJoinedRoomEntry = { usedAttempts: 0, isPaid: false };
                currentUser.joinedRooms[newRoomForGame.id] = newJoinedRoomEntry;

                await db.collection("users").doc(user.uid).set({
                    joinedRooms: {
                        [newRoomForGame.id]: newJoinedRoomEntry
                    }
                }, { merge: true });
                console.log("💾 유저의 joinedRooms에 새 방 정보 저장 완료");

                sceneCreateRoom.classList.add('hidden');
                enterGameScene('multi', newRoomForGame);

            } catch (error) {
                console.error("❌ 방 생성 실패:", error);
                alert("방을 만드는 중 오류가 발생했습니다.");
            }
        };
    }

    if (btnPasswordConfirm) {
        btnPasswordConfirm.onclick = () => {
            if (targetRoom && targetRoom.current >= targetRoom.limit) {
                alert('인원 제한으로 참여할 수 없습니다.');
                return;
            }
            const cost = 2;
            if (!currentUser || currentUser.coins < cost) {
                if (scenePasswordInput) scenePasswordInput.classList.add('hidden'); // 💡 켜져 있던 비번창 닫기
                window.showCoinShortageModal(); // 💡 얼럿 대신 광고 모달 띄우기
                return;
            }

            const inputPw = document.getElementById('input-room-password').value;
            const msg = document.getElementById('password-message');

            if (targetRoom && inputPw === targetRoom.password) {
                unlockedRoomIds.push(targetRoom.id); 
                scenePasswordInput.classList.add('hidden');
                attemptToJoinRoom(targetRoom);
                targetRoom = null;
            } else {
                if (msg) {
                    msg.innerText = '비밀번호가 일치하지 않습니다.';
                    msg.style.display = 'block'; 
                }
            }
        };
    }

    if (btnPasswordCancel) {
        btnPasswordCancel.onclick = () => { if (scenePasswordInput) scenePasswordInput.classList.add('hidden'); targetRoom = null; };
    }

    if (btnExitConfirm) {
        btnExitConfirm.onclick = () => {
            if (sceneExitConfirm) sceneExitConfirm.classList.add('hidden');
            exitToLobby(false);
        };
    }
    if (btnExitCancel) {
        btnExitCancel.onclick = () => { if (sceneExitConfirm) sceneExitConfirm.classList.add('hidden'); };
    }
    // 🚨 '참가중인 목록에서 삭제' 버튼을 눌렀을 때 확인 모달 띄우기 (상태별 문구)
    if (btnDeleteRoom) {
        btnDeleteRoom.onclick = () => {
            const sceneDeleteRoomConfirm = document.getElementById('scene-delete-room-confirm');

            // 💡 [핵심 변경] HTML에서 바꾼 클래스 이름('.modal-notice')으로 찾아오도록 수정합니다.
            const msgEl = sceneDeleteRoomConfirm.querySelector('.modal-notice');

            if (currentRoom && currentRoom.status !== 'finished') {
                msgEl.innerHTML = `현재 게임이 <strong>진행 중</strong>입니다.<br>목록에서 삭제해도 기록은 유지되며, 최종 순위에 따라 리워드가 지급됩니다.<br>(단, 모든 참가자가 방을 삭제하면 방이 폭파되어 기록과 리워드가 소멸됩니다.)`;
            } else {
                msgEl.innerHTML = `해당 게임을 참가중인 게임 목록에서 삭제합니다.`;
            }

            if (sceneDeleteRoomConfirm) sceneDeleteRoomConfirm.classList.remove('hidden');
        };
    }
    if (btnDeleteRoomConfirm) {
        btnDeleteRoomConfirm.onclick = async () => {
            if (sceneDeleteRoomConfirm) sceneDeleteRoomConfirm.classList.add('hidden');
            await removeFromMyRooms();
        };
    }
    if (btnDeleteRoomCancel) {
        btnDeleteRoomCancel.onclick = () => { if (sceneDeleteRoomConfirm) sceneDeleteRoomConfirm.classList.add('hidden'); };
    }

    document.querySelectorAll('.modal-container .close_modal').forEach(btn => {
        btn.onclick = () => {
            btn.closest('section').classList.add('hidden');
        };
    });

    if (btnPauseToggle) btnPauseToggle.onclick = togglePause;
    if (btnResumeGame) btnResumeGame.onclick = togglePause;

    if (btnSingle) {
        btnSingle.onclick = () => {
            // 💡 [수정] 코인 개수와 무관하게 일단 싱글 모드 대기실로 입장시킵니다.
            // (대기실 안의 '시작' 버튼을 누를 때 코인 검사 & 광고 모달이 알아서 작동합니다!)
            enterGameScene('single'); 
        };
    }

    if (btnRaceStart) {
        btnRaceStart.onclick = () => {
            // [리팩토링] 코인 차감 로직을 handleSinglePlayerStartCost 함수로 분리
            if (currentGameMode === 'single' && !handleSinglePlayerStartCost()) {
                return; // 코인이 부족하면 중단
            }
            
            // 멀티 모드 코인 처리 (방 입장 시 1회 지불)
            if (currentGameMode === 'multi' && currentRoom && currentUser) {
                const userRoomState = currentUser.joinedRooms[currentRoom.id];
                if (userRoomState && !userRoomState.isPaid) {
                    
                    // 💡 횟수와 상관없이 무조건 2코인만 뺍니다!
                    const cost = 2; 
                    
                    if (currentUser.coins < cost) {
                        alert(`코인이 부족합니다.\n(필요: ${cost}, 보유: ${currentUser.coins})`);
                        return;
                    }
                    currentUser.coins -= cost;
                    userRoomState.isPaid = true;
                    updateCoinUI();
                    saveUserDataToFirestore(); 
                    updateButtonCosts(); 
                }
            }

            // [리팩토링] 게임 시작 로직을 executeGameStart 함수로 분리
            clearAutoActionTimer(); 
            document.getElementById('game-start-screen').classList.add('hidden');
            setControlsVisibility(true); 
            setTimeout(executeGameStart, 500);
        };
    }

    if (btnRestart) {
        btnRestart.onclick = () => {
            // [리팩토링] 코인 차감 로직을 handleSinglePlayerStartCost 함수로 분리
            if (currentGameMode === 'single' && !handleSinglePlayerStartCost()) {
                return; // 코인이 부족하면 중단
            }
            // 멀티 모드에서는 재시작 시 별도 코인 차감이 없음

            // [리팩토링] 게임 시작 로직을 executeGameStart 함수로 분리
            clearAutoActionTimer();
            document.getElementById('game-over-screen').classList.add('hidden');
            setControlsVisibility(true); 
            setTimeout(() => {
                resetGame();
                executeGameStart();
            }, 500);
        };
    }

    // 효과음 버튼 제어
    const btnEffectToggle = document.getElementById('btn-sound-toggle');
    if (btnEffectToggle) {
        btnEffectToggle.classList.toggle('effect-on', isEffectOn);
        btnEffectToggle.classList.toggle('effect-off', !isEffectOn);

        btnEffectToggle.onclick = () => {
            isEffectOn = !isEffectOn; 
            btnEffectToggle.classList.toggle('effect-on', isEffectOn);
            btnEffectToggle.classList.toggle('effect-off', !isEffectOn);
            console.log(`효과음 상태: ${isEffectOn ? 'ON' : 'OFF'}`);
        };
    }

    // [신규] 배경음악 버튼 제어
    const btnBgmToggle = document.getElementById('btn-bgm-toggle');
    if (btnBgmToggle) {
        btnBgmToggle.classList.toggle('bgm-on', isBgmOn);
        btnBgmToggle.classList.toggle('bgm-off', !isBgmOn);

        btnBgmToggle.onclick = () => {
            isBgmOn = !isBgmOn; 
            btnBgmToggle.classList.toggle('bgm-on', isBgmOn);
            btnBgmToggle.classList.toggle('bgm-off', !isBgmOn);
            console.log(`BGM 상태: ${isBgmOn ? 'ON' : 'OFF'}`);
            
            if (isBgmOn) {
                if (gameState === STATE.PLAYING) playSound('bgm');
            } else {
                pauseBGM();
            }
        };
    }

    const initTabs = (t1Id, t2Id, c1Id, c2Id, onTabClickCallback = null) => {
        const t1 = document.getElementById(t1Id); const t2 = document.getElementById(t2Id);
        const c1 = document.getElementById(c1Id); const c2 = document.getElementById(c2Id);
        if (t1 && t2) {
            const handleTabClick = () => {
                if (onTabClickCallback) onTabClickCallback();
            };
            t1.onclick = () => { t1.classList.add('active'); t2.classList.remove('active'); c1.classList.remove('hidden'); c2.classList.add('hidden'); handleTabClick(); };
            t2.onclick = () => { t2.classList.add('active'); t1.classList.remove('active'); c2.classList.remove('hidden'); c1.classList.add('hidden'); handleTabClick(); };
        }
    };

    initTabs('tab-race-room', 'tab-my-rooms', 'content-race-room', 'content-my-rooms', () => {
        // [수정] 탭을 전환할 때마다 항상 최신 방 목록을 가져오도록 강제합니다.
        console.log("🔄️ 탭 전환으로 목록 새로고침을 요청합니다.");
        roomFetchPromise = null; // 캐시된 Promise를 초기화하여 재호출을 강제합니다.
        fetchRaceRooms(false);
        fetchMyRooms();
    });

    initTabs('tab-my-record', 'tab-top-100', 'content-my-record', 'content-top-100', () => {
        const tabTop100 = document.getElementById('tab-top-100');
        if (tabTop100 && tabTop100.classList.contains('active')) {
            loadLeaderboard();
        }
    });

    document.querySelectorAll('.list-tabgroup .refresh').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            // [수정] 새로고침 버튼 클릭 시, 항상 최신 방 목록을 가져오도록 강제합니다.
            console.log("🔄️ 새로고침 버튼으로 목록 새로고침을 요청합니다.");
            roomFetchPromise = null; // 캐시된 Promise를 초기화하여 재호출을 강제합니다.
            fetchRaceRooms(false);
            fetchMyRooms();
        };
    });

    if (btnExitFromStart) btnExitFromStart.onclick = () => exitToLobby(true);
    if (btnExitFromPause) btnExitFromPause.onclick = handleHomeButtonClick;
    if (btnExitFromGameover) btnExitFromGameover.onclick = handleHomeButtonClick;

    // [신규] 이어하기 화면 버튼 이벤트 연결
    const btnContinueYes = document.getElementById('btn-continue-yes');
    if (btnContinueYes) btnContinueYes.onclick = resumeFromContinue;

    const btnContinueNo = document.getElementById('btn-continue-no');
    if (btnContinueNo) btnContinueNo.onclick = proceedToGameOver;

    const btnExitFromContinue = document.getElementById('btn-exit-from-continue');
    if (btnExitFromContinue) btnExitFromContinue.onclick = handleHomeButtonClick;

    window.resetAdCount = resetAdCount; // [테스트용] 광고 시청횟수
    window.resetRoomData = resetRoomData;// [테스트용] 룸데이터 초기화(모집중)
    window.setCoins = setCoins; // [테스트용] 개발용 코인 설정 함수 전역 등록

    // 로그아웃 버튼 이벤트 리스너 (HTML의 id="btn-logout"과 정확히 연결)
    if (btnLogout) {
        btnLogout.onclick = () => {
            console.log("👋 로그아웃 시도 중...");
            firebase.auth().signOut().then(() => {
                alert("로그아웃 되었습니다.");
                location.reload(); // 깔끔하게 새로고침
            }).catch((error) => {
                console.error('❌ 로그아웃 실패:', error);
                alert("로그아웃 중 오류 발생: " + error.message);
            });
        };
    }
});

/**
 * [앱 전용] 안드로이드 네이티브 로그인 성공 시 호출되는 콜백 함수
 * @param {string} token - 안드로이드에서 건네준 Google ID 토큰
 */
window.onNativeLoginSuccess = function(token) {
    console.log("🎁 앱에서 로그인 토큰 도착!");
    const credential = firebase.auth.GoogleAuthProvider.credential(token);
    firebase.auth().signInWithCredential(credential)
        .then((result) => {
            console.log("✅ 로그인 성공!");
            // 1. 로그인 모달 닫기
            document.getElementById('scene-auth').classList.add('hidden');
            // 2. 사용자 프로필 화면 즉시 띄우기
            setTimeout(() => { showUserProfile(); }, 300);
        })
        .catch((error) => {
            console.error("❌ 인증 실패:", error);
            if (window.resetLoginButtons) window.resetLoginButtons();
        });
};

// [신규] 유저 데이터가 완전히 로드될 때까지 기다렸다가 모달을 띄우는 함수
window.waitForUserAndShowProfile = function() {
    const checkInterval = setInterval(() => {
        // currentUser가 생성되고, 닉네임 데이터까지 완벽하게 세팅되었다면
        if (currentUser && currentUser.nickname) {
            clearInterval(checkInterval); // 추적 중지

            // 로그인 모달 숨기기 & 화면 차단기 제거
            const sceneAuth = document.getElementById('scene-auth');
            if (sceneAuth) sceneAuth.classList.add('hidden');
            const blockUi = document.getElementById('auth-block-ui');
            if (blockUi) blockUi.remove();

            // 완벽한 상태에서 프로필 모달 띄우기
            showUserProfile();
        }
    }, 100); // 0.1초마다 데이터가 도착했는지 찔러봄
};

// 💡 [최종 정리] 1. 고객센터 (이메일 안내창)
const btnCustomerService = document.getElementById('btn-customer-service');
if (btnCustomerService) {
    const openCustomerService = (e) => {
        e.preventDefault();
        alert("게임 이용에 관한 문의 사항은 아래 이메일로 보내주세요!\n\n📧 kitworks.inc@gmail.com");
    };
    btnCustomerService.addEventListener('click', openCustomerService);
    btnCustomerService.addEventListener('touchstart', openCustomerService, { passive: false });
}

// 💡 [최종 정리] 2. 이용약관 및 정책 (새 창 열기 + 안드로이드 앱 대응)
const btnPrivacy = document.getElementById('btn-privacy-policy');
if (btnPrivacy) {
    const openPrivacy = (e) => {
        e.preventDefault();
        const notionUrl = 'https://handsomely-carrot-b6f.notion.site/361080e7a5ed8037a778f04092248c31';

        if (window.AndroidBridge || (window.webkit && window.webkit.messageHandlers.openExternalBrowser)) {
        window.invokeNativeApp('openExternalBrowser', notionUrl);
    } else {
            window.open(notionUrl, '_blank');
        }
    };
    btnPrivacy.addEventListener('click', openPrivacy);
    btnPrivacy.addEventListener('touchstart', openPrivacy, { passive: false });
}

// 💡 [최종 정리] 3. 회원탈퇴 (확인창 후 DB 삭제)
const btnDelete = document.getElementById('btn-delete-account');
if (btnDelete) {
    const deleteAccount = async (e) => {
        e.preventDefault();

        const user = firebase.auth().currentUser;
        if (!user) {
            alert("로그인 정보가 없습니다.");
            return;
        }

        const confirmMsg = "정말로 탈퇴하시겠습니까?\n보유 중인 코인, 뱃지, 멀티플레이 기록 등 모든 데이터가 영구적으로 삭제되며 절대 복구할 수 없습니다.";
        if (!confirm(confirmMsg)) return;

        try {
            // 💡 [추가] 탈퇴 전, 내가 참여 중이던 방들을 유령 방으로 만들지 않기 위해 사전 정리 작업 진행
            if (currentUser && currentUser.joinedRooms) {
                const roomIds = Object.keys(currentUser.joinedRooms);
                for (const roomId of roomIds) {
                    try {
                        const roomRef = db.collection('rooms').doc(roomId);
                        const participantsRef = roomRef.collection('participants');

                        // 1. 해당 방의 내 참가자 정보를 hidden으로 업데이트
                        await participantsRef.doc(user.uid).update({ hidden: true });

                        // 2. 방이 폭파될 조건인지 다시 확인
                        const participantsSnapshot = await participantsRef.get();
                        let shouldExplode = true;
                        participantsSnapshot.forEach(doc => {
                            if (!doc.data().hidden) shouldExplode = false;
                        });

                        // 3. 내가 마지막 생존자(?)였다면 방을 폭파
                        if (shouldExplode) {
                            const batch = db.batch();
                            participantsSnapshot.forEach(doc => { batch.delete(doc.ref); });
                            batch.delete(roomRef);
                            await batch.commit();
                            console.log(`💣 탈퇴 유저 정리로 인해 방 [${roomId}]이 폭파되었습니다.`);
                        }
                    } catch (roomErr) {
                        console.error(`탈퇴 중 방 [${roomId}] 데이터 정리에 실패했으나 탈퇴를 계속 진행합니다:`, roomErr);
                    }
                }
            }
            await db.collection("users").doc(user.uid).delete();
            console.log("🗑️ Firestore 유저 데이터 삭제 완료");

            await user.delete();
            console.log("🗑️ Firebase 계정 영구 삭제 완료");

            alert("회원 탈퇴가 정상적으로 완료되었습니다. 이용해 주셔서 감사합니다.");
            location.reload();

        } catch (error) {
            console.error("❌ 회원탈퇴 실패:", error);
            if (error.code === 'auth/requires-recent-login') {
                alert("보안을 위해 다시 로그인한 후 탈퇴를 진행해 주세요.");
                firebase.auth().signOut().then(() => location.reload());
            } else {
                alert("탈퇴 처리 중 오류가 발생했습니다: " + error.message);
            }
        }
    };
    btnDelete.addEventListener('click', deleteAccount);
    btnDelete.addEventListener('touchstart', deleteAccount, { passive: false });
}

/* ============================================================
   [통합] 로그인 감지 및 데이터 완결성 보장 로직
   ============================================================ */
firebase.auth().onAuthStateChanged((user) => {
    // 로그인 버튼이 로딩 중이었다면 원래대로 복구
    if (window.resetLoginButtons) window.resetLoginButtons();

    if (user) {
        console.log("👤 로그인 상태 감지됨:", user.email || user.uid);
        isLoggedIn = true;

        // 🚨 핵심: 여기서 기존에 만들어두신 loadUserData 함수를 호출합니다.
        // loadUserData 내부에서 Firestore의 'coins' 등을 가져온 뒤 UI를 갱신하게 됩니다.
        loadUserData(user);

    } else {
        console.log("⚪ 로그아웃 상태 감지됨");
        isLoggedIn = false;
        currentUser = null;
        updateCoinUI();

        // 로그아웃 시 UI 초기화 (필요시)
        document.getElementById('scene-user-profile').classList.add('hidden');
        
        // 💡 [신규 추가] 로그아웃(게스트) 상태가 최종 확정되었을 때 안전하게 방 목록을 호출합니다.
        roomFetchPromise = null;
        fetchRaceRooms(false);
    }
});