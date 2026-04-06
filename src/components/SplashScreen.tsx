import { useState, useEffect } from "react";
import { Handshake } from "lucide-react";

const SPLASH_TEXT = "sisi tuko pamoja je wewe?";
const TYPING_SPEED = 90;
const HOLD_DURATION = 1400;

const LETTER_COLORS = [
  "hsl(142, 76%, 46%)",  // green
  "hsl(48, 96%, 53%)",   // gold
  "hsl(199, 89%, 48%)",  // sky blue
  "hsl(340, 82%, 52%)",  // rose
  "hsl(262, 83%, 58%)",  // purple
  "hsl(25, 95%, 53%)",   // orange
  "hsl(172, 66%, 50%)",  // teal
  "hsl(0, 84%, 60%)",    // red
];

const SplashScreen = ({ onComplete }: { onComplete: () => void }) => {
  const [charCount, setCharCount] = useState(0);
  const [phase, setPhase] = useState<"typing" | "holding" | "fading">("typing");
  const [iconScale, setIconScale] = useState(0);

  useEffect(() => {
    // Animate icon entrance
    const t = setTimeout(() => setIconScale(1), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (charCount >= SPLASH_TEXT.length) {
      setPhase("holding");
      const t = setTimeout(() => {
        setPhase("fading");
        setTimeout(onComplete, 700);
      }, HOLD_DURATION);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCharCount((c) => c + 1), TYPING_SPEED);
    return () => clearTimeout(t);
  }, [charCount, onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity duration-700 ${
        phase === "fading" ? "opacity-0 scale-110" : "opacity-100 scale-100"
      }`}
      style={{
        background: "radial-gradient(ellipse at center, hsl(142 40% 12%) 0%, hsl(220 20% 6%) 70%)",
        transitionProperty: "opacity, transform",
      }}
    >
      {/* Glow rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="rounded-full blur-3xl opacity-20"
          style={{
            width: 300,
            height: 300,
            background: "radial-gradient(circle, hsl(142 76% 46% / 0.4), transparent 70%)",
          }}
        />
      </div>

      {/* Handshake Icon */}
      <div
        className="mb-8 relative"
        style={{
          transform: `scale(${iconScale})`,
          transition: "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        <div
          className="absolute inset-0 rounded-full blur-xl opacity-40"
          style={{ background: "hsl(142 76% 46%)", transform: "scale(1.5)" }}
        />
        <Handshake
          className="relative"
          size={72}
          strokeWidth={1.5}
          style={{
            color: "hsl(142, 76%, 56%)",
            filter: "drop-shadow(0 0 20px hsl(142 76% 46% / 0.5))",
          }}
        />
      </div>

      {/* Typing text with colored letters */}
      <p className="text-3xl sm:text-4xl font-extrabold tracking-wider text-center px-6 min-h-[3rem]">
        {SPLASH_TEXT.split("").map((char, i) => {
          const isVisible = i < charCount;
          const color = char === " " ? "transparent" : LETTER_COLORS[i % LETTER_COLORS.length];

          return (
            <span
              key={i}
              style={{
                color,
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "translateY(0) scale(1)" : "translateY(12px) scale(0.5)",
                transition: "opacity 0.25s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
                display: "inline-block",
                textShadow: isVisible ? `0 0 18px ${color}` : "none",
                minWidth: char === " " ? "0.3em" : undefined,
              }}
            >
              {char === " " ? "\u00A0" : char}
            </span>
          );
        })}
        {phase === "typing" && (
          <span
            className="inline-block ml-0.5 animate-pulse"
            style={{
              color: "hsl(142, 76%, 56%)",
              textShadow: "0 0 12px hsl(142 76% 46% / 0.6)",
            }}
          >
            |
          </span>
        )}
      </p>

      {/* Subtitle that fades in after typing */}
      <p
        className="mt-6 text-sm tracking-widest uppercase"
        style={{
          color: "hsl(142 76% 46% / 0.6)",
          opacity: phase === "typing" ? 0 : 1,
          transform: phase === "typing" ? "translateY(8px)" : "translateY(0)",
          transition: "opacity 0.5s ease, transform 0.5s ease",
        }}
      >
        Pamojanova
      </p>
    </div>
  );
};

export default SplashScreen;
