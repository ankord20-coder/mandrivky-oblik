const STORAGE_KEY = "travelClientsApp.v2";
const SETTINGS_KEY = "travelClientsApp.settings.v1";

const state = {
  trips: [],
  activeTripId: null,
  deferredInstall: null,
  settings: {
    remoteUrl: "",
    remotePassword: "",
  },
  syncing: false,
};

const statusLabels = {
  reserved: "Заброньовано",
  advance: "Є аванс",
  paid: "Оплачено",
  cancelled: "Скасовано",
};

const els = {
  tripForm: document.querySelector("#tripForm"),
  tripDirection: document.querySelector("#tripDirection"),
  tripDate: document.querySelector("#tripDate"),
  tripNote: document.querySelector("#tripNote"),
  tripList: document.querySelector("#tripList"),
  newTripBtn: document.querySelector("#newTripBtn"),
  cancelTripBtn: document.querySelector("#cancelTripBtn"),
  activeTripTitle: document.querySelector("#activeTripTitle"),
  activeTripMeta: document.querySelector("#activeTripMeta"),
  newClientBtn: document.querySelector("#newClientBtn"),
  clientForm: document.querySelector("#clientForm"),
  clientId: document.querySelector("#clientId"),
  clientName: document.querySelector("#clientName"),
  clientPhone: document.querySelector("#clientPhone"),
  clientPrice: document.querySelector("#clientPrice"),
  clientPaid: document.querySelector("#clientPaid"),
  clientPaidDate: document.querySelector("#clientPaidDate"),
  clientBoarding: document.querySelector("#clientBoarding"),
  clientStatus: document.querySelector("#clientStatus"),
  clientNote: document.querySelector("#clientNote"),
  cancelClientBtn: document.querySelector("#cancelClientBtn"),
  clientList: document.querySelector("#clientList"),
  emptyState: document.querySelector("#emptyState"),
  summary: document.querySelector("#summary"),
  peopleCount: document.querySelector("#peopleCount"),
  totalAmount: document.querySelector("#totalAmount"),
  paidAmount: document.querySelector("#paidAmount"),
  debtAmount: document.querySelector("#debtAmount"),
  financeBox: document.querySelector("#financeBox"),
  advanceAmount: document.querySelector("#advanceAmount"),
  advanceCount: document.querySelector("#advanceCount"),
  fullPaidAmount: document.querySelector("#fullPaidAmount"),
  fullPaidCount: document.querySelector("#fullPaidCount"),
  receivedAmount: document.querySelector("#receivedAmount"),
  remainingAmount: document.querySelector("#remainingAmount"),
  remainingCount: document.querySelector("#remainingCount"),
  allPeopleCount: document.querySelector("#allPeopleCount"),
  allPaidAmount: document.querySelector("#allPaidAmount"),
  allDebtAmount: document.querySelector("#allDebtAmount"),
  searchInput: document.querySelector("#searchInput"),
  csvBtn: document.querySelector("#csvBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importInput: document.querySelector("#importInput"),
  installBtn: document.querySelector("#installBtn"),
  syncStatus: document.querySelector("#syncStatus"),
  syncNowBtn: document.querySelector("#syncNowBtn"),
  settingsBtn: document.querySelector("#settingsBtn"),
  settingsDialog: document.querySelector("#settingsDialog"),
  settingsForm: document.querySelector("#settingsForm"),
  remoteUrl: document.querySelector("#remoteUrl"),
  remotePassword: document.querySelector("#remotePassword"),
  testSyncBtn: document.querySelector("#testSyncBtn"),
  closeSettingsBtn: document.querySelector("#closeSettingsBtn"),
};

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function money(value) {
  return `${Number(value || 0).toLocaleString("uk-UA")} грн`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("uk-UA");
}

function getActiveTrip() {
  return state.trips.find((trip) => trip.id === state.activeTripId) || null;
}

function getFinanceSummary(clients = []) {
  const activeClients = clients.filter((client) => client.status !== "cancelled");
  const summary = {
    people: activeClients.length,
    total: 0,
    paid: 0,
    debt: 0,
    advanceAmount: 0,
    advanceCount: 0,
    fullPaidAmount: 0,
    fullPaidCount: 0,
    remainingAmount: 0,
    remainingCount: 0,
  };

  activeClients.forEach((client) => {
    const price = Number(client.price || 0);
    const paid = Number(client.paid || 0);
    const debt = Math.max(price - paid, 0);

    summary.total += price;
    summary.paid += paid;
    summary.debt += debt;

    if (paid > 0 && debt > 0) {
      summary.advanceAmount += paid;
      summary.advanceCount += 1;
    }

    if (price > 0 && paid >= price) {
      summary.fullPaidAmount += paid;
      summary.fullPaidCount += 1;
    }

    if (debt > 0) {
      summary.remainingAmount += debt;
      summary.remainingCount += 1;
    }
  });

  return summary;
}

function hasRemote() {
  return Boolean(state.settings.remoteUrl && state.settings.remotePassword);
}

function setSyncStatus(message, isError = false) {
  els.syncStatus.textContent = message;
  els.syncStatus.classList.toggle("error", isError);
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  renderSyncStatus();
}

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    state.settings.remoteUrl = parsed.remoteUrl || "";
    state.settings.remotePassword = parsed.remotePassword || "";
  } catch {
    state.settings.remoteUrl = "";
    state.settings.remotePassword = "";
  }
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    trips: state.trips,
    activeTripId: state.activeTripId,
    updatedAt: new Date().toISOString(),
  }));
}

async function save({ sync = true } = {}) {
  saveLocal();
  if (sync) await pushRemote();
}

function loadLocal() {
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("travelClientsApp.v1");
  if (!raw) {
    state.trips = [{
      id: uid(),
      direction: "Мандрівка з Долини",
      date: new Date().toISOString().slice(0, 10),
      note: "Приклад поїздки. Можна перейменувати або видалити клієнтів.",
      clients: [],
    }];
    state.activeTripId = state.trips[0].id;
    saveLocal();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.trips = Array.isArray(parsed.trips) ? parsed.trips : [];
    state.activeTripId = parsed.activeTripId || state.trips[0]?.id || null;
  } catch {
    state.trips = [];
    state.activeTripId = null;
  }
}

function normalizeRemoteUrl(url) {
  return url.trim();
}

function remoteLoad() {
  return new Promise((resolve, reject) => {
    const callbackName = `travelClientsCallback_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const script = document.createElement("script");
    const url = new URL(state.settings.remoteUrl);
    url.searchParams.set("action", "load");
    url.searchParams.set("password", state.settings.remotePassword);
    url.searchParams.set("callback", callbackName);

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Не вдалося отримати спільні дані"));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (result) => {
      cleanup();
      if (!result.ok) {
        reject(new Error(result.error || "Не вдалося синхронізувати"));
        return;
      }
      resolve(result);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Не вдалося підключитися до спільних даних"));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function remoteSave(payload) {
  return new Promise((resolve) => {
    const iframeName = `travelClientsFrame_${Date.now()}`;
    const iframe = document.createElement("iframe");
    const form = document.createElement("form");
    const fields = {
      password: state.settings.remotePassword,
      action: "save",
      payload: JSON.stringify(payload),
    };

    iframe.name = iframeName;
    iframe.hidden = true;
    form.hidden = true;
    form.method = "POST";
    form.action = state.settings.remoteUrl;
    form.target = iframeName;

    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });

    const done = () => {
      setTimeout(() => {
        iframe.remove();
        form.remove();
        resolve();
      }, 300);
    };

    iframe.addEventListener("load", done, { once: true });
    document.body.append(iframe, form);
    form.submit();
    setTimeout(done, 5000);
  });
}

async function pullRemote({ showResult = false } = {}) {
  if (!hasRemote() || state.syncing) return;
  state.syncing = true;
  setSyncStatus("Оновлюю спільні дані...");
  try {
    const result = await remoteLoad();
    if (result.data && Array.isArray(result.data.trips)) {
      state.trips = result.data.trips;
      state.activeTripId = result.data.activeTripId || state.trips[0]?.id || null;
      saveLocal();
      render();
    }
    setSyncStatus(showResult ? "Спільні дані оновлено" : "Підключено до спільних даних");
  } catch (error) {
    setSyncStatus(error.message || "Помилка спільного доступу", true);
  } finally {
    state.syncing = false;
  }
}

async function pushRemote() {
  if (!hasRemote() || state.syncing) {
    renderSyncStatus();
    return;
  }
  state.syncing = true;
  setSyncStatus("Зберігаю у спільні дані...");
  try {
    await remoteSave({
      trips: state.trips,
      activeTripId: state.activeTripId,
      updatedAt: new Date().toISOString(),
    });
    setSyncStatus("Збережено у спільні дані");
  } catch (error) {
    setSyncStatus(error.message || "Не вдалося зберегти онлайн", true);
  } finally {
    state.syncing = false;
  }
}

function renderSyncStatus() {
  if (hasRemote()) {
    setSyncStatus("Підключено до спільних даних");
  } else {
    setSyncStatus("Дані зберігаються на цьому пристрої");
  }
}

function renderTrips() {
  const template = document.querySelector("#tripTemplate");
  els.tripList.innerHTML = "";
  const allClients = state.trips.flatMap((trip) => trip.clients || []);
  const allFinance = getFinanceSummary(allClients);
  els.allPeopleCount.textContent = allFinance.people;
  els.allPaidAmount.textContent = money(allFinance.paid);
  els.allDebtAmount.textContent = money(allFinance.debt);

  if (state.trips.length === 0) {
    els.tripList.innerHTML = '<p class="muted">Поїздок ще немає.</p>';
    return;
  }

  state.trips
    .slice()
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .forEach((trip) => {
      const item = template.content.firstElementChild.cloneNode(true);
      item.classList.toggle("active", trip.id === state.activeTripId);
      item.querySelector(".trip-main").textContent = trip.direction;
      item.querySelector(".trip-sub").textContent = `${formatDate(trip.date)} · ${trip.clients?.length || 0} людей`;
      item.addEventListener("click", async () => {
        state.activeTripId = trip.id;
        await save({ sync: false });
        render();
      });
      els.tripList.appendChild(item);
    });
}

function renderClients() {
  const trip = getActiveTrip();
  const query = els.searchInput.value.trim().toLowerCase();
  els.clientList.innerHTML = "";

  els.newClientBtn.disabled = !trip;
  els.csvBtn.disabled = !trip;
  els.summary.hidden = !trip;
  els.financeBox.hidden = !trip;

  if (!trip) {
    els.activeTripTitle.textContent = "Оберіть поїздку";
    els.activeTripMeta.textContent = "Тут буде список людей, оплати й місця посадки.";
    els.emptyState.textContent = "Оберіть або створіть поїздку.";
    els.emptyState.hidden = false;
    return;
  }

  els.activeTripTitle.textContent = trip.direction;
  els.activeTripMeta.textContent = `${formatDate(trip.date)}${trip.note ? ` · ${trip.note}` : ""}`;

  const clients = (trip.clients || []).filter((client) => {
    const haystack = `${client.name} ${client.phone} ${client.boarding} ${client.note}`.toLowerCase();
    return haystack.includes(query);
  });

  const activeClients = (trip.clients || []).filter((client) => client.status !== "cancelled");
  const finance = getFinanceSummary(activeClients);
  els.peopleCount.textContent = finance.people;
  els.totalAmount.textContent = money(finance.total);
  els.paidAmount.textContent = money(finance.paid);
  els.debtAmount.textContent = money(finance.debt);
  els.advanceAmount.textContent = money(finance.advanceAmount);
  els.advanceCount.textContent = `${finance.advanceCount} людей`;
  els.fullPaidAmount.textContent = money(finance.fullPaidAmount);
  els.fullPaidCount.textContent = `${finance.fullPaidCount} людей`;
  els.receivedAmount.textContent = money(finance.paid);
  els.remainingAmount.textContent = money(finance.remainingAmount);
  els.remainingCount.textContent = `${finance.remainingCount} людей`;

  if (clients.length === 0) {
    els.emptyState.textContent = query ? "За таким пошуком нічого не знайдено." : "У цій поїздці ще немає людей.";
    els.emptyState.hidden = false;
    return;
  }

  els.emptyState.hidden = true;
  const template = document.querySelector("#clientTemplate");

  clients.forEach((client) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const debt = Math.max(Number(client.price || 0) - Number(client.paid || 0), 0);
    const badge = card.querySelector(".badge");

    card.querySelector("h3").textContent = client.name;
    card.querySelector(".client-phone").textContent = client.phone || "Телефон не вказано";
    badge.textContent = statusLabels[client.status] || statusLabels.reserved;
    badge.classList.add(client.status || "reserved");
    card.querySelector(".price").textContent = money(client.price);
    card.querySelector(".paid").textContent = money(client.paid);
    card.querySelector(".debt").textContent = money(debt);
    card.querySelector(".paid-date").textContent = formatDate(client.paidDate);
    card.querySelector(".boarding").textContent = client.boarding || "-";
    card.querySelector(".note").textContent = client.note || "";

    card.querySelector(".edit-client").addEventListener("click", () => editClient(client.id));
    card.querySelector(".delete-client").addEventListener("click", () => deleteClient(client.id));
    els.clientList.appendChild(card);
  });
}

function render() {
  renderTrips();
  renderClients();
}

function resetTripForm() {
  els.tripForm.reset();
  els.tripDate.value = new Date().toISOString().slice(0, 10);
}

function resetClientForm() {
  els.clientForm.reset();
  els.clientId.value = "";
  els.clientPrice.value = 0;
  els.clientPaid.value = 0;
  els.clientStatus.value = "reserved";
}

function editClient(clientId) {
  const trip = getActiveTrip();
  const client = trip.clients.find((item) => item.id === clientId);
  if (!client) return;

  els.clientId.value = client.id;
  els.clientName.value = client.name || "";
  els.clientPhone.value = client.phone || "";
  els.clientPrice.value = client.price || 0;
  els.clientPaid.value = client.paid || 0;
  els.clientPaidDate.value = client.paidDate || "";
  els.clientBoarding.value = client.boarding || "";
  els.clientStatus.value = client.status || "reserved";
  els.clientNote.value = client.note || "";
  els.clientForm.classList.remove("hidden");
  els.clientName.focus();
}

async function deleteClient(clientId) {
  const trip = getActiveTrip();
  if (!trip) return;
  const client = trip.clients.find((item) => item.id === clientId);
  if (!client || !confirm(`Видалити "${client.name}"?`)) return;
  trip.clients = trip.clients.filter((item) => item.id !== clientId);
  await save();
  render();
}

function toCsvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

els.newTripBtn.addEventListener("click", () => {
  resetTripForm();
  els.tripForm.classList.remove("hidden");
  els.tripDirection.focus();
});

els.cancelTripBtn.addEventListener("click", () => {
  els.tripForm.classList.add("hidden");
});

els.tripForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const trip = {
    id: uid(),
    direction: els.tripDirection.value.trim(),
    date: els.tripDate.value,
    note: els.tripNote.value.trim(),
    clients: [],
  };
  state.trips.push(trip);
  state.activeTripId = trip.id;
  await save();
  els.tripForm.classList.add("hidden");
  resetTripForm();
  render();
});

els.newClientBtn.addEventListener("click", () => {
  resetClientForm();
  els.clientForm.classList.remove("hidden");
  els.clientName.focus();
});

els.cancelClientBtn.addEventListener("click", () => {
  els.clientForm.classList.add("hidden");
  resetClientForm();
});

els.clientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const trip = getActiveTrip();
  if (!trip) return;

  const client = {
    id: els.clientId.value || uid(),
    name: els.clientName.value.trim(),
    phone: els.clientPhone.value.trim(),
    price: Number(els.clientPrice.value || 0),
    paid: Number(els.clientPaid.value || 0),
    paidDate: els.clientPaidDate.value,
    boarding: els.clientBoarding.value.trim(),
    status: els.clientStatus.value,
    note: els.clientNote.value.trim(),
  };

  if (client.paid >= client.price && client.price > 0) {
    client.status = "paid";
  } else if (client.paid > 0 && client.status !== "cancelled") {
    client.status = "advance";
  }

  const index = trip.clients.findIndex((item) => item.id === client.id);
  if (index >= 0) {
    trip.clients[index] = client;
  } else {
    trip.clients.push(client);
  }

  await save();
  els.clientForm.classList.add("hidden");
  resetClientForm();
  render();
});

els.searchInput.addEventListener("input", renderClients);

els.csvBtn.addEventListener("click", () => {
  const trip = getActiveTrip();
  if (!trip) return;
  const rows = [
    ["Поїздка", "Дата", "Ім'я", "Телефон", "Вартість", "Оплачено", "Борг", "Дата оплати", "Де сідає", "Стан", "Примітка"],
    ...(trip.clients || []).map((client) => [
      trip.direction,
      trip.date,
      client.name,
      client.phone,
      client.price,
      client.paid,
      Math.max(Number(client.price || 0) - Number(client.paid || 0), 0),
      client.paidDate,
      client.boarding,
      statusLabels[client.status] || "",
      client.note,
    ]),
  ];
  const csv = rows.map((row) => row.map(toCsvValue).join(";")).join("\n");
  download(`spysok-${trip.direction}-${trip.date}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
});

els.exportBtn.addEventListener("click", () => {
  download("oblik-mandrivok-rezervna-kopiya.json", JSON.stringify({ trips: state.trips, activeTripId: state.activeTripId }, null, 2), "application/json");
});

els.importInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed.trips)) throw new Error("bad file");
    if (!confirm("Замінити поточні записи даними з файлу?")) return;
    state.trips = parsed.trips;
    state.activeTripId = parsed.activeTripId || state.trips[0]?.id || null;
    await save();
    render();
  } catch {
    alert("Не вдалося відкрити цей файл резервної копії.");
  } finally {
    event.target.value = "";
  }
});

els.settingsBtn.addEventListener("click", () => {
  els.remoteUrl.value = state.settings.remoteUrl;
  els.remotePassword.value = state.settings.remotePassword;
  els.settingsDialog.showModal();
});

els.closeSettingsBtn.addEventListener("click", () => {
  els.settingsDialog.close();
});

els.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.settings.remoteUrl = normalizeRemoteUrl(els.remoteUrl.value);
  state.settings.remotePassword = els.remotePassword.value.trim();
  saveSettings();
  els.settingsDialog.close();
  await pushRemote();
});

els.testSyncBtn.addEventListener("click", async () => {
  state.settings.remoteUrl = normalizeRemoteUrl(els.remoteUrl.value);
  state.settings.remotePassword = els.remotePassword.value.trim();
  saveSettings();
  await pullRemote({ showResult: true });
});

els.syncNowBtn.addEventListener("click", async () => {
  await pullRemote({ showResult: true });
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.deferredInstall = event;
  els.installBtn.hidden = false;
});

els.installBtn.addEventListener("click", async () => {
  if (!state.deferredInstall) return;
  state.deferredInstall.prompt();
  await state.deferredInstall.userChoice;
  state.deferredInstall = null;
  els.installBtn.hidden = true;
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("service-worker.js");
}

loadSettings();
loadLocal();
renderSyncStatus();
render();
pullRemote();
