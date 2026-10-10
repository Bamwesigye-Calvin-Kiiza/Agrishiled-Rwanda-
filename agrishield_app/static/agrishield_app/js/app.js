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
    document.getElementById("btn-preset-minagri").addEventListener("click", () => setWeights(0.50, 0.30, 0.20));
    document.getElementById("btn-preset-drought").addEventListener("click", () => setWeights(0.75, 0.15, 0.10));
    document.getElementById("btn-preset-propoor").addEventListener("click", () => setWeights(0.20, 0.20, 0.60));
    document.getElementById("btn-preset-equal").addEventListener("click", () => setWeights(0.34, 0.33, 0.33));

    function setWeights(ws, wc, wp) {
        currentWeights = { w1: ws, w2: wc, w3: wp };
        updateSliderDisplays();
        triggerSimulation();
    }

    function updateSliderDisplays() {
        valStress.textContent = `${currentWeights.w1.toFixed(2)} (${Math.round(currentWeights.w1 * 100)}%)`;
        valCropland.textContent = `${currentWeights.w2.toFixed(2)} (${Math.round(currentWeights.w2 * 100)}%)`;
        valPoverty.textContent = `${currentWeights.w3.toFixed(2)} (${Math.round(currentWeights.w3 * 100)}%)`;
        if (valBudget) valBudget.textContent = sliderBudget.value;
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
    initDeckGLMap();
    triggerSimulation();

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
        const w_stress = currentWeights.w1;
        const w_cropland = currentWeights.w2;
        const w_poverty = currentWeights.w3;
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
        if (!deckInstance) {
            initDeckGLMap();
        }

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
