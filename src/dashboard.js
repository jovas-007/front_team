// src/dashboard.js
import { Chart } from "chart.js/auto";

const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";
const DUP_THRESHOLD = 75; // <— umbral de duplicados por columna (en %)

// Mantén un solo Chart por canvas
const charts = { nulos: null, stats: null, otras: null, cleaning: null };
let lastPayload = null;
const SECTIONS = ["inicio", "nulos", "estadisticas", "otras"];

function selectSection(name) {
  SECTIONS.forEach(s => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.style.display = s === name ? "block" : "none";
  });
  document.querySelectorAll(".sidebar .nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.section === name);
  });
  if (lastPayload) renderCharts(lastPayload, name);
}

function fmt(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number(v).toLocaleString();
  return String(v);
}

/* ===================== Upload ===================== */
async function uploadCSV(form) {
  const status = document.getElementById("upload-status");
  status.textContent = "Subiendo...";
  try {
    const fd = new FormData(form); // input name="csv_file"
    const res = await fetch(`${API}/upload-csv/`, { method: "POST", body: fd });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    lastPayload = data;
    status.textContent = "Archivo procesado ✅";
    selectSection("nulos");
  } catch (e) {
    console.error("[uploadCSV] error:", e);
    status.textContent = "Error al subir el CSV ❌";
  }
}

/* ===================== Nulos ===================== */
function computeNullsSeries(payload, mode) {
  const n = payload?.nulos;
  const rows = Number(payload?.rows ?? 0);
  const labels = Array.isArray(n?.labels) ? n.labels : [];
  const raw = Array.isArray(n?.values) ? n.values : [];

  if (mode === "percent") {
    const total = Math.max(1, rows);
    const values = raw.map(v => (Number(v) * 100) / total);
    return { labels, values, isPercent: true };
  }
  return { labels, values: raw.slice(), isPercent: false };
}

function renderNullsChart(payload) {
  const ctx = document.getElementById("nulosChart");
  if (!ctx) return;

  const select = document.getElementById("nulls-mode");
  const mode = select ? select.value : "count";
  const { labels, values, isPercent } = computeNullsSeries(payload, mode);

  charts.nulos?.destroy();
  charts.nulos = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: isPercent ? "Nulos (%)" : "Nulos por columna", data: values }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false }},
      scales: {
        x: { ticks: { autoSkip: true }},
        y: {
          suggestedMin: 0,
          suggestedMax: isPercent ? 100 : undefined,
          ticks: { callback: v => isPercent ? `${v}%` : Number(v).toLocaleString() }
        }
      }
    }
  });
}

/* ===================== Estadísticas ===================== */
function renderStats(payload) {
  const ctx = document.getElementById("estadisticasChart");
  const host = document.getElementById("estadisticas-table");

  const statsOk = Array.isArray(payload?.stats?.labels) && Array.isArray(payload?.stats?.values)
                  && payload.stats.labels.length === payload.stats.values.length;

  // Gráfica de medias
  if (ctx) {
    charts.stats?.destroy();
    charts.stats = new Chart(ctx, {
      type: "bar",
      data: statsOk
        ? { labels: payload.stats.labels, datasets: [{ label: "Media", data: payload.stats.values }] }
        : { labels: [], datasets: [] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }

  // Tabla de métricas
  if (host) {
    if (!payload?.statsTable?.columns || !payload?.statsTable?.metrics || !payload?.statsTable?.values) {
      host.innerHTML = `<p>No se encontraron columnas numéricas para estadísticas.</p>`;
      return;
    }
    const { columns, metrics, values } = payload.statsTable;
    let html = `<div class="table-wrap"><table><thead><tr><th>Métrica</th>${columns.map(c=>`<th>${c}</th>`).join("")}</tr></thead><tbody>`;
    for (let i = 0; i < metrics.length; i++) {
      html += `<tr><td>${metrics[i]}</td>${values[i].map(v => `<td>${fmt(v)}</td>`).join("")}</tr>`;
    }
    html += `</tbody></table></div>`;
    host.innerHTML = html;
  }
}

/* ===================== Duplicados (Otras) ===================== */
function computeDupesSeries(payload, mode) {
  const byCol = payload?.dupes_by_column;
  const fallback = payload?.otras; // por compat
  let labels = [];
  let values = [];
  let isPercent = (mode === "percent");

  if (byCol?.labels?.length) {
    labels = byCol.labels;
    values = mode === "percent" ? (byCol.percent || []) : (byCol.counts || []);
  } else if (fallback?.labels?.length) {
    labels = fallback.labels;
    values = fallback.values || [];
    isPercent = false;
  }
  return { labels, values, isPercent };
}

function renderDupesChart(payload) {
  const ctx = document.getElementById("otrasChart");
  if (!ctx) return;

  const select = document.getElementById("dupes-mode");
  const mode = select ? select.value : "count";
  const { labels, values, isPercent } = computeDupesSeries(payload, mode);

  charts.otras?.destroy();
  charts.otras = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: isPercent ? "Duplicados (%)" : "Duplicados por columna", data: values }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false }},
      scales: {
        x: { ticks: { autoSkip: true }},
        y: {
          suggestedMin: 0,
          suggestedMax: isPercent ? 100 : undefined,
          ticks: { callback: v => isPercent ? `${v}%` : Number(v).toLocaleString() }
        }
      }
    }
  });
}

/* ===== Nuevo: gráfica que “referencia” las sugerencias (≥ 50% duplicados) ===== */
function renderCleaningChart(payload) {
  const canvas = document.getElementById("cleaningChart");
  if (!canvas) return;

  const labelsAll = payload?.dupes_by_column?.labels || [];
  const percAll   = payload?.dupes_by_column?.percent || [];

  // Filtra solo columnas con ≥ DUP_THRESHOLD %
  const labels = [];
  const values = [];
  labelsAll.forEach((col, i) => {
    const p = Number(percAll[i] ?? 0);
    if (p >= DUP_THRESHOLD) { labels.push(col); values.push(p); }
  });

  charts.cleaning?.destroy();

  if (labels.length) {
    // Gráfica horizontal con % duplicados de las columnas “problemáticas”
    charts.cleaning = new Chart(canvas, {
      type: "bar",
      data: { labels, datasets: [{ label: `% duplicados (≥ ${DUP_THRESHOLD}%)`, data: values }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false }},
        indexAxis: "y",
        scales: {
          x: {
            suggestedMin: 0,
            suggestedMax: 100,
            ticks: { callback: v => `${v}%` }
          }
        }
      }
    });
  } else {
    // Si no hay columnas ≥ umbral, muestra un doughnut informativo
    charts.cleaning = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: [`Sin columnas ≥ ${DUP_THRESHOLD}%`],
        datasets: [{ data: [1] }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: true } }
      }
    });
  }
}

function renderCleaningSuggestions(payload) {
  const container = document.getElementById("cleaning-suggestions");
  if (!container) return;

  const suggestions = [];
  if (payload?.dupes?.duplicates > 0) {
    suggestions.push(`Hay ${fmt(payload.dupes.duplicates)} filas duplicadas en total. Considera eliminarlas (drop duplicates).`);
  }

  if (payload?.dupes_by_column?.labels?.length) {
    payload.dupes_by_column.labels.forEach((col, i) => {
      const p = Number(payload.dupes_by_column.percent?.[i] ?? 0);
      if (p >= DUP_THRESHOLD) {
        suggestions.push(
          `La columna <strong>${col}</strong> tiene ≥ ${DUP_THRESHOLD}&nbsp;% de valores repetidos. Evalúa eliminarla o combinarla.`
        );
      }
    });
  }

  if (!suggestions.length) {
    suggestions.push("No se detectaron columnas con alta duplicación. Revisa outliers y consistencia de tipos.");
  }

  container.innerHTML = `<h3>Sugerencias de limpieza</h3><ul>${suggestions.map(s => `<li>${s}</li>`).join("")}</ul>`;
}


/* ===================== Render central ===================== */
function renderCharts(payload, section = null) {
  if (!section || section === "nulos") {
    try { renderNullsChart(payload); } catch (e) { console.error("[render nulos]", e); }
  }
  if (!section || section === "estadisticas") {
    try { renderStats(payload); } catch (e) { console.error("[render stats]", e); }
  }
  if (!section || section === "otras") {
    try {
      renderDupesChart(payload);
      renderCleaningSuggestions(payload);
      renderCleaningChart(payload);     // <—— NUEVO
    } catch (e) { console.error("[render otras]", e); }
  }
}

/* ===================== Init ===================== */
function initNav() {
  // Navegación
  document.querySelectorAll(".sidebar .nav-btn").forEach(btn => {
    btn.addEventListener("click", () => selectSection(btn.dataset.section));
  });

  // Redibuja nulos cuando cambia Conteo/%
  const nullSelect = document.getElementById("nulls-mode");
  if (nullSelect) nullSelect.addEventListener("change", () => {
    if (lastPayload) renderNullsChart(lastPayload);
  });

  // Redibuja duplicados cuando cambia Conteo/%
  const dupSelect = document.getElementById("dupes-mode");
  if (dupSelect) dupSelect.addEventListener("change", () => {
    if (lastPayload) renderDupesChart(lastPayload);
  });
}

function initUpload() {
  const form = document.getElementById("upload-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await uploadCSV(form);
  });
}

export function initDashboard() {
  initNav();
  initUpload();
  selectSection("inicio"); // vista inicial
}

document.addEventListener("DOMContentLoaded", initDashboard);
