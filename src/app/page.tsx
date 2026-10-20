"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { signIn, signOut } from "next-auth/react";

type User = { id: string; email: string };
type RecurrenceType = "DAILY" | "SELECTED_WEEKDAYS" | "WEEKLY_INTERVAL";
type ScheduleRule = { id: string; recurrenceType: RecurrenceType; weekdays: number[]; intervalWeeks: number; effectiveStartDate: string; effectiveEndDate: string | null; anchorDate: string; isEnabled: boolean };
type Schedule = { id: string; title: string; description: string | null; timeMode: "TIMED" | "UNTIMED"; startTime: string | null; endTime: string | null; isEnabled: boolean; rules: ScheduleRule[] };
type ApiError = { error?: string };
type Activity = { id: string; titleSnapshot: string; categoryNameSnapshot: string | null; timeMode: "TIMED" | "UNTIMED"; plannedStartLocal: string | null; plannedEndLocal: string | null; status: "PENDING" | "COMPLETED" | "SKIPPED" | "CANCELLED"; actualDurationMinutes: number | null };
type DailyPlan = { id: string; planDate: string; status: "DRAFT" | "ACTIVE" | "INACTIVE" | "CANCELLED"; activatedAt: string | null; occurrences: Activity[] };
type AnalyticsDay = { date: string; total: number; completed: number; skipped: number; cancelled: number; pending: number; completionRate: number | null };
type HistoryActivity = { id: string; title: string; category: string | null; timeMode: "TIMED" | "UNTIMED"; startTime: string | null; endTime: string | null; status: "PENDING" | "COMPLETED" | "SKIPPED" | "CANCELLED"; actualDurationMinutes: number | null; completedAt: string | null; createdAt: string; planDate: string; planStatus: "DRAFT" | "ACTIVE" | "INACTIVE" | "CANCELLED" };
type HistoryData = { activities: HistoryActivity[]; page: number; pageSize: number; total: number; totalPages: number };
type AnalyticsData = { period: "week" | "month"; timezone: string; startDate: string; endDate: string; asOfDate: string; excludesCurrentDay: boolean; totals: { total: number; completed: number; skipped: number; cancelled: number; pending: number; completionRate: number | null }; days: AnalyticsDay[] };

function localDate() { const date = new Date(); const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 10); }
function statusDonutGradient(totals: AnalyticsData["totals"]) {
  if (totals.total === 0) return "conic-gradient(#edf1ed 0% 100%)";
  const segments = [
    { value: totals.completed, color: "#34764e" },
    { value: totals.skipped, color: "#d99b52" },
    { value: totals.cancelled, color: "#a8b0a9" },
    { value: totals.pending, color: "#e2bd5b" },
  ];
  let cursor = 0;
  const stops = segments.filter((segment) => segment.value > 0).map((segment) => {
    const start = cursor;
    cursor += (segment.value / totals.total) * 100;
    return `${segment.color} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}
async function readError(response: Response) { const body = await response.json().catch(() => ({})) as ApiError; return body.error ?? "Permintaan gagal."; }

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null);
  const [planDate, setPlanDate] = useState(localDate());
  const [view, setView] = useState<"schedules" | "daily" | "analytics" | "history">("daily");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<"week" | "month">("week");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyFrom, setHistoryFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); const offset = d.getTimezoneOffset() * 60000; return new Date(d.getTime() - offset).toISOString().slice(0, 10); });
  const [historyTo, setHistoryTo] = useState(localDate());
  const [historyStatus, setHistoryStatus] = useState("ALL");
  const [dailyBusy, setDailyBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [timeMode, setTimeMode] = useState<"TIMED" | "UNTIMED">("TIMED");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [recurrence, setRecurrence] = useState<"DAILY" | "SELECTED_WEEKDAYS" | "WEEKLY_INTERVAL">("DAILY");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [startDate, setStartDate] = useState(localDate());
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [ruleEffectiveEndDate, setRuleEffectiveEndDate] = useState("");
  const [ruleAnchorDate, setRuleAnchorDate] = useState(localDate());
  const [ruleEnabled, setRuleEnabled] = useState(true);

  const loadSchedules = useCallback(async () => {
    const response = await fetch("/api/schedules", { cache: "no-store" });
    if (!response.ok) throw new Error(await readError(response));
    const body = await response.json() as { schedules: Schedule[] };
    setSchedules(body.schedules);
  }, []);

  const loadDailyPlan = useCallback(async () => {
    const response = await fetch("/api/daily-plans", { cache: "no-store" });
    if (!response.ok) throw new Error(await readError(response));
    const body = await response.json() as { plan: DailyPlan | null; planDate: string };
    setDailyPlan(body.plan);
    setPlanDate(body.planDate);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return null;
      return (await response.json() as { user: User }).user;
    }).then(async (currentUser) => {
      if (!active) return;
      setUser(currentUser);
      if (currentUser) { try { await Promise.all([loadSchedules(), loadDailyPlan()]); } catch (error) { setMessage(error instanceof Error ? error.message : "Gagal memuat data."); } }
    }).catch(() => { if (active) setMessage("Tidak dapat menghubungi server."); }).finally(() => { if (active) setAuthChecked(true); });
    return () => { active = false; };
  }, [loadSchedules, loadDailyPlan]);


  async function submitSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const fields = { title, description: description || null, timeMode, startTime: timeMode === "TIMED" ? startTime : null, endTime: timeMode === "TIMED" ? endTime : null, isEnabled: true };
    try {
      if (editingScheduleId) {
        const response = await fetch(`/api/schedules/${editingScheduleId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
        if (!response.ok) throw new Error(await readError(response));
        await Promise.all([loadSchedules(), loadDailyPlan()]);
        setMessage("Detail jadwal diperbarui. Daily Plan berstatus DRAFT disinkronkan; snapshot plan yang sudah aktif/ditutup tetap tidak berubah.");
      } else {
        const rule = { recurrenceType: recurrence, intervalWeeks: recurrence === "WEEKLY_INTERVAL" ? intervalWeeks : 1, weekdays: recurrence === "SELECTED_WEEKDAYS" ? weekdays : [], effectiveStartDate: startDate, effectiveEndDate: null, anchorDate: startDate, isEnabled: true };
        const response = await fetch("/api/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, rules: [rule] }) });
        if (!response.ok) throw new Error(await readError(response));
        setTitle(""); setDescription(""); await Promise.all([loadSchedules(), loadDailyPlan()]); setMessage("Jadwal berhasil dibuat. Daily Plan berstatus DRAFT diperbarui otomatis.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : editingScheduleId ? "Gagal memperbarui jadwal." : "Gagal membuat jadwal."); } finally { setBusy(false); }
  }

  function beginEditSchedule(schedule: Schedule) {
    setEditingScheduleId(schedule.id);
    setTitle(schedule.title);
    setDescription(schedule.description ?? "");
    setTimeMode(schedule.timeMode);
    setEndTime(schedule.endTime?.slice(0, 5) ?? "09:00");
    const firstRule = schedule.rules[0];
    setSelectedRuleId(firstRule?.id ?? null);
    if (firstRule) {
      setRecurrence(firstRule.recurrenceType);
      setWeekdays(firstRule.weekdays);
      setIntervalWeeks(firstRule.intervalWeeks);
      setStartDate(firstRule.effectiveStartDate);
      setRuleEffectiveEndDate(firstRule.effectiveEndDate ?? "");
      setRuleAnchorDate(firstRule.anchorDate);
      setRuleEnabled(firstRule.isEnabled);
    }
    setView("schedules");
    setMessage("Detail jadwal dan pengulangan dapat diperbarui secara terpisah. Snapshot aktivitas yang sudah dibuat tidak berubah.");
  }

  function selectRecurrenceRule(ruleId: string) {
    const schedule = schedules.find((item) => item.id === editingScheduleId);
    const rule = schedule?.rules.find((item) => item.id === ruleId);
    if (!rule) return;
    setSelectedRuleId(rule.id);
    setRecurrence(rule.recurrenceType);
    setWeekdays(rule.weekdays);
    setIntervalWeeks(rule.intervalWeeks);
    setStartDate(rule.effectiveStartDate);
    setRuleEffectiveEndDate(rule.effectiveEndDate ?? "");
    setRuleAnchorDate(rule.anchorDate);
    setRuleEnabled(rule.isEnabled);
  }

  async function saveRecurrenceRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingScheduleId || !selectedRuleId) return;
    setBusy(true);
    setMessage("");
    const anchorDate = ruleAnchorDate < startDate ? startDate : ruleAnchorDate;
    const payload = {
      recurrenceType: recurrence,
      intervalWeeks: recurrence === "WEEKLY_INTERVAL" ? intervalWeeks : 1,
      weekdays: recurrence === "SELECTED_WEEKDAYS" ? weekdays : [],
      effectiveStartDate: startDate,
      effectiveEndDate: ruleEffectiveEndDate || null,
      anchorDate,
      isEnabled: ruleEnabled,
    };
    try {
      const response = await fetch(`/api/schedules/${editingScheduleId}/rules/${selectedRuleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await readError(response));
      await Promise.all([loadSchedules(), loadDailyPlan()]);
      setRuleAnchorDate(anchorDate);
      setMessage("Pengulangan diperbarui. Daily Plan berstatus DRAFT disinkronkan; plan aktif/riwayat tidak berubah.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal memperbarui pengulangan.");
    } finally {
      setBusy(false);
    }
  }

  function cancelScheduleEdit() {
    setEditingScheduleId(null); setSelectedRuleId(null); setTitle(""); setDescription(""); setTimeMode("TIMED"); setStartTime("08:00"); setEndTime("09:00"); setMessage("");
  }

  async function archiveSchedule(id: string) {
    if (!window.confirm("Arsipkan jadwal ini? Riwayat aktivitas yang sudah dibuat tidak akan dihapus.")) return;
    setBusy(true); setMessage("");
    try { const response = await fetch(`/api/schedules/${id}`, { method: "DELETE" }); if (!response.ok) throw new Error(await readError(response)); if (editingScheduleId === id) cancelScheduleEdit(); await Promise.all([loadSchedules(), loadDailyPlan()]); setMessage("Jadwal diarsipkan. Daily Plan berstatus DRAFT diperbarui otomatis."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Gagal mengarsipkan jadwal."); } finally { setBusy(false); }
  }

  async function createDailyPlan() {
    setDailyBusy(true); setMessage("");
    try {
      const response = await fetch("/api/daily-plans", { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      await loadDailyPlan(); setMessage("Daily Plan berhasil dibuat dari snapshot jadwal hari ini.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gagal membuat Daily Plan."); }
    finally { setDailyBusy(false); }
  }

  async function activateDailyPlan() {
    if (!dailyPlan) return;
    setDailyBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/daily-plans/${dailyPlan.id}/activate`, { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      await loadDailyPlan(); setMessage("Daily Plan berhasil diaktifkan.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gagal mengaktifkan Daily Plan."); }
    finally { setDailyBusy(false); }
  }

  async function cancelDailyPlan() {
    if (!dailyPlan) return;
    const confirmed = window.confirm("Batalkan Daily Plan aktif? Aktivitas yang masih pending akan dibatalkan. Aktivitas selesai/dilewati tetap tersimpan. Setelah itu kamu bisa memperbaiki definisi jadwal dan membuat plan pengganti.");
    if (!confirmed) return;
    setDailyBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/daily-plans/${dailyPlan.id}/cancel`, { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      await loadDailyPlan();
      setMessage("Daily Plan dibatalkan. Perbaiki definisi jadwal terlebih dahulu, lalu buat plan pengganti.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gagal membatalkan Daily Plan."); }
    finally { setDailyBusy(false); }
  }

  async function updateActivity(activityId: string, action: "complete" | "skip") {
    setDailyBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/activities/${activityId}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: action === "complete" ? JSON.stringify({}) : undefined });
      if (!response.ok) throw new Error(await readError(response));
      await loadDailyPlan(); setMessage(action === "complete" ? "Aktivitas ditandai selesai." : "Aktivitas dilewati.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gagal memperbarui aktivitas."); }
    finally { setDailyBusy(false); }
  }

  async function loadAnalytics(period: "week" | "month" = analyticsPeriod) {
    setAnalyticsBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/analytics?period=${period}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      setAnalytics(await response.json() as AnalyticsData);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gagal memuat analytics."); }
    finally { setAnalyticsBusy(false); }
  }

  async function loadHistory(page = 1) {
    setHistoryBusy(true); setMessage("");
    try {
      const query = new URLSearchParams({ page: String(page), status: historyStatus });
      if (historyFrom) query.set("from", historyFrom);
      if (historyTo) query.set("to", historyTo);
      const response = await fetch(`/api/activity-history?${query.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      setHistory(await response.json() as HistoryData);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gagal memuat riwayat aktivitas."); }
    finally { setHistoryBusy(false); }
  }

  async function logout() { await signOut({ redirectTo: "/" }); }

  if (!authChecked) return <main className="page-center"><p>Memuat Personal Schedule…</p></main>;
  if (!user) return <main className="auth-layout"><section className="brand-panel"><div className="brand-mark">PS</div><p className="eyebrow">PERSONAL SCHEDULE</p><h1>Jadwalkan dengan sadar. Evaluasi dengan data.</h1><p className="muted light">Satu tempat untuk mengelola rutinitas, mencatat aktivitas, dan memahami konsistensi dari waktu ke waktu.</p><div className="brand-foot">Private by design · Your schedule, your rules</div></section><section className="auth-panel"><div className="auth-card"><p className="eyebrow">AUTENTIKASI GOOGLE</p><h2>Masuk dengan Google</h2><p className="muted">Gunakan akun Google dengan alamat email terverifikasi. Personal Schedule tidak menerima pendaftaran email–password lokal.</p><button className="primary-button" disabled={busy} onClick={() => { setBusy(true); void signIn("google", { redirectTo: "/" }); }}>{busy ? "Mengarahkan ke Google…" : "Lanjutkan dengan Google"}</button>{message && <p className="notice" role="status">{message}</p>}<p className="tiny muted">Kami menggunakan identitas Google yang terverifikasi. Password Google tidak pernah diterima atau disimpan oleh aplikasi ini.</p></div></section></main>;

  return <main className="app-shell">{mobileNavOpen && <button className="sidebar-backdrop" aria-label="Tutup menu navigasi" onClick={() => setMobileNavOpen(false)} />}<aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}><div className="brand-inline"><span className="brand-mark small">PS</span><span>Personal Schedule</span><button className="mobile-sidebar-close" onClick={() => setMobileNavOpen(false)} aria-label="Tutup menu">×</button></div><div className="nav-label">WORKSPACE</div><button className={view === "schedules" ? "nav-item active" : "nav-item"} onClick={() => { setView("schedules"); setMobileNavOpen(false); }}><span>▦</span> Jadwal</button><button className={view === "daily" ? "nav-item active" : "nav-item"} onClick={() => { setView("daily"); setMobileNavOpen(false); }}><span>◷</span> Daily Plan</button><button className={view === "analytics" ? "nav-item active" : "nav-item"} onClick={() => { setView("analytics"); setMobileNavOpen(false); void loadAnalytics(); }}><span>↗</span> Analytics</button><button className={view === "history" ? "nav-item active" : "nav-item"} onClick={() => { setView("history"); setMobileNavOpen(false); void loadHistory(1); }}><span>☷</span> Riwayat Aktivitas</button><div className="sidebar-bottom"><div className="avatar">{user.email.slice(0,1).toUpperCase()}</div><div className="account"><strong>{user.email}</strong><span>Akun personal</span></div><button className="logout-button" onClick={logout} aria-label="Keluar">↗</button></div></aside><section className="main-content"><header className="topbar"><div className="topbar-copy"><button className="mobile-menu-toggle" onClick={() => setMobileNavOpen(true)} aria-label="Buka menu navigasi"><span></span><span></span><span></span></button><p className="eyebrow">WORKSPACE / {view === "daily" ? "DAILY PLAN" : view === "analytics" ? "ANALYTICS" : view === "history" ? "RIWAYAT AKTIVITAS" : "JADWAL"}</p><h1>{view === "daily" ? "Rencana hari ini" : view === "analytics" ? "Analitik konsistensi" : view === "history" ? "Riwayat aktivitas" : "Jadwal rutin"}</h1><p className="muted">{view === "daily" ? "Aktifkan rencana harian dan catat progres aktivitasmu." : view === "analytics" ? "Evaluasi aktivitas pada hari-hari yang sudah berakhir." : view === "history" ? "Periksa aktivitas lama berdasarkan tanggal dan status." : "Kelola definisi rutinitas yang akan membentuk rencana harianmu."}</p></div><div className="date-chip">{new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${planDate}T12:00:00Z`))}</div></header>{message && <div className="notice" role="status">{message}</div>}{view === "analytics" ? <section className="panel analytics-panel"><div className="panel-heading"><div><h2>Ringkasan aktivitas</h2><p className="muted">Hari berjalan tidak dihitung sampai hari lokal berakhir.</p></div><div className="period-switch"><button className={analyticsPeriod === "week" ? "period-button selected" : "period-button"} onClick={() => { setAnalyticsPeriod("week"); void loadAnalytics("week"); }}>Minggu ini</button><button className={analyticsPeriod === "month" ? "period-button selected" : "period-button"} onClick={() => { setAnalyticsPeriod("month"); void loadAnalytics("month"); }}>Bulan ini</button></div></div>{analyticsBusy && <p className="muted analytics-loading">Memuat analytics…</p>}{!analyticsBusy && analytics && <><p className="analytics-range">{analytics.startDate <= analytics.endDate ? `${analytics.startDate} — ${analytics.endDate}` : "Belum ada hari yang berakhir pada periode ini"} · {analytics.timezone}</p><div className="analytics-summary"><div><span>Total aktivitas</span><strong>{analytics.totals.total}</strong></div><div><span>Selesai</span><strong>{analytics.totals.completed}</strong></div><div><span>Tingkat selesai</span><strong>{analytics.totals.completionRate === null ? "—" : `${analytics.totals.completionRate}%`}</strong></div><div><span>Dilewati / batal</span><strong>{analytics.totals.skipped + analytics.totals.cancelled}</strong></div></div><div className="analytics-chart"><div className="analytics-chart-heading"><h3>Aktivitas per hari</h3><span className="muted">Jumlah selesai dibanding total</span></div>{analytics.days.length === 0 || analytics.days.every((day) => day.total === 0) ? <div className="empty-state analytics-empty"><h3>Belum ada riwayat untuk periode ini</h3><p>Aktivitas akan muncul setelah Daily Plan pada hari terkait berakhir.</p></div> : <div className="bar-chart">{analytics.days.map((day) => <div className="bar-column" key={day.date} title={`${day.date}: ${day.completed}/${day.total} selesai`}><div className="bar-track"><div className="bar-total" style={{ height: `${day.total ? Math.max(8, (day.total / Math.max(...analytics.days.map((item) => item.total), 1)) * 100) : 0}%` }}><div className="bar-completed" style={{ height: `${day.total ? (day.completed / day.total) * 100 : 0}%` }} /></div></div><strong>{day.total ? `${day.completed}/${day.total}` : "—"}</strong><span>{new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day.date}T12:00:00Z`))}</span></div>)}</div>}</div><div className="analytics-status-grid"><div><span className="status-dot enabled" /> Selesai <strong>{analytics.totals.completed}</strong></div><div><span className="status-dot skipped-dot" /> Dilewati <strong>{analytics.totals.skipped}</strong></div><div><span className="status-dot cancelled-dot" /> Dibatalkan <strong>{analytics.totals.cancelled}</strong></div><div><span className="status-dot pending-dot" /> Pending <strong>{analytics.totals.pending}</strong></div></div><div className="analytics-chart analytics-pie-section"><div className="analytics-chart-heading"><h3>Komposisi status aktivitas</h3><span className="muted">Proporsi seluruh aktivitas pada periode ini</span></div>{analytics.totals.total === 0 ? <div className="empty-state analytics-empty"><p>Belum ada data untuk membentuk grafik lingkaran.</p></div> : <div className="pie-layout"><div className="status-donut" role="img" aria-label={`Dari ${analytics.totals.total} aktivitas: ${analytics.totals.completed} selesai, ${analytics.totals.skipped} dilewati, ${analytics.totals.cancelled} dibatalkan, ${analytics.totals.pending} pending.`} style={{ background: statusDonutGradient(analytics.totals) }}><div className="status-donut-center"><strong>{analytics.totals.total}</strong><span>aktivitas</span></div></div><div className="pie-legend"><div><span className="pie-swatch completed-swatch" /> Selesai <strong>{analytics.totals.completed}</strong></div><div><span className="pie-swatch skipped-swatch" /> Dilewati <strong>{analytics.totals.skipped}</strong></div><div><span className="pie-swatch cancelled-swatch" /> Dibatalkan <strong>{analytics.totals.cancelled}</strong></div><div><span className="pie-swatch pending-swatch" /> Pending <strong>{analytics.totals.pending}</strong></div></div></div>}</div></>}</section> : view === "history" ? <section className="panel history-panel"><div className="panel-heading"><div><h2>Riwayat aktivitas</h2><p className="muted">Data diambil dari snapshot aktivitas yang tersimpan.</p></div><span className="count-pill">{history?.total ?? 0}</span></div><form className="history-filters" onSubmit={(event) => { event.preventDefault(); void loadHistory(1); }}><label>Dari tanggal<input type="date" value={historyFrom} max={historyTo || undefined} onChange={(event) => setHistoryFrom(event.target.value)} /></label><label>Sampai tanggal<input type="date" value={historyTo} min={historyFrom || undefined} onChange={(event) => setHistoryTo(event.target.value)} /></label><label>Status<select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)}><option value="ALL">Semua status</option><option value="COMPLETED">Selesai</option><option value="SKIPPED">Dilewati</option><option value="CANCELLED">Dibatalkan</option><option value="PENDING">Pending</option></select></label><button className="primary-button" disabled={historyBusy}>{historyBusy ? "Memuat…" : "Terapkan filter"}</button></form>{historyBusy ? <p className="muted analytics-loading">Memuat riwayat aktivitas…</p> : !history || history.activities.length === 0 ? <div className="empty-state"><div className="empty-icon">☷</div><h3>Belum ada aktivitas yang cocok</h3><p>Coba ubah rentang tanggal atau pilih status lain.</p></div> : <><div className="history-results-label">Menampilkan {((history.page - 1) * history.pageSize) + 1}–{Math.min(history.page * history.pageSize, history.total)} dari {history.total} aktivitas</div><div className="history-list">{history.activities.map((activity) => <article className="history-row" key={activity.id}><div className="history-date"><strong>{new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${activity.planDate}T12:00:00Z`))}</strong><span>{activity.timeMode === "TIMED" && activity.startTime && activity.endTime ? `${activity.startTime}–${activity.endTime}` : "Tanpa waktu"}</span></div><div className="history-activity"><h3>{activity.title}</h3><p>{activity.category ?? "Tanpa kategori"} · Plan {activity.planStatus.toLowerCase()}</p>{activity.actualDurationMinutes !== null && <span className="history-duration">Durasi aktual: {activity.actualDurationMinutes} menit</span>}</div><span className={`status-pill ${activity.status.toLowerCase()}`}>{activity.status === "COMPLETED" ? "Selesai" : activity.status === "SKIPPED" ? "Dilewati" : activity.status === "CANCELLED" ? "Dibatalkan" : "Pending"}</span></article>)}</div><div className="history-pagination"><button className="subtle-button" disabled={history.page <= 1 || historyBusy} onClick={() => void loadHistory(history.page - 1)}>Sebelumnya</button><span>Halaman {history.page} dari {history.totalPages}</span><button className="subtle-button" disabled={history.page >= history.totalPages || historyBusy} onClick={() => void loadHistory(history.page + 1)}>Berikutnya</button></div></>}</section> : view === "daily" ? <section className="panel daily-plan-panel">
      <div className="panel-heading"><div><h2>Daily Plan</h2><p className="muted">{new Intl.DateTimeFormat("id-ID", { dateStyle: "full" }).format(new Date(`${planDate}T12:00:00`))}</p></div><span className={`status-pill ${dailyPlan?.status.toLowerCase() ?? "empty"}`}>{dailyPlan?.status ?? "BELUM DIBUAT"}</span></div>
      {!dailyPlan ? <div className="empty-state"><div className="empty-icon">◷</div><h3>Rencana hari ini belum dibuat</h3><p>Aktivitas akan disalin sebagai snapshot dari definisi jadwal yang cocok dengan tanggal hari ini.</p><button className="primary-button" onClick={createDailyPlan} disabled={dailyBusy}>{dailyBusy ? "Membuat…" : "Buat Daily Plan hari ini"}</button></div> : <>
        <div className="daily-plan-summary"><div><strong>{dailyPlan.occurrences.length}</strong><span>Total aktivitas</span></div><div><strong>{dailyPlan.occurrences.filter((activity) => activity.status === "COMPLETED").length}</strong><span>Selesai</span></div><div><strong>{dailyPlan.occurrences.filter((activity) => activity.status === "PENDING").length}</strong><span>Menunggu</span></div></div>
        {dailyPlan.status === "DRAFT" && <div className="plan-action-row"><p className="muted">Daftar ini mengikuti perubahan jadwal selama masih DRAFT. Setelah diaktifkan, snapshot aktivitas tidak berubah.</p><button className="primary-button" onClick={activateDailyPlan} disabled={dailyBusy}>{dailyBusy ? "Mengaktifkan…" : "Aktifkan Daily Plan"}</button></div>}
        {dailyPlan.status === "ACTIVE" && <div className="plan-action-row"><p className="muted">Jadwal salah dibuat? Batalkan plan ini, perbaiki definisi di menu Jadwal, lalu buat plan pengganti. Aktivitas yang sudah selesai atau dilewati tetap tersimpan.</p><button className="danger-button" onClick={cancelDailyPlan} disabled={dailyBusy}>{dailyBusy ? "Membatalkan…" : "Batalkan Daily Plan"}</button></div>}
        {dailyPlan.status === "CANCELLED" && <div className="plan-action-row"><p className="muted">Plan sebelumnya dibatalkan. Perbaiki definisi jadwal terlebih dahulu jika diperlukan, lalu buat snapshot baru.</p><button className="primary-button" onClick={createDailyPlan} disabled={dailyBusy}>{dailyBusy ? "Membuat…" : "Buat Plan Pengganti"}</button></div>}
        {dailyPlan.occurrences.length === 0 ? <div className="empty-state"><h3>Belum ada aktivitas</h3><p>Pastikan ada definisi jadwal aktif dengan recurrence yang cocok untuk hari ini.</p></div> : <div className="schedule-list activity-list">{dailyPlan.occurrences.map((activity) => <article className="schedule-card activity-card" key={activity.id}><div className="schedule-card-top"><span className={`time-tag ${activity.timeMode === "TIMED" ? "timed" : "untimed"}`}>{activity.timeMode === "TIMED" ? `${activity.plannedStartLocal?.slice(11,16) ?? activity.plannedStartLocal?.slice(0,5)} – ${activity.plannedEndLocal?.slice(11,16) ?? activity.plannedEndLocal?.slice(0,5)}` : "Tanpa waktu"}</span><span className={`status-pill ${activity.status.toLowerCase()}`}>{activity.status}</span></div><h3>{activity.titleSnapshot}</h3>{activity.categoryNameSnapshot && <p className="muted">{activity.categoryNameSnapshot}</p>}{dailyPlan.status === "ACTIVE" && activity.status === "PENDING" && <div className="schedule-actions"><button className="primary-button compact-button" onClick={() => updateActivity(activity.id, "complete")} disabled={dailyBusy}>Selesai</button><button className="subtle-button" onClick={() => updateActivity(activity.id, "skip")} disabled={dailyBusy}>Lewati</button></div>}</article>)}</div>}
      </>}
    </section> : <div className="content-grid"><section className="panel schedule-panel"><div className="panel-heading"><div><h2>Definisi jadwal</h2><p className="muted">{schedules.length} jadwal aktif atau tersimpan</p></div><span className="count-pill">{schedules.length}</span></div>{schedules.length === 0 ? <div className="empty-state"><div className="empty-icon">▦</div><h3>Belum ada jadwal</h3><p>Buat rutinitas pertamamu melalui form di samping.</p></div> : <div className="schedule-list">{schedules.map((schedule) => <article className="schedule-card" key={schedule.id}><div className="schedule-card-top"><span className={`time-tag ${schedule.timeMode === "TIMED" ? "timed" : "untimed"}`}>{schedule.timeMode === "TIMED" ? `${schedule.startTime} – ${schedule.endTime}` : "Tanpa waktu"}</span><span className={`state-dot ${schedule.isEnabled ? "enabled" : "disabled"}`} title={schedule.isEnabled ? "Aktif" : "Nonaktif"} /></div><h3>{schedule.title}</h3>{schedule.description && <p className="schedule-description">{schedule.description}</p>}<div className="schedule-meta">{schedule.rules.map((rule) => <span key={rule.id}>{rule.recurrenceType === "DAILY" ? "Setiap hari" : rule.recurrenceType === "SELECTED_WEEKDAYS" ? `Hari: ${rule.weekdays.map((day) => ["","Sen","Sel","Rab","Kam","Jum","Sab","Min"][day]).join(", ")}` : `Setiap ${rule.intervalWeeks} minggu`}</span>)}{schedule.rules.map((rule) => <span key={`${rule.id}-range`}>Berlaku {rule.effectiveStartDate} – {rule.effectiveEndDate ?? "tanpa batas"}</span>)}</div><div className="schedule-actions"><button className="subtle-button" onClick={() => beginEditSchedule(schedule)} disabled={busy}>Edit</button><button className="subtle-button" onClick={() => archiveSchedule(schedule.id)} disabled={busy}>Arsipkan</button></div></article>)}</div>}</section><section className="panel create-panel"><div className="panel-heading"><div><h2>{editingScheduleId ? "Edit jadwal" : "Tambah jadwal"}</h2><p className="muted">{editingScheduleId ? "Perbarui detail definisi jadwal." : "Definisikan aktivitas rutin baru."}</p></div><span className="plus-mark">+</span></div><form className="form-stack" onSubmit={submitSchedule}><label>Nama aktivitas<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} placeholder="Contoh: Belajar coding" /></label><label>Deskripsi <span className="optional">Opsional</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} rows={2} placeholder="Tujuan atau catatan singkat" /></label><label>Jenis waktu<select value={timeMode} onChange={(event) => setTimeMode(event.target.value as "TIMED" | "UNTIMED")}><option value="TIMED">Dengan waktu</option><option value="UNTIMED">Tanpa waktu</option></select></label>{timeMode === "TIMED" && <div className="two-columns"><label>Mulai<input type="time" required value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label>Selesai<input type="time" required value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div>}{!editingScheduleId && <><label>Pengulangan<select value={recurrence} onChange={(event) => setRecurrence(event.target.value as typeof recurrence)}><option value="DAILY">Setiap hari</option><option value="SELECTED_WEEKDAYS">Hari tertentu</option><option value="WEEKLY_INTERVAL">Interval minggu</option></select></label>{recurrence === "SELECTED_WEEKDAYS" && <div className="weekday-picker">{[[1,"Sen"],[2,"Sel"],[3,"Rab"],[4,"Kam"],[5,"Jum"],[6,"Sab"],[7,"Min"]].map(([day, label]) => <button key={day} type="button" className={weekdays.includes(Number(day)) ? "weekday selected" : "weekday"} onClick={() => setWeekdays((current) => current.includes(Number(day)) ? current.filter((v) => v !== Number(day)) : [...current, Number(day)].sort())}>{label}</button>)}</div>}{recurrence === "WEEKLY_INTERVAL" && <label>Interval minggu<input type="number" min={1} max={520} value={intervalWeeks} onChange={(event) => setIntervalWeeks(Number(event.target.value))} required /></label>}<label>Tanggal mulai<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label><p className="tiny muted">Jadwal disimpan sebagai definisi. Aktivitas harian akan dibuat melalui fitur Daily Plan.</p></>}<button className="primary-button" disabled={busy}>{busy ? "Menyimpan…" : editingScheduleId ? "Simpan perubahan" : "Simpan jadwal"}</button>{editingScheduleId && <button type="button" className="subtle-button form-cancel-button" onClick={cancelScheduleEdit} disabled={busy}>Batal edit</button>}</form>{editingScheduleId && <form className="form-stack recurrence-editor" onSubmit={saveRecurrenceRule}><div className="editor-divider" /><div><h3>Pengaturan pengulangan</h3><p className="muted">Perubahan berlaku untuk Daily Plan yang dibuat berikutnya. Snapshot aktivitas lama tidak dimutasi.</p></div>{(schedules.find((schedule) => schedule.id === editingScheduleId)?.rules.length ?? 0) > 1 && <label>Aturan yang diedit<select value={selectedRuleId ?? ""} onChange={(event) => selectRecurrenceRule(event.target.value)}>{schedules.find((schedule) => schedule.id === editingScheduleId)?.rules.map((rule, index) => <option key={rule.id} value={rule.id}>Aturan {index + 1} · {rule.recurrenceType === "DAILY" ? "Setiap hari" : rule.recurrenceType === "SELECTED_WEEKDAYS" ? "Hari tertentu" : `Setiap ${rule.intervalWeeks} minggu`}</option>)}</select></label>}<label>Jenis pengulangan<select value={recurrence} onChange={(event) => setRecurrence(event.target.value as RecurrenceType)}><option value="DAILY">Setiap hari</option><option value="SELECTED_WEEKDAYS">Hari tertentu</option><option value="WEEKLY_INTERVAL">Interval minggu</option></select></label>{recurrence === "SELECTED_WEEKDAYS" && <div><span className="field-label">Hari aktif</span><div className="weekday-picker">{[[1,"Sen"],[2,"Sel"],[3,"Rab"],[4,"Kam"],[5,"Jum"],[6,"Sab"],[7,"Min"]].map(([day, label]) => <button key={day} type="button" className={weekdays.includes(Number(day)) ? "weekday selected" : "weekday"} aria-pressed={weekdays.includes(Number(day))} onClick={() => setWeekdays((current) => current.includes(Number(day)) ? current.filter((value) => value !== Number(day)) : [...current, Number(day)].sort())}>{label}</button>)}</div></div>}{recurrence === "WEEKLY_INTERVAL" && <label>Interval minggu<input type="number" min={1} max={520} value={intervalWeeks} onChange={(event) => setIntervalWeeks(Number(event.target.value))} required /></label>}<div className="two-columns"><label>Tanggal mulai berlaku<input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); if (ruleAnchorDate < event.target.value) setRuleAnchorDate(event.target.value); if (ruleEffectiveEndDate && ruleEffectiveEndDate < event.target.value) setRuleEffectiveEndDate(""); }} required /></label><label>Tanggal akhir <span className="optional">Opsional</span><input type="date" min={startDate} value={ruleEffectiveEndDate} onChange={(event) => setRuleEffectiveEndDate(event.target.value)} /></label></div>{recurrence === "WEEKLY_INTERVAL" && <label>Tanggal acuan interval<input type="date" min={startDate} value={ruleAnchorDate < startDate ? startDate : ruleAnchorDate} onChange={(event) => setRuleAnchorDate(event.target.value)} required /><span className="optional">Minggu dihitung berdasarkan pekan kalender Senin–Minggu.</span></label>}<label className="checkbox-label"><input type="checkbox" checked={ruleEnabled} onChange={(event) => setRuleEnabled(event.target.checked)} /> Aktifkan aturan pengulangan</label><button className="primary-button" disabled={busy || !selectedRuleId || (recurrence === "SELECTED_WEEKDAYS" && weekdays.length === 0)}>{busy ? "Menyimpan…" : "Simpan pengulangan"}</button></form>}</section></div>}<footer className="page-footer">Personal Schedule <span>•</span> {view === "daily" ? "Daily Plan & Activity Tracking" : view === "analytics" ? "Analytics" : view === "history" ? "Activity History" : "Schedule Definition"}</footer></section></main>;
}
