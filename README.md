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

## Роли пользователей

Роль назначается автоматически при регистрации по username:

| Username | Роль | Возможности |
|----------|------|-------------|
| `admin` | admin | Создание раундов |
| `никита` / `nikita` | nikita | Тапы не считаются (нули в статистике) |
| любой другой | survivor | Обычный игрок |

## Как играть

1. Зайти под `admin` → создать раунд
2. Зайти под другими пользователями → ждать cooldown
3. Когда раунд активен → тапать по гусю
4. После завершения → смотреть победителя

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
| GET | /rounds/:id | Детали раунда | auth |
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
- **Race conditions**: PostgreSQL транзакции с `SELECT FOR UPDATE`

Проект поддерживает горизонтальное масштабирование — несколько инстансов бекенда работают с одной базой данных без привязки пользователя к конкретному инстансу.
