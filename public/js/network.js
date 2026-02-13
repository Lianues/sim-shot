const SOCKET_URL_STORAGE_KEY = 'sim_shot_socket_url';

function normalizeUrl(raw) {
  if (!raw) return '';
  const value = String(raw).trim();
  if (!value) return '';

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value.replace(/\/$/, '');
  }

  return `https://${value.replace(/\/$/, '')}`;
}

function resolveSocketUrl() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = normalizeUrl(params.get('server'));
  if (fromQuery) {
    localStorage.setItem(SOCKET_URL_STORAGE_KEY, fromQuery);
    return fromQuery;
  }

  const fromGlobal = normalizeUrl(window.__SOCKET_SERVER_URL__);
  if (fromGlobal) return fromGlobal;

  const meta = document.querySelector('meta[name="socket-server-url"]');
  const fromMeta = normalizeUrl(meta?.content || '');
  if (fromMeta) return fromMeta;

  const fromStorage = normalizeUrl(localStorage.getItem(SOCKET_URL_STORAGE_KEY));
  if (fromStorage) return fromStorage;

  return window.location.origin;
}

export function createNetwork() {
  const socketUrl = resolveSocketUrl();

  const socket = window.io(socketUrl, {
    path: '/socket.io',
    transports: ['websocket'],
    upgrade: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
    timeout: 10000,
    withCredentials: false
  });

  socket.on('connect_error', (err) => {
    console.warn('[socket] connect_error:', err?.message || err, 'url=', socketUrl);
  });

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
    emit,
    socketUrl
  };
}
