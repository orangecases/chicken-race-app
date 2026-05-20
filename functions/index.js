const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const cors = require('cors')({origin: true});

if (!admin.apps.length) {
    admin.initializeApp();
}

const REGION = 'asia-northeast3'; // 서울 리전

exports.naverLogin = functions.region(REGION).https.onCall(async (data, context) => {
    let accessToken = null;
    if (typeof data === 'string') accessToken = data;
    else if (data && data.accessToken) accessToken = data.accessToken;
    else if (data && data.data && data.data.accessToken) accessToken = data.data.accessToken;

    if (!accessToken) {
        throw new functions.https.HttpsError('invalid-argument', '액세스 토큰이 없습니다.');
    }

    try {
        let response;
        try {
            response = await axios.get('https://openapi.naver.com/v1/nid/me', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
        } catch (apiErr) {
            const errorDetail = apiErr.response ? JSON.stringify(apiErr.response.data) : apiErr.message;
            throw new Error(`[1단계 실패] 네이버 API가 토큰을 거부했습니다: ${errorDetail}`);
        }

        const naverUser = response.data.response;
        if (!naverUser || !naverUser.id) {
            throw new Error('[1단계 실패] 네이버 응답에 유저 ID가 없습니다.');
        }

        const uid = `naver:${naverUser.id}`;
        const email = naverUser.email || '';
        const nickname = naverUser.nickname || naverUser.name || '네이버유저';

        try {
            try {
                await admin.auth().getUser(uid);
            } catch (authErr) {
                if (authErr.code === 'auth/user-not-found') {
                    await admin.auth().createUser({
                        uid: uid,
                        email: email,
                        displayName: nickname
                    });
                } else {
                    throw authErr;
                }
            }
        } catch (userErr) {
            throw new Error(`[3단계 실패] 파이어베이스 유저 생성 오류: ${userErr.message}`);
        }

        let customToken;
        try {
            customToken = await admin.auth().createCustomToken(uid);
        } catch (tokenErr) {
            throw new Error(`[4단계 실패] 커스텀 토큰 발급 권한 오류: ${tokenErr.message}`);
        }

        return { customToken: customToken };

    } catch (error) {
        console.error("❌ 상세 서버 에러:", error.message);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * [수정] 다수의 사용자 ID(uid)를 받아 각 사용자의 최신 닉네임을 반환합니다.
 * - onCall 방식의 CORS 오류가 계속 발생하여, 더 명시적인 onRequest 방식으로 변경합니다.
 * - cors 미들웨어를 사용하여 모든 출처의 요청을 허용하고 preflight 요청을 처리합니다.
 * - 클라이언트의 httpsCallable 호출 방식과 호환되도록 요청/응답 구조를 유지합니다.
 */
exports.getNicknames = functions.region(REGION).https.onRequest((req, res) => {
    // CORS 미들웨어를 사용하여 preflight(OPTIONS) 요청을 자동으로 처리합니다.
    cors(req, res, async () => {
        // httpsCallable은 항상 POST 요청을 보냅니다.
        if (req.method !== 'POST') {
            return res.status(405).send('Method Not Allowed');
        }

        // httpsCallable로 호출된 경우, 실제 데이터는 req.body.data 안에 있습니다.
        const uids = req.body.data.uids;

        if (!Array.isArray(uids) || uids.length === 0) {
            return res.status(400).json({ error: { message: 'UID 배열이 필요합니다.' } });
        }

        if (uids.length > 100) {
            return res.status(400).json({ error: { message: '한 번에 100명 이상의 닉네임을 요청할 수 없습니다.' } });
        }

        const db = admin.firestore();
        const userDocsPromises = uids.map(uid => db.collection('users').doc(uid).get());

        try {
            const userDocs = await Promise.all(userDocsPromises);
            const nicknameMap = {};
            userDocs.forEach(doc => {
                nicknameMap[doc.id] = (doc.exists && doc.data().nickname) ? doc.data().nickname : '알수없음';
            });
            // httpsCallable은 응답 본문이 { data: ... } 형태일 것으로 기대합니다.
            return res.status(200).json({ data: nicknameMap });
        } catch (error) {
            console.error("❌ 닉네임 일괄 조회 실패:", error);
            return res.status(500).json({ error: { message: '닉네임을 조회하는 중 서버 오류가 발생했습니다.' } });
        }
    });
});

exports.createUserDocument = functions.region(REGION).auth.user().onCreate(async (user) => {
    const { uid, email } = user;
    console.log(`새로운 사용자 생성됨: ${uid}, Email: ${email}`);

    const userRef = admin.firestore().collection('users').doc(uid);
    const initialNickname = `병아리-${uid.substring(0, 6)}`;

    const initialUserData = {
        id: uid,
        email: email || '',
        nickname: initialNickname,
        coins: 10,
        badges: { '1': 0, '2': 0, '3': 0 },
        joinedRooms: {},
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        bestScore: 0, 
        myScores: []  
    };

    try {
        await userRef.set(initialUserData);
        console.log(`✅ Firestore에 사용자 문서 생성 완료: ${uid}`);
        return null; // 성공 시 null 반환
    } catch (error) {
        console.error(`❌ Firestore 사용자 문서 생성 실패: ${uid}`, error);
        throw error; // 실패 시 에러를 다시 던져서 Cloud Functions에 실패를 알림
    }
});

// 💡 [신규 추가] 방 상태가 'finished'로 업데이트될 때마다 실행되는 서버 심판 로직
exports.distributeBadgesOnRoomFinish = functions.region(REGION).firestore
    .document("rooms/{roomId}")
    .onUpdate(async (change, context) => {
        const beforeData = change.before.data();
        const afterData = change.after.data();
        const roomId = context.params.roomId;

        // 1. 방 상태가 방금 막 'finished'로 변경된 경우에만 작동!
        if (beforeData.status !== "finished" && afterData.status === "finished") {
            console.log(`🏆 방 [${roomId}] 종료 감지. 뱃지 지급 심판 등판!`);

            const db = admin.firestore();
            const participantsRef = db.collection(`rooms/${roomId}/participants`);
            const snapshot = await participantsRef.get();

            if (snapshot.empty) {
                console.log("참가자가 없어 종료합니다.");
                return null;
            }

            let players = [];
            snapshot.forEach(doc => {
                players.push(doc.data());
            });

            // 2. 4인 이상 참여한 방인지 검증 (기획 규칙 적용)
            if (players.length < 4) {
                console.log(`인원 미달(${players.length}명)로 뱃지를 지급하지 않습니다.`);
                return null;
            }

            // 3. 디스플레이 점수(displayScore) 기준으로 내림차순 정렬 (1등부터 줄 세우기)
            players.sort((a, b) => (b.displayScore || 0) - (a.displayScore || 0));

            const batch = db.batch();
            let awardedCount = 0;

            // 4. 1등~3등까지만 뱃지 지급
            for (let i = 0; i < players.length; i++) {
                if (i >= 3) break; // 4등부터는 탈락

                const player = players[i];
                
                // 봇(isBot)이 아닌 실제 유저에게만 뱃지 지급
                if (!player.isBot && player.id) {
                    const rank = i + 1; // 1, 2, 3
                    const userRef = db.collection("users").doc(player.id);
                    
                    // Firestore의 'increment' 기능을 써서 안전하게 뱃지 카운트 +1
                    batch.update(userRef, {
                        [`badges.${rank}`]: admin.firestore.FieldValue.increment(1)
                    });
                    
                    console.log(`🥇 유저 [${player.name}]에게 ${rank}등 뱃지 지급 완료!`);
                    awardedCount++;
                }
            }

            // 5. 서버에 일괄 저장(Commit)
            if (awardedCount > 0) {
                await batch.commit();
                console.log(`✅ 총 ${awardedCount}명의 유저에게 뱃지 지급 완료.`);
            } else {
                console.log(`지급 대상(실제 유저)이 없어 뱃지를 지급하지 않았습니다.`);
            }
        }

        return null;
    });

    // 💡 [신규 추가] 매일 자정(밤 12시)에 실행되는 유령 방 청소 스케줄러
exports.cleanupOldRooms = functions.region(REGION).pubsub.schedule('every 24 hours').timeZone('Asia/Seoul').onRun(async (context) => {
    console.log("🧹 서버 청소 스케줄러 가동: 7일 지난 오래된 방을 정리합니다.");
    const db = admin.firestore();
    
    // 기준 시간: 현재로부터 7일 전 (밀리초 계산)
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(Date.now() - THIRTY_DAYS_MS);

    try {
        // 생성된 지 7일이 지난 방들을 모두 가져옵니다.
        const oldRoomsSnapshot = await db.collection('rooms')
            .where('createdAt', '<', cutoffDate)
            .get();

        if (oldRoomsSnapshot.empty) {
            console.log("✅ 정리할 오래된 방이 없습니다.");
            return null;
        }

        const batch = db.batch();
        let deletedCount = 0;

        // 찾은 오래된 방들을 하나씩 돌면서 하위 참가자 데이터와 함께 지웁니다.
        for (const roomDoc of oldRoomsSnapshot.docs) {
            // 1. 하위 컬렉션(participants) 삭제 
            // (주의: 하위 컬렉션이 많지 않다는 가정하에 batch로 처리. 500개 제한이 있으나 1방당 최대 10명이므로 안전함)
            const participantsSnap = await roomRef.collection('participants').get();
            participantsSnap.forEach(pDoc => {
                batch.delete(pDoc.ref);
            });

            // 2. 방 문서 본체 삭제
            batch.delete(roomDoc.ref);
            deletedCount++;
        }

        await batch.commit();
        console.log(`🗑️ 총 ${deletedCount}개의 오래된 유령 방이 완벽하게 철거되었습니다.`);
        
    } catch (error) {
        console.error("❌ 방 청소 스케줄러 실행 중 오류 발생:", error);
    }
    
    return null;
});