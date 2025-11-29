import { useState } from "react";

interface GooseProps {
  onClick: () => void;
  disabled?: boolean;
}

export function Goose({ onClick, disabled }: GooseProps) {
  const [isPressed, setIsPressed] = useState(false);

  const handleClick = () => {
    if (disabled) return;
    setIsPressed(true);
    onClick();
    setTimeout(() => setIsPressed(false), 100);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        transform: isPressed ? "scale(0.95)" : "scale(1)",
        transition: "transform 0.1s",
        userSelect: "none",
        opacity: disabled ? 0.5 : 1,
        fontSize: "10rem",
        lineHeight: 1,
      }}
    >
      <pre style={{ margin: 0, fontFamily: "monospace", fontSize: "0.8rem" }}>
{`
            ░░░░░░░░░░░░░░░
          ░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░
        ░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░
        ░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░
      ░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░
    ░░▒▒▒▒░░░░▓▓▓▓▓▓▓▓▓▓▓▓░░░░▒▒▒▒░░
    ░░▒▒▒▒▒▒▒▒░░░░░░░░░░░░▒▒▒▒▒▒▒▒░░
    ░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░
      ░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░
        ░░░░░░░░░░░░░░░░░░░░░░░░░░
`}
      </pre>
    </div>
  );
}
