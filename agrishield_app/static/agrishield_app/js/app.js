// AgriShield Rwanda — Django Web Application Controller
document.addEventListener("DOMContentLoaded", function () {
    let deckInstance = null;
    let globalMetrics = null;

    // DOM Elements
    const levelSelect = document.getElementById("level-select");
    const sliderStress = document.getElementById("slider-stress");
    const sliderCropland = document.getElementById("slider-cropland");
    const sliderPoverty = document.getElementById("slider-poverty");
    const valStress = document.getElementById("val-stress");
    const valCropland = document.getElementById("val-cropland");
    const valPoverty = document.getElementById("val-poverty");
    const sliderBudget = document.getElementById("slider-budget");
    const valBudget = document.getElementById("val-budget");
    const inputCost = document.getElementById("input-cost");
    const provinceSelect = document.getElementById("province-select");
    const btnExport = document.getElementById("btn-export-csv");
    const unitShapSelect = document.getElementById("unit-shap-select");

    // KPI Elements
    const kpiCropland = document.getElementById("kpi-cropland");
    const kpiUnirrigated = document.getElementById("kpi-unirrigated");
    const kpiBudgetUnits = document.getElementById("kpi-budget-units");
    const kpiProtected = document.getElementById("kpi-protected");
    const kpiTargetShare = document.getElementById("kpi-target-share");
    const kpiPoverty = document.getElementById("kpi-poverty");
    const kpiInvestment = document.getElementById("kpi-investment");

    // Tab Switching Logic
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabPanes = document.querySelectorAll(".tab-pane");

    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            tabBtns.forEach(b => b.classList.remove("active"));
            tabPanes.forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            const targetPane = document.getElementById(btn.dataset.tab);
            if (targetPane) targetPane.classList.add("active");

            // Trigger window resize to re-layout Deck.gl & Plotly
            window.dispatchEvent(new Event("resize"));
            
            if (btn.dataset.tab === "tab-shap") {
                renderGlobalShapChart();
                if (unitShapSelect && unitShapSelect.value) {
                    fetchShapWaterfall(unitShapSelect.value);
                }
            }
        });
    });

    // Preset Buttons
    document.getElementById("btn-preset-minagri").addEventListener("click", () => setWeights(0.50, 0.30, 0.20));
    document.getElementById("btn-preset-drought").addEventListener("click", () => setWeights(0.75, 0.15, 0.10));
    document.getElementById("btn-preset-propoor").addEventListener("click", () => setWeights(0.20, 0.20, 0.60));
    document.getElementById("btn-preset-equal").addEventListener("click", () => setWeights(0.33, 0.33, 0.34));

    function setWeights(ws, wc, wp) {
        sliderStress.value = ws;
        sliderCropland.value = wc;
        sliderPoverty.value = wp;
        updateSliderDisplays();
        triggerSimulation();
    }

    function updateSliderDisplays() {
        valStress.textContent = parseFloat(sliderStress.value).toFixed(2);
        valCropland.textContent = parseFloat(sliderCropland.value).toFixed(2);
        valPoverty.textContent = parseFloat(sliderPoverty.value).toFixed(2);
        valBudget.textContent = sliderBudget.value;
    }

    [sliderStress, sliderCropland, sliderPoverty, sliderBudget, inputCost, provinceSelect, levelSelect].forEach(input => {
        if (input) {
            input.addEventListener("change", () => {
                updateSliderDisplays();
                triggerSimulation();
            });
            input.addEventListener("input", updateSliderDisplays);
        }
    });

    // Fetch Metrics on Load
    fetch("/api/metrics/")
        .then(res => res.json())
        .then(metrics => {
            globalMetrics = metrics;
            updateMetricsDisplay();
            renderGlobalShapChart();
        });

    function updateMetricsDisplay() {
        if (!globalMetrics) return;
        const levelKey = levelSelect.value.toLowerCase().includes("district") ? "district" : "sector";
        const m = globalMetrics[levelKey];
        if (m) {
            document.getElementById("cv-metric-auc").textContent = m.overall_auc.toFixed(4);
            document.getElementById("cv-metric-f1").textContent = m.overall_f1.toFixed(4);
            document.getElementById("cv-metric-acc").textContent = m.overall_acc.toFixed(4);
            document.getElementById("cv-metric-pr").textContent = `${m.overall_precision.toFixed(2)} / ${m.overall_recall.toFixed(2)}`;
        }
    }

    // ---------------------------------------------------------
    // REST API Simulation Function
    // ---------------------------------------------------------
    function triggerSimulation() {
        const level = levelSelect.value;
        const w_stress = sliderStress.value;
        const w_cropland = sliderCropland.value;
        const w_poverty = sliderPoverty.value;
        const budget_units = sliderBudget.value;
        const unit_cost = inputCost.value;
        const province = provinceSelect.value;

        const queryStr = `level=${level}&w_stress=${w_stress}&w_cropland=${w_cropland}&w_poverty=${w_poverty}&budget_units=${budget_units}&unit_cost=${unit_cost}&province=${encodeURIComponent(province)}`;

        btnExport.href = `/api/export-csv/?${queryStr}`;

        fetch(`/api/simulate/?${queryStr}`)
            .then(res => res.json())
            .then(data => {
                updateKPIs(data.kpis);
                updateDeckGLMap(data.geojson, level);
                renderTable(data.rankings, level);
                renderDataExplorerCharts(data.rankings);
                updateShapUnitSelect(data.rankings, level);
                updateMetricsDisplay();
            })
            .catch(err => console.error("Error running simulation:", err));
    }

    // Update SHAP Unit Dropdown Options based on Active Simulation Data
    function updateShapUnitSelect(rankings, level) {
        if (!unitShapSelect || !rankings || rankings.length === 0) return;
        const nameKey = level.toLowerCase().includes("district") ? "NAME_2" : "NAME_3";

        const currentVal = unitShapSelect.value;
        let html = "";
        rankings.forEach(r => {
            const name = r[nameKey];
            html += `<option value="${name}">${name} (${r.province})</option>`;
        });
        unitShapSelect.innerHTML = html;

        if (currentVal && rankings.some(r => r[nameKey] === currentVal)) {
            unitShapSelect.value = currentVal;
        } else if (rankings.length > 0) {
            unitShapSelect.value = rankings[0][nameKey];
        }

        fetchShapWaterfall(unitShapSelect.value);
    }

    function updateKPIs(kpis) {
        kpiCropland.textContent = kpis.total_cropland_ha.toLocaleString() + " ha";
        kpiUnirrigated.textContent = kpis.total_unirrigated_ha.toLocaleString() + " ha";
        kpiBudgetUnits.textContent = kpis.target_units_count + " Pumps";
        kpiProtected.textContent = kpis.protected_ha_targeted.toLocaleString() + " ha";
        kpiTargetShare.textContent = kpis.target_share_pct + "% Target Share";
        kpiPoverty.textContent = kpis.target_poverty_share + "%";
        kpiInvestment.textContent = "$" + kpis.total_investment_usd.toLocaleString();
    }

    // ---------------------------------------------------------
    // 3D Deck.gl Map Controller
    // ---------------------------------------------------------
    function initDeckGLMap() {
        const container = document.getElementById("deck-map-container");
        if (!container) return;

        deckInstance = new deck.DeckGL({
            container: "deck-map-container",
            initialViewState: {
                latitude: -1.94,
                longitude: 29.87,
                zoom: 8.4,
                pitch: 48,
                bearing: -10
            },
            controller: true,
            getTooltip: ({ object }) => {
                if (!object) return null;
                const p = object.properties;
                return {
                    html: `
                        <div class="deck-tooltip">
                            <b style="font-size: 1.05rem; color: #10b981;">${p.unit_name}</b> <span style="color: #94a3b8;">(${p.province})</span><br/>
                            <hr style="border-color: #334155; margin: 6px 0;"/>
                            <b>SSIT Priority Score:</b> <span style="color: #f59e0b; font-weight: 800;">${p.ssit_priority_score}</span><br/>
                            <b>Priority Rank:</b> #${p.allocated_subsidy_rank}<br/>
                            <b>Allocation Status:</b> ${p.target_status}<br/>
                            <hr style="border-color: #334155; margin: 6px 0;"/>
                            💧 <b>Predicted Risk:</b> ${p.predicted_stress_prob}<br/>
                            🌱 <b>Soil Moisture:</b> ${p.real_soil_moisture_m3_m3} m³/m³<br/>
                            ☀️ <b>Dry Spell:</b> ${p.dry_spell_days} days<br/>
                            👥 <b>EICV Poverty:</b> ${p.eicv_poverty_pct}%<br/>
                            🌾 <b>Unirrigated Area:</b> ${p.unirrigated_ha.toLocaleString()} ha
                        </div>
                    `
                };
            }
        });
    }

    function updateDeckGLMap(geojson, level) {
        const polygonLayer = new deck.GeoJsonLayer({
            id: "rwanda-3d-polygons",
            data: geojson,
            opacity: 0.85,
            stroked: true,
            filled: true,
            extruded: true,
            wireframe: true,
            getElevation: f => f.properties.elevation_m,
            getFillColor: f => f.properties.fill_color,
            getLineColor: [255, 255, 255, 120],
            lineWidthMinPixels: 1,
            pickable: true
        });

        if (deckInstance) {
            deckInstance.setProps({
                layers: [polygonLayer]
            });
        }
    }

    // ---------------------------------------------------------
    // Prioritized Deployment Schedule Table
    // ---------------------------------------------------------
    function renderTable(rankings, level) {
        const tbody = document.getElementById("table-body");
        if (!tbody) return;

        const isDistrict = level.toLowerCase().includes("district");
        const nameKey = isDistrict ? "NAME_2" : "NAME_3";

        let html = "";
        rankings.forEach(r => {
            const statusClass = r.selected_for_intervention ? "status-target" : "status-baseline";
            html += `
                <tr>
                    <td><b>#${r.allocated_subsidy_rank}</b></td>
                    <td><b>${r[nameKey]}</b></td>
                    <td>${r.province}</td>
                    <td><b style="color: #f59e0b;">${r.ssit_priority_score}</b></td>
                    <td><span class="status-badge ${statusClass}">${r.target_status}</span></td>
                    <td>${r.predicted_stress_prob}</td>
                    <td>${r.unirrigated_ha.toLocaleString()} ha</td>
                    <td>${r.eicv_poverty_pct}%</td>
                    <td>${r.dry_spell_days} days</td>
                    <td>${r.real_soil_moisture_m3_m3} m³/m³</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    }

    // ---------------------------------------------------------
    // Data Explorer Charts (Plotly.js)
    // ---------------------------------------------------------
    function renderDataExplorerCharts(rankings) {
        if (!window.Plotly || !rankings || rankings.length === 0) return;

        const isDistrict = levelSelect.value.toLowerCase().includes("district");
        const nameKey = isDistrict ? "NAME_2" : "NAME_3";

        const traceScatter = {
            x: rankings.map(r => r.real_soil_moisture_m3_m3),
            y: rankings.map(r => r.eicv_poverty_pct),
            mode: 'markers',
            text: rankings.map(r => r[nameKey] + ` (${r.province})`),
            marker: {
                size: rankings.map(r => Math.max(10, Math.sqrt(r.unirrigated_ha) / 5)),
                color: rankings.map(r => r.ssit_priority_score),
                colorscale: 'Tealgrn',
                showscale: true,
                colorbar: { title: 'Priority Score' }
            }
        };

        const layoutScatter = {
            title: { text: 'Soil Moisture Deficit vs EICV Poverty Rate', font: { color: '#ffffff' } },
            xaxis: { title: 'Volumetric Soil Moisture (m³/m³)', color: '#94a3b8' },
            yaxis: { title: 'EICV Poverty Rate (%)', color: '#94a3b8' },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#e2e8f0' },
            margin: { l: 50, r: 20, t: 40, b: 40 }
        };

        Plotly.newPlot('chart-scatter', [traceScatter], layoutScatter, { responsive: true });

        const provMap = {};
        rankings.forEach(r => {
            if (!provMap[r.province]) provMap[r.province] = { dry: 0, count: 0 };
            provMap[r.province].dry += r.dry_spell_days;
            provMap[r.province].count += 1;
        });

        const provX = Object.keys(provMap);
        const provY = provX.map(p => (provMap[p].dry / provMap[p].count).toFixed(1));

        const traceBar = {
            x: provX,
            y: provY,
            type: 'bar',
            marker: { color: '#10b981' }
        };

        const layoutBar = {
            title: { text: 'Mean Dry Spell Days by Province (<1.0mm/day)', font: { color: '#ffffff' } },
            xaxis: { title: 'Province', color: '#94a3b8' },
            yaxis: { title: 'Mean Dry Spell Days', color: '#94a3b8' },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#e2e8f0' },
            margin: { l: 40, r: 20, t: 40, b: 40 }
        };

        Plotly.newPlot('chart-prov-bar', [traceBar], layoutBar, { responsive: true });
    }

    // ---------------------------------------------------------
    // Global TreeSHAP Feature Importance Chart
    // ---------------------------------------------------------
    function renderGlobalShapChart() {
        if (!window.Plotly || !globalMetrics) return;

        const levelKey = levelSelect.value.toLowerCase().includes("district") ? "district" : "sector";
        const m = globalMetrics[levelKey];
        if (!m || !m.feature_importances) return;

        const fiData = m.feature_importances;
        const yCols = fiData.map(d => d.feature).reverse();
        const xVals = fiData.map(d => d.mean_shap).reverse();

        const traceGlobal = {
            x: xVals,
            y: yCols,
            type: 'bar',
            orientation: 'h',
            marker: { color: '#10b981' }
        };

        const layoutGlobal = {
            title: { text: `Global TreeSHAP Importance (${levelKey.toUpperCase()})`, font: { color: '#ffffff' } },
            xaxis: { title: 'Mean |SHAP Value|', color: '#94a3b8' },
            yaxis: { color: '#94a3b8' },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#e2e8f0' },
            margin: { l: 140, r: 20, t: 40, b: 40 }
        };

        Plotly.newPlot('chart-global-shap', [traceGlobal], layoutGlobal, { responsive: true });
    }

    // ---------------------------------------------------------
    // TreeSHAP Waterfall Selector Handler
    // ---------------------------------------------------------
    if (unitShapSelect) {
        unitShapSelect.addEventListener("change", function () {
            fetchShapWaterfall(this.value);
        });
    }

    function fetchShapWaterfall(unitName) {
        if (!unitName) return;
        const level = levelSelect.value;
        fetch(`/api/shap/?level=${level}&unit=${encodeURIComponent(unitName)}`)
            .then(res => res.json())
            .then(data => {
                if (!window.Plotly || !data.contributions) return;

                const xCols = data.contributions.map(c => c.feature);
                const yVals = data.contributions.map(c => c.shap_value);

                const traceWaterfall = {
                    name: 'SHAP',
                    type: 'waterfall',
                    orientation: 'v',
                    x: xCols,
                    y: yVals,
                    connector: { line: { color: '#64748b' } },
                    decreasing: { marker: { color: '#10b981' } },
                    increasing: { marker: { color: '#ef4444' } }
                };

                const layoutWaterfall = {
                    title: { text: `SHAP Driver Breakdown for ${data.unit_name}`, font: { color: '#ffffff' } },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { color: '#e2e8f0' },
                    margin: { l: 40, r: 20, t: 40, b: 40 }
                };

                Plotly.newPlot('chart-shap-waterfall', [traceWaterfall], layoutWaterfall, { responsive: true });
            });
    }

    // Initialize Deck.gl Map and trigger initial simulation
    initDeckGLMap();
    updateSliderDisplays();
    triggerSimulation();
});
