# 📊 Evaluador de Proyectos de Ingeniería Económica

![Badge Status](https://img.shields.io/badge/Status-Activo-success)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-purple)

Una aplicación web completa y responsiva para la toma de decisiones financieras. Permite comparar alternativas de inversión calculando indicadores clave como **VPN**, **TIR** y **Relación B/C**, visualizando los resultados mediante gráficos interactivos y generando reportes en PDF.

---

## 📑 Tabla de Contenidos
- [Descripción General](#-descripción-general)
- [Características Principales](#-características-principales)
- [Tecnologías Utilizadas](#-tecnologías-utilizadas)
- [Estructura del Proyecto](#-estructura-del-proyecto)

---

## 📝 Descripción General

Esta herramienta facilita el análisis de ingeniería económica mediante la comparación de alternativas mutuamente excluyentes. Diseñada para estudiantes y profesionales, automatiza cálculos complejos de valor del dinero en el tiempo.

**Capacidades:**
* Cálculo automático de **Valor Presente Neto (VPN)**.
* Estimación de la **Tasa Interna de Retorno (TIR)** mediante métodos numéricos.
* Análisis de **Relación Beneficio/Costo**.
* Persistencia de datos local (no se pierden al recargar).

---

## 🚀 Características Principales

1.  **Comparación Multiproyecto:** Evalúa múltiples escenarios simultáneamente.
2.  **Identificación Visual del Ganador:** El sistema resalta automáticamente la mejor opción económica (Mayor VPN).
3.  **Gráficos Interactivos (Chart.js):**
    * Barras comparativas de rentabilidad.
    * Curvas de sensibilidad (VPN vs Tasa de Interés).
    * Perfil de flujos de caja en el tiempo.
4.  **Exportación Profesional:** Generación de reportes PDF "al vuelo" con capturas de las tablas y gráficos.
5.  **Interfaz Moderna:** Diseño limpio con pantalla de carga y adaptabilidad móvil.

---

## 🛠 Tecnologías Utilizadas

El proyecto está construido con **Vanilla JavaScript** (ES6+) para garantizar un rendimiento óptimo sin dependencias de frameworks pesados.

* **Frontend:** HTML5 Semántico, CSS3.
* **Estilos:** [Bootstrap 5.3](https://getbootstrap.com/).
* **Visualización de Datos:** [Chart.js](https://www.chartjs.org/).
* **Generación de Reportes:** [jsPDF](https://github.com/parallax/jsPDF) y [html2canvas](https://html2canvas.hertzen.com/).
* **Iconos:** FontAwesome 6.

---

## 📂 Estructura del Proyecto

```text
/
├── index.html       # Estructura principal y maquetación DOM
├── styles.css       # Estilos personalizados, animaciones y loader
├── script.js        # Lógica de negocio, cálculos financieros y gráficos
├── logo.png         # Logotipo para la pantalla de carga y reportes
└── favicon.ico      # Icono de pestaña del navegador  
