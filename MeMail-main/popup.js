const activeProviderEl = document.getElementById("activeProvider");
const savedKeysEl = document.getElementById("savedKeys");
const lastLearnedEl = document.getElementById("lastLearned");
const manageKeysBtn = document.getElementById("manageKeysBtn");
const relearnBtn = document.getElementById("relearnBtn");
const reauthBtn = document.getElementById("reauthBtn");
const statusEl = document.getElementById("status");

loadPopup();

manageKeysBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "MEMAIL_OPEN_ONBOARDING_STEP4" });
});

relearnBtn.addEventListener("click", () => {
  reauthBtn.style.display = "none";
  statusEl.textContent = "Re-learning style...";
  chrome.runtime.sendMessage({ type: "MEMAIL_START_RELEARN" }, (response) => {
    if (chrome.runtime.lastError) {
      statusEl.textContent = "Could not start re-learning.";
      return;
    }
    if (!response?.ok) {
      statusEl.textContent = response?.error || "Could not re-learn style.";
      if (response?.needsAuth) {
        reauthBtn.style.display = "block";
      }
      return;
    }
    statusEl.textContent = "Style re-learn complete.";
    reauthBtn.style.display = "none";
    loadPopup();
  });
});

reauthBtn.addEventListener("click", () => {
  statusEl.textContent = "Re-authorising Gmail access...";
  chrome.runtime.sendMessage({ type: "MEMAIL_REAUTHORIZE_GMAIL" }, (response) => {
    if (chrome.runtime.lastError) {
      statusEl.textContent = "Could not re-authorise Gmail.";
      return;
    }
    if (!response?.ok) {
      statusEl.textContent = response?.error || "Could not re-authorise Gmail.";
      reauthBtn.style.display = "block";
      return;
    }
    statusEl.textContent = "Gmail authorised. Style learning complete.";
    reauthBtn.style.display = "none";
    loadPopup();
  });
});

async function loadPopup() {
  const data = await chrome.storage.local.get(["aiProvider", "apiKeys", "lastLearnedAt", "lastLearnError"]);
  const provider = data.aiProvider || "";
  const apiKeys = data.apiKeys || {};

  activeProviderEl.textContent = provider ? providerLabel(provider) : "None";
  activeProviderEl.className = provider ? `badge ${provider}` : "";

  savedKeysEl.innerHTML = "";
  const saved = Object.keys(apiKeys).filter((key) => apiKeys[key]);
  if (!saved.length) {
    const li = document.createElement("li");
    li.textContent = "No keys saved yet";
    savedKeysEl.appendChild(li);
  } else {
    saved.forEach((key) => {
      const li = document.createElement("li");
      li.textContent = `${providerLabel(key)}: ${mask(apiKeys[key])}`;
      savedKeysEl.appendChild(li);
    });
  }

  if (data.lastLearnedAt) {
    const date = new Date(data.lastLearnedAt).toLocaleString();
    lastLearnedEl.textContent = `Style last updated: ${date}`;
  } else {
    lastLearnedEl.textContent = "Style last updated: Never";
  }

  if (data.lastLearnError) {
    statusEl.textContent = data.lastLearnError;
    reauthBtn.style.display = data.lastLearnError.includes("Gmail access needed") ? "block" : "none";
  } else {
    reauthBtn.style.display = "none";
  }
}

function providerLabel(provider) {
  const map = {
    openai: "OpenAI",
    gemini: "Gemini",
    anthropic: "Anthropic",
    deepseek: "DeepSeek"
  };
  return map[provider] || provider;
}

function mask(value) {
  if (!value || value.length < 4) {
    return "••••";
  }
  return `${"•".repeat(12)}${value.slice(-4)}`;
}
