// 1. Firebase Config
const firebaseConfig = {
    apiKey: "AIza...",
    authDomain: "cyberminigame.firebaseapp.com",
    databaseURL: "https://cyberminigame-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "cyberminigame",
    storageBucket: "cyberminigame.appspot.com",
    messagingSenderId: "...",
    appId: "..."
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const GEMINI_API_KEY = "AIzaSyBMgN917Q2s8CpFX2kVQlDhfRjTC8gpsHU";

// --- KHỞI TẠO DỮ LIỆU ---
let users = JSON.parse(localStorage.getItem('natsumi_users')) || {
    "Natsumi": { pass: "jelonatsumi1234", gold: 1000000, avatar: "https://i.imgur.com/8Km9t4S.png", isVerified: true }
};
let currentUser = JSON.parse(localStorage.getItem('natsumi_current')) || null;
let roomData = { code: "", players: [], mode: "bot" };
let gameState = { lastWord: "", turn: "user", history: [] };

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

        addMessage("user", `[TỪ] ${word.toUpperCase()}`);
        gameState.lastWord = word;
        wordIn.value = "";
        document.getElementById('current-target').innerText = word.toUpperCase();

        if (roomData.mode === 'bot') {
            document.getElementById('turn-info').innerText = "Bot đang nghĩ...";
            const botWord = await getBotResponse(word);
            processBotTurn(botWord);
        }
    }
}

// --- HÀM HIỂN THỊ TIN NHẮN ---
function addMessage(sender, text) {
    const box = document.getElementById('game-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = "msg-bubble"; // Nên thêm class này vào CSS để style đẹp hơn

    // Inline style bổ sung
    msgDiv.style.margin = "10px 0";
    msgDiv.style.padding = "10px 15px";
    msgDiv.style.borderRadius = "12px";
    msgDiv.style.maxWidth = "80%";
    msgDiv.style.width = "fit-content";
    msgDiv.style.fontSize = "14px";
    msgDiv.style.wordBreak = "break-all";

    if (sender === "user") {
        msgDiv.style.background = "linear-gradient(90deg, #8a2be2, #4b0082)";
        msgDiv.style.color = "white";
        msgDiv.style.marginLeft = "auto";
    } else if (sender === "bot") {
        msgDiv.style.background = "#333";
        msgDiv.style.color = "#00ffcc";
        msgDiv.style.border = "1px solid #00ffcc";
    } else {
        msgDiv.style.background = "rgba(255,255,255,0.1)";
        msgDiv.style.color = "#aaa";
        msgDiv.style.margin = "10px auto";
    }

    msgDiv.innerText = text;
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
function createRoom() {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    roomData.code = roomCode;
    roomData.mode = document.getElementById('game-mode').value;

    document.getElementById('display-room-code').innerText = roomCode;
    showSection('lobby');
    updateLobbyUI();
}

function joinRoom() {
    const inputs = document.querySelectorAll('.otp-input');
    let inputCode = "";
    inputs.forEach(input => inputCode += input.value.trim().toUpperCase());

    if (inputCode.length < 6) {
        return showToast("Vui lòng nhập đủ 6 ký tự mã phòng!");
    }

    // Kiểm tra mã phòng (Ở bản offline này ta check với roomData hiện tại)
    if (inputCode === roomData.code) {
        showToast("Vào phòng thành công!");
        showSection('lobby');
        updateLobbyUI();
    } else {
        showToast("Mã phòng không chính xác hoặc không tồn tại!");
    }
}

function updateLobbyUI() {
    const list = document.getElementById('lobby-players');
    list.innerHTML = `
        <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:10px; display:flex; align-items:center; gap:15px; border: 1px solid rgba(255,255,255,0.1);">
            <img src="${currentUser.avatar}" style="width:50px; height:50px; border-radius:50%; object-fit:cover; border: 2px solid #8a2be2;">
            <div>
                <p style="margin:0; font-weight:bold;">${currentUser.name}</p>
                <small style="color:#00ffcc;">Chủ phòng (Sẵn sàng)</small>
            </div>
        </div>`;
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
    gameState = { lastWord: "", turn: "user", history: [] };
    document.getElementById('game-messages').innerHTML = "";
    showSection('game-play');
    addMessage("system", "Trận đấu bắt đầu! Mời bạn nhập từ đầu tiên.");
}

function saveAllData() {
    localStorage.setItem('natsumi_users', JSON.stringify(users));
    localStorage.setItem('natsumi_current', JSON.stringify(currentUser));
}

window.onload = () => { if (currentUser) loginSuccess(); };