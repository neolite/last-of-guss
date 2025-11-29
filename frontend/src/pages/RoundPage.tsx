import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
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
  const [round, setRound] = useState<RoundDetails | null>(null);
  const [myScore, setMyScore] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<RoundStatus>("cooldown");
  
  // Track last accepted tap to handle out-of-order responses
  const lastAcceptedTap = useRef(0);

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
      lastAcceptedTap.current = data.myTaps;
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
        fetchRound(); // Refresh to get winner
      }
    }
  }, [timer.remaining, round, status, fetchRound]);

  const handleTap = async () => {
    if (!id || status !== "active") return;

    try {
      const result = await api.tap(id);
      
      // Only update if this response is newer than what we have
      // This prevents out-of-order responses from showing stale data
      if (result.taps > lastAcceptedTap.current) {
        lastAcceptedTap.current = result.taps;
        setMyScore(result.score);
      }
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

  const getTitle = () => {
    switch (status) {
      case "cooldown":
        return "Cooldown";
      case "active":
        return "Раунд активен!";
      case "finished":
        return "Раунд завершен";
    }
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
          <h2 style={styles.title}>{getTitle()}</h2>

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
            <div style={styles.stats}>
              <div style={styles.statsRow}>
                <span>Всего</span>
                <span>{round.totalScore}</span>
              </div>
              {round.winner && (
                <div style={styles.statsRow}>
                  <span>Победитель - {round.winner.username}</span>
                  <span>{round.winner.score}</span>
                </div>
              )}
              <div style={styles.statsRow}>
                <span>Мои очки</span>
                <span>{myScore}</span>
              </div>
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
  stats: {
    marginTop: "1rem",
    textAlign: "left",
    minWidth: "250px",
  },
  statsRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "0.5rem 0",
    borderBottom: "1px solid #444",
    fontSize: "1.1rem",
  },
  error: {
    color: "#ff6b6b",
  },
};
