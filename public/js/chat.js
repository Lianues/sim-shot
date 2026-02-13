export function createChatUI() {
  const messagesEl = document.getElementById('chat-messages');
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');

  let onSendHandler = null;

  function appendMessage({ name, message, time }) {
    const line = document.createElement('div');
    line.className = 'chat-line';

    const date = new Date(time || Date.now());
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');

    line.innerHTML = `<span class="name">${escapeHtml(name)}</span><span>${escapeHtml(
      message
    )}</span><span class="time">${hh}:${mm}</span>`;

    messagesEl.appendChild(line);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function trySend() {
    const message = inputEl.value.trim();
    if (!message) return;
    if (onSendHandler) onSendHandler(message);
    inputEl.value = '';
    inputEl.focus();
  }

  sendBtn.addEventListener('click', trySend);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') trySend();
  });

  function onSend(handler) {
    onSendHandler = handler;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  return {
    appendMessage,
    onSend
  };
}
