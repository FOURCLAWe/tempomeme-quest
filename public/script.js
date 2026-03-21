const form = document.querySelector("#quest-form");
const walletInput = document.querySelector("#wallet-address");
const submitBtn = document.querySelector("#submit-btn");
const feedback = document.querySelector("#form-feedback");
const progressValue = document.querySelector("#progress-value");

const taskInputs = {
  follow: document.querySelector("#task-follow"),
  commentWallet: document.querySelector("#task-comment"),
  likeAndRepost: document.querySelector("#task-engage")
};

const STORAGE_KEY = "tempo-quest-draft";
const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

function getPayload() {
  return {
    walletAddress: walletInput.value.trim(),
    tasks: {
      follow: taskInputs.follow.checked,
      commentWallet: taskInputs.commentWallet.checked,
      likeAndRepost: taskInputs.likeAndRepost.checked
    }
  };
}

function saveDraft() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(getPayload()));
}

function restoreDraft() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const draft = JSON.parse(saved);
    if (draft && typeof draft.walletAddress === "string") {
      walletInput.value = draft.walletAddress;
    }
    if (draft && draft.tasks && typeof draft.tasks === "object") {
      taskInputs.follow.checked = Boolean(draft.tasks.follow);
      taskInputs.commentWallet.checked = Boolean(draft.tasks.commentWallet);
      taskInputs.likeAndRepost.checked = Boolean(draft.tasks.likeAndRepost);
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

function updateProgress() {
  const checkedCount = Object.values(taskInputs).filter((input) => input.checked).length;
  progressValue.textContent = `${checkedCount}/3`;
}

function renderFeedback(type, title, lines = []) {
  feedback.replaceChildren();
  feedback.className = `form-feedback active ${type}`;

  const titleNode = document.createElement("div");
  titleNode.className = "feedback-title";
  titleNode.textContent = title;
  feedback.appendChild(titleNode);

  lines.forEach((line) => {
    const lineNode = document.createElement("div");
    lineNode.className = "feedback-line";
    lineNode.textContent = line;
    feedback.appendChild(lineNode);
  });
}

function validatePayload(payload) {
  if (!payload.walletAddress) {
    return "Please enter your EVM wallet address first.";
  }

  if (!EVM_ADDRESS_PATTERN.test(payload.walletAddress)) {
    return "Invalid wallet format. Please enter a standard EVM address.";
  }

  if (!Object.values(payload.tasks).every(Boolean)) {
    return "Please confirm that you completed follow, comment, like, and repost before submitting.";
  }

  return "";
}

function formatSubmittedAt(value) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

restoreDraft();
updateProgress();

walletInput.addEventListener("input", saveDraft);
Object.values(taskInputs).forEach((input) => {
  input.addEventListener("change", () => {
    saveDraft();
    updateProgress();
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = getPayload();
  const errorMessage = validatePayload(payload);

  if (errorMessage) {
    renderFeedback("error", "Almost there", [errorMessage]);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  try {
    const response = await fetch("/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const raw = await response.text();
    const data = raw ? JSON.parse(raw) : {};

    if (!response.ok) {
      throw new Error(data.error || "Submission failed. Please try again later.");
    }

    saveDraft();
    renderFeedback("success", "Submission successful", [
      `Wallet address: ${payload.walletAddress}`,
      `Submitted at: ${formatSubmittedAt(data.receivedAt || new Date().toISOString())}`,
      "Please keep the address in your comment identical to the address submitted in this form."
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error. Please try again later.";
    renderFeedback("error", "Submission failed", [message]);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit entry";
  }
});

walletInput.focus();
