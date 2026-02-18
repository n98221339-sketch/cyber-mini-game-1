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
}

// FIX: Toast nằm trong then() thay vì chạy ngay lúc load
firebase.auth().signInAnonymously()
    .then(() => {
        console.log("Đã login anonymous");
        showToast("🟢 Đã kết nối Firebase!");
    })
    .catch((error) => {
        console.error("Lỗi đăng nhập:", error);
        showToast("🔴 Lỗi kết nối Firebase!");
    });

const database = firebase.database();

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

// FIX: handleGameInput không còn rỗng - Enter để gửi
function handleGameInput(e, type) {
    if (e.key === "Enter") {
        if (type === "chat") sendChat();
        else if (type === "word") sendWord();
    }
}

// FIX: Chỉ khai báo validateWord 1 lần duy nhất
function validateWord(word) {
    if (!word) return { ok: false, msg: "Không được để trống" };
    if (/\d/.test(word)) return { ok: false, msg: "Không được nhập số" };
    if (!/^[a-zA-ZÀ-ỹ\s]+$/.test(word)) return { ok: false, msg: "Không ký tự đặc biệt" };

    const parts = word.trim().split(/\s+/);
    if (parts.length !== 2) return { ok: false, msg: "Chỉ được nhập đúng 2 tiếng" };

    const w1 = parts[0].toLowerCase();
    const w2 = parts[1].toLowerCase();

    // Chặn 2 tiếng giống hệt nhau (vd: aaaa aaaa, bbb bbb)
    if (w1 === w2) return { ok: false, msg: "Hai tiếng không được giống nhau!" };

    // Chặn từ lặp ký tự (vd: aaaa, bbbb, cccc - cùng 1 ký tự lặp)
    if (/^(.)+$/.test(w1) || /^(.)+$/.test(w2))
        return { ok: false, msg: "Từ không hợp lệ (lặp ký tự)!" };

    // Chặn từ không có nguyên âm tiếng Việt (không phải từ thật)
    const vowelRegex = /[aăâeêiouôơưyáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;
    if (!vowelRegex.test(w1) || !vowelRegex.test(w2))
        return { ok: false, msg: "Từ phải có nguyên âm tiếng Việt!" };

    // Chặn từ quá ngắn (1-2 ký tự mỗi tiếng - không phải từ thật)
    if (w1.length < 2 || w2.length < 2)
        return { ok: false, msg: "Mỗi tiếng phải có ít nhất 2 ký tự!" };

    return { ok: true };
}

// --- HÀM HIỂN THỊ TIN NHẮN ---
function addMessage(sender, text, type = "chat") {
    const colors = [
        "#ff0000", "#00ff00", "#00ffff",
        "#ff00ff", "#ffff00", "#ff8800",
        "#8a2be2", "#ff1493", "#00bfff",
        "#39ff14", "#ff4500", "#7fff00",
        "#1e90ff", "#ff69b4", "#ffd700", "#00fa9a"
    ];

    const colorIndex = sender.split("").reduce((a, b) => a + b.charCodeAt(0), 0) % colors.length;
    const color = colors[colorIndex];
    const box = document.getElementById('game-messages');
    if (!box) return;

    const msgDiv = document.createElement('div');
    msgDiv.style.margin = "8px 0";

    if (type === "word") {
        msgDiv.innerHTML = `<b style="color:${color}">${sender}</b>: (<b>${text}</b>)`;
    } else {
        msgDiv.innerHTML = `<b style="color:${color}">${sender}</b>: ${text}`;
    }

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
        addMessage("Bot", word.toUpperCase(), "word");
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

// --- LOBBY UI ---
function updateLobbyUI(players) {
    const list = document.getElementById('lobby-players');
    if (!list || !players) return;

    list.innerHTML = "";

    for (let uid in players) {
        const player = players[uid];
        list.innerHTML += `
            <div style="background:rgba(255,255,255,0.05);
                        padding:15px;border-radius:10px;
                        display:flex;align-items:center;
                        gap:15px;margin-bottom:10px;">
                <img src="${player.avatar || 'https://i.imgur.com/6VBx3io.png'}"
                     style="width:50px;height:50px;border-radius:50%;object-fit:cover;">
                <div>
                    <div style="font-weight:bold;">${player.name}</div>
                    <div style="opacity:0.7;">Gold: ${player.gold}</div>
                </div>
            </div>
        `;
    }
}

// --- PROFILE ---
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
    // FIX: Đã xóa updateLobbyUI() gọi thiếu tham số
    closeProfile();
    showToast("Đã cập nhật hồ sơ!");
}

function closeProfile() {
    document.getElementById('profile-modal').classList.add('hidden');
}

// --- TIỆN ÍCH ---
function showSection(id) {
    document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
    document.getElementById("sec-" + id).classList.remove("hidden");
}

function showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
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

        // Random người đầu tiên trong danh sách players
        const players = room.players ? Object.keys(room.players) : [currentUser.name];
        const randomFirst = players[Math.floor(Math.random() * players.length)];

        currentRoomRef.update({
            started: true,
            turn: randomFirst,
            currentWord: ""
        });

        showToast("🎲 Người đầu tiên: " + randomFirst);
    });
}

function saveAllData() {
    localStorage.setItem('natsumi_users', JSON.stringify(users));
    localStorage.setItem('natsumi_current', JSON.stringify(currentUser));
}

function startTurnTimer() {
    turnTimeLeft = 60;
    stopTurnTimer();
    turnTimer = setInterval(() => {
        turnTimeLeft--;
        const el = document.getElementById("turn-info");
        if (el) el.innerText = "🟢 Lượt của bạn - Còn " + turnTimeLeft + "s";
        if (turnTimeLeft <= 0) {
            clearInterval(turnTimer);
            skipTurn();
        }
    }, 1000);
}

function stopTurnTimer() {
    if (turnTimer) {
        clearInterval(turnTimer);
        turnTimer = null;
    }
}

function skipTurn() {
    if (!roomData.code) return;

    database.ref("rooms/" + roomData.code).once("value").then(roomSnap => {
        const room = roomSnap.val();
        if (!room) return;

        const currentTurn = room.turn;
        const players = room.players ? Object.keys(room.players) : [];
        if (players.length === 0) return;

        // Ghi nhận người này đã bỏ lượt
        const skipped = room.skipped || {};
        skipped[currentTurn] = true;

        // Kiểm tra tất cả mọi người đã bỏ lượt chưa
        const allSkipped = players.every(p => skipped[p]);

        if (allSkipped) {
            // Tất cả bỏ lượt → người viết từ cuối thắng
            const winner = room.lastWordBy || "";
            if (winner) {
                database.ref("rooms/" + roomData.code + "/messages").push({
                    sender: "system",
                    text: `🏆 ${winner} THẮNG! +1000 Gold vì tất cả bỏ lượt!`,
                    type: "system",
                    timestamp: Date.now()
                });

                // Cộng 1000 gold cho winner
                if (winner === currentUser.name) {
                    currentUser.gold += 1000;
                    users[currentUser.name].gold = currentUser.gold;
                    saveAllData();
                    renderUI();
                    showToast("🏆 Bạn thắng! +1000 Gold!");
                }

                database.ref("rooms/" + roomData.code).update({
                    started: false,
                    turn: "",
                    skipped: {}
                });
                window._gameStarted = false;
            }
            return;
        }

        // Chuyển lượt sang người tiếp
        const currentIndex = players.indexOf(currentTurn);
        const nextPlayer = players[(currentIndex + 1) % players.length];

        database.ref("rooms/" + roomData.code).update({
            turn: nextPlayer,
            skipped: skipped
        });

        // Thông báo bỏ lượt
        database.ref("rooms/" + roomData.code + "/messages").push({
            sender: "system",
            text: `⏰ ${currentTurn} hết giờ! Chuyển lượt sang ${nextPlayer}`,
            type: "system",
            timestamp: Date.now()
        });
    });
}

// FIX: Null check cho room-list không tồn tại trong HTML
function listenRoomList() {
    database.ref("rooms").on("value", snapshot => {
        const rooms = snapshot.val();
        const box = document.getElementById("room-list");
        if (!box) return; // không có element thì bỏ qua

        if (!rooms) {
            box.innerHTML = "<p style='opacity:0.6;'>Không có phòng nào.</p>";
            return;
        }

        box.innerHTML = "";

        for (let code in rooms) {
            const playerCount = rooms[code].players
                ? Object.keys(rooms[code].players).length : 0;

            box.innerHTML += `
                <div onclick="quickJoinRoom('${code}')"
                     style="background:rgba(255,255,255,0.05);padding:12px;
                            border-radius:10px;cursor:pointer;
                            border:1px solid rgba(255,255,255,0.1);transition:0.2s;">
                    <b style="color:#a855f7;">${code}</b>
                    <span style="float:right;opacity:0.7;">👥 ${playerCount}</span>
                </div>
            `;
        }
    });
}

function quickJoinRoom(code) {
    database.ref("rooms/" + code).once("value").then(snapshot => {
        if (!snapshot.exists()) return showToast("Phòng không tồn tại!");

        database.ref("rooms/" + code + "/players/" + currentUser.name).set({
            name: currentUser.name,
            avatar: currentUser.avatar,
            gold: currentUser.gold
        });

        currentRoom = code;
        currentRoomRef = database.ref("rooms/" + code);
        roomData.code = code;
        roomData.mode = snapshot.val().mode;

        showToast("Vào phòng thành công!");
        document.getElementById('display-room-code').innerText = code;
        showSection('lobby');
        listenLobby();
    });
}

function generateRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

function createRoom() {
    const code = generateRoomCode();
    const playerName = currentUser.name;
    const playerCount = document.getElementById("player-count").value;
    const mode = document.getElementById("game-mode").value;

    const newRoomData = {
        host: playerName,
        mode: mode,
        maxPlayers: parseInt(playerCount),
        started: false,
        turn: playerName,
        players: {
            [playerName]: {
                name: playerName,
                avatar: currentUser?.avatar || "",
                gold: currentUser?.gold || 0
            }
        },
        createdAt: Date.now()
    };

    firebase.database().ref("rooms/" + code).set(newRoomData);
    roomData.mode = mode;
    roomData.code = code;
    currentRoom = code;
    currentRoomRef = firebase.database().ref("rooms/" + code);

    window._gameStarted = false;
    listenLobby();
    showSection("lobby");
    document.getElementById("display-room-code").innerText = code;
}

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
        if (!snap.exists()) { showToast("Phòng không tồn tại!"); return; }

        const room = snap.val();
        if (!room.players) room.players = {};

        if (Object.keys(room.players).length >= room.maxPlayers) {
            showToast("Phòng đã đầy!"); return;
        }

        roomRef.child("players/" + currentUser.name).set({
            name: currentUser.name,
            avatar: currentUser.avatar || "",
            gold: currentUser.gold || 0
        });

        roomRef.child("players/" + currentUser.name).onDisconnect().remove();

        currentRoom = code;
        currentRoomRef = roomRef;
        roomData.code = code;
        roomData.mode = room.mode;

        listenLobby();
        showSection("lobby");
        document.getElementById("display-room-code").innerText = code;
    });
}

function listenLobby() {
    if (!currentRoomRef) return;

    // Lắng nghe danh sách người chơi
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

    // Lắng nghe trạng thái phòng
    currentRoomRef.on("value", snap => {
        const room = snap.val();
        if (!room) return;

        const startBtn = document.getElementById("start-btn");
        if (startBtn) {
            startBtn.style.display = room.host === currentUser.name ? "block" : "none";
        }

        if (room.started) {
            // Chỉ chuyển sang game 1 lần, tránh gọi listenGameRealtime nhiều lần
            if (!window._gameStarted) {
                window._gameStarted = true;
                showSection("game-play");
                listenGameRealtime();
            }
        }
    });
}

function resetRoom() {
    stopTurnTimer();

    if (roomData.code) {
        database.ref("rooms/" + roomData.code + "/messages").off();
        database.ref("rooms/" + roomData.code).off();
    }

    if (currentRoomRef) {
        currentRoomRef.off();
    }

    currentRoom = null;
    currentRoomRef = null;
    roomData = { code: "", players: [], mode: "bot" };

    const chatBox = document.getElementById("game-messages");
    if (chatBox) chatBox.innerHTML = "";
}

function goHome() {
    resetRoom();
    showSection("home");
}

function checkChain(newWord, lastWord) {
    if (!lastWord) return true;
    const lastParts = lastWord.split(" ");
    const newParts = newWord.split(" ");
    return lastParts[lastParts.length - 1].toLowerCase() === newParts[0].toLowerCase();
}

// ===== CHAT =====
function sendChat() {
    const input = document.getElementById("chat-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";

    if (roomData.code) {
        // Có phòng: push Firebase, để child_added tự hiện (KHÔNG gọi addMessage local)
        database.ref("rooms/" + roomData.code + "/messages").push({
            sender: currentUser.name,
            text: text,
            type: "chat",
            time: Date.now()
        });
    } else {
        // Không có phòng: hiện local
        addMessage(currentUser.name, text, "chat");
    }
}

// ===== GỬI TỪ NỐI =====
function sendWord() {
    const input = document.getElementById("word-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const newWord = text.toLowerCase();

    // Validate từ trước khi gửi
    const check = validateWord(newWord);
    if (!check.ok) {
        showWebNotice("⚠ " + check.msg);
        return;
    }

    if (roomData.code) {
        // Kiểm tra lượt trước khi gửi
        database.ref("rooms/" + roomData.code).once("value").then(roomSnap => {
            const room = roomSnap.val();
            if (!room) return;

            // Chặn nếu không phải lượt của mình
            if (room.turn !== currentUser.name) {
                showWebNotice("⏳ Chưa đến lượt của bạn!");
                return;
            }

            // Kiểm tra nối từ: tiếng đầu của từ mới = tiếng cuối từ trước
            const prevWord = room.currentWord || "";
            if (prevWord) {
                const prevParts = prevWord.trim().split(/\s+/);
                const newParts  = newWord.trim().split(/\s+/);
                const lastSyl   = prevParts[prevParts.length - 1].toLowerCase();
                const firstSyl  = newParts[0].toLowerCase();
                if (lastSyl !== firstSyl) {
                    showWebNotice(`❌ Phải bắt đầu bằng "${lastSyl.toUpperCase()}"!`);
                    return;
                }
            }

            input.value = "";

            const players = room.players ? Object.keys(room.players) : [];
            const currentIndex = players.indexOf(currentUser.name);
            const nextPlayer = players[(currentIndex + 1) % players.length];

            // Reset skipped vì có người nối được từ
            database.ref("rooms/" + roomData.code).update({
                currentWord: newWord,
                turn: nextPlayer,
                lastWordBy: currentUser.name,
                skipped: {}
            });

            database.ref("rooms/" + roomData.code + "/messages").push({
                sender: currentUser.name,
                text: newWord,
                type: "word",
                timestamp: Date.now()
            });
        });
    } else {
        // Chế độ bot
        input.value = "";
        addMessage(currentUser.name, newWord.toUpperCase(), "word");
        const wordDisplay = document.getElementById("current-word");
        if (wordDisplay) wordDisplay.innerText = newWord.toUpperCase();

        const turnInfo = document.getElementById("turn-info");
        if (turnInfo) turnInfo.innerText = "🤖 Bot đang suy nghĩ...";
        stopTurnTimer();

        getBotResponse(newWord).then(botWord => processBotTurn(botWord));
    }
}

// ===== LISTENER GAME REALTIME - FIX: Dùng Firebase v8 =====
function listenGameRealtime() {
    if (!roomData.code) return;

    const msgRef = database.ref("rooms/" + roomData.code + "/messages");
    const roomRef = database.ref("rooms/" + roomData.code);

    const chatBox = document.getElementById("game-messages");
    if (chatBox) chatBox.innerHTML = "";

    msgRef.off();
    roomRef.off();

    // Lắng nghe tin nhắn - load tất cả lịch sử + realtime mới
    msgRef.on("child_added", snap => {
        const msg = snap.val();
        if (!msg) return;

        const box = document.getElementById("game-messages");
        if (!box) return;

        const div = document.createElement("div");

        if (msg.type === "chat") {
            div.className = "msg " + (msg.sender === currentUser.name ? "user" : "bot");
            div.innerHTML = `<b>${msg.sender}:</b> ${msg.text}`;
        } else {
            div.className = "msg system";
            div.innerHTML = `🎮 <b>${msg.sender}</b> nối: <b style="color:#a855f7">${msg.text.toUpperCase()}</b>`;
        }

        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
    });

    // Theo dõi từ hiện tại và lượt chơi
    roomRef.on("value", snap => {
        const data = snap.val();
        if (!data) return;

        const wordDisplay = document.getElementById("current-word");
        if (wordDisplay) wordDisplay.innerText = data.currentWord ? data.currentWord.toUpperCase() : "---";

        const turnInfo = document.getElementById("turn-info");
        const wordInput = document.getElementById("word-input");
        const wordBtn = document.getElementById("word-send-btn");

        if (data.turn) {
            const isMyTurn = data.turn === currentUser.name;

            // Tính tiếng cần bắt đầu
            const hint = data.currentWord
                ? data.currentWord.trim().split(/\s+/).pop().toUpperCase()
                : "";

            if (turnInfo) {
                if (isMyTurn) {
                    turnInfo.innerText = hint
                        ? `🟢 Lượt bạn! Bắt đầu bằng: "${hint}"`
                        : "🟢 Lượt của bạn! (Từ đầu tiên)";
                    turnInfo.style.color = "#22c55e";
                } else {
                    turnInfo.innerText = `⏳ Lượt của ${data.turn}`;
                    turnInfo.style.color = "#f59e0b";
                }
            }

            // Enable/disable ô nhập từ theo lượt
            if (wordInput) {
                wordInput.disabled = !isMyTurn;
                wordInput.placeholder = isMyTurn
                    ? (hint ? `Bắt đầu bằng "${hint}"...` : "Nhập từ đầu tiên...")
                    : `Chờ ${data.turn} nhập...`;
                wordInput.style.opacity = isMyTurn ? "1" : "0.4";
            }
            if (wordBtn) {
                wordBtn.disabled = !isMyTurn;
                wordBtn.style.opacity = isMyTurn ? "1" : "0.4";
                wordBtn.style.cursor = isMyTurn ? "pointer" : "not-allowed";
            }

            // Reset + start timer mỗi khi turn thay đổi
            if (isMyTurn) {
                stopTurnTimer();
                startTurnTimer();
                if (wordInput) wordInput.focus();
            } else {
                stopTurnTimer();
            }
        }

        // Cập nhật panel online players
        if (data.players) updateOnlinePanel(data.players, data.turn);
    });
}

function showWebNotice(text) {
    let box = document.getElementById("web-notice");
    if (!box) {
        box = document.createElement("div");
        box.id = "web-notice";
        box.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#ff4444;color:#fff;padding:10px 20px;border-radius:8px;z-index:9999;";
        document.body.appendChild(box);
    }
    box.innerText = text;
    box.style.display = "block";
    setTimeout(() => box.style.display = "none", 2000);
}

// ===== OTP INPUT - Auto jump, Backspace lùi, Ctrl+V dán, Arrow keys =====
document.addEventListener("DOMContentLoaded", () => {
    const otpInputs = document.querySelectorAll(".otp-input");

    otpInputs.forEach((input, index) => {

        // Chỉ cho nhập 1 ký tự chữ/số, tự nhảy sang ô tiếp theo
        input.addEventListener("input", () => {
            // Lọc bỏ ký tự không hợp lệ, chỉ giữ chữ và số
            input.value = input.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-1);

            if (input.value.length === 1 && index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
        });

        // Backspace: xóa ô hiện tại rồi lùi về ô trước
        input.addEventListener("keydown", (e) => {
            if (e.key === "Backspace") {
                if (input.value) {
                    input.value = "";
                } else if (index > 0) {
                    otpInputs[index - 1].focus();
                    otpInputs[index - 1].value = "";
                }
                e.preventDefault();
            }

            // Mũi tên trái/phải để di chuyển giữa các ô
            if (e.key === "ArrowLeft" && index > 0) {
                otpInputs[index - 1].focus();
                e.preventDefault();
            }
            if (e.key === "ArrowRight" && index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
                e.preventDefault();
            }

            // Enter để vào phòng luôn
            if (e.key === "Enter") {
                joinRoom();
            }
        });

        // Ctrl+V: dán mã vào tất cả 6 ô cùng lúc
        input.addEventListener("paste", (e) => {
            e.preventDefault();
            const pasted = (e.clipboardData || window.clipboardData)
                .getData("text")
                .replace(/[^a-zA-Z0-9]/g, "")
                .toUpperCase()
                .slice(0, 6);

            // Điền từng ký tự vào từng ô
            pasted.split("").forEach((char, i) => {
                if (otpInputs[i]) {
                    otpInputs[i].value = char;
                }
            });

            // Focus vào ô tiếp theo sau ký tự cuối dán vào
            const nextIndex = Math.min(pasted.length, otpInputs.length - 1);
            otpInputs[nextIndex].focus();

            showToast("✅ Đã dán mã: " + pasted);
        });

        // Click vào ô thì select hết để gõ đè luôn
        input.addEventListener("click", () => {
            input.select();
        });
    });

    // Tự đăng nhập nếu đã có session
    if (currentUser) {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('app-interface').classList.remove('hidden');
        renderUI();
        showSection('home');
    }
});

function devMode() {
    showToast("🚧 Tính năng đang phát triển!");
}

function buff(type) {
    if (type === 'gold') {
        currentUser.gold += 1000000;
        users[currentUser.name].gold = currentUser.gold;
        saveAllData();
        renderUI();
        showToast("💰 Đã buff 1,000,000 Gold!");
    }
}

function clearData() {
    if (confirm("Reset toàn bộ database local?")) {
        localStorage.clear();
        location.reload();
    }
}

// Mở modal xác nhận đăng xuất
function logout() {
    document.getElementById('logout-modal').classList.remove('hidden');
}

function closeLogoutModal() {
    document.getElementById('logout-modal').classList.add('hidden');
}

// Thực hiện đăng xuất sau khi xác nhận
function confirmLogout() {
    closeLogoutModal();
    resetRoom();
    currentUser = null;
    localStorage.removeItem('natsumi_current');

    document.getElementById('app-interface').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('user-input').value = "";
    document.getElementById('pass-input').value = "";

    showToast("👋 Đã đăng xuất!");
}

// ===== ONLINE PLAYERS PANEL =====
function updateOnlinePanel(players, currentTurn) {
    // Lưu cache để filterPanel dùng lại
    _allPlayers = players;
    _currentTurnForPanel = currentTurn;

    // Lấy query search hiện tại
    const searchInput = document.getElementById('panel-search');
    const q = searchInput ? searchInput.value : '';
    filterPanel(q);
}

// ===== SETUP PAGE FUNCTIONS =====
function selectMode(mode, btn) {
    document.getElementById('game-mode').value = mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function changeCount(delta) {
    const input = document.getElementById('player-count');
    let val = parseInt(input.value) + delta;
    if (val < 2) val = 2;
    if (val > 200) val = 200;
    input.value = val;
}

// ===== FILTER PANEL SEARCH =====
let _allPlayers = {};
let _currentTurnForPanel = '';

function filterPanel(query) {
    const panel = document.getElementById('online-panel');
    if (!panel || !_allPlayers) return;

    const q = query.toLowerCase().trim();
    panel.innerHTML = '';

    for (let key in _allPlayers) {
        if (q && !key.toLowerCase().includes(q)) continue;

        const p = _allPlayers[key];
        const isActive = key === _currentTurnForPanel;
        const isMe = key === currentUser.name;

        panel.innerHTML += `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;
                        padding:8px 10px;border-radius:12px;
                        background:${isActive ? 'rgba(168,85,247,0.18)' : 'rgba(255,255,255,0.04)'};
                        border:1px solid ${isActive ? 'rgba(168,85,247,0.6)' : 'rgba(255,255,255,0.07)'};
                        transition:all 0.3s;">
                <div style="position:relative;flex-shrink:0;">
                    <img src="${p.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + p.name}"
                         style="width:38px;height:38px;border-radius:50%;object-fit:cover;
                                border:2px solid ${isActive ? '#a855f7' : '#444'};">
                    <div style="width:10px;height:10px;background:#22c55e;border-radius:50%;
                                border:2px solid #09090b;position:absolute;bottom:1px;right:1px;
                                box-shadow:0 0 5px #22c55e;"></div>
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:0.82rem;font-weight:bold;
                                color:${isMe ? '#a855f7' : '#fff'};
                                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${p.name}${isMe ? ' <span style="font-size:0.65rem;opacity:0.7;">(bạn)</span>' : ''}
                    </div>
                    <div style="font-size:0.7rem;margin-top:2px;
                                color:${isActive ? '#a855f7' : '#22c55e'};">
                        ${isActive ? '🎮 Đang nhập...' : '● Online'}
                    </div>
                </div>
            </div>
        `;
    }
}
