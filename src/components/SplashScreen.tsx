import { useState, useEffect } from "react";
import { Handshake } from "lucide-react";

const SPLASH_TEXT = "sisi tuko pamoja je wewe?";
const TYPING_SPEED = 80; // ms per character
const HOLD_DURATION = 1200; // ms to show full text before fading

const SplashScreen = ({ onComplete }: { onComplete: () => void }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [phase, setPhase] = useState<"typing" | "holding" | "fading">("typing");

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayedText(SPLASH_TEXT.slice(0, i));
      if (i >= SPLASH_TEXT.length) {
        clearInterval(interval);
        setPhase("holding");
        setTimeout(() => {
          setPhase("fading");
          setTimeout(onComplete, 600);
        }, HOLD_DURATION);
      }
    }, TYPING_SPEED);
    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background transition-opacity duration-600 ${
        phase === "fading" ? "opacity-0" : "opacity-100"
      }`}
    >
      <Handshake className="h-16 w-16 text-primary mb-6 animate-pulse" />
      <p className="text-2xl sm:text-3xl font-bold text-foreground tracking-wide text-center px-6">
        {displayedText}
        <span className="animate-pulse text-primary">|</span>
      </p>
    </div>
  );
};

export default SplashScreen;
