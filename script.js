// --- VARIABLES GLOBALES ---
let projects = [];
let chartVPNInstance = null;
let chartFlowsInstance = null;
let chartSensitivityInstance = null;

// --- INICIALIZACIÓN Y EVENTOS ---
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Cargar datos
    cargarDeLocalStorage();
    actualizarUI();

    // 2. Manejo del Loader
    window.addEventListener('load', () => {
        setTimeout(() => {
            const loader = document.getElementById('loader-wrapper');
            if (loader) {
                loader.classList.add('hidden-loader');
                setTimeout(() => {
                    loader.style.display = 'none';
                }, 500);
            }
        }, 2000); 
    });

    // 3. Asignar eventos
    document.getElementById('addProjectForm').addEventListener('submit', (e) => {
        e.preventDefault();
        agregarProyecto();
    });

    document.getElementById('btnUpdateTmar').addEventListener('click', recalcularTodo);
    document.getElementById('btnReset').addEventListener('click', borrarTodo);
    document.getElementById('btnPdf').addEventListener('click', generarPDF);
});

// --- LÓGICA DE NEGOCIO ---

function agregarProyecto() {
    // 1. Datos Comunes
    const nombre = document.getElementById('pNombre').value;
    const inversionInput = document.getElementById('pInversion').value;
    
    if(!nombre || !inversionInput) {
        alert("Por favor completa el nombre y la inversión.");
        return;
    }
    const inversion = parseFloat(inversionInput);

    let flujos = [];
    let vidaUtil = 0;

    // 2. Detectar Modo (Pestaña Activa)
    const tabConstante = document.getElementById('constante-tab');
    const esModoConstante = tabConstante.classList.contains('active');

    if (esModoConstante) {
        // --- MODO ANUALIDAD ---
        const nInput = document.getElementById('pN').value;
        const aInput = document.getElementById('pAnualidad').value;
        const vsInput = document.getElementById('pSalvamento').value || 0;

        if(!nInput || !aInput) {
            alert("En modo anualidad, Vida Útil y Flujo Anual son obligatorios.");
            return;
        }

        const n = parseInt(nInput);
        const anualidad = parseFloat(aInput);
        const salvamento = parseFloat(vsInput);

        for(let i=0; i<n; i++) {
            let monto = anualidad;
            if (i === n-1) monto += salvamento; // Sumar salvamento al último año
            flujos.push(monto);
        }
        vidaUtil = n;

    } else {
        // --- MODO FLUJOS VARIABLES ---
        const manualInput = document.getElementById('pFlujosManual').value;
        if(!manualInput) {
            alert("Por favor ingresa los flujos separados por comas.");
            return;
        }

        // Convertir string "100, 200, 300" a array [100, 200, 300]
        flujos = manualInput.split(',').map(numStr => parseFloat(numStr.trim())).filter(n => !isNaN(n));
        
        if(flujos.length === 0) {
            alert("No se detectaron flujos válidos.");
            return;
        }
        vidaUtil = flujos.length;
    }

    // 3. Crear Objeto Proyecto
    const nuevoProyecto = {
        id: Date.now(),
        nombre,
        inversion,
        flujos, 
        vidaUtil
    };

    projects.push(nuevoProyecto);
    guardarEnLocalStorage();
    actualizarUI();
    
    // 4. Limpiar Campos (Reset parcial)
    document.getElementById('pNombre').value = "";
    document.getElementById('pInversion').value = "";
    // Opcional: Limpiar también los inputs de flujos
    document.getElementById('pFlujosManual').value = "";
    document.getElementById('pNombre').focus();
}

function recalcularTodo() { 
    actualizarUI(); 
}

function borrarTodo() {
    if(confirm("¿Borrar todos los datos?")) {
        projects = [];
        localStorage.removeItem('ecoProjectsPDF');
        actualizarUI();
    }
}

window.eliminarProyecto = function(id) {
    projects = projects.filter(p => p.id !== id);
    guardarEnLocalStorage();
    actualizarUI();
}

// --- CÁLCULOS FINANCIEROS ---
function calcularMetricas(proyecto, tmar) {
    const i = tmar / 100;
    let vpn = -proyecto.inversion;
    let vpIngresos = 0;

    proyecto.flujos.forEach((f, idx) => {
        let factor = Math.pow(1 + i, idx + 1);
        vpn += f / factor;
        if(f > 0) vpIngresos += f / factor;
    });

    let bc = vpIngresos / proyecto.inversion;
    let tir = calcularTIR(proyecto.inversion, proyecto.flujos);

    return { vpn, tir, bc };
}

function calcularTIR(inv, flujos) {
    let x0 = 0.1; 
    for (let k = 0; k < 1000; k++) {
        let f = -inv;
        let df = 0;
        for (let t = 0; t < flujos.length; t++) {
            f += flujos[t] / Math.pow(1 + x0, t + 1);
            df -= (t + 1) * flujos[t] / Math.pow(1 + x0, t + 2);
        }
        
        if (df === 0) break;
        
        let x1 = x0 - f / df;
        if (Math.abs(x1 - x0) < 0.00001) return (x1 * 100).toFixed(2);
        x0 = x1;
    }
    return "N/A";
}

// --- UI Y GRÁFICOS ---
function actualizarUI() {
    const tmarVal = document.getElementById('globalTmar').value;
    const tmar = parseFloat(tmarVal) || 0;
    const tbody = document.getElementById('projectsTableBody');
    tbody.innerHTML = '';
    
    let maxVPN = -Infinity;
    let winnerID = null;

    const resultados = projects.map(p => {
        const m = calcularMetricas(p, tmar);
        if (m.vpn > maxVPN) {
            maxVPN = m.vpn;
            winnerID = p.id;
        }
        return { ...p, ...m };
    });

    resultados.forEach(p => {
        const isWinner = p.id === winnerID && p.vpn > 0;
        const tr = document.createElement('tr');
        if(isWinner) tr.classList.add('winner-row');

        tr.innerHTML = `
            <td>${p.nombre} ${isWinner ? '<i class="fas fa-crown text-warning"></i>' : ''}</td>
            <td>$${p.inversion.toLocaleString()}</td>
            <td>${p.vidaUtil}</td>
            <td class="${p.vpn >= 0 ? 'text-success' : 'text-danger'} fw-bold">$${p.vpn.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
            <td>${p.tir}%</td>
            <td>${p.bc.toFixed(2)}</td>
            <td class="no-print">
                <button class="btn btn-outline-danger btn-sm" onclick="eliminarProyecto(${p.id})"><i class="fas fa-times"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const winnerAlert = document.getElementById('winnerAlert');
    if (winnerID && maxVPN > 0) {
        winnerAlert.style.display = 'block';
        document.getElementById('winnerName').innerText = resultados.find(r => r.id === winnerID).nombre;
    } else {
        winnerAlert.style.display = 'none';
    }

    actualizarGraficos(resultados);
}

function actualizarGraficos(datos) {
    const colors = ['#0d6efd', '#dc3545', '#198754', '#ffc107', '#6610f2'];

    // 1. Gráfico VPN
    const ctxVPN = document.getElementById('chartVPN');
    if(chartVPNInstance) chartVPNInstance.destroy();
    chartVPNInstance = new Chart(ctxVPN, {
        type: 'bar',
        data: {
            labels: datos.map(d => d.nombre),
            datasets: [{
                label: 'VPN ($)',
                data: datos.map(d => d.vpn),
                backgroundColor: datos.map((d,i) => colors[i%colors.length])
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 2. Gráfico Sensibilidad
    const ctxSens = document.getElementById('chartSensitivity');
    if(chartSensitivityInstance) chartSensitivityInstance.destroy();
    const sensDatasets = datos.map((d, idx) => {
        let pts = [];
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

    // 3. Gráfico Flujos
    const ctxFlows = document.getElementById('chartFlows');
    if(chartFlowsInstance) chartFlowsInstance.destroy();
    const maxN = Math.max(...datos.map(d => d.vidaUtil), 0);
    let labelsT = [];
    for(let i=0; i<=maxN; i++) labelsT.push('Año ' + i);
    
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

// --- EXPORTACIÓN PDF ---
async function generarPDF() {
    const { jsPDF } = window.jspdf;
    const btn = document.getElementById('btnPdf');
    
    if(projects.length === 0) {
        alert("No hay proyectos para exportar");
        return;
    }

    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Generando...';
    btn.disabled = true;

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

        const actions = document.querySelectorAll('.no-print');
        actions.forEach(el => el.style.display = 'none');
        
        const tableEl = document.getElementById('cardTable');
        const tableCanvas = await html2canvas(tableEl, { scale: 2 });
        const tableImg = tableCanvas.toDataURL('image/png');
        const tableHeight = (tableCanvas.height * (pageWidth - 2*margin)) / tableCanvas.width;
        
        doc.addImage(tableImg, 'PNG', margin, currentY, pageWidth - 2*margin, tableHeight);
        currentY += tableHeight + 10;
        
        actions.forEach(el => el.style.display = '');

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
        console.error(error);
        alert("Error al generar el PDF.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function guardarEnLocalStorage() { localStorage.setItem('ecoProjectsPDF', JSON.stringify(projects)); }
function cargarDeLocalStorage() {
    const data = localStorage.getItem('ecoProjectsPDF');
    if(data) projects = JSON.parse(data);
}
