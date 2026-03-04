import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import Scanner from "./pages/Scanner";
import Trading from "./pages/Trading";
import Signals from "./pages/Signals";
import TurtleScreen from "./pages/TurtleScreen";
import SettingsPage from "./pages/Settings";

type Page = "dashboard" | "scanner" | "trading" | "signals" | "turtle" | "settings";

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: "dashboard", label: "대시보드", icon: "📊" },
  { id: "scanner", label: "스캐너", icon: "🔍" },
  { id: "signals", label: "시그널", icon: "📡" },
  { id: "trading", label: "자동매매", icon: "🤖" },
  { id: "turtle", label: "터틀 스크리닝", icon: "🐢" },
  { id: "settings", label: "설정", icon: "⚙️" },
];

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400">
            📈 KIS 통합 트레이딩
          </h1>
          <nav className="flex gap-1">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  page === item.id
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                }`}
              >
                <span className="mr-1">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {page === "dashboard" && <Dashboard />}
        {page === "scanner" && <Scanner />}
        {page === "trading" && <Trading />}
        {page === "signals" && <Signals />}
        {page === "turtle" && <TurtleScreen />}
        {page === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
