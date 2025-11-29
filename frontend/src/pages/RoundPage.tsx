import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { api, type RoundDetails } from "../api/client";
import { useTimer } from "../hooks/useTimer";
import { Goose } from "../components/Goose";

type RoundStatus = "cooldown" | "active" | "finished";

function getStatus(startAt: string, endAt: string): RoundStatus {
  const now = Date.now();
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();

  if (now < start) return "cooldown";
  if (now >= start && now <= end) return "active";
  return "finished";
}

export function RoundPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [round, setRound] = useState<RoundDetails | null>(null);
  const [myScore, setMyScore] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<RoundStatus>("cooldown");

  const targetTime =
    round && status === "cooldown"
      ? new Date(round.startAt)
      : round && status === "active"
        ? new Date(round.endAt)
        : null;

  const timer = useTimer(targetTime);

  const fetchRound = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getRound(id);
      setRound(data);
      setMyScore(data.myScore);
      setStatus(getStatus(data.startAt, data.endAt));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRound();
  }, [fetchRound]);

  // Update status based on timer
  useEffect(() => {
    if (!round) return;

    const currentStatus = getStatus(round.startAt, round.endAt);
    if (currentStatus !== status) {
      setStatus(currentStatus);
      if (currentStatus === "finished") {
        fetchRound(); // Refresh to get winner and leaderboard
      }
    }
  }, [timer.remaining, round, status, fetchRound]);

  const handleTap = async () => {
    if (!id || status !== "active") return;

    try {
      const result = await api.tap(id);
      setMyScore(result.score);
    } catch (err) {
      console.error("Tap failed:", err);
    }
  };

  if (isLoading) {
    return <div style={styles.container}>Загрузка...</div>;
  }

  if (error || !round) {
    return (
      <div style={styles.container}>
        <p style={styles.error}>{error || "Раунд не найден"}</p>
        <Link to="/rounds" style={styles.backLink}>
          Назад к списку
        </Link>
      </div>
    );
  }

  // Determine if current user won
  const isWinner = round.winner?.username === user?.username;
  const didParticipate = myScore > 0 || round.leaderboard?.some(p => p.isMe);

  const getTitle = () => {
    switch (status) {
      case "cooldown":
        return "Cooldown";
      case "active":
        return "Раунд активен!";
      case "finished":
        if (isWinner) return "Победа!";
        if (didParticipate) return "Раунд завершён";
        return "Раунд завершён";
    }
  };

  const getTitleColor = () => {
    if (status === "finished") {
      if (isWinner) return "#4caf50";
      if (didParticipate) return "#ff9800";
    }
    return "#fff";
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <Link to="/rounds" style={styles.backLink}>
          Раунды
        </Link>
        <span>{user?.username}</span>
      </header>

      <main style={styles.main}>
        <Goose onClick={handleTap} disabled={status !== "active"} />

        <div style={styles.info}>
          <h2 style={{ ...styles.title, color: getTitleColor() }}>
            {isWinner && "🏆 "}{getTitle()}{isWinner && " 🏆"}
          </h2>

          {status === "cooldown" && (
            <p style={styles.timer}>до начала раунда {timer.formatted}</p>
          )}

          {status === "active" && (
            <>
              <p style={styles.timer}>До конца осталось: {timer.formatted}</p>
              <p style={styles.score}>Мои очки - {myScore}</p>
            </>
          )}

          {status === "finished" && (
            <div style={styles.finishedSection}>
              {/* Summary stats */}
              <div style={styles.summaryStats}>
                <p>Всего очков в раунде: <strong>{round.totalScore}</strong></p>
                <p>Мои очки: <strong style={{ color: isWinner ? "#4caf50" : "#fff" }}>{myScore}</strong></p>
              </div>

              {/* Leaderboard */}
              {round.leaderboard && round.leaderboard.length > 0 && (
                <div style={styles.leaderboard}>
                  <h3 style={styles.leaderboardTitle}>Таблица результатов</h3>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>#</th>
                        <th style={styles.th}>Игрок</th>
                        <th style={styles.th}>Очки</th>
                      </tr>
                    </thead>
                    <tbody>
                      {round.leaderboard.map((entry) => (
                        <tr
                          key={entry.username}
                          style={{
                            ...styles.tr,
                            backgroundColor: entry.isMe ? "rgba(74, 158, 255, 0.2)" : "transparent",
                          }}
                        >
                          <td style={styles.td}>
                            {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}
                          </td>
                          <td style={styles.td}>
                            {entry.username}
                            {entry.isMe && " (ты)"}
                          </td>
                          <td style={styles.td}>{entry.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Back to rounds button */}
              <button
                onClick={() => navigate("/rounds")}
                style={styles.backButton}
              >
                К списку раундов
              </button>
            </div>
          )}
        </div>
      </main>
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
  backLink: {
    color: "#4a9eff",
    textDecoration: "none",
  },
  main: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
  },
  info: {
    textAlign: "center",
    marginTop: "2rem",
  },
  title: {
    fontSize: "1.5rem",
    marginBottom: "1rem",
  },
  timer: {
    fontSize: "1.2rem",
    color: "#aaa",
  },
  score: {
    fontSize: "1.5rem",
    marginTop: "1rem",
    color: "#4caf50",
  },
  error: {
    color: "#ff6b6b",
  },
  finishedSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1.5rem",
  },
  summaryStats: {
    fontSize: "1.1rem",
    lineHeight: 1.8,
  },
  leaderboard: {
    width: "100%",
    maxWidth: "400px",
  },
  leaderboardTitle: {
    fontSize: "1.2rem",
    marginBottom: "1rem",
    color: "#aaa",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    backgroundColor: "#2a2a2a",
    borderRadius: "8px",
    overflow: "hidden",
  },
  th: {
    padding: "0.75rem",
    textAlign: "left",
    borderBottom: "1px solid #444",
    color: "#aaa",
    fontSize: "0.9rem",
  },
  tr: {
    borderBottom: "1px solid #333",
  },
  td: {
    padding: "0.75rem",
    fontSize: "1rem",
  },
  backButton: {
    marginTop: "1rem",
    padding: "0.75rem 2rem",
    backgroundColor: "#4a9eff",
    border: "none",
    borderRadius: "4px",
    color: "#fff",
    fontSize: "1rem",
    cursor: "pointer",
  },
};
