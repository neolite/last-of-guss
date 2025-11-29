# The Last of Guss

Браузерная игра где игроки соревнуются, кто быстрее и больше натапает по виртуальному гусю, подхватившему мутацию G-42.

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

1. Зайти как **admin** (пароль любой) → создать раунд
2. Открыть в другом браузере/вкладке
3. Зайти как **player1** (или любое имя кроме admin/nikita)
4. Ждать cooldown → тапать по гусю
5. Попробовать зайти как **никита** — тапы не считаются

### Тестовые аккаунты

| Username | Пароль | Роль | Описание |
|----------|--------|------|----------|
| `admin` | любой | admin | Создание раундов |
| `player1` | любой | survivor | Обычный игрок |
| `player2` | любой | survivor | Обычный игрок |
| `никита` | любой | nikita | Тапы = 0 (пасхалка) |

> При первом входе аккаунт создаётся автоматически с указанным паролем

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

## Правила игры

- 1 тап = 1 очко
- Каждый 11-й тап = 10 очков (бонус)
- Тапать можно только во время активного раунда
- Побеждает игрок с максимальным количеством очков

## API Endpoints

| Метод | URL | Описание | Доступ |
|-------|-----|----------|--------|
| POST | /auth/login | Логин/регистрация | all |
| POST | /auth/logout | Выход | auth |
| GET | /auth/me | Текущий пользователь | auth |
| GET | /rounds | Список раундов | auth |
| POST | /rounds | Создать раунд | admin |
| GET | /rounds/:id | Детали раунда (winner, myScore) | auth |
| POST | /rounds/:id/tap | Тап по гусю | auth |

## Архитектура

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Nginx     │────▶│  Backend x3 │────▶│  PostgreSQL │
│  (frontend) │     │  (stateless)│     │             │
└─────────────┘     └─────────────┘     └─────────────┘
```

- **Backend**: Fastify + Drizzle ORM + PostgreSQL
- **Frontend**: React + Vite + React Router + Zustand
- **Auth**: JWT в httpOnly cookie
- **Таймер**: requestAnimationFrame (обновление каждую секунду)

Проект поддерживает горизонтальное масштабирование — несколько инстансов бекенда работают с одной базой данных без привязки пользователя к конкретному инстансу.

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
