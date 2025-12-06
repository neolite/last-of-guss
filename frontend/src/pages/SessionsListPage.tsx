import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, type GameSession } from "../api/client";

export function SessionsListPage() {
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string>("");
  const [showNameInput, setShowNameInput] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  const fetchSessions = async () => {
    try {
      const data = await api.getSessions();
      setSessions(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (showNameInput) return; // Don't fetch if name input is shown

    fetchSessions();
    // Poll every 2 seconds to detect new sessions
    const interval = setInterval(fetchSessions, 2000);
    return () => clearInterval(interval);
  }, [showNameInput]);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (playerName.trim().length === 0) {
      setError("Введите имя");
      return;
    }
    // Store name in sessionStorage
    sessionStorage.setItem("playerName", playerName.trim());
    setShowNameInput(false);
  };

  const handleCreateSession = async () => {
    setIsCreating(true);
    setError(null);

    try {
      // Create session with auto-generated name
      const session = await api.createSession();
      // Join the session
      await api.joinSession(session.id);
      // Navigate to game with session ID
      navigate(`/game?session=${session.id}`);
    } catch (err) {
      setError((err as Error).message);
      setIsCreating(false);
    }
  };

  const handleJoinSession = async (sessionId: string) => {
    try {
      await api.joinSession(sessionId);
      navigate(`/game?session=${sessionId}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const getStatusLabel = (status: GameSession["status"]) => {
    switch (status) {
      case "waiting":
        return "Ожидание игроков";
      case "countdown":
        return "Обратный отсчёт";
      case "active":
        return "Идёт игра";
      case "finished":
        return "Завершено";
    }
  };

  const getStatusColor = (status: GameSession["status"]) => {
    switch (status) {
      case "waiting":
        return "#ff9800";
      case "countdown":
        return "#ffeb3b";
      case "active":
        return "#4caf50";
      case "finished":
        return "#9e9e9e";
    }
  };

  // Show name input screen
  if (showNameInput) {
    return (
      <div style={styles.container}>
        <div style={styles.nameInputCard}>
          <h1 style={styles.title}>Last of Guss</h1>
          <p style={styles.subtitle}>Multiplayer FPS Deathmatch</p>
          <form onSubmit={handleNameSubmit} style={styles.nameForm}>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Введите ваше имя"
              style={styles.nameInput}
              autoFocus
              maxLength={20}
            />
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" style={styles.playBtn}>
              ИГРАТЬ
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div style={styles.container}>Загрузка...</div>;
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Игровые сессии</h1>
          <p style={styles.playerName}>Игрок: {sessionStorage.getItem("playerName")}</p>
        </div>
        <button
          onClick={handleCreateSession}
          style={styles.createBtn}
          disabled={isCreating}
        >
          {isCreating ? "Создаётся..." : "Создать игру"}
        </button>
      </header>

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.list}>
        {sessions.length === 0 ? (
          <p style={styles.empty}>Нет активных сессий. Создайте новую!</p>
        ) : (
          sessions.map((session) => (
            <div key={session.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <span style={styles.sessionName}>{session.name}</span>
                <span
                  style={{ ...styles.status, color: getStatusColor(session.status) }}
                >
                  {getStatusLabel(session.status)}
                </span>
              </div>
              <div style={styles.cardBody}>
                <p>Игроков: {session.currentPlayers} / {session.maxPlayers}</p>
              </div>
              <div style={styles.cardFooter}>
                {(session.status === "waiting" || session.status === "countdown") &&
                  session.currentPlayers < session.maxPlayers && (
                    <button
                      onClick={() => handleJoinSession(session.id)}
                      style={styles.joinBtn}
                    >
                      Присоединиться
                    </button>
                  )}
                {session.status === "active" && (
                  <span style={{ color: "#999" }}>Идёт игра...</span>
                )}
                {session.status === "finished" && (
                  <span style={{ color: "#666" }}>Игра завершена</span>
                )}
                {session.currentPlayers >= session.maxPlayers &&
                  session.status === "waiting" && (
                    <span style={{ color: "#f44336" }}>Сессия заполнена</span>
                  )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#0a0a0a",
    color: "#fff",
    padding: "2rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  nameInputCard: {
    backgroundColor: "#1a1a1a",
    border: "2px solid #333",
    borderRadius: "12px",
    padding: "3rem",
    maxWidth: "400px",
    width: "100%",
    marginTop: "10vh",
    textAlign: "center",
  },
  nameForm: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    marginTop: "2rem",
  },
  nameInput: {
    padding: "1rem",
    backgroundColor: "#2a2a2a",
    border: "1px solid #444",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "1rem",
  },
  playBtn: {
    padding: "1rem 2rem",
    backgroundColor: "#4caf50",
    border: "none",
    color: "#fff",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "1.2rem",
    fontWeight: "bold",
    transition: "background-color 0.2s",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "2rem",
    width: "100%",
    maxWidth: "800px",
  },
  title: {
    margin: 0,
    fontSize: "2rem",
    background: "linear-gradient(45deg, #4a9eff, #9c27b0)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: {
    color: "#666",
    margin: "0.5rem 0 0 0",
  },
  playerName: {
    color: "#4a9eff",
    margin: "0.5rem 0 0 0",
    fontSize: "0.9rem",
  },
  createBtn: {
    padding: "0.75rem 1.5rem",
    backgroundColor: "#4a9eff",
    border: "none",
    color: "#fff",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "1rem",
    transition: "background-color 0.2s",
  },
  createForm: {
    display: "flex",
    gap: "1rem",
    marginBottom: "2rem",
    width: "100%",
    maxWidth: "800px",
  },
  submitBtn: {
    padding: "1rem 1.5rem",
    backgroundColor: "#4caf50",
    border: "none",
    color: "#fff",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "1rem",
    whiteSpace: "nowrap",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    width: "100%",
    maxWidth: "800px",
  },
  card: {
    backgroundColor: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: "12px",
    padding: "1.5rem",
    transition: "border-color 0.2s, transform 0.2s",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "1rem",
  },
  sessionName: {
    fontSize: "1.2rem",
    fontWeight: "bold",
    color: "#fff",
  },
  cardBody: {
    fontSize: "0.9rem",
    color: "#aaa",
    marginBottom: "1rem",
  },
  cardFooter: {
    borderTop: "1px solid #333",
    paddingTop: "1rem",
  },
  joinBtn: {
    padding: "0.75rem 1.5rem",
    backgroundColor: "#4caf50",
    border: "none",
    color: "#fff",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "1rem",
    transition: "background-color 0.2s",
  },
  status: {
    fontWeight: "bold",
    fontSize: "0.9rem",
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
