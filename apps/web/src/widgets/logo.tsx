import { Link } from "@tanstack/react-router";

export function Logo() {
  return (
    <Link to="/" className="font-bold text-foreground hover:text-foreground/80">
      Agentic Web Stack
    </Link>
  );
}
