// AgriShield Rwanda — Django Web Application Controller
document.addEventListener("DOMContentLoaded", function () {
    let deckInstance = null;
    let globalMetrics = null;

    // ---------------------------------------------------------
    // Map State & Basemap Configuration
    // ---------------------------------------------------------
    let currentMapMode = "3D"; // "3D" or "2D"
    let currentMetricMode = "allocation"; // "allocation", "score", "risk", "poverty", "cropland"
    let currentBasemap = "light"; // "light", "dark", "voyager", "none"
    let currentElevScale = 1.0;
    let selectedUnitName = null;
    let currentGeojson = null;
    let currentGeoLevel = "District";
    let currentRankings = [];
    let currentAllocationFilter = "all"; // "all", "allocated", "identified", "unallocated"
    let currentTableSearchQuery = "";
    let allocStateVersion = 0;

    const BASEMAP_STYLES = {
        light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
        dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        voyager: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
        none: { version: 8, sources: {}, layers: [] }
    };

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

    // Mobile Sidebar Accordion Toggle
    const btnToggleSidebar = document.getElementById("sidebar-mobile-toggle");
    const sidebarInner = document.getElementById("sidebar-inner");
    if (btnToggleSidebar && sidebarInner) {
        btnToggleSidebar.addEventListener("click", () => {
            const isOpen = sidebarInner.classList.toggle("is-open");
            btnToggleSidebar.classList.toggle("active", isOpen);
            btnToggleSidebar.setAttribute("aria-expanded", isOpen);
            const icon = btnToggleSidebar.querySelector(".toggle-icon");
            if (icon) icon.textContent = isOpen ? "▲" : "▼";
        });
    }

    // Helper to resize all rendered Plotly charts smoothly on window or tab resize
    function resizePlotlyCharts() {
        if (!window.Plotly) return;
        ['chart-global-shap', 'chart-shap-waterfall', 'chart-scatter', 'chart-prov-bar'].forEach(id => {
            const el = document.getElementById(id);
            if (el && el.data && typeof Plotly.Plots.resize === "function") {
                Plotly.Plots.resize(el);
            }
        });
    }

    window.addEventListener("resize", () => {
        resizePlotlyCharts();
    });

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

            // Trigger window resize and Plotly resize to re-layout Deck.gl & Plotly
            window.dispatchEvent(new Event("resize"));
            setTimeout(resizePlotlyCharts, 120);
            
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

    function updateBudgetSliderLimits() {
        if (!levelSelect || !sliderBudget) return;
        const isDistrict = levelSelect.value.toLowerCase().includes("district");
        const maxK = isDistrict ? 30 : 422;
        
        sliderBudget.min = "1";
        sliderBudget.max = String(maxK);
        
        const labelBudgetMax = document.getElementById("label-budget-max");
        if (labelBudgetMax) {
            labelBudgetMax.textContent = `Max: ${maxK} (${isDistrict ? '30 Districts' : '422 Sectors'})`;
        }

        let currentVal = parseInt(sliderBudget.value, 10) || 10;
        if (currentVal > maxK) {
            sliderBudget.value = maxK;
        } else if (currentVal < 1) {
            sliderBudget.value = 1;
        }
        if (valBudget) valBudget.textContent = sliderBudget.value;
    }

    function updateSliderDisplays() {
        if (valStress) valStress.textContent = `${currentWeights.w1.toFixed(2)} (${Math.round(currentWeights.w1 * 100)}%)`;
        if (valCropland) valCropland.textContent = `${currentWeights.w2.toFixed(2)} (${Math.round(currentWeights.w2 * 100)}%)`;
        if (valPoverty) valPoverty.textContent = `${currentWeights.w3.toFixed(2)} (${Math.round(currentWeights.w3 * 100)}%)`;
        if (valBudget && sliderBudget) valBudget.textContent = sliderBudget.value;
    }

    if (levelSelect) {
        levelSelect.addEventListener("change", () => {
            updateBudgetSliderLimits();
            updateSliderDisplays();
            triggerSimulation();
        });
    }

    [sliderBudget, inputCost, provinceSelect].forEach(input => {
        if (input) {
            input.addEventListener("change", () => {
                updateSliderDisplays();
                triggerSimulation();
            });
            input.addEventListener("input", updateSliderDisplays);
        }
    });



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
    // Allocation State Persistence (Survives Reloads & Budget Ceiling Changes)
    // ---------------------------------------------------------
    function getAllocationStorageKey(level) {
        const isDistrict = (level || (levelSelect ? levelSelect.value : currentGeoLevel) || "district").toLowerCase().includes("district");
        return isDistrict ? "agrishield_allocations_district" : "agrishield_allocations_sector";
    }

    function loadPersistedAllocations(level) {
        try {
            const key = getAllocationStorageKey(level);
            const stored = localStorage.getItem(key);
            if (stored) {
                const arr = JSON.parse(stored);
                if (Array.isArray(arr)) {
                    return new Set(arr);
                }
            }
        } catch (e) {
            console.warn("Could not read allocations from localStorage:", e);
        }
        return new Set();
    }

    function savePersistedAllocations(level, allocatedSet) {
        try {
            const key = getAllocationStorageKey(level);
            localStorage.setItem(key, JSON.stringify(Array.from(allocatedSet)));
        } catch (e) {
            console.warn("Could not save allocations to localStorage:", e);
        }
    }

    function clearPersistedAllocations(level) {
        try {
            const key = getAllocationStorageKey(level);
            localStorage.removeItem(key);
        } catch (e) {
            console.warn("Could not clear allocations from localStorage:", e);
        }
    }

    function applyPersistedAllocationsToRankings(rankings, geojson, level) {
        if (!rankings || rankings.length === 0) return;
        const isDistrict = (level || (levelSelect ? levelSelect.value : currentGeoLevel) || "district").toLowerCase().includes("district");
        const nameKey = isDistrict ? "NAME_2" : "NAME_3";
        const allocatedSet = loadPersistedAllocations(level);

        // Synchronize rankings
        rankings.forEach(row => {
            const unitName = row[nameKey];
            const isAlloc = allocatedSet.has(unitName);
            row.is_allocated = isAlloc;

            if (isAlloc) {
                row.allocation_status = "allocated";
                row.target_status = "✅ Allocated";
                row.selected_for_intervention = true;
            } else {
                if (row.is_identified_target) {
                    row.allocation_status = "identified";
                    row.target_status = "🔍 Identified Target";
                    row.selected_for_intervention = true;
                } else {
                    row.allocation_status = "unallocated";
                    row.target_status = "Baseline (Unallocated)";
                    row.selected_for_intervention = false;
                }
            }
        });

        // Synchronize GeoJSON features
        if (geojson && geojson.features) {
            geojson.features.forEach(feat => {
                const unitName = feat.properties.unit_name;
                const isAlloc = allocatedSet.has(unitName);
                feat.properties.is_allocated = isAlloc;

                if (isAlloc) {
                    feat.properties.allocation_status = "allocated";
                    feat.properties.target_status = "✅ Allocated";
                    feat.properties.selected_for_intervention = true;
                    feat.properties.fill_color = [16, 185, 129, 245];
                } else {
                    if (feat.properties.is_identified_target) {
                        feat.properties.allocation_status = "identified";
                        feat.properties.target_status = "🔍 Identified Target";
                        feat.properties.selected_for_intervention = true;
                        feat.properties.fill_color = [245, 158, 11, 235];
                    } else {
                        feat.properties.allocation_status = "unallocated";
                        feat.properties.target_status = "Baseline (Unallocated)";
                        feat.properties.selected_for_intervention = false;
                        feat.properties.fill_color = [148, 163, 184, 120];
                    }
                }
            });
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
                currentRankings = data.rankings || [];
                currentGeojson = data.geojson;
                currentGeoLevel = level;

                // Re-apply any persisted manual allocations for this level
                applyPersistedAllocationsToRankings(currentRankings, currentGeojson, level);

                allocStateVersion++;
                recalculateKPIsFromRankings();
                updateDeckGLMap(currentGeojson, level);
                renderTable(currentRankings, level);
                renderDataExplorerCharts(currentRankings);
                updateShapUnitSelect(currentRankings, level);
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
        if (kpiBudgetUnits) {
            kpiBudgetUnits.textContent = typeof kpis.target_units_count === "number" 
                ? `${kpis.target_units_count} Targets` 
                : kpis.target_units_count;
        }
        if (kpiProtected) kpiProtected.textContent = kpis.protected_ha_targeted.toLocaleString() + " ha";
        if (kpiTargetShare) {
            kpiTargetShare.textContent = typeof kpis.target_share_pct === "string" && kpis.target_share_pct.includes("%")
                ? kpis.target_share_pct
                : kpis.target_share_pct + "% Target Share";
        }
        if (kpiPoverty) kpiPoverty.textContent = kpis.target_poverty_share + "%";
        if (kpiInvestment) kpiInvestment.textContent = "$" + Math.round(kpis.total_investment_usd).toLocaleString();
    }



    function isFeatureInFilter(props, filterMode) {
        if (!filterMode || filterMode === "all") return true;
        if (filterMode === "allocated") return !!props.is_allocated;
        if (filterMode === "identified") return !!props.is_identified_target;
        if (filterMode === "unallocated") return !props.is_allocated;
        return true;
    }

    function getColorForFeature(props, metricMode) {
        const score = props.ssit_priority_score || 0;
        const risk = props.predicted_stress_prob || 0;
        const pov = props.eicv_poverty_pct || 0;
        const crop = props.unirrigated_ha || 0;

        if (metricMode === "allocation") {
            if (props.is_allocated) {
                return [16, 185, 129, 245]; // Vivid Emerald Green for Allocated
            }
            if (props.is_identified_target) {
                return [245, 158, 11, 235]; // Warm Gold / Amber for Identified Target
            }
            return [148, 163, 184, 120]; // Muted Slate Gray for Baseline Unallocated
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

        // Ensure Deck.gl uses MapLibre GL for vector basemaps
        if (window.maplibregl) {
            window.mapboxgl = window.maplibregl;
        }

        deckInstance = new deck.DeckGL({
            container: "deck-map-container",
            map: window.maplibregl || window.mapboxgl,
            mapStyle: BASEMAP_STYLES[currentBasemap],
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
                if (!isFeatureInFilter(p, currentAllocationFilter)) return null;
                const statusHtml = p.is_allocated 
                    ? '<span style="color: #10b981; font-weight: 700;">✅ Allocated</span>'
                    : (p.is_identified_target ? '<span style="color: #f59e0b; font-weight: 700;">🔍 Identified Target</span>' : '<span style="color: #64748b;">Baseline (Unallocated)</span>');
                return {
                    html: `
                        <div class="deck-tooltip">
                            <b style="font-size: 1.05rem; color: #265BA5;">${p.unit_name}</b> <span style="color: #64748b;">(${p.province})</span><br/>
                            <hr style="border-color: #e2e8f0; margin: 6px 0;"/>
                            <b>SSIT Priority Score:</b> <span style="color: #d79b52; font-weight: 800;">${p.ssit_priority_score}</span><br/>
                            <b>Priority Rank:</b> #${p.allocated_subsidy_rank}<br/>
                            <b>Allocation Status:</b> ${statusHtml}<br/>
                            <b>Predicted Stress Risk:</b> ${(p.predicted_stress_prob * 100).toFixed(1)}%<br/>
                            <b>Soil Moisture:</b> ${p.real_soil_moisture_m3_m3} m³/m³<br/>
                            <b>Dry Spell Duration:</b> ${p.dry_spell_days} days<br/>
                            <b>EICV Poverty Rate:</b> ${p.eicv_poverty_pct}%<br/>
                            <b>Unirrigated Area:</b> ${p.unirrigated_ha.toLocaleString()} ha
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
                    const map = deckInstance.getMapboxMap ? deckInstance.getMapboxMap() : null;
                    if (map && typeof map.easeTo === "function") {
                        map.easeTo({ pitch: 48, bearing: -10, duration: 800 });
                    }
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
                    const map = deckInstance.getMapboxMap ? deckInstance.getMapboxMap() : null;
                    if (map && typeof map.easeTo === "function") {
                        map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
                    }
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

        const selectMapAlloc = document.getElementById("select-map-allocation-filter");
        if (selectMapAlloc) {
            selectMapAlloc.addEventListener("change", (e) => {
                setAllocationFilter(e.target.value);
            });
        }

        const selectMapBasemap = document.getElementById("select-map-basemap");
        if (selectMapBasemap) {
            selectMapBasemap.addEventListener("change", (e) => {
                currentBasemap = e.target.value;
                const style = BASEMAP_STYLES[currentBasemap];
                if (deckInstance) {
                    deckInstance.setProps({ mapStyle: style });
                    const map = deckInstance.getMapboxMap ? deckInstance.getMapboxMap() : null;
                    if (map && typeof map.setStyle === "function") {
                        map.setStyle(style);
                    }
                }
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
                    const pitch = is3D ? 48 : 0;
                    const bearing = is3D ? -10 : 0;
                    deckInstance.setProps({
                        initialViewState: {
                            latitude: -1.94,
                            longitude: 29.87,
                            zoom: 8.5,
                            pitch: pitch,
                            bearing: bearing,
                            transitionDuration: 800
                        }
                    });
                    const map = deckInstance.getMapboxMap ? deckInstance.getMapboxMap() : null;
                    if (map && typeof map.easeTo === "function") {
                        map.easeTo({ pitch: pitch, bearing: bearing, duration: 800 });
                    }
                }
            });
        }

        // Fullscreen Toggle
        const btnFullscreen = document.getElementById("btn-toggle-fullscreen");
        const mapWrapper = document.getElementById("map-viewport-wrapper");
        if (btnFullscreen && mapWrapper) {
            btnFullscreen.addEventListener("click", () => {
                const isFs = mapWrapper.classList.toggle("is-fullscreen");
                btnFullscreen.textContent = isFs ? "✕ Exit Fullscreen" : "Fullscreen";
                btnFullscreen.classList.toggle("active", isFs);

                // Resize MapLibre and DeckGL canvas
                setTimeout(() => {
                    window.dispatchEvent(new Event("resize"));
                    const map = deckInstance && deckInstance.getMapboxMap ? deckInstance.getMapboxMap() : null;
                    if (map && typeof map.resize === "function") {
                        map.resize();
                    }
                    if (deckInstance && typeof deckInstance.redraw === "function") {
                        deckInstance.redraw();
                    }
                }, 100);
            });

            // Allow exiting fullscreen with Escape key
            document.addEventListener("keydown", (e) => {
                if (e.key === "Escape" && mapWrapper.classList.contains("is-fullscreen")) {
                    mapWrapper.classList.remove("is-fullscreen");
                    btnFullscreen.textContent = "Fullscreen";
                    btnFullscreen.classList.remove("active");
                    setTimeout(() => {
                        window.dispatchEvent(new Event("resize"));
                        const map = deckInstance && deckInstance.getMapboxMap ? deckInstance.getMapboxMap() : null;
                        if (map && typeof map.resize === "function") {
                            map.resize();
                        }
                    }, 100);
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
        const isDistrict = (currentGeoLevel || "").toLowerCase().includes("district");
        const defaultLineWidth = isDistrict ? 2.5 : 1.5;
        const layers = [];

        // Ground footprint border layer in 3D for clear boundary demarcation on the map floor
        if (is3D) {
            const groundBordersLayer = new deck.GeoJsonLayer({
                id: "rwanda-ground-borders",
                data: currentGeojson,
                stroked: true,
                filled: false,
                extruded: false,
                getLineColor: f => isFeatureInFilter(f.properties, currentAllocationFilter) ? [15, 23, 42, 190] : [0, 0, 0, 0],
                lineWidthMinPixels: f => isFeatureInFilter(f.properties, currentAllocationFilter) ? defaultLineWidth : 0,
                pickable: false,
                updateTriggers: {
                    getLineColor: [currentAllocationFilter, allocStateVersion],
                    lineWidthMinPixels: [currentGeoLevel, currentAllocationFilter, allocStateVersion]
                }
            });
            layers.push(groundBordersLayer);
        }

        // Main Polygon Layer with bold high-contrast boundary demarcation
        const polygonLayer = new deck.GeoJsonLayer({
            id: "rwanda-3d-polygons",
            data: currentGeojson,
            opacity: is3D ? 0.92 : 0.84,
            stroked: true,
            filled: true,
            extruded: is3D,
            wireframe: is3D,
            getElevation: f => {
                if (!isFeatureInFilter(f.properties, currentAllocationFilter)) return 0;
                return is3D ? (f.properties.elevation_m * currentElevScale) : 0;
            },
            getFillColor: f => {
                if (!isFeatureInFilter(f.properties, currentAllocationFilter)) return [0, 0, 0, 0];
                return getColorForFeature(f.properties, currentMetricMode);
            },
            getLineColor: f => {
                if (!isFeatureInFilter(f.properties, currentAllocationFilter)) return [0, 0, 0, 0];
                if (f.properties.unit_name === selectedUnitName) {
                    return [250, 204, 21, 255]; // Selected unit: Bright golden outline
                }
                // High contrast dark navy/slate boundary for clear district and sector separation
                return [15, 23, 42, 235];
            },
            lineWidthMinPixels: f => {
                if (!isFeatureInFilter(f.properties, currentAllocationFilter)) return 0;
                return (f.properties.unit_name === selectedUnitName) ? 4 : defaultLineWidth;
            },
            pickable: true,
            onClick: ({ object }) => {
                if (!object || !isFeatureInFilter(object.properties, currentAllocationFilter)) return;
                selectedUnitName = object.properties.unit_name;
                allocStateVersion++;
                updateDeckGLMap();
                if (unitShapSelect) {
                    unitShapSelect.value = selectedUnitName;
                    fetchShapWaterfall(selectedUnitName);
                }
            },
            updateTriggers: {
                getElevation: [currentMapMode, currentElevScale, currentAllocationFilter, allocStateVersion],
                getFillColor: [currentMetricMode, currentAllocationFilter, allocStateVersion],
                getLineColor: [selectedUnitName, currentGeoLevel, currentAllocationFilter, allocStateVersion],
                lineWidthMinPixels: [selectedUnitName, currentGeoLevel, currentAllocationFilter, allocStateVersion],
                extruded: [currentMapMode]
            }
        });
        layers.push(polygonLayer);

        if (deckInstance) {
            deckInstance.setProps({ layers });
        }

        // Update empty filter notification overlay on map
        const emptyNotice = document.getElementById("map-empty-filter-notice");
        const emptyNoticeText = document.getElementById("map-empty-notice-text");
        if (emptyNotice && currentGeojson && currentGeojson.features) {
            const matchCount = currentGeojson.features.filter(f => isFeatureInFilter(f.properties, currentAllocationFilter)).length;
            if (matchCount === 0) {
                emptyNotice.style.display = "flex";
                if (emptyNoticeText) {
                    if (currentAllocationFilter === "allocated") {
                        emptyNoticeText.innerHTML = `ℹ️ <b>0 units currently allocated.</b> Click <b>"+ Allocate Pump"</b> in the deployment table below or <b>"+ Allocate All Identified"</b> to allocate.`;
                    } else if (currentAllocationFilter === "identified") {
                        emptyNoticeText.innerHTML = `ℹ️ <b>0 identified targets.</b> Increase the SSIT Pump Ceiling slider in the sidebar.`;
                    } else {
                        emptyNoticeText.innerHTML = `ℹ️ No units found for the active filter.`;
                    }
                }
            } else {
                emptyNotice.style.display = "none";
            }
        }

        updateLegendDisplay();
    }

    function updateLegendDisplay() {
        const titleEl = document.getElementById("legend-title");
        const contentEl = document.getElementById("legend-content");
        if (!titleEl || !contentEl) return;

        if (currentMetricMode === "allocation") {
            titleEl.textContent = "SSIT Subsidy Status";
            contentEl.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.78rem;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="width: 14px; height: 14px; background: #10b981; border-radius: 4px; display: inline-block; box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);"></span>
                        <b>✅ Allocated (SSIT Pump Assigned)</b>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="width: 14px; height: 14px; background: #f59e0b; border-radius: 4px; display: inline-block; box-shadow: 0 0 6px rgba(245, 158, 11, 0.4);"></span>
                        <b>🔍 Identified Target (Top-Ranked)</b>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="width: 14px; height: 14px; background: #94a3b8; border-radius: 4px; display: inline-block;"></span>
                        <span style="color: #64748b;">Baseline (Unallocated)</span>
                    </div>
                </div>
            `;
        } else if (currentMetricMode === "score") {
            titleEl.textContent = "SSIT Priority Score";
            contentEl.innerHTML = `
                <div class="legend-bar-container" style="background: linear-gradient(to right, #10b981, #f59e0b, #d79b52, #ef4444);"></div>
                <div class="legend-scale-labels">
                    <span>0.00 (Low)</span>
                    <span>0.50</span>
                    <span>1.00 (High Target)</span>
                </div>
            `;
        } else if (currentMetricMode === "risk") {
            titleEl.textContent = "Climate Drought Risk";
            contentEl.innerHTML = `
                <div class="legend-bar-container" style="background: linear-gradient(to right, #3b82f6, #f59e0b, #ef4444);"></div>
                <div class="legend-scale-labels">
                    <span>Low Exposure</span>
                    <span>Moderate</span>
                    <span>Extreme Risk</span>
                </div>
            `;
        } else if (currentMetricMode === "poverty") {
            titleEl.textContent = "EICV Poverty Rate";
            contentEl.innerHTML = `
                <div class="legend-bar-container" style="background: linear-gradient(to right, #cbd5e1, #f97316, #b91c1c);"></div>
                <div class="legend-scale-labels">
                    <span>< 20%</span>
                    <span>40%</span>
                    <span>70%+ (High)</span>
                </div>
            `;
        } else if (currentMetricMode === "cropland") {
            titleEl.textContent = "Unirrigated Cropland";
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
    // Prioritized Deployment Schedule Table & Interactive Allocation
    // ---------------------------------------------------------
    function updateFilterCounts(rankings) {
        if (!rankings) return;
        const countAll = rankings.length;
        const countAlloc = rankings.filter(r => !!r.is_allocated).length;
        const countIdentified = rankings.filter(r => !!r.is_identified_target).length;
        const countUnalloc = countAll - countAlloc;

        const elAll = document.getElementById("count-filter-all");
        if (elAll) elAll.textContent = countAll;
        const elAlloc = document.getElementById("count-filter-allocated");
        if (elAlloc) elAlloc.textContent = countAlloc;
        const elIdentified = document.getElementById("count-filter-identified");
        if (elIdentified) elIdentified.textContent = countIdentified;
        const elUnalloc = document.getElementById("count-filter-unallocated");
        if (elUnalloc) elUnalloc.textContent = countUnalloc;
    }

    function setAllocationFilter(filterVal) {
        currentAllocationFilter = filterVal || "all";

        // Sync map dropdown
        const selectMapAlloc = document.getElementById("select-map-allocation-filter");
        if (selectMapAlloc && selectMapAlloc.value !== currentAllocationFilter) {
            selectMapAlloc.value = currentAllocationFilter;
        }

        // Sync table buttons
        const filterBtns = document.querySelectorAll("#table-filter-group button");
        filterBtns.forEach(btn => {
            btn.classList.toggle("active", btn.dataset.filter === currentAllocationFilter);
        });

        allocStateVersion++;

        // Re-render table and map smoothly
        if (currentRankings) {
            renderTable(currentRankings, levelSelect ? levelSelect.value : "district");
        }
        updateDeckGLMap();
    }

    function toggleUnitAllocation(unitName) {
        if (!currentRankings || currentRankings.length === 0) return;
        const level = levelSelect ? levelSelect.value : currentGeoLevel;
        const isDistrict = level.toLowerCase().includes("district");
        const nameKey = isDistrict ? "NAME_2" : "NAME_3";

        const row = currentRankings.find(r => r[nameKey] === unitName);
        if (!row) return;

        const allocatedSet = loadPersistedAllocations(level);

        // Toggle allocation boolean
        row.is_allocated = !row.is_allocated;
        if (row.is_allocated) {
            allocatedSet.add(unitName);
            row.allocation_status = "allocated";
            row.target_status = "✅ Allocated";
            row.selected_for_intervention = true;
        } else {
            allocatedSet.delete(unitName);
            if (row.is_identified_target) {
                row.allocation_status = "identified";
                row.target_status = "🔍 Identified Target";
                row.selected_for_intervention = true;
            } else {
                row.allocation_status = "unallocated";
                row.target_status = "Baseline (Unallocated)";
                row.selected_for_intervention = false;
            }
        }

        // Persist to localStorage
        savePersistedAllocations(level, allocatedSet);

        // Synchronize in GeoJSON features
        if (currentGeojson && currentGeojson.features) {
            const feat = currentGeojson.features.find(f => f.properties.unit_name === unitName);
            if (feat) {
                feat.properties.is_allocated = row.is_allocated;
                feat.properties.allocation_status = row.allocation_status;
                feat.properties.target_status = row.target_status;
                feat.properties.selected_for_intervention = row.selected_for_intervention;
                feat.properties.fill_color = row.is_allocated 
                    ? [16, 185, 129, 245] 
                    : (row.is_identified_target ? [245, 158, 11, 235] : [148, 163, 184, 120]);
            }
        }

        allocStateVersion++;

        // Recalculate KPIs ribbon & slider count
        recalculateKPIsFromRankings();

        // Re-render table, map, and charts
        renderTable(currentRankings, level);
        updateDeckGLMap();
        renderDataExplorerCharts(currentRankings);
    }

    function allocateAllTargets() {
        if (!currentRankings || currentRankings.length === 0) return;
        const level = levelSelect ? levelSelect.value : currentGeoLevel;
        const isDistrict = level.toLowerCase().includes("district");
        const nameKey = isDistrict ? "NAME_2" : "NAME_3";
        const allocatedSet = loadPersistedAllocations(level);

        currentRankings.forEach(row => {
            if (row.is_identified_target) {
                row.is_allocated = true;
                row.allocation_status = "allocated";
                row.target_status = "✅ Allocated";
                row.selected_for_intervention = true;
                allocatedSet.add(row[nameKey]);

                if (currentGeojson && currentGeojson.features) {
                    const feat = currentGeojson.features.find(f => f.properties.unit_name === row[nameKey]);
                    if (feat) {
                        feat.properties.is_allocated = true;
                        feat.properties.allocation_status = "allocated";
                        feat.properties.target_status = "✅ Allocated";
                        feat.properties.selected_for_intervention = true;
                        feat.properties.fill_color = [16, 185, 129, 245];
                    }
                }
            }
        });

        // Persist to localStorage
        savePersistedAllocations(level, allocatedSet);

        allocStateVersion++;
        recalculateKPIsFromRankings();
        renderTable(currentRankings, level);
        updateDeckGLMap();
        renderDataExplorerCharts(currentRankings);
    }

    function recalculateKPIsFromRankings() {
        if (!currentRankings || currentRankings.length === 0) return;
        const allocatedList = currentRankings.filter(r => r.is_allocated);
        const identifiedList = currentRankings.filter(r => r.is_identified_target);
        const allocCount = allocatedList.length;
        const targetCount = identifiedList.length;
        const costPerUnit = parseFloat(inputCost ? inputCost.value : 1200) || 1200;

        const totalCropland = currentRankings.reduce((sum, r) => sum + (r.total_cropland_ha || 0), 0);
        const totalUnirrigated = currentRankings.reduce((sum, r) => sum + (r.unirrigated_ha || 0), 0);
        
        // Active list for protection & poverty stats
        const activeList = allocCount > 0 ? allocatedList : identifiedList;
        const protectedHa = activeList.reduce((sum, r) => sum + (r.unirrigated_ha || 0), 0);
        const targetShare = totalUnirrigated > 0 ? ((protectedHa / totalUnirrigated) * 100).toFixed(1) : "0.0";
        const avgPoverty = activeList.length > 0 
            ? (activeList.reduce((sum, r) => sum + (r.eicv_poverty_pct || 0), 0) / activeList.length).toFixed(1)
            : "0.0";
        const totalInvestment = allocCount * costPerUnit;

        updateKPIs({
            total_cropland_ha: totalCropland,
            total_unirrigated_ha: totalUnirrigated,
            target_units_count: `${allocCount} Allocated (${targetCount} Targets)`,
            protected_ha_targeted: protectedHa,
            target_share_pct: `${targetShare}% ${allocCount > 0 ? 'Allocated' : 'Target'} Share`,
            target_poverty_share: avgPoverty,
            total_investment_usd: totalInvestment
        });

        updateFilterCounts(currentRankings);
    }

    function downloadCustomCSV(rankings, level) {
        const isDistrict = (level || "district").toLowerCase().includes("district");
        const nameCol = isDistrict ? "NAME_2" : "NAME_3";

        const headers = [
            "Rank", "Administrative Unit", "Province", "Priority Score",
            "Allocation Status", "Is Allocated (Boolean)", "Is Identified Target (Boolean)",
            "Predicted Drought Risk (Prob)", "Unirrigated Cropland (ha)",
            "EICV Poverty Rate (%)", "Dry Spell Days", "Soil Moisture (m³/m³)"
        ];

        const rows = rankings.map(r => [
            r.allocated_subsidy_rank || "",
            `"${(r[nameCol] || "").replace(/"/g, '""')}"`,
            `"${(r.province || "").replace(/"/g, '""')}"`,
            r.ssit_priority_score || "",
            `"${r.target_status || ""}"`,
            r.is_allocated ? "YES" : "NO",
            r.is_identified_target ? "YES" : "NO",
            r.predicted_stress_prob || "",
            r.unirrigated_ha || "",
            r.eicv_poverty_pct || "",
            r.dry_spell_days || "",
            r.real_soil_moisture_m3_m3 || ""
        ]);

        const csvContent = [headers.join(",")].concat(rows.map(e => e.join(","))).join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `agrishield_rwanda_ssit_deployment_${level}_customized.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function renderTable(rankings, level) {
        const tbody = document.getElementById("table-body");
        if (!tbody) return;

        updateFilterCounts(rankings);

        const isDistrict = (level || "district").toLowerCase().includes("district");
        const nameKey = isDistrict ? "NAME_2" : "NAME_3";

        // Filter according to currentAllocationFilter and currentTableSearchQuery
        const query = (currentTableSearchQuery || "").trim().toLowerCase();
        const displayRankings = (rankings || []).filter(r => {
            if (currentAllocationFilter === "allocated" && !r.is_allocated) return false;
            if (currentAllocationFilter === "identified" && !r.is_identified_target) return false;
            if (currentAllocationFilter === "unallocated" && !!r.is_allocated) return false;

            if (query) {
                const uName = (r[nameKey] || "").toString().toLowerCase();
                const prov = (r.province || "").toString().toLowerCase();
                const rank = (r.allocated_subsidy_rank || "").toString();
                if (!uName.includes(query) && !prov.includes(query) && !rank.includes(query)) {
                    return false;
                }
            }
            return true;
        });

        if (displayRankings.length === 0) {
            let filterLabel = "All Units";
            if (currentAllocationFilter === "allocated") filterLabel = "✅ Allocated Only";
            else if (currentAllocationFilter === "identified") filterLabel = "🔍 Identified Targets Only";
            else if (currentAllocationFilter === "unallocated") filterLabel = "Baseline (Unallocated) Only";

            const searchNote = query ? ` matching "<b>${currentTableSearchQuery}</b>"` : '';

            tbody.innerHTML = `
                <tr>
                    <td colspan="11" style="text-align: center; padding: 32px; color: #64748B; font-weight: 500;">
                        No administrative units found for filter: <b>${filterLabel}</b>${searchNote}.
                        ${query ? '<br/><button type="button" id="btn-empty-clear-search" style="margin-top: 10px; background: none; border: 1px solid var(--nisr-wave-3); padding: 5px 12px; border-radius: 6px; color: var(--nisr-primary); cursor: pointer; font-size: 0.8rem; font-weight: 600;">Clear search</button>' : ''}
                        ${currentAllocationFilter === "allocated" && !query ? '<br/><span style="font-size: 0.85rem; color: #10b981; margin-top: 6px; display: inline-block;">Click "+ Allocate Pump" on any identified target or "+ Allocate All Identified" to allocate.</span>' : ''}
                    </td>
                </tr>
            `;

            const emptyClearBtn = document.getElementById("btn-empty-clear-search");
            if (emptyClearBtn) {
                emptyClearBtn.addEventListener("click", () => {
                    const searchInput = document.getElementById("table-search-input");
                    const clearBtn = document.getElementById("btn-clear-table-search");
                    if (searchInput) searchInput.value = "";
                    if (clearBtn) clearBtn.style.display = "none";
                    currentTableSearchQuery = "";
                    renderTable(rankings, level);
                });
            }
            return;
        }

        let html = "";
        displayRankings.forEach(r => {
            const isAlloc = !!r.is_allocated;
            const isTarget = !!r.is_identified_target;
            let statusClass = "status-baseline";
            let statusLabel = "Baseline (Unallocated)";
            let rowClass = "row-unallocated";

            if (isAlloc) {
                statusClass = "status-allocated";
                statusLabel = "✅ Allocated";
                rowClass = "row-allocated";
            } else if (isTarget) {
                statusClass = "status-identified";
                statusLabel = "🔍 Identified Target";
                rowClass = "row-identified";
            }

            const unitName = r[nameKey];

            html += `
                <tr class="${rowClass}">
                    <td><b>#${r.allocated_subsidy_rank}</b></td>
                    <td><b>${unitName}</b></td>
                    <td>${r.province}</td>
                    <td><b style="color: #f59e0b;">${r.ssit_priority_score}</b></td>
                    <td>
                        <span class="status-badge ${statusClass}">
                            ${statusLabel}
                        </span>
                    </td>
                    <td style="text-align: center;">
                        <button type="button" 
                            class="btn-alloc-toggle ${isAlloc ? 'btn-dealloc' : 'btn-alloc'}" 
                            data-unit="${unitName}"
                            title="${isAlloc ? 'Click to deallocate solar pump' : 'Click to allocate solar pump to ' + unitName}">
                            ${isAlloc ? 'Deallocate ✕' : '+ Allocate Pump'}
                        </button>
                    </td>
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

    // Interactive Table Allocation Delegation
    const tableBody = document.getElementById("table-body");
    if (tableBody) {
        tableBody.addEventListener("click", (e) => {
            const btn = e.target.closest(".btn-alloc-toggle");
            if (btn && btn.dataset.unit) {
                toggleUnitAllocation(btn.dataset.unit);
            }
        });
    }

    // Interactive Table Filter Group (All / Allocated / Unallocated)
    const tableFilterGroup = document.getElementById("table-filter-group");
    if (tableFilterGroup) {
        tableFilterGroup.addEventListener("click", (e) => {
            const btn = e.target.closest("button[data-filter]");
            if (btn) {
                setAllocationFilter(btn.dataset.filter);
            }
        });
    }

    // Allocate All Targets Button
    const btnAllocAll = document.getElementById("btn-allocate-all-targets");
    if (btnAllocAll) {
        btnAllocAll.addEventListener("click", () => {
            allocateAllTargets();
        });
    }

    // Reset Auto-Rank Allocation Button
    const btnResetAlloc = document.getElementById("btn-reset-allocation");
    if (btnResetAlloc) {
        btnResetAlloc.addEventListener("click", () => {
            const level = levelSelect ? levelSelect.value : currentGeoLevel;
            clearPersistedAllocations(level);
            triggerSimulation();
        });
    }

    // Table Search Bar Filter
    const tableSearchInput = document.getElementById("table-search-input");
    const btnClearTableSearch = document.getElementById("btn-clear-table-search");

    if (tableSearchInput) {
        tableSearchInput.addEventListener("input", (e) => {
            currentTableSearchQuery = e.target.value;
            if (btnClearTableSearch) {
                btnClearTableSearch.style.display = currentTableSearchQuery ? "inline-block" : "none";
            }
            if (currentRankings) {
                renderTable(currentRankings, levelSelect ? levelSelect.value : currentGeoLevel);
            }
        });
    }

    if (btnClearTableSearch) {
        btnClearTableSearch.addEventListener("click", () => {
            if (tableSearchInput) {
                tableSearchInput.value = "";
                tableSearchInput.focus();
            }
            btnClearTableSearch.style.display = "none";
            currentTableSearchQuery = "";
            if (currentRankings) {
                renderTable(currentRankings, levelSelect ? levelSelect.value : currentGeoLevel);
            }
        });
    }

    // Custom CSV Export Interceptor
    if (btnExport) {
        btnExport.addEventListener("click", (e) => {
            if (currentRankings && currentRankings.length > 0) {
                e.preventDefault();
                downloadCustomCSV(currentRankings, levelSelect ? levelSelect.value : "district");
            }
        });
    }

    // Initialize Deck.gl Map and trigger initial simulation
    if (document.getElementById("deck-map-container")) {
        initDeckGLMap();
        updateBudgetSliderLimits();
        updateSliderDisplays();
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
});
