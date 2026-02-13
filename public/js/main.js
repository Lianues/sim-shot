import { createSceneSystem } from './scene.js';
import { createPlayerFactory } from './player.js';
import { createNetwork } from './network.js';
import { createInput } from './input.js';
import { createLoginUI } from './ui.js';
import { createChatUI } from './chat.js';
import { createSoundSystem } from './sound.js';

const gameContainer = document.getElementById('game-container');

const sceneSystem = createSceneSystem(gameContainer);
const { THREE, scene, camera, renderer, render, world } = sceneSystem;
const { mapHalfSize = 22, obstacleColliders = [] } = world || {};

const playerFactory = createPlayerFactory(THREE);
const network = createNetwork();
const input = createInput();
const loginUI = createLoginUI();
const chatUI = createChatUI();
const sound = createSoundSystem();

const chatInputEl = document.getElementById('chat-input');
const hpValueEl = document.getElementById('hp-value');
const statusTextEl = document.getElementById('status-text');
const damageFlashEl = document.getElementById('damage-flash');
const soundToggleBtn = document.getElementById('sound-toggle-btn');

let myId = null;
let myPlayer = null;
let myName = '';
let myHealth = 100;
let yaw = 0;
let pitch = 0;

const players = new Map();

const MOUSE_SENSITIVITY = 0.0022;
const PITCH_LIMIT = Math.PI / 2 - 0.05;
const BASE_MOVE_SPEED = 8.5;
const SPRINT_MULTIPLIER = 1.7;
const JUMP_VELOCITY = 8.8;
const GRAVITY = 24;
const GROUND_Y = 0;
const PLAYER_RADIUS = 0.38;
const SHOT_COOLDOWN_MS = 180;
const SHOT_RANGE = 36;

camera.rotation.order = 'YXZ';

const viewGun = createViewGun();
camera.add(viewGun);

let statusTimer = null;
let lastShotAt = 0;
let gunKick = 0;
let verticalVelocity = 0;
let isGrounded = true;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setStatusText(text, autoClearMs = 0) {
  if (!statusTextEl) return;

  statusTextEl.textContent = text || '';

  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }

  if (text && autoClearMs > 0) {
    statusTimer = setTimeout(() => {
      statusTextEl.textContent = '';
      statusTimer = null;
    }, autoClearMs);
  }
}

function updateSoundToggleButton() {
  if (!soundToggleBtn) return;
  soundToggleBtn.textContent = sound.isEnabled() ? '🔊 音效：开' : '🔇 音效：关';
}

if (soundToggleBtn) {
  updateSoundToggleButton();
  soundToggleBtn.addEventListener('click', async (e) => {
    e.stopPropagation();

    const nextEnabled = !sound.isEnabled();
    sound.setEnabled(nextEnabled);

    if (nextEnabled) {
      await sound.unlock();
      setStatusText('音效已开启', 900);
    } else {
      setStatusText('音效已关闭', 900);
    }

    updateSoundToggleButton();
  });
}

function updateMyHealthUI(health) {
  myHealth = Math.max(0, Math.round(health || 0));
  if (hpValueEl) {
    hpValueEl.textContent = String(myHealth);

    if (myHealth > 60) {
      hpValueEl.style.color = '#7df7a3';
    } else if (myHealth > 30) {
      hpValueEl.style.color = '#ffd166';
    } else {
      hpValueEl.style.color = '#ff6b6b';
    }
  }

  if (myHealth <= 0) {
    setStatusText('你已被击倒，正在等待复活...');
  }
}

function flashDamage() {
  if (!damageFlashEl) return;

  damageFlashEl.classList.remove('active');
  // 强制浏览器重排，保证连续命中也能重新触发动画
  // eslint-disable-next-line no-unused-expressions
  damageFlashEl.offsetWidth;
  damageFlashEl.classList.add('active');

  setTimeout(() => {
    damageFlashEl.classList.remove('active');
  }, 120);
}

function createViewGun() {
  const gunGroup = new THREE.Group();

  const mainMat = new THREE.MeshStandardMaterial({ color: 0x2f3440, metalness: 0.3, roughness: 0.5 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x5f6879, metalness: 0.4, roughness: 0.35 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.85), mainMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.45), accentMat);
  barrel.position.set(0, 0, -0.62);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.18), mainMat);
  grip.position.set(0, -0.2, 0.15);

  gunGroup.add(body, barrel, grip);
  gunGroup.position.set(0.36, -0.3, -0.72);

  return gunGroup;
}

function updateViewGun(delta, elapsed) {
  viewGun.visible = Boolean(myPlayer && myPlayer.health > 0);
  if (!viewGun.visible) return;

  gunKick = Math.max(0, gunKick - delta * 8);
  const bob = myPlayer && myPlayer.moving ? Math.sin(elapsed * 12) * 0.01 : 0;

  viewGun.position.set(0.36, -0.3 + bob, -0.72 + gunKick * 0.12);
  viewGun.rotation.x = -gunKick * 0.18;
  viewGun.rotation.y = gunKick * 0.06;
}

function resolveMapCollision(nextX, nextZ, playerY) {
  const edge = mapHalfSize - PLAYER_RADIUS;
  const pos = {
    x: clamp(nextX, -edge, edge),
    z: clamp(nextZ, -edge, edge)
  };

  for (let iter = 0; iter < 3; iter += 1) {
    let fixed = false;

    for (const obs of obstacleColliders) {
      if (playerY > obs.height + 0.25) continue;

      const minX = obs.minX - PLAYER_RADIUS;
      const maxX = obs.maxX + PLAYER_RADIUS;
      const minZ = obs.minZ - PLAYER_RADIUS;
      const maxZ = obs.maxZ + PLAYER_RADIUS;

      if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
        fixed = true;

        const dLeft = Math.abs(pos.x - minX);
        const dRight = Math.abs(maxX - pos.x);
        const dTop = Math.abs(pos.z - minZ);
        const dBottom = Math.abs(maxZ - pos.z);
        const minDist = Math.min(dLeft, dRight, dTop, dBottom);

        if (minDist === dLeft) pos.x = minX;
        else if (minDist === dRight) pos.x = maxX;
        else if (minDist === dTop) pos.z = minZ;
        else pos.z = maxZ;
      }
    }

    if (!fixed) break;
  }

  return pos;
}

function spawnShotTracer({ fromId, origin, direction, hitId }) {
  if (!origin || !direction) return;

  const start = new THREE.Vector3(origin.x, origin.y, origin.z);
  const dir = new THREE.Vector3(direction.x, direction.y, direction.z);

  if (dir.lengthSq() < 1e-6) return;
  dir.normalize();

  const end = start.clone().addScaledVector(dir, SHOT_RANGE);
  if (hitId && players.has(hitId)) {
    const target = players.get(hitId);
    end.set(target.model.position.x, target.model.position.y + 1.15, target.model.position.z);
  }

  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineBasicMaterial({
    color: fromId === myId ? 0xfff59b : 0xff8b66,
    transparent: true,
    opacity: 0.9
  });

  const line = new THREE.Line(geometry, material);
  scene.add(line);

  setTimeout(() => {
    scene.remove(line);
    geometry.dispose();
    material.dispose();
  }, 80);
}

function tryShoot() {
  if (!myPlayer || myPlayer.health <= 0) return;

  const now = performance.now();
  if (now - lastShotAt < SHOT_COOLDOWN_MS) return;
  lastShotAt = now;

  gunKick = 1;
  sound.playShoot(true);

  const origin = {
    x: myPlayer.model.position.x,
    y: myPlayer.model.position.y + 1.55,
    z: myPlayer.model.position.z
  };

  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);

  spawnShotTracer({
    fromId: myId,
    origin,
    direction: { x: direction.x, y: direction.y, z: direction.z },
    hitId: null
  });

  network.emit('shoot', {
    direction: {
      x: direction.x,
      y: direction.y,
      z: direction.z
    }
  });
}

function addPlayer(p) {
  if (players.has(p.id)) return players.get(p.id);

  const model = playerFactory.createPlayerModel(p.name, p.color || '#4aa3ff');
  model.position.set(p.position?.x || 0, p.position?.y || 0, p.position?.z || 0);
  model.rotation.y = p.rotation || 0;

  scene.add(model);
  players.set(p.id, {
    id: p.id,
    name: p.name,
    model,
    health: typeof p.health === 'number' ? p.health : 100,
    targetPosition: new THREE.Vector3(model.position.x, model.position.y, model.position.z),
    targetRotation: model.rotation.y,
    moving: false
  });

  return players.get(p.id);
}

function removePlayer(id) {
  const p = players.get(id);
  if (!p) return;

  scene.remove(p.model);
  players.delete(id);
}

renderer.domElement.addEventListener('click', () => {
  void sound.unlock();

  if (!myPlayer) return;
  if (document.activeElement === chatInputEl) return;

  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});

document.addEventListener('mousemove', (e) => {
  if (!myPlayer) return;
  if (document.pointerLockElement !== renderer.domElement) return;

  yaw -= e.movementX * MOUSE_SENSITIVITY;
  pitch -= e.movementY * MOUSE_SENSITIVITY;
  pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
});

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  void sound.unlock();

  if (!myPlayer) return;
  if (document.activeElement === chatInputEl) return;
  if (document.pointerLockElement !== renderer.domElement) return;

  tryShoot();
});

window.addEventListener('keydown', (e) => {
  void sound.unlock();

  if (!myPlayer) return;
  if (e.key !== 'Enter') return;

  if (document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
    setTimeout(() => chatInputEl.focus(), 0);
  }
});

loginUI.setOnSubmit((name) => {
  myName = name;
  network.emit('join', { name });
});

network.on('joinError', ({ message }) => {
  loginUI.showError(message || '加入失败');
});

network.on('joinSuccess', ({ id, players: serverPlayers }) => {
  myId = id;
  loginUI.hide();

  for (const p of serverPlayers) {
    addPlayer(p);
  }

  myPlayer = players.get(myId);
  if (myPlayer) {
    yaw = myPlayer.model.rotation.y;
    pitch = 0;
    verticalVelocity = 0;
    isGrounded = myPlayer.model.position.y <= GROUND_Y + 0.001;

    // 第一人称时隐藏本地模型，避免挡住视角
    myPlayer.model.visible = false;

    updateMyHealthUI(myPlayer.health);
    setStatusText('点击场景锁定鼠标后可射击', 2500);
    sound.playRespawn();

    chatUI.appendMessage({
      name: '系统',
      message: `欢迎 ${myName}，WASD 移动，Shift 冲刺，Space 跳跃，左键射击。`,
      time: Date.now()
    });
  }
});

network.on('playerJoined', (p) => {
  addPlayer(p);
  sound.playJoin();
  chatUI.appendMessage({
    name: '系统',
    message: `${p.name} 加入了游戏`,
    time: Date.now()
  });
});

network.on('playerMoved', ({ id, position, rotation }) => {
  const p = players.get(id);
  if (!p) return;
  p.targetPosition.set(position.x, position.y, position.z);
  p.targetRotation = rotation;
});

network.on('playerHealth', ({ id, health }) => {
  const p = players.get(id);
  if (!p) return;

  const prevHealth = p.health;

  p.health = health;

  if (id === myId) {
    updateMyHealthUI(health);

    if (typeof prevHealth === 'number' && health < prevHealth && health > 0) {
      sound.playDamage();
    }

    if (typeof prevHealth === 'number' && prevHealth > 0 && health <= 0) {
      sound.playDeath();
    }
  }
});

network.on('playerRespawned', ({ id, position, rotation, health }) => {
  const p = players.get(id);
  if (!p) return;

  p.model.position.set(position.x, position.y, position.z);
  p.targetPosition.set(position.x, position.y, position.z);
  p.model.rotation.y = rotation || 0;
  p.targetRotation = rotation || 0;
  p.health = typeof health === 'number' ? health : 100;

  if (id === myId) {
    verticalVelocity = 0;
    isGrounded = true;
    updateMyHealthUI(p.health);
    setStatusText('你已复活', 1200);
    sound.playRespawn();
  }
});

network.on('shotFired', (data) => {
  if (data.fromId !== myId) {
    spawnShotTracer(data);
  }

  if (data.hitId === myId && data.fromId !== myId) {
    sound.playShoot(false);
    flashDamage();
    return;
  }

  if (data.fromId === myId && data.hitId && data.hitId !== myId) {
    sound.playHitConfirm();
    return;
  }

  if (data.fromId !== myId) sound.playShoot(false);
});

network.on('playerLeft', ({ id }) => {
  const p = players.get(id);
  if (p) {
    chatUI.appendMessage({
      name: '系统',
      message: `${p.name} 离开了游戏`,
      time: Date.now()
    });
  }
  removePlayer(id);
});

chatUI.onSend((message) => {
  network.emit('chat', { message });
});

network.on('chat', ({ id, name, message, time }) => {
  chatUI.appendMessage({ name, message, time });
  const p = players.get(id);
  if (p) {
    playerFactory.showChatBubble(p.model, message, 3000);
  }

  if (id !== myId && id !== 'system') {
    sound.playChat();
  }
});

const clock = new THREE.Clock();
let lastSync = 0;

function updateMyPlayer(delta, elapsed) {
  if (!myPlayer) return;

  const dead = myPlayer.health <= 0;
  const isTypingChat = document.activeElement === chatInputEl;
  const move =
    isTypingChat || dead
      ? { x: 0, z: 0, moving: false, sprinting: false }
      : input.getMoveVector();

  if (!isTypingChat && !dead && input.consumeJumpPress() && isGrounded) {
    verticalVelocity = JUMP_VELOCITY;
    isGrounded = false;
    sound.playJump();
  }

  myPlayer.model.rotation.y = yaw;

  let nextX = myPlayer.model.position.x;
  let nextZ = myPlayer.model.position.z;

  if (move.moving) {
    const rightInput = move.x;
    const forwardInput = move.z;

    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);

    const worldX = cosYaw * rightInput + sinYaw * forwardInput;
    const worldZ = -sinYaw * rightInput + cosYaw * forwardInput;

    const currentSpeed = BASE_MOVE_SPEED * (move.sprinting ? SPRINT_MULTIPLIER : 1);
    nextX += worldX * currentSpeed * delta;
    nextZ += worldZ * currentSpeed * delta;
  }

  const resolved = resolveMapCollision(nextX, nextZ, myPlayer.model.position.y);
  myPlayer.model.position.x = resolved.x;
  myPlayer.model.position.z = resolved.z;

  verticalVelocity -= GRAVITY * delta;
  myPlayer.model.position.y += verticalVelocity * delta;

  if (myPlayer.model.position.y <= GROUND_Y) {
    myPlayer.model.position.y = GROUND_Y;
    verticalVelocity = 0;
    isGrounded = true;
  }

  const isWalking = move.moving && isGrounded && !dead;
  myPlayer.moving = isWalking;
  playerFactory.animateWalk(myPlayer.model, isWalking, delta);

  camera.position.set(
    myPlayer.model.position.x,
    myPlayer.model.position.y + 1.65,
    myPlayer.model.position.z
  );
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  if (!dead && elapsed - lastSync > 1 / 15) {
    lastSync = elapsed;
    network.emit('playerMoved', {
      position: {
        x: myPlayer.model.position.x,
        y: myPlayer.model.position.y,
        z: myPlayer.model.position.z
      },
      rotation: myPlayer.model.rotation.y
    });
  }
}

function updateRemotePlayers(delta) {
  for (const [id, p] of players.entries()) {
    if (id === myId) continue;

    const beforeX = p.model.position.x;
    const beforeZ = p.model.position.z;

    p.model.position.lerp(p.targetPosition, Math.min(1, delta * 8));
    p.model.rotation.y += (p.targetRotation - p.model.rotation.y) * Math.min(1, delta * 10);

    const movedDist = Math.hypot(p.model.position.x - beforeX, p.model.position.z - beforeZ);
    const moving = p.health > 0 && movedDist > 0.0005;
    playerFactory.animateWalk(p.model, moving, delta);
  }
}

function loop() {
  requestAnimationFrame(loop);
  const delta = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.getElapsedTime();

  updateMyPlayer(delta, elapsed);
  updateRemotePlayers(delta);
  updateViewGun(delta, elapsed);
  render();
}

loop();
