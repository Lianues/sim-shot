export function createNetwork() {
  const socket = window.io();

  function on(event, handler) {
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }

  function emit(event, payload) {
    socket.emit(event, payload);
  }

  return {
    socket,
    on,
    emit
  };
}
