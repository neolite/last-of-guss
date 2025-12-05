# The Last of Guss

Мультиплеерный FPS в духе F.E.A.R. с real-time боевой системой на основе projectile-based механики. Игроки сражаются друг с другом, стреляя плазменными файерболами в атмосферных локациях.

> Раньше была tapping game про гуся - теперь это полноценный multiplayer FPS с WebSocket networking и server-authoritative combat.

## Быстрый старт (Docker)

```bash
docker compose up --build
```

Приложение будет доступно на http://localhost:8080

Для масштабирования бекенда:
```bash
docker compose up --build --scale backend=3
```

## Как играть

1. Открыть http://localhost:5173 (или http://localhost:8080 в Docker)
2. Перейти на `/game` для FPS режима
3. Управление:
   - **WASD** - движение
   - **Мышь** - осмотр
   - **Left Click** - стрельба (файерболы)
   - **R** - перезарядка
4. Кликните по canvas для захвата мыши (Pointer Lock)
5. Стреляйте по противникам и следите за килами/смертями в HUD

### Игровые режимы

- **FPS Deathmatch** (`/game`) - мультиплеерный PvP с файерболами
- **Legacy Tapping Game** (`/`) - старая версия игры про гуся (сохранена для истории)

## Локальная разработка

### Требования
- Node.js 20+
- PostgreSQL 15+

### 1. База данных

```sql
CREATE DATABASE last_of_guss;
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env

# Применить схему к БД
npm run db:push

# Запуск в dev режиме
npm run dev
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

## Конфигурация (.env)

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/last_of_guss
JWT_SECRET=your-secret-key
ROUND_DURATION=60      # длительность раунда в секундах
COOLDOWN_DURATION=30   # время до старта раунда (cooldown)
PORT=3000
```

## Игровая механика (FPS)

### Combat System
- **Server-Authoritative Projectiles** - файерболы это реальные летящие снаряды, а не instant hitscan
- **Projectile Speed**: 25 units/sec (достаточно быстро для responsive combat)
- **Damage**: 25 HP per hit (4 попадания = kill при 100 HP)
- **Collision Detection**: Sphere-capsule collision между projectile и игроком
- **Lifetime**: 5 секунд до исчезновения
- **Ammo**: 30 патронов, 2 секунды перезарядка

### Networking
- **Client-Authoritative Movement** - клиент владеет своей позицией, сервер делает sanity checks
- **Server-Authoritative Combat** - все попадания, damage, kills только на сервере
- **Snapshot Rate**: 30Hz (33ms per tick)
- **Interpolation**: Удалённые игроки интерполируются с задержкой 50ms для плавности
- **Projectile Sync**: Все игроки видят одинаковые летящие файерболы через snapshot

### Legacy Tapping Game
- 1 тап = 1 очко
- Каждый 11-й тап = 10 очков (бонус)
- Тапать можно только во время активного раунда
- Побеждает игрок с максимальным количеством очков

## API Endpoints

### REST API (Legacy)
| Метод | URL | Описание | Доступ |
|-------|-----|----------|--------|
| POST | /auth/login | Логин/регистрация | all |
| POST | /auth/logout | Выход | auth |
| GET | /auth/me | Текущий пользователь | auth |
| GET | /rounds | Список раундов | auth |
| POST | /rounds | Создать раунд | admin |
| GET | /rounds/:id | Детали раунда (winner, myScore) | auth |
| POST | /rounds/:id/tap | Тап по гусю | auth |

### WebSocket (FPS Game)
**Endpoint**: `ws://localhost:3000/ws/game`

**Client → Server:**
- `position_batch` - батч позиций игрока (30Hz)
- `fire` - команда стрельбы (rayOrigin, rayDir, weaponId)

**Server → Client:**
- `welcome` - приветствие с playerId
- `snapshot` - состояние игры (30Hz): players[], projectiles[]
- `player_join` / `player_leave` - подключение/отключение игрока
- `damage` - событие урона (victimId, attackerId, damage)
- `death` - событие смерти (victimId, killerId, weaponId)
- `respawn` - респавн игрока (playerId, position)

## Архитектура

```
┌─────────────────────────────────────────┐
│  Browser (Frontend)                     │
│  ┌─────────────────────────────────┐   │
│  │ React Router                     │   │
│  │ ├─ / → Legacy Tapping Game      │   │
│  │ └─ /game → FPS (Three.js)       │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ GameEngine (Three.js)            │   │
│  │ - LocalPlayer (prediction)       │   │
│  │ - RemotePlayers (interpolation)  │   │
│  │ - Fireball Pool (sync w/server) │   │
│  └─────────────────────────────────┘   │
└───────┬─────────────────────┬───────────┘
        │ HTTPS (REST)        │ WebSocket
        ▼                     ▼
┌─────────────┐     ┌──────────────────┐
│   Nginx     │────▶│  Backend x3      │
│  (static)   │     │  - REST API      │
│             │     │  - WebSocket     │──▶ PostgreSQL
│             │     │  - Game Sessions │
└─────────────┘     └──────────────────┘
```

### Tech Stack
- **Backend**: Fastify + @fastify/websocket + Drizzle ORM + PostgreSQL
- **Frontend**: React + Vite + Three.js + React Router + Zustand
- **Auth**: JWT в httpOnly cookie
- **Game Loop**: 30Hz server tick (setInterval)
- **Rendering**: 60fps client (requestAnimationFrame)

### Networking Model
- **Movement**: Client-Authoritative (trust client position with sanity checks)
- **Combat**: Server-Authoritative (all damage/kills on server)
- **Projectiles**: Server creates/simulates, clients render synchronized copies
- **Interpolation**: Remote players rendered 50ms in past for smoothness

## Защита от Race Conditions

При тапе несколько пользователей могут одновременно отправить запросы. Решение:

### 1. Атомарный upsert (INSERT ... ON CONFLICT)

```sql
INSERT INTO player_rounds (id, round_id, user_id, taps, score)
VALUES (gen_random_uuid(), $1, $2, 1, 1)
ON CONFLICT (user_id, round_id) DO UPDATE SET
  taps = player_rounds.taps + 1,
  score = player_rounds.score + CASE 
    WHEN (player_rounds.taps + 1) % 11 = 0 THEN 10 
    ELSE 1 
  END
RETURNING taps, score
```

- Если запись существует — UPDATE атомарно увеличивает счётчики
- Если не существует — INSERT создаёт с начальными значениями
- Два параллельных INSERT для одного юзера: один создаст, второй попадёт в ON CONFLICT

### 2. SELECT FOR UPDATE на раунд

```sql
SELECT id, start_at, end_at FROM rounds WHERE id = $1 FOR UPDATE
```

- Блокирует строку раунда на время транзакции
- Гарантирует что проверка активности и обновление total_score атомарны
- Параллельные запросы ждут освобождения блокировки

### 3. Транзакции

Весь процесс тапа обёрнут в `BEGIN ... COMMIT`:
1. Блокировка раунда (FOR UPDATE)
2. Проверка что раунд активен
3. Атомарный upsert player_rounds
4. Обновление total_score раунда
5. COMMIT

При любой ошибке — ROLLBACK, данные остаются консистентными.

---

## Projectile System (FPS Combat)

### Архитектура боевой системы

Игра использует **server-authoritative projectile-based** систему вместо традиционного instant hitscan:

#### Backend (GameSession.ts)

**Создание projectile при выстреле:**
```typescript
handleFireCommand(shooterId, cmd: FireCommand) {
  // Создаём серверный projectile
  const projectile: ServerProjectile = {
    id: `${sessionId}_${shooterId}_${counter++}`,
    ownerId: shooterId,
    position: cmd.rayOrigin,  // Стартовая позиция
    velocity: normalize(cmd.rayDir) * PROJECTILE_SPEED,
    createdAt: Date.now(),
    lifetime: 5.0  // seconds
  };
  this.projectiles.set(projectile.id, projectile);
}
```

**Симуляция projectiles (каждый tick 30Hz):**
```typescript
updateProjectiles(dt: number) {
  for (const proj of this.projectiles.values()) {
    // 1. Движение
    proj.position += proj.velocity * dt;
    proj.lifetime -= dt;

    // 2. Коллизия с игроками (sphere-capsule)
    for (const player of this.players.values()) {
      if (sphereCapsuleCollision(proj, player)) {
        player.health -= PROJECTILE_DAMAGE;
        this.projectiles.delete(proj.id);  // Удаляем после попадания
        break;
      }
    }

    // 3. Коллизия со стенами
    if (outOfBounds(proj.position)) {
      this.projectiles.delete(proj.id);
    }

    // 4. Lifetime expired
    if (proj.lifetime <= 0) {
      this.projectiles.delete(proj.id);
    }
  }
}
```

**Трансляция в snapshot:**
```typescript
broadcastSnapshot() {
  const snapshot: Snapshot = {
    tick: this.tick,
    players: [...],
    projectiles: Array.from(this.projectiles.values())  // Все активные снаряды
  };
  this.broadcast(snapshot);
}
```

#### Frontend (GameEngine.ts)

**Синхронизация с сервером:**
```typescript
syncProjectiles(serverProjectiles: ProjectileState[]) {
  // 1. Удаляем fireballs которых нет на сервере
  for (const fb of this.activeFireballs) {
    if (!serverProjectiles.find(p => p.id === fb.id)) {
      this.returnFireball(fb);  // Вернуть в pool
    }
  }

  // 2. Создаём/обновляем fireballs из server projectiles
  for (const serverProj of serverProjectiles) {
    let fb = this.fireballPool.find(f => f.id === serverProj.id);

    if (!fb) {
      fb = this.getFireball();  // Взять из pool
      fb.id = serverProj.id;
    }

    // Синхронизируем позицию с сервера
    fb.group.position.copy(serverProj.position);
    fb.velocity.copy(serverProj.velocity);
    fb.lifetime = serverProj.lifetime;
  }
}
```

### Почему projectiles, а не hitscan?

**Проблема hitscan:**
- Клиент видит мгновенное попадание, но файербол только начал лететь
- Визуальный диссонанс: hitmarker появляется раньше чем файербол долетел
- Невозможно показать другим игрокам летящий снаряд

**Решение projectiles:**
- ✅ Все игроки видят одинаковые летящие файерболы
- ✅ Damage считается когда projectile **реально** попадает в цель
- ✅ Multiplayer-synchronized: один снаряд = одна сущность на сервере
- ✅ Физичность: можно добавить gravity, homing, bounce и т.д.

### Performance Optimization

**Object Pooling (Frontend):**
```typescript
// 20 pre-allocated fireballs (reused)
private fireballPool: Array<{
  id: string | null,
  group: THREE.Group,
  active: boolean,
  // ...
}> = [];

getFireball() {
  return this.fireballPool.find(fb => !fb.active);
}

returnFireball(fb) {
  fb.active = false;
  fb.id = null;
  fb.group.visible = false;
}
```

**Эффективность:**
- Нет аллокаций Three.js объектов во время игры
- Всего 20 fireballs максимум на экране
- Reuse вместо create/destroy

### Collision Detection

**Sphere-Capsule Test:**
```typescript
// Projectile = sphere (radius 0.5)
// Player = capsule (radius 0.4, height 1.8)

distanceToPlayerCapsule(point: Vec3, playerPos: Vec3, height: number): number {
  const capsuleAxis = { y: height };
  const projection = clamp(dot(point - playerPos, capsuleAxis) / height, 0, 1);
  const closestPoint = playerPos + capsuleAxis * projection;
  return distance(point, closestPoint);
}

// Collision if distance < (projectileRadius + playerRadius)
```

**Коллизия со стенами:**
```typescript
// Simple AABB bounds check
if (proj.x < -7.5 || proj.x > 7.5 ||
    proj.y < 0 || proj.y > 5 ||
    proj.z < -21.5 || proj.z > 21.5) {
  // Hit wall - remove projectile
}
```

### Константы

```typescript
// Backend
PROJECTILE_SPEED = 25          // units/sec (быстро но не instant)
PROJECTILE_LIFETIME = 5         // seconds
PROJECTILE_HITBOX_RADIUS = 0.5  // collision radius
PROJECTILE_DAMAGE = 25          // 4 shots to kill (100 HP)

// Frontend
FIREBALL_POOL_SIZE = 20  // max simultaneous projectiles
```
