const state = {
  services: [],
  tabs: [],
  activeTabId: null,
  editingServiceId: null,
  search: ""
};

const els = {
  serviceList: document.getElementById("serviceList"),
  serviceSearch: document.getElementById("serviceSearch"),
  addServiceButton: document.getElementById("addServiceButton"),
  refreshButton: document.getElementById("refreshButton"),
  tabs: document.getElementById("tabs"),
  emptyState: document.getElementById("emptyState"),
  frameHost: document.getElementById("frameHost"),
  reloadTabButton: document.getElementById("reloadTabButton"),
  openExternalButton: document.getElementById("openExternalButton"),
  serviceDialog: document.getElementById("serviceDialog"),
  serviceForm: document.getElementById("serviceForm"),
  dialogTitle: document.getElementById("dialogTitle"),
  closeDialogButton: document.getElementById("closeDialogButton"),
  cancelServiceButton: document.getElementById("cancelServiceButton"),
  deleteServiceButton: document.getElementById("deleteServiceButton"),
  serviceNameInput: document.getElementById("serviceNameInput"),
  serviceIdInput: document.getElementById("serviceIdInput"),
  serviceUrlInput: document.getElementById("serviceUrlInput"),
  serviceDescriptionInput: document.getElementById("serviceDescriptionInput"),
  serviceEnabledInput: document.getElementById("serviceEnabledInput"),
  formError: document.getElementById("formError")
};

function proxyUrl(serviceId) {
  return `/proxy/${encodeURIComponent(serviceId)}/`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json();
      message = payload.message || payload.error || message;
    } catch {
      // Keep the HTTP status message when the response is not JSON.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

async function loadServices() {
  state.services = await api("/api/services");
  renderServices();
  renderTabs();
}

function filteredServices() {
  const query = state.search.trim().toLowerCase();
  if (!query) {
    return state.services;
  }
  return state.services.filter((service) => {
    return [service.name, service.id, service.url, service.description].some((value) => {
      return String(value || "").toLowerCase().includes(query);
    });
  });
}

function serviceById(id) {
  return state.services.find((service) => service.id === id);
}

function tabById(id) {
  return state.tabs.find((tab) => tab.id === id);
}

function renderServices() {
  const services = filteredServices();
  if (!services.length) {
    els.serviceList.innerHTML = '<div class="empty-service">没有可显示的服务</div>';
    return;
  }

  els.serviceList.innerHTML = services.map((service) => {
    const active = state.tabs.some((tab) => tab.serviceId === service.id && tab.id === state.activeTabId);
    const disabled = service.enabled === false;
    return `
      <div class="service-item ${active ? "active" : ""} ${disabled ? "disabled" : ""}" data-service-id="${escapeHtml(service.id)}">
        <button class="service-open" type="button" data-action="open" title="${escapeHtml(service.url)}" ${disabled ? "disabled" : ""}>
          <span class="service-name">${escapeHtml(service.name)}</span>
          <span class="service-url">${escapeHtml(service.url)}</span>
          ${service.description ? `<span class="service-desc">${escapeHtml(service.description)}</span>` : ""}
        </button>
        <button class="icon-button service-edit" type="button" data-action="edit" title="编辑 ${escapeHtml(service.name)}" aria-label="编辑 ${escapeHtml(service.name)}">
          <span aria-hidden="true">⋯</span>
        </button>
      </div>
    `;
  }).join("");
}

function renderTabs() {
  els.tabs.innerHTML = state.tabs.map((tab) => {
    const service = serviceById(tab.serviceId);
    const title = service ? service.name : tab.title;
    return `
      <button class="tab ${tab.id === state.activeTabId ? "active" : ""}" type="button" role="tab" data-tab-id="${escapeHtml(tab.id)}" aria-selected="${tab.id === state.activeTabId}">
        <span class="tab-title">${escapeHtml(title)}</span>
        <span class="tab-close" role="button" tabindex="-1" data-action="close" title="关闭" aria-label="关闭">×</span>
      </button>
    `;
  }).join("");

  const hasActiveTab = Boolean(state.activeTabId);
  els.emptyState.style.display = hasActiveTab ? "none" : "grid";
  els.frameHost.style.display = hasActiveTab ? "block" : "none";
  els.reloadTabButton.disabled = !hasActiveTab;
  els.openExternalButton.disabled = !hasActiveTab;

  for (const frame of els.frameHost.querySelectorAll(".service-frame")) {
    frame.classList.toggle("active", frame.dataset.tabId === state.activeTabId);
  }

  renderServices();
}

function createFrame(tab) {
  const existing = els.frameHost.querySelector(`[data-tab-id="${CSS.escape(tab.id)}"]`);
  if (existing) {
    return existing;
  }

  const frame = document.createElement("iframe");
  frame.className = "service-frame";
  frame.dataset.tabId = tab.id;
  frame.title = tab.title;
  frame.src = proxyUrl(tab.serviceId);
  frame.setAttribute("referrerpolicy", "same-origin");
  els.frameHost.appendChild(frame);
  return frame;
}

function openService(serviceId) {
  const service = serviceById(serviceId);
  if (!service) {
    return;
  }

  let tab = state.tabs.find((item) => item.serviceId === serviceId);
  if (!tab) {
    tab = {
      id: `${serviceId}-${Date.now()}`,
      serviceId,
      title: service.name
    };
    state.tabs.push(tab);
    createFrame(tab);
  }

  state.activeTabId = tab.id;
  renderTabs();
}

function activateTab(tabId) {
  if (!tabById(tabId)) {
    return;
  }
  state.activeTabId = tabId;
  renderTabs();
}

function closeTab(tabId) {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) {
    return;
  }

  const [removed] = state.tabs.splice(index, 1);
  const frame = els.frameHost.querySelector(`[data-tab-id="${CSS.escape(tabId)}"]`);
  frame?.remove();

  if (state.activeTabId === tabId) {
    const next = state.tabs[index] || state.tabs[index - 1] || null;
    state.activeTabId = next?.id || null;
  }

  if (removed) {
    renderTabs();
  }
}

function reloadActiveTab() {
  const frame = els.frameHost.querySelector(`[data-tab-id="${CSS.escape(state.activeTabId || "")}"]`);
  if (frame) {
    frame.src = frame.src;
  }
}

function openActiveProxyUrl() {
  const tab = tabById(state.activeTabId);
  if (!tab) {
    return;
  }
  window.open(proxyUrl(tab.serviceId), "_blank", "noopener,noreferrer");
}

function showFormError(message) {
  els.formError.textContent = message || "";
  els.formError.classList.toggle("visible", Boolean(message));
}

function openServiceDialog(service = null) {
  state.editingServiceId = service?.id || null;
  els.dialogTitle.textContent = service ? "编辑服务" : "新增服务";
  els.deleteServiceButton.style.visibility = service ? "visible" : "hidden";
  els.serviceNameInput.value = service?.name || "";
  els.serviceIdInput.value = service?.id || "";
  els.serviceUrlInput.value = service?.url || "";
  els.serviceDescriptionInput.value = service?.description || "";
  els.serviceEnabledInput.checked = service?.enabled !== false;
  showFormError("");
  els.serviceDialog.showModal();
  els.serviceNameInput.focus();
}

function closeServiceDialog() {
  els.serviceDialog.close();
}

function collectFormPayload() {
  return {
    name: els.serviceNameInput.value.trim(),
    id: els.serviceIdInput.value.trim(),
    url: els.serviceUrlInput.value.trim(),
    description: els.serviceDescriptionInput.value.trim(),
    enabled: els.serviceEnabledInput.checked
  };
}

async function saveService(event) {
  event.preventDefault();
  showFormError("");
  const payload = collectFormPayload();

  try {
    if (state.editingServiceId) {
      const updated = await api(`/api/services/${encodeURIComponent(state.editingServiceId)}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      const tab = state.tabs.find((item) => item.serviceId === state.editingServiceId);
      if (tab && updated.id !== state.editingServiceId) {
        tab.serviceId = updated.id;
        tab.title = updated.name;
        const frame = els.frameHost.querySelector(`[data-tab-id="${CSS.escape(tab.id)}"]`);
        if (frame) {
          frame.src = proxyUrl(updated.id);
        }
      }
    } else {
      await api("/api/services", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
    closeServiceDialog();
    await loadServices();
  } catch (err) {
    showFormError(err.message);
  }
}

async function deleteEditingService() {
  if (!state.editingServiceId) {
    return;
  }
  const service = serviceById(state.editingServiceId);
  const confirmed = window.confirm(`删除服务「${service?.name || state.editingServiceId}」？`);
  if (!confirmed) {
    return;
  }

  try {
    await api(`/api/services/${encodeURIComponent(state.editingServiceId)}`, { method: "DELETE" });
    for (const tab of [...state.tabs]) {
      if (tab.serviceId === state.editingServiceId) {
        closeTab(tab.id);
      }
    }
    closeServiceDialog();
    await loadServices();
  } catch (err) {
    showFormError(err.message);
  }
}

els.serviceList.addEventListener("click", (event) => {
  const item = event.target.closest(".service-item");
  if (!item) {
    return;
  }
  const service = serviceById(item.dataset.serviceId);
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "edit") {
    openServiceDialog(service);
    return;
  }
  if (service?.enabled === false) {
    return;
  }
  openService(item.dataset.serviceId);
});

els.tabs.addEventListener("click", (event) => {
  const tabButton = event.target.closest(".tab");
  if (!tabButton) {
    return;
  }
  if (event.target.closest('[data-action="close"]')) {
    closeTab(tabButton.dataset.tabId);
    return;
  }
  activateTab(tabButton.dataset.tabId);
});

els.serviceSearch.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderServices();
});

els.addServiceButton.addEventListener("click", () => openServiceDialog());
els.refreshButton.addEventListener("click", () => loadServices().catch((err) => alert(err.message)));
els.reloadTabButton.addEventListener("click", reloadActiveTab);
els.openExternalButton.addEventListener("click", openActiveProxyUrl);
els.closeDialogButton.addEventListener("click", closeServiceDialog);
els.cancelServiceButton.addEventListener("click", closeServiceDialog);
els.serviceForm.addEventListener("submit", saveService);
els.deleteServiceButton.addEventListener("click", deleteEditingService);

loadServices().catch((err) => {
  els.serviceList.innerHTML = `<div class="empty-service">${escapeHtml(err.message)}</div>`;
});
