export function createInput() {
  const state = {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    ShiftLeft: false,
    ShiftRight: false,
    Space: false
  };

  let jumpPressed = false;

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function onKeyDown(e) {
    if (isTypingTarget(e.target)) return;

    if (e.code === 'Space') {
      e.preventDefault();
    }

    if (!(e.code in state)) return;

    if (e.code === 'Space' && !state.Space) {
      jumpPressed = true;
    }

    state[e.code] = true;
  }

  function onKeyUp(e) {
    if (!(e.code in state)) return;
    state[e.code] = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  function getMoveVector() {
    const x = (state.KeyD ? 1 : 0) - (state.KeyA ? 1 : 0);
    const z = (state.KeyS ? 1 : 0) - (state.KeyW ? 1 : 0);
    const sprinting = state.ShiftLeft || state.ShiftRight;
    const len = Math.hypot(x, z);
    if (len === 0) return { x: 0, z: 0, moving: false, sprinting };
    return { x: x / len, z: z / len, moving: true, sprinting };
  }

  function consumeJumpPress() {
    const pressed = jumpPressed;
    jumpPressed = false;
    return pressed;
  }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  }

  return {
    getMoveVector,
    consumeJumpPress,
    dispose
  };
}
