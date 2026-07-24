/* ==========================================================================
   AMAC (Abuja Municipal Area Council) — Multimodal AGB Baseline
   Free-data pipeline: Sentinel-2 (optical) + Sentinel-1 (SAR) + GEDI L4A (AGBD)
   Run at: https://code.earthengine.google.com  (free account, no install)
   Paste this whole file into a new script, click "Run".
   ========================================================================== */

// ---------------------------------------------------------------------
// 1. STUDY AREA — AMAC boundary from user-provided GEE asset
//    If, after the fix in Section 6, GEDI shot counts in AMAC alone are
//    still too thin for a robust train/test split, the simplest fallback
//    is buffering the AOI used ONLY for training-data extraction (leave
//    map/export AOI as amac) — e.g. aoi.buffer(5000) — rather than
//    switching to full FCT, which would pull in a very different mix of
//    land cover and weaken the local-calibration argument in Section 4.2
//    of the manuscript. Check the printed shot count below first.
// ---------------------------------------------------------------------
var amac = ee.FeatureCollection('projects/idrclass23/assets/AMAC_adm_osgof');
var aoi = amac.geometry();

Map.centerObject(amac, 10);
Map.addLayer(amac, {color: 'yellow'}, 'AMAC Boundary');

// ---------------------------------------------------------------------
// 2. SENTINEL-2 — cloud-masked dry-season median composite (10 m)
// ---------------------------------------------------------------------
function maskS2clouds(image) {
  var qa = image.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0).and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask).divide(10000);
}

var s2coll = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi)
  .filterDate('2024-11-01', '2025-03-31')   // dry season = least cloud, most stable canopy
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30));

print('Diagnostic — Sentinel-2 image count over AMAC/date window:', s2coll.size());

var s2 = s2coll.map(maskS2clouds).median().clip(aoi);

var ndvi = s2.normalizedDifference(['B8', 'B4']).rename('NDVI');
var ndwi = s2.normalizedDifference(['B3', 'B8']).rename('NDWI');
var evi = s2.expression(
  '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))',
  {NIR: s2.select('B8'), RED: s2.select('B4'), BLUE: s2.select('B2')}
).rename('EVI');

var s2bands = s2.select(['B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12'])
  .addBands([ndvi, ndwi, evi]);

Map.addLayer(s2, {bands: ['B4','B3','B2'], min: 0, max: 0.3}, 'Sentinel-2 RGB (dry season)', false);

// ---------------------------------------------------------------------
// 3. SENTINEL-1 — SAR backscatter median composite (10 m, cloud-independent)
// ---------------------------------------------------------------------
var s1coll = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(aoi)
  .filterDate('2024-11-01', '2025-03-31')
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'));

print('Diagnostic — Sentinel-1 (VV+VH, IW) image count over AMAC/date window:', s1coll.size());

var s1 = s1coll.select(['VV', 'VH']).median().clip(aoi);

var vv_vh_ratio = s1.select('VV').divide(s1.select('VH')).rename('VV_VH_ratio');
var s1bands = s1.addBands(vv_vh_ratio);

Map.addLayer(s1.select('VV'), {min: -20, max: 0}, 'Sentinel-1 VV', false);

// ---------------------------------------------------------------------
// 4. TERRAIN — Copernicus DEM (30 m), for SAR terrain context
//    NOTE: ee.Terrain.slope() was dropped here — computed on a
//    .mosaic()'d + .clip()'d DEM it came back null for virtually every
//    GEDI point (likely a projection-definition issue with slope's
//    gradient calculation on a mosaicked image), which was silently
//    zeroing out the entire training set once required as a non-null
//    predictor. Elevation alone remains as the terrain covariate; slope
//    can be reintroduced later with an explicitly reprojected DEM if
//    the manuscript's methodology calls for it.
// ---------------------------------------------------------------------
var dem = ee.ImageCollection('COPERNICUS/DEM/GLO30').select('DEM').mosaic().clip(aoi);
var terrain = dem.rename('elevation');

// ---------------------------------------------------------------------
// 5. GEDI L4A — footprint-level AGBD, the reference/label layer (sparse!)
//    NOTE: GEDI04_A_002 coverage in Earth Engine spans 2019-04-18 to
//    2024-11-28 only (instrument was also off-line for stretches of
//    2023). Filtering to a later window (e.g. 2023-2025) returns
//    little/no data — use the full mission window below.
// ---------------------------------------------------------------------
function qualityMask(im) {
  return im.updateMask(im.select('l4_quality_flag').eq(1))
           .updateMask(im.select('degrade_flag').eq(0))
           .updateMask(im.select('agbd').gte(0)); // drop invalid/negative AGBD
}

var gediRaw = ee.ImageCollection('LARSE/GEDI/GEDI04_A_002_MONTHLY')
  .filterBounds(aoi)
  .filterDate('2019-04-18', '2024-11-28')  // full available mission window
  .select('agbd')
  .mosaic()
  .clip(aoi);

// Diagnostic: count valid pixels BEFORE quality masking, so if this is
// also 0 we know the problem is coverage/geometry, not the quality filter.
var rawValidCount = gediRaw.reduceRegion({
  reducer: ee.Reducer.count(),
  geometry: aoi,
  scale: 25,
  maxPixels: 1e9,
  bestEffort: true
});
print('Diagnostic — raw (pre-quality-mask) valid GEDI pixel count in AMAC:', rawValidCount.get('agbd'));

var gedi = ee.ImageCollection('LARSE/GEDI/GEDI04_A_002_MONTHLY')
  .filterBounds(aoi)
  .filterDate('2019-04-18', '2024-11-28')
  .map(qualityMask)
  .select('agbd')
  .mosaic()
  .clip(aoi);

Map.addLayer(gedi, {min: 0, max: 150, palette: ['white','yellow','green','darkgreen']}, 'GEDI L4A AGBD (sparse)', true);

// ---------------------------------------------------------------------
// 6. STACK PREDICTORS + EXTRACT AT ACTUAL GEDI SHOT LOCATIONS
//    Diagnostics showed S2/S1/terrain are ~fully populated but GEDI is
//    genuinely sparse (~0.4% of the AOI) — and Image.sample() proved
//    unreliable at finding those sparse pixels even with numPixels as
//    high as 300,000 (expected hundreds of hits, got zero). Rasterized
//    sample() is the wrong tool for thin, sparse linear features like
//    GEDI orbit tracks. Fix: query GEDI's own POINT-level table
//    (LARSE/GEDI/GEDI04_A_002, the vector product) directly for real
//    shot locations, then extract predictor values exactly there via
//    reduceRegions — no random-draw guessing involved.
// ---------------------------------------------------------------------
var predictors = s2bands.addBands(s1bands).addBands(terrain);

// The GEDI point-level vector table (LARSE/GEDI/GEDI04_A_002) turned out
// to be a dead end: it's an IndexedFolder, and its INDEX table's dates
// are plain strings (not system:time_start), so filterDate() silently
// drops everything; worse, ee.FeatureCollection() cannot load a table
// by a server-computed ID inside map() at all ("must be a constant").
// So: extract points from the RASTER product instead, but correctly
// this time. Root cause of every earlier zero/mismatch error: pixelLonLat()
// bands are UNMASKED by default, so combining them with the masked
// 'agbd' band and reduceRegion(toList) computed each band's list against
// its OWN mask independently — giving mismatched list lengths (millions
// of lon/lat entries vs. only ~11,000 agbd entries), which is exactly
// what caused the earlier out-of-bounds index errors. Fix: force lon/lat
// to carry GEDI's own mask before extracting.
var lonlatMasked = ee.Image.pixelLonLat().updateMask(gedi.mask());
var combined = gedi.addBands(lonlatMasked);

var extracted = combined.reduceRegion({
  reducer: ee.Reducer.toList(),
  geometry: aoi,
  scale: 25,
  maxPixels: 1e9,
  bestEffort: true
});

var lons = ee.List(extracted.get('longitude'));
var lats = ee.List(extracted.get('latitude'));
var agbdVals = ee.List(extracted.get('agbd'));

print('Diagnostic — extracted longitude list length:', lons.size());
print('Diagnostic — extracted agbd list length (should match):', agbdVals.size());

var n = lons.size();
var gediShots = ee.FeatureCollection(
  ee.List.sequence(0, n.subtract(1)).map(function(i) {
    i = ee.Number(i);
    return ee.Feature(
      ee.Geometry.Point([lons.get(i), lats.get(i)]),
      {agbd: agbdVals.get(i)}
    );
  })
);

print('Diagnostic — GEDI shot points (raster-derived) found in AMAC:', gediShots.size());

var samplesRaw = predictors.reduceRegions({
  collection: gediShots,
  reducer: ee.Reducer.first(),
  scale: 10
});
print('Diagnostic — samples BEFORE notNull filter:', samplesRaw.size());
print('Diagnostic — first sample feature (inspect properties):', samplesRaw.first());

// Full literal predictor band list (S2: 13, S1: 3, terrain: 1 = 17 bands).
// Using an explicit literal array here rather than predictors.bandNames()
// (a server-computed ee.List) avoids the filter-behavior issues seen
// earlier. 'slope' was removed from the terrain group (Section 4) after
// it came back null for virtually every point — this list now matches
// that change exactly.
var allPredictorBands = ['B2','B3','B4','B5','B6','B7','B8','B8A','B11','B12',
  'NDVI','NDWI','EVI','VV','VH','VV_VH_ratio','elevation'];

var samples = samplesRaw.filter(ee.Filter.notNull(allPredictorBands.concat(['agbd'])));

print('Number of usable GEDI-AGBD training/validation points in AMAC:', samples.size());
Map.addLayer(samples, {color: 'blue'}, 'GEDI sample points used for training', false);

// ---------------------------------------------------------------------
// 7. TRAIN/TEST SPLIT (spatially naive random split — see manuscript
//    Section 4.6 for why a spatially BLOCKED split is preferred for the
//    final analysis; this random split is a quick-look baseline only)
// ---------------------------------------------------------------------
var withRandom = samples.randomColumn('random', 42);
var train = withRandom.filter(ee.Filter.lt('random', 0.7));
var test = withRandom.filter(ee.Filter.gte('random', 0.7));

var predictorNames = allPredictorBands;

// ---------------------------------------------------------------------
// 8. BASELINE MODEL — Random Forest (classical ML baseline, per manuscript
//    Section 4.3: quantify GFM uplift against this, don't assume it)
// ---------------------------------------------------------------------
var rf = ee.Classifier.smileRandomForest({numberOfTrees: 200, seed: 42})
  .setOutputMode('REGRESSION')
  .train({
    features: train,
    classProperty: 'agbd',
    inputProperties: predictorNames
  });

// Apply to test set and compute accuracy metrics
var tested = test.classify(rf, 'agbd_predicted');

var errorMetrics = tested.map(function(f) {
  var obs = ee.Number(f.get('agbd'));
  var pred = ee.Number(f.get('agbd_predicted'));
  var err = pred.subtract(obs);
  return f.set({sq_err: err.pow(2), abs_err: err.abs()});
});

var rmse = ee.Number(errorMetrics.aggregate_mean('sq_err')).sqrt();
var mae = errorMetrics.aggregate_mean('abs_err');
var r = tested.reduceColumns({
  reducer: ee.Reducer.pearsonsCorrelation(),
  selectors: ['agbd', 'agbd_predicted']
});

print('--- BASELINE RF ACCURACY (held-out random split, AMAC, GEDI-referenced) ---');
print('RMSE (Mg/ha):', rmse);
print('MAE (Mg/ha):', mae);
print('Pearson r / r2:', r);

// ---------------------------------------------------------------------
// 9. APPLY MODEL WALL-TO-WALL ACROSS AMAC — the actual AGB/AGC map
// ---------------------------------------------------------------------
var agbMap = predictors.classify(rf, 'AGB_Mgha').clip(aoi);
Map.addLayer(agbMap, {min: 0, max: 150, palette: ['white','yellow','green','darkgreen']}, 'Predicted AGB map (Mg/ha)');

// Carbon stock (Mg C/ha) via standard 0.47 biomass-to-carbon conversion
// (IPCC Good Practice Guidance default — see manuscript Section 4.4)
var agcMap = agbMap.multiply(0.47).rename('AGC_MgCha');
Map.addLayer(agcMap, {min: 0, max: 70, palette: ['white','yellow','green','darkgreen']}, 'Predicted AGC map (Mg C/ha)');

// ---------------------------------------------------------------------
// 10. ZONAL SUMMARY — mean AGC and total stock for AMAC
// ---------------------------------------------------------------------
var meanAGC = agcMap.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: aoi,
  scale: 10,
  maxPixels: 1e9
});
print('Mean predicted AGC (Mg C/ha) across AMAC:', meanAGC);

var areaHa = aoi.area().divide(10000);
print('AMAC area (ha):', areaHa);

// ---------------------------------------------------------------------
// 11. EXPORTS — run these from the Tasks tab after reviewing the map
// ---------------------------------------------------------------------
Export.image.toDrive({
  image: agcMap,
  description: 'AMAC_AGC_baseline_RF_MgCha',
  folder: 'AMAC_carbon',
  region: aoi,
  scale: 10,
  maxPixels: 1e9
});

Export.table.toDrive({
  collection: tested,
  description: 'AMAC_GEDI_RF_test_predictions',
  folder: 'AMAC_carbon',
  fileFormat: 'CSV'
});

// ---------------------------------------------------------------------
// 12. EXTRA EXPORTS FOR THE GFM (PRITHVI/TERRATORCH) FINE-TUNING NOTEBOOK
//     Prithvi-EO-2.0 expects exactly 6 HLS-convention bands in this
//     order: Blue, Green, Red, Narrow NIR, SWIR1, SWIR2. The standard
//     Sentinel-2 -> HLS band mapping is: Blue=B2, Green=B3, Red=B4,
//     Narrow NIR=B8A, SWIR1=B11, SWIR2=B12.
// ---------------------------------------------------------------------
var hlsStack = s2.select(['B2','B3','B4','B8A','B11','B12'])
  .rename(['BLUE','GREEN','RED','NIR_NARROW','SWIR1','SWIR2']);

Export.image.toDrive({
  image: hlsStack,
  description: 'AMAC_S2_HLS6band_stack',
  folder: 'AMAC_carbon',
  region: aoi,
  scale: 10,
  maxPixels: 1e9,
  fileFormat: 'GeoTIFF'
});

// Full GEDI point set (all 10,978, not just the 30% test split), with
// explicit lon/lat columns so the notebook can locate each point in the
// exported GeoTIFF without depending on GEE's ".geo" CSV column format.
var gediPointsForExport = samples.map(function(f) {
  var coords = f.geometry().coordinates();
  return f.set({lon: coords.get(0), lat: coords.get(1)});
});

Export.table.toDrive({
  collection: gediPointsForExport,
  description: 'AMAC_GEDI_points_lonlat_agbd',
  folder: 'AMAC_carbon',
  fileFormat: 'CSV',
  selectors: ['lon', 'lat', 'agbd']
});

/* ==========================================================================
   NOTES FOR THE MANUSCRIPT (Section 6 "Evaluation Metrics and Expected
   Outcomes"):
   - This script gives you a REAL classical-ML (Random Forest) baseline
     using entirely free data (Sentinel-1/2 + GEDI L4A), matching the
     baseline described in Section 4.3.
   - It uses GEDI itself as BOTH predictor-training label AND accuracy
     reference, which is standard practice when no field plots exist yet,
     but it inherits GEDI's known savanna bias (Section 3.2, Gap G3) —
     report this explicitly, do not present it as ground-truth-validated.
   - Once your field-inventory plots (Section 4.2) are digitized, replace
     the GEDI-derived 'agbd' label in Section 6 above with your field-
     measured AGB per plot for a genuinely field-calibrated model, and
     use GEDI only as an additional predictor band, not the label.
   - The train/test split here is random, not spatially blocked (Section
     4.6 flags this as a leakage risk) — treat these numbers as a
     provisional/quick-look benchmark, not the final reported accuracy.
   - This script does NOT fine-tune a foundation model (Clay/DOFA/Prithvi)
     — GEE cannot run GPU deep-learning fine-tuning. That step needs a
     separate Python/PyTorch pipeline (e.g., in Google Colab), exporting
     the Sentinel-1/2/GEDI stack from this script as the input tensors.
     Ask for this notebook as a follow-up once this baseline runs cleanly.
   ========================================================================== */
