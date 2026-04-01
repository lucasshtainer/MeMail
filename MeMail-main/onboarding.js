const stepContainer = document.getElementById("stepContainer");
const PROVIDERS = [
  { id: "gemini", name: "Gemini", model: "gemini-1.5-pro", badge: "gemini", placeholder: "AIza..." },
  { id: "openai", name: "OpenAI", model: "gpt-4o", badge: "openai", placeholder: "sk-..." },
  {
    id: "anthropic",
    name: "Anthropic",
    model: "claude-3-5-sonnet-20241022",
    badge: "anthropic",
    placeholder: "sk-ant-..."
  },
  { id: "deepseek", name: "DeepSeek", model: "deepseek-chat", badge: "deepseek", placeholder: "sk-..." }
];

const YOUTUBE_LINKS = {
  gemini: "YOUTUBE_LINK_GEMINI",
  openai: "YOUTUBE_LINK_OPENAI",
  anthropic: "YOUTUBE_LINK_ANTHROPIC",
  deepseek: "YOUTUBE_LINK_DEEPSEEK"
};

let currentStep = getInitialStep();
let selectedProvider = "";

init();

async function init() {
  const data = await chrome.storage.local.get(["apiKeys", "aiProvider"]);
  selectedProvider = data.aiProvider || "";
  renderStep(currentStep);
}

function getInitialStep() {
  const hash = window.location.hash || "";
  if (hash.includes("step=4")) {
    return 4;
  }
  return 1;
}

function transitionTo(step) {
  currentStep = step;
  stepContainer.classList.remove("fade-in");
  window.requestAnimationFrame(() => {
    stepContainer.classList.add("fade-in");
    renderStep(step);
  });
}

function renderStep(step) {
  if (step === "fatal") {
    stepContainer.innerHTML = `
      <div class="fatal">
        <div>
          <h1>Access required</h1>
          <p>MeMail requires access to your sent emails to work. Please reinstall and accept to continue.</p>
          <a class="linkish" href="https://support.google.com/chrome_webstore/answer/2664769" target="_blank" rel="noreferrer">Reinstall Guide</a>
        </div>
      </div>
    `;
    return;
  }

  if (step === 1) {
    stepContainer.innerHTML = `
      <h1>Before we get started</h1>
      <p>MeMail needs to read your last 100 sent emails to learn how you write. This data never leaves your device - it's used only to personalise your replies.</p>
      <div class="consent-wrap">
        <label>
          <input id="consentCheck" type="checkbox" />
          I'm OK with MeMail reading my last 100 sent emails to learn my writing style
        </label>
      </div>
      <button id="step1Continue" class="btn primary" disabled>Continue</button>
    `;
    const check = document.getElementById("consentCheck");
    const btn = document.getElementById("step1Continue");
    check.addEventListener("change", () => {
      btn.disabled = !check.checked;
    });
    btn.addEventListener("click", async () => {
      if (!check.checked) {
        transitionTo("fatal");
        return;
      }
      await chrome.storage.local.set({ emailConsent: true });
      transitionTo(2);
    });
    return;
  }

  if (step === 2) {
    stepContainer.innerHTML = `
      <h1>Do you know how to get an AI API key?</h1>
      <div class="btn-grid-2">
        <button id="knowYes" class="btn primary">Yes, I know how</button>
        <button id="knowNo" class="btn">No, show me how</button>
      </div>
    `;
    document.getElementById("knowYes").addEventListener("click", () => transitionTo(4));
    document.getElementById("knowNo").addEventListener("click", () => transitionTo(3));
    return;
  }

  if (step === 3) {
    stepContainer.innerHTML = `
      <h1>No problem - here's how to get your key</h1>
      <p>Pick your AI provider and watch the tutorial. Come back when you have your key.</p>
      <div class="provider-list">
        ${PROVIDERS.map(
          (p) => `
            <div class="provider-row">
              <div><span class="badge ${p.badge}">${p.name}</span></div>
              <a class="btn" href="${YOUTUBE_LINKS[p.id]}" target="_blank" rel="noreferrer">Watch Tutorial</a>
            </div>
          `
        ).join("")}
      </div>
      <div class="actions-bottom">
        <span></span>
        <button id="proceedKeys" class="btn primary">I have my key - Proceed</button>
      </div>
    `;
    document.getElementById("proceedKeys").addEventListener("click", () => transitionTo(4));
    return;
  }

  if (step === 4) {
    renderStep4();
  }
}

async function renderStep4() {
  const data = await chrome.storage.local.get(["apiKeys"]);
  const apiKeys = data.apiKeys || {};

  stepContainer.innerHTML = `
    <h1>Choose your AI provider</h1>
    <div class="provider-grid">
      ${PROVIDERS.map(
        (p) => `
          <button class="provider-card ${selectedProvider === p.id ? "selected" : ""}" data-provider="${p.id}">
            <span class="badge ${p.badge}">${p.name}</span>
            <strong>${p.name}</strong>
            <small>${p.model}</small>
          </button>
        `
      ).join("")}
    </div>
    <div id="keyPanel"></div>
    <div class="saved-list" id="savedList">${renderSaved(apiKeys)}</div>
    <div class="actions-bottom">
      <button id="addAnother" class="linkish">+ Add another key</button>
      <button id="doneGmail" class="btn primary">Done - Go to Gmail</button>
    </div>
  `;

  stepContainer.querySelectorAll(".provider-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectedProvider = card.dataset.provider;
      renderStep4();
      renderKeyPanel(apiKeys);
    });
  });

  document.getElementById("addAnother").addEventListener("click", () => {
    selectedProvider = "";
    renderStep4();
  });

  document.getElementById("doneGmail").addEventListener("click", async () => {
    await chrome.storage.local.set({ onboardingComplete: true });
    chrome.runtime.sendMessage({ type: "MEMAIL_START_RELEARN" }, () => {});
    window.location.href = "https://mail.google.com";
  });

  renderKeyPanel(apiKeys);
}

function renderSaved(apiKeys) {
  const saved = PROVIDERS.filter((p) => apiKeys[p.id]).map((p) => `✓ ${p.name} key saved`);
  return saved.length ? saved.join(" · ") : "No provider keys saved yet.";
}

function renderKeyPanel(apiKeys) {
  const keyPanel = document.getElementById("keyPanel");
  if (!selectedProvider) {
    keyPanel.innerHTML = "";
    return;
  }
  const provider = PROVIDERS.find((p) => p.id === selectedProvider);
  keyPanel.innerHTML = `
    <div class="key-panel">
      <label for="providerKey">Enter your ${provider.name} API key</label>
      <div class="key-row">
        <div class="key-input-wrap">
          <input id="providerKey" type="password" placeholder="${provider.placeholder}" autocomplete="off" />
          <button id="toggleKey" class="btn" type="button">Show</button>
        </div>
        <button id="saveProviderKey" class="btn primary" type="button">Save Key</button>
      </div>
      <p id="saveStatus"></p>
    </div>
  `;

  const input = document.getElementById("providerKey");
  const toggle = document.getElementById("toggleKey");
  const saveBtn = document.getElementById("saveProviderKey");
  const saveStatus = document.getElementById("saveStatus");
  const existing = apiKeys[selectedProvider];
  if (existing) {
    input.value = maskKey(existing);
  }

  toggle.addEventListener("click", () => {
    input.type = input.type === "password" ? "text" : "password";
    toggle.textContent = input.type === "password" ? "Show" : "Hide";
  });

  input.addEventListener("focus", () => {
    if (existing && input.value === maskKey(existing)) {
      input.value = "";
    }
  });

  saveBtn.addEventListener("click", async () => {
    const raw = input.value.trim();
    const key = existing && raw === maskKey(existing) ? existing : raw;
    if (!key) {
      saveStatus.textContent = "Please enter a valid key.";
      return;
    }

    const storage = await chrome.storage.local.get(["apiKeys"]);
    const allKeys = storage.apiKeys || {};
    allKeys[selectedProvider] = key;
    await chrome.storage.local.set({
      aiProvider: selectedProvider,
      apiKeys: allKeys
    });

    saveStatus.textContent = `${provider.name} key saved.`;
    renderStep4();
  });
}

function maskKey(key) {
  return `${"•".repeat(16)}${key.slice(-4)}`;
}
