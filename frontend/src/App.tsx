import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import { LoginPage } from "./pages/LoginPage";
import { RoundsListPage } from "./pages/RoundsListPage";
import { RoundPage } from "./pages/RoundPage";
import { GamePrototypePage } from "./pages/GamePrototypePage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          backgroundColor: "#1a1a1a",
          color: "#fff",
        }}
      >
        Загрузка...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function App() {
  const { checkAuth, user, isLoading } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            isLoading ? null : user ? <Navigate to="/rounds" replace /> : <LoginPage />
          }
        />
        <Route
          path="/rounds"
          element={
            <ProtectedRoute>
              <RoundsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/rounds/:id"
          element={
            <ProtectedRoute>
              <RoundPage />
            </ProtectedRoute>
          }
        />
        <Route path="/game/prototype" element={<GamePrototypePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
