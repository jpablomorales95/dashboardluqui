import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

// ─── HELPERS ────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n ?? 0);

const fmtShort = (n) => {
  if (!n) return "$0";
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${(n / 1_000).toFixed(0)}K`;
};

const STATUS_COLOR = {
  "Desembolsado":    "#F59E0B",
  "Aprobado":        "#10B981",
  "Validado":        "#38BDF8",
  "Pendiente RR.HH.":"#818CF8",
};

const LOAN_COLORS = ["#F59E0B", "#10B981", "#38BDF8", "#818CF8", "#F472B6"];

// ─── DATA FETCHING ───────────────────────────────────────────────────────────
const AIRTABLE_TOKEN   = import.meta.env.VITE_AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID;

const TABLE_IDS = {
  Solicitudes: "tblfv9QxoIwJfihQ8",
  Prestamos:   "tblc3tptDhAUheyNr",
  Empresas:    "tblfZT55hGROayCCk",
};

async function fetchTable(table) {
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    throw new Error("Faltan variables VITE_AIRTABLE_TOKEN o VITE_AIRTABLE_BASE_ID en Cloudflare.");
  }
  const tableId = TABLE_IDS[table];
  let allRecords = [];
  let offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Error cargando ${table}`);
    }
    const data = await res.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset || null;
  } while (offset);
  return allRecords;
}

function parseSolicitudes(records) {
  return records
    .filter((r) => r.fields["Nombre"])
    .map((r) => ({
      id: r.id,
      nombre:   r.fields["Nombre"] || "",
      empresa:  r.fields["Empresa"] || "",
      salario:  r.fields["Salario"] || 0,
      monto:    r.fields["Monto Crédito"] || 0,
      plazo:    r.fields["Plazo (meses)"] || 0,
      desembolso: r.fields["Desembolso"] || 0,
      cuota:    r.fields["Cuota Mensual"] || 0,
      estado:   r.fields["Estado"]?.name || "Sin estado",
      fecha:    r.fields["Fecha Solicitud"] || "",
      banco:    r.fields["Banco"] || "",
    }));
}

function parsePrestamos(records) {
  return records
    .filter((r) => r.fields["Monto Desembolsado"])
    .map((r) => ({
      id: r.id,
      nombre:       r.fields["Préstamo"] || `Crédito #${r.fields["Número Crédito"]}`,
      empresa:      r.fields["Empresa"]?.[0]?.name || "",
      solicitante:  r.fields["Solicitud"]?.[0]?.name || "",
      desembolsado: r.fields["Monto Desembolsado"] || 0,
      totalCuotas:  r.fields["Total Cuotas"] || 0,
      pagadas:      r.fields["Cuotas Pagadas"] || 0,
      pendientes:   r.fields["Cuotas Pendientes"] || 0,
      valorCuota:   r.fields["Valor Cuota"] || 0,
      totalPagado:  r.fields["Total Pagado"] || 0,
      saldo:        r.fields["Saldo Pendiente"] || 0,
      proximoPago:  r.fields["Próximo Pago"] || "",
      estado:       r.fields["Estado Préstamo"]?.name || "Activo",
    }));
}

function parseEmpresas(records) {
  return records
    .filter((r) => r.fields["Empresa"])
    .map((r) => ({
      id: r.id,
      nombre:     r.fields["Empresa"],
      convenio:   r.fields["Estado Convenio"]?.name || "Sin estado",
      empleados:  r.fields["Número de Empleados"] || 0,
      solicitudes: r.fields["Solicitudes"]?.length || 0,
    }));
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, accent = "#818CF8" }) {
  return (
    <div style={{
      background: "rgba(13,16,30,0.9)",
      border: `1px solid ${accent}30`,
      borderRadius: 16,
      padding: "20px 22px",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, right: 0,
        width: 70, height: 70,
        background: `${accent}12`,
        borderRadius: "0 16px 0 70px",
      }} />
      <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
      <div style={{
        fontSize: 10, color: "#6B7280", letterSpacing: "0.12em",
        textTransform: "uppercase", fontFamily: "'IBM Plex Mono', monospace",
        marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontSize: 24, fontWeight: 700, color: accent,
        fontFamily: "'Bricolage Grotesque', sans-serif",
        lineHeight: 1.1, marginBottom: 4,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#4B5563" }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ estado }) {
  const color = STATUS_COLOR[estado] || "#6B7280";
  return (
    <span style={{
      background: `${color}18`,
      color,
      border: `1px solid ${color}40`,
      padding: "3px 10px",
      borderRadius: 20,
      fontSize: 10,
      fontWeight: 600,
      whiteSpace: "nowrap",
      fontFamily: "'IBM Plex Mono', monospace",
    }}>{estado}</span>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "rgba(7,9,15,0.97)",
      border: "1px solid #1e2235",
      borderRadius: 10,
      padding: "10px 14px",
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 11,
    }}>
      {label && <p style={{ color: "#6B7280", marginBottom: 6 }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: "2px 0" }}>
          {p.name}: {typeof p.value === "number" && p.value > 5000 ? fmtShort(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

function ProgressBar({ value, max, color = "#818CF8" }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 4, overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${pct}%`,
        background: `linear-gradient(90deg, ${color}, ${color}99)`,
        borderRadius: 4,
        transition: "width 0.6s ease",
      }} />
    </div>
  );
}

// ─── TABS ────────────────────────────────────────────────────────────────────
function TabGeneral({ solicitudes, prestamos }) {
  const totalDesembolsado  = prestamos.reduce((s, p) => s + p.desembolsado, 0);
  const totalPagado        = prestamos.reduce((s, p) => s + p.totalPagado, 0);
  const totalSaldo         = prestamos.reduce((s, p) => s + p.saldo, 0);
  const activosPrestamos   = prestamos.filter((p) => p.estado === "Activo").length;

  const estadoData = Object.entries(
    solicitudes.reduce((acc, s) => { acc[s.estado] = (acc[s.estado] || 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value }));

  const empresaData = Object.entries(
    solicitudes.reduce((acc, s) => {
      if (s.empresa) acc[s.empresa] = (acc[s.empresa] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name: name.length > 12 ? name.slice(0, 11) + "…" : name, value }));

  return (
    <>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <KpiCard icon="💸" label="Total Desembolsado" value={fmtShort(totalDesembolsado)} sub={`${activosPrestamos} préstamos activos`} accent="#F59E0B" />
        <KpiCard icon="✅" label="Total Recaudado"    value={fmtShort(totalPagado)}        sub="Pagos confirmados"                    accent="#10B981" />
        <KpiCard icon="⏳" label="Saldo en Cartera"   value={fmtShort(totalSaldo)}         sub="Por recaudar"                        accent="#818CF8" />
        <KpiCard icon="📋" label="Solicitudes"         value={solicitudes.length}           sub={`${solicitudes.filter(s => s.estado === "Desembolsado").length} desembolsadas`} accent="#38BDF8" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Pie estados */}
        <div style={cardStyle}>
          <SectionTitle>Estado de Solicitudes</SectionTitle>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={estadoData} cx="50%" cy="50%" innerRadius={42} outerRadius={72} paddingAngle={3} dataKey="value">
                  {estadoData.map((e) => <Cell key={e.name} fill={STATUS_COLOR[e.name] || "#374151"} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9 }}>
              {estadoData.map((e) => (
                <div key={e.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[e.name] || "#374151", flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "#9CA3AF", flex: 1 }}>{e.name}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: STATUS_COLOR[e.name] || "#E5E7EB", fontFamily: "'IBM Plex Mono', monospace" }}>{e.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Barras empresa */}
        <div style={cardStyle}>
          <SectionTitle>Solicitudes por Empresa</SectionTitle>
          <ResponsiveContainer width="100%" height={155}>
            <BarChart data={empresaData} barSize={26}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: "#9CA3AF", fontSize: 10, fontFamily: "'IBM Plex Mono',monospace" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#9CA3AF", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Solicitudes" radius={[5, 5, 0, 0]}>
                {empresaData.map((_, i) => <Cell key={i} fill={LOAN_COLORS[i % LOAN_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Portafolio stacked */}
      <div style={cardStyle}>
        <SectionTitle>Portafolio de Créditos — Pagado vs Saldo</SectionTitle>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart layout="vertical" data={prestamos.map(p => ({
            name: p.solicitante?.split(" ")[0] || p.nombre,
            pagado: p.totalPagado,
            saldo: p.saldo,
          }))} barSize={22}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
            <XAxis type="number" tickFormatter={fmtShort} tick={{ fill: "#9CA3AF", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fill: "#E5E7EB", fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} width={90} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="pagado" name="Pagado"         fill="#10B981" stackId="a" />
            <Bar dataKey="saldo"  name="Saldo Pendiente" fill="#818CF8" stackId="a" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function TabPrestamos({ prestamos, empresas }) {
  const empresasList = ["Todas", ...new Set(prestamos.map((p) => p.empresa).filter(Boolean))];
  const [filtro, setFiltro] = useState("Todas");

  const filtered = filtro === "Todas" ? prestamos : prestamos.filter((p) => p.empresa === filtro);

  return (
    <>
      {/* Filtro empresas */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {empresasList.map((e) => (
          <button key={e} onClick={() => setFiltro(e)} style={{
            background:   filtro === e ? "rgba(129,140,248,0.85)" : "rgba(255,255,255,0.04)",
            color:        filtro === e ? "white" : "#9CA3AF",
            border:       filtro === e ? "1px solid #818CF8" : "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            padding:      "7px 16px",
            cursor:       "pointer",
            fontSize:     12,
            fontFamily:   "'Outfit', sans-serif",
            fontWeight:   500,
            transition:   "all 0.18s",
          }}>{e}</button>
        ))}
        <span style={{ marginLeft: "auto", color: "#4B5563", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", alignSelf: "center" }}>
          {filtered.length} préstamo{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "#4B5563", padding: 48 }}>
          No hay préstamos para esta empresa aún.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 }}>
          {filtered.map((p, i) => {
            const color   = LOAN_COLORS[i % LOAN_COLORS.length];
            const pct     = p.totalCuotas > 0 ? Math.round((p.pagadas / p.totalCuotas) * 100) : 0;
            const proxFmt = p.proximoPago
              ? new Date(p.proximoPago).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })
              : "—";

            return (
              <div key={p.id} style={{ ...cardStyle, border: `1px solid ${color}28` }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Bricolage Grotesque', sans-serif", marginBottom: 3 }}>
                      {p.solicitante || p.nombre}
                    </div>
                    <div style={{ fontSize: 11, color: "#6B7280", fontFamily: "'IBM Plex Mono', monospace" }}>{p.empresa}</div>
                  </div>
                  <span style={{
                    background: `${color}18`, color, border: `1px solid ${color}40`,
                    padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 600,
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}>{p.estado}</span>
                </div>

                {/* Progress */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: "#6B7280" }}>Progreso de pago</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace" }}>{pct}%</span>
                  </div>
                  <ProgressBar value={p.pagadas} max={p.totalCuotas} color={color} />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                    <span style={{ fontSize: 10, color: "#4B5563" }}>{p.pagadas} cuotas pagadas</span>
                    <span style={{ fontSize: 10, color: "#4B5563" }}>{p.pendientes} pendientes</span>
                  </div>
                </div>

                {/* Cuota dots */}
                <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
                  {Array.from({ length: p.totalCuotas }).map((_, j) => (
                    <div key={j} style={{
                      flex: 1, height: 5, borderRadius: 3,
                      background: j < p.pagadas ? color : "rgba(255,255,255,0.08)",
                    }} />
                  ))}
                </div>

                {/* Metrics */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {[
                    ["Desembolsado", fmt(p.desembolsado), "#E5E7EB"],
                    ["Valor Cuota",  fmt(p.valorCuota),  color],
                    ["Total Pagado", fmt(p.totalPagado), "#10B981"],
                    ["Saldo",        fmt(p.saldo),       "#818CF8"],
                  ].map(([lbl, val, col]) => (
                    <div key={lbl} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontSize: 9, color: "#4B5563", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>{lbl}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: col, fontFamily: "'IBM Plex Mono', monospace" }}>{val}</div>
                    </div>
                  ))}
                </div>

                {/* Next payment */}
                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "9px 12px", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "#6B7280" }}>Próximo pago</span>
                  <span style={{ fontSize: 11, color, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{proxFmt}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function TabSolicitudes({ solicitudes }) {
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const estados = ["Todos", ...new Set(solicitudes.map((s) => s.estado))];
  const filtered = filtroEstado === "Todos" ? solicitudes : solicitudes.filter((s) => s.estado === filtroEstado);

  const montoEmpresaData = Object.entries(
    solicitudes.reduce((acc, s) => {
      if (s.empresa) acc[s.empresa] = (acc[s.empresa] || 0) + s.monto;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name: name.length > 13 ? name.slice(0, 12) + "…" : name, value }));

  return (
    <>
      {/* Estado KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {Object.entries(STATUS_COLOR).map(([estado, color]) => {
          const count = solicitudes.filter(s => s.estado === estado).length;
          return (
            <KpiCard key={estado}
              icon={estado === "Desembolsado" ? "✅" : estado === "Aprobado" ? "🟢" : estado === "Validado" ? "🔵" : "🟡"}
              label={estado} value={count}
              sub={`${solicitudes.length > 0 ? ((count / solicitudes.length) * 100).toFixed(0) : 0}% del total`}
              accent={color}
            />
          );
        })}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {estados.map((e) => (
          <button key={e} onClick={() => setFiltroEstado(e)} style={{
            background:   filtroEstado === e ? `${STATUS_COLOR[e] || "#818CF8"}cc` : "rgba(255,255,255,0.04)",
            color:        filtroEstado === e ? "white" : "#9CA3AF",
            border:       `1px solid ${filtroEstado === e ? STATUS_COLOR[e] || "#818CF8" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 10, padding: "6px 14px", cursor: "pointer",
            fontSize: 11, fontFamily: "'Outfit', sans-serif",
          }}>{e}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ ...cardStyle, padding: 0, marginBottom: 20, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 700, fontSize: 14 }}>Listado de Solicitudes</span>
          <span style={{ fontSize: 11, color: "#4B5563", fontFamily: "'IBM Plex Mono', monospace" }}>{filtered.length} registros</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                {["Nombre", "Empresa", "Salario", "Monto", "Plazo", "Cuota Mensual", "Estado"].map((h) => (
                  <th key={h} style={{
                    padding: "10px 16px", textAlign: "left",
                    fontSize: 9, color: "#6B7280", fontWeight: 600,
                    letterSpacing: "0.1em", textTransform: "uppercase",
                    fontFamily: "'IBM Plex Mono', monospace",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>{s.nombre}</td>
                  <td style={{ padding: "11px 16px", fontSize: 11, color: "#9CA3AF" }}>{s.empresa}</td>
                  <td style={{ padding: "11px 16px", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}>{fmtShort(s.salario)}</td>
                  <td style={{ padding: "11px 16px", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: "#F59E0B" }}>{fmtShort(s.monto)}</td>
                  <td style={{ padding: "11px 16px", fontSize: 11, color: "#6B7280" }}>{s.plazo}m</td>
                  <td style={{ padding: "11px 16px", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: "#818CF8" }}>{fmtShort(s.cuota)}</td>
                  <td style={{ padding: "11px 16px" }}><StatusBadge estado={s.estado} /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#4B5563", fontSize: 12 }}>Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monto bar */}
      <div style={cardStyle}>
        <SectionTitle>Monto Total Solicitado por Empresa</SectionTitle>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={montoEmpresaData} barSize={32}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" tick={{ fill: "#9CA3AF", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtShort} tick={{ fill: "#9CA3AF", fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" name="Monto" radius={[6, 6, 0, 0]}>
              {montoEmpresaData.map((_, i) => <Cell key={i} fill={LOAN_COLORS[i % LOAN_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const cardStyle = {
  background:   "rgba(13,16,30,0.92)",
  border:       "1px solid rgba(255,255,255,0.07)",
  borderRadius: 16,
  padding:      "22px 24px",
};

function SectionTitle({ children }) {
  return (
    <h3 style={{
      fontFamily: "'Bricolage Grotesque', sans-serif",
      fontSize: 14, fontWeight: 700,
      color: "#D1D5DB", marginBottom: 18,
    }}>{children}</h3>
  );
}

// ─── LOADING / ERROR ──────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16 }}>
      <div style={{
        width: 40, height: 40, borderRadius: "50%",
        border: "3px solid rgba(129,140,248,0.2)",
        borderTopColor: "#818CF8",
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ color: "#4B5563", fontSize: 13, fontFamily: "'IBM Plex Mono', monospace" }}>Cargando datos desde Airtable…</p>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]             = useState("general");
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [solicitudes, setSolicitudes] = useState([]);
  const [prestamos, setPrestamos]   = useState([]);
  const [empresas, setEmpresas]     = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [solRaw, preRaw, empRaw] = await Promise.all([
        fetchTable("Solicitudes"),
        fetchTable("Prestamos"),
        fetchTable("Empresas"),
      ]);
      setSolicitudes(parseSolicitudes(solRaw));
      setPrestamos(parsePrestamos(preRaw));
      setEmpresas(parseEmpresas(empRaw));
      setLastUpdate(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const tabs = [
    ["general",     "📊 General"],
    ["prestamos",   "💳 Préstamos"],
    ["solicitudes", "📋 Solicitudes"],
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#07090f", position: "relative" }}>
      {/* Grid overlay */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: "linear-gradient(rgba(129,140,248,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(129,140,248,0.025) 1px,transparent 1px)",
        backgroundSize: "44px 44px",
      }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "32px 24px 48px" }}>

        {/* ── HEADER ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: "linear-gradient(135deg, #818CF8, #6366F1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, fontWeight: 800, color: "white",
              fontFamily: "'Bricolage Grotesque', sans-serif",
              boxShadow: "0 0 20px rgba(99,102,241,0.35)",
            }}>L</div>
            <div>
              <h1 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
                Luqui <span style={{ color: "#818CF8" }}>Dashboard</span>
              </h1>
              <p style={{ color: "#4B5563", fontSize: 11, margin: 0, fontFamily: "'IBM Plex Mono', monospace" }}>
                Sistema de créditos libranza
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {lastUpdate && (
              <span style={{ fontSize: 10, color: "#4B5563", fontFamily: "'IBM Plex Mono', monospace" }}>
                Act. {lastUpdate.toLocaleTimeString("es-CO")}
              </span>
            )}
            <button onClick={loadData} style={{
              background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.25)",
              borderRadius: 9, padding: "7px 14px", color: "#818CF8",
              cursor: "pointer", fontSize: 12, fontFamily: "'Outfit', sans-serif",
            }}>⟳ Actualizar</button>
          </div>
        </div>

        {/* ── TABS ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 4, width: "fit-content" }}>
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              background:   tab === id ? "rgba(99,102,241,0.8)" : "transparent",
              color:        tab === id ? "white" : "#6B7280",
              border:       "none", borderRadius: 9,
              padding:      "8px 20px", cursor: "pointer",
              fontSize:     13, fontWeight: 500,
              fontFamily:   "'Outfit', sans-serif",
              transition:   "all 0.2s",
            }}>{label}</button>
          ))}
        </div>

        {/* ── CONTENT ── */}
        {loading ? (
          <Spinner />
        ) : error ? (
          <div style={{ ...cardStyle, textAlign: "center", padding: 48 }}>
            <p style={{ color: "#F87171", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, marginBottom: 16 }}>⚠ {error}</p>
            <button onClick={loadData} style={{
              background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
              borderRadius: 9, padding: "8px 20px", color: "#F87171", cursor: "pointer",
              fontFamily: "'Outfit', sans-serif",
            }}>Reintentar</button>
          </div>
        ) : (
          <>
            {tab === "general"     && <TabGeneral     solicitudes={solicitudes} prestamos={prestamos} />}
            {tab === "prestamos"   && <TabPrestamos   prestamos={prestamos} empresas={empresas} />}
            {tab === "solicitudes" && <TabSolicitudes solicitudes={solicitudes} />}
          </>
        )}

        {/* ── FOOTER ── */}
        <div style={{ marginTop: 40, textAlign: "center", color: "#1F2535", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }}>
          Luqui · Créditos Libranza · Datos en tiempo real desde Airtable
        </div>
      </div>
    </div>
  );
}
