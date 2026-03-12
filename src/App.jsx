import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n ?? 0);
const fmtShort = (n) => {
  if (!n) return "$0";
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1_000).toFixed(0)}K`;
};

const STATUS_COLOR = {
  "Desembolsado":     "#F59E0B",
  "Aprobado":         "#10B981",
  "Validado":         "#38BDF8",
  "Pendiente RR.HH.": "#818CF8",
};
const LOAN_COLORS = ["#F59E0B", "#10B981", "#38BDF8", "#818CF8", "#F472B6"];

// ─── DATA FETCHING ────────────────────────────────────────────────────────────
const AIRTABLE_TOKEN   = import.meta.env.VITE_AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID;
const TABLE_IDS = {
  Solicitudes: "tblfv9QxoIwJfihQ8",
  Prestamos:   "tblc3tptDhAUheyNr",
  Empresas:    "tblfZT55hGROayCCk",
};

async function fetchTable(table) {
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID)
    throw new Error("Faltan variables VITE_AIRTABLE_TOKEN o VITE_AIRTABLE_BASE_ID.");
  const tableId = TABLE_IDS[table];
  let allRecords = [], offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `Error cargando ${table}`); }
    const data = await res.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset || null;
  } while (offset);
  return allRecords;
}

function parseSolicitudes(records) {
  return records.filter((r) => r.fields["Nombre"]).map((r) => ({
    id: r.id,
    nombre:    r.fields["Nombre"] || "",
    empresa:   r.fields["Empresa"] || "",
    salario:   r.fields["Salario"] || 0,
    monto:     r.fields["Monto Crédito"] || 0,
    plazo:     r.fields["Plazo (meses)"] || 0,
    desembolso:r.fields["Desembolso"] || 0,
    cuota:     r.fields["Cuota Mensual"] || 0,
    estado:    r.fields["Estado"]?.name || r.fields["Estado"] || "Sin estado",
    fecha:     r.fields["Fecha Solicitud"] || "",
  }));
}

function parsePrestamos(records, rawSolicitudes = []) {
  return records.filter((r) => r.fields["Monto Desembolsado"]).map((r) => {
    // Empresa puede venir como objeto {name} o como string ID — manejo ambos
    const empRaw = r.fields["Empresa"];
    let empresa = "";
    if (Array.isArray(empRaw) && empRaw.length > 0) {
      empresa = empRaw[0]?.name || "";
    }
    // Fallback: buscar empresa desde la solicitud vinculada
    if (!empresa && rawSolicitudes.length > 0) {
      const solId = Array.isArray(r.fields["Solicitud"])
        ? (r.fields["Solicitud"][0]?.id || r.fields["Solicitud"][0])
        : null;
      if (solId) {
        const sol = rawSolicitudes.find((s) => s.id === solId);
        if (sol) empresa = sol.fields["Empresa"] || "";
      }
    }
    return {
    id: r.id,
    nombre:      r.fields["Préstamo"] || `Crédito #${r.fields["Número Crédito"]}`,
    empresa,
    solicitante: r.fields["Solicitud"]?.[0]?.name || "",
    desembolsado:r.fields["Monto Desembolsado"] || 0,
    totalCuotas: r.fields["Total Cuotas"] || 0,
    pagadas:     r.fields["Cuotas Pagadas"] || 0,
    pendientes:  r.fields["Cuotas Pendientes"] || 0,
    valorCuota:  r.fields["Valor Cuota"] || 0,
    totalPagado: r.fields["Total Pagado"] || 0,
    saldo:       r.fields["Saldo Pendiente"] || 0,
    proximoPago: r.fields["Próximo Pago"] || "",
    estado:      r.fields["Estado Préstamo"]?.name || r.fields["Estado Préstamo"] || "Activo",
    };
  });
}

// ─── STYLES (inline responsive) ───────────────────────────────────────────────
const isMobile = () => window.innerWidth < 640;

const card = {
  background:   "rgba(13,16,30,0.92)",
  border:       "1px solid rgba(255,255,255,0.07)",
  borderRadius: 16,
  padding:      "20px",
};

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, accent = "#818CF8" }) {
  return (
    <div style={{ ...card, border: `1px solid ${accent}30`, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, right: 0, width: 60, height: 60, background: `${accent}12`, borderRadius: "0 16px 0 60px" }} />
      <div style={{ fontSize: 18, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 9, color: "#6B7280", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent, fontFamily: "'Bricolage Grotesque',sans-serif", lineHeight: 1.1, marginBottom: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#4B5563" }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ estado }) {
  const color = STATUS_COLOR[estado] || "#6B7280";
  return (
    <span style={{ background: `${color}18`, color, border: `1px solid ${color}40`, padding: "3px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", fontFamily: "'IBM Plex Mono',monospace" }}>
      {estado}
    </span>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(7,9,15,0.97)", border: "1px solid #1e2235", borderRadius: 10, padding: "10px 14px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }}>
      {label && <p style={{ color: "#6B7280", marginBottom: 6 }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: "2px 0" }}>{p.name}: {typeof p.value === "number" && p.value > 5000 ? fmtShort(p.value) : p.value}</p>
      ))}
    </div>
  );
}

function SectionTitle({ children }) {
  return <h3 style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 14, fontWeight: 700, color: "#D1D5DB", marginBottom: 16 }}>{children}</h3>;
}

function FilterBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background:   active ? "rgba(129,140,248,0.85)" : "rgba(255,255,255,0.04)",
      color:        active ? "white" : "#9CA3AF",
      border:       `1px solid ${active ? "#818CF8" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 10, padding: "7px 14px", cursor: "pointer",
      fontSize: 12, fontFamily: "'Outfit',sans-serif", fontWeight: 500,
      flexShrink: 0, whiteSpace: "nowrap",
    }}>{label}</button>
  );
}

// ─── TAB GENERAL ─────────────────────────────────────────────────────────────
function TabGeneral({ solicitudes, prestamos }) {
  const totD = prestamos.reduce((s, p) => s + p.desembolsado, 0);
  const totP = prestamos.reduce((s, p) => s + p.totalPagado, 0);
  const totS = prestamos.reduce((s, p) => s + p.saldo, 0);

  const estadoData = Object.entries(
    solicitudes.reduce((acc, s) => { acc[s.estado] = (acc[s.estado] || 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value }));

  const empData = Object.entries(
    solicitudes.reduce((acc, s) => { if (s.empresa) acc[s.empresa] = (acc[s.empresa] || 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name: name.length > 11 ? name.slice(0, 10) + "…" : name, value }));

  const portData = prestamos.map((p) => ({
    name: (p.solicitante || p.nombre).split(" ")[0],
    pagado: p.totalPagado,
    saldo:  p.saldo,
  }));

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 16 }}>
        <KpiCard icon="💸" label="Desembolsado"  value={fmtShort(totD)} sub={`${prestamos.filter(p=>p.estado==="Activo").length} activos`}  accent="#F59E0B" />
        <KpiCard icon="✅" label="Recaudado"     value={fmtShort(totP)} sub="Pagos confirmados"     accent="#10B981" />
        <KpiCard icon="⏳" label="Saldo Cartera" value={fmtShort(totS)} sub="Por recaudar"           accent="#818CF8" />
        <KpiCard icon="📋" label="Solicitudes"   value={solicitudes.length} sub={`${solicitudes.filter(s=>s.estado==="Desembolsado").length} desembolsadas`} accent="#38BDF8" />
      </div>

      {/* Pie + Empresa */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14, marginBottom: 14 }}>
        <div style={card}>
          <SectionTitle>Estado de Solicitudes</SectionTitle>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, justifyContent: "center" }}>
            <ResponsiveContainer width={150} height={150}>
              <PieChart>
                <Pie data={estadoData} cx="50%" cy="50%" innerRadius={38} outerRadius={68} paddingAngle={3} dataKey="value">
                  {estadoData.map((e) => <Cell key={e.name} fill={STATUS_COLOR[e.name] || "#374151"} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 140 }}>
              {estadoData.map((e) => (
                <div key={e.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[e.name] || "#374151", flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "#9CA3AF", flex: 1 }}>{e.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: STATUS_COLOR[e.name] || "#E5E7EB", fontFamily: "'IBM Plex Mono',monospace" }}>{e.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={card}>
          <SectionTitle>Solicitudes por Empresa</SectionTitle>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={empData} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: "#9CA3AF", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#9CA3AF", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Solicitudes" radius={[5, 5, 0, 0]}>
                {empData.map((_, i) => <Cell key={i} fill={LOAN_COLORS[i % LOAN_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Portafolio */}
      <div style={card}>
        <SectionTitle>Portafolio — Pagado vs Saldo</SectionTitle>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginBottom: 10 }}>
          {[["#10B981", "Pagado"], ["#818CF8", "Saldo"]].map(([c, l]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#9CA3AF" }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />{l}
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={Math.max(80, prestamos.length * 44)}>
          <BarChart layout="vertical" data={portData} barSize={20}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
            <XAxis type="number" tickFormatter={fmtShort} tick={{ fill: "#9CA3AF", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: "#E5E7EB", fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} width={80} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="pagado" name="Pagado" fill="#10B981" stackId="a" />
            <Bar dataKey="saldo"  name="Saldo"  fill="#818CF8" stackId="a" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── TAB PRÉSTAMOS ────────────────────────────────────────────────────────────
function TabPrestamos({ prestamos }) {
  const empresasList = ["Todas", ...new Set(prestamos.map((p) => p.empresa).filter(Boolean))];
  const [filtro, setFiltro] = useState("Todas");
  const [dropOpen, setDropOpen] = useState(false);
  const filtered = filtro === "Todas" ? prestamos : prestamos.filter((p) => p.empresa === filtro);

  return (
    <div>
      {/* Barra de filtros */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>

        {/* Botón Todas */}
        <FilterBtn label="Todas" active={filtro === "Todas"} onClick={() => { setFiltro("Todas"); setDropOpen(false); }} />

        {/* Dropdown empresas */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setDropOpen((o) => !o)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: filtro !== "Todas" ? "rgba(129,140,248,0.85)" : "rgba(255,255,255,0.04)",
              color:  filtro !== "Todas" ? "white" : "#9CA3AF",
              border: `1px solid ${filtro !== "Todas" ? "#818CF8" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 10, padding: "7px 14px", cursor: "pointer",
              fontSize: 12, fontFamily: "'Outfit',sans-serif", fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            🏢 {filtro !== "Todas" ? filtro : "Empresa"}
            <span style={{ fontSize: 10, opacity: 0.7 }}>{dropOpen ? "▲" : "▼"}</span>
          </button>

          {/* Lista desplegable */}
          {dropOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 100,
              background: "#0d1020", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12, overflow: "hidden", minWidth: 200,
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
            }}>
              {empresasList.filter(e => e !== "Todas").map((e) => (
                <button
                  key={e}
                  onClick={() => { setFiltro(e); setDropOpen(false); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    background: filtro === e ? "rgba(129,140,248,0.15)" : "transparent",
                    color: filtro === e ? "#818CF8" : "#E5E7EB",
                    border: "none", borderBottom: "1px solid rgba(255,255,255,0.05)",
                    padding: "11px 16px", cursor: "pointer",
                    fontSize: 13, fontFamily: "'Outfit',sans-serif", fontWeight: filtro === e ? 600 : 400,
                  }}
                >
                  {filtro === e && <span style={{ marginRight: 8 }}>✓</span>}
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Contador */}
        <span style={{ color: "#4B5563", fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", marginLeft: "auto" }}>
          {filtered.length} préstamo{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...card, textAlign: "center", color: "#4B5563", padding: 48 }}>No hay préstamos para esta empresa.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16 }}>
          {filtered.map((p, i) => {
            const col = LOAN_COLORS[i % LOAN_COLORS.length];
            const pct = p.totalCuotas > 0 ? Math.round((p.pagadas / p.totalCuotas) * 100) : 0;
            const prox = p.proximoPago
              ? new Date(p.proximoPago).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
              : "—";
            return (
              <div key={p.id} style={{ ...card, border: `1px solid ${col}28` }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Bricolage Grotesque',sans-serif", marginBottom: 3 }}>{p.solicitante || p.nombre}</div>
                    <div style={{ fontSize: 11, color: "#6B7280", fontFamily: "'IBM Plex Mono',monospace" }}>{p.empresa}</div>
                  </div>
                  <span style={{ background: `${col}18`, color: col, border: `1px solid ${col}40`, padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace" }}>{p.estado}</span>
                </div>

                {/* Progress */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: "#6B7280" }}>Progreso</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: col, fontFamily: "'IBM Plex Mono',monospace" }}>{pct}%</span>
                  </div>
                  <div style={{ height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${col},${col}99)`, borderRadius: 4 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: "#4B5563" }}>{p.pagadas} pagadas</span>
                    <span style={{ fontSize: 10, color: "#4B5563" }}>{p.pendientes} pendientes</span>
                  </div>
                </div>

                {/* Cuota dots */}
                <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
                  {Array.from({ length: p.totalCuotas }).map((_, j) => (
                    <div key={j} style={{ flex: 1, height: 5, borderRadius: 3, background: j < p.pagadas ? col : "rgba(255,255,255,0.08)" }} />
                  ))}
                </div>

                {/* Metrics 2x2 */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {[["Desembolsado", fmt(p.desembolsado), "#E5E7EB"], ["Valor Cuota", fmt(p.valorCuota), col], ["Total Pagado", fmt(p.totalPagado), "#10B981"], ["Saldo", fmt(p.saldo), "#818CF8"]].map(([l, v, c]) => (
                    <div key={l} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "9px 11px" }}>
                      <div style={{ fontSize: 9, color: "#4B5563", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.07em" }}>{l}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: c, fontFamily: "'IBM Plex Mono',monospace" }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Next pay */}
                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "8px 11px", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "#6B7280" }}>Próximo pago</span>
                  <span style={{ fontSize: 11, color: col, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600 }}>{prox}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── TAB SOLICITUDES ──────────────────────────────────────────────────────────
function TabSolicitudes({ solicitudes }) {
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const estados = ["Todos", ...new Set(solicitudes.map((s) => s.estado))];
  const filtered = filtroEstado === "Todos" ? solicitudes : solicitudes.filter((s) => s.estado === filtroEstado);

  const montoEmpData = Object.entries(
    solicitudes.reduce((acc, s) => { if (s.empresa) acc[s.empresa] = (acc[s.empresa] || 0) + s.monto; return acc; }, {})
  ).map(([name, value]) => ({ name: name.length > 11 ? name.slice(0, 10) + "…" : name, value }));

  return (
    <div>
      {/* KPIs 2x2 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 16 }}>
        {Object.entries(STATUS_COLOR).map(([estado, color]) => {
          const count = solicitudes.filter((s) => s.estado === estado).length;
          const icon = estado === "Desembolsado" ? "✅" : estado === "Aprobado" ? "🟢" : estado === "Validado" ? "🔵" : "🟡";
          return <KpiCard key={estado} icon={icon} label={estado} value={count} sub={`${solicitudes.length > 0 ? ((count / solicitudes.length) * 100).toFixed(0) : 0}%`} accent={color} />;
        })}
      </div>

      {/* Filtros scroll horizontal */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto", paddingBottom: 6, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        {estados.map((e) => (
          <FilterBtn key={e} label={e} active={filtroEstado === e} onClick={() => setFiltroEstado(e)}
            style={{ background: filtroEstado === e ? `${STATUS_COLOR[e] || "#818CF8"}cc` : "rgba(255,255,255,0.04)" }}
          />
        ))}
      </div>

      {/* Tabla */}
      <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, fontSize: 14 }}>Listado</span>
          <span style={{ fontSize: 11, color: "#4B5563", fontFamily: "'IBM Plex Mono',monospace" }}>{filtered.length} registros</span>
        </div>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                {["Nombre", "Empresa", "Monto", "Plazo", "Cuota", "Estado"].map((h) => (
                  <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 9, color: "#6B7280", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace", borderBottom: "1px solid rgba(255,255,255,0.05)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{s.nombre}</td>
                  <td style={{ padding: "10px 12px", fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap" }}>{s.empresa}</td>
                  <td style={{ padding: "10px 12px", fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "#F59E0B", whiteSpace: "nowrap" }}>{fmtShort(s.monto)}</td>
                  <td style={{ padding: "10px 12px", fontSize: 11, color: "#6B7280" }}>{s.plazo}m</td>
                  <td style={{ padding: "10px 12px", fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "#818CF8", whiteSpace: "nowrap" }}>{fmtShort(s.cuota)}</td>
                  <td style={{ padding: "10px 12px" }}><StatusBadge estado={s.estado} /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: "#4B5563", fontSize: 12 }}>Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monto por empresa */}
      <div style={card}>
        <SectionTitle>Monto Total por Empresa</SectionTitle>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={montoEmpData} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" tick={{ fill: "#9CA3AF", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtShort} tick={{ fill: "#9CA3AF", fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" name="Monto" radius={[5, 5, 0, 0]}>
              {montoEmpData.map((_, i) => <Cell key={i} fill={LOAN_COLORS[i % LOAN_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]         = useState("general");
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [solicitudes, setSolicitudes] = useState([]);
  const [prestamos, setPrestamos]     = useState([]);
  const [lastUpdate, setLastUpdate]   = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [sR, pR] = await Promise.all([fetchTable("Solicitudes"), fetchTable("Prestamos")]);
      setSolicitudes(parseSolicitudes(sR));
      setPrestamos(parsePrestamos(pR, sR));  // pasa sR para lookup de empresa
      setLastUpdate(new Date());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const tabs = [["general", "📊 General"], ["prestamos", "💳 Préstamos"], ["solicitudes", "📋 Solicitudes"]];

  return (
    <div style={{ minHeight: "100vh", background: "#07090f" }}>
      {/* Grid overlay */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, backgroundImage: "linear-gradient(rgba(129,140,248,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(129,140,248,.025) 1px,transparent 1px)", backgroundSize: "44px 44px" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "24px 16px 48px" }}>

        {/* ── HEADER ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: "linear-gradient(135deg,#818CF8,#6366F1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "white", fontFamily: "'Bricolage Grotesque',sans-serif", boxShadow: "0 0 18px rgba(99,102,241,.35)", flexShrink: 0 }}>L</div>
            <div>
              <h1 style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
                Luqui <span style={{ color: "#818CF8" }}>Dashboard</span>
              </h1>
              <p style={{ color: "#4B5563", fontSize: 10, margin: 0, fontFamily: "'IBM Plex Mono',monospace" }}>Créditos libranza</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {lastUpdate && <span style={{ fontSize: 10, color: "#4B5563", fontFamily: "'IBM Plex Mono',monospace" }}>Act. {lastUpdate.toLocaleTimeString("es-CO")}</span>}
            <button onClick={loadData} style={{ background: "rgba(129,140,248,.1)", border: "1px solid rgba(129,140,248,.25)", borderRadius: 9, padding: "7px 12px", color: "#818CF8", cursor: "pointer", fontSize: 12, fontFamily: "'Outfit',sans-serif" }}>⟳ Actualizar</button>
          </div>
        </div>

        {/* ── TABS ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 22, background: "rgba(255,255,255,.03)", borderRadius: 12, padding: 4, width: "100%" }}>
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, background: tab === id ? "rgba(99,102,241,.8)" : "transparent",
              color: tab === id ? "white" : "#6B7280", border: "none", borderRadius: 9,
              padding: "9px 6px", cursor: "pointer", fontSize: 12, fontWeight: 500,
              fontFamily: "'Outfit',sans-serif", transition: "all .2s", textAlign: "center",
            }}>{label}</button>
          ))}
        </div>

        {/* ── CONTENT ── */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh", gap: 16 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", border: "3px solid rgba(129,140,248,.2)", borderTopColor: "#818CF8", animation: "spin .8s linear infinite" }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <p style={{ color: "#4B5563", fontSize: 13, fontFamily: "'IBM Plex Mono',monospace" }}>Cargando desde Airtable…</p>
          </div>
        ) : error ? (
          <div style={{ ...card, textAlign: "center", padding: 40 }}>
            <p style={{ color: "#F87171", fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, marginBottom: 16 }}>⚠ {error}</p>
            <button onClick={loadData} style={{ background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.3)", borderRadius: 9, padding: "8px 20px", color: "#F87171", cursor: "pointer", fontFamily: "'Outfit',sans-serif" }}>Reintentar</button>
          </div>
        ) : (
          <>
            {tab === "general"     && <TabGeneral     solicitudes={solicitudes} prestamos={prestamos} />}
            {tab === "prestamos"   && <TabPrestamos   prestamos={prestamos} />}
            {tab === "solicitudes" && <TabSolicitudes solicitudes={solicitudes} />}
          </>
        )}

        <div style={{ marginTop: 36, textAlign: "center", color: "#1F2535", fontSize: 10, fontFamily: "'IBM Plex Mono',monospace" }}>
          Luqui · Créditos Libranza · Datos en tiempo real desde Airtable
        </div>
      </div>
    </div>
  );
}
