import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    // Redirect to welcome page
    window.location.href = "/welcome";
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center text-white">
        <p>Redirecting to welcome page...</p>
      </div>
    </div>
  );
}
