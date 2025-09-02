// src/dashboard.js
import { Chart } from "chart.js/auto";

const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

let charts = { nulos: null, stats: null, otras: null };
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
    console.error(e);
    status.textContent = "Error al subir el CSV ❌";
  }
}

/* ---------- Helpers para Nulos ---------- */
function computeNullsSeries(payload, mode) {
  const labels = payload.nulos.labels;
  if (mode === "percent") {
    const total = Math.max(1, payload.rows); // evita división por 0
    const values = payload.nulos.values.map(v => (v * 100) / total);
    return { labels, values, isPercent: true };
  }
  // conteo
  return { labels, values: payload.nulos.values.slice(), isPercent: false };
}

function renderNullsChart(payload) {
  const select = document.getElementById("nulls-mode");
  const mode = select ? select.value : "count";
  const { labels, values, isPercent } = computeNullsSeries(payload, mode);
  const ctx = document.getElementById("nulosChart");
  if (!ctx) return;

  charts.nulos?.destroy();
  charts.nulos = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: isPercent ? "Nulos (%)" : "Nulos por columna",
        data: values
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }},
      scales: {
        x: { ticks: { autoSkip: true }},
        y: {
          suggestedMin: 0,
          suggestedMax: isPercent ? 100 : undefined,
          ticks: {
            callback: (val) => isPercent ? `${val}%` : Number(val).toLocaleString()
          }
        }
      }
    }
  });
}

/* ---------- Render de pestañas ---------- */
function renderCharts(payload, section = null) {
  // --- Nulos
  if (!section || section === "nulos") {
    renderNullsChart(payload);
  }

  // --- Estadísticas (medias) + tabla
  if (!section || section === "estadisticas") {
    const ctx = document.getElementById("estadisticasChart");
    const hasNumerics = payload.stats && payload.stats.labels && payload.stats.labels.length;

    if (ctx) {
      charts.stats?.destroy();
      charts.stats = new Chart(ctx, {
        type: "bar",
        data: hasNumerics ? {
          labels: payload.stats.labels,
          datasets: [{ label: "Media", data: payload.stats.values }]
        } : { labels: [], datasets: [] },
        options: { responsive: true }
      });
    }

    const host = document.getElementById("estadisticas-table");
    if (host) {
      if (!hasNumerics) {
        host.innerHTML = `<p>No se encontraron columnas numéricas para estadísticas.</p>`;
      } else {
        const { columns, metrics, values } = payload.statsTable; // filas=metrics, cols=columns
        let html = `<div class="table-wrap"><table><thead><tr><th>Métrica</th>${columns.map(c=>`<th>${c}</th>`).join("")}</tr></thead><tbody>`;
        for (let i=0; i<metrics.length; i++){
          html += `<tr><td>${metrics[i]}</td>${values[i].map(v => `<td>${fmt(v)}</td>`).join("")}</tr>`;
        }
        html += `</tbody></table></div>`;
        host.innerHTML = html;
      }
    }
  }

  // --- Otras (duplicados)
  if (!section || section === "otras") {
    const ctx = document.getElementById("otrasChart");
    if (ctx) {
      charts.otras?.destroy();
      charts.otras = new Chart(ctx, {
        type: "pie",
        data: {
          labels: payload.otras.labels,
          datasets: [{ label: "Duplicados", data: payload.otras.values }]
        },
        options: { responsive: true }
      });
    }
  }
}

/* ---------- Init ---------- */
function initNav() {
  document.querySelectorAll(".sidebar .nav-btn").forEach(btn => {
    btn.addEventListener("click", () => selectSection(btn.dataset.section));
  });

  // Redibuja nulos cuando cambia el modo Conteo/% (si existe el selector)
  const select = document.getElementById("nulls-mode");
  if (select) {
    select.addEventListener("change", () => {
      if (lastPayload) renderNullsChart(lastPayload);
    });
  }
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

document.addEventListener('DOMContentLoaded', initDashboard);
