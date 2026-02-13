const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const clientOrigin = process.env.CLIENT_ORIGIN || '*';

const io = new Server(server, {
  cors: {
    origin: clientOrigin,
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

const MAP_HALF_SIZE = 22;
const PLAYER_RADIUS = 0.38;
const MAX_HEALTH = 100;
const SHOT_DAMAGE = 34;
const SHOT_RANGE = 36;
const SHOT_COOLDOWN_MS = 180;
const RESPAWN_DELAY_MS = 1200;

const OBSTACLES = [
  { x: -9, z: -7, w: 4.5, d: 4.5, h: 2.6 },
  { x: 8.5, z: -8, w: 3.8, d: 5.2, h: 2.9 },
  { x: -7, z: 8, w: 5.4, d: 2.6, h: 2.2 },
  { x: 8, z: 8, w: 4.4, d: 3.0, h: 2.0 },
  { x: 0, z: 0, w: 6.2, d: 2.4, h: 1.9 },
  { x: 0, z: -12, w: 8.5, d: 2.0, h: 1.7 }
];

const obstacleColliders = OBSTACLES.map((o) => ({
  ...o,
  minX: o.x - o.w / 2,
  maxX: o.x + o.w / 2,
  minY: 0,
  maxY: o.h,
  minZ: o.z - o.d / 2,
  maxZ: o.z + o.d / 2
}));

const SPAWN_POINTS = [
  { x: -15, z: -15 },
  { x: 15, z: 15 },
  { x: -15, z: 15 },
  { x: 15, z: -15 },
  { x: 0, z: 15 },
  { x: 0, z: -15 }
];

app.use(express.static(path.join(__dirname, 'public')));

const players = new Map();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isNameTaken(name) {
  const normalized = String(name).trim().toLowerCase();
  for (const p of players.values()) {
    if (String(p.name).trim().toLowerCase() === normalized) {
      return true;
    }
  }
  return false;
}

function randomColorHex() {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 65;
  const lightness = 55;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function normalizeDirection(direction) {
  if (
    !direction ||
    typeof direction.x !== 'number' ||
    typeof direction.y !== 'number' ||
    typeof direction.z !== 'number'
  ) {
    return null;
  }

  if (![direction.x, direction.y, direction.z].every(Number.isFinite)) {
    return null;
  }

  const len = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(len) || len < 1e-4) return null;

  return {
    x: direction.x / len,
    y: direction.y / len,
    z: direction.z / len
  };
}

function isPointBlocked(x, z, radius = PLAYER_RADIUS) {
  for (const obs of obstacleColliders) {
    if (
      x > obs.minX - radius &&
      x < obs.maxX + radius &&
      z > obs.minZ - radius &&
      z < obs.maxZ + radius
    ) {
      return true;
    }
  }
  return false;
}

function getSpawnPosition() {
  const shuffled = [...SPAWN_POINTS].sort(() => Math.random() - 0.5);

  for (const p of shuffled) {
    if (!isPointBlocked(p.x, p.z, PLAYER_RADIUS + 0.2)) {
      return { x: p.x, y: 0, z: p.z };
    }
  }

  for (let i = 0; i < 30; i += 1) {
    const x = (Math.random() * 2 - 1) * (MAP_HALF_SIZE - 2);
    const z = (Math.random() * 2 - 1) * (MAP_HALF_SIZE - 2);
    if (!isPointBlocked(x, z, PLAYER_RADIUS + 0.2)) {
      return { x, y: 0, z };
    }
  }

  return { x: 0, y: 0, z: 0 };
}

function resolveHorizontalCollision(x, z, y) {
  const edge = MAP_HALF_SIZE - PLAYER_RADIUS;
  const pos = {
    x: clamp(x, -edge, edge),
    z: clamp(z, -edge, edge)
  };

  for (let iter = 0; iter < 3; iter += 1) {
    let fixed = false;

    for (const obs of obstacleColliders) {
      if (y > obs.h + 0.25) continue;

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

function sanitizePosition(position) {
  if (
    !position ||
    typeof position.x !== 'number' ||
    typeof position.y !== 'number' ||
    typeof position.z !== 'number'
  ) {
    return null;
  }

  if (![position.x, position.y, position.z].every(Number.isFinite)) {
    return null;
  }

  const y = clamp(position.y, 0, 8);
  const horizontal = resolveHorizontalCollision(position.x, position.z, y);

  return {
    x: horizontal.x,
    y,
    z: horizontal.z
  };
}

function raySphereDistance(origin, direction, center, radius) {
  const ocX = origin.x - center.x;
  const ocY = origin.y - center.y;
  const ocZ = origin.z - center.z;

  const b = ocX * direction.x + ocY * direction.y + ocZ * direction.z;
  const c = ocX * ocX + ocY * ocY + ocZ * ocZ - radius * radius;
  const h = b * b - c;

  if (h < 0) return Infinity;

  const sqrtH = Math.sqrt(h);
  const t1 = -b - sqrtH;
  const t2 = -b + sqrtH;

  if (t1 >= 0) return t1;
  if (t2 >= 0) return t2;
  return Infinity;
}

function rayAabbDistance(origin, direction, box) {
  let tMin = -Infinity;
  let tMax = Infinity;

  const axes = [
    ['x', box.minX, box.maxX],
    ['y', box.minY, box.maxY],
    ['z', box.minZ, box.maxZ]
  ];

  for (const [axis, min, max] of axes) {
    const o = origin[axis];
    const d = direction[axis];

    if (Math.abs(d) < 1e-8) {
      if (o < min || o > max) return Infinity;
      continue;
    }

    let t1 = (min - o) / d;
    let t2 = (max - o) / d;

    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }

    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);

    if (tMin > tMax) return Infinity;
  }

  if (tMax < 0) return Infinity;
  return tMin >= 0 ? tMin : tMax;
}

function serializePlayer(player) {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    position: player.position,
    rotation: player.rotation,
    health: player.health
  };
}

function respawnPlayer(playerId) {
  const player = players.get(playerId);
  if (!player || player.health > 0) return;

  const spawn = getSpawnPosition();
  player.position = spawn;
  player.rotation = 0;
  player.health = MAX_HEALTH;

  io.emit('playerRespawned', {
    id: player.id,
    position: player.position,
    rotation: player.rotation,
    health: player.health
  });

  io.emit('playerHealth', {
    id: player.id,
    health: player.health
  });
}

io.on('connection', (socket) => {
  socket.on('join', ({ name }) => {
    const safeName = String(name || '').trim().slice(0, 20);

    if (!safeName) {
      socket.emit('joinError', { message: '名字不能为空' });
      return;
    }

    if (isNameTaken(safeName)) {
      socket.emit('joinError', { message: '名字已被占用，请换一个' });
      return;
    }

    const player = {
      id: socket.id,
      name: safeName,
      color: randomColorHex(),
      position: getSpawnPosition(),
      rotation: 0,
      health: MAX_HEALTH,
      lastShotAt: 0,
      respawnTimer: null
    };

    players.set(socket.id, player);

    socket.emit('joinSuccess', {
      id: socket.id,
      players: Array.from(players.values(), serializePlayer)
    });

    socket.broadcast.emit('playerJoined', serializePlayer(player));
  });

  socket.on('playerMoved', ({ position, rotation }) => {
    const player = players.get(socket.id);
    if (!player || player.health <= 0) return;

    const safePosition = sanitizePosition(position);
    if (!safePosition) return;

    player.position = safePosition;
    if (typeof rotation === 'number' && Number.isFinite(rotation)) {
      player.rotation = rotation;
    }

    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      position: player.position,
      rotation: player.rotation
    });
  });

  socket.on('shoot', ({ direction }) => {
    const shooter = players.get(socket.id);
    if (!shooter || shooter.health <= 0) return;

    const now = Date.now();
    if (now - shooter.lastShotAt < SHOT_COOLDOWN_MS) {
      return;
    }
    shooter.lastShotAt = now;

    const dir = normalizeDirection(direction);
    if (!dir) return;

    const origin = {
      x: shooter.position.x,
      y: shooter.position.y + 1.55,
      z: shooter.position.z
    };

    let nearestObstacleDist = SHOT_RANGE;
    for (const obs of obstacleColliders) {
      const dist = rayAabbDistance(origin, dir, obs);
      if (dist < nearestObstacleDist) {
        nearestObstacleDist = dist;
      }
    }

    let target = null;
    let nearestTargetDist = Infinity;

    for (const candidate of players.values()) {
      if (candidate.id === shooter.id || candidate.health <= 0) continue;

      const targetCenter = {
        x: candidate.position.x,
        y: candidate.position.y + 1.15,
        z: candidate.position.z
      };

      const dist = raySphereDistance(origin, dir, targetCenter, 0.75);
      if (dist < nearestTargetDist) {
        nearestTargetDist = dist;
        target = candidate;
      }
    }

    let hitId = null;

    if (
      target &&
      nearestTargetDist <= SHOT_RANGE &&
      nearestTargetDist <= nearestObstacleDist
    ) {
      hitId = target.id;
      target.health = Math.max(0, target.health - SHOT_DAMAGE);

      io.emit('playerHealth', {
        id: target.id,
        health: target.health
      });

      if (target.health <= 0) {
        io.emit('chat', {
          id: 'system',
          name: '系统',
          message: `${shooter.name} 击败了 ${target.name}`,
          time: Date.now()
        });

        if (!target.respawnTimer) {
          target.respawnTimer = setTimeout(() => {
            target.respawnTimer = null;
            respawnPlayer(target.id);
          }, RESPAWN_DELAY_MS);
        }
      }
    }

    io.emit('shotFired', {
      fromId: shooter.id,
      origin,
      direction: dir,
      hitId
    });
  });

  socket.on('chat', ({ message }) => {
    const player = players.get(socket.id);
    if (!player) return;

    const safeMessage = String(message || '').trim().slice(0, 120);
    if (!safeMessage) return;

    io.emit('chat', {
      id: socket.id,
      name: player.name,
      message: safeMessage,
      time: Date.now()
    });
  });

  socket.on('disconnect', () => {
    const existed = players.get(socket.id);
    if (!existed) return;

    if (existed.respawnTimer) {
      clearTimeout(existed.respawnTimer);
      existed.respawnTimer = null;
    }

    players.delete(socket.id);
    socket.broadcast.emit('playerLeft', { id: socket.id });
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
