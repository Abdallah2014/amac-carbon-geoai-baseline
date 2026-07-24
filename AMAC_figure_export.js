/* ==========================================================================
   FIGURE EXPORT — run this AFTER the main AMAC_GEE_baseline.js script
   (it reuses 'amac', 'aoi', and 'agcMap' from that script's session).
   Produces two ready-to-use PNG figures, rendered server-side by Earth
   Engine — no local GeoTIFF decoding needed on either end.
   ========================================================================== */

// ---------------------------------------------------------------------
// FIGURE 1 — Study area: AMAC boundary over a satellite basemap
// ---------------------------------------------------------------------
var basemap = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi.buffer(15000))   // small buffer so AMAC sits inside its regional context
  .filterDate('2024-11-01', '2025-03-31')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
  .median()
  .clip(aoi.buffer(15000));

var basemapVis = basemap.visualize({bands: ['B4','B3','B2'], min: 0, max: 3000});

// Draw the AMAC boundary as a bright outline on top of the basemap
var outline = ee.Image().byte().paint({
  featureCollection: amac,
  color: 1,
  width: 3
}).visualize({palette: ['FFFF00']});  // yellow outline

var studyAreaFigure = basemapVis.blend(outline);

print('Figure 1 (study area) thumbnail URL — click to preview, right-click to save:',
  studyAreaFigure.getThumbURL({
    region: aoi.buffer(15000),
    dimensions: 1200,
    format: 'png'
  }));

// ---------------------------------------------------------------------
// FIGURE 2 — Results: predicted AGC map with boundary + legend context
// ---------------------------------------------------------------------
var agcVis = agcMap.visualize({
  min: 0, max: 70,
  palette: ['ffffff', 'ffffcc', 'c2e699', '78c679', '31a354', '006837']
});

var resultsFigure = agcVis.blend(outline);

print('Figure 2 (predicted AGC map) thumbnail URL — click to preview, right-click to save:',
  resultsFigure.getThumbURL({
    region: aoi,
    dimensions: 1200,
    format: 'png'
  }));

/* ==========================================================================
   HOW TO USE:
   1. Run this script (Console will print two clickable thumbnail links).
   2. Click each link — it opens the rendered PNG directly in a new browser
      tab. Right-click -> "Save image as..." to download it.
   3. Upload both PNGs back to this chat. I'll drop them into the
      manuscript as Figure 1 (study area) and Figure 2 (results map),
      with proper captions, no local raster decoding required on my end.

   NOTE: getThumbURL has a size ceiling (a few thousand pixels per side);
   1200 px is comfortably within it and is plenty for a journal figure at
   normal print size. If you want a higher-resolution version for final
   print production, use Export.image.toDrive with the same 'visualize()'
   image instead, at a smaller pixel scale.
   ========================================================================== */
