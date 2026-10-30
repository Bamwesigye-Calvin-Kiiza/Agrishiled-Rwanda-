import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

# ----------------------------------------------------------------------
# Numbered Canvas for "Page X of Y" and institutional running headers
# ----------------------------------------------------------------------
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_decorations(self, page_count):
        self.saveState()
        
        # Don't draw header/footer on page 1 (Cover / Header page)
        if self._pageNumber > 1:
            # Running Header
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(colors.HexColor("#265BA5"))
            self.drawString(54, 11 * inch - 36, "REPUBLIC OF RWANDA | MINAGRI • RAB • NISR")
            
            self.setFont("Helvetica", 8)
            self.setFillColor(colors.HexColor("#64748B"))
            self.drawRightString(8.5 * inch - 54, 11 * inch - 36, "AgriShield Rwanda — Raw Data & Provenance Report")
            
            # Header line
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.6)
            self.line(54, 11 * inch - 42, 8.5 * inch - 54, 11 * inch - 42)

        # Running Footer (All pages)
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.6)
        self.line(54, 46, 8.5 * inch - 54, 46)

        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawString(54, 32, "NISR Hackathon 2026 | Small-Scale Irrigation Technology (SSIT) Policy Engine")
        
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(8.5 * inch - 54, 32, page_str)
        
        self.restoreState()


def build_pdf(output_path):
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()
    
    # Custom Palette
    c_primary = colors.HexColor("#071328")   # Deep Navy
    c_blue = colors.HexColor("#265BA5")      # Rwanda Policy Blue
    c_gold = colors.HexColor("#D79B52")      # Agriculture Gold
    c_text = colors.HexColor("#1E293B")      # Slate text
    c_muted = colors.HexColor("#64748B")     # Muted text
    c_card_bg = colors.HexColor("#F8FAFC")   # Light background
    c_border = colors.HexColor("#E2E8F0")    # Soft border

    # Custom Typography Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=c_primary,
        spaceAfter=6
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=16,
        textColor=c_blue,
        spaceAfter=14
    )

    meta_badge_style = ParagraphStyle(
        'MetaBadge',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=10,
        textColor=c_gold
    )

    h1_style = ParagraphStyle(
        'Heading1_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=c_blue,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Heading2_Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14,
        textColor=c_primary,
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12.5,
        textColor=c_text,
        spaceAfter=6
    )

    body_bold = ParagraphStyle(
        'Body_Bold',
        parent=body_style,
        fontName='Helvetica-Bold'
    )

    callout_style = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11.5,
        textColor=colors.HexColor("#334155")
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.white,
        alignment=0
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.2,
        leading=9.5,
        textColor=c_text
    )

    table_link_style = ParagraphStyle(
        'TableLink',
        parent=table_cell_style,
        textColor=colors.HexColor("#1D4ED8")
    )

    story = []

    # ------------------------------------------------------------------
    # HEADER BANNER & METADATA
    # ------------------------------------------------------------------
    gov_badge_text = "<b>🇷🇼 REPUBLIC OF RWANDA</b> &nbsp;|&nbsp; <b>MINAGRI • RAB • NISR</b> &nbsp;|&nbsp; NATIONAL STRATEGY FOR TRANSFORMATION (NST2)"
    story.append(Paragraph(gov_badge_text, meta_badge_style))
    story.append(Spacer(1, 6))

    story.append(Paragraph("NISR AgriShield Rwanda: Raw Data & Provenance Report", title_style))
    story.append(Paragraph("Official Technical Dossier of Datasets, Spatial Sources, Direct Links & Variables Fused for SSIT Solar Pump Prioritization", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=c_blue, spaceBefore=0, spaceAfter=12))

    # Executive Summary Card
    exec_text = (
        "<b>Executive Summary & Mandate:</b> AgriShield Rwanda is a spatial decision-support engine developed for the "
        "<b>National Institute of Statistics of Rwanda (NISR) Hackathon 2026</b> to support the <b>Ministry of Agriculture and "
        "Animal Resources (MINAGRI)</b> and the <b>Rwanda Agriculture and Animal Resources Development Board (RAB)</b>. "
        "The system targets Small-Scale Irrigation Technology (SSIT) 50% solar pump government subsidies by harmonizing <b>four authoritative data pillars</b>: "
        "(1) Official Rwandan agricultural microdata (NISR SAS), (2) Socio-economic household poverty indices (NISR EICV), "
        "(3) Earth Observation & Climate Reanalysis (ECMWF ERA5-Land & CHIRPS), and (4) Administrative boundary cartography (GADM 4.1). "
        "This document provides the full provenance, definitions, and direct access links for all raw data utilized across Rwanda's 30 districts and 422 sectors."
    )
    
    exec_table = Table([[Paragraph(exec_text, callout_style)]], colWidths=[7.0 * inch])
    exec_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), c_card_bg),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(exec_table)
    story.append(Spacer(1, 12))

    # ------------------------------------------------------------------
    # PILLAR 1: ADMINISTRATIVE BOUNDARIES
    # ------------------------------------------------------------------
    story.append(Paragraph("1. Administrative Geographic Boundaries (GADM 4.1)", h1_style))
    p1_desc = (
        "High-resolution spatial multi-polygon vectors for Rwanda were extracted from the <b>Global Administrative Areas (GADM)</b> "
        "database (Version 4.1), the standard global administrative boundary reference maintained by UC Davis. "
        "These vector layers define the territorial geometries used to compute exact geometric centroids, raster zonal statistics, "
        "and client-side 3D extruded visualizations."
    )
    story.append(Paragraph(p1_desc, body_style))

    p1_data = [
        [
            Paragraph("Administrative Level", table_header_style),
            Paragraph("Entities Count", table_header_style),
            Paragraph("Local Unit", table_header_style),
            Paragraph("Coordinate System", table_header_style),
            Paragraph("Direct Download & Source URL", table_header_style)
        ],
        [
            Paragraph("<b>Level 2 (Districts)</b>", table_cell_style),
            Paragraph("30 Districts", table_cell_style),
            Paragraph("Akarere", table_cell_style),
            Paragraph("WGS 84 (EPSG:4326)", table_cell_style),
            Paragraph('<link href="https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_RWA_2.json" color="#1D4ED8"><u>geodata.ucdavis.edu/.../gadm41_RWA_2.json</u></link>', table_link_style)
        ],
        [
            Paragraph("<b>Level 3 (Sectors)</b>", table_cell_style),
            Paragraph("416–422 Sectors", table_cell_style),
            Paragraph("Umurenge", table_cell_style),
            Paragraph("WGS 84 (EPSG:4326)", table_cell_style),
            Paragraph('<link href="https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_RWA_3.json" color="#1D4ED8"><u>geodata.ucdavis.edu/.../gadm41_RWA_3.json</u></link>', table_link_style)
        ]
    ]

    t_p1 = Table(p1_data, colWidths=[1.3 * inch, 1.0 * inch, 0.9 * inch, 1.2 * inch, 2.6 * inch])
    t_p1.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_blue),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_card_bg]),
    ]))
    story.append(t_p1)
    story.append(Spacer(1, 10))

    # ------------------------------------------------------------------
    # PILLAR 2: AGRICULTURAL SURVEY (NISR SAS)
    # ------------------------------------------------------------------
    story.append(Paragraph("2. Agricultural Exposure & Cropland Baselines (NISR SAS)", h1_style))
    p2_desc = (
        "Agricultural cultivation areas and irrigation penetration rates are derived from the <b>Seasonal Agricultural Survey (SAS)</b> "
        "conducted annually across Agricultural Seasons A, B, and C by the <b>National Institute of Statistics of Rwanda (NISR)</b> "
        "in collaboration with <b>MINAGRI</b>. SAS microdata captures crop hectarage, farming typologies, and water source availability."
    )
    story.append(Paragraph(p2_desc, body_style))

    p2_data = [
        [
            Paragraph("Variable", table_header_style),
            Paragraph("Units", table_header_style),
            Paragraph("National Aggregate", table_header_style),
            Paragraph("Technical Definition & Role", table_header_style),
            Paragraph("Official Data Portal Link", table_header_style)
        ],
        [
            Paragraph("<b>total_cropland_ha</b>", table_cell_style),
            Paragraph("Hectares (ha)", table_cell_style),
            Paragraph("896,180 ha", table_cell_style),
            Paragraph("Total physical crop cultivation area per district/sector.", table_cell_style),
            Paragraph('<link href="https://www.statistics.gov.rw/publication-series/seasonal-agricultural-survey" color="#1D4ED8"><u>NISR SAS Publications Portal</u></link>', table_link_style)
        ],
        [
            Paragraph("<b>irrigated_pct</b>", table_cell_style),
            Paragraph("Percent (%)", table_cell_style),
            Paragraph("5.6% (avg)", table_cell_style),
            Paragraph("Existing formal or informal irrigation infrastructure coverage.", table_cell_style),
            Paragraph('<link href="https://microdata.statistics.gov.rw/index.php/catalog/SAS" color="#1D4ED8"><u>NISR Microdata Catalog: SAS</u></link>', table_link_style)
        ],
        [
            Paragraph("<b>unirrigated_ha</b>", table_cell_style),
            Paragraph("Hectares (ha)", table_cell_style),
            Paragraph("845,988 ha (94.4%)", table_cell_style),
            Paragraph("Total rainfed land strictly exposed to rainfall failure: <i>cropland × (1 - irrigated_pct)</i>.", table_cell_style),
            Paragraph('<link href="https://www.minagri.gov.rw" color="#1D4ED8"><u>MINAGRI SSIT Strategic Plan</u></link>', table_link_style)
        ]
    ]

    t_p2 = Table(p2_data, colWidths=[1.3 * inch, 0.8 * inch, 1.2 * inch, 2.1 * inch, 1.6 * inch])
    t_p2.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_blue),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_card_bg]),
    ]))
    story.append(t_p2)
    story.append(Spacer(1, 10))

    # Page Break for Clean Presentation (Section 3 starts on Page 2)
    story.append(PageBreak())

    # ------------------------------------------------------------------
    # PILLAR 3: SOCIO-ECONOMIC VULNERABILITY (NISR EICV)
    # ------------------------------------------------------------------
    story.append(Paragraph("3. Socio-Economic Equity & Poverty Profiling (NISR EICV)", h1_style))
    p3_desc = (
        "To ensure that subsidized pumps are not disproportionately captured by wealthier commercial farms, the optimization engine fuses "
        "headcount poverty rates from the <b>Integrated Household Living Conditions Survey (EICV)</b> series (EICV5 / EICV6) published by NISR. "
        "Under Rwanda's NST2 vision, targeting priority is awarded to climate-vulnerable zones with high poverty shares."
    )
    story.append(Paragraph(p3_desc, body_style))

    p3_data = [
        [
            Paragraph("Metric Variable", table_header_style),
            Paragraph("Source Survey", table_header_style),
            Paragraph("Range Across Rwanda", table_header_style),
            Paragraph("Policy Role in AgriShield", table_header_style),
            Paragraph("Direct Portal Reference", table_header_style)
        ],
        [
            Paragraph("<b>eicv_poverty_pct</b>", table_cell_style),
            Paragraph("NISR EICV5 / EICV6 Poverty Profile", table_cell_style),
            Paragraph("8.2% (Kicukiro) to 46.2% (Gisagara)", table_cell_style),
            Paragraph("Equity weighting: ensures 50% capital subsidies reach low-income agrarian smallholders.", table_cell_style),
            Paragraph('<link href="https://www.statistics.gov.rw/publication-series/eicv-poverty" color="#1D4ED8"><u>NISR EICV Poverty Series</u></link><br/><link href="https://microdata.statistics.gov.rw/index.php/catalog/EICV" color="#1D4ED8"><u>EICV Microdata Catalog</u></link>', table_link_style)
        ]
    ]

    t_p3 = Table(p3_data, colWidths=[1.3 * inch, 1.4 * inch, 1.4 * inch, 1.5 * inch, 1.4 * inch])
    t_p3.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_blue),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white]),
    ]))
    story.append(t_p3)
    story.append(Spacer(1, 12))

    # ------------------------------------------------------------------
    # PILLAR 4: CLIMATE REANALYSIS & EARTH OBSERVATION
    # ------------------------------------------------------------------
    story.append(Paragraph("4. Climate Reanalysis & Earth Observation (ECMWF ERA5 & CHIRPS)", h1_style))
    p4_desc = (
        "Climate and agronomic drought risks are driven by high-resolution atmospheric reanalysis and satellite precipitation data. "
        "AgriShield queries the <b>European Centre for Medium-Range Weather Forecasts (ECMWF) ERA5-Land Reanalysis</b> (spatial resolution ~9 km) "
        "and <b>UCSB Climate Hazards Group InfraRed Precipitation with Station data (CHIRPS)</b> via the Open-Meteo Historical Archive API. "
        "The analysis period covers the real <b>2026 Season A agricultural growing window</b> (January 1, 2026 – March 31, 2026)."
    )
    story.append(Paragraph(p4_desc, body_style))

    p4_data = [
        [
            Paragraph("Climate Feature", table_header_style),
            Paragraph("Units", table_header_style),
            Paragraph("Physical Sensor / Model", table_header_style),
            Paragraph("Rwanda Observed Range", table_header_style),
            Paragraph("Direct Access Endpoint & Link", table_header_style)
        ],
        [
            Paragraph("<b>real_precip_mm</b>", table_cell_style),
            Paragraph("Millimeters (mm)", table_cell_style),
            Paragraph("CHIRPS Daily + ERA5-Land", table_cell_style),
            Paragraph("254.7 mm (Kayonza) to 433.6 mm (Bugesera)", table_cell_style),
            Paragraph('<link href="https://open-meteo.com/en/docs/historical-weather-api" color="#1D4ED8"><u>Open-Meteo ERA5 API Docs</u></link>', table_link_style)
        ],
        [
            Paragraph("<b>real_temp_c</b>", table_cell_style),
            Paragraph("Celsius (°C)", table_cell_style),
            Paragraph("ERA5 2m Air Temperature", table_cell_style),
            Paragraph("18.9 °C to 21.2 °C (Seasonal mean)", table_cell_style),
            Paragraph('<link href="https://cds.climate.copernicus.eu/cdsapp#!/dataset/reanalysis-era5-land" color="#1D4ED8"><u>Copernicus CDS: ERA5-Land</u></link>', table_link_style)
        ],
        [
            Paragraph("<b>real_soil_moisture_m3_m3</b>", table_cell_style),
            Paragraph("m³/m³", table_cell_style),
            Paragraph("ERA5-Land (0–7 cm topsoil)", table_cell_style),
            Paragraph("0.150 (Ngoma drought) to 0.386 (Gasabo)", table_cell_style),
            Paragraph('<link href="https://www.ecmwf.int/en/forecasts/datasets/reanalysis-datasets/era5" color="#1D4ED8"><u>ECMWF ERA5 Overview</u></link>', table_link_style)
        ],
        [
            Paragraph("<b>dry_spell_days</b>", table_cell_style),
            Paragraph("Days", table_cell_style),
            Paragraph("Precipitation &lt; 1.0 mm count", table_cell_style),
            Paragraph("11 days (Musanze) to 42 days (Bugesera)", table_cell_style),
            Paragraph('<link href="https://www.chc.ucsb.edu/data/chirps" color="#1D4ED8"><u>UCSB CHIRPS Database</u></link>', table_link_style)
        ],
        [
            Paragraph("<b>empirical_moisture_stress</b>", table_cell_style),
            Paragraph("Index (0–1)", table_cell_style),
            Paragraph("Physical Deficit Formula", table_cell_style),
            Paragraph("0.255 (Low) to 0.805 (Extreme Stress)", table_cell_style),
            Paragraph('<i>Supervised Target for ML Training</i>', table_cell_style)
        ]
    ]

    t_p4 = Table(p4_data, colWidths=[1.5 * inch, 0.7 * inch, 1.4 * inch, 1.7 * inch, 1.7 * inch])
    t_p4.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_blue),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_card_bg]),
    ]))
    story.append(t_p4)
    story.append(Spacer(1, 8))

    # Formula Box
    formula_text = (
        "<b>Empirical Moisture Stress Index Formula:</b><br/>"
        "&nbsp;&nbsp;&nbsp;&nbsp;<b>Moisture Stress = 0.55 × [ (0.42 - SoilMoisture) / 0.25 ] + 0.45 × [ DrySpellDays / 60 ]</b> &nbsp;&nbsp;<i>(Bounded between 0.05 and 0.98)</i><br/>"
        "• <b>0.42 m³/m³:</b> Baseline root-zone soil saturation field capacity for Rwandan volcanic/clay-loam soils.<br/>"
        "• <b>60 Days:</b> Maximum duration of critical vegetative flowering and grain-filling window during Season A."
    )
    f_table = Table([[Paragraph(formula_text, callout_style)]], colWidths=[7.0 * inch])
    f_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#EFF6FF")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#BFDBFE")),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(f_table)
    story.append(Spacer(1, 10))

    # ------------------------------------------------------------------
    # PILLAR 5: MASTER FEATURE DICTIONARY
    # ------------------------------------------------------------------
    story.append(Paragraph("5. Master Feature Dictionary & Model Input Matrix", h1_style))

    dict_data = [
        [
            Paragraph("Feature Name", table_header_style),
            Paragraph("Type", table_header_style),
            Paragraph("Level", table_header_style),
            Paragraph("Source Institution", table_header_style),
            Paragraph("Role in ML / Policy Optimization", table_header_style)
        ],
        [
            Paragraph("<b>NAME_2</b>", table_cell_style),
            Paragraph("Categorical", table_cell_style),
            Paragraph("District", table_cell_style),
            Paragraph("GADM / MINALOC", table_cell_style),
            Paragraph("Administrative primary key for 30 districts", table_cell_style)
        ],
        [
            Paragraph("<b>NAME_3</b>", table_cell_style),
            Paragraph("Categorical", table_cell_style),
            Paragraph("Sector", table_cell_style),
            Paragraph("GADM / MINALOC", table_cell_style),
            Paragraph("Micro deployment key for 422 sectors", table_cell_style)
        ],
        [
            Paragraph("<b>total_cropland_ha</b>", table_cell_style),
            Paragraph("Numeric (ha)", table_cell_style),
            Paragraph("Both", table_cell_style),
            Paragraph("NISR SAS", table_cell_style),
            Paragraph("Agricultural scale and sector density weighting", table_cell_style)
        ],
        [
            Paragraph("<b>irrigated_pct</b>", table_cell_style),
            Paragraph("Percent (%)", table_cell_style),
            Paragraph("Both", table_cell_style),
            Paragraph("NISR SAS / RAB", table_cell_style),
            Paragraph("Infrastructure baseline to isolate rainfed deficit", table_cell_style)
        ],
        [
            Paragraph("<b>unirrigated_ha</b>", table_cell_style),
            Paragraph("Numeric (ha)", table_cell_style),
            Paragraph("Both", table_cell_style),
            Paragraph("Calculated (SAS)", table_cell_style),
            Paragraph("Cropland Exposure component (w2 in Utility formula)", table_cell_style)
        ],
        [
            Paragraph("<b>eicv_poverty_pct</b>", table_cell_style),
            Paragraph("Percent (%)", table_cell_style),
            Paragraph("Both", table_cell_style),
            Paragraph("NISR EICV", table_cell_style),
            Paragraph("Socio-economic vulnerability component (w3 in Utility)", table_cell_style)
        ],
        [
            Paragraph("<b>real_precip_mm</b>", table_cell_style),
            Paragraph("Float (mm)", table_cell_style),
            Paragraph("Both", table_cell_style),
            Paragraph("ECMWF / CHIRPS", table_cell_style),
            Paragraph("ML feature predicting seasonal water deficit", table_cell_style)
        ],
        [
            Paragraph("<b>real_temp_c</b>", table_cell_style),
            Paragraph("Float (°C)", table_cell_style),
            Paragraph("Both", table_cell_style),
            Paragraph("ECMWF ERA5", table_cell_style),
            Paragraph("ML feature for evapotranspiration demand", table_cell_style)
        ],
        [
            Paragraph("<b>real_soil_moisture_m3_m3</b>", table_cell_style),
            Paragraph("Float", table_cell_style),
            Paragraph("Both", table_cell_style),
            Paragraph("ECMWF ERA5-Land", table_cell_style),
            Paragraph("Top primary predictor of plant water stress", table_cell_style)
        ],
        [
            Paragraph("<b>dry_spell_days</b>", table_cell_style),
            Paragraph("Integer", table_cell_style),
            Paragraph("Both", table_cell_style),
            Paragraph("ECMWF / CHIRPS", table_cell_style),
            Paragraph("Rainfall irregularity metric capturing acute shocks", table_cell_style)
        ],
        [
            Paragraph("<b>predicted_stress_prob</b>", table_cell_style),
            Paragraph("Probability", table_cell_style),
            Paragraph("Both", table_cell_style),
            Paragraph("LightGBM / XGBoost", table_cell_style),
            Paragraph("Climate Risk component (w1 in Utility formula)", table_cell_style)
        ],
        [
            Paragraph("<b>ssit_priority_score</b>", table_cell_style),
            Paragraph("Score (0–1)", table_cell_style),
            Paragraph("Both", table_cell_style),
            Paragraph("AgriShield Engine", table_cell_style),
            Paragraph("Final allocation ranking: <i>w1·Risk + w2·Crop + w3·Pov</i>", table_cell_style)
        ]
    ]

    t_dict = Table(dict_data, colWidths=[1.3 * inch, 0.9 * inch, 0.6 * inch, 1.2 * inch, 3.0 * inch])
    t_dict.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_blue),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_card_bg]),
    ]))
    story.append(t_dict)
    story.append(Spacer(1, 14))

    # Page Break for Clean Final Section
    story.append(PageBreak())

    # ------------------------------------------------------------------
    # PILLAR 6: REPOSITORY REPRODUCIBILITY & DATA PIPELINE
    # ------------------------------------------------------------------
    story.append(Paragraph("6. Repository Pipeline & Reproducibility Manifest", h1_style))
    p6_desc = (
        "All data pipelines, raw inputs, and processed baseline tables are checked into the repository and fully reproducible. "
        "The following manifest links code pipelines with their inputs and outputs:"
    )
    story.append(Paragraph(p6_desc, body_style))

    pipeline_data = [
        [
            Paragraph("File / Script", table_header_style),
            Paragraph("Type", table_header_style),
            Paragraph("Description", table_header_style)
        ],
        [
            Paragraph("<code>src/download_boundaries.py</code>", table_cell_style),
            Paragraph("Ingestion Script", table_cell_style),
            Paragraph("Downloads Level 2 (Districts) and Level 3 (Sectors) GeoJSON polygons directly from GADM 4.1.", table_cell_style)
        ],
        [
            Paragraph("<code>src/fetch_real_climate_and_sas.py</code>", table_cell_style),
            Paragraph("Processing Script", table_cell_style),
            Paragraph("Extracts geometric centroids, queries ECMWF ERA5-Land reanalysis via Open-Meteo, merges NISR SAS & EICV baselines.", table_cell_style)
        ],
        [
            Paragraph("<code>src/model_pipeline.py</code>", table_cell_style),
            Paragraph("ML Engine", table_cell_style),
            Paragraph("Trains LightGBM with Stratified 5-Fold CV, computes TreeSHAP feature importance, and outputs predictive risk probabilities.", table_cell_style)
        ],
        [
            Paragraph("<code>data/raw/rwanda_districts_lvl2.json</code>", table_cell_style),
            Paragraph("Raw GeoJSON", table_cell_style),
            Paragraph("Official boundary coordinates for Rwanda's 30 districts (122 KB).", table_cell_style)
        ],
        [
            Paragraph("<code>data/raw/rwanda_sectors_lvl3.json</code>", table_cell_style),
            Paragraph("Raw GeoJSON", table_cell_style),
            Paragraph("Official boundary coordinates for Rwanda's 422 sectors (593 KB).", table_cell_style)
        ],
        [
            Paragraph("<code>data/processed/sas_district_baseline.csv</code>", table_cell_style),
            Paragraph("Processed Table", table_cell_style),
            Paragraph("Merged master baseline table for 30 districts with 13 features (3.2 KB).", table_cell_style)
        ],
        [
            Paragraph("<code>data/processed/sas_sector_baseline.csv</code>", table_cell_style),
            Paragraph("Processed Table", table_cell_style),
            Paragraph("Merged master baseline table for 422 sectors with 13 features (29.5 KB).", table_cell_style)
        ],
        [
            Paragraph("<code>data/processed/district_predictions.csv</code>", table_cell_style),
            Paragraph("Model Output", table_cell_style),
            Paragraph("District predictions with SHAP values and predicted climate stress probabilities (3.5 KB).", table_cell_style)
        ],
        [
            Paragraph("<code>data/processed/sector_predictions.csv</code>", table_cell_style),
            Paragraph("Model Output", table_cell_style),
            Paragraph("Sector predictions with SHAP values and predicted climate stress probabilities (33.3 KB).", table_cell_style)
        ]
    ]

    t_pip = Table(pipeline_data, colWidths=[2.2 * inch, 1.1 * inch, 3.7 * inch])
    t_pip.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_blue),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_card_bg]),
    ]))
    story.append(t_pip)
    story.append(Spacer(1, 14))

    # ------------------------------------------------------------------
    # CITATION & INSTITUTIONAL CONTACTS
    # ------------------------------------------------------------------
    story.append(Paragraph("7. Institutional References & Direct Links Directory", h1_style))
    
    ref_text = (
        "<b>1. National Institute of Statistics of Rwanda (NISR):</b> "
        "<link href=\"https://www.statistics.gov.rw\" color=\"#1D4ED8\"><u>https://www.statistics.gov.rw</u></link> — Primary source for Seasonal Agricultural Survey (SAS) and EICV poverty series.<br/>"
        "<b>2. NISR Microdata Archive Catalog:</b> "
        "<link href=\"https://microdata.statistics.gov.rw\" color=\"#1D4ED8\"><u>https://microdata.statistics.gov.rw</u></link> — Official catalog for household microdata datasets.<br/>"
        "<b>3. Ministry of Agriculture and Animal Resources (MINAGRI):</b> "
        "<link href=\"https://www.minagri.gov.rw\" color=\"#1D4ED8\"><u>https://www.minagri.gov.rw</u></link> — SSIT policy guidelines and NST2 irrigation targets.<br/>"
        "<b>4. Rwanda Agriculture and Animal Resources Development Board (RAB):</b> "
        "<link href=\"https://www.rab.gov.rw\" color=\"#1D4ED8\"><u>https://www.rab.gov.rw</u></link> — Field implementation partner for SSIT subsidized pump delivery.<br/>"
        "<b>5. European Centre for Medium-Range Weather Forecasts (ECMWF):</b> "
        "<link href=\"https://www.ecmwf.int\" color=\"#1D4ED8\"><u>https://www.ecmwf.int</u></link> & Copernicus Climate Change Service ERA5-Land Reanalysis.<br/>"
        "<b>6. UCSB Climate Hazards Center (CHIRPS):</b> "
        "<link href=\"https://www.chc.ucsb.edu/data/chirps\" color=\"#1D4ED8\"><u>https://www.chc.ucsb.edu/data/chirps</u></link> — Quasi-global high-resolution precipitation.<br/>"
        "<b>7. GADM Administrative Boundaries:</b> "
        "<link href=\"https://gadm.org\" color=\"#1D4ED8\"><u>https://gadm.org</u></link> — Spatial administrative subdivisions for Rwanda (Level 0, 1, 2, 3)."
    )

    ref_table = Table([[Paragraph(ref_text, callout_style)]], colWidths=[7.0 * inch])
    ref_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), c_card_bg),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(ref_table)

    # Build the document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"✅ Successfully compiled publication-grade PDF: {output_path}")

if __name__ == "__main__":
    out_file = sys.argv[1] if len(sys.argv) > 1 else "AgriShield_Rwanda_Raw_Data_Provenance.pdf"
    build_pdf(out_file)
