import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, error, isLoading, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    const success = await login(username, password);
    if (success) {
      navigate("/rounds");
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>ВОЙТИ</h1>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Имя пользователя:</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={styles.input}
              required
              disabled={isLoading}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Пароль:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              required
              disabled={isLoading}
            />
          </div>
          <button type="submit" style={styles.button} disabled={isLoading}>
            {isLoading ? "Загрузка..." : "Войти"}
          </button>
          {error && <p style={styles.error}>{error}</p>}
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: "#1a1a1a",
  },
  card: {
    backgroundColor: "#2a2a2a",
    padding: "2rem",
    borderRadius: "8px",
    width: "100%",
    maxWidth: "400px",
    border: "1px solid #444",
  },
  title: {
    textAlign: "center",
    color: "#fff",
    marginBottom: "2rem",
    fontSize: "1.5rem",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  label: {
    color: "#ccc",
    fontSize: "0.9rem",
  },
  input: {
    padding: "0.75rem",
    borderRadius: "4px",
    border: "1px solid #555",
    backgroundColor: "#333",
    color: "#fff",
    fontSize: "1rem",
  },
  button: {
    padding: "0.75rem",
    borderRadius: "4px",
    border: "none",
    backgroundColor: "#4a9eff",
    color: "#fff",
    fontSize: "1rem",
    cursor: "pointer",
    marginTop: "1rem",
  },
  error: {
    color: "#ff6b6b",
    textAlign: "center",
    margin: 0,
  },
};
