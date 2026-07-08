const margin = { top: 45, right: 55, bottom: 65, left: 85 };
const width = 1400;
const height = 750;
const innerWidth = width - margin.left - margin.right;
const innerHeight = height - margin.top - margin.bottom;

// ==================== HAUPT-CHART ====================
const chart = d3.select("#chart");
const tooltip = d3.select("#tooltip");

const svg = chart
  .append("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("width", "100%")
  .attr("height", height);

const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

// Transparentes Overlay für Maus-Events
const mouseEventOverlay = g
  .append("rect")
  .attr("width", innerWidth)
  .attr("height", innerHeight)
  .attr("fill", "transparent")
  .style("pointer-events", "all");

// ==================== ZOOM-BOX (interaktiv) ====================
const zoomBoxGroup = g.append("g").style("display", "none");
const zoomBoxRect = zoomBoxGroup
  .append("rect")
  .attr("class", "zoom-box")
  .attr("rx", 4)
  .attr("ry", 4);

// 8 Resize-Handles (Ecken + Seitenmitten)
const handleSize = 10;
const handlePositions = [
  { id: "nw", cursor: "nwse-resize", dx: 0, dy: 0, edge: "nw" },
  { id: "n",  cursor: "ns-resize",   dx: 0.5, dy: 0, edge: "n" },
  { id: "ne", cursor: "nesw-resize", dx: 1, dy: 0, edge: "ne" },
  { id: "e",  cursor: "ew-resize",   dx: 1, dy: 0.5, edge: "e" },
  { id: "se", cursor: "nwse-resize", dx: 1, dy: 1, edge: "se" },
  { id: "s",  cursor: "ns-resize",   dx: 0.5, dy: 1, edge: "s" },
  { id: "sw", cursor: "nesw-resize", dx: 0, dy: 1, edge: "sw" },
  { id: "w",  cursor: "ew-resize",   dx: 0, dy: 0.5, edge: "w" }
];

let zoomHandles = [];

const xAxisG = g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerHeight})`);
const yAxisG = g.append("g").attr("class", "axis");
const pointsG = g.append("g");
const labelsG = g.append("g");
const annotationG = g.append("g");
const detailCardG = g.append("g");

const lens = g
  .append("circle")
  .attr("class", "lens-circle")
  .attr("r", 150)
  .style("display", "none");

// Achsen-Labels
svg.append("text").attr("class", "axis-label").attr("id", "xLabel")
  .attr("x", margin.left + innerWidth / 2).attr("y", height - 18).attr("text-anchor", "middle");
svg.append("text").attr("class", "axis-label").attr("id", "yLabel")
  .attr("transform", "rotate(-90)").attr("x", -(margin.top + innerHeight / 2))
  .attr("y", 22).attr("text-anchor", "middle");

// ==================== ZOOM-CHART (unten) ====================
const zoomChart = d3.select("#zoomChart");
const zoomTooltip = d3.select("#zoomTooltip");
let zoomSvg, zoomG, zoomXAxisG, zoomYAxisG, zoomPointsG, zoomLabelsG, zoomDetailCardG, zoomLens, zoomMouseOverlay;
let zoomX, zoomY, zoomR;
let zoomData = [];
let zoomModeActive = true;
let isDragging = false;
let dragStart = null;
let dragHadExistingBox = false;

// Zoom-Box Zustand
let zoomBox = {
  x1: 0, y1: 0, x2: 0, y2: 0,
  visible: false,
  active: false
};

// Resize-Zustand
let resizeMode = null; // 'move' oder handle-id
let resizeStart = null;
let resizeStartBox = null;

// ==================== ZOOM-CHART INIT ====================
function initZoomChart() {
  const zoomWrapper = document.getElementById("zoomChartWrapper");
  zoomWrapper.style.display = "none";
  
  zoomSvg = zoomChart
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height * 0.6}`)
    .attr("width", "100%")
    .attr("height", height * 0.6);

  zoomG = zoomSvg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  
  zoomXAxisG = zoomG.append("g").attr("class", "axis").attr("transform", `translate(0,${innerHeight * 0.6})`);
  zoomYAxisG = zoomG.append("g").attr("class", "axis");
  zoomPointsG = zoomG.append("g");
  zoomLabelsG = zoomG.append("g");
  zoomDetailCardG = zoomG.append("g");
  
  
  zoomLens = zoomG
    .append("circle")
    .attr("class", "lens-circle")
    .attr("r", 120)
    .style("display", "none");
  
  zoomMouseOverlay = zoomG
    .append("rect")
    .attr("width", innerWidth)
    .attr("height", innerHeight * 0.6)
    .attr("fill", "transparent")
    .style("cursor", "crosshair")
    .style("pointer-events", "all");
}

// ==================== GLOBALE VARIABLEN ====================
function color(language) {
  const languageColors = {
    "eng": "#4e79a7",    // altes D3-Standard-Blau
    "en-US": "#2f5f8f",  // dunkleres Blau davon
    "en-GB": "#8fb9d9",  // helleres Blau davon

    "fre": "#59a14f",    // grün
    "ger": "#e15759",    // rot
    "spa": "#f28e2c"     // orange/gelb
  };

  return languageColors[language] || "#bab0ab";
}

let allBooks = [];
let filteredBooks = [];
let x, y, r;
let lensRadius = 150;
let lensMode = "semantic";
let mouseLensEnabled = true;
let pointSizeMultiplier = 2;
let maxPoints = 5000;

// Globale Filter
let xField = "ratingsCount";
let yField = "rating";
let globalMinRating = 0;
let globalMinPages = 0;
let globalMaxPages = 7000;
let globalMinYear = 1900;
let globalMaxYear = 2030;
let globalMinRatingsCount = 0;
let globalMaxRatingsCount = 5000000;

// Linsen-Filter
let lensMinRating = 0;
let lensGenre = "all";
let lensMaxPages = 3000;

// ==================== GENRE-ERKENNUNG ====================
function detectGenre(book) {
  const title = (book.title || "").toLowerCase();
  const authors = (book.authors || "").toLowerCase();
  const text = title + " " + authors;
  
  if (text.match(/harry potter|wizard|magic|dragon|fantasy|sword|sorcer|witch|hobbit|lord of the rings|chronicles of narnia|percy jackson|game of thrones|rings|elf|dwarf|magician|spell|kingdom|quest|mage/i))
    return "fantasy";
  if (text.match(/star wars|space|galaxy|alien|robot|cyber|sci-fi|science fiction|mars|dune|neuromancer|hyperion|android|clone|starship|planet|universe/i))
    return "scifi";
  if (text.match(/thriller|murder|kill|crime|detective|mystery|suspense|spy|assassin|blood|death|hunt|serial|investigation|corpse|victim|suspect/i))
    return "thriller";
  if (text.match(/classic|austen|dickens|tolstoy|dostoevsky|homer|virgil|shakespeare|plato|aristotle|bronte|joyce|hemingway|fitzgerald|melville|twain/i))
    return "classic";
  if (text.match(/love|romance|heart|kiss|wedding|bride|groom|affair|passion|romantic|valentine|desire|seduction|husband|wife/i))
    return "romance";
  if (text.match(/horror|ghost|haunted|terror|nightmare|zombie|vampire|werewolf|creepy|stephen king|clive barker|dark|evil|demon/i))
    return "horror";
  if (text.match(/history|biography|guide|how to|business|science|economics|psychology|philosophy|self-help|cookbook|health|finance|investing|leadership/i))
    return "nonfiction";
  return "other";
}

// ==================== DATEN LADEN ====================
function parseBook(d) {
  const pages = +d.num_pages || +d["  num_pages"] || +d.number_of_pages || +d.pages || 0;
  const rating = +d.average_rating || 0;
  const ratingsCount = +d.ratings_count || 0;
  const title = d.title || "Unknown title";
  const authors = d.authors || "Unknown author";
  const language = d.language_code || "unknown";
  const yearRaw = d.publication_date || "";
  const yearMatch = String(yearRaw).match(/(\d{4})/);
  const publicationYear = yearMatch ? +yearMatch[1] : null;
  return { title, authors, language, pages, rating, ratingsCount, publicationYear, genre: null };
}

function validBook(d) {
  return Number.isFinite(d.pages) && d.pages > 0 && d.pages < 7000 &&
         Number.isFinite(d.rating) && d.rating > 0 && d.rating <= 5 &&
         Number.isFinite(d.ratingsCount) && d.ratingsCount > 0;
}

function loadData() {
  d3.csv("books.csv", parseBook).then(raw => {
    allBooks = raw.filter(validBook);
    allBooks.forEach(book => { book.genre = detectGenre(book); });
    allBooks.sort((a, b) => b.ratingsCount - a.ratingsCount);
    allBooks = allBooks.slice(0, maxPoints);
    console.log(`✅ Geladen: ${allBooks.length} Bücher`);
    updateGlobalFilters();
  }).catch(error => {
    chart.append("p").style("padding", "20px").style("color", "#b00020")
      .html(`❌ Fehler: <strong>books.csv</strong> nicht gefunden. Bitte die Kaggle CSV-Datei als <strong>books.csv</strong> im selben Ordner ablegen.`);
    console.error(error);
  });
}

// ==================== GLOBALE FILTER ====================
function applyGlobalFilters() {
  return allBooks.filter(book => {
    if (book.rating < globalMinRating) return false;
    if (book.pages < globalMinPages) return false;
    if (book.pages > globalMaxPages) return false;
    if (book.publicationYear) {
      if (book.publicationYear < globalMinYear) return false;
      if (book.publicationYear > globalMaxYear) return false;
    }
    if (book.ratingsCount < globalMinRatingsCount) return false;
    if (book.ratingsCount > globalMaxRatingsCount) return false;
    return true;
  });
}

function updateGlobalFilters() {
  filteredBooks = applyGlobalFilters();
  updateScales();
  updateAxesAndLabels();
  drawPoints();
  clearLens();
  updateZoomChart();
  
  d3.select("#globalMinRatingValue").text(globalMinRating.toFixed(1));
  d3.select("#globalMinPagesValue").text(globalMinPages);
  d3.select("#globalMaxPagesValue").text(globalMaxPages);
  d3.select("#globalMinYearValue").text(globalMinYear);
  d3.select("#globalMaxYearValue").text(globalMaxYear);
  d3.select("#globalMinRatingsCountValue").text(globalMinRatingsCount.toLocaleString("en-US"));
  d3.select("#globalMaxRatingsCountValue").text(globalMaxRatingsCount.toLocaleString("en-US"));
  d3.select("#filteredCount").text(filteredBooks.length.toLocaleString("en-US"));
  d3.select("#totalCount").text(allBooks.length.toLocaleString("en-US"));
}

// ==================== LINSEN-FILTER ====================
function passesLensFilters(book) {
  if (lensMinRating > 0 && book.rating < lensMinRating) return false;
  if (lensGenre !== "all" && book.genre !== lensGenre) return false;
  if (lensMaxPages < 3000 && book.pages > lensMaxPages) return false;
  return true;
}

function applyLensFilters(books) {
  return books.filter(book => passesLensFilters(book));
}

// ==================== NÄCHSTES BUCH ZUM ZENTRUM ====================
function findClosestBookToCenter(centerX, centerY, books, xScale, yScale, fieldX, fieldY) {
  if (books.length === 0) return null;
  let closest = null, minDist = Infinity;
  for (const book of books) {
    const bx = xScale(book[fieldX]), by = yScale(book[fieldY]);
    const d = Math.hypot(bx - centerX, by - centerY);
    if (d < minDist) { minDist = d; closest = book; }
  }
  return closest;
}

// ==================== SKALEN ====================
function updateScales() {
  const getX = d => d[xField], getY = d => d[yField];
  let xDomain = [0, d3.quantile(filteredBooks.map(getX).sort(d3.ascending), 0.98)];
  let yDomain = [0, d3.quantile(filteredBooks.map(getY).sort(d3.ascending), 0.98)];
  if (xField === "rating") xDomain = [2.5, 5];
  if (yField === "rating") yDomain = [2.5, 5];
  if (xField === "pages") xDomain = [0, globalMaxPages];
  if (yField === "pages") yDomain = [0, globalMaxPages];
  if (xField === "ratingsCount") xDomain = [0, d3.max(filteredBooks, getX)];
  if (yField === "ratingsCount") yDomain = [0, d3.max(filteredBooks, getY)];
  if (xField === "publicationYear") xDomain = [1900, 2010];
  if (yField === "publicationYear") yDomain = [1900, 2010];
  
  x = d3.scaleLinear().domain(xDomain).nice().range([0, innerWidth]);
  y = d3.scaleLinear().domain(yDomain).nice().range([innerHeight, 0]);
  
  const maxRC = d3.max(filteredBooks, d => d.ratingsCount) || 100000;
  r = d3.scaleSqrt().domain([0, maxRC]).range([pointSizeMultiplier, pointSizeMultiplier * 14]);
}

function updateAxesAndLabels() {
  xAxisG.transition().duration(300).call(d3.axisBottom(x).ticks(10));
  yAxisG.transition().duration(300).call(d3.axisLeft(y).ticks(8));
  const labels = { pages: "📄 Seitenanzahl", rating: "⭐ Durchschnitts-Rating", 
                   ratingsCount: "👍 Anzahl Bewertungen", publicationYear: "📅 Erscheinungsjahr" };
  d3.select("#xLabel").text(labels[xField] || xField);
  d3.select("#yLabel").text(labels[yField] || yField);
}

// ==================== PUNKTE ZEICHNEN ====================
function drawPoints() {
  const points = pointsG.selectAll("circle.book-point")
    .data(filteredBooks, d => `${d.title}-${d.authors}`);
  
  points.join(
    enter => enter.append("circle")
      .attr("class", "book-point")
      .attr("cx", d => x(d[xField]))
      .attr("cy", d => y(d[yField]))
      .attr("r", d => r(d.ratingsCount))
      .attr("fill", d => color(d.language))
      .attr("data-genre", d => d.genre)
      .style("pointer-events", "none"),
    update => update.transition().duration(300)
      .attr("cx", d => x(d[xField]))
      .attr("cy", d => y(d[yField]))
      .attr("r", d => r(d.ratingsCount))
      .attr("fill", d => color(d.language))
      .attr("data-genre", d => d.genre)
      .style("pointer-events", "none"),
    exit => exit.remove()
  );
}

// ==================== TOOLTIP ====================
function showTooltip(event, d) {
  tooltip.html(`
    <strong>📖 ${escapeHtml(d.title)}</strong><br>
    ✍️ ${escapeHtml(d.authors)}<br>
    ⭐ ${d.rating.toFixed(2)}<br>
    📄 ${d.pages} Seiten<br>
    👍 ${d.ratingsCount.toLocaleString("en-US")}<br>
    📅 ${d.publicationYear || "?"}<br>
    🏷️ ${d.genre || "Unbekannt"}<br>
    🌍 ${escapeHtml(d.language)}
  `).classed("hidden", false);
  moveTooltip(event);
}

function moveTooltip(event) {
  const rect = chart.node().getBoundingClientRect();
  tooltip.style("left", `${event.clientX - rect.left + 14}px`).style("top", `${event.clientY - rect.top + 14}px`);
}

function hideTooltip() { tooltip.classed("hidden", true); }

// ==================== DETAIL-KARTE ====================
function renderDetailCard(centerX, centerY, book) {
  renderBookDetailCard(detailCardG, book, centerX, centerY, innerHeight);
}

function renderBookDetailCard(targetGroup, book, centerX, centerY, chartHeight) {
  targetGroup.selectAll("*").remove();
  if (!book) return;

  const cardWidth = 320;
  const cardHeight = 155;

  let cardX = centerX + lensRadius + 15;
  let cardY = centerY - cardHeight / 2;

  if (cardX + cardWidth > innerWidth) {
    cardX = centerX - lensRadius - cardWidth - 15;
  }

  cardY = Math.max(10, Math.min(cardY, chartHeight - cardHeight - 10));

  targetGroup.append("rect")
    .attr("class", "detail-card")
    .attr("x", cardX)
    .attr("y", cardY)
    .attr("width", cardWidth)
    .attr("height", cardHeight)
    .attr("rx", 12)
    .attr("ry", 12);

  targetGroup.append("text")
    .attr("class", "detail-card-title")
    .attr("x", cardX + 15)
    .attr("y", cardY + 28)
    .text(shorten(book.title, 45));

  targetGroup.append("text")
    .attr("class", "detail-card-author")
    .attr("x", cardX + 15)
    .attr("y", cardY + 52)
    .text(`✍️ ${shorten(book.authors, 42)}`);

  targetGroup.append("line")
    .attr("x1", cardX + 10)
    .attr("y1", cardY + 62)
    .attr("x2", cardX + cardWidth - 10)
    .attr("y2", cardY + 62)
    .attr("stroke", "#e94560")
    .attr("stroke-width", 1)
    .attr("opacity", 0.5);

  const leftX = cardX + 15;
  const rightX = cardX + cardWidth / 2 + 5;
  const startY = cardY + 88;
  const rowGap = 24;

  const details = [
    { label: "⭐ Rating", value: book.rating.toFixed(2), x: leftX, y: startY },
    { label: "📄 Seiten", value: book.pages, x: leftX, y: startY + rowGap },
    { label: "👍 Votes", value: book.ratingsCount.toLocaleString("en-US"), x: leftX, y: startY + rowGap * 2 },

    { label: "🎭 Genre", value: getGenreName(book.genre || "other"), x: rightX, y: startY },
    { label: "📅 Jahr", value: book.publicationYear || "?", x: rightX, y: startY + rowGap },
    { label: "🌍 Sprache", value: book.language.toUpperCase(), x: rightX, y: startY + rowGap * 2 }
  ];

  details.forEach(d => {
    targetGroup.append("text")
      .attr("class", "detail-card-label")
      .attr("x", d.x)
      .attr("y", d.y)
      .text(d.label);

    targetGroup.append("text")
      .attr("class", "detail-card-value")
      .attr("x", d.x + 72)
      .attr("y", d.y)
      .text(d.value);
  });
}

// ==================== ZOOM-BOX INTERAKTIV ====================
function updateZoomBox(x1, y1, x2, y2) {
  // In Daten-Koordinaten speichern
  zoomBox.x1 = Math.min(x.invert(x1), x.invert(x2));
  zoomBox.x2 = Math.max(x.invert(x1), x.invert(x2));
  zoomBox.y1 = Math.min(y.invert(y1), y.invert(y2));
  zoomBox.y2 = Math.max(y.invert(y1), y.invert(y2));
  zoomBox.visible = true;
  
  // Pixel-Koordinaten für die Anzeige
  const px1 = x(zoomBox.x1);
  const px2 = x(zoomBox.x2);
  const py1 = y(zoomBox.y1);
  const py2 = y(zoomBox.y2);
  
  zoomBoxRect
    .attr("x", px1)
    .attr("y", py2) // y ist invertiert
    .attr("width", px2 - px1)
    .attr("height", py1 - py2);
  
  // Handles aktualisieren
  updateHandles(px1, py1, px2, py2);
  
  zoomBoxGroup.style("display", null).raise();
  
  // Zoom-Daten aktualisieren
  zoomData = getZoomData(zoomBox);
  updateZoomChart();
  
  // Punkte im Haupt-Chart markieren
  pointsG.selectAll("circle.book-point")
    .classed("zoomed", d => {
      const valX = d[xField], valY = d[yField];
      return valX >= zoomBox.x1 && valX <= zoomBox.x2 && 
             valY >= zoomBox.y1 && valY <= zoomBox.y2;
    });
}

function updateHandles(px1, py1, px2, py2) {
  zoomHandles.forEach(h => h.remove());
  zoomHandles = [];

  // Wichtig:
  // Bei y-Skalen ist oben/unten in SVG invertiert.
  // Deshalb bestimmen wir visuell echte Kanten.
  const pxLeft = Math.min(px1, px2);
  const pxRight = Math.max(px1, px2);
  const pyTop = Math.min(py1, py2);
  const pyBottom = Math.max(py1, py2);

  const centerX = (pxLeft + pxRight) / 2;
  const centerY = (pyTop + pyBottom) / 2;

  handlePositions.forEach(pos => {
    let hx, hy;
    let isCorner = false;

    if (pos.edge === "nw") { hx = pxLeft;  hy = pyTop;    isCorner = true; }
    else if (pos.edge === "n") { hx = centerX; hy = pyTop; }
    else if (pos.edge === "ne") { hx = pxRight; hy = pyTop; isCorner = true; }
    else if (pos.edge === "e") { hx = pxRight; hy = centerY; }
    else if (pos.edge === "se") { hx = pxRight; hy = pyBottom; isCorner = true; }
    else if (pos.edge === "s") { hx = centerX; hy = pyBottom; }
    else if (pos.edge === "sw") { hx = pxLeft; hy = pyBottom; isCorner = true; }
    else if (pos.edge === "w") { hx = pxLeft; hy = centerY; }

    const size = isCorner ? handleSize * 1.5 : handleSize;

    const handle = zoomBoxGroup.append("rect")
      .attr("class", "zoom-box-handle")
      .attr("x", hx - size / 2)
      .attr("y", hy - size / 2)
      .attr("width", size)
      .attr("height", size)
      .attr("rx", size / 2)
      .attr("ry", size / 2)
      .style("cursor", pos.cursor)
      .style("pointer-events", "all")
      .datum({ id: pos.edge, isCorner });

    zoomHandles.push(handle);
  });
}

function getZoomData(box) {
  return filteredBooks.filter(book => {
    const valX = book[xField], valY = book[yField];
    return valX >= box.x1 && valX <= box.x2 && 
           valY >= box.y1 && valY <= box.y2;
  });
}

function updateZoomChart() {
  if (!zoomSvg) initZoomChart();
  
  const zoomWrapper = document.getElementById("zoomChartWrapper");
  
  if (zoomData.length === 0) {
    zoomWrapper.style.display = "none";
    return;
  }
  
  zoomWrapper.style.display = "block";
  document.getElementById("zoomCount").textContent = zoomData.length;
  
  const zoomHeight = innerHeight * 0.6;
  const getX = d => d[xField], getY = d => d[yField];
  
  let xDomain = [d3.min(zoomData, getX), d3.max(zoomData, getX)];
  let yDomain = [d3.min(zoomData, getY), d3.max(zoomData, getY)];
  
  const xPad = (xDomain[1] - xDomain[0]) * 0.05 || 1;
  const yPad = (yDomain[1] - yDomain[0]) * 0.05 || 0.1;
  xDomain = [xDomain[0] - xPad, xDomain[1] + xPad];
  yDomain = [yDomain[0] - yPad, yDomain[1] + yPad];
  
  if (xField === "rating") xDomain = [Math.max(2.5, xDomain[0]), Math.min(5, xDomain[1])];
  if (yField === "rating") yDomain = [Math.max(2.5, yDomain[0]), Math.min(5, yDomain[1])];
  
  zoomX = d3.scaleLinear().domain(xDomain).nice().range([0, innerWidth]);
  zoomY = d3.scaleLinear().domain(yDomain).nice().range([zoomHeight, 0]);
  
  const maxRC = d3.max(zoomData, d => d.ratingsCount) || 100000;
  zoomR = d3.scaleSqrt().domain([0, maxRC]).range([pointSizeMultiplier, pointSizeMultiplier * 12]);
  
  zoomXAxisG.transition().duration(300).call(d3.axisBottom(zoomX).ticks(8));
  zoomYAxisG.transition().duration(300).call(d3.axisLeft(zoomY).ticks(8));
  
  const points = zoomPointsG.selectAll("circle.zoom-point")
    .data(zoomData, d => `${d.title}-${d.authors}`);
  
  points.join(
    enter => enter.append("circle")
      .attr("class", "zoom-point book-point")
      .attr("cx", d => zoomX(d[xField]))
      .attr("cy", d => zoomY(d[yField]))
      .attr("r", d => zoomR(d.ratingsCount))
      .attr("fill", d => color(d.language))
      .style("pointer-events", "none")
      .style("opacity", 0.7),
    update => update.transition().duration(300)
      .attr("cx", d => zoomX(d[xField]))
      .attr("cy", d => zoomY(d[yField]))
      .attr("r", d => zoomR(d.ratingsCount))
      .attr("fill", d => color(d.language))
      .style("opacity", 0.7),
    exit => exit.remove()
  );
  
  // Zoom Lens Events
// Zoom Lens Events – gleiche Semantic Lens wie oben
zoomMouseOverlay.on("mousemove", function(event) {
  if (!mouseLensEnabled) {
    zoomLens.style("display", "none");
    zoomLabelsG.selectAll("*").remove();
    zoomDetailCardG.selectAll("*").remove();
    zoomTooltip.classed("hidden", true);
    return;
  }

  const [mx, my] = d3.pointer(event, zoomG.node());

  if (mx < 0 || mx > innerWidth || my < 0 || my > zoomHeight) {
    zoomLens.style("display", "none");
    zoomLabelsG.selectAll("*").remove();
    zoomDetailCardG.selectAll("*").remove();
    zoomTooltip.classed("hidden", true);

    zoomPointsG.selectAll("circle.zoom-point")
      .classed("in-lens", false)
      .classed("lens-hidden", false)
      .classed("closest-point", false)
      .attr("r", d => zoomR(d.ratingsCount))
      .style("opacity", 0.7)
      .style("stroke", "white")
      .style("stroke-width", 0.6);

    return;
  }

  zoomTooltip.classed("hidden", true);

  zoomLens
    .style("display", null)
    .attr("cx", mx)
    .attr("cy", my)
    .attr("r", lensRadius);

  const booksInLensArea = zoomData
    .map(d => ({ ...d, sx: zoomX(d[xField]), sy: zoomY(d[yField]) }))
    .filter(d => Math.hypot(d.sx - mx, d.sy - my) <= lensRadius);

  const filteredBooksInLens = booksInLensArea.filter(book => passesLensFilters(book));

  const closestBook = findClosestBookToCenter(
    mx,
    my,
    filteredBooksInLens,
    zoomX,
    zoomY,
    xField,
    yField
  );

  zoomPointsG.selectAll("circle.zoom-point")
    .classed("in-lens", d => {
      const inside = Math.hypot(zoomX(d[xField]) - mx, zoomY(d[yField]) - my) <= lensRadius;
      return inside && passesLensFilters(d);
    })
    .classed("lens-hidden", d => {
      const inside = Math.hypot(zoomX(d[xField]) - mx, zoomY(d[yField]) - my) <= lensRadius;
      return inside && !passesLensFilters(d);
    })
    .classed("closest-point", d => {
      return closestBook && d.title === closestBook.title && d.authors === closestBook.authors;
    })
    .attr("r", d => {
      const inside = Math.hypot(zoomX(d[xField]) - mx, zoomY(d[yField]) - my) <= lensRadius;
      if (!inside) return zoomR(d.ratingsCount);
      if (closestBook && d.title === closestBook.title && d.authors === closestBook.authors) {
        return Math.max(zoomR(d.ratingsCount), 12);
      }
      if (passesLensFilters(d)) return Math.max(zoomR(d.ratingsCount), 7);
      return zoomR(d.ratingsCount);
    })
    .style("opacity", d => {
      const inside = Math.hypot(zoomX(d[xField]) - mx, zoomY(d[yField]) - my) <= lensRadius;
      if (inside && !passesLensFilters(d)) return 0;
      if (closestBook && d.title === closestBook.title && d.authors === closestBook.authors) return 1;
      return 0.7;
    });

  const topBooks = filteredBooksInLens
    .map(b => ({
      ...b,
      dist: Math.hypot(zoomX(b[xField]) - mx, zoomY(b[yField]) - my)
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 8);

  zoomLabelsG.selectAll("text.lens-label")
    .data(topBooks, d => `${d.title}-${d.authors}`)
    .join(
      enter => enter.append("text")
        .attr("class", "lens-label")
        .attr("x", d => zoomX(d[xField]) + 10)
        .attr("y", d => zoomY(d[yField]) - 8)
        .text(d => shorten(d.title, 25)),
      update => update
        .attr("x", d => zoomX(d[xField]) + 10)
        .attr("y", d => zoomY(d[yField]) - 8)
        .text(d => shorten(d.title, 25)),
      exit => exit.remove()
    );

  zoomDetailCardG.selectAll("*").remove();

if (closestBook) {
  renderBookDetailCard(zoomDetailCardG, closestBook, mx, my, zoomHeight);
} else {
  zoomDetailCardG.selectAll("*").remove();
}
}).on("mouseleave", function() {
  zoomLens.style("display", "none");
  zoomLabelsG.selectAll("*").remove();
  zoomDetailCardG.selectAll("*").remove();
  zoomTooltip.classed("hidden", true);

  zoomPointsG.selectAll("circle.zoom-point")
    .classed("in-lens", false)
    .classed("lens-hidden", false)
    .classed("closest-point", false)
    .attr("r", d => zoomR(d.ratingsCount))
    .style("opacity", 0.7)
    .style("stroke", "white")
    .style("stroke-width", 0.6);
});
}

// ==================== MAGIC LENS (Haupt-Chart) ====================
let currentLensPosition = null;

function updateLens(event) {
  if (!mouseLensEnabled) {
    clearLens();
    return;
  }

  lensMode = "semantic";

  const [mx, my] = d3.pointer(event, g.node());
  if (mx < 0 || mx > innerWidth || my < 0 || my > innerHeight) {
    clearLens();
    return;
  }
  
  lens.style("display", null).attr("cx", mx).attr("cy", my).attr("r", lensRadius);
  currentLensPosition = { mx, my };
  
  const booksInLensArea = filteredBooks
    .map(d => ({ ...d, sx: x(d[xField]), sy: y(d[yField]) }))
    .filter(d => Math.hypot(d.sx - mx, d.sy - my) <= lensRadius);
  
  const filteredBooksInLens = applyLensFilters(booksInLensArea);
  
  let closestBook = null;
  if (lensMode === "semantic") {
    closestBook = findClosestBookToCenter(mx, my, filteredBooksInLens, x, y, xField, yField);
    if (closestBook) renderDetailCard(mx, my, closestBook);
    else detailCardG.selectAll("*").remove();
  } else {
    detailCardG.selectAll("*").remove();
  }
  
  const withDist = filteredBooksInLens.map(b => ({ b, dist: Math.hypot(x(b[xField])-mx, y(b[yField])-my) }));
  withDist.sort((a,b) => a.dist - b.dist);
  const topBooks = withDist.slice(0, 8).map(item => item.b);
  
  pointsG.selectAll("circle.book-point")
    .classed("in-lens", d => {
      const inside = Math.hypot(x(d[xField])-mx, y(d[yField])-my) <= lensRadius;
      return inside && passesLensFilters(d);
    })
    .classed("lens-hidden", d => {
      const inside = Math.hypot(x(d[xField])-mx, y(d[yField])-my) <= lensRadius;
      return inside && !passesLensFilters(d);
    })
    .classed("closest-point", d => {
      if (lensMode !== "semantic") return false;
      return closestBook && d.title === closestBook.title && d.authors === closestBook.authors;
    })
    .attr("r", d => {
      const inside = Math.hypot(x(d[xField])-mx, y(d[yField])-my) <= lensRadius;
      if (!inside) return r(d.ratingsCount);
      if (lensMode === "semantic") {
        if (closestBook && d.title === closestBook.title && d.authors === closestBook.authors)
          return Math.max(r(d.ratingsCount), 12);
        return Math.max(r(d.ratingsCount), 7);
      }
      if (passesLensFilters(d)) return r(d.ratingsCount) + 3;
      return r(d.ratingsCount);
    });
  
  pointsG.selectAll("circle.book-point.lens-hidden").style("opacity", 0);
  pointsG.selectAll("circle.book-point:not(.lens-hidden)").style("opacity", 0.55);
  pointsG.selectAll("circle.book-point.closest-point")
    .style("opacity", 1).style("stroke", "#e94560").style("stroke-width", 3);
  
  renderLabels(topBooks);
}

function renderLabels(topBooks) {
  const labels = labelsG.selectAll("text.lens-label")
    .data(topBooks, d => `${d.title}-${d.authors}`);
  labels.join(
    enter => enter.append("text").attr("class", "lens-label")
      .attr("x", d => d.sx + 10).attr("y", d => d.sy - 8)
      .text(d => shorten(d.title, 25)),
    update => update.attr("x", d => d.sx + 10).attr("y", d => d.sy - 8)
      .text(d => shorten(d.title, 25)),
    exit => exit.remove()
  );
}

function renderAnnotation(mx, my, booksInLens) {
  annotationG.selectAll("*").remove();
  if (lensMode === "detail") {
    const count = booksInLens.length;
    const avgRating = d3.mean(booksInLens, d => d.rating);
    const avgPages = d3.mean(booksInLens, d => d.pages);
    const avgRatings = d3.mean(booksInLens, d => d.ratingsCount);
    const topGenre = getTopGenre(booksInLens);
    const boxX = Math.min(mx + lensRadius + 12, innerWidth - 280);
    const boxY = Math.max(8, Math.min(my - 65, innerHeight - 130));
    annotationG.append("rect").attr("class", "annotation-box")
      .attr("x", boxX).attr("y", boxY).attr("width", 280).attr("height", 125).attr("rx", 8);
    const filterInfo = [];
    if (lensMinRating > 0) filterInfo.push(`⭐ ≥ ${lensMinRating.toFixed(1)}`);
    if (lensGenre !== "all") filterInfo.push(`🎭 ${getGenreName(lensGenre)}`);
    if (lensMaxPages < 3000) filterInfo.push(`📄 ≤ ${lensMaxPages}`);
    const fText = filterInfo.length ? ` (${filterInfo.join(", ")})` : "";
    const lines = [
      `🔬 In Linse: ${count} Bücher${fText}`,
      `⭐ Ø Rating: ${avgRating ? avgRating.toFixed(2) : "-"}`,
      `📄 Ø Seiten: ${avgPages ? Math.round(avgPages) : "-"}`,
      `👍 Ø Bewertungen: ${avgRatings ? Math.round(avgRatings).toLocaleString("en-US") : "-"}`,
      `🏷️ Top Genre: ${topGenre || "-"}`,
      `🎯 Modus: Detail-Lens`
    ];
    annotationG.selectAll("text.annotation-text")
      .data(lines).join("text").attr("class", "annotation-text")
      .attr("x", boxX + 10).attr("y", (d,i) => boxY + 20 + i*17).text(d => d);
  } else if (lensMode === "semantic") {
    const boxX = Math.min(mx + lensRadius + 12, innerWidth - 220);
    const boxY = Math.max(8, Math.min(my - 40, innerHeight - 70));
    annotationG.append("rect").attr("class", "annotation-box-small")
      .attr("x", boxX).attr("y", boxY).attr("width", 210).attr("height", 55).attr("rx", 8);
    const filterInfo = [];
    if (lensMinRating > 0) filterInfo.push(`⭐ ≥ ${lensMinRating.toFixed(1)}`);
    if (lensGenre !== "all") filterInfo.push(`🎭 ${getGenreName(lensGenre)}`);
    if (lensMaxPages < 3000) filterInfo.push(`📄 ≤ ${lensMaxPages}`);
    const fText = filterInfo.length ? ` (${filterInfo.join(", ")})` : "";
    const lines = [
      `🔬 ${booksInLens.length} Bücher in Linse${fText}`,
      `📍 Nächstes Buch → Detail-Karte`
    ];
    annotationG.selectAll("text.annotation-text-small")
      .data(lines).join("text").attr("class", "annotation-text-small")
      .attr("x", boxX + 10).attr("y", (d,i) => boxY + 22 + i*18).text(d => d);
  }
}

function getTopGenre(books) {
  if (!books.length) return "—";
  const g = {};
  books.forEach(b => { const genre = b.genre || "other"; g[genre] = (g[genre]||0)+1; });
  let top = "other", max = 0;
  for (const [genre, count] of Object.entries(g)) if (count > max) { max = count; top = genre; }
  return getGenreName(top);
}

function getGenreName(genre) {
  const names = { fantasy: "🐉 Fantasy", scifi: "🚀 Sci-Fi", thriller: "🔪 Thriller", 
                  classic: "📖 Klassiker", romance: "💕 Romance", horror: "👻 Horror", 
                  nonfiction: "📰 Sachbuch", other: "📚 Sonstige", all: "🌍 Alle" };
  return names[genre] || genre;
}

function clearLens() {
  lens.style("display", "none");
  labelsG.selectAll("*").remove();
  annotationG.selectAll("*").remove();
  detailCardG.selectAll("*").remove();
  pointsG.selectAll("circle.book-point")
    .classed("in-lens", false).classed("lens-hidden", false).classed("closest-point", false)
    .attr("r", d => r(d.ratingsCount))
    .style("opacity", 0.55).style("stroke", "white").style("stroke-width", 0.6);
}

// ==================== ZOOM-BOX INTERAKTION (Mouse Events) ====================
function handleMouseDown(event) {
  if (!zoomModeActive) return;
  
  const [mx, my] = d3.pointer(event, g.node());
  if (mx < 0 || mx > innerWidth || my < 0 || my > innerHeight) return;
  
  // Prüfen ob auf einem Handle geklickt wurde
  let targetHandle = null;
  for (const handle of zoomHandles) {
    const node = handle.node();
    const bbox = node.getBBox();
    if (mx >= bbox.x && mx <= bbox.x + bbox.width &&
        my >= bbox.y && my <= bbox.y + bbox.height) {
      targetHandle = handle.datum();
      break;
    }
  }
  
  if (targetHandle) {
    // Resize-Modus
    resizeMode = targetHandle.id;
    resizeStart = { x: mx, y: my };
    resizeStartBox = { x1: zoomBox.x1, y1: zoomBox.y1, x2: zoomBox.x2, y2: zoomBox.y2 };
    return;
  }
  
  // Prüfen ob innerhalb der Box geklickt wurde (Move)
  const px1 = x(zoomBox.x1);
  const px2 = x(zoomBox.x2);
  const py1 = y(zoomBox.y1);
  const py2 = y(zoomBox.y2);
  
  if (mx >= px1 && mx <= px2 && my >= py2 && my <= py1) {
    // Move-Modus
    resizeMode = "move";
    resizeStart = { x: mx, y: my };
    resizeStartBox = { x1: zoomBox.x1, y1: zoomBox.y1, x2: zoomBox.x2, y2: zoomBox.y2 };
    return;
  }
  
  // Neuen Zoom-Bereich starten.
  // Nur wenn wirklich ein neues Rechteck gezogen wird, wird die Box ersetzt.
  if (!zoomBox.visible || mx < px1 || mx > px2 || my < py2 || my > py1) {
    dragHadExistingBox = zoomBox.visible;
    isDragging = true;
    dragStart = { x: mx, y: my };
    return;
  }
}

function isMouseInsideZoomBox(mx, my) {
  if (!zoomBox.visible) return false;

  const px1 = x(zoomBox.x1);
  const px2 = x(zoomBox.x2);
  const py1 = y(zoomBox.y1);
  const py2 = y(zoomBox.y2);

  const left = Math.min(px1, px2);
  const right = Math.max(px1, px2);
  const top = Math.min(py1, py2);
  const bottom = Math.max(py1, py2);

  return mx >= left && mx <= right && my >= top && my <= bottom;
}

function handleMouseMove(event) {
  const [mx, my] = d3.pointer(event, g.node());
  
  // Zoom-Box Resize/Move
  if (resizeMode) {
    const dx = mx - resizeStart.x;
    const dy = my - resizeStart.y;
    let newBox = { ...resizeStartBox };
    
    // In Daten-Koordinaten umrechnen.
    // Dann stimmt die Richtung auch bei invertierter y-Achse.
    const dxData = x.invert(resizeStart.x + dx) - x.invert(resizeStart.x);
    const dyData = y.invert(resizeStart.y + dy) - y.invert(resizeStart.y);

    const minWidthData = (x.domain()[1] - x.domain()[0]) * 0.01;
    const minHeightData = (y.domain()[1] - y.domain()[0]) * 0.01;

    if (resizeMode === "move") {
      // Maus rechts -> Box rechts
      // Maus runter -> Box runter
      newBox.x1 = resizeStartBox.x1 + dxData;
      newBox.x2 = resizeStartBox.x2 + dxData;
      newBox.y1 = resizeStartBox.y1 + dyData;
      newBox.y2 = resizeStartBox.y2 + dyData;
    } else {
      const handle = resizeMode;
      const x1 = resizeStartBox.x1;
      const x2 = resizeStartBox.x2;
      const y1 = resizeStartBox.y1; // untere Datenkante / kleinerer y-Wert
      const y2 = resizeStartBox.y2; // obere Datenkante / größerer y-Wert

      // Linke Kante
      if (handle.includes("w")) {
        newBox.x1 = x1 + dxData;
        if (newBox.x1 > x2 - minWidthData) {
          newBox.x1 = x2 - minWidthData;
        }
      }

      // Rechte Kante
      if (handle.includes("e")) {
        newBox.x2 = x2 + dxData;
        if (newBox.x2 < x1 + minWidthData) {
          newBox.x2 = x1 + minWidthData;
        }
      }

      // Obere Kante.
      // Bei SVG bedeutet Maus runter: dyData wird kleiner.
      // Dadurch bewegt sich die obere Kante visuell nach unten.
      if (handle.includes("n")) {
        newBox.y2 = y2 + dyData;
        if (newBox.y2 < y1 + minHeightData) {
          newBox.y2 = y1 + minHeightData;
        }
      }

      // Untere Kante.
      // Maus runter -> y1 wird kleiner -> Kante geht visuell nach unten.
      if (handle.includes("s")) {
        newBox.y1 = y1 + dyData;
        if (newBox.y1 > y2 - minHeightData) {
          newBox.y1 = y2 - minHeightData;
        }
      }
    }
    
    // Update Box
    zoomBox.x1 = newBox.x1;
    zoomBox.x2 = newBox.x2;
    zoomBox.y1 = newBox.y1;
    zoomBox.y2 = newBox.y2;
    zoomBox.visible = true;
    
    const px1 = x(zoomBox.x1);
    const px2 = x(zoomBox.x2);
    const py1 = y(zoomBox.y1);
    const py2 = y(zoomBox.y2);
    
    zoomBoxRect
      .attr("x", px1)
      .attr("y", py2)
      .attr("width", px2 - px1)
      .attr("height", py1 - py2);
    
    updateHandles(px1, py1, px2, py2);
    
    // Zoom-Daten aktualisieren
    zoomData = getZoomData(zoomBox);
    updateZoomChart();
    
    pointsG.selectAll("circle.book-point")
      .classed("zoomed", d => {
        const valX = d[xField], valY = d[yField];
        return valX >= zoomBox.x1 && valX <= zoomBox.x2 && 
               valY >= zoomBox.y1 && valY <= zoomBox.y2;
      });
    
    return;
  }
  
  // Neuen Drag (Zeichnen) fortsetzen
  if (isDragging && dragStart) {
    const x1 = Math.min(dragStart.x, mx);
    const y1 = Math.min(dragStart.y, my);
    const x2 = Math.max(dragStart.x, mx);
    const y2 = Math.max(dragStart.y, my);
    
    // Temporäre Box anzeigen
    zoomBoxRect
      .attr("x", x1)
      .attr("y", y1)
      .attr("width", x2 - x1)
      .attr("height", y2 - y1)
      .style("fill", null)
      .style("stroke", null)
      .style("stroke-width", null);
    
    // Box während des Zeichnens sichtbar machen und nach vorne holen
    zoomBoxGroup.style("display", null).raise();

    // Handles während des Zeichnens ausblenden
    zoomHandles.forEach(h => h.style("display", "none"));
    
    return;
  }
  
if (!mouseLensEnabled) {
  clearLens();
  return;
}

if (isMouseInsideZoomBox(mx, my)) {
  clearLens();
  return;
}

if (!isDragging && !resizeMode) {
  updateLens(event);
}

}

function handleMouseUp(event) {
  if (isDragging && dragStart) {
    const [mx, my] = d3.pointer(event, g.node());
    const x1 = Math.min(dragStart.x, mx);
    const y1 = Math.min(dragStart.y, my);
    const x2 = Math.max(dragStart.x, mx);
    const y2 = Math.max(dragStart.y, my);
    
    // Mindestgröße prüfen
    if (x2 - x1 > 10 && y2 - y1 > 10) {
      // Box finalisieren
      updateZoomBox(x1, y1, x2, y2);
    } else {
      // Zu klein = normaler Klick.
      // Wenn vorher schon eine Box existierte, bleibt sie bestehen.
      // Wenn keine Box existierte, wird nichts angezeigt.
      if (!dragHadExistingBox) {
        zoomBoxGroup.style("display", "none");
        zoomBox.visible = false;
      }
    }
    
    isDragging = false;
    dragStart = null;
    dragHadExistingBox = false;
  }
  
  // Handles wieder einblenden
  zoomHandles.forEach(h => h.style("display", null));
  
  resizeMode = null;
  resizeStart = null;
  resizeStartBox = null;
}

// ==================== ZOOM ZURÜCKSETZEN ====================
function resetZoom() {
  zoomBox.visible = false;
  zoomBoxGroup.style("display", "none");
  zoomData = [];
  zoomPointsG.selectAll("*").remove();
  document.getElementById("zoomChartWrapper").style.display = "none";
  pointsG.selectAll("circle.book-point").classed("zoomed", false);
  isDragging = false;
  dragStart = null;
  resizeMode = null;
  zoomHandles.forEach(h => h.remove());
  zoomHandles = [];
}

// ==================== HELPER ====================
function shorten(text, maxLen) {
  return text.length > maxLen ? text.slice(0, maxLen-1) + "…" : text;
}

function escapeHtml(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// ==================== LENS NEU RENDERN ====================
function onLensGenreChange() {
  if (lens.style("display") !== "none" && currentLensPosition) {
    const fake = { clientX: currentLensPosition.mx + margin.left, clientY: currentLensPosition.my + margin.top };
    updateLens(fake);
  }
}

// ==================== EVENT-LISTENER ====================
function setupEventListeners() {

  // Achsen
function setXAxis(value) {
  xField = value;
  d3.select("#xAxisSelect").property("value", value);
  d3.select("#xAxisPicker").property("value", value);
  updateGlobalFilters();
}

function setYAxis(value) {
  yField = value;
  d3.select("#yAxisSelect").property("value", value);
  d3.select("#yAxisPicker").property("value", value);
  updateGlobalFilters();
}

d3.select("#xAxisSelect").on("change", function() {
  setXAxis(this.value);
});

d3.select("#yAxisSelect").on("change", function() {
  setYAxis(this.value);
});

d3.select("#xAxisPicker").on("change", function() {
  setXAxis(this.value);
  updateAxisFilterDock();
});

d3.select("#yAxisPicker").on("change", function() {
  setYAxis(this.value);
  updateAxisFilterDock();
});

d3.select("#axisPickerClose").on("click", function() {
  restoreGlobalFilterBlocks();
  d3.select("#axisPicker").classed("hidden", true);
});

const globalFilterContent = d3.select(".global-filter-content").node();
const axisFilterDock = d3.select("#axisFilterDock").node();

function restoreGlobalFilterBlocks() {
  ["filterBlockRating", "filterBlockPages", "filterBlockYear", "filterBlockRatingsCount"].forEach(id => {
    const block = document.getElementById(id);
    if (block) {
      globalFilterContent.appendChild(block);
    }
  });
}

function updateAxisFilterDock() {
  restoreGlobalFilterBlocks();

  const activeFields = [...new Set([xField, yField])];

  const map = {
    rating: "filterBlockRating",
    pages: "filterBlockPages",
    publicationYear: "filterBlockYear",
    ratingsCount: "filterBlockRatingsCount"
  };

  activeFields.forEach(field => {
    const block = document.getElementById(map[field]);
    if (block) {
      axisFilterDock.appendChild(block);
    }
  });
}

function openAxisPickerAt(event) {
  const wrapperRect = chart.node().getBoundingClientRect();

  let left = event.clientX - wrapperRect.left + 30;
  let top = event.clientY - wrapperRect.top - 50;

  left = Math.min(left, wrapperRect.width - 100);
  top = Math.min(top, wrapperRect.height - 390);

  left = Math.max(10, left);
  top = Math.max(10, top);

  updateAxisFilterDock();

  d3.select("#xAxisPicker").property("value", xField);
  d3.select("#yAxisPicker").property("value", yField);

  d3.select("#axisPicker")
    .style("left", `${left}px`)
    .style("top", `${top}px`)
    .classed("hidden", false);
}

// kleine Klick-Symbole neben den Achsen
svg.append("text")
  .attr("id", "xAxisPickerIcon")
  .attr("class", "axis-picker-icon")
  .attr("x", margin.left - 28)
  .attr("y", margin.top + innerHeight + 34)
  .attr("text-anchor", "middle")
  .attr("font-size", "26px")
  .text("⚙")
  .on("click", function(event) {
    event.stopPropagation();
    openAxisPickerAt(event);
  });

d3.select("body").on("click.axisInlineClose", function() {
  d3.select("#xAxisInlineSelect").classed("hidden", true);
  d3.select("#yAxisInlineSelect").classed("hidden", true);
});
  
  // Globale Filter
  d3.select("#globalMinRating").on("input", function() { globalMinRating = +this.value; updateGlobalFilters(); });
  d3.select("#globalMinPages").on("input", function() { globalMinPages = +this.value; updateGlobalFilters(); });
  d3.select("#globalMaxPages").on("input", function() { globalMaxPages = +this.value; updateGlobalFilters(); });
  d3.select("#globalMinYear").on("input", function() { globalMinYear = +this.value; updateGlobalFilters(); });
  d3.select("#globalMaxYear").on("input", function() { globalMaxYear = +this.value; updateGlobalFilters(); });
  d3.select("#globalMinRatingsCount").on("input", function() { globalMinRatingsCount = +this.value; updateGlobalFilters(); });
  d3.select("#globalMaxRatingsCount").on("input", function() { globalMaxRatingsCount = +this.value; updateGlobalFilters(); });
  
  d3.select("#maxPoints").on("input", function() {
    maxPoints = +this.value; d3.select("#maxPointsValue").text(maxPoints);
    allBooks.sort((a, b) => b.ratingsCount - a.ratingsCount);
    allBooks = allBooks.slice(0, maxPoints);
    updateGlobalFilters();
  });
  
  d3.select("#pointSize").on("input", function() {
    pointSizeMultiplier = +this.value; d3.select("#pointSizeValue").text(pointSizeMultiplier);
    updateScales(); drawPoints();
  });
  
  // Linsen-Filter
  d3.select("#lensMinRating").on("input", function() { 
    lensMinRating = +this.value; 
    d3.select("#lensMinRatingValue").text(lensMinRating.toFixed(1));
    onLensGenreChange();
  });
  
  d3.select("#lensGenre").on("change", function() { 
    lensGenre = this.value;
    onLensGenreChange();
  });
  
  d3.select("#lensMaxPages").on("input", function() { 
    lensMaxPages = +this.value; 
    d3.select("#lensMaxPagesValue").text(lensMaxPages);
    onLensGenreChange();
  });
  
  d3.select("#mouseLensToggle").on("change", function() {
  mouseLensEnabled = this.checked;

  if (!mouseLensEnabled) {
    clearLens();
  } else {
    onLensGenreChange();
  }
});

  d3.select("#lensRadius").on("input", function() {
    lensRadius = +this.value; d3.select("#lensRadiusValue").text(lensRadius);
    lens.attr("r", lensRadius);
    onLensGenreChange();
  });
  
  // Zoom Mode
  d3.select("#zoomModeCheck").on("change", function() {
    zoomModeActive = this.checked;
    if (!zoomModeActive) {
      resetZoom();
    }
    mouseEventOverlay.style("cursor", zoomModeActive ? "crosshair" : "crosshair");
  });
  
  // Zoom Reset
  d3.select("#zoomResetBtn").on("click", resetZoom);
  d3.select("#zoomCloseBtn").on("click", resetZoom);
  
  // Maus-Events für interaktive Zoom-Box
  // Wichtig: am SVG abfangen, nicht nur am transparenten Overlay.
  // Sonst blockiert die Zoom-Box selbst die Events.
  svg
    .on("mousedown", handleMouseDown)
    .on("mousemove", handleMouseMove)
    .on("mouseup", handleMouseUp)
    .on("mouseleave", function(event) {
      clearLens();

      if (isDragging) {
        handleMouseUp(event);
      }

      if (resizeMode) {
        resizeMode = null;
        resizeStart = null;
        resizeStartBox = null;
        zoomHandles.forEach(h => h.style("display", null));
      }
    });
}

// ==================== START ====================
initZoomChart();
setupEventListeners();
loadData();