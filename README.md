# AMAC Above-Ground Carbon Stock Estimation — GeoAI Baseline

A free-data, cloud-native pipeline for estimating above-ground carbon (AGC) stock in the Abuja Municipal Area Council (AMAC), Federal Capital Territory, Nigeria, using Google Earth Engine (Sentinel-1, Sentinel-2, GEDI L4A) and a Random Forest baseline model. This repository accompanies the manuscript *"A Preliminary Random Forest Baseline for Above-Ground Carbon Stock Estimation in Abuja Municipal Area Council Using Free Multi-Sensor Satellite Data: A GeoAI Approach"*, submitted to the International Journal of Research and Innovation in Applied Science (IJRIAS).

[![DOI](https://zenodo.org/badge/DOI/INSERT_YOUR_DOI_HERE.svg)](https://doi.org/INSERT_YOUR_DOI_HERE)

> **Before publishing this repo:** replace the Zenodo badge above once archived (see [Archiving with Zenodo](#archiving-with-zenodo)), and fill in the author/citation details at the bottom of this file.

---

## Overview

This project builds a classical machine-learning baseline for above-ground carbon (AGC) mapping in AMAC entirely from free, cloud-hosted satellite data — no local downloads, no paid imagery, no GPU required for the baseline stage. It is explicitly framed as a **first step**, not a validated final product: the model uses GEDI as both training label and accuracy reference, and several caveats (random vs. spatially blocked splitting, GEDI's known savanna bias, a small number of anomalous high-biomass footprints) are documented in detail in the manuscript and reflected in this code.

**Headline results** (held-out test set, n = 3,309):

| Metric | Value |
|---|---|
| RMSE | 47.02 Mg/ha |
| MAE | 16.52 Mg/ha |
| R² | 0.345 |
| Mean predicted AGC (wall-to-wall) | 10.12 Mg C/ha |
| Estimated total AGC stock | ≈ 1.75 × 10⁶ Mg C (95% CI: 1.72–1.91 Mt C, bootstrap) |
| Study area | 172,993 ha (see note on area discrepancy in the manuscript, Section 3) |

## Repository Structure

```
.
├── README.md                              <- this file
├── AMAC_GEE_baseline.js                   <- main Earth Engine script: data stack, RF training, exports
├── AMAC_figure_export.js                  <- GEE snippet to export study-area/results map PNGs
├── AMAC_GFM_finetuning.ipynb              <- Colab notebook: Prithvi-EO-2.0 foundation-model fine-tuning (future work, not yet run)
├── data/
│   ├── AMAC_AGC_baseline_RF_MgCha.tif     <- wall-to-wall predicted AGC raster (GeoTIFF, from GEE export)
│   └── AMAC_GEDI_RF_test_predictions.csv  <- held-out test-set predictions with predictor values and coordinates
├── manuscript/
│   └── AMAC_IJRIAS_Manuscript.docx        <- full manuscript draft (IJRIAS format)
└── LICENSE
```

*(Adjust this tree to match what you actually upload — see [What to Upload](#what-to-upload) below.)*

## Data Sources (all free)

| Source | Product | Access |
|---|---|---|
| Sentinel-2 | Surface Reflectance (dry-season composite, Nov 2024–Mar 2025) | Google Earth Engine (`COPERNICUS/S2_SR_HARMONIZED`) |
| Sentinel-1 | GRD, IW mode, VV+VH | Google Earth Engine (`COPERNICUS/S1_GRD`) |
| Copernicus DEM | GLO-30 elevation | Google Earth Engine (`COPERNICUS/DEM/GLO30`) |
| GEDI | L4A Above-Ground Biomass Density (rasterized monthly product) | Google Earth Engine (`LARSE/GEDI/GEDI04_A_002_MONTHLY`) |
| AMAC boundary | Administrative boundary asset | Custom GEE asset (`projects/idrclass23/assets/AMAC_adm_osgof`) |

No commercial or paid data are used anywhere in this pipeline.

## How to Reproduce

### 1. Run the baseline (Google Earth Engine, ~10 minutes, free account)

1. Go to [code.earthengine.google.com](https://code.earthengine.google.com) and sign in.
2. Paste the contents of `AMAC_GEE_baseline.js` into a new script.
3. Update the boundary asset path if you're using your own AMAC boundary asset.
4. Click **Run**. Check the Console for diagnostic prints (data availability, sample counts, RMSE/MAE/R²).
5. Go to the **Tasks** tab and run the export tasks to send results to your Google Drive.

### 2. Export figures (optional)

Run `AMAC_figure_export.js` in the same GEE session after the baseline script, to generate study-area and results-map PNG thumbnails without needing any local GIS software.

### 3. Fine-tune a geospatial foundation model (future work, not yet executed)

`AMAC_GFM_finetuning.ipynb` is a Google Colab notebook that fine-tunes Prithvi-EO-2.0 (via [TerraTorch](https://github.com/IBM/terratorch)) on the same task, intended to be benchmarked against the Random Forest baseline. **This has not yet been run end-to-end** — see the notebook's own warnings before use, and treat its current state as a starting point for further work, not a finished result.

## Known Limitations (see manuscript for full discussion)

- **GEDI circularity**: GEDI L4A serves as both the training label and the accuracy reference in the current baseline, so reported accuracy reflects agreement with GEDI, not independent ground truth.
- **Random, not spatially blocked, train/test split**: given AMAC's compact extent, this risks a mildly optimistic accuracy estimate. A spatially blocked re-validation is planned future work.
- **Anomalous GEDI footprints**: ~0.76% of test points show implausibly high AGBD values (up to 1,740 Mg/ha); investigation (Section 5.1 of the manuscript) links most of these to a high-elevation terrain cluster consistent with known GEDI slope-related artifacts, not genuine biomass. Visual verification against high-resolution imagery is a recommended follow-up.
- **Area discrepancy**: published sources disagree on AMAC's area (commonly cited ~2,500 km² vs. this study's GIS-computed 172,993 ha / 1,729.9 km²). This repository uses the GIS-computed figure throughout; verification against an authoritative boundary source (FCTA/NPC) is recommended before the boundary asset is reused elsewhere.
- **No field validation yet**: this baseline has not been calibrated or validated against independently collected field-inventory data.

## Future Work

- Field-inventory campaign for independent AGB calibration and validation (see manuscript Section 7)
- Spatially blocked cross-validation
- Substitution of the West-Africa-specific recalibrated GEDI product (Duncanson et al., 2026, ORNL DAAC) for the default global L4A product
- Completion of the Prithvi-EO-2.0 / TerraTorch fine-tuning benchmark
- Terrain-slope-aware secondary quality filtering for GEDI footprints

## What to Upload

At minimum, upload:
- `AMAC_GEE_baseline.js`, `AMAC_figure_export.js`, `AMAC_GFM_finetuning.ipynb`
- `AMAC_GEDI_RF_test_predictions.csv` (small, easy to version)
- The manuscript `.docx` (or a PDF export of it)

The AGC GeoTIFF (`AMAC_AGC_baseline_RF_MgCha.tif`) is large — if it exceeds GitHub's file-size comfort zone, consider [Git LFS](https://git-lfs.github.com/) or hosting it separately (e.g., Zenodo, Google Drive with a linked README note) rather than committing it directly.

## Archiving with Zenodo

To get a permanent, citable DOI for this repository (required by the manuscript's Data Availability statement):

1. Create the GitHub repository and push all files.
2. Go to [zenodo.org](https://zenodo.org), sign in, and link your GitHub account under **Settings → GitHub**.
3. Toggle the repository "on" in the Zenodo GitHub integration list.
4. Go back to GitHub and create a **Release** (Releases → Draft a new release). This triggers Zenodo to archive that release automatically.
5. Zenodo will generate a DOI — copy it into the badge at the top of this README and into the manuscript's Data Availability section.

## License

[ MIT for code, CC-BY-4.0 .]

## Citation

If you use this code or data, please cite:

> [Ibrahim et al.] ([2026]). *A Preliminary Random Forest Baseline for Above-Ground Carbon Stock Estimation in Abuja Municipal Area Council Using Free Multi-Sensor Satellite Data: A GeoAI Approach.* International Journal of Research and Innovation in Applied Science (IJRIAS). [DOI/URL once published]

Repository DOI: [INSERT ZENODO DOI]

## Contact

[Idris Ibrahim/ idrisatib@gmail.com]
