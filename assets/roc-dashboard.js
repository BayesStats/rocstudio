(function () {
  const root = document.getElementById("fig13-dashboard");
  if (!root) return;

  const densitySvg = document.getElementById("roc-density-plot");
  const rocSvg = document.getElementById("roc-roc-plot");
  const conceptChoice = document.getElementById("roc-metric-choice");
  const metricLabel = document.getElementById("roc-metric-label");
  const metricValue = document.getElementById("roc-metric-value");
  const secondaryMetric = document.getElementById("roc-secondary-metric");
  const metricCaption = document.getElementById("roc-metric-caption");
  const conceptNote = document.getElementById("roc-concept-note");
  const figureKicker = document.getElementById("roc-figure-kicker");
  const dashboardTitle = document.getElementById("roc-dashboard-title");
  const leftPanelTitle = document.getElementById("roc-left-panel-title");
  const rightPanelTitle = document.getElementById("roc-right-panel-title");

  const defaults = {
    mcmc: {},
    auc: {
      blueMean: 0,
      blueSd: 1,
      redMean: 2,
      redSd: 1
    },
    affinity: {
      blueMean: 0,
      blueSd: 0.5,
      redLeft: -5,
      redLeftSd: 0.32,
      redRight: 5,
      redRightSd: 0.32
    }
  };

  const requestedConcept = new URLSearchParams(window.location.search).get("concept");
  const conceptNames = new Set(["mcmc", "auc", "affinity"]);
  const initialConcept = conceptNames.has(requestedConcept) ? requestedConcept : "mcmc";

  const state = {
    concept: initialConcept,
    params: clone(defaults[initialConcept])
  };

  const colors = {
    blue: "#2563eb",
    blueFill: "rgba(37, 99, 235, 0.18)",
    red: "#e14a61",
    redFill: "rgba(225, 74, 97, 0.18)",
    coral: "#f9735b",
    teal: "#16a6a6",
    tealFill: "rgba(22, 166, 166, 0.18)",
    ink: "#15324d",
    gold: "#d99a21",
    overlap: "rgba(67, 86, 108, 0.16)",
    roc: "#003366",
    grid: "#e5ebf1"
  };

  const densityBaseView = {
    w: 640,
    h: 340,
    m: { top: 18, right: 18, bottom: 58, left: 64 }
  };

  const rocView = {
    w: 560,
    h: 340,
    m: { top: 18, right: 20, bottom: 60, left: 66 }
  };

  const mcmcTraceView = {
    w: 640,
    h: 340,
    m: { top: 22, right: 18, bottom: 58, left: 64 },
    xMin: 1,
    xMax: 180,
    yMin: -2.65,
    yMax: 2.55,
    xTicks: [1, 45, 90, 135, 180],
    yTicks: [-2, -1, 0, 1, 2]
  };

  const mcmcDensityView = {
    w: 560,
    h: 340,
    m: { top: 22, right: 22, bottom: 60, left: 66 },
    xMin: -2.7,
    xMax: 3,
    yMin: 0,
    yMax: 0.95,
    xTicks: [-2, -1, 0, 1, 2, 3],
    yTicks: [0, 0.45, 0.9]
  };

  const mcmc = createMcmcData();
  const mcmcCycleMs = 11600;
  const mcmcHoldMs = 1200;
  let animationFrame = null;
  let animationStart = null;
  let drag = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function erf(x) {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * ax);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax);
    return sign * y;
  }

  function normalCdf(x) {
    return 0.5 * (1 + erf(x / Math.SQRT2));
  }

  function normalPdf(x, mean, sd) {
    const z = (x - mean) / sd;
    return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
  }

  function seededRng(seed) {
    let value = seed >>> 0;
    return function nextRandom() {
      value = (1664525 * value + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function randomNormal(rng) {
    const u1 = Math.max(rng(), 1e-10);
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function createMcmcData() {
    const rng = seededRng(31031);
    const total = 180;
    const burn = 24;
    const targetMean = 1.05;
    const targetSd = 0.48;
    const rho = 0.9;
    const innovationSd = targetSd * Math.sqrt(1 - rho * rho);
    const chain = new Array(total);
    chain[0] = -2.35;

    for (let i = 1; i < total; i += 1) {
      const pull = targetMean + rho * (chain[i - 1] - targetMean);
      const drift = i < burn ? 0.035 * (burn - i) / burn : 0;
      chain[i] = pull + innovationSd * randomNormal(rng) + drift;
    }

    const grid = Array.from({ length: 180 }, (_, i) => {
      return mcmcDensityView.xMin + (i / 179) * (mcmcDensityView.xMax - mcmcDensityView.xMin);
    });

    return {
      chain,
      total,
      burn,
      grid,
      targetMean,
      targetSd
    };
  }

  function blueDensity(x) {
    const p = state.params;
    return normalPdf(x, p.blueMean, p.blueSd);
  }

  function redDensity(x) {
    const p = state.params;
    if (state.concept === "affinity") {
      return 0.5 * normalPdf(x, p.redLeft, p.redLeftSd) + 0.5 * normalPdf(x, p.redRight, p.redRightSd);
    }
    return normalPdf(x, p.redMean, p.redSd);
  }

  function blueCdf(x) {
    const p = state.params;
    return normalCdf((x - p.blueMean) / p.blueSd);
  }

  function redCdf(x) {
    const p = state.params;
    if (state.concept === "affinity") {
      return 0.5 * normalCdf((x - p.redLeft) / p.redLeftSd) + 0.5 * normalCdf((x - p.redRight) / p.redRightSd);
    }
    return normalCdf((x - p.redMean) / p.redSd);
  }

  function allMeans() {
    const p = state.params;
    if (state.concept === "affinity") return [p.redLeft, p.blueMean, p.redRight];
    return [p.blueMean, p.redMean];
  }

  function maxSd() {
    const p = state.params;
    if (state.concept === "affinity") return Math.max(p.blueSd, p.redLeftSd, p.redRightSd);
    return Math.max(p.blueSd, p.redSd);
  }

  function densityView() {
    if (state.concept === "affinity") {
      return { ...densityBaseView, xMin: -7, xMax: 7, xTicks: [-6, -4, -2, 0, 2, 4, 6] };
    }
    return { ...densityBaseView, xMin: -4, xMax: 6, xTicks: [-4, -2, 0, 2, 4, 6] };
  }

  function integrationBounds() {
    const means = allMeans();
    const pad = Math.max(6, 9 * maxSd());
    return {
      min: Math.min(...means) - pad,
      max: Math.max(...means) + pad
    };
  }

  function integrate(fn, steps = 1400) {
    const { min, max } = integrationBounds();
    const h = (max - min) / steps;
    let total = 0;
    for (let i = 0; i <= steps; i += 1) {
      const x = min + i * h;
      const weight = i === 0 || i === steps ? 0.5 : 1;
      total += weight * fn(x);
    }
    return total * h;
  }

  function aucValue() {
    return clamp(integrate((x) => blueCdf(x) * redDensity(x)), 0, 1);
  }

  function affinityValue() {
    return clamp(integrate((x) => Math.sqrt(Math.max(0, blueDensity(x) * redDensity(x)))), 0, 1);
  }

  function svgEl(name, attrs = {}) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === "text") {
        el.textContent = value;
      } else {
        el.setAttribute(key, value);
      }
    });
    return el;
  }

  function clear(svg, view) {
    svg.setAttribute("viewBox", `0 0 ${view.w} ${view.h}`);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function linePath(points, xScale, yScale) {
    return points.map((p, i) => `${i ? "L" : "M"} ${xScale(p.x).toFixed(2)} ${yScale(p.y).toFixed(2)}`).join(" ");
  }

  function areaPath(points, xScale, yScale, baseline) {
    const start = points[0];
    const end = points[points.length - 1];
    const curve = points.map((p) => `L ${xScale(p.x).toFixed(2)} ${yScale(p.y).toFixed(2)}`).join(" ");
    return [
      `M ${xScale(start.x).toFixed(2)} ${yScale(baseline).toFixed(2)}`,
      curve,
      `L ${xScale(end.x).toFixed(2)} ${yScale(baseline).toFixed(2)}`,
      "Z"
    ].join(" ");
  }

  function addTitle(el, text) {
    el.appendChild(svgEl("title", { text }));
    return el;
  }

  function formatNumber(value) {
    return value.toFixed(3);
  }

  function formatAxisTick(tick) {
    if (Math.abs(tick) >= 1) return tick.toFixed(1).replace(/\.0$/, "");
    return tick.toFixed(1);
  }

  function setControlValues() {
    conceptChoice.value = state.concept;
  }

  function drawAxes(svg, view, xScale, yScale, xTicks, yTicks, xLabel, yLabel) {
    const { w, h, m } = view;
    const axis = svgEl("g", { class: "roc-axis" });
    axis.appendChild(svgEl("line", { x1: m.left, y1: h - m.bottom, x2: w - m.right, y2: h - m.bottom }));
    axis.appendChild(svgEl("line", { x1: m.left, y1: m.top, x2: m.left, y2: h - m.bottom }));

    xTicks.forEach((tick) => {
      const x = xScale(tick);
      axis.appendChild(svgEl("line", { class: "roc-grid-line", x1: x, y1: m.top, x2: x, y2: h - m.bottom }));
      axis.appendChild(svgEl("line", { x1: x, y1: h - m.bottom, x2: x, y2: h - m.bottom + 5 }));
      axis.appendChild(svgEl("text", { class: "roc-axis-tick", x, y: h - m.bottom + 22, "text-anchor": "middle", text: formatAxisTick(tick) }));
    });

    yTicks.forEach((tick) => {
      const y = yScale(tick);
      axis.appendChild(svgEl("line", { class: "roc-grid-line", x1: m.left, y1: y, x2: w - m.right, y2: y }));
      axis.appendChild(svgEl("line", { x1: m.left - 5, y1: y, x2: m.left, y2: y }));
      axis.appendChild(svgEl("text", { class: "roc-axis-tick", x: m.left - 10, y: y + 4, "text-anchor": "end", text: formatAxisTick(tick) }));
    });

    axis.appendChild(svgEl("text", { class: "roc-axis-label", x: (m.left + w - m.right) / 2, y: h - 10, "text-anchor": "middle", text: xLabel }));
    axis.appendChild(svgEl("text", {
      class: "roc-axis-label",
      x: 18,
      y: (m.top + h - m.bottom) / 2,
      transform: `rotate(-90 18 ${(m.top + h - m.bottom) / 2})`,
      "text-anchor": "middle",
      text: yLabel
    }));
    svg.appendChild(axis);
  }

  function densityYMax(points) {
    const rawMax = Math.max(...points.map((p) => Math.max(p.blue, p.red))) * 1.18;
    return Math.max(state.concept === "affinity" ? 1.05 : 0.9, rawMax);
  }

  function dataXFromPointer(event) {
    const view = densityView();
    const rect = densitySvg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * view.w;
    const span = view.xMax - view.xMin;
    const plotW = view.w - view.m.left - view.m.right;
    return view.xMin + ((px - view.m.left) / plotW) * span;
  }

  function dataPointFromPointer(event) {
    const view = densityView();
    const rect = densitySvg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * view.w;
    const py = ((event.clientY - rect.top) / rect.height) * view.h;
    const span = view.xMax - view.xMin;
    const plotW = view.w - view.m.left - view.m.right;
    const plotH = view.h - view.m.top - view.m.bottom;
    const yMax = drag?.yMax || 1;
    return {
      x: view.xMin + ((px - view.m.left) / plotW) * span,
      y: ((view.h - view.m.bottom - py) / plotH) * yMax
    };
  }

  function startMeanDrag(target, event) {
    event.preventDefault();
    drag = {
      kind: "mean",
      target,
      startX: dataXFromPointer(event),
      snapshot: clone(state.params)
    };
    densitySvg.setPointerCapture?.(event.pointerId);
  }

  function startPeakDrag(target, yMax, event) {
    event.preventDefault();
    drag = {
      kind: "peak",
      target,
      startX: dataXFromPointer(event),
      yMax,
      snapshot: clone(state.params)
    };
    densitySvg.setPointerCapture?.(event.pointerId);
  }

  function setMeanFromDrag(x) {
    const p = state.params;
    const s = drag.snapshot;
    const dx = x - drag.startX;

    if (state.concept === "auc") {
      if (drag.target === "blue") p.blueMean = clamp(s.blueMean + dx, -2.5, 2.5);
      if (drag.target === "red") p.redMean = clamp(s.redMean + dx, -0.5, 4.8);
      return;
    }

    if (drag.target === "redPair") {
      const shift = clamp(dx, -6.8 - s.redLeft, 6.8 - s.redRight);
      p.redLeft = s.redLeft + shift;
      p.redRight = s.redRight + shift;
      return;
    }

    if (drag.target === "blue") {
      p.blueMean = clamp(s.blueMean + dx, -3, 3);
    }
  }

  function spreadFromPeak(y, weight, minSd, maxSdValue) {
    const peak = clamp(y, 0.01, 4);
    return clamp(weight / (peak * Math.sqrt(2 * Math.PI)), minSd, maxSdValue);
  }

  function setPeakFromDrag(point) {
    const p = state.params;
    const s = drag.snapshot;
    const dx = point.x - drag.startX;

    if (state.concept === "auc") {
      if (drag.target === "blue") {
        p.blueMean = clamp(s.blueMean + dx, -2.5, 2.5);
        p.blueSd = spreadFromPeak(point.y, 1, 0.25, 2.4);
      }
      if (drag.target === "red") {
        p.redMean = clamp(s.redMean + dx, -0.5, 4.8);
        p.redSd = spreadFromPeak(point.y, 1, 0.25, 2.4);
      }
      return;
    }

    if (drag.target === "blue") {
      p.blueMean = clamp(s.blueMean + dx, -3, 3);
      p.blueSd = spreadFromPeak(point.y, 1, 0.16, 1.8);
      return;
    }

    if (drag.target === "redLeft") {
      p.redLeft = clamp(s.redLeft + dx, -6.8, p.redRight - 0.9);
      p.redLeftSd = spreadFromPeak(point.y, 0.5, 0.14, 1.4);
      return;
    }

    if (drag.target === "redRight") {
      p.redRight = clamp(s.redRight + dx, p.redLeft + 0.9, 6.8);
      p.redRightSd = spreadFromPeak(point.y, 0.5, 0.14, 1.4);
    }
  }

  function onPointerMove(event) {
    if (!drag) return;
    if (drag.kind === "mean") setMeanFromDrag(dataXFromPointer(event));
    if (drag.kind === "peak") setPeakFromDrag(dataPointFromPointer(event));
    setControlValues();
    render();
  }

  function endDrag() {
    drag = null;
  }

  function addPeakHandle(svg, x, y, color, target, text, xScale, yScale, yMax) {
    const cx = xScale(x);
    const cy = yScale(y);
    const group = svgEl("g", { style: "cursor: move;" });
    group.appendChild(svgEl("title", { text }));
    group.addEventListener("pointerdown", (event) => startPeakDrag(target, yMax, event));
    group.appendChild(svgEl("circle", {
      cx,
      cy,
      r: 18,
      fill: "transparent",
      "pointer-events": "all"
    }));
    group.appendChild(svgEl("circle", {
      cx,
      cy,
      r: 7.5,
      fill: color,
      stroke: "#fff",
      "stroke-width": 2
    }));
    group.appendChild(svgEl("line", {
      x1: cx,
      x2: cx,
      y1: cy - 13,
      y2: cy + 13,
      stroke: color,
      "stroke-linecap": "round",
      "stroke-width": 2,
      "pointer-events": "none"
    }));
    svg.appendChild(group);
  }

  function curveStyle(group) {
    if (group === "blue") return { stroke: colors.blue, fill: colors.blueFill };
    return { stroke: colors.red, fill: colors.redFill };
  }

  function drawCurve(svg, group, points, xScale, yScale, target) {
    const style = curveStyle(group);
    const fill = addTitle(svgEl("path", {
      d: areaPath(points, xScale, yScale, 0),
      fill: style.fill,
      stroke: "none",
      style: "cursor: move;"
    }), `Move the ${group} distribution`);
    fill.addEventListener("pointerdown", (event) => startMeanDrag(target, event));
    svg.appendChild(fill);

    const line = addTitle(svgEl("path", {
      d: linePath(points, xScale, yScale),
      fill: "none",
      stroke: style.stroke,
      "stroke-width": 3.2,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
      style: "cursor: move; pointer-events: stroke;"
    }), `Move the ${group} distribution`);
    line.addEventListener("pointerdown", (event) => startMeanDrag(target, event));
    svg.appendChild(line);
  }

  function drawAucHandles(xScale, yScale, yMax) {
    const p = state.params;
    [
      { group: "blue", mean: p.blueMean, sd: p.blueSd },
      { group: "red", mean: p.redMean, sd: p.redSd }
    ].forEach(({ group, mean, sd }) => {
      const style = curveStyle(group);
      addPeakHandle(
        densitySvg,
        mean,
        normalPdf(mean, mean, sd),
        style.stroke,
        group,
        `Move ${group} mode; drag up or down to change variance`,
        xScale,
        yScale,
        yMax
      );
    });
  }

  function drawAffinityHandles(xScale, yScale, yMax) {
    const p = state.params;
    const blueStyle = curveStyle("blue");
    const redStyle = curveStyle("red");

    addPeakHandle(densitySvg, p.blueMean, blueDensity(p.blueMean), blueStyle.stroke, "blue", "Move healthy mode; drag up or down to change variance", xScale, yScale, yMax);
    addPeakHandle(densitySvg, p.redLeft, redDensity(p.redLeft), redStyle.stroke, "redLeft", "Move left mixture component; drag up or down to change variance", xScale, yScale, yMax);
    addPeakHandle(densitySvg, p.redRight, redDensity(p.redRight), redStyle.stroke, "redRight", "Move right mixture component; drag up or down to change variance", xScale, yScale, yMax);
  }

  function drawDensityPlot() {
    const view = densityView();
    const { w, h, m, xMin, xMax } = view;
    clear(densitySvg, view);

    const n = 260;
    const points = Array.from({ length: n }, (_, i) => {
      const x = xMin + (i / (n - 1)) * (xMax - xMin);
      return { x, blue: blueDensity(x), red: redDensity(x) };
    });
    const yMax = densityYMax(points);

    const xScale = (x) => m.left + ((x - xMin) / (xMax - xMin)) * (w - m.left - m.right);
    const yScale = (y) => h - m.bottom - (y / yMax) * (h - m.top - m.bottom);

    drawAxes(
      densitySvg,
      view,
      xScale,
      yScale,
      view.xTicks,
      [0, yMax / 2, yMax],
      "Diagnostic outcome",
      "Density"
    );

    const bluePoints = points.map((p) => ({ x: p.x, y: p.blue }));
    const redPoints = points.map((p) => ({ x: p.x, y: p.red }));
    const overlapPoints = points.map((p) => ({ x: p.x, y: Math.min(p.blue, p.red) }));

    densitySvg.appendChild(svgEl("path", {
      d: areaPath(overlapPoints, xScale, yScale, 0),
      fill: colors.overlap,
      stroke: "none"
    }));

    drawCurve(densitySvg, "blue", bluePoints, xScale, yScale, "blue");
    drawCurve(densitySvg, "red", redPoints, xScale, yScale, state.concept === "affinity" ? "redPair" : "red");

    if (state.concept === "affinity") drawAffinityHandles(xScale, yScale, yMax);
    else drawAucHandles(xScale, yScale, yMax);
  }

  function drawRocPlot() {
    const view = rocView;
    const { w, h, m } = view;
    clear(rocSvg, view);

    const xScale = (x) => m.left + x * (w - m.left - m.right);
    const yScale = (y) => h - m.bottom - y * (h - m.top - m.bottom);
    drawAxes(rocSvg, view, xScale, yScale, [0, 0.25, 0.5, 0.75, 1], [0, 0.25, 0.5, 0.75, 1], "1 - specificity", "Sensitivity");

    rocSvg.appendChild(svgEl("line", {
      x1: xScale(0),
      y1: yScale(0),
      x2: xScale(1),
      y2: yScale(1),
      stroke: "#9aaabc",
      "stroke-dasharray": "5 5",
      "stroke-width": 1.4
    }));

    const { min, max } = integrationBounds();
    const points = [{ x: 0, y: 0 }];
    for (let i = 0; i <= 240; i += 1) {
      const t = max - (i / 240) * (max - min);
      const fpr = 1 - blueCdf(t);
      const tpr = 1 - redCdf(t);
      points.push({ x: clamp(fpr, 0, 1), y: clamp(tpr, 0, 1) });
    }
    points.push({ x: 1, y: 1 });

    const area = [
      `M ${xScale(0).toFixed(2)} ${yScale(0).toFixed(2)}`,
      points.map((p) => `L ${xScale(p.x).toFixed(2)} ${yScale(p.y).toFixed(2)}`).join(" "),
      `L ${xScale(1).toFixed(2)} ${yScale(0).toFixed(2)}`,
      "Z"
    ].join(" ");

    rocSvg.appendChild(svgEl("path", {
      d: area,
      fill: state.concept === "auc" ? "rgba(0, 51, 102, 0.16)" : "rgba(83, 103, 121, 0.10)",
      stroke: "none"
    }));

    rocSvg.appendChild(svgEl("path", {
      d: linePath(points, xScale, yScale),
      fill: "none",
      stroke: colors.roc,
      "stroke-width": 3.2,
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    }));
  }

  function drawCartesianAxes(svg, view, xScale, yScale, xTicks, yTicks, xLabel, yLabel) {
    const { w, h, m } = view;
    const axis = svgEl("g", { class: "roc-axis" });
    axis.appendChild(svgEl("line", { x1: m.left, y1: h - m.bottom, x2: w - m.right, y2: h - m.bottom }));
    axis.appendChild(svgEl("line", { x1: m.left, y1: m.top, x2: m.left, y2: h - m.bottom }));

    xTicks.forEach((tick) => {
      const x = xScale(tick);
      axis.appendChild(svgEl("line", { class: "roc-grid-line", x1: x, y1: m.top, x2: x, y2: h - m.bottom }));
      axis.appendChild(svgEl("line", { x1: x, y1: h - m.bottom, x2: x, y2: h - m.bottom + 5 }));
      axis.appendChild(svgEl("text", { class: "roc-axis-tick", x, y: h - m.bottom + 22, "text-anchor": "middle", text: formatAxisTick(tick) }));
    });

    yTicks.forEach((tick) => {
      const y = yScale(tick);
      axis.appendChild(svgEl("line", { class: "roc-grid-line", x1: m.left, y1: y, x2: w - m.right, y2: y }));
      axis.appendChild(svgEl("line", { x1: m.left - 5, y1: y, x2: m.left, y2: y }));
      axis.appendChild(svgEl("text", { class: "roc-axis-tick", x: m.left - 10, y: y + 4, "text-anchor": "end", text: formatAxisTick(tick) }));
    });

    axis.appendChild(svgEl("text", { class: "roc-axis-label", x: (m.left + w - m.right) / 2, y: h - 10, "text-anchor": "middle", text: xLabel }));
    axis.appendChild(svgEl("text", {
      class: "roc-axis-label",
      x: 18,
      y: (m.top + h - m.bottom) / 2,
      transform: `rotate(-90 18 ${(m.top + h - m.bottom) / 2})`,
      "text-anchor": "middle",
      text: yLabel
    }));
    svg.appendChild(axis);
  }

  function mcmcScales(view) {
    const { w, h, m, xMin, xMax, yMin, yMax } = view;
    return {
      x: (value) => m.left + ((value - xMin) / (xMax - xMin)) * (w - m.left - m.right),
      y: (value) => h - m.bottom - ((value - yMin) / (yMax - yMin)) * (h - m.top - m.bottom)
    };
  }

  function addMcmcDefs(svg, prefix) {
    const defs = svgEl("defs");
    const glow = svgEl("filter", { id: `${prefix}-glow`, x: "-30%", y: "-30%", width: "160%", height: "160%" });
    glow.appendChild(svgEl("feGaussianBlur", { stdDeviation: 2.4, result: "blur" }));
    const merge = svgEl("feMerge");
    merge.appendChild(svgEl("feMergeNode", { in: "blur" }));
    merge.appendChild(svgEl("feMergeNode", { in: "SourceGraphic" }));
    glow.appendChild(merge);
    defs.appendChild(glow);

    const densityGradient = svgEl("linearGradient", { id: `${prefix}-density`, x1: "0", x2: "0", y1: "0", y2: "1" });
    densityGradient.appendChild(svgEl("stop", { offset: "0%", "stop-color": colors.teal, "stop-opacity": 0.45 }));
    densityGradient.appendChild(svgEl("stop", { offset: "100%", "stop-color": colors.teal, "stop-opacity": 0.05 }));
    defs.appendChild(densityGradient);

    svg.appendChild(defs);
  }

  function mcmcFrame(timestamp) {
    if (animationStart === null) animationStart = timestamp;
    const activeMs = mcmcCycleMs - mcmcHoldMs;
    const elapsed = (timestamp - animationStart) % mcmcCycleMs;
    const progress = clamp(elapsed / activeMs, 0, 1);
    const count = clamp(Math.floor(2 + progress * (mcmc.total - 2)), 2, mcmc.total);
    return {
      count,
      progress,
      retained: Math.max(0, count - mcmc.burn)
    };
  }

  function sampleMean(values) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function sampleSd(values) {
    if (values.length < 2) return 0.25;
    const mean = sampleMean(values);
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
    return Math.sqrt(Math.max(variance, 1e-6));
  }

  function kdeValues(samples, grid) {
    if (samples.length < 2) return grid.map((x) => ({ x, y: 0 }));
    const sd = sampleSd(samples);
    const bw = clamp(1.06 * sd * samples.length ** -0.2, 0.12, 0.34);
    return grid.map((x) => {
      const y = samples.reduce((sum, value) => sum + normalPdf(x, value, bw), 0) / samples.length;
      return { x, y };
    });
  }

  function drawMcmcTrace(frame) {
    const view = mcmcTraceView;
    const { w, h, m } = view;
    clear(densitySvg, view);
    addMcmcDefs(densitySvg, "mcmc-trace");
    const scale = mcmcScales(view);
    drawCartesianAxes(densitySvg, view, scale.x, scale.y, view.xTicks, view.yTicks, "Iteration", "Parameter value");

    densitySvg.appendChild(svgEl("rect", {
      x: scale.x(1),
      y: m.top,
      width: scale.x(mcmc.burn) - scale.x(1),
      height: h - m.top - m.bottom,
      fill: "rgba(225, 74, 97, 0.055)"
    }));
    densitySvg.appendChild(svgEl("rect", {
      x: scale.x(mcmc.burn),
      y: m.top,
      width: scale.x(mcmc.total) - scale.x(mcmc.burn),
      height: h - m.top - m.bottom,
      fill: "rgba(37, 99, 235, 0.045)"
    }));

    const visible = mcmc.chain.slice(0, frame.count).map((value, index) => ({ x: index + 1, y: value }));
    const burnPath = visible.filter((point) => point.x <= mcmc.burn);
    const keptPath = visible.filter((point) => point.x >= mcmc.burn);
    if (burnPath.length > 1) {
      densitySvg.appendChild(svgEl("path", {
        d: linePath(burnPath, scale.x, scale.y),
        fill: "none",
        stroke: colors.coral,
        "stroke-width": 3.2,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
        filter: "url(#mcmc-trace-glow)"
      }));
    }
    if (keptPath.length > 1) {
      densitySvg.appendChild(svgEl("path", {
        d: linePath(keptPath, scale.x, scale.y),
        fill: "none",
        stroke: colors.blue,
        "stroke-width": 3.4,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
        filter: "url(#mcmc-trace-glow)"
      }));
    }

    const recent = visible.slice(-18);
    recent.forEach((point, index) => {
      const alpha = 0.18 + (index + 1) / recent.length * 0.48;
      densitySvg.appendChild(svgEl("circle", {
        cx: scale.x(point.x),
        cy: scale.y(point.y),
        r: 2.4 + index / recent.length * 2.1,
        fill: point.x <= mcmc.burn ? colors.coral : colors.blue,
        opacity: alpha
      }));
    });

    const current = visible[visible.length - 1];
    densitySvg.appendChild(svgEl("line", {
      x1: scale.x(current.x),
      x2: scale.x(current.x),
      y1: m.top,
      y2: h - m.bottom,
      stroke: colors.gold,
      "stroke-width": 1.6,
      "stroke-dasharray": "4 5",
      opacity: 0.75
    }));
    densitySvg.appendChild(svgEl("circle", {
      cx: scale.x(current.x),
      cy: scale.y(current.y),
      r: 7.4,
      fill: current.x <= mcmc.burn ? colors.coral : colors.blue,
      stroke: "#fff",
      "stroke-width": 2.2,
      filter: "url(#mcmc-trace-glow)"
    }));
  }

  function drawMcmcDensity(frame) {
    const view = mcmcDensityView;
    const { h, m } = view;
    clear(rocSvg, view);
    addMcmcDefs(rocSvg, "mcmc-density");
    const scale = mcmcScales(view);
    drawCartesianAxes(rocSvg, view, scale.x, scale.y, view.xTicks, view.yTicks, "Parameter value", "Posterior density");

    const target = mcmc.grid.map((x) => ({ x, y: normalPdf(x, mcmc.targetMean, mcmc.targetSd) }));
    rocSvg.appendChild(svgEl("path", {
      d: linePath(target, scale.x, scale.y),
      fill: "none",
      stroke: "#8ca4bb",
      "stroke-dasharray": "5 5",
      "stroke-width": 2.1,
      opacity: 0.82
    }));

    const retained = mcmc.chain.slice(mcmc.burn, frame.count);
    const density = kdeValues(retained, mcmc.grid);
    if (retained.length > 1) {
      rocSvg.appendChild(svgEl("path", {
        d: areaPath(density, scale.x, scale.y, 0),
        fill: "url(#mcmc-density-density)",
        stroke: "none"
      }));
      rocSvg.appendChild(svgEl("path", {
        d: linePath(density, scale.x, scale.y),
        fill: "none",
        stroke: colors.teal,
        "stroke-width": 3.5,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
        filter: "url(#mcmc-density-glow)"
      }));
    }

    retained.slice(-42).forEach((value, index, values) => {
      rocSvg.appendChild(svgEl("line", {
        x1: scale.x(value),
        x2: scale.x(value),
        y1: h - m.bottom,
        y2: h - m.bottom - 9 - 9 * (index / Math.max(1, values.length - 1)),
        stroke: colors.blue,
        "stroke-width": 1.2,
        opacity: 0.22 + 0.42 * (index / Math.max(1, values.length - 1))
      }));
    });

    const current = mcmc.chain[frame.count - 1];
    const currentDensity = retained.length > 1
      ? kdeValues(retained, [current])[0].y
      : normalPdf(current, mcmc.targetMean, mcmc.targetSd);
    rocSvg.appendChild(svgEl("line", {
      x1: scale.x(current),
      x2: scale.x(current),
      y1: h - m.bottom,
      y2: scale.y(clamp(currentDensity, 0, view.yMax)),
      stroke: colors.gold,
      "stroke-width": 1.7,
      "stroke-dasharray": "4 5",
      opacity: 0.75
    }));
    rocSvg.appendChild(svgEl("circle", {
      cx: scale.x(current),
      cy: scale.y(clamp(currentDensity, 0, view.yMax)),
      r: 5.8,
      fill: colors.gold,
      stroke: "#fff",
      "stroke-width": 2,
      filter: "url(#mcmc-density-glow)"
    }));
  }

  function updateMcmcMetric(frame) {
    if (figureKicker) figureKicker.textContent = "Fig. 3.1 companion";
    if (dashboardTitle) dashboardTitle.textContent = "MCMC chain and posterior density";
    if (leftPanelTitle) leftPanelTitle.textContent = "Markov chain";
    if (rightPanelTitle) rightPanelTitle.textContent = "Posterior density";
    metricLabel.textContent = "iteration";
    metricValue.textContent = String(frame.count);
    secondaryMetric.textContent = `retained draws ${frame.retained}`;
    metricCaption.textContent = "MCMC posterior approximation";
    conceptNote.textContent = "Chapter 3 introduces MCMC as a way to approximate posterior distributions when direct sampling is unavailable.";
    root.classList.add("is-mcmc");
  }

  function drawMcmcMovie(timestamp) {
    const frame = mcmcFrame(timestamp);
    drawMcmcTrace(frame);
    drawMcmcDensity(frame);
    updateMcmcMetric(frame);
  }

  function updateMetric() {
    if (state.concept === "mcmc") {
      updateMcmcMetric(mcmcFrame(performance.now()));
      return;
    }

    const auc = aucValue();
    const affinity = affinityValue();
    root.classList.remove("is-mcmc");
    if (dashboardTitle) dashboardTitle.textContent = "Diagnostic outcome curves";
    if (leftPanelTitle) leftPanelTitle.textContent = "Outcome distributions";
    if (rightPanelTitle) rightPanelTitle.textContent = "ROC curve";

    if (state.concept === "auc") {
      if (figureKicker) figureKicker.textContent = "Fig. 1.3 companion";
      metricLabel.textContent = "AUC";
      metricValue.textContent = formatNumber(auc);
      secondaryMetric.textContent = "";
      metricCaption.textContent = "Area Under the Curve";
      conceptNote.textContent = "";
    } else {
      if (figureKicker) figureKicker.textContent = "Fig. X companion";
      metricLabel.textContent = "affinity";
      metricValue.textContent = formatNumber(affinity);
      secondaryMetric.textContent = `AUC ${formatNumber(auc)}`;
      metricCaption.textContent = "Distributional affinity";
      conceptNote.textContent = Math.abs(auc - 0.5) < 0.0005 ? "Separation trap: AUC = 0.500 despite little overlap." : "";
    }
  }

  function render() {
    if (state.concept === "mcmc") {
      drawMcmcMovie(performance.now());
      return;
    }
    drawDensityPlot();
    drawRocPlot();
    updateMetric();
  }

  function stopMcmcAnimation() {
    if (animationFrame !== null) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  function startMcmcAnimation() {
    stopMcmcAnimation();
    animationStart = null;
    const animate = (timestamp) => {
      if (state.concept !== "mcmc") return;
      drawMcmcMovie(timestamp);
      animationFrame = window.requestAnimationFrame(animate);
    };
    animationFrame = window.requestAnimationFrame(animate);
  }

  function updateConcept() {
    const nextConcept = conceptChoice.value;
    if (nextConcept !== state.concept) {
      state.concept = nextConcept;
      state.params = clone(defaults[nextConcept]);
    }
    setControlValues();
    if (state.concept === "mcmc") {
      startMcmcAnimation();
    } else {
      stopMcmcAnimation();
      render();
    }
  }

  conceptChoice.addEventListener("change", updateConcept);

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", render);

  setControlValues();
  if (state.concept === "mcmc") startMcmcAnimation();
  else render();
}());
