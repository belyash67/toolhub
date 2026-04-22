import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, updateDoc, doc, setDoc, getDoc, query, where, orderBy, deleteDoc
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

const ADMIN_EMAIL = "belyash670@gmail.com";
const ADMIN_LOGIN = "ADMIN";
const ADMIN_PASSWORD = "130209";
let currentUser = null;
let currentUserUid = null;
let isAdmin = false;
let html5QrCode = null;
let allItems = [];
let allStorages = [];
let selectedMoveItemId = null;
let scanTargetItemId = null;
let selectedEditItemId = null;

const profileBtn = document.getElementById("profileBtn");
const profileDropdown = document.getElementById("profileDropdown");
const logoutBtn = document.getElementById("logoutBtn");
const TAB_SWITCH_MS = 420;

function nowIso() {
  return new Date().toISOString();
}

function statusBadge(status, holder) {
  if (status === "busy") return `Занят${holder ? ` (${holder})` : ""}`;
  return "Не занят";
}

function storageNameById(storageId) {
  const storage = allStorages.find((s) => s.id === storageId);
  return storage ? storage.name : "Не указан";
}

async function ensureStorages() {
  const snap = await getDocs(collection(db, "storages"));
  if (!snap.empty) return;
  const defaults = ["Склад 1", "Склад 2", "Склад 3"];
  for (const name of defaults) {
    await addDoc(collection(db, "storages"), { name });
  }
}

async function resolveUserRole(user) {
  const userDocRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userDocRef);
  const userEmail = (user.email || "").toLowerCase();
  const isEmailAdmin = userEmail === ADMIN_EMAIL.toLowerCase();
  if (!userSnap.exists()) {
    await setDoc(userDocRef, { email: user.email || "", isAdmin: isEmailAdmin });
    return isEmailAdmin;
  }
  const data = userSnap.data();
  if (data.isAdmin !== isEmailAdmin || data.email !== (user.email || data.email || "")) {
    await updateDoc(userDocRef, {
      isAdmin: isEmailAdmin,
      email: user.email || data.email || ""
    });
  }
  return isEmailAdmin;
}

async function loadStorages() {
  await ensureStorages();
  const snap = await getDocs(query(collection(db, "storages"), orderBy("name")));
  allStorages = [];
  snap.forEach((d) => allStorages.push({ id: d.id, ...d.data() }));
  renderStorageSelect("toolStorage");
  renderStorageSelect("moveStorageSelect");
  renderStorageSelect("bulkStorageSelect");
  renderStorageSelect("editToolStorage");
  renderStorageSelect("manageStorageSelect");
}

window.addStorage = async () => {
  if (!isAdmin) return;
  const input = document.getElementById("newStorageName");
  const name = input.value.trim();
  if (!name) return alert("Введите название склада");

  const exists = allStorages.some((s) => (s.name || "").toLowerCase() === name.toLowerCase());
  if (exists) return alert("Склад с таким названием уже существует");

  try {
    await addDoc(collection(db, "storages"), { name });
    input.value = "";
    await loadStorages();
    renderItemsByStorage();
    alert(`Склад "${name}" добавлен`);
  } catch (e) {
    alert(`Не удалось добавить склад: ${e.message}`);
  }
};

window.renameStorage = async () => {
  if (!isAdmin) return;
  const storageId = document.getElementById("manageStorageSelect").value;
  const newName = document.getElementById("renameStorageName").value.trim();
  if (!storageId) return alert("Выберите склад");
  if (!newName) return alert("Введите новое название");
  const duplicate = allStorages.some((s) => s.id !== storageId && (s.name || "").toLowerCase() === newName.toLowerCase());
  if (duplicate) return alert("Склад с таким названием уже существует");
  try {
    await updateDoc(doc(db, "storages", storageId), { name: newName });
    document.getElementById("renameStorageName").value = "";
    await loadStorages();
    renderItemsByStorage();
    alert("Склад переименован");
  } catch (e) {
    alert(`Не удалось переименовать склад: ${e.message}`);
  }
};

window.deleteStorage = async () => {
  if (!isAdmin) return;
  const storageId = document.getElementById("manageStorageSelect").value;
  if (!storageId) return alert("Выберите склад");
  const storage = allStorages.find((s) => s.id === storageId);
  if (!storage) return;

  const linkedItems = allItems.filter((i) => i.currentStorageId === storageId);
  if (linkedItems.length) {
    return alert("Нельзя удалить непустой склад. Сначала перенесите предметы.");
  }
  if (allStorages.length <= 1) {
    return alert("Нельзя удалить последний склад");
  }
  if (!confirm(`Удалить склад "${storage.name}"?`)) return;

  try {
    await deleteDoc(doc(db, "storages", storageId));
    await loadStorages();
    renderItemsByStorage();
    alert("Склад удален");
  } catch (e) {
    alert(`Не удалось удалить склад: ${e.message}`);
  }
};

function renderStorageSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = allStorages.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
}

function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.showModal();
}

window.closeModal = (modalId) => {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.close();
};

window.login = async () => {
  const loginInput = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!loginInput || !password) return alert("Введите логин/email и пароль");

  const useAdminAlias = loginInput.toUpperCase() === ADMIN_LOGIN;
  const email = useAdminAlias ? ADMIN_EMAIL : loginInput;

  if (useAdminAlias && password !== ADMIN_PASSWORD) {
    return alert("Неверный пароль администратора");
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    alert("Ошибка входа: " + e.message);
  }
};

window.register = async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || !password) return alert("Введите email и пароль");
  if (!email.includes("@")) return alert("Для регистрации укажите корректный Email");
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      email,
      isAdmin: false
    });
    alert("Аккаунт создан");
  } catch (e) {
    alert("Ошибка регистрации: " + e.message);
  }
};

async function bootstrapAfterLogin() {
  await loadStorages();
  await loadItems();
  setupTabs();
  await showMyItems();
  if (isAdmin) await loadHistory();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    currentUserUid = null;
    isAdmin = false;
    document.getElementById("authBlock").classList.remove("hidden");
    document.getElementById("mainContent").classList.add("hidden");
    return;
  }

  currentUser = user.email || "";
  currentUserUid = user.uid;
  isAdmin = await resolveUserRole(user);
  document.getElementById("authBlock").classList.add("hidden");
  document.getElementById("mainContent").classList.remove("hidden");
  await bootstrapAfterLogin();
});

function setupTabs() {
  const tabs = document.getElementById("tabs");
  tabs.classList.remove("hidden");
  tabs.classList.remove("admin-tabs");
  tabs.innerHTML = "";

  const adminPanel = document.getElementById("adminPanel");
  const historyPanel = document.getElementById("adminHistoryPanel");

  if (isAdmin) {
    tabs.classList.add("admin-tabs");
    adminPanel.classList.remove("hidden");
    historyPanel.classList.remove("hidden");
    tabs.innerHTML = `
      <button class="tab active" id="adminInfoTabBtn" onclick="switchTab('info')">Администрирование</button>
      <button class="tab" id="adminScanTabBtn" onclick="switchTab('scan')">Сканирование</button>
      <button class="tab tab-print" id="adminBulkPrintBtn" onclick="openBulkPrintModal()">Множественная печать</button>
    `;
    showInfoTab();
  } else {
    adminPanel.classList.add("hidden");
    historyPanel.classList.add("hidden");
    tabs.innerHTML = `
      <button class="tab active" id="scanTabBtn" onclick="switchTab('scan')">Мои инструменты</button>
      <button class="tab" id="infoTabBtn" onclick="switchTab('info')">Все инструменты</button>
    `;
    showScanTab();
  }
}

function performTabSwitch(tab) {
  const scanBtn = document.getElementById("scanTabBtn") || document.getElementById("adminScanTabBtn");
  const infoBtn = document.getElementById("infoTabBtn") || document.getElementById("adminInfoTabBtn");
  if (scanBtn && infoBtn) {
    scanBtn.classList.toggle("active", tab === "scan");
    infoBtn.classList.toggle("active", tab === "info");
  }
  if (tab === "scan") showScanTab();
  else showInfoTab();
}

window.switchTab = (tab) => {
  const from = tab === "scan" ? document.getElementById("infoTab") : document.getElementById("scanTab");
  const to = tab === "scan" ? document.getElementById("scanTab") : document.getElementById("infoTab");
  if (!from || !to) {
    performTabSwitch(tab);
    return;
  }

  from.classList.add("tab-panel", "is-fading");
  setTimeout(() => {
    performTabSwitch(tab);
    to.classList.add("tab-panel", "is-fading");
    requestAnimationFrame(() => {
      to.classList.remove("is-fading");
    });
    setTimeout(() => {
      from.classList.remove("tab-panel", "is-fading");
      to.classList.remove("tab-panel");
    }, TAB_SWITCH_MS + 220);
  }, TAB_SWITCH_MS);
};

window.showScanTab = () => {
  document.getElementById("scanTab").classList.remove("hidden");
  document.getElementById("infoTab").classList.add("hidden");
};

window.showInfoTab = () => {
  document.getElementById("scanTab").classList.add("hidden");
  document.getElementById("infoTab").classList.remove("hidden");
};

window.toggleAdminBlock = (trigger) => {
  const card = trigger.closest(".admin-accordion");
  if (!card) return;
  card.classList.toggle("is-open");
};

function parseQrPayload(decodedText) {
  if (!decodedText) return null;
  if (/^https?:\/\//i.test(decodedText)) {
    try {
      const url = new URL(decodedText);
      return url.searchParams.get("item") || url.searchParams.get("tool");
    } catch {
      return null;
    }
  }
  return decodedText;
}

window.startScanner = () => {
  document.getElementById("scanner-container").classList.remove("hidden");
  if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      const itemId = parseQrPayload(decodedText);
      stopScanner();
      if (!itemId) return alert("QR-код не распознан");
      openScanResultModal(itemId);
    }
  ).catch(() => alert("Не удалось запустить сканер"));
};

window.stopScanner = () => {
  if (html5QrCode) html5QrCode.stop().catch(() => {});
  document.getElementById("scanner-container").classList.add("hidden");
};

async function getItemById(itemId) {
  const itemRef = doc(db, "items", itemId);
  const snap = await getDoc(itemRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

async function openScanResultModal(itemId) {
  const item = await getItemById(itemId);
  if (!item) return alert("Предмет не найден");
  scanTargetItemId = item.id;
  renderItemModal(item, true);
  showModal("toolModal");
}

function renderItemModal(item, fromScan) {
  const modalContent = document.getElementById("toolModalContent");
  const storageTitle = storageNameById(item.currentStorageId);
  const busy = item.status === "busy";
  const takeAction = fromScan && !busy
    ? `<button class="btn-success btn-inline" onclick="takeItemAfterScan()">Забрать</button>`
    : fromScan
      ? `<p style="color:#fda4af;">Этот инструмент занят другим пользователем</p>`
      : "";

  modalContent.innerHTML = `
    <p><strong>Имя:</strong> ${item.name}</p>
    <p><strong>Статус:</strong> ${busy ? "занят" : "не занят"}</p>
    <p><strong>Склад:</strong> ${storageTitle}</p>
    <p><strong>Описание:</strong> ${item.description || "—"}</p>
    ${takeAction}
  `;
}

window.takeItemAfterScan = async () => {
  if (!scanTargetItemId) return;
  const item = await getItemById(scanTargetItemId);
  if (!item) return alert("Предмет не найден");
  if (item.status === "busy") return alert("Этот инструмент уже занят");

  await updateDoc(doc(db, "items", scanTargetItemId), {
    status: "busy",
    holder: currentUser
  });

  await addDoc(collection(db, "history"), {
    itemId: scanTargetItemId,
    action: "take",
    itemName: item.name,
    userId: currentUserUid,
    userEmail: currentUser,
    fromStorageId: item.currentStorageId || null,
    toStorageId: item.currentStorageId || null,
    timestamp: nowIso()
  });

  closeModal("toolModal");
  await loadItems();
  await showMyItems();
  alert(`Вы забрали: ${item.name}`);
};

window.addTool = async () => {
  if (!isAdmin) return;
  const nameRaw = document.getElementById("toolName").value.trim();
  const description = document.getElementById("toolDescription").value.trim();
  const storageId = document.getElementById("toolStorage").value;

  if (!nameRaw || !description || !storageId) {
    return alert("Заполните название, описание и склад");
  }

  const qItems = query(collection(db, "items"), where("name", ">=", nameRaw), where("name", "<=", `${nameRaw}\uf8ff`));
  const snap = await getDocs(qItems);

  let maxSuffix = 1;
  snap.forEach((d) => {
    const n = (d.data().name || "").trim();
    if (n === nameRaw) {
      maxSuffix = Math.max(maxSuffix, 2);
      return;
    }
    const re = new RegExp(`^${nameRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s(\\d+)$`);
    const match = n.match(re);
    if (match) maxSuffix = Math.max(maxSuffix, Number(match[1]) + 1);
  });

  const finalName = maxSuffix === 1 ? nameRaw : `${nameRaw} ${maxSuffix}`;

  await addDoc(collection(db, "items"), {
    name: finalName,
    description,
    status: "free",
    holder: null,
    currentStorageId: storageId,
    originalStorageId: storageId,
    qrCodeData: "",
    createdAt: nowIso()
  });

  document.getElementById("toolName").value = "";
  document.getElementById("toolDescription").value = "";
  await loadItems();
  alert(`Предмет "${finalName}" добавлен`);
};

window.searchTools = () => {
  renderItemsByStorage();
};

async function loadItems() {
  const snap = await getDocs(collection(db, "items"));
  allItems = [];
  snap.forEach((d) => allItems.push({ id: d.id, ...d.data() }));
  renderItemsByStorage();
}

function groupedItems(filteredItems) {
  const map = new Map();
  allStorages.forEach((s) => map.set(s.id, []));
  filteredItems.forEach((item) => {
    if (!map.has(item.currentStorageId)) map.set(item.currentStorageId, []);
    map.get(item.currentStorageId).push(item);
  });
  return map;
}

function qrValueForItem(item) {
  return `${location.origin}${location.pathname}?item=${item.id}`;
}

function renderItemRow(item, index = 0) {
  const busy = item.status === "busy";
  const moveDisabled = busy ? "disabled" : "";
  const moveTitle = busy ? "Нельзя перенести занятый инструмент" : "Перенести";
  const delay = 120 + index * 120;
  return `
    <div class="tool-card ${busy ? "busy" : "free"}" style="--stagger-delay:${delay}ms;" onclick="openItemInfo('${item.id}')">
      <div class="tool-row">
        <strong>${item.name}</strong>
        <span>${busy ? "🔒" : "✅"}</span>
      </div>
      <div class="tool-meta">${statusBadge(item.status, item.holder)}</div>
      <div class="tool-meta">Склад: ${storageNameById(item.currentStorageId)}</div>
      <div class="tool-meta">${item.description || "Без описания"}</div>
      ${isAdmin ? `
        <div style="display:flex; gap:8px; margin-top:8px;" onclick="event.stopPropagation()">
          <button class="btn-warning btn-inline" onclick="printSingleItem('${item.id}')">QR</button>
          <button class="btn-primary btn-inline" ${moveDisabled} title="${moveTitle}" onclick="openMoveModal('${item.id}')">Перенести</button>
          <button class="btn-muted btn-inline" onclick="openEditModal('${item.id}')">Редактировать</button>
          <button class="btn-danger btn-inline" onclick="deleteItem('${item.id}')">Удалить</button>
        </div>
      ` : ""}
    </div>
  `;
}

function renderItemsByStorage() {
  const queryText = document.getElementById("search").value.trim().toLowerCase();
  const filtered = queryText
    ? allItems.filter((i) => i.name.toLowerCase().includes(queryText) || (i.description || "").toLowerCase().includes(queryText))
    : allItems;

  const root = document.getElementById("toolsByStorage");
  const grouped = groupedItems(filtered);
  root.innerHTML = "";

  allStorages.forEach((storage) => {
    const items = grouped.get(storage.id) || [];
    const block = document.createElement("div");
    block.className = "storage-accordion";
    block.innerHTML = `
      <div class="storage-header" onclick="toggleStorage('${storage.id}')">
        <span class="storage-name">${storage.name}</span>
        <span class="storage-count-wrap"><span>${items.length}</span><span class="storage-chevron">▼</span></span>
      </div>
      <div id="storage-items-${storage.id}" class="storage-tools">
        ${items.length ? items.map((item, index) => renderItemRow(item, index)).join("") : `<div class="tool-meta">Нет предметов</div>`}
      </div>
    `;
    root.appendChild(block);
  });
}

window.toggleStorage = (id) => {
  const el = document.getElementById(`storage-items-${id}`);
  if (!el) return;
  const accordion = el.closest(".storage-accordion");
  if (accordion) accordion.classList.toggle("is-open");
  el.classList.toggle("open");
};

window.openItemInfo = async (itemId) => {
  const item = await getItemById(itemId);
  if (!item) return alert("Предмет не найден");
  renderItemModal(item, false);
  showModal("toolModal");
};

window.printSingleItem = async (itemId) => {
  const item = allItems.find((i) => i.id === itemId);
  if (!item) return;
  await printItems([item]);
};

function getSelectedQrSizeMm() {
  const input = document.getElementById("qrSizeSelect");
  const size = Number(input ? input.value : 35);
  if (![30, 35, 40].includes(size)) return 35;
  return size;
}

function renderPrintGrid(items, qrSizeMm = 35) {
  const minHeightMm = Math.max(qrSizeMm + 5, 36);
  const printArea = document.getElementById("printArea");
  printArea.classList.remove("hidden");
  const html = items.map((item) => {
    const qr = encodeURIComponent(qrValueForItem(item));
    return `
      <div class="print-item">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${qr}" alt="${item.name}">
        <div class="print-label">${item.name}</div>
      </div>
    `;
  }).join("");

  printArea.innerHTML = `<div class="print-grid">${html}</div>`;
  const printCss = document.createElement("style");
  printCss.id = "print-style-runtime";
  printCss.textContent = `
    @page { size: A4 portrait; margin: 10mm; }
    @media print {
      body * { visibility: hidden !important; }
      #printArea, #printArea * { visibility: visible !important; }
      #printArea {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        background: #fff;
        padding: 0;
      }
      #printArea .print-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8mm 6mm;
      }
      #printArea .print-item {
        border: 0.2mm dashed #999;
        min-height: ${minHeightMm}mm;
        padding: 2mm;
        align-items: center;
      }
      #printArea .print-item img {
        width: ${qrSizeMm}mm;
        height: ${qrSizeMm}mm;
      }
      #printArea .print-label {
        font-size: 7pt;
        line-height: 1.1;
        color: #111;
      }
    }
  `;
  const old = document.getElementById("print-style-runtime");
  if (old) old.remove();
  document.head.appendChild(printCss);
}

function waitForImage(img) {
  return new Promise((resolve) => {
    if (img.complete && img.naturalWidth > 0) {
      resolve(true);
      return;
    }
    const done = () => resolve(true);
    const fail = () => resolve(false);
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", fail, { once: true });
    setTimeout(() => resolve(false), 3500);
  });
}

async function waitForPrintImages() {
  const printArea = document.getElementById("printArea");
  if (!printArea) return;
  const images = Array.from(printArea.querySelectorAll("img"));
  if (!images.length) return;
  await Promise.all(images.map(waitForImage));
}

async function printItems(items) {
  renderPrintGrid(items, getSelectedQrSizeMm());
  await waitForPrintImages();
  window.print();
}

window.openBulkPrintModal = () => {
  renderBulkPrintItems();
  showModal("bulkPrintModal");
};

window.renderBulkPrintItems = () => {
  const storageId = document.getElementById("bulkStorageSelect").value;
  const container = document.getElementById("bulkPrintItems");
  const items = allItems.filter((i) => i.currentStorageId === storageId);
  container.innerHTML = items.length
    ? items.map((i) => `
      <label class="bulk-item">
        <input type="checkbox" class="bulk-print-check" value="${i.id}" checked>
        <span class="bulk-name">${i.name}</span>
      </label>
    `).join("")
    : "<p>На выбранном складе нет предметов</p>";
};

window.printSelectedQRCodes = async () => {
  const checked = Array.from(document.querySelectorAll(".bulk-print-check:checked")).map((el) => el.value);
  if (!checked.length) return alert("Выберите хотя бы один предмет");
  const items = allItems.filter((i) => checked.includes(i.id));
  closeModal("bulkPrintModal");
  await printItems(items);
};

window.addEventListener("afterprint", () => {
  const printArea = document.getElementById("printArea");
  if (printArea) {
    printArea.classList.add("hidden");
    printArea.innerHTML = "";
  }
});

window.openMoveModal = (itemId) => {
  const item = allItems.find((i) => i.id === itemId);
  if (!item) return;
  if (item.status === "busy") return alert("Нельзя перенести занятый инструмент. Сначала дождитесь возврата.");
  selectedMoveItemId = itemId;
  document.getElementById("moveInfo").textContent = `Предмет: ${item.name}. Текущий склад: ${storageNameById(item.currentStorageId)}`;
  document.getElementById("moveStorageSelect").value = item.currentStorageId;
  showModal("moveModal");
};

window.confirmMove = async () => {
  if (!selectedMoveItemId) return;
  const item = allItems.find((i) => i.id === selectedMoveItemId);
  if (!item) return;
  const targetStorageId = document.getElementById("moveStorageSelect").value;
  if (!targetStorageId || targetStorageId === item.currentStorageId) return alert("Выберите другой склад");

  await updateDoc(doc(db, "items", item.id), { currentStorageId: targetStorageId });
  await addDoc(collection(db, "history"), {
    itemId: item.id,
    action: "move",
    itemName: item.name,
    userId: currentUserUid,
    userEmail: currentUser,
    fromStorageId: item.currentStorageId,
    toStorageId: targetStorageId,
    timestamp: nowIso()
  });

  closeModal("moveModal");
  await loadItems();
  await loadHistory();
};

window.openEditModal = (itemId) => {
  const item = allItems.find((i) => i.id === itemId);
  if (!item) return;
  selectedEditItemId = itemId;
  document.getElementById("editToolName").value = item.name || "";
  document.getElementById("editToolDescription").value = item.description || "";
  document.getElementById("editToolStorage").value = item.currentStorageId || "";
  showModal("editItemModal");
};

window.saveItemEdit = async () => {
  if (!selectedEditItemId) return;
  const item = allItems.find((i) => i.id === selectedEditItemId);
  if (!item) return;

  const name = document.getElementById("editToolName").value.trim();
  const description = document.getElementById("editToolDescription").value.trim();
  const storageId = document.getElementById("editToolStorage").value;
  if (!name || !description || !storageId) return alert("Заполните все поля");

  if (item.status === "busy" && storageId !== item.currentStorageId) {
    return alert("Нельзя переносить занятый инструмент через редактирование");
  }

  await updateDoc(doc(db, "items", item.id), {
    name,
    description,
    currentStorageId: storageId
  });

  if (storageId !== item.currentStorageId) {
    await addDoc(collection(db, "history"), {
      itemId: item.id,
      action: "move",
      itemName: name,
      userId: currentUserUid,
      userEmail: currentUser,
      fromStorageId: item.currentStorageId,
      toStorageId: storageId,
      timestamp: nowIso()
    });
  }

  closeModal("editItemModal");
  await loadItems();
  await loadHistory();
};

window.deleteItem = async (itemId) => {
  const item = allItems.find((i) => i.id === itemId);
  if (!item) return;
  if (item.status === "busy") return alert("Нельзя удалить занятый инструмент");
  if (!confirm(`Удалить предмет "${item.name}"?`)) return;

  await deleteDoc(doc(db, "items", item.id));
  await addDoc(collection(db, "history"), {
    itemId: item.id,
    action: "delete",
    itemName: item.name,
    userId: currentUserUid,
    userEmail: currentUser,
    fromStorageId: item.currentStorageId || null,
    toStorageId: null,
    timestamp: nowIso()
  });
  await loadItems();
  await loadHistory();
};

async function showMyItems() {
  const root = document.getElementById("myToolContent");
  const mine = allItems.filter((i) => i.status === "busy" && i.holder === currentUser);
  root.innerHTML = "";
  if (!mine.length) {
    root.innerHTML = `<p class="tool-meta">У вас пока нет занятых инструментов</p>`;
    return;
  }

  root.innerHTML = mine.map((item) => `
    <div class="tool-card busy">
      <div class="tool-row"><strong>${item.name}</strong><span>🔒</span></div>
      <div class="tool-meta">${item.description || "Без описания"}</div>
      <button class="btn-danger btn-inline" onclick="returnMyItem('${item.id}')">Вернуть</button>
    </div>
  `).join("");
}

window.returnMyItem = async (itemId) => {
  const item = allItems.find((i) => i.id === itemId);
  if (!item) return;
  await updateDoc(doc(db, "items", item.id), { status: "free", holder: null });
  await addDoc(collection(db, "history"), {
    itemId: item.id,
    action: "return",
    itemName: item.name,
    userId: currentUserUid,
    userEmail: currentUser,
    fromStorageId: item.currentStorageId || null,
    toStorageId: item.currentStorageId || null,
    timestamp: nowIso()
  });
  await loadItems();
  await showMyItems();
};

window.loadHistory = async () => {
  if (!isAdmin) return;
  const filter = document.getElementById("historyFilter").value;
  const snap = await getDocs(query(collection(db, "history"), orderBy("timestamp", "desc")));
  const root = document.getElementById("history");
  root.innerHTML = "";

  const rows = [];
  snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
  const filtered = filter === "all" ? rows : rows.filter((r) => r.action === filter);

  root.innerHTML = filtered.length
    ? filtered.map((h) => `
      <div class="history-item">
        <div><strong>${h.userEmail || "Пользователь"}</strong> — ${h.itemName || "Предмет"}</div>
        <div class="tool-meta">${historyText(h)}</div>
        <div class="tool-meta">${new Date(h.timestamp).toLocaleString("ru-RU")}</div>
      </div>
    `).join("")
    : `<p class="tool-meta">История пуста</p>`;
};

function historyText(entry) {
  if (entry.action === "take") return "Взял инструмент";
  if (entry.action === "return") return "Вернул инструмент";
  if (entry.action === "move") {
    const from = storageNameById(entry.fromStorageId);
    const to = storageNameById(entry.toStorageId);
    return `Перенесён со склада "${from}" в склад "${to}"`;
  }
  if (entry.action === "delete") return "Удалил предмет";
  return entry.action || "Событие";
}

function toggleDropdown(e) {
  e.preventDefault();
  e.stopPropagation();
  profileDropdown.classList.toggle("show");
}

function closeDropdown(e) {
  if (!profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
    profileDropdown.classList.remove("show");
  }
}

profileBtn.addEventListener("click", toggleDropdown);
document.addEventListener("click", closeDropdown);
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  profileDropdown.classList.remove("show");
});
