import { useState, useEffect } from "react";
import { api } from "../lib/api";

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then(s => { setSettings(s || {}); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await api.saveSettings(settings);
      alert("설정이 저장되었습니다!");
    } catch (e: any) {
      alert("저장 실패: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function testTelegram() {
    try {
      const res = await api.testTelegram();
      setTestResult(res.success ? "✅ 텔레그램 연결 성공!" : "❌ 연결 실패");
    } catch (e: any) {
      setTestResult("❌ " + e.message);
    }
  }

  async function detectChat() {
    try {
      const res = await api.detectChatId();
      if (res.success) {
        setSettings((prev: any) => ({ ...prev, telegramChatId: res.chatId }));
        alert(`채팅 ID 감지: ${res.chatId}`);
      } else {
        alert("채팅 ID를 감지할 수 없습니다. 봇에게 먼저 메시지를 보내주세요.");
      }
    } catch (e: any) {
      alert("오류: " + e.message);
    }
  }

  function updateField(field: string, value: any) {
    setSettings((prev: any) => ({ ...prev, [field]: value }));
  }

  if (loading) return <div className="text-center py-20 text-gray-500">로딩 중...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-2xl font-bold">설정</h2>

      {/* Telegram */}
      <Section title="📨 텔레그램">
        <Field label="봇 토큰" value={settings.telegramBotToken || ""} onChange={v => updateField("telegramBotToken", v)} type="password" placeholder="123456:ABC-DEF..." />
        <Field label="채팅 ID" value={settings.telegramChatId || ""} onChange={v => updateField("telegramChatId", v)} placeholder="-100123456789" />
        <div className="flex gap-2 mt-2">
          <button onClick={testTelegram} className="px-3 py-1.5 rounded text-sm bg-blue-100 text-blue-700 hover:bg-blue-200">테스트 전송</button>
          <button onClick={detectChat} className="px-3 py-1.5 rounded text-sm bg-gray-100 text-gray-700 hover:bg-gray-200">채팅 ID 자동감지</button>
        </div>
        {testResult && <p className="text-sm mt-2">{testResult}</p>}
        <Toggle label="자동 알림 활성화" checked={settings.autoAlertEnabled || false} onChange={v => updateField("autoAlertEnabled", v)} />
      </Section>

      {/* KIS API */}
      <Section title="🏦 KIS API">
        <Field label="App Key" value={settings.kisAppKey || ""} onChange={v => updateField("kisAppKey", v)} type="password" placeholder="PSxxxxxxxx" />
        <Field label="App Secret" value={settings.kisAppSecret || ""} onChange={v => updateField("kisAppSecret", v)} type="password" />
        <Field label="계좌번호" value={settings.kisAccountNo || ""} onChange={v => updateField("kisAccountNo", v)} placeholder="50123456-01" />
      </Section>

      {/* Scanner Settings */}
      <Section title="🔍 스캐너 설정">
        <div className="grid grid-cols-2 gap-4">
          <Field label="RSI 최소" value={settings.rsiMin || 40} onChange={v => updateField("rsiMin", Number(v))} type="number" />
          <Field label="RSI 최대" value={settings.rsiMax || 80} onChange={v => updateField("rsiMax", Number(v))} type="number" />
          <Field label="최소 거래대금 (원)" value={settings.minVolumeMoney || 30000000000} onChange={v => updateField("minVolumeMoney", Number(v))} type="number" />
        </div>
        <Toggle label="이동평균 필터" checked={settings.maFilterEnabled !== false} onChange={v => updateField("maFilterEnabled", v)} />
      </Section>

      {/* Trading Settings */}
      <Section title="🤖 자동매매 설정">
        <Toggle label="자동매매 활성화" checked={settings.tradingEnabled || false} onChange={v => updateField("tradingEnabled", v)} />
        <Field label="종목당 투자금 (원)" value={settings.investmentPerStock || 1000000} onChange={v => updateField("investmentPerStock", Number(v))} type="number" />
      </Section>

      {/* Turtle Settings */}
      <Section title="🐢 터틀 설정">
        <div className="grid grid-cols-2 gap-4">
          <Field label="돌파 기간 (일)" value={settings.turtleBreakoutPeriod || 20} onChange={v => updateField("turtleBreakoutPeriod", Number(v))} type="number" />
          <Field label="ATR 기간" value={settings.turtleAtrPeriod || 14} onChange={v => updateField("turtleAtrPeriod", Number(v))} type="number" />
          <Field label="계좌 규모 (원)" value={settings.accountSize || 10000000} onChange={v => updateField("accountSize", Number(v))} type="number" />
          <Field label="리스크 비율" value={settings.riskPerTrade || 0.02} onChange={v => updateField("riskPerTrade", Number(v))} type="number" />
        </div>
      </Section>

      {/* Save */}
      <button onClick={save} disabled={saving} className="px-6 py-3 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 w-full">
        {saving ? "저장 중..." : "💾 설정 저장"}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border p-4">
      <h3 className="font-semibold mb-4">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "" }: {
  label: string; value: any; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
      />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div className={`w-10 h-6 rounded-full relative transition-colors ${checked ? "bg-blue-600" : "bg-gray-300"}`}>
        <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
      </div>
      <span className="text-sm">{label}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="hidden" />
    </label>
  );
}
