// AgriShield Rwanda — Django Web Application Controller
document.addEventListener("DOMContentLoaded", function () {
    let deckInstance = null;
    let globalMetrics = null;

    // DOM Elements
    const levelSelect = document.getElementById("level-select");
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

    // Weight state tracking
    let currentWeights = { w1: 0.50, w2: 0.30, w3: 0.20 };

    // Modal DOM Elements
    const btnOpenModal = document.getElementById("btn-open-weights-modal");
    const weightsModal = document.getElementById("weights-modal");
    const btnCloseModal = document.getElementById("btn-close-modal");
    const btnApplyModalWeights = document.getElementById("btn-apply-modal-weights");
    const modalW1 = document.getElementById("modal-w1");
    const modalW2 = document.getElementById("modal-w2");
    const modalW3 = document.getElementById("modal-w3");
    const modalFeedback = document.getElementById("modal-sum-feedback");

    // Open & Close Modal
    if (btnOpenModal) {
        btnOpenModal.addEventListener("click", () => {
            if (modalW1) modalW1.value = currentWeights.w1.toFixed(2);
            if (modalW2) modalW2.value = currentWeights.w2.toFixed(2);
            if (modalW3) modalW3.value = currentWeights.w3.toFixed(2);
            validateModalSum();
            if (weightsModal) weightsModal.style.display = "flex";
        });
    }

    if (btnCloseModal) {
        btnCloseModal.addEventListener("click", () => {
            if (weightsModal) weightsModal.style.display = "none";
        });
    }

    if (weightsModal) {
        weightsModal.addEventListener("click", (e) => {
            if (e.target === weightsModal) weightsModal.style.display = "none";
        });
    }

    // Modal Live Validation
    function validateModalSum() {
        if (!modalW1 || !modalW2 || !modalW3 || !modalFeedback) return;
        const w1 = parseFloat(modalW1.value) || 0;
        const w2 = parseFloat(modalW2.value) || 0;
        const w3 = parseFloat(modalW3.value) || 0;
        const sum = Math.round((w1 + w2 + w3) * 100) / 100;

        if (Math.abs(sum - 1.0) < 0.001) {
            modalFeedback.style.background = "rgba(16, 185, 129, 0.15)";
            modalFeedback.style.color = "#10b981";
            modalFeedback.style.border = "1px solid rgba(16, 185, 129, 0.3)";
            modalFeedback.innerHTML = `✅ Valid Allocation: Total Sum = <strong>1.00 (100%)</strong>`;
            if (btnApplyModalWeights) {
                btnApplyModalWeights.disabled = false;
                btnApplyModalWeights.style.opacity = "1";
                btnApplyModalWeights.style.cursor = "pointer";
            }
        } else {
            modalFeedback.style.background = "rgba(239, 68, 68, 0.15)";
            modalFeedback.style.color = "#ef4444";
            modalFeedback.style.border = "1px solid rgba(239, 68, 68, 0.3)";
            modalFeedback.innerHTML = `❌ Invalid Sum: <strong>${sum.toFixed(2)}</strong>. Weights MUST sum to <strong>1.00</strong> to save.`;
            if (btnApplyModalWeights) {
                btnApplyModalWeights.disabled = true;
                btnApplyModalWeights.style.opacity = "0.4";
                btnApplyModalWeights.style.cursor = "not-allowed";
            }
        }
    }

    [modalW1, modalW2, modalW3].forEach(inp => {
        if (inp) {
            inp.addEventListener("input", validateModalSum);
            inp.addEventListener("change", validateModalSum);
        }
    });

    if (btnApplyModalWeights) {
        btnApplyModalWeights.addEventListener("click", () => {
            const w1 = parseFloat(modalW1.value) || 0;
            const w2 = parseFloat(modalW2.value) || 0;
            const w3 = parseFloat(modalW3.value) || 0;
            const sum = Math.round((w1 + w2 + w3) * 100) / 100;

            if (Math.abs(sum - 1.0) < 0.001) {
                setWeights(w1, w2, w3);
                if (weightsModal) weightsModal.style.display = "none";
            }
        });
    }

    // Preset Buttons
    const btnMinagri = document.getElementById("btn-preset-minagri");
    if (btnMinagri) btnMinagri.addEventListener("click", () => setWeights(0.50, 0.30, 0.20));

    const btnDrought = document.getElementById("btn-preset-drought");
    if (btnDrought) btnDrought.addEventListener("click", () => setWeights(0.75, 0.15, 0.10));

    const btnPropoor = document.getElementById("btn-preset-propoor");
    if (btnPropoor) btnPropoor.addEventListener("click", () => setWeights(0.20, 0.20, 0.60));

    const btnEqual = document.getElementById("btn-preset-equal");
    if (btnEqual) btnEqual.addEventListener("click", () => setWeights(0.34, 0.33, 0.33));

    function setWeights(ws, wc, wp) {
        currentWeights = { w1: ws, w2: wc, w3: wp };
        updateSliderDisplays();
        triggerSimulation();
    }

    function updateSliderDisplays() {
        if (valStress) valStress.textContent = `${currentWeights.w1.toFixed(2)} (${Math.round(currentWeights.w1 * 100)}%)`;
        if (valCropland) valCropland.textContent = `${currentWeights.w2.toFixed(2)} (${Math.round(currentWeights.w2 * 100)}%)`;
        if (valPoverty) valPoverty.textContent = `${currentWeights.w3.toFixed(2)} (${Math.round(currentWeights.w3 * 100)}%)`;
        if (valBudget && sliderBudget) valBudget.textContent = sliderBudget.value;
    }

    [sliderBudget, inputCost, provinceSelect, levelSelect].forEach(input => {
        if (input) {
            input.addEventListener("change", () => {
                updateSliderDisplays();
                triggerSimulation();
            });
            input.addEventListener("input", updateSliderDisplays);
        }
    });

    // Initialize Map and Trigger Initial Simulation on Load
    if (document.getElementById("deck-map-container")) {
        initDeckGLMap();
        triggerSimulation();

        // Fetch Metrics on Load
        fetch("/api/metrics/")
            .then(res => res.json())
            .then(metrics => {
                globalMetrics = metrics;
                updateMetricsDisplay();
                renderGlobalShapChart();
            })
            .catch(err => console.log("Metrics fetch bypassed"));
    }

    function updateMetricsDisplay() {
        if (!globalMetrics || !levelSelect) return;
        const levelKey = levelSelect.value.toLowerCase().includes("district") ? "district" : "sector";
        const m = globalMetrics[levelKey];
        if (m) {
            const aucEl = document.getElementById("cv-metric-auc");
            if (aucEl) aucEl.textContent = m.overall_auc.toFixed(4);
            const f1El = document.getElementById("cv-metric-f1");
            if (f1El) f1El.textContent = m.overall_f1.toFixed(4);
            const accEl = document.getElementById("cv-metric-acc");
            if (accEl) accEl.textContent = m.overall_acc.toFixed(4);
            const prEl = document.getElementById("cv-metric-pr");
            if (prEl) prEl.textContent = `${m.overall_precision.toFixed(2)} / ${m.overall_recall.toFixed(2)}`;
        }
    }

    // ---------------------------------------------------------
    // REST API Simulation Function
    // ---------------------------------------------------------
    function triggerSimulation() {
        if (!levelSelect || !sliderBudget || !inputCost) return;
        const level = levelSelect.value;
        const w_stress = currentWeights.w1;
        const w_cropland = currentWeights.w2;
        const w_poverty = currentWeights.w3;
        const budget_units = sliderBudget.value;
        const unit_cost = inputCost.value;
        const province = provinceSelect ? provinceSelect.value : "All Rwanda";

        const queryStr = `level=${level}&w_stress=${w_stress}&w_cropland=${w_cropland}&w_poverty=${w_poverty}&budget_units=${budget_units}&unit_cost=${unit_cost}&province=${encodeURIComponent(province)}`;

        if (btnExport) btnExport.href = `/api/export-csv/?${queryStr}`;

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
        if (!kpis) return;
        if (kpiCropland) kpiCropland.textContent = kpis.total_cropland_ha.toLocaleString() + " ha";
        if (kpiUnirrigated) kpiUnirrigated.textContent = kpis.total_unirrigated_ha.toLocaleString() + " ha";
        if (kpiBudgetUnits) kpiBudgetUnits.textContent = kpis.target_units_count + " Pumps";
        if (kpiProtected) kpiProtected.textContent = kpis.protected_ha_targeted.toLocaleString() + " ha";
        if (kpiTargetShare) kpiTargetShare.textContent = kpis.target_share_pct + "% Target Share";
        if (kpiPoverty) kpiPoverty.textContent = kpis.target_poverty_share + "%";
        if (kpiInvestment) kpiInvestment.textContent = "$" + kpis.total_investment_usd.toLocaleString();
    }

    // ---------------------------------------------------------
    // Comprehensive Interactive Map Controller
    // ---------------------------------------------------------
    let currentMapMode = "3D"; // "3D" or "2D"
    let currentMetricMode = "allocation"; // "allocation", "score", "risk", "poverty", "cropland"
    let currentBasemap = "light"; // "light", "dark", "voyager", "none"
    let currentElevScale = 1.0;
    let selectedUnitName = null;
    let currentGeojson = null;
    let currentGeoLevel = "District";

    const BASEMAP_TILES = {
        light: "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        dark: "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        voyager: "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        none: null
    };

    function getColorForFeature(props, metricMode) {
        const isTarget = props.selected_for_intervention;
        const score = props.ssit_priority_score || 0;
        const risk = props.predicted_stress_prob || 0;
        const pov = props.eicv_poverty_pct || 0;
        const crop = props.unirrigated_ha || 0;

        if (metricMode === "allocation") {
            return isTarget ? [239, 68, 68, 220] : [16, 185, 129, 140];
        } else if (metricMode === "score") {
            if (score <= 0.35) return [16, 185, 129, 180];
            if (score <= 0.55) return [245, 158, 11, 200];
            if (score <= 0.75) return [215, 155, 82, 215];
            return [239, 68, 68, 230];
        } else if (metricMode === "risk") {
            if (risk <= 0.45) return [59, 130, 246, 180];
            if (risk <= 0.70) return [245, 158, 11, 200];
            return [239, 68, 68, 230];
        } else if (metricMode === "poverty") {
            if (pov <= 28) return [203, 213, 225, 170];
            if (pov <= 42) return [249, 115, 22, 200];
            return [185, 28, 28, 230];
        } else if (metricMode === "cropland") {
            if (crop <= 18000) return [187, 247, 208, 170];
            if (crop <= 35000) return [34, 197, 94, 200];
            return [21, 128, 61, 230];
        }
        return [16, 185, 129, 160];
    }

    function initDeckGLMap() {
        const container = document.getElementById("deck-map-container");
        if (!container) return;

        deckInstance = new deck.DeckGL({
            container: "deck-map-container",
            initialViewState: {
                latitude: -1.94,
                longitude: 29.87,
                zoom: 8.5,
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
                            <b style="font-size: 1.05rem; color: #265BA5;">${p.unit_name}</b> <span style="color: #64748b;">(${p.province})</span><br/>
                            <hr style="border-color: #e2e8f0; margin: 6px 0;"/>
                            <b>SSIT Priority Score:</b> <span style="color: #d79b52; font-weight: 800;">${p.ssit_priority_score}</span><br/>
                            <b>Priority Rank:</b> #${p.allocated_subsidy_rank}<br/>
                            <b>Allocation Status:</b> ${p.target_status}<br/>
                            <hr style="border-color: #e2e8f0; margin: 6px 0;"/>
                            💧 <b>Predicted Stress Risk:</b> ${(p.predicted_stress_prob * 100).toFixed(1)}%<br/>
                            🌱 <b>Soil Moisture:</b> ${p.real_soil_moisture_m3_m3} m³/m³<br/>
                            ☀️ <b>Dry Spell Duration:</b> ${p.dry_spell_days} days<br/>
                            👥 <b>EICV Poverty Rate:</b> ${p.eicv_poverty_pct}%<br/>
                            🌾 <b>Unirrigated Area:</b> ${p.unirrigated_ha.toLocaleString()} ha
                        </div>
                    `
                };
            }
        });

        setupMapControls();
    }

    function setupMapControls() {
        const btnMode3D = document.getElementById("btn-mode-3d");
        const btnMode2D = document.getElementById("btn-mode-2d");
        const groupElevScale = document.getElementById("group-elevation-scale");

        if (btnMode3D && btnMode2D) {
            btnMode3D.addEventListener("click", () => {
                currentMapMode = "3D";
                btnMode3D.classList.add("active");
                btnMode2D.classList.remove("active");
                if (groupElevScale) groupElevScale.style.display = "flex";
                if (deckInstance) {
                    deckInstance.setProps({
                        initialViewState: {
                            latitude: -1.94,
                            longitude: 29.87,
                            zoom: 8.5,
                            pitch: 48,
                            bearing: -10,
                            transitionDuration: 800
                        }
                    });
                }
                updateDeckGLMap();
            });

            btnMode2D.addEventListener("click", () => {
                currentMapMode = "2D";
                btnMode2D.classList.add("active");
                btnMode3D.classList.remove("active");
                if (groupElevScale) groupElevScale.style.display = "none";
                if (deckInstance) {
                    deckInstance.setProps({
                        initialViewState: {
                            latitude: -1.94,
                            longitude: 29.87,
                            zoom: 8.5,
                            pitch: 0,
                            bearing: 0,
                            transitionDuration: 800
                        }
                    });
                }
                updateDeckGLMap();
            });
        }

        const selectMapMetric = document.getElementById("select-map-metric");
        if (selectMapMetric) {
            selectMapMetric.addEventListener("change", (e) => {
                currentMetricMode = e.target.value;
                updateDeckGLMap();
            });
        }

        const selectMapBasemap = document.getElementById("select-map-basemap");
        if (selectMapBasemap) {
            selectMapBasemap.addEventListener("change", (e) => {
                currentBasemap = e.target.value;
                updateDeckGLMap();
            });
        }

        const sliderElevScale = document.getElementById("slider-elev-scale");
        const valElevScale = document.getElementById("val-elev-scale");
        if (sliderElevScale) {
            sliderElevScale.addEventListener("input", (e) => {
                currentElevScale = parseFloat(e.target.value);
                if (valElevScale) valElevScale.textContent = currentElevScale.toFixed(1) + "x";
                updateDeckGLMap();
            });
        }

        const btnRecenter = document.getElementById("btn-recenter-map");
        if (btnRecenter) {
            btnRecenter.addEventListener("click", () => {
                if (deckInstance) {
                    const is3D = currentMapMode === "3D";
                    deckInstance.setProps({
                        initialViewState: {
                            latitude: -1.94,
                            longitude: 29.87,
                            zoom: 8.5,
                            pitch: is3D ? 48 : 0,
                            bearing: is3D ? -10 : 0,
                            transitionDuration: 800
                        }
                    });
                }
            });
        }
    }

    function updateDeckGLMap(geojson, level) {
        if (geojson) currentGeojson = geojson;
        if (level) currentGeoLevel = level;
        if (!currentGeojson) return;

        if (!deckInstance) {
            initDeckGLMap();
        }

        const is3D = currentMapMode === "3D";
        const layers = [];

        // Carto Basemap Tile Layer
        if (currentBasemap !== "none" && BASEMAP_TILES[currentBasemap]) {
            const tileLayer = new deck.TileLayer({
                id: "carto-basemap-tiles",
                data: BASEMAP_TILES[currentBasemap],
                minZoom: 0,
                maxZoom: 19,
                tileSize: 256,
                renderSubLayers: props => {
                    const { bbox: { left, bottom, right, top } } = props.tile;
                    return new deck.BitmapLayer(props, {
                        data: null,
                        image: props.data,
                        bounds: [left, bottom, right, top]
                    });
                }
            });
            layers.push(tileLayer);
        }

        // Polygon Choropleth Layer
        const polygonLayer = new deck.GeoJsonLayer({
            id: "rwanda-3d-polygons",
            data: currentGeojson,
            opacity: is3D ? 0.88 : 0.75,
            stroked: true,
            filled: true,
            extruded: is3D,
            wireframe: is3D,
            getElevation: f => is3D ? (f.properties.elevation_m * currentElevScale) : 0,
            getFillColor: f => getColorForFeature(f.properties, currentMetricMode),
            getLineColor: f => (f.properties.unit_name === selectedUnitName) ? [250, 204, 21, 255] : [255, 255, 255, 140],
            lineWidthMinPixels: f => (f.properties.unit_name === selectedUnitName) ? 3 : 1,
            pickable: true,
            onClick: ({ object }) => {
                if (!object) return;
                selectedUnitName = object.properties.unit_name;
                updateDeckGLMap();
                if (unitShapSelect) {
                    unitShapSelect.value = selectedUnitName;
                    fetchShapWaterfall(selectedUnitName);
                }
            },
            updateTriggers: {
                getElevation: [currentMapMode, currentElevScale],
                getFillColor: [currentMetricMode],
                getLineColor: [selectedUnitName],
                lineWidthMinPixels: [selectedUnitName],
                extruded: [currentMapMode]
            }
        });
        layers.push(polygonLayer);

        if (deckInstance) {
            deckInstance.setProps({ layers });
        }

        updateLegendDisplay();
    }

    function updateLegendDisplay() {
        const titleEl = document.getElementById("legend-title");
        const contentEl = document.getElementById("legend-content");
        if (!titleEl || !contentEl) return;

        if (currentMetricMode === "allocation") {
            titleEl.textContent = "🎯 Subsidy Target Allocation";
            contentEl.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.78rem;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="width: 14px; height: 14px; background: #ef4444; border-radius: 4px; display: inline-block;"></span>
                        <b>Target Allocated ($K$ Subsidies)</b>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="width: 14px; height: 14px; background: #10b981; border-radius: 4px; display: inline-block;"></span>
                        <span>Baseline (Unallocated)</span>
                    </div>
                </div>
            `;
        } else if (currentMetricMode === "score") {
            titleEl.textContent = "📊 SSIT Priority Score";
            contentEl.innerHTML = `
                <div class="legend-bar-container" style="background: linear-gradient(to right, #10b981, #f59e0b, #d79b52, #ef4444);"></div>
                <div class="legend-scale-labels">
                    <span>0.00 (Low)</span>
                    <span>0.50</span>
                    <span>1.00 (High Target)</span>
                </div>
            `;
        } else if (currentMetricMode === "risk") {
            titleEl.textContent = "💧 Climate Drought Risk";
            contentEl.innerHTML = `
                <div class="legend-bar-container" style="background: linear-gradient(to right, #3b82f6, #f59e0b, #ef4444);"></div>
                <div class="legend-scale-labels">
                    <span>Low Exposure</span>
                    <span>Moderate</span>
                    <span>Extreme Risk</span>
                </div>
            `;
        } else if (currentMetricMode === "poverty") {
            titleEl.textContent = "👥 EICV Poverty Rate";
            contentEl.innerHTML = `
                <div class="legend-bar-container" style="background: linear-gradient(to right, #cbd5e1, #f97316, #b91c1c);"></div>
                <div class="legend-scale-labels">
                    <span>< 20%</span>
                    <span>40%</span>
                    <span>70%+ (High)</span>
                </div>
            `;
        } else if (currentMetricMode === "cropland") {
            titleEl.textContent = "🌾 Unirrigated Cropland";
            contentEl.innerHTML = `
                <div class="legend-bar-container" style="background: linear-gradient(to right, #bbf7d0, #22c55e, #15803d);"></div>
                <div class="legend-scale-labels">
                    <span>< 15,000 ha</span>
                    <span>30,000 ha</span>
                    <span>50,000+ ha</span>
                </div>
            `;
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
            title: { text: 'Soil Moisture Deficit vs EICV Poverty Rate', font: { color: '#265BA5', size: 14 } },
            xaxis: { title: 'Volumetric Soil Moisture (m³/m³)', color: '#4A6DAE' },
            yaxis: { title: 'EICV Poverty Rate (%)', color: '#4A6DAE' },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#1E293B' },
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
            marker: { color: '#265BA5' }
        };

        const layoutBar = {
            title: { text: 'Mean Dry Spell Days by Province (<1.0mm/day)', font: { color: '#265BA5', size: 14 } },
            xaxis: { title: 'Province', color: '#4A6DAE' },
            yaxis: { title: 'Mean Dry Spell Days', color: '#4A6DAE' },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#1E293B' },
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
            marker: { color: '#265BA5' }
        };

        const layoutGlobal = {
            title: { text: `Global TreeSHAP Importance (${levelKey.toUpperCase()})`, font: { color: '#265BA5', size: 14 } },
            xaxis: { title: 'Mean |SHAP Value|', color: '#4A6DAE' },
            yaxis: { color: '#4A6DAE' },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#1E293B' },
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
                    connector: { line: { color: '#B0C0DB' } },
                    decreasing: { marker: { color: '#265BA5' } },
                    increasing: { marker: { color: '#D79B52' } }
                };

                const layoutWaterfall = {
                    title: { text: `SHAP Driver Breakdown for ${data.unit_name}`, font: { color: '#265BA5', size: 14 } },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { color: '#1E293B' },
                    margin: { l: 40, r: 20, t: 40, b: 40 }
                };

                Plotly.newPlot('chart-shap-waterfall', [traceWaterfall], layoutWaterfall, { responsive: true });
            });
    }

    // ---------------------------------------------------------
    // NISR AI Assistant Chatbot Controller
    // ---------------------------------------------------------
    const btnToggleChatbot = document.getElementById("btn-toggle-chatbot");
    const chatbotWindow = document.getElementById("chatbot-window");
    const btnCloseChatbot = document.getElementById("btn-close-chatbot");
    const chatbotForm = document.getElementById("chatbot-form");
    const chatbotInput = document.getElementById("chatbot-input");
    const chatbotMessages = document.getElementById("chatbot-messages");

    if (btnToggleChatbot && chatbotWindow) {
        btnToggleChatbot.addEventListener("click", () => {
            const isHidden = chatbotWindow.style.display === "none";
            chatbotWindow.style.display = isHidden ? "flex" : "none";
            if (isHidden && chatbotInput) chatbotInput.focus();
        });
    }

    if (btnCloseChatbot && chatbotWindow) {
        btnCloseChatbot.addEventListener("click", () => {
            chatbotWindow.style.display = "none";
        });
    }

    function appendChatMessage(sender, text) {
        if (!chatbotMessages) return;
        const msgDiv = document.createElement("div");
        msgDiv.className = `chat-msg ${sender === 'user' ? 'user-msg' : 'bot-msg'}`;
        
        let formattedText = text
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>')
            .replace(/\n/g, '<br/>');

        msgDiv.innerHTML = formattedText;
        chatbotMessages.appendChild(msgDiv);
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    }

    let chatHistory = [];

    if (chatbotForm) {
        chatbotForm.addEventListener("submit", function (e) {
            e.preventDefault();
            const query = chatbotInput.value.trim();
            if (!query) return;

            appendChatMessage("user", query);
            chatHistory.push({ role: "user", content: query });
            chatbotInput.value = "";

            const typingDiv = document.createElement("div");
            typingDiv.className = "chat-msg bot-msg";
            typingDiv.id = "chat-typing-indicator";
            typingDiv.innerHTML = "<i>Thinking... querying NISR statistics database...</i>";
            chatbotMessages.appendChild(typingDiv);
            chatbotMessages.scrollTop = chatbotMessages.scrollHeight;

            fetch("/api/chatbot/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: query, history: chatHistory.slice(-6) })
            })
            .then(res => res.json())
            .then(data => {
                const indicator = document.getElementById("chat-typing-indicator");
                if (indicator) indicator.remove();
                const botReply = data.reply || "No response received.";
                appendChatMessage("bot", botReply);
                chatHistory.push({ role: "assistant", content: botReply });
            })
            .catch(err => {
                const indicator = document.getElementById("chat-typing-indicator");
                if (indicator) indicator.remove();
                appendChatMessage("bot", "❌ Failed to connect to NISR statistics service.");
            });
        });
    }

    // Initialize Deck.gl Map and trigger initial simulation
    initDeckGLMap();
    updateSliderDisplays();
    triggerSimulation();
});
