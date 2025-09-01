// src/dashboard.js
const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

let charts = { nulos: null, stats: null, otras: null };

function selectSection(name) {
  const sections = ["inicio", "nulos", "estadisticas", "otras"];
  sections.forEach(s => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.style.display = s === name ? "block" : "none";
  });

  // Botones activos
  document.querySelectorAll(".sidebar .nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.section === name);
  });
}

async function uploadCSV(form) {
  const status = document.getElementById("upload-status");
  status.textContent = "Subiendo...";
  try {
    const fd = new FormData(form);
    // Ajusta el endpoint cuando implementes el backend:
    const res = await fetch(`${API}/upload-csv/`, { method: "POST", body: fd });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    status.textContent = "Archivo procesado ✅";
    // data debe traer métricas para graficar; por ahora hacemos dummy si no viene:
    renderCharts(data || null);
  } catch (e) {
    console.error(e);
    status.textContent = "Error al subir el CSV ❌";
  }
}

function renderCharts(payload) {
  // Datos demo si el backend aún no existe
  const demoLabels = ["A", "B", "C", "D", "E"];
  const demoVals   = [5, 3, 0, 2, 1];

  // --- Nulos
  const nulosCtx = document.getElementById("nulosChart");
  if (nulosCtx) {
    charts.nulos?.destroy();
    charts.nulos = new Chart(nulosCtx, {
      type: "bar",
      data: {
        labels: payload?.nulos?.labels || demoLabels,
        datasets: [{ label: "Nulos por columna", data: payload?.nulos?.values || demoVals }]
      }
    });
  }

  // --- Estadísticas (promedios demo)
  const statsCtx = document.getElementById("estadisticasChart");
  if (statsCtx) {
    charts.stats?.destroy();
    charts.stats = new Chart(statsCtx, {
      type: "line",
      data: {
        labels: payload?.stats?.labels || demoLabels,
        datasets: [{ label: "Promedios", data: payload?.stats?.values || [2, 4, 3, 5, 1] }]
      }
    });
  }

  // --- Otras
  const otrasCtx = document.getElementById("otrasChart");
  if (otrasCtx) {
    charts.otras?.destroy();
    charts.otras = new Chart(otrasCtx, {
      type: "pie",
      data: {
        labels: payload?.otras?.labels || demoLabels,
        datasets: [{ label: "Distribución", data: payload?.otras?.values || [10, 20, 30, 25, 15] }]
      }
    });
  }

  // Tabla simple de estadísticas (si payload trae algo)
  const tableHost = document.getElementById("estadisticas-table");
  if (tableHost) {
    tableHost.innerHTML = "";
    if (payload?.statsTable?.length) {
      const rows = payload.statsTable.map(
        r => `<tr><td>${r.metric}</td><td>${r.value}</td></tr>`
      ).join("");
      tableHost.innerHTML = `<table><thead><tr><th>Métrica</th><th>Valor</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
  }
}

export function initDashboard() {
  // Nav handlers
  document.querySelectorAll(".sidebar .nav-btn").forEach(btn => {
    btn.addEventListener("click", () => selectSection(btn.dataset.section));
  });

  // Upload handler
  const form = document.getElementById("upload-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await uploadCSV(form);
      selectSection("nulos");
    });
  }

  // Vista default + charts demo
  selectSection("inicio");
  renderCharts(null);
}
