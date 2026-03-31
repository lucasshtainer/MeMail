const apiKeyInput = document.getElementById("apiKey");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");
let storedKey = "";

function maskKey(key) {
  const last4 = key.slice(-4);
  return `\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${last4}`;
}

function setStatus(text, ok = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("ok", ok);
}

function loadStoredKey() {
  chrome.storage.local.get(["openai_api_key"], (result) => {
    const key = result.openai_api_key || "";
    storedKey = key;
    if (!key) {
      setStatus("No key stored yet", false);
      return;
    }

    apiKeyInput.value = maskKey(key);
    setStatus("Stored key found", true);
  });
}

apiKeyInput.addEventListener("focus", () => {
  if (storedKey && apiKeyInput.value === maskKey(storedKey)) {
    apiKeyInput.value = "";
  }
});

saveBtn.addEventListener("click", () => {
  const rawValue = apiKeyInput.value.trim();
  const maskedStored = storedKey ? maskKey(storedKey) : "";
  const valueToSave = rawValue === maskedStored ? storedKey : rawValue;
  if (!valueToSave) {
    setStatus("Please enter a valid API key", false);
    return;
  }

  chrome.storage.local.set({ openai_api_key: valueToSave }, () => {
    storedKey = valueToSave;
    apiKeyInput.value = maskKey(valueToSave);
    setStatus("Key saved!", true);
  });
});

loadStoredKey();
