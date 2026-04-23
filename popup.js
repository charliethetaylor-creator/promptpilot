const STORAGE_FAST_MODE_KEY = "fastModeEnabled";

const fastModeToggle = document.getElementById("fastModeToggle");
const statusEl = document.getElementById("status");

init().catch((error) => {
  setStatus(`Could not load popup: ${error.message}`, true);
});

async function init() {
  const result = await chrome.storage.local.get([STORAGE_FAST_MODE_KEY]);
  const enabled = Boolean(result?.[STORAGE_FAST_MODE_KEY]);

  fastModeToggle.checked = enabled;
  renderStatus(enabled);

  fastModeToggle.addEventListener("change", onToggleChange);
}

async function onToggleChange() {
  const enabled = fastModeToggle.checked;

  await chrome.storage.local.set({
    [STORAGE_FAST_MODE_KEY]: enabled
  });

  renderStatus(enabled);
}

function renderStatus(enabled) {
  if (enabled) {
    setStatus(
      "<strong>Fast Mode: ON</strong><br>Speed profile active. Best for short-to-medium prompt rewrites.",
      false
    );
    return;
  }

  setStatus(
    "<strong>Fast Mode: OFF</strong><br>Standard profile active. Higher token budget and fuller rewrite guidance.",
    false
  );
}

function setStatus(html, isError) {
  statusEl.innerHTML = html;
  statusEl.style.color = isError ? "#fecaca" : "#d6eaff";
}
