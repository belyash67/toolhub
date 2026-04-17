import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, updateDoc, doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCjb3kuj54OppaRuh2Ge1VC3AfeJUHHvlg",
  authDomain: "tooltrackerapp-9b2b0.firebaseapp.com",
  projectId: "tooltrackerapp-9b2b0",
  storageBucket: "tooltrackerapp-9b2b0.firebasestorage.app",
  messagingSenderId: "969754104867",
  appId: "1:969754104867:web:fb8676db8fe16e1f860d96"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;
let allTools = [];
let pendingToolId = null;
const ADMIN_EMAIL = "belyash670@gmail.com";
let html5QrCode = null;
let historyVisible = false;


function animateCards() {
  document.querySelectorAll('.card').forEach((card, i) => {
    setTimeout(() => card.classList.add('visible'), 100 + i * 120);
  });
}


window.login = async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) return alert("Введите email и пароль");
  try { await signInWithEmailAndPassword(auth, email, password); } 
  catch (e) { alert("Ошибка входа: " + e.message); }
};

window.register = async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) return alert("Введите email и пароль");
  try { 
    await createUserWithEmailAndPassword(auth, email, password);
    alert("Аккаунт создан! Теперь войдите.");
  } catch (e) { alert("Ошибка регистрации: " + e.message); }
};

window.logout = async () => {
  if (confirm("Выйти из аккаунта?")) {
    await signOut(auth);
  }
};

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user.email;
    document.getElementById("authBlock").classList.add("hidden");
    document.getElementById("mainContent").classList.remove("hidden");

    setupTabs();
    loadTools();
    loadHistory();
    if (currentUser !== ADMIN_EMAIL) showMyTools();

    animateCards();
  } else {
    document.getElementById("authBlock").classList.remove("hidden");
    document.getElementById("mainContent").classList.add("hidden");
    document.getElementById("tabs").classList.add("hidden");
  }
});


function setupTabs() {
  const tabsContainer = document.getElementById("tabs");
  tabsContainer.innerHTML = "";
  tabsContainer.classList.remove("hidden");

  if (currentUser === ADMIN_EMAIL) {
    const tab = document.createElement("div");
    tab.className = "tab active";
    tab.textContent = "Все инструменты";
    tabsContainer.appendChild(tab);
    showInfoTab();
    document.getElementById("adminAddPanel").style.display = "block";
  } else {
    const tab1 = document.createElement("div");
    tab1.className = "tab active";
    tab1.textContent = "Мои инструменты";
    tab1.onclick = () => switchTab('scan');
    tabsContainer.appendChild(tab1);

    const tab2 = document.createElement("div");
    tab2.className = "tab";
    tab2.textContent = "Все инструменты";
    tab2.onclick = () => switchTab('info');
    tabsContainer.appendChild(tab2);

    showScanTab();
  }
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (tab === 'scan') {
    document.querySelectorAll('.tab')[0].classList.add('active');
    showScanTab();
  } else {
    document.querySelectorAll('.tab')[1].classList.add('active');
    showInfoTab();
  }
}

function showScanTab() {document.getElementById("scanTab").classList.remove("hidden");
  document.getElementById("infoTab").classList.add("hidden");
}

function showInfoTab() {
  document.getElementById("scanTab").classList.add("hidden");
  document.getElementById("infoTab").classList.remove("hidden");
}


const profileBtn = document.getElementById("profileBtn");
const profileDropdown = document.getElementById("profileDropdown");
const logoutBtn = document.getElementById("logoutBtn");


function toggleDropdown(e) {
  e.preventDefault();
  e.stopPropagation();
  if (profileDropdown) {
    profileDropdown.classList.toggle("show");
  }
}


function closeDropdown(e) {
  if (profileBtn && profileDropdown && !profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
    profileDropdown.classList.remove("show");
  }
}


if (profileBtn) {
  profileBtn.addEventListener("click", toggleDropdown);
  profileBtn.addEventListener("touchstart", toggleDropdown, { passive: false });
}


document.addEventListener("click", closeDropdown);
document.addEventListener("touchstart", closeDropdown, { passive: false });

// Закрытие при скролле
window.addEventListener("scroll", () => {
  if (profileDropdown) profileDropdown.classList.remove("show");
});


if (logoutBtn) {
  logoutBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Выйти из аккаунта?")) {
      await signOut(auth);
      if (profileDropdown) profileDropdown.classList.remove("show");
    }
  });
  logoutBtn.addEventListener("touchstart", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Выйти из аккаунта?")) {
      await signOut(auth);
      if (profileDropdown) profileDropdown.classList.remove("show");
    }
  });
}


window.addTool = async () => {
  const name = document.getElementById("toolName").value.trim();
  if (!name) return alert("Введите название инструмента");

  try {
    await addDoc(collection(db, "tools"), { name, status: "free", holder: null });
    alert(`Инструмент "${name}" добавлен!`);
    document.getElementById("toolName").value = "";
    loadTools();
  } catch (e) { alert("Ошибка добавления"); }
};


window.startScanner = () => {
  document.getElementById("scanner-container").classList.remove("hidden");
  if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");

  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 270, height: 270 } },
    (decodedText) => {
      stopScanner();
      const toolId = decodedText.split("tool=").pop();
      if (toolId) takeToolByQR(toolId);
    }
  ).catch(() => {});
};

window.stopScanner = () => {
  if (html5QrCode) html5QrCode.stop().catch(() => {});
  document.getElementById("scanner-container").classList.add("hidden");
};


async function takeToolByQR(toolId) {
  if (!currentUser) return alert("Сначала войдите");

  try {
    const snap = await getDocs(collection(db, "tools"));
    let toolData = null, docId = null;

    snap.forEach(d => {
      if (d.id === toolId) { docId = d.id; toolData = d.data(); }
    });

    if (!toolData) return alert("Инструмент не найден");
    if (toolData.status === "busy") return alert("Инструмент уже занят!");

    await updateDoc(doc(db, "tools", docId), { status: "busy", holder: currentUser });

    await addDoc(collection(db, "history"), {
      user: currentUser,
      action: "взял",
      toolName: toolData.name,
      time: new Date().toLocaleString("ru-RU")
    });

    alert(`✅ Вы взяли: ${toolData.name}`);
    loadTools();
    if (currentUser !== ADMIN_EMAIL) showMyTools();
    loadHistory();
  } catch (e) { alert("Ошибка"); }
}

async function showMyTools() {
  const content = document.getElementById("myToolContent");
  content.innerHTML = "";

  const snap = await getDocs(collection(db, "tools"));
  let hasTools = false;

  snap.forEach(d => {
    const t = d.data();
    if (t.holder === currentUser && t.status === "busy") {
      hasTools = true;
      content.innerHTML += `
        <div style="background:#334155; padding:20px; border-radius:18px; margin-bottom:16px;">
          <h3 style="color:#10b981;">${t.name}</h3>
          <p style="color:#ef4444; font-weight:700;">Находится у вас</p>
          <button onclick="returnMyTool('${d.id}')" class="btn-danger" style="margin-top:15px;">Вернуть инструмент</button>
        </div>`;
    }
  });

  if (!hasTools) content.innerHTML = `<p style="color:#94a3b8; text-align:center;">У вас пока нет инструментов</p>`;
}

window.returnMyTool = async (id) => {
  if (!confirm("Вернуть инструмент?")) return;
  await updateDoc(doc(db, "tools", id), { status: "free", holder: null });

  await addDoc(collection(db, "history"), {
    user: currentUser,
    action: "вернул",
    toolName: "Инструмент",
    time: new Date().toLocaleString("ru-RU")
  });

  showMyTools();
  loadTools();
  loadHistory();
};


async function loadTools() {
  const snap = await getDocs(collection(db, "tools"));
  allTools = [];
  snap.forEach(d => allTools.push({ id: d.id, ...d.data() }));
  renderTools(allTools);
}

function renderTools(list) {
  const container = document.getElementById("toolsList");
  container.innerHTML = "";

  list.forEach(tool => {
    const div = document.createElement("div");
    div.className = "tool";

    let html = `
      <strong style="font-size:1.2rem;">${tool.name}</strong>
      <p class="${tool.status === "free" ? "free" : "busy"}" style="margin:10px 0 15px;">
        ${tool.status === "free" ? "● Свободен" : `● Занят у ${tool.holder || "—"}`}
      </p>
    `;

    if (currentUser === ADMIN_EMAIL) {
      html += `<button onclick="toggleQR('${tool.id}', '${tool.name}')" class="btn-warning" id="btn-${tool.id}">Развернуть QR-код</button>`;
      html += `<div id="qr-${tool.id}" class="hidden" style="margin-top:20px; text-align:center;"></div>`;
    }

    div.innerHTML = html;
    container.appendChild(div);
  });
}


window.toggleQR = (id, name) => {
  const qrDiv = document.getElementById(`qr-${id}`);
  const btn = document.getElementById(`btn-${id}`);

  if (qrDiv.classList.contains("hidden")) {
    const siteUrl = "https://tooltrackerapp-9b2b0.web.app";
    const fullUrl = `${siteUrl}?tool=${id}`;

    qrDiv.innerHTML = `
      <p style="margin-bottom:12px; font-weight:600;">${name}</p>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(fullUrl)}" 
           style="border-radius:18px;" id="qrImage-${id}">
      <div style="display:flex; gap:12px; margin-top:18px;">
        <button onclick="copyLink('${fullUrl}')" class="btn-primary" style="flex:1;">Скопировать ссылку</button>
        <button onclick="printQR('${id}', '${name}')" class="btn-warning" style="flex:1;">🖨 Распечатать</button>
      </div>
    `;
    qrDiv.classList.remove("hidden");
    if (btn) btn.textContent = "Закрыть";
  } else {
    qrDiv.classList.add("hidden");
    if (btn) btn.textContent = "Развернуть QR-код";
  }
};

window.printQR = (id, name) => {
  const img = document.getElementById(`qrImage-${id}`);
  if (!img) return;

  const win = window.open('', '', 'width=700,height=850');
  win.document.write(`
    <html><head><title>QR — ${name}</title>
    <style>
      body { font-family:Arial; text-align:center; padding:50px; background:#0f172a; color:white; }
      img { max-width:95%; margin:30px 0; border:5px solid #6366f1; border-radius:20px; }
      h2 { margin-bottom:15px; }
    </style>
    </head><body>
      <h2>${name}</h2>
      <p>Отсканируйте для взятия инструмента</p>
      ${img.outerHTML}
      <p style="margin-top:70px; opacity:0.7;">ToolHub</p>
    </body></html>
  `);
  win.document.close();
  setTimeout(() => win.print(), 700);
};

window.copyLink = (url) => {
  navigator.clipboard.writeText(url).then(() => alert("Ссылка скопирована!"));
};


window.toggleHistory = () => {
  const historyDiv = document.getElementById("history");
  const btn = document.getElementById("historyBtn");

  historyVisible = !historyVisible;

  if (historyVisible) {
    historyDiv.classList.remove("hidden");
    btn.textContent = "Скрыть историю";
  } else {
    historyDiv.classList.add("hidden");
    btn.textContent = "Развернуть историю";
  }
};

async function loadHistory() {
  const snap = await getDocs(collection(db, "history"));
  const div = document.getElementById("history");
  div.innerHTML = "";

  snap.forEach(d => {
    const h = d.data();
    div.innerHTML += `
      <div style="padding:18px; background:#334155; border-radius:18px; margin-bottom:14px;"> 
        <strong>${h.user}</strong> ${h.action} ${h.toolName || ''}
        <br><small style="color:#94a3b8;">${h.time}</small>
      </div>
    `;
  });
}


window.searchTools = () => {
  const q = document.getElementById("search").value.toLowerCase().trim();
  const filtered = q ? allTools.filter(t => t.name.toLowerCase().includes(q)) : allTools;
  renderTools(filtered);
};
