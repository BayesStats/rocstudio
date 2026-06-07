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
    fig27: {},
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
    },
    overlap: {},
    optimizer: {}
  };

  const requestedConcept = new URLSearchParams(window.location.search).get("concept");
  const conceptNames = new Set(["mcmc", "fig27", "auc", "affinity", "overlap", "optimizer"]);
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

  const traceBaseView = {
    w: 880,
    m: { top: 22, right: 26, bottom: 34, left: 62 },
    traceWidth: 650,
    densityGap: 12,
    densityWidth: 92,
    rowHeight: 148,
    rowGap: 34
  };

  const optimizerView = {
    w: 880,
    h: 560,
    m: { top: 36, right: 34, bottom: 64, left: 78 }
  };

  const traceDatasets = {
    mcmc: {
      data: createFig31Data(window.ROCSTUDIO_FIG31_CHAINS),
      figureKicker: "Fig. 3.1 companion",
      title: "Inference for sensitivity, specificity, and prevalence",
      leftPanelTitle: "Trace plots and posterior densigrams",
      rightPanelTitle: "Posterior densigrams",
      metricLabel: "iteration",
      caption: "Accuracy of Exercise Stress Test<br>Gibbs Sampler",
      note: "Figure 3.1 traces the Gibbs sampler for sensitivity, specificity, and prevalence; burn-in is red, retained iterations are steelblue, and the posterior densigrams update on the right. <code class=\"roc-concept-command\">ROCstudio::perfn()</code>",
      ariaLabel: "Figure 3.1 companion showing sensitivity, specificity, and prevalence MCMC traces and posterior densigrams",
      emptyMessage: "Fig. 3.1 chain data could not be loaded.",
      cycleMs: 18000,
      holdMs: 1500
    },
    fig27: {
      data: createFig31Data(window.ROCSTUDIO_FIG27_CHAINS),
      figureKicker: "Fig. 2.7 companion",
      title: "Inference for mean and standard deviation",
      leftPanelTitle: "Trace plots and posterior densigrams",
      rightPanelTitle: "Posterior densigrams",
      metricLabel: "iteration",
      caption: "Lung-cancer marker data<br>Normal Gibbs sampler",
      note: "Figure 2.7 traces the Gibbs sampler for μ and σ on the log lung-cancer marker scale; burn-in is red, retained iterations are steelblue, and the posterior densigrams update on the right.",
      ariaLabel: "Figure 2.7 companion showing normal-model Gibbs sampler traces and posterior densigrams",
      emptyMessage: "Fig. 2.7 chain data could not be loaded.",
      cycleMs: 15000,
      holdMs: 1200
    }
  };

  const optimizerData = createOptimizerData(window.ROCSTUDIO_FIG43_OPTIMIZER);
  const optimizerCycleMs = 10500;
  const optimizerHoldMs = 1400;
  let animationFrame = null;
  let animationStart = null;
  let lastMovieDraw = 0;
  let lastMovieCount = 0;
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

  function createFig31Data(raw) {
    if (!raw || !Array.isArray(raw.params)) {
      return {
        total: 0,
        burn: 0,
        params: []
      };
    }

    return {
      total: Number(raw.total),
      burn: Number(raw.burn),
      frameStep: Number(raw.frameStep || 250),
      params: raw.params.map((param) => ({
        label: param.label,
        mathLabel: param.mathLabel || param.label,
        values: param.values.map(Number),
        yMin: Number(param.yMin),
        yMax: Number(param.yMax),
        yTicks: param.yTicks.map(Number).filter((tick) => tick >= param.yMin && tick <= param.yMax),
        densityGrid: param.densityGrid.map(Number),
        histBreaks: param.histBreaks.map(Number),
        frames: param.frames.map((frame) => ({
          count: Number(frame.count),
          density: frame.density.map(Number),
          hist: frame.hist.map(Number)
        }))
      }))
    };
  }

  function createOptimizerData(raw) {
    if (!raw || !Array.isArray(raw.path) || !Array.isArray(raw.muGrid) || !Array.isArray(raw.varianceGrid)) {
      return {
        path: [],
        muGrid: [],
        varianceGrid: [],
        relLik: [],
        xRange: [0, 1],
        yRange: [0, 1],
        xTicks: [0, 1],
        yTicks: [0, 1],
        mle: { mu: 0, variance: 0, sigma: 0 }
      };
    }

    const xRange = raw.xRange.map(Number);
    const yRange = raw.yRange.map(Number);

    return {
      n: Number(raw.n || 0),
      xRange,
      yRange,
      xTicks: raw.xTicks.map(Number).filter((tick) => tick >= xRange[0] && tick <= xRange[1]),
      yTicks: raw.yTicks.map(Number).filter((tick) => tick >= yRange[0] && tick <= yRange[1]),
      muGrid: raw.muGrid.map(Number),
      varianceGrid: raw.varianceGrid.map(Number),
      relLik: raw.relLik.map(Number),
      mle: {
        mu: Number(raw.mle.mu),
        variance: Number(raw.mle.variance),
        sigma: Number(raw.mle.sigma)
      },
      path: raw.path.map((point) => ({
        step: Number(point.step),
        mu: Number(point.mu),
        variance: Number(point.variance),
        sigma: Number(point.sigma),
        logLik: Number(point.logLik),
        relLik: Number(point.relLik)
      }))
    };
  }

  function traceConfig() {
    return traceDatasets[state.concept] || null;
  }

  function traceTicks(total) {
    if (total >= 20000) return [0, 5000, 10000, 15000, 20000];
    if (total >= 10000) return [0, 2500, 5000, 7500, 10000];
    const step = Math.max(1, Math.round(total / 4));
    return [0, step, 2 * step, 3 * step, total];
  }

  function traceViewFor(data) {
    const rows = Math.max(1, data?.params?.length || 1);
    const h = traceBaseView.m.top + rows * traceBaseView.rowHeight + (rows - 1) * traceBaseView.rowGap + traceBaseView.m.bottom;
    return {
      ...traceBaseView,
      h,
      xMin: 0,
      xMax: data?.total || 1,
      xTicks: traceTicks(data?.total || 1)
    };
  }

  function clearDashboardClasses() {
    root.classList.remove("is-mcmc", "is-fig27", "is-optimizer");
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

  function formatCount(value) {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
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

  function mcmcFrame(timestamp, config = traceConfig()) {
    const data = config?.data;
    if (!data?.total) return { count: 0, progress: 0, retained: 0 };
    if (animationStart === null) animationStart = timestamp;
    const cycleMs = config.cycleMs || 18000;
    const activeMs = cycleMs - (config.holdMs || 0);
    const elapsed = (timestamp - animationStart) % cycleMs;
    const progress = clamp(elapsed / activeMs, 0, 1);
    const count = clamp(Math.floor(1 + progress * (data.total - 1)), 1, data.total);
    return {
      count,
      progress,
      retained: Math.max(0, count - data.burn)
    };
  }

  function mcmcRowLayout(index, view) {
    const y0 = view.m.top + index * (view.rowHeight + view.rowGap);
    const x0 = view.m.left;
    const traceX1 = x0 + view.traceWidth;
    const densityX0 = traceX1 + view.densityGap;
    return {
      x0,
      x1: traceX1,
      densityX0,
      densityX1: densityX0 + view.densityWidth,
      y0,
      y1: y0 + view.rowHeight
    };
  }

  function mcmcXScale(row, view) {
    return (value) => row.x0 + ((value - view.xMin) / (view.xMax - view.xMin)) * (row.x1 - row.x0);
  }

  function mcmcYScale(row, param) {
    return (value) => row.y1 - ((value - param.yMin) / (param.yMax - param.yMin)) * (row.y1 - row.y0);
  }

  function mcmcDensityScale(row, param) {
    const maxDensity = mcmcDensityMax(param);
    return (value) => row.densityX0 + (value / maxDensity) * (row.densityX1 - row.densityX0);
  }

  function mcmcDensityMax(param) {
    if (!param._densityMax) {
      const finalFrame = param.frames[param.frames.length - 1];
      param._densityMax = Math.max(1e-6, ...finalFrame.density, ...finalFrame.hist) * 1.05;
    }
    return param._densityMax;
  }

  function mcmcDensityFrame(param, count) {
    let frame = param.frames[0];
    for (let i = 1; i < param.frames.length; i += 1) {
      if (param.frames[i].count > count) break;
      frame = param.frames[i];
    }
    return frame;
  }

  function mcmcTracePath(values, startIteration, endIteration, xScale, yScale) {
    if (endIteration - startIteration < 1) return "";
    const path = [];
    for (let iteration = startIteration; iteration <= endIteration; iteration += 1) {
      const x = xScale(iteration);
      const y = yScale(values[iteration - 1]);
      path.push(`${iteration === startIteration ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    return path.join(" ");
  }

  function mcmcDensityAreaPath(param, frame, xScale, yScale) {
    const grid = param.densityGrid;
    if (!frame.density.some((value) => value > 0)) return "";
    const path = [`M ${xScale(0).toFixed(2)} ${yScale(grid[0]).toFixed(2)}`];
    frame.density.forEach((density, index) => {
      path.push(`L ${xScale(density).toFixed(2)} ${yScale(grid[index]).toFixed(2)}`);
    });
    path.push(`L ${xScale(0).toFixed(2)} ${yScale(grid[grid.length - 1]).toFixed(2)}`, "Z");
    return path.join(" ");
  }

  function mcmcDensityLinePath(param, frame, xScale, yScale) {
    const grid = param.densityGrid;
    if (!frame.density.some((value) => value > 0)) return "";
    return frame.density.map((density, index) => {
      return `${index ? "L" : "M"} ${xScale(density).toFixed(2)} ${yScale(grid[index]).toFixed(2)}`;
    }).join(" ");
  }

  function drawMcmcAxes(svg, row, param, rowIndex, view) {
    const xScale = mcmcXScale(row, view);
    const yScale = mcmcYScale(row, param);
    const axis = svgEl("g", { class: "roc-axis roc-mcmc-axis" });

    axis.appendChild(svgEl("line", { x1: row.x0, y1: row.y1, x2: row.x1, y2: row.y1 }));
    axis.appendChild(svgEl("line", { x1: row.x0, y1: row.y0, x2: row.x0, y2: row.y1 }));
    axis.appendChild(svgEl("line", { x1: row.densityX0, y1: row.y0, x2: row.densityX0, y2: row.y1 }));

    view.xTicks.forEach((tick) => {
      const x = xScale(tick);
      axis.appendChild(svgEl("line", { class: "roc-grid-line", x1: x, y1: row.y0, x2: x, y2: row.y1 }));
      axis.appendChild(svgEl("line", { x1: x, y1: row.y1, x2: x, y2: row.y1 + 4 }));
      axis.appendChild(svgEl("text", { class: "roc-axis-tick", x, y: row.y1 + 17, "text-anchor": "middle", text: String(tick) }));
    });

    param.yTicks.forEach((tick) => {
      const y = yScale(tick);
      axis.appendChild(svgEl("line", { class: "roc-grid-line", x1: row.x0, y1: y, x2: row.densityX1, y2: y }));
      axis.appendChild(svgEl("line", { x1: row.x0 - 4, y1: y, x2: row.x0, y2: y }));
      axis.appendChild(svgEl("text", { class: "roc-axis-tick", x: row.x0 - 8, y: y + 3.5, "text-anchor": "end", text: formatAxisTick(tick) }));
    });

    axis.appendChild(svgEl("text", { class: "roc-axis-label", x: (row.x0 + row.x1) / 2, y: row.y1 + 31, "text-anchor": "middle", text: "Iteration" }));
    axis.appendChild(svgEl("text", {
      class: "roc-axis-label",
      x: row.x0 - 42,
      y: (row.y0 + row.y1) / 2,
      transform: `rotate(-90 ${row.x0 - 42} ${(row.y0 + row.y1) / 2})`,
      "text-anchor": "middle",
      text: param.mathLabel || param.label
    }));

    svg.appendChild(axis);
  }

  function drawMcmcTraceRow(svg, row, param, frame, data, view) {
    const xScale = mcmcXScale(row, view);
    const yScale = mcmcYScale(row, param);
    const burnEnd = Math.min(frame.count, data.burn);
    const keptStart = Math.max(data.burn + 1, 1);
    const keptEnd = Math.min(frame.count, data.total);

    if (burnEnd > 1) {
      svg.appendChild(svgEl("path", {
        d: mcmcTracePath(param.values, 1, burnEnd, xScale, yScale),
        fill: "none",
        stroke: "#ff0000",
        "stroke-width": 1.05,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
        opacity: 0.82
      }));
    }

    if (keptEnd > keptStart) {
      svg.appendChild(svgEl("path", {
        d: mcmcTracePath(param.values, keptStart, keptEnd, xScale, yScale),
        fill: "none",
        stroke: "steelblue",
        "stroke-width": 1.05,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
        opacity: 0.82
      }));
    }
  }

  function drawMcmcDensityRow(svg, row, param, frame) {
    const yScale = mcmcYScale(row, param);
    const xScale = mcmcDensityScale(row, param);
    const histBreaks = param.histBreaks;

    frame.hist.forEach((density, index) => {
      const yMin = histBreaks[index];
      const yMax = histBreaks[index + 1];
      if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || density <= 0) return;
      const y = yScale(yMax);
      const height = Math.max(0.8, yScale(yMin) - yScale(yMax));
      svg.appendChild(svgEl("rect", {
        x: row.densityX0,
        y,
        width: xScale(density) - row.densityX0,
        height,
        fill: "steelblue",
        stroke: "steelblue",
        "stroke-width": 0.35,
        opacity: 0.30
      }));
    });

    const area = mcmcDensityAreaPath(param, frame, xScale, yScale);
    if (area) {
      svg.appendChild(svgEl("path", {
        d: area,
        fill: "steelblue",
        stroke: "none",
        opacity: 0.10
      }));
    }

    const line = mcmcDensityLinePath(param, frame, xScale, yScale);
    if (line) {
      svg.appendChild(svgEl("path", {
        d: line,
        fill: "none",
        stroke: "steelblue",
        "stroke-width": 1.35,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
        opacity: 0.90
      }));
    }
  }

  function drawMcmcFigure(frame, config = traceConfig()) {
    const data = config?.data || { params: [], total: 0 };
    const view = traceViewFor(data);
    clear(densitySvg, view);
    densitySvg.setAttribute("aria-label", config?.ariaLabel || "MCMC trace plots and posterior densigrams");

    densitySvg.appendChild(svgEl("rect", {
      x: 0,
      y: 0,
      width: view.w,
      height: view.h,
      fill: "#fff"
    }));

    if (!data.total || !data.params.length) {
      densitySvg.appendChild(svgEl("text", {
        x: view.w / 2,
        y: view.h / 2,
        "text-anchor": "middle",
        text: config?.emptyMessage || "Chain data could not be loaded."
      }));
      return;
    }

    data.params.forEach((param, index) => {
      const row = mcmcRowLayout(index, view);
      const densityFrame = mcmcDensityFrame(param, frame.count);
      drawMcmcAxes(densitySvg, row, param, index, view);
      drawMcmcTraceRow(densitySvg, row, param, frame, data, view);
      drawMcmcDensityRow(densitySvg, row, param, densityFrame);
    });
  }

  function updateMcmcMetric(frame, config = traceConfig()) {
    clearDashboardClasses();
    if (figureKicker) figureKicker.textContent = config?.figureKicker || "";
    if (dashboardTitle) dashboardTitle.textContent = config?.title || "";
    if (leftPanelTitle) leftPanelTitle.textContent = config?.leftPanelTitle || "Trace plots and posterior densigrams";
    if (rightPanelTitle) rightPanelTitle.textContent = config?.rightPanelTitle || "Posterior densigrams";
    metricLabel.textContent = config?.metricLabel || "iteration";
    metricValue.textContent = formatCount(frame.count);
    secondaryMetric.textContent = `retained draws ${formatCount(frame.retained)}`;
    metricCaption.innerHTML = config?.caption || "";
    conceptNote.innerHTML = config?.note || "";
    root.classList.add("is-mcmc");
    if (state.concept === "fig27") root.classList.add("is-fig27");
  }

  function drawMcmcMovie(timestamp, suppliedFrame) {
    const config = traceConfig();
    const frame = suppliedFrame || mcmcFrame(timestamp, config);
    drawMcmcFigure(frame, config);
    updateMcmcMetric(frame, config);
  }

  function integrateFixed(fn, min, max, steps = 1200) {
    const h = (max - min) / steps;
    let total = 0;
    for (let i = 0; i <= steps; i += 1) {
      const x = min + i * h;
      const weight = i === 0 || i === steps ? 0.5 : 1;
      total += weight * fn(x);
    }
    return total * h;
  }

  function overlapComparisonStats() {
    const min = -8;
    const max = 8;
    const f0 = (x) => normalPdf(x, -1, 1);
    const f1 = (x) => normalPdf(x, 1, 1);
    return {
      overlap: clamp(integrateFixed((x) => Math.min(f0(x), f1(x)), min, max), 0, 1),
      affinity: clamp(integrateFixed((x) => Math.sqrt(f0(x) * f1(x)), min, max), 0, 1)
    };
  }

  function overlapPanelView() {
    return { ...densityBaseView, xMin: -4, xMax: 4, xTicks: [-4, -2, 0, 2, 4] };
  }

  function drawOverlapComparisonPanel(svg, mode) {
    const view = overlapPanelView();
    const { w, h, m, xMin, xMax } = view;
    clear(svg, view);
    svg.setAttribute("aria-label", mode === "overlap" ? "Figure 7.3 coefficient of overlap panel" : "Figure 7.3 affinity panel");

    const n = 260;
    const points = Array.from({ length: n }, (_, i) => {
      const x = xMin + (i / (n - 1)) * (xMax - xMin);
      const healthy = normalPdf(x, -1, 1);
      const diseased = normalPdf(x, 1, 1);
      return {
        x,
        healthy,
        diseased,
        overlap: Math.min(healthy, diseased),
        affinity: Math.sqrt(healthy * diseased)
      };
    });
    const yMax = 0.5;
    const xScale = (x) => m.left + ((x - xMin) / (xMax - xMin)) * (w - m.left - m.right);
    const yScale = (y) => h - m.bottom - (y / yMax) * (h - m.top - m.bottom);
    const areaKey = mode === "overlap" ? "overlap" : "affinity";
    const dashArray = mode === "overlap" ? "8 6" : "2 5";

    drawCartesianAxes(svg, view, xScale, yScale, view.xTicks, [0, 0.25, 0.5], "Diagnostic outcome", "Density");

    svg.appendChild(svgEl("path", {
      d: areaPath(points.map((p) => ({ x: p.x, y: p[areaKey] })), xScale, yScale, 0),
      fill: mode === "overlap" ? "rgba(67, 86, 108, 0.18)" : "rgba(217, 154, 33, 0.20)",
      stroke: "none"
    }));
    svg.appendChild(svgEl("path", {
      d: linePath(points.map((p) => ({ x: p.x, y: p.healthy })), xScale, yScale),
      fill: "none",
      stroke: colors.blue,
      "stroke-width": 2.8,
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    }));
    svg.appendChild(svgEl("path", {
      d: linePath(points.map((p) => ({ x: p.x, y: p.diseased })), xScale, yScale),
      fill: "none",
      stroke: colors.red,
      "stroke-width": 2.8,
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    }));
    svg.appendChild(svgEl("path", {
      d: linePath(points.map((p) => ({ x: p.x, y: p[areaKey] })), xScale, yScale),
      fill: "none",
      stroke: "#111",
      "stroke-width": 2.2,
      "stroke-dasharray": dashArray,
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    }));
  }

  function drawOverlapFigure() {
    clearDashboardClasses();
    drawOverlapComparisonPanel(densitySvg, "overlap");
    drawOverlapComparisonPanel(rocSvg, "affinity");
  }

  function updateOverlapMetric() {
    const stats = overlapComparisonStats();
    clearDashboardClasses();
    if (figureKicker) figureKicker.textContent = "Fig. 7.3 companion";
    if (dashboardTitle) dashboardTitle.textContent = "Affinity and overlap";
    if (leftPanelTitle) leftPanelTitle.textContent = "Overlap";
    if (rightPanelTitle) rightPanelTitle.textContent = "Affinity";
    metricLabel.textContent = "Overlap";
    metricValue.textContent = formatNumber(stats.overlap);
    secondaryMetric.textContent = `Affinity ${formatNumber(stats.affinity)}`;
    metricCaption.textContent = "Coefficient of overlap";
    conceptNote.textContent = "Figure 7.3 compares the coefficient of overlap with affinity for two normal outcome distributions.";
  }

  function optimizerFrame(timestamp) {
    const data = optimizerData;
    if (!data.path.length) return { frameIndex: 0, step: 0, point: null, visiblePath: [] };
    if (animationStart === null) animationStart = timestamp;
    const activeMs = optimizerCycleMs - optimizerHoldMs;
    const elapsed = (timestamp - animationStart) % optimizerCycleMs;
    const progress = clamp(elapsed / activeMs, 0, 1);
    const segments = Math.max(1, data.path.length - 1);
    const position = progress * segments;
    const index = Math.min(Math.floor(position), data.path.length - 1);
    const nextIndex = Math.min(index + 1, data.path.length - 1);
    const localProgress = nextIndex === index ? 0 : position - index;
    const p0 = data.path[index];
    const p1 = data.path[nextIndex];
    const point = {
      step: index,
      mu: p0.mu + (p1.mu - p0.mu) * localProgress,
      variance: p0.variance + (p1.variance - p0.variance) * localProgress,
      sigma: p0.sigma + (p1.sigma - p0.sigma) * localProgress,
      relLik: p0.relLik + (p1.relLik - p0.relLik) * localProgress
    };
    const visiblePath = data.path.slice(0, index + 1);
    if (localProgress > 0 && nextIndex > index) visiblePath.push(point);
    return {
      frameIndex: Math.round(progress * 240),
      step: index,
      progress,
      point,
      visiblePath
    };
  }

  function drawOptimizerHeatmap(svg, view, xScale, yScale) {
    const data = optimizerData;
    const nx = data.muGrid.length;
    const ny = data.varianceGrid.length;
    const stepX = 2;
    const stepY = 2;
    for (let j = 0; j < ny - 1; j += stepY) {
      for (let i = 0; i < nx - 1; i += stepX) {
        const rel = data.relLik[i + nx * j] || 0;
        if (rel < 0.001) continue;
        const x0 = xScale(data.muGrid[i]);
        const x1 = xScale(data.muGrid[Math.min(i + stepX, nx - 1)]);
        const y0 = yScale(data.varianceGrid[j]);
        const y1 = yScale(data.varianceGrid[Math.min(j + stepY, ny - 1)]);
        const opacity = 0.04 + 0.58 * Math.pow(rel, 0.44);
        svg.appendChild(svgEl("rect", {
          x: Math.min(x0, x1),
          y: Math.min(y0, y1),
          width: Math.max(0.5, Math.abs(x1 - x0)),
          height: Math.max(0.5, Math.abs(y1 - y0)),
          fill: `rgba(37, 99, 235, ${opacity.toFixed(3)})`,
          stroke: "none"
        }));
      }
    }
  }

  function drawOptimizerFigure(frame) {
    const data = optimizerData;
    const view = optimizerView;
    const { w, h, m } = view;
    clear(densitySvg, view);
    densitySvg.setAttribute("aria-label", "Figure 4.3 companion showing optimizer trajectory over a normal likelihood surface");

    densitySvg.appendChild(svgEl("rect", { x: 0, y: 0, width: w, height: h, fill: "#fff" }));
    if (!data.path.length) {
      densitySvg.appendChild(svgEl("text", {
        x: w / 2,
        y: h / 2,
        "text-anchor": "middle",
        text: "Fig. 4.3 optimizer data could not be loaded."
      }));
      return;
    }

    const xMin = data.xRange[0];
    const xMax = data.xRange[1];
    const yMin = data.yRange[0];
    const yMax = data.yRange[1];
    const xScale = (x) => m.left + ((x - xMin) / (xMax - xMin)) * (w - m.left - m.right);
    const yScale = (y) => h - m.bottom - ((y - yMin) / (yMax - yMin)) * (h - m.top - m.bottom);

    drawOptimizerHeatmap(densitySvg, view, xScale, yScale);
    drawCartesianAxes(densitySvg, view, xScale, yScale, data.xTicks, data.yTicks, "Mean μ", "Variance σ²");

    if (frame.visiblePath.length > 1) {
      densitySvg.appendChild(svgEl("path", {
        d: linePath(frame.visiblePath.map((p) => ({ x: p.mu, y: p.variance })), xScale, yScale),
        fill: "none",
        stroke: colors.red,
        "stroke-width": 4.2,
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      }));
    }

    frame.visiblePath.forEach((point, index) => {
      densitySvg.appendChild(svgEl("circle", {
        cx: xScale(point.mu),
        cy: yScale(point.variance),
        r: index === frame.visiblePath.length - 1 ? 6.4 : 3.2,
        fill: index === frame.visiblePath.length - 1 ? colors.gold : "#ffffff",
        stroke: index === frame.visiblePath.length - 1 ? "#8a5b00" : colors.red,
        "stroke-width": index === frame.visiblePath.length - 1 ? 2 : 1.4
      }));
    });

    densitySvg.appendChild(addTitle(svgEl("text", {
      x: xScale(data.mle.mu),
      y: yScale(data.mle.variance) + 8,
      "text-anchor": "middle",
      fill: "#111",
      "font-size": 28,
      "font-weight": 700,
      text: "★"
    }), "Maximum likelihood estimate"));
  }

  function updateOptimizerMetric(frame) {
    clearDashboardClasses();
    root.classList.add("is-mcmc", "is-optimizer");
    if (figureKicker) figureKicker.textContent = "Fig. 4.3 companion";
    if (dashboardTitle) dashboardTitle.textContent = "Optimization";
    if (leftPanelTitle) leftPanelTitle.textContent = "Likelihood and optimizer trajectory";
    if (rightPanelTitle) rightPanelTitle.textContent = "";
    metricLabel.textContent = "step";
    metricValue.textContent = formatCount(frame.step);
    if (frame.point) {
      secondaryMetric.textContent = `μ ${frame.point.mu.toFixed(3)}   σ² ${frame.point.variance.toFixed(3)}`;
    } else {
      secondaryMetric.textContent = "";
    }
    metricCaption.textContent = "Normal likelihood";
    conceptNote.textContent = "Figure 4.3 companion shows the optimizer moving across the normal likelihood for the log lung-cancer marker example until it reaches the estimate; the movie then restarts.";
  }

  function drawOptimizerMovie(timestamp, suppliedFrame) {
    const frame = suppliedFrame || optimizerFrame(timestamp);
    drawOptimizerFigure(frame);
    updateOptimizerMetric(frame);
  }

  function updateMetric() {
    const currentTrace = traceConfig();
    if (currentTrace) {
      updateMcmcMetric(mcmcFrame(performance.now(), currentTrace), currentTrace);
      return;
    }

    if (state.concept === "optimizer") {
      updateOptimizerMetric(optimizerFrame(performance.now()));
      return;
    }

    if (state.concept === "overlap") {
      updateOverlapMetric();
      return;
    }

    const auc = aucValue();
    const affinity = affinityValue();
    clearDashboardClasses();
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
      if (figureKicker) figureKicker.textContent = "Fig. 7.2 companion";
      metricLabel.textContent = "Affinity";
      metricValue.textContent = formatNumber(affinity);
      secondaryMetric.textContent = `AUC ${formatNumber(auc)}`;
      metricCaption.textContent = "Distributional affinity";
      conceptNote.textContent = Math.abs(auc - 0.5) < 0.0005 ? "Separation trap: AUC = 0.500 despite little overlap." : "";
    }
  }

  function render() {
    if (traceConfig()) {
      drawMcmcMovie(performance.now());
      return;
    }
    if (state.concept === "optimizer") {
      drawOptimizerMovie(performance.now());
      return;
    }
    if (state.concept === "overlap") {
      drawOverlapFigure();
      updateMetric();
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
    lastMovieDraw = 0;
    lastMovieCount = 0;
    const animate = (timestamp) => {
      const currentTrace = traceConfig();
      if (!currentTrace && state.concept !== "optimizer") return;
      const frame = currentTrace ? mcmcFrame(timestamp, currentTrace) : optimizerFrame(timestamp);
      const frameKey = currentTrace ? frame.count : frame.frameIndex;
      const finalKey = currentTrace ? currentTrace.data.total : 240;
      if (timestamp - lastMovieDraw >= 70 || frameKey < lastMovieCount || frameKey === finalKey) {
        if (currentTrace) drawMcmcMovie(timestamp, frame);
        else drawOptimizerMovie(timestamp, frame);
        lastMovieDraw = timestamp;
        lastMovieCount = frameKey;
      }
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
    if (traceConfig() || state.concept === "optimizer") {
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
  if (traceConfig() || state.concept === "optimizer") startMcmcAnimation();
  else render();
}());
