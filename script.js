/**
 * @fileoverview Lógica principal para el Evaluador de Proyectos de Ingeniería Económica.
 * Maneja la entrada de datos, cálculos financieros (VPN, VAE, TIR, B/C), visualización de gráficos
 * y exportación de reportes.
 * @version 1.1.0 — Correcciones de bugs y mejoras de robustez.
 */

// ==========================================
// VARIABLES DE ESTADO GLOBAL
// ==========================================

/** @type {Array<Object>} Almacena la lista de proyectos registrados en la sesión actual. */
let projects = [];

// Instancias de gráficos Chart.js (necesarias para destruir/redibujar)
let chartVPNInstance = null;
let chartFlowsInstance = null;
let chartSensitivityInstance = null;

// ==========================================
// INICIALIZACIÓN Y MANEJO DE EVENTOS (DOM)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {

    // 1. Recuperar persistencia y renderizar estado inicial
    cargarDeLocalStorage();
    actualizarUI();

    // 2. Control de la Pantalla de Carga (Splash Screen)
    window.addEventListener('load', () => {
        setTimeout(() => {
            const loader = document.getElementById('loader-wrapper');
            if (loader) {
                loader.classList.add('hidden-loader');
                setTimeout(() => { loader.style.display = 'none'; }, 500);
            }
        }, 2000);
    });

    // 3. Bindings de Eventos
    document.getElementById('addProjectForm').addEventListener('submit', (e) => {
        e.preventDefault();
        agregarProyecto();
    });

    document.getElementById('btnUpdateTmar').addEventListener('click', recalcularTodo);
    document.getElementById('btnReset').addEventListener('click', borrarTodo);
    document.getElementById('btnPdf').addEventListener('click', generarPDF);

    // 4. Validación en tiempo real del input TMAR
    document.getElementById('globalTmar').addEventListener('input', function () {
        const val = parseFloat(this.value);
        if (isNaN(val) || val < 0 || val > 100) {
            this.classList.add('is-invalid');
        } else {
            this.classList.remove('is-invalid');
        }
    });
});

// ==========================================
// LÓGICA DE NEGOCIO Y CONTROL DE DATOS
// ==========================================

/**
 * Captura los datos del formulario, procesa los flujos según el modo seleccionado
 * (Constante o Variable) y agrega el proyecto al estado global.
 */
function agregarProyecto() {
    // 1. Captura de datos generales
    const nombre = document.getElementById('pNombre').value.trim();
    const inversionInput = document.getElementById('pInversion').value;

    // Validación básica
    if (!nombre || !inversionInput) {
        mostrarToast("error", "Nombre e Inversión son campos obligatorios.");
        return;
    }
    const inversion = parseFloat(inversionInput);
    if (inversion <= 0) {
        mostrarToast("error", "La inversión inicial debe ser un valor positivo.");
        return;
    }
    // Verificar nombre duplicado
    if (projects.some(p => p.nombre.toLowerCase() === nombre.toLowerCase())) {
        mostrarToast("warning", `Ya existe un proyecto con el nombre "${nombre}".`);
        return;
    }

    let flujos = [];
    let vidaUtil = 0;

    // 2. Determinación del Modo de Entrada (Pestañas)
    const tabConstante = document.getElementById('constante-tab');
    const esModoConstante = tabConstante.classList.contains('active');

    if (esModoConstante) {
        // --- MODO ANUALIDAD CONSTANTE ---
        const nInput = document.getElementById('pN').value;
        const aInput = document.getElementById('pAnualidad').value;
        const vsInput = document.getElementById('pSalvamento').value || 0;

        if (!nInput || !aInput) {
            mostrarToast("error", "Modo Anualidad: Vida Útil y Flujo Anual son obligatorios.");
            return;
        }

        const n = parseInt(nInput);
        if (n <= 0 || n > 100) {
            mostrarToast("error", "La vida útil debe estar entre 1 y 100 años.");
            return;
        }

        const anualidad = parseFloat(aInput);
        const salvamento = parseFloat(vsInput);

        // Generación del vector de flujos
        for (let i = 0; i < n; i++) {
            let monto = anualidad;
            if (i === n - 1) monto += salvamento; // Suma VS al último año
            flujos.push(monto);
        }
        vidaUtil = n;

    } else {
        // --- MODO FLUJOS VARIABLES ---
        const manualInput = document.getElementById('pFlujosManual').value;
        const vsVarInput = document.getElementById('pSalvamentoVar').value || 0;

        if (!manualInput.trim()) {
            mostrarToast("error", "Modo Variable: Ingrese los flujos operativos.");
            return;
        }

        // FIX BUG #5: Renombrada variable de shadowing 'n' → 'numVal'
        flujos = manualInput.split(',').map(str => parseFloat(str.trim())).filter(numVal => !isNaN(numVal));
        const salvamentoVar = parseFloat(vsVarInput);

        if (flujos.length === 0) {
            mostrarToast("error", "No se detectaron flujos numéricos válidos.");
            return;
        }

        if (salvamentoVar !== 0) {
            flujos[flujos.length - 1] += salvamentoVar;
        }
        vidaUtil = flujos.length;
    }

    // FIX BUG #4: Guardia contra vidaUtil = 0 (no debería pasar, pero por seguridad)
    if (vidaUtil === 0) {
        mostrarToast("error", "Error interno: vida útil resultó 0.");
        return;
    }

    // 3. Construcción del Objeto Proyecto
    const nuevoProyecto = {
        id: Date.now(),
        nombre,
        inversion,
        flujos,
        vidaUtil
    };

    // 4. Actualización de Estado y UI
    projects.push(nuevoProyecto);
    guardarEnLocalStorage();
    actualizarUI();
    mostrarToast("success", `Proyecto "${nombre}" agregado correctamente.`);

    // FIX BUG #6: Limpiar TODOS los campos del formulario (incluyendo modo Anualidad)
    document.getElementById('pNombre').value = "";
    document.getElementById('pInversion').value = "";
    document.getElementById('pN').value = "";
    document.getElementById('pAnualidad').value = "";
    document.getElementById('pSalvamento').value = "0";
    document.getElementById('pFlujosManual').value = "";
    document.getElementById('pSalvamentoVar').value = "0";
    document.getElementById('pNombre').focus();
}

/** Recalcula métricas al cambiar la TMAR global. */
function recalcularTodo() {
    const tmar = parseFloat(document.getElementById('globalTmar').value);
    if (isNaN(tmar) || tmar < 0) {
        mostrarToast("error", "Ingrese una TMAR válida (≥ 0).");
        return;
    }
    actualizarUI();
}

/** Elimina todos los proyectos y limpia el localStorage. */
function borrarTodo() {
    if (confirm("ATENCIÓN: Se eliminarán todos los proyectos. ¿Desea continuar?")) {
        projects = [];
        localStorage.removeItem('ecoProjectsPDF');
        actualizarUI();
    }
}

/**
 * Elimina un proyecto específico por ID.
 * Expuesto globalmente (window) para ser llamado desde el HTML inyectado.
 * @param {number} id - ID único del proyecto.
 */
window.eliminarProyecto = function (id) {
    projects = projects.filter(p => p.id !== id);
    guardarEnLocalStorage();
    actualizarUI();
};

// ==========================================
// MOTOR DE CÁLCULO FINANCIERO
// ==========================================

/**
 * Calcula los indicadores financieros clave para un proyecto.
 * @param {Object} proyecto - Objeto del proyecto.
 * @param {number} tmar - Tasa Mínima Atractiva de Rendimiento (%).
 * @returns {Object} Objeto con vpn, vae, tir y bc calculados.
 */
function calcularMetricas(proyecto, tmar) {
    const i = tmar / 100;
    let vpn = -proyecto.inversion;
    let vpIngresos = 0;

    // Cálculo de VPN y VP de Ingresos (para B/C)
    proyecto.flujos.forEach((f, idx) => {
        const factor = Math.pow(1 + i, idx + 1);
        vpn += f / factor;
        if (f > 0) vpIngresos += f / factor;
    });

    // Relación Beneficio/Costo
    const bc = proyecto.inversion > 0 ? vpIngresos / proyecto.inversion : 0;

    // Tasa Interna de Retorno
    const tir = calcularTIR(proyecto.inversion, proyecto.flujos);

    // Valor Anual Equivalente (VAE)
    // Formula: VAE = VPN * [ i(1+i)^n / ((1+i)^n - 1) ]
    let vae = 0;
    // FIX BUG #4: Guardia contra vidaUtil = 0
    if (proyecto.vidaUtil <= 0) {
        vae = 0;
    } else if (i === 0) {
        vae = vpn / proyecto.vidaUtil;
    } else {
        const factorRecuperacion = (i * Math.pow(1 + i, proyecto.vidaUtil)) / (Math.pow(1 + i, proyecto.vidaUtil) - 1);
        vae = vpn * factorRecuperacion;
    }

    return { vpn, vae, tir, bc };
}

/**
 * Calcula la TIR utilizando el método numérico de Newton-Raphson con
 * validación de convergencia y guardia contra valores inválidos.
 * FIX BUG #3: Añadida detección de divergencia (NaN, Infinity, x fuera de [-0.999, 10]).
 * @param {number} inv - Inversión inicial.
 * @param {Array<number>} flujos - Array de flujos netos.
 * @returns {string} TIR formateada como porcentaje o "N/A".
 */
function calcularTIR(inv, flujos) {
    let x0 = 0.1; // Estimación inicial (10%)
    const MAX_ITER = 1000;
    const TOLERANCIA = 0.00001;
    const X_MIN = -0.999; // Límite inferior: tasa > -100%
    const X_MAX = 10.0;   // Límite superior: 1000% (valores mayores son economicamente irreales)

    for (let k = 0; k < MAX_ITER; k++) {
        let f = -inv;
        let df = 0;

        for (let t = 0; t < flujos.length; t++) {
            const base = 1 + x0;
            // Evitar base cero o negativa (singularidad matemática)
            if (Math.abs(base) < 1e-9) return "N/A";
            f += flujos[t] / Math.pow(base, t + 1);
            df -= (t + 1) * flujos[t] / Math.pow(base, t + 2);
        }

        // FIX: Detectar derivada casi cero (punto de inflexión o flujo plano)
        if (Math.abs(df) < 1e-9) return "N/A";

        const x1 = x0 - f / df;

        // FIX: Detectar divergencia o valores no numéricos
        if (!isFinite(x1) || isNaN(x1)) return "N/A";

        // FIX: Detectar salida de rango económicamente válido
        if (x1 < X_MIN || x1 > X_MAX) return "N/A";

        if (Math.abs(x1 - x0) < TOLERANCIA) {
            // Verificación final: confirmar que realmente es raíz
            let verificacion = -inv;
            flujos.forEach((f, t) => { verificacion += f / Math.pow(1 + x1, t + 1); });
            if (Math.abs(verificacion) > 1) return "N/A"; // No convergió realmente
            return (x1 * 100).toFixed(2);
        }
        x0 = x1;
    }
    return "N/A";
}

// ==========================================
// RENDERIZADO DE UI Y GRÁFICOS
// ==========================================

/**
 * Función maestra de renderizado.
 * Recalcula métricas, actualiza la tabla HTML y redibuja los gráficos.
 */
function actualizarUI() {
    const tmarVal = document.getElementById('globalTmar').value;
    const tmar = parseFloat(tmarVal) || 0;
    const tbody = document.getElementById('projectsTableBody');
    tbody.innerHTML = '';

    // FIX BUG #8: Estado vacío visual cuando no hay proyectos
    if (projects.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted py-5">
                    <i class="fas fa-folder-open fa-2x mb-2 d-block"></i>
                    No hay proyectos registrados. Agregue uno usando el formulario.
                </td>
            </tr>`;
        document.getElementById('winnerAlert').style.display = 'none';
        // Limpiar gráficos si no hay datos
        actualizarGraficos([]);
        return;
    }

    let maxVPN = -Infinity;
    let winnerID = null;

    // 1. Procesamiento de datos
    const resultados = projects.map(p => {
        const m = calcularMetricas(p, tmar);
        if (m.vpn > maxVPN) {
            maxVPN = m.vpn;
            winnerID = p.id;
        }
        return { ...p, ...m };
    });

    // 2. Generación de tabla HTML
    resultados.forEach(p => {
        const isWinner = p.id === winnerID && p.vpn > 0;
        const tr = document.createElement('tr');
        if (isWinner) tr.classList.add('winner-row');

        // FIX BUG #2: Mostrar TIR correctamente — "N/A" sin signo "%"
        const tirDisplay = p.tir === "N/A" ? "N/A" : `${p.tir}%`;
        const vaeClass = p.vae >= 0 ? 'text-success' : 'text-danger';

        tr.innerHTML = `
            <td>${p.nombre} ${isWinner ? '<i class="fas fa-crown text-warning" title="Mejor Opción"></i>' : ''}</td>
            <td>$${p.inversion.toLocaleString()}</td>
            <td>${p.vidaUtil} años</td>
            <td class="${p.vpn >= 0 ? 'text-success' : 'text-danger'} fw-bold">$${p.vpn.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td class="${vaeClass}">$${p.vae.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td>${tirDisplay}</td>
            <td>${p.bc.toFixed(2)}</td>
            <td class="no-print">
                <button class="btn btn-outline-danger btn-sm" onclick="eliminarProyecto(${p.id})">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 3. Alerta de Ganador
    const winnerAlert = document.getElementById('winnerAlert');
    if (winnerID && maxVPN > 0) {
        winnerAlert.style.display = 'block';
        document.getElementById('winnerName').innerText = resultados.find(r => r.id === winnerID).nombre;
    } else {
        winnerAlert.style.display = 'none';
    }

    // 4. Actualización de Gráficos
    actualizarGraficos(resultados);
}

/**
 * Gestiona la creación y actualización de los gráficos Chart.js.
 * @param {Array} datos - Lista de proyectos con métricas calculadas.
 */
function actualizarGraficos(datos) {
    const colors = ['#0d6efd', '#dc3545', '#198754', '#ffc107', '#6610f2'];

    // --- GRÁFICO 1: VPN (Barras) ---
    const ctxVPN = document.getElementById('chartVPN');
    if (chartVPNInstance) chartVPNInstance.destroy();

    // FIX BUG #7: Solo renderizar si hay datos
    if (datos.length === 0) {
        chartVPNInstance = null;
        if (chartFlowsInstance) { chartFlowsInstance.destroy(); chartFlowsInstance = null; }
        if (chartSensitivityInstance) { chartSensitivityInstance.destroy(); chartSensitivityInstance = null; }
        return;
    }

    chartVPNInstance = new Chart(ctxVPN, {
        type: 'bar',
        data: {
            labels: datos.map(d => d.nombre),
            datasets: [{
                label: 'Valor Presente Neto ($)',
                data: datos.map(d => d.vpn),
                backgroundColor: datos.map((d, i) => colors[i % colors.length])
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: ctx => ` $${ctx.raw.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                    }
                }
            }
        }
    });

    // --- GRÁFICO 2: Sensibilidad (Líneas Curvas) ---
    const ctxSens = document.getElementById('chartSensitivity');
    if (chartSensitivityInstance) chartSensitivityInstance.destroy();

    const sensDatasets = datos.map((d, idx) => {
        let pts = [];
        for (let r = 0; r <= 50; r += 5) {
            let v = -d.inversion;
            d.flujos.forEach((f, t) => v += f / Math.pow(1 + r / 100, t + 1));
            pts.push(v);
        }
        return {
            label: d.nombre,
            data: pts,
            borderColor: colors[idx % colors.length],
            fill: false,
            tension: 0.4
        };
    });

    chartSensitivityInstance = new Chart(ctxSens, {
        type: 'line',
        data: {
            labels: ['0%', '5%', '10%', '15%', '20%', '25%', '30%', '35%', '40%', '45%', '50%'],
            datasets: sensDatasets
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // --- GRÁFICO 3: Flujos de Caja (Perfil Temporal) ---
    const ctxFlows = document.getElementById('chartFlows');
    if (chartFlowsInstance) chartFlowsInstance.destroy();

    // FIX BUG #7: Guardia explícita antes de Math.max con spread vacío
    const maxN = datos.length > 0 ? Math.max(...datos.map(d => d.vidaUtil)) : 0;
    const labelsT = [];
    for (let i = 0; i <= maxN; i++) labelsT.push('Año ' + i);

    const flowDatasets = datos.map((d, i) => ({
        label: d.nombre,
        data: [-d.inversion, ...d.flujos],
        borderColor: colors[i % colors.length],
        backgroundColor: colors[i % colors.length],
        tension: 0.1
    }));

    chartFlowsInstance = new Chart(ctxFlows, {
        type: 'line',
        data: { labels: labelsT, datasets: flowDatasets },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// ==========================================
// MÓDULO DE EXPORTACIÓN (PDF)
// ==========================================

async function generarPDF() {
    const { jsPDF } = window.jspdf;
    const btn = document.getElementById('btnPdf');

    if (projects.length === 0) {
        mostrarToast("warning", "No hay proyectos registrados para exportar.");
        return;
    }

    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Generando...';
    btn.disabled = true;

    // FIX BUG #1: Mover el ocultamiento de .no-print FUERA del try,
    // y la restauración al bloque finally para garantizar su ejecución.
    const actions = document.querySelectorAll('.no-print');
    actions.forEach(el => el.style.display = 'none');

    try {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 10;
        let currentY = 20;

        doc.setFontSize(18);
        doc.text("Reporte de Evaluación de Proyectos", margin, currentY);
        currentY += 10;
        doc.setFontSize(10);
        doc.text(`Fecha: ${new Date().toLocaleDateString()} - TMAR Global: ${document.getElementById('globalTmar').value}%`, margin, currentY);
        currentY += 10;

        const tableEl = document.getElementById('cardTable');
        const tableCanvas = await html2canvas(tableEl, { scale: 2 });
        const tableImg = tableCanvas.toDataURL('image/png');
        const tableHeight = (tableCanvas.height * (pageWidth - 2 * margin)) / tableCanvas.width;

        doc.addImage(tableImg, 'PNG', margin, currentY, pageWidth - 2 * margin, tableHeight);
        currentY += tableHeight + 10;

        const charts = [
            { id: 'boxChartVPN', title: 'Comparativa VPN' },
            { id: 'boxChartSens', title: 'Análisis de Sensibilidad' },
            { id: 'boxChartFlows', title: 'Flujos de Caja' }
        ];

        for (const chart of charts) {
            const chartEl = document.getElementById(chart.id);
            const canvas = await html2canvas(chartEl, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            const imgHeight = (canvas.height * (pageWidth - 2 * margin)) / canvas.width;

            if (currentY + imgHeight > 280) {
                doc.addPage();
                currentY = 20;
            }

            doc.setFontSize(12);
            doc.text(chart.title, margin, currentY - 2);
            doc.addImage(imgData, 'PNG', margin, currentY, pageWidth - 2 * margin, imgHeight);
            currentY += imgHeight + 15;
        }

        doc.save('Reporte_Ingenieria_Economica.pdf');
        mostrarToast("success", "PDF generado y descargado correctamente.");

    } catch (error) {
        console.error("Error en generación PDF:", error);
        mostrarToast("error", "Hubo un error al generar el PDF. Consulte la consola para más detalles.");
    } finally {
        // FIX BUG #1: SIEMPRE restaurar elementos ocultos y el botón,
        // incluso si el try lanzó una excepción.
        actions.forEach(el => el.style.display = '');
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==========================================
// SISTEMA DE NOTIFICACIONES (TOAST)
// ==========================================

/**
 * Muestra un mensaje de notificación tipo Toast no bloqueante.
 * Reemplaza los alert() para mejor UX.
 * @param {'success'|'error'|'warning'} tipo - Tipo de notificación.
 * @param {string} mensaje - Mensaje a mostrar.
 */
function mostrarToast(tipo, mensaje) {
    const colores = { success: '#198754', error: '#dc3545', warning: '#ffc107' };
    const iconos = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle' };

    // Asegurar que exista el contenedor
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
        background:${colores[tipo]};color:white;padding:12px 18px;border-radius:8px;
        box-shadow:0 4px 12px rgba(0,0,0,0.2);display:flex;align-items:center;gap:10px;
        font-size:0.9rem;max-width:320px;animation:slideInToast 0.3s ease;
    `;
    toast.innerHTML = `<i class="fas ${iconos[tipo]}"></i><span>${mensaje}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ==========================================
// PERSISTENCIA DE DATOS
// ==========================================

function guardarEnLocalStorage() {
    try {
        localStorage.setItem('ecoProjectsPDF', JSON.stringify(projects));
    } catch (e) {
        console.warn("No se pudo guardar en localStorage:", e);
    }
}

function cargarDeLocalStorage() {
    try {
        const data = localStorage.getItem('ecoProjectsPDF');
        if (data) {
            projects = JSON.parse(data);
            // Validación básica de estructura
            if (!Array.isArray(projects)) projects = [];
        }
    } catch (e) {
        console.error("Error al leer LocalStorage:", e);
        projects = [];
    }
}
