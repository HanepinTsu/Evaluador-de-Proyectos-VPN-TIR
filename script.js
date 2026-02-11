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
    const nombre = document.getElementById('pNombre').value;
    const inversionInput = document.getElementById('pInversion').value;
    
    // Validación básica
    if(!nombre || !inversionInput) {
        alert("Error: Nombre e Inversión son campos obligatorios.");
        return;
    }
    const inversion = parseFloat(inversionInput);

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

        if(!nInput || !aInput) {
            alert("Modo Anualidad: Vida Útil y Flujo Anual son obligatorios.");
            return;
        }

        const n = parseInt(nInput);
        const anualidad = parseFloat(aInput);
        const salvamento = parseFloat(vsInput);

        // Generación del vector de flujos
        for(let i=0; i<n; i++) {
            let monto = anualidad;
            if (i === n-1) monto += salvamento; // Suma VS al último año
            flujos.push(monto);
        }
        vidaUtil = n;

    } else {
        // --- MODO FLUJOS VARIABLES (AUTOMATIZADO) ---
        const manualInput = document.getElementById('pFlujosManual').value;
        const vsVarInput = document.getElementById('pSalvamentoVar').value || 0;

        if(!manualInput) {
            alert("Modo Variable: Ingrese los flujos operativos.");
            return;
        }

        // Parsing: Convertir string CSV a array de números
        flujos = manualInput.split(',').map(numStr => parseFloat(numStr.trim())).filter(n => !isNaN(n));
        const salvamentoVar = parseFloat(vsVarInput);

        if(flujos.length === 0) {
            alert("Error: No se detectaron flujos numéricos válidos.");
            return;
        }

        // AUTOMATIZACIÓN: Sumar el Salvamento al último flujo ingresado
        // F_n = FlujoOperativo_n + ValorSalvamento
        if (salvamentoVar !== 0) {
            flujos[flujos.length - 1] += salvamentoVar;
        }
        
        vidaUtil = flujos.length;
    }

    // 3. Construcción del Objeto Proyecto
    const nuevoProyecto = {
        id: Date.now(), // ID único basado en timestamp
        nombre,
        inversion,
        flujos, 
        vidaUtil
    };

    // 4. Actualización de Estado y UI
    projects.push(nuevoProyecto);
    guardarEnLocalStorage();
    actualizarUI();
    
    // 5. Limpieza de Formulario
    document.getElementById('pNombre').value = "";
    document.getElementById('pInversion').value = "";
    document.getElementById('pFlujosManual').value = ""; // Limpiar text area
    document.getElementById('pSalvamentoVar').value = "0"; // Reset VS variable
    document.getElementById('pNombre').focus();
}

/** Recalcula métricas al cambiar la TMAR global. */
function recalcularTodo() { 
    actualizarUI(); 
}

/** Elimina todos los proyectos y limpia el localStorage. */
function borrarTodo() {
    if(confirm("ATENCIÓN: Se eliminarán todos los proyectos. ¿Desea continuar?")) {
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
window.eliminarProyecto = function(id) {
    projects = projects.filter(p => p.id !== id);
    guardarEnLocalStorage();
    actualizarUI();
}

// ==========================================
// MOTOR DE CÁLCULO FINANCIERO
// ==========================================

/**
 * Calcula los indicadores financieros clave para un proyecto.
 * @param {Object} proyecto - Objeto del proyecto.
 * @param {number} tmar - Tasa Mínima Atractiva de Rendimiento (%).
 * @returns {Object} Objeto con vpn, tir y bc calculados.
 */
function calcularMetricas(proyecto, tmar) {
    const i = tmar / 100;
    let vpn = -proyecto.inversion;
    let vpIngresos = 0;

    // Cálculo de VPN y VP de Ingresos (para B/C)
    proyecto.flujos.forEach((f, idx) => {
        let factor = Math.pow(1 + i, idx + 1);
        vpn += f / factor;
        if(f > 0) vpIngresos += f / factor;
    });

    // Relación Beneficio/Costo
    let bc = vpIngresos / proyecto.inversion;

    // Tasa Interna de Retorno
    let tir = calcularTIR(proyecto.inversion, proyecto.flujos);

    return { vpn, tir, bc };
}

/**
 * Calcula la TIR utilizando el método numérico de Newton-Raphson.
 * $x_{n+1} = x_n - f(x_n)/f'(x_n)$
 * @param {number} inv - Inversión inicial.
 * @param {Array<number>} flujos - Array de flujos netos.
 * @returns {string} TIR formateada o "N/A" si no converge.
 */
function calcularTIR(inv, flujos) {
    let x0 = 0.1; // Estimación inicial (10%)
    const MAX_ITER = 1000;
    const TOLERANCIA = 0.00001;

    for (let k = 0; k < MAX_ITER; k++) {
        let f = -inv; // Valor de la función (VPN)
        let df = 0;   // Valor de la derivada
        
        for (let t = 0; t < flujos.length; t++) {
            let base = 1 + x0;
            f += flujos[t] / Math.pow(base, t + 1);
            // Derivada de a/(1+i)^t es -t*a/(1+i)^(t+1)
            df -= (t + 1) * flujos[t] / Math.pow(base, t + 2);
        }
        
        if (Math.abs(df) < 1e-9) break; // Evitar división por cero
        
        let x1 = x0 - f / df;
        
        // Comprobar convergencia
        if (Math.abs(x1 - x0) < TOLERANCIA) {
            return (x1 * 100).toFixed(2);
        }
        x0 = x1;
    }
    return "N/A"; // No convergió
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
        if(isWinner) tr.classList.add('winner-row');

        tr.innerHTML = `
            <td>${p.nombre} ${isWinner ? '<i class="fas fa-crown text-warning" title="Mejor Opción"></i>' : ''}</td>
            <td>$${p.inversion.toLocaleString()}</td>
            <td>${p.vidaUtil} años</td>
            <td class="${p.vpn >= 0 ? 'text-success' : 'text-danger'} fw-bold">$${p.vpn.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            <td>${p.tir}%</td>
            <td>${p.bc.toFixed(2)}</td>
            <td class="no-print">
                <button class="btn btn-outline-danger btn-sm" onclick="eliminarProyecto(${p.id})"><i class="fas fa-times"></i></button>
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
 * Gestiona la creación y actualización de los gráficos Chart.js
 * @param {Array} datos - Lista de proyectos con métricas calculadas.
 */
function actualizarGraficos(datos) {
    const colors = ['#0d6efd', '#dc3545', '#198754', '#ffc107', '#6610f2'];

    // --- GRÁFICO 1: VPN (Barras) ---
    const ctxVPN = document.getElementById('chartVPN');
    if(chartVPNInstance) chartVPNInstance.destroy();
    
    chartVPNInstance = new Chart(ctxVPN, {
        type: 'bar',
        data: {
            labels: datos.map(d => d.nombre),
            datasets: [{
                label: 'Valor Presente Neto ($)',
                data: datos.map(d => d.vpn),
                backgroundColor: datos.map((d,i) => colors[i%colors.length])
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // --- GRÁFICO 2: Sensibilidad (Líneas Curvas) ---
    const ctxSens = document.getElementById('chartSensitivity');
    if(chartSensitivityInstance) chartSensitivityInstance.destroy();
    
    // Generar puntos de curva para cada proyecto
    const sensDatasets = datos.map((d, idx) => {
        let pts = [];
        // Simular tasas del 0% al 50% en pasos de 5%
        for(let r=0; r<=50; r+=5) {
            let v = -d.inversion;
            d.flujos.forEach((f, t) => v += f / Math.pow(1 + r/100, t + 1));
            pts.push(v);
        }
        return {
            label: d.nombre,
            data: pts,
            borderColor: colors[idx%colors.length],
            fill: false,
            tension: 0.4
        };
    });

    chartSensitivityInstance = new Chart(ctxSens, {
        type: 'line',
        data: { labels: ['0%','5%','10%','15%','20%','25%','30%','35%','40%','45%','50%'], datasets: sensDatasets },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // --- GRÁFICO 3: Flujos de Caja (Perfil Temporal) ---
    const ctxFlows = document.getElementById('chartFlows');
    if(chartFlowsInstance) chartFlowsInstance.destroy();
    
    const maxN = Math.max(...datos.map(d => d.vidaUtil), 0);
    let labelsT = [];
    for(let i=0; i<=maxN; i++) labelsT.push('Año ' + i);
    
    const flowDatasets = datos.map((d, i) => ({
        label: d.nombre,
        data: [-d.inversion, ...d.flujos], // Prepend inversión negativa
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

/**
 * Genera un reporte PDF capturando el estado actual de la pantalla.
 * Utiliza html2canvas para rasterizar y jsPDF para compaginar.
 */
async function generarPDF() {
    const { jsPDF } = window.jspdf;
    const btn = document.getElementById('btnPdf');
    
    if(projects.length === 0) {
        alert("No hay proyectos registrados para exportar.");
        return;
    }

    // Feedback visual de carga
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Generando...';
    btn.disabled = true;

    try {
        // Configuración A4
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth(); 
        const margin = 10;
        let currentY = 20;

        // Cabecera del Reporte
        doc.setFontSize(18);
        doc.text("Reporte de Evaluación de Proyectos", margin, currentY);
        currentY += 10;
        doc.setFontSize(10);
        doc.text(`Fecha: ${new Date().toLocaleDateString()} - TMAR Global: ${document.getElementById('globalTmar').value}%`, margin, currentY);
        currentY += 10;

        // Ocultar elementos UI no deseados en el PDF
        const actions = document.querySelectorAll('.no-print');
        actions.forEach(el => el.style.display = 'none');
        
        // 1. Captura de Tabla
        const tableEl = document.getElementById('cardTable');
        const tableCanvas = await html2canvas(tableEl, { scale: 2 });
        const tableImg = tableCanvas.toDataURL('image/png');
        const tableHeight = (tableCanvas.height * (pageWidth - 2*margin)) / tableCanvas.width;
        
        doc.addImage(tableImg, 'PNG', margin, currentY, pageWidth - 2*margin, tableHeight);
        currentY += tableHeight + 10;
        
        // Restaurar UI
        actions.forEach(el => el.style.display = '');

        // 2. Captura de Gráficos (Iterativa)
        const charts = [
            { id: 'boxChartVPN', title: 'Comparativa VPN' },
            { id: 'boxChartSens', title: 'Análisis de Sensibilidad' },
            { id: 'boxChartFlows', title: 'Flujos de Caja' }
        ];

        for (const chart of charts) {
            const chartEl = document.getElementById(chart.id);
            const canvas = await html2canvas(chartEl, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            const imgHeight = (canvas.height * (pageWidth - 2*margin)) / canvas.width;

            // Paginación automática si no cabe
            if (currentY + imgHeight > 280) {
                doc.addPage();
                currentY = 20;
            }

            doc.setFontSize(12);
            doc.text(chart.title, margin, currentY - 2);
            doc.addImage(imgData, 'PNG', margin, currentY, pageWidth - 2*margin, imgHeight);
            currentY += imgHeight + 15;
        }

        doc.save('Reporte_Ingenieria_Economica.pdf');

    } catch (error) {
        console.error("Error en generación PDF:", error);
        alert("Hubo un error al generar el PDF. Consulte la consola para más detalles.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==========================================
// PERSISTENCIA DE DATOS
// ==========================================

/** Guarda el estado actual en LocalStorage. */
function guardarEnLocalStorage() { 
    localStorage.setItem('ecoProjectsPDF', JSON.stringify(projects)); 
}

/** Carga el estado previo desde LocalStorage si existe. */
function cargarDeLocalStorage() {
    const data = localStorage.getItem('ecoProjectsPDF');
    if(data) {
        try {
            projects = JSON.parse(data);
        } catch (e) {
            console.error("Error al leer LocalStorage:", e);
            projects = [];
        }
    }
}
