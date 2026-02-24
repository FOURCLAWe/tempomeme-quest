const chat = document.querySelector("#chat");
const form = document.querySelector("#chat-form");
const messageInput = document.querySelector("#message");
const sendBtn = document.querySelector("#send-btn");

function pushMessage(role, text) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

pushMessage(
  "ai",
  "你好，我是你的 AI 助手。告诉我你想生成什么，我会直接帮你完成。"
);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;

  pushMessage("user", message);
  messageInput.value = "";
  sendBtn.disabled = true;
  pushMessage("ai", "思考中...");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });

    const data = await response.json();
    const pending = chat.querySelector(".message.ai:last-child");
    if (pending) pending.remove();

    if (!response.ok) {
      pushMessage("ai", `请求失败：${data.error || "未知错误"}`);
      return;
    }

    pushMessage("ai", data.reply || "没有收到有效回复。");
  } catch (err) {
    const pending = chat.querySelector(".message.ai:last-child");
    if (pending) pending.remove();
    pushMessage("ai", `网络错误：${err.message}`);
  } finally {
    sendBtn.disabled = false;
    messageInput.focus();
  }
});
