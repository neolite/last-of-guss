import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { api, type Round } from "../api/client";

export function RoundsListPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const fetchRounds = async () => {
    try {
      const data = await api.getRounds();
      setRounds(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRounds();
  }, []);

  const handleCreateRound = async () => {
    try {
      const round = await api.createRound();
      navigate(`/rounds/${round.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("ru-RU");
  };

  const getStatusLabel = (status: Round["status"]) => {
    switch (status) {
      case "active":
        return "Активен";
      case "cooldown":
        return "Cooldown";
      case "finished":
        return "Завершён";
    }
  };

  const getStatusColor = (status: Round["status"]) => {
    switch (status) {
      case "active":
        return "#4caf50";
      case "cooldown":
        return "#ff9800";
      case "finished":
        return "#9e9e9e";
    }
  };

  if (isLoading) {
    return <div style={styles.container}>Загрузка...</div>;
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Список РАУНДОВ</h1>
        <div style={styles.userInfo}>
          <span>{user?.username}</span>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            Выйти
          </button>
        </div>
      </header>

      {user?.role === "admin" && (
        <button onClick={handleCreateRound} style={styles.createBtn}>
          Создать раунд
        </button>
      )}

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.list}>
        {rounds.length === 0 ? (
          <p style={styles.empty}>Нет активных или запланированных раундов</p>
        ) : (
          rounds.map((round) => (
            <Link
              key={round.id}
              to={`/rounds/${round.id}`}
              style={styles.card}
            >
              <div style={styles.cardHeader}>
                <span style={styles.roundId}>Round ID: {round.id}</span>
              </div>
              <div style={styles.cardBody}>
                <p>Start: {formatDate(round.startAt)}</p>
                <p>End: {formatDate(round.endAt)}</p>
              </div>
              <div style={styles.cardFooter}>
                <span
                  style={{ ...styles.status, color: getStatusColor(round.status) }}
                >
                  Статус: {getStatusLabel(round.status)}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#1a1a1a",
    color: "#fff",
    padding: "2rem",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "2rem",
  },
  title: {
    margin: 0,
    fontSize: "1.5rem",
  },
  userInfo: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
  },
  logoutBtn: {
    padding: "0.5rem 1rem",
    backgroundColor: "transparent",
    border: "1px solid #666",
    color: "#fff",
    borderRadius: "4px",
    cursor: "pointer",
  },
  createBtn: {
    padding: "0.75rem 1.5rem",
    backgroundColor: "#4a9eff",
    border: "none",
    color: "#fff",
    borderRadius: "4px",
    cursor: "pointer",
    marginBottom: "2rem",
    fontSize: "1rem",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  card: {
    backgroundColor: "#2a2a2a",
    border: "1px solid #444",
    borderRadius: "8px",
    padding: "1.5rem",
    textDecoration: "none",
    color: "#fff",
    transition: "border-color 0.2s",
  },
  cardHeader: {
    marginBottom: "1rem",
  },
  roundId: {
    fontSize: "0.9rem",
    color: "#4a9eff",
  },
  cardBody: {
    fontSize: "0.9rem",
    color: "#aaa",
    marginBottom: "1rem",
  },
  cardFooter: {
    borderTop: "1px solid #444",
    paddingTop: "1rem",
  },
  status: {
    fontWeight: "bold",
  },
  error: {
    color: "#ff6b6b",
    marginBottom: "1rem",
  },
  empty: {
    color: "#666",
    textAlign: "center",
    padding: "2rem",
  },
};
