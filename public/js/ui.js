export function createLoginUI() {
  const overlay = document.getElementById('login-overlay');
  const nameInput = document.getElementById('name-input');
  const joinBtn = document.getElementById('join-btn');
  const errorEl = document.getElementById('login-error');

  let onSubmitHandler = null;

  function submit() {
    const name = nameInput.value.trim();
    if (!name) {
      showError('请输入名字');
      return;
    }
    if (name.length > 20) {
      showError('名字不能超过20个字符');
      return;
    }
    showError('');
    if (onSubmitHandler) onSubmitHandler(name);
  }

  joinBtn.addEventListener('click', submit);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });

  function setOnSubmit(handler) {
    onSubmitHandler = handler;
  }

  function showError(message) {
    errorEl.textContent = message || '';
  }

  function hide() {
    overlay.classList.add('hidden');
  }

  function show() {
    overlay.classList.remove('hidden');
    nameInput.focus();
  }

  show();

  return {
    setOnSubmit,
    showError,
    hide,
    show
  };
}
