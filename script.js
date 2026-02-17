let currentRoom = null;
let currentRoomRef = null;
// 1. Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyDKBP6jaGk8g5I8-9FcRi3KQCjkDRGeGzk",
    authDomain: "cyberminigame.firebaseapp.com",
    databaseURL: "https://cyberminigame-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "cyberminigame",
    storageBucket: "cyberminigame.firebasestorage.app",
    messagingSenderId: "554941351234",
    appId: "1:554941351234:web:42247ece048eb2f800f4db"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    firebase.auth().signInAnonymously()
        .then(() => {
            console.log("Đã login anonymous");
        })
        .catch((error) => {
            console.error("Lỗi đăng nhập:", error);
        });

}
const database = firebase.database();
console.log("Đã login anonymous");
showToast("🟢 Đã kết nối Firebase!");


const GEMINI_API_KEY = "AIzaSyBMgN917Q2s8CpFX2kVQlDhfRjTC8gpsHU";

// --- KHỞI TẠO DỮ LIỆU ---
let users = JSON.parse(localStorage.getItem('natsumi_users')) || {
    "Natsumi": { pass: "jelonatsumi1234", gold: 1000000, avatar: "https://i.imgur.com/8Km9t4S.png", isVerified: true }
};
let currentUser = JSON.parse(localStorage.getItem('natsumi_current')) || null;
let roomData = { code: "", players: [], mode: "bot" };
let gameState = { lastWord: "", turn: "user", history: [] };
let turnTimer = null;
let turnTimeLeft = 60;

// --- HỆ THỐNG XỬ LÝ NHẬP LIỆU ---
function handleGameInput(e, type) {
    if (e.key === 'Enter') {
        sendGameAction(type);
    }
}

// --- HÀM GỬI HÀNH ĐỘNG (CHAT & NỐI TỪ) ---
async function sendGameAction(type) {
    const chatIn = document.getElementById('chat-input');
    const wordIn = document.getElementById('word-input');

    if (type === 'chat') {
        const msg = chatIn.value.trim();
        if (!msg) return;
        addMessage("user", `[CHAT] ${msg}`);
        chatIn.value = "";
    }

    else if (type === 'word') {
        const word = wordIn.value.trim().toLowerCase();
        if (!word) return;

        // --- FIX: CHẶN TỪ CÓ 3 TIẾNG TRỞ LÊN ---
        const wordCount = word.split(/\s+/).length;
        if (wordCount > 2) {
            return showToast("Chỉ được nhập tối đa 2 từ (từ ghép)!");
        }
        if (wordCount < 1) return;

        // Logic kiểm tra nối chữ cái đầu
        if (gameState.lastWord) {
            const lastPart = gameState.lastWord.split(' ').pop();
            const firstPart = word.split(' ')[0];
            if (lastPart !== firstPart) {
                return showToast(`Phải bắt đầu bằng chữ "${lastPart.toUpperCase()}"!`);
            }
        }
        if (roomData.mode === 'bot') {
            document.getElementById('turn-info').innerText = "Bot đang nghĩ...";
            const botWord = await getBotResponse(word);
            processBotTurn(botWord);
        } else if (roomData.mode === 'player') {

            database.ref("rooms/" + roomData.code).once("value")
                .then(snapshot => {

                    const data = snapshot.val();
                    if (data.turn !== currentUser.name) {
                        return showToast("Chưa tới lượt bạn!");
                    }

                    database.ref("rooms/" + roomData.code).update({
                        lastWord: word
                    });

                    gameState.lastWord = word;
                    document.getElementById('current-target').innerText = word.toUpperCase();

                    addMessage(currentUser.name, `[TỪ] ${word.toUpperCase()}`);

                    nextTurn();
                });
        }
    }
}

// --- HÀM HIỂN THỊ TIN NHẮN ---
function addMessage(sender, text) {

    const colors = [
        "#ff0000", "#00ff00", "#00ffff",
        "#ff00ff", "#ffff00", "#ff8800"
    ];

    const colorIndex =
        sender.split("").reduce((a, b) => a + b.charCodeAt(0), 0) % colors.length;

    const color = colors[colorIndex];

    const box = document.getElementById('game-messages');

    const msgDiv = document.createElement('div');
    msgDiv.style.margin = "8px 0";

    msgDiv.innerHTML =
        `<b style="color:${color}">${sender}</b>: ${text}`;

    box.appendChild(msgDiv);
    box.scrollTop = box.scrollHeight;
}

// --- LOGIC BOT AI ---
async function getBotResponse(userWord) {
    try {
        const prompt = `Trò chơi nối từ tiếng Việt. Người chơi vừa nhập: "${userWord}". Hãy tìm 1 từ ghép gồm 2 tiếng bắt đầu bằng chữ "${userWord.split(' ').pop()}". Chỉ trả về duy nhất từ đó, không thêm gì khác. Nếu không tìm được từ nào hợp lệ, hãy trả về đúng chữ: BOT_LOSE`;
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await resp.json();
        return data.candidates[0].content.parts[0].text.trim().toLowerCase();
    } catch (e) {
        return "bot_lose";
    }
}

function processBotTurn(word) {
    if (word.includes("bot_lose") || word === "bot_lose") {
        addMessage("system", "🎉 BOT ĐẦU HÀNG! BẠN THẮNG 5000 GOLD!");
        currentUser.gold += 5000;
        gameState.lastWord = "";
        document.getElementById('current-target').innerText = "MỜI RA ĐỀ MỚI...";
        document.getElementById('turn-info').innerText = "Bạn thắng!";
        saveAllData();
        renderUI();
    } else {
        gameState.lastWord = word;
        addMessage("bot", `[BOT] ${word.toUpperCase()}`);
        document.getElementById('current-target').innerText = word.toUpperCase();
        document.getElementById('turn-info').innerText = "Lượt của bạn";
    }
}

// --- HỆ THỐNG ĐĂNG NHẬP ---
function handleAuth(type) {
    const u = document.getElementById('user-input').value.trim();
    const p = document.getElementById('pass-input').value.trim();
    if (!u || !p) return showToast("Vui lòng nhập đủ thông tin!");

    if (type === 'login') {
        if (users[u] && users[u].pass === p) {
            currentUser = { name: u, ...users[u] };
            loginSuccess();
        } else showToast("Sai thông tin đăng nhập!");
    } else {
        if (users[u]) return showToast("Tài khoản đã tồn tại!");
        users[u] = { pass: p, gold: 1000, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${u}`, isVerified: false };
        saveAllData();
        showToast("Đăng ký thành công! Hãy đăng nhập.");
    }
}

function loginSuccess() {
    saveAllData();
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-interface').classList.remove('hidden');
    renderUI();
    showSection('home');

    listenRoomList(); // 👈 THÊM DÒNG NÀY
}

function renderUI() {
    if (!currentUser) return;
    document.getElementById('gold-val').innerText = currentUser.gold.toLocaleString();
    document.getElementById('user-display').innerText = currentUser.name;
    document.getElementById('greet-name').innerText = currentUser.name;
    document.getElementById('side-avatar').src = currentUser.avatar;

    if (currentUser.name === "Natsumi") {
        document.getElementById('admin-shield').classList.remove('hidden');
    }
}

// --- QUẢN LÝ PHÒNG (FIX LỖI VÀO PHÒNG) ---

function joinRoom() {
    const inputs = document.querySelectorAll(".otp-input");
    let code = "";

    inputs.forEach(i => code += i.value.toUpperCase());

    if (code.length !== 6) {
        showToast("Nhập đủ 6 ký tự mã phòng!");
        return;
    }

    const roomRef = firebase.database().ref("rooms/" + code);

    roomRef.once("value").then(snap => {

        if (!snap.exists()) {
            showToast("Phòng không tồn tại!");
            return;
        }

        const room = snap.val();

        if (!room.players) room.players = {};

        if (Object.keys(room.players).length >= room.maxPlayers) {
            showToast("Phòng đã đầy!");
            return;
        }

        roomRef.child("players/" + currentUser.name).set({
            name: currentUser.name,
            avatar: currentUser.avatar || "",
            gold: currentUser.gold || 0
        });

        roomRef.child("players/" + currentUser.name)
            .onDisconnect()
            .remove();

        currentRoom = code;
        currentRoomRef = roomRef;
        roomData.code = code;
        roomData.mode = room.mode;

        listenLobby();
        showSection("lobby");

        document.getElementById("display-room-code").innerText = code;
    });

}

function updateLobbyUI(players) {

    const list = document.getElementById('lobby-players');
    if (!list) return;

    list.innerHTML = "";

    for (let uid in players) {
        const player = players[uid];

        list.innerHTML += `
            <div style="background:rgba(255,255,255,0.05);
                        padding:15px;
                        border-radius:10px;
                        display:flex;
                        align-items:center;
                        gap:15px;
                        margin-bottom:10px;">

                <img src="${player.avatar}"
                     style="width:50px;
                            height:50px;
                            border-radius:50%;
                            object-fit:cover;">

                <div>
                    <div style="font-weight:bold;">${player.name}</div>
                    <div style="opacity:0.7;">Gold: ${player.gold}</div>
                </div>

            </div>
        `;
    }
}


// --- PROFILE & THAY ẢNH ĐẠI DIỆN ---
function openProfile() {
    document.getElementById('profile-modal').classList.remove('hidden');
    document.getElementById('preview-img').src = currentUser.avatar;
    document.getElementById('new-name').value = currentUser.name;
}

function saveProfile() {
    const newName = document.getElementById('new-name').value.trim();
    const linkInput = document.getElementById('new-avatar-link').value.trim();
    const fileInput = document.getElementById('new-avatar-file').files[0];

    if (!newName) return showToast("Tên không được để trống!");

    // Đổi tên trong DB tạm
    if (newName !== currentUser.name) {
        users[newName] = { ...users[currentUser.name] };
        delete users[currentUser.name];
        currentUser.name = newName;
    }

    if (fileInput) {
        const reader = new FileReader();
        reader.onload = function (e) {
            currentUser.avatar = e.target.result;
            finishSaving();
        };
        reader.readAsDataURL(fileInput);
    } else {
        if (linkInput) currentUser.avatar = linkInput;
        finishSaving();
    }
}

function finishSaving() {
    users[currentUser.name].avatar = currentUser.avatar;
    saveAllData();
    renderUI();
    updateLobbyUI(); // Cập nhật luôn ảnh trong sảnh chờ nếu đang ở đó
    closeProfile();
    showToast("Đã cập nhật hồ sơ!");
}

function closeProfile() { document.getElementById('profile-modal').classList.add('hidden'); }

// --- TIỆN ÍCH ---
function showSection(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    const target = document.getElementById('sec-' + id);
    if (target) target.classList.remove('hidden');
}

function showToast(msg) {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerText = msg;
    t.style.background = "rgba(0,0,0,0.8)";
    t.style.color = "white";
    t.style.padding = "10px 20px";
    t.style.marginTop = "10px";
    t.style.borderRadius = "5px";
    t.style.borderLeft = "4px solid #8a2be2";
    container.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function triggerCountdown() {
    const cdScreen = document.getElementById('countdown-screen');
    const cdNum = document.getElementById('cd-number');
    cdScreen.classList.remove('hidden');
    let count = 3;
    cdNum.innerText = count;

    const interval = setInterval(() => {
        count--;
        cdNum.innerText = count;
        if (count <= 0) {
            clearInterval(interval);
            cdScreen.classList.add('hidden');
            startGame();
        }
    }, 1000);
}
function startGame() {
    if (!currentRoomRef) return;

    currentRoomRef.once("value").then(snap => {
        const room = snap.val();
        if (!room) return;

        if (room.host !== currentUser.name) {
            return showToast("Chỉ chủ phòng mới được bắt đầu!");
        }

        currentRoomRef.update({
            started: true
        });
    });
}

function saveAllData() {
    localStorage.setItem('natsumi_users', JSON.stringify(users));
    localStorage.setItem('natsumi_current', JSON.stringify(currentUser));
}

function listenGameRealtime() {

    database.ref("rooms/" + roomData.code).on("value", snapshot => {
        const data = snapshot.val();
        if (!data) return;

        gameState.lastWord = data.lastWord || "";

        document.getElementById("current-target").innerText =
            data.lastWord || "MỜI RA TỪ";

        document.getElementById("turn-info").innerText =
            "Lượt của: " + data.turn;

        if (data.turn === currentUser.name) {
            startTurnTimer();
        } else {
            stopTurnTimer();
        }
    });
}
function startTurnTimer() {

    turnTimeLeft = 60;

    stopTurnTimer();

    turnTimer = setInterval(() => {

        turnTimeLeft--;

        document.getElementById("turn-info").innerText =
            "Lượt của bạn - Còn " + turnTimeLeft + "s";

        if (turnTimeLeft <= 0) {
            clearInterval(turnTimer);
            skipTurn();
        }

    }, 1000);
}

function stopTurnTimer() {
    if (turnTimer) clearInterval(turnTimer);
}
function skipTurn() {

    database.ref("rooms/" + roomData.code)
        .once("value").then(roomSnap => {

            const room = roomSnap.val();
            const currentTurn = room.turn;

            database.ref("rooms/" + roomData.code + "/players")
                .once("value").then(snapshot => {

                    const players = Object.keys(snapshot.val());
                    const currentIndex = players.indexOf(currentTurn);

                    let nextIndex = (currentIndex + 1) % players.length;
                    let nextPlayer = players[nextIndex];

                    database.ref("rooms/" + roomData.code).update({
                        turn: nextPlayer
                    });

                });
        });
}

function nextTurn() {

    database.ref("rooms/" + roomData.code + "/players")
        .once("value").then(snapshot => {

            const players = Object.keys(snapshot.val());

            database.ref("rooms/" + roomData.code)
                .once("value").then(snap => {

                    const data = snap.val();
                    const currentTurn = data.turn;

                    const currentIndex = players.indexOf(currentTurn);
                    let nextIndex = (currentIndex + 1) % players.length;
                    let nextPlayer = players[nextIndex];

                    database.ref("rooms/" + roomData.code).update({
                        turn: nextPlayer
                    });

                });

        });
}

function listenRoomList() {

    database.ref("rooms").on("value", snapshot => {

        const rooms = snapshot.val();
        const box = document.getElementById("room-list");

        if (!rooms) {
            box.innerHTML = "<p style='opacity:0.6;'>Không có phòng nào.</p>";
            return;
        }

        box.innerHTML = "";

        for (let code in rooms) {

            const playerCount = rooms[code].players
                ? Object.keys(rooms[code].players).length
                : 0;

            box.innerHTML += `
                <div onclick="quickJoinRoom('${code}')"
                     style="
                        background:rgba(255,255,255,0.05);
                        padding:12px;
                        border-radius:10px;
                        cursor:pointer;
                        border:1px solid rgba(255,255,255,0.1);
                        transition:0.2s;">
                    <b style="color:#a855f7;">${code}</b>
                    <span style="float:right;opacity:0.7;">
                        👥 ${playerCount}
                    </span>
                </div>
            `;
        }

    });
}

function quickJoinRoom(code) {

    database.ref("rooms/" + code).once("value")
        .then(snapshot => {

            if (!snapshot.exists()) {
                return showToast("Phòng không tồn tại!");
            }

            database.ref("rooms/" + code + "/players/" + currentUser.name)
                .set({
                    avatar: currentUser.avatar,
                    gold: currentUser.gold
                });

            roomData.code = code;
            showToast("Vào phòng thành công!");
            document.getElementById('display-room-code').innerText = code;
            showSection('lobby');
            listenLobby();
        });
}

function joinRoomByCode(roomCode) {
    const playerName = document.getElementById("user-display").innerText;

    database.ref("rooms/" + roomCode + "/players/" + playerName).set({
        score: 0
    });

    alert("Đã vào phòng " + roomCode);
}
window.onload = function () {
    listenRoomList();
};
function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";

    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return code;
}
function showNotify(text) {
    const box = document.getElementById("notifyBox");
    if (!box) return;

    box.innerText = text;
    box.style.display = "block";

    setTimeout(() => {
        box.style.display = "none";
    }, 2000);
}
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createRoom() {
    const code = generateRoomCode();
    const playerName = currentUser.name;
    const playerCount = document.getElementById("player-count").value;
    const mode = document.getElementById("game-mode").value;

    const roomData = {
        host: playerName,
        mode: mode,
        maxPlayers: parseInt(playerCount),
        started: false,
        players: {
            [playerName]: {
                name: playerName,
                avatar: currentUser?.avatar || "",
                gold: currentUser?.gold || 0
            }
        },
        createdAt: Date.now()
    };

    firebase.database().ref("rooms/" + code).set(roomData);

    currentRoom = code;
    currentRoomRef = firebase.database().ref("rooms/" + code);

    listenLobby();
    showSection("lobby");

    document.getElementById("display-room-code").innerText = code;
}
function listenLobby() {

    // realtime danh sách player
    currentRoomRef.child("players").on("value", snap => {

        const players = snap.val();
        const list = document.getElementById("lobby-players");


        if (!list) return;

        list.innerHTML = "";

        if (!players) return;

        Object.values(players).forEach(p => {

            list.innerHTML += `
                <div class="p-card">
                    <img src="${p.avatar || 'https://i.imgur.com/6VBx3io.png'}">
                    <div>${p.name}</div>
                </div>
            `;
        });
    });

    // realtime trạng thái phòng
    currentRoomRef.on("value", snap => {

        const room = snap.val();
        if (!room) return;

        const startBtn = document.getElementById("start-btn");

        if (room.host === currentUser.name) {
            startBtn.style.display = "block";
        } else {
            startBtn.style.display = "none";
        }

        if (room.started) {
            showSection("game-play");
            listenGameRealtime();
        }
    });
}
