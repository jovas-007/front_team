// src/main.js
const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

let charts = { nulos: null, stats: null, otras: null };
let lastPayload = null;

function selectSection(name) {
  const sections = ["inicio", "nulos", "estadisticas", "otras"];
  sections.forEach(s => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.style.display = s === name ? "block" : "none";
  });
  document.querySelectorAll(".sidebar .nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.section === name);
  });
  // Redibuja al entrar a la pestaña si ya hay datos
  if (lastPayload) renderCharts(lastPayload, name);
}

async function uploadCSV(form) {
  const status = document.getElementById("upload-status");
  status.textContent = "Subiendo...";
  try {
    const fd = new FormData(form);
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

function renderCharts(payload, section = null) {
  // --- Nulos (barras)
  if (!section || section === "nulos") {
    const ctx = document.getElementById("nulosChart");
    if (ctx) {
      charts.nulos?.destroy();
      charts.nulos = new Chart(ctx, {
        type: "bar",
        data: {
          labels: payload.nulos.labels,
          datasets: [{ label: "Nulos por columna", data: payload.nulos.values }]
        },
        options: { responsive: true }
      });
    }
  }

  // --- Estadísticas (barras de la media) + tabla
  if (!section || section === "estadisticas") {
    const ctx = document.getElementById("estadisticasChart");
    if (ctx) {
      charts.stats?.destroy();
      charts.stats = new Chart(ctx, {
        type: "bar",
        data: {
          labels: payload.stats.labels,
          datasets: [{ label: "Media", data: payload.stats.values }]
        },
        options: { responsive: true }
      });
    }

    const host = document.getElementById("estadisticas-table");
    if (host && payload.statsTable) {
      const { columns, metrics, values } = payload.statsTable; // values: filas=metrics, cols=columns
      let html = `<div class="table-wrap"><table><thead><tr><th>Métrica</th>${columns.map(c=>`<th>${c}</th>`).join("")}</tr></thead><tbody>`;
      for (let i=0; i<metrics.length; i++){
        html += `<tr><td>${metrics[i]}</td>${values[i].map(v => (v ?? "")).map(v => `<td>${typeof v==="number" ? Number(v).toLocaleString() : v}</td>`).join("")}</tr>`;
      }
      html += `</tbody></table></div>`;
      host.innerHTML = html;
    }
  }

  // --- Otras (pie de duplicados)
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

function initNav() {
  document.querySelectorAll(".sidebar .nav-btn").forEach(btn => {
    btn.addEventListener("click", () => selectSection(btn.dataset.section));
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

(function bootstrap(){
  initNav();
  initUpload();
  selectSection("inicio"); // vista inicial
})();
