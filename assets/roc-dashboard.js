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

  const defaults = {
    auc: {
      blueMean: 0,
      blueSd: 1,
      redMean: 2,
      redSd: 1
    },
    affinity: {
      blueLeft: -5,
      blueRight: 5,
      blueSd: 0.32,
      redMean: 0,
      redSd: 0.5
    }
  };

  const requestedConcept = new URLSearchParams(window.location.search).get("concept");
  const initialConcept = requestedConcept === "affinity" ? "affinity" : "auc";

  const state = {
    concept: initialConcept,
    params: clone(defaults[initialConcept])
  };

  const colors = {
    blue: "#2563eb",
    blueFill: "rgba(37, 99, 235, 0.18)",
    red: "#e14a61",
    redFill: "rgba(225, 74, 97, 0.18)",
    trapBlue: "#111827",
    trapBlueFill: "rgba(17, 24, 39, 0.13)",
    trapRed: "#9aa0a6",
    trapRedFill: "rgba(154, 160, 166, 0.20)",
    overlap: "rgba(67, 86, 108, 0.16)",
    roc: "#003366",
    grid: "#e5ebf1"
  };

  const densityBaseView = {
    w: 640,
    h: 340,
    m: { top: 18, right: 18, bottom: 44, left: 48 }
  };

  const rocView = {
    w: 560,
    h: 340,
    m: { top: 18, right: 20, bottom: 48, left: 54 }
  };

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

  function blueDensity(x) {
    const p = state.params;
    if (state.concept === "affinity") {
      return 0.5 * normalPdf(x, p.blueLeft, p.blueSd) + 0.5 * normalPdf(x, p.blueRight, p.blueSd);
    }
    return normalPdf(x, p.blueMean, p.blueSd);
  }

  function redDensity(x) {
    const p = state.params;
    return normalPdf(x, p.redMean, p.redSd);
  }

  function blueCdf(x) {
    const p = state.params;
    if (state.concept === "affinity") {
      return 0.5 * normalCdf((x - p.blueLeft) / p.blueSd) + 0.5 * normalCdf((x - p.blueRight) / p.blueSd);
    }
    return normalCdf((x - p.blueMean) / p.blueSd);
  }

  function redCdf(x) {
    const p = state.params;
    return normalCdf((x - p.redMean) / p.redSd);
  }

  function allMeans() {
    const p = state.params;
    if (state.concept === "affinity") return [p.blueLeft, p.redMean, p.blueRight];
    return [p.blueMean, p.redMean];
  }

  function maxSd() {
    const p = state.params;
    if (state.concept === "affinity") return Math.max(p.blueSd, p.redSd);
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
      axis.appendChild(svgEl("text", { x, y: h - m.bottom + 20, "text-anchor": "middle", text: formatAxisTick(tick) }));
    });

    yTicks.forEach((tick) => {
      const y = yScale(tick);
      axis.appendChild(svgEl("line", { class: "roc-grid-line", x1: m.left, y1: y, x2: w - m.right, y2: y }));
      axis.appendChild(svgEl("line", { x1: m.left - 5, y1: y, x2: m.left, y2: y }));
      axis.appendChild(svgEl("text", { x: m.left - 10, y: y + 4, "text-anchor": "end", text: formatAxisTick(tick) }));
    });

    axis.appendChild(svgEl("text", { x: (m.left + w - m.right) / 2, y: h - 8, "text-anchor": "middle", text: xLabel }));
    axis.appendChild(svgEl("text", {
      x: 13,
      y: (m.top + h - m.bottom) / 2,
      transform: `rotate(-90 13 ${(m.top + h - m.bottom) / 2})`,
      "text-anchor": "middle",
      text: yLabel
    }));
    svg.appendChild(axis);
  }

  function dataXFromPointer(event) {
    const view = densityView();
    const rect = densitySvg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * view.w;
    const span = view.xMax - view.xMin;
    const plotW = view.w - view.m.left - view.m.right;
    return view.xMin + ((px - view.m.left) / plotW) * span;
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

  function startSpreadDrag(target, event) {
    event.preventDefault();
    drag = {
      kind: "spread",
      target,
      startX: dataXFromPointer(event),
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

    if (drag.target === "bluePair") {
      const shift = clamp(dx, -6.8 - s.blueLeft, 6.8 - s.blueRight);
      p.blueLeft = s.blueLeft + shift;
      p.blueRight = s.blueRight + shift;
      return;
    }

    if (drag.target === "blueLeft") {
      p.blueLeft = clamp(s.blueLeft + dx, -6.8, s.blueRight - 0.9);
      return;
    }

    if (drag.target === "blueRight") {
      p.blueRight = clamp(s.blueRight + dx, s.blueLeft + 0.9, 6.8);
      return;
    }

    if (drag.target === "red") {
      p.redMean = clamp(s.redMean + dx, -3, 3);
    }
  }

  function setSpreadFromDrag(x) {
    const p = state.params;
    const s = drag.snapshot;
    let anchor;

    if (state.concept === "auc") {
      if (drag.target === "blue") {
        p.blueSd = clamp(Math.abs(x - s.blueMean), 0.25, 2.4);
      }
      if (drag.target === "red") {
        p.redSd = clamp(Math.abs(x - s.redMean), 0.25, 2.4);
      }
      return;
    }

    if (drag.target === "blueLeft") anchor = s.blueLeft;
    if (drag.target === "blueRight") anchor = s.blueRight;
    if (drag.target === "red") anchor = s.redMean;

    if (drag.target === "red") {
      p.redSd = clamp(Math.abs(x - anchor), 0.14, 1.8);
    } else {
      p.blueSd = clamp(Math.abs(x - anchor), 0.14, 1.4);
    }
  }

  function onPointerMove(event) {
    if (!drag) return;
    const x = dataXFromPointer(event);
    if (drag.kind === "mean") setMeanFromDrag(x);
    if (drag.kind === "spread") setSpreadFromDrag(x);
    setControlValues();
    render();
  }

  function endDrag() {
    drag = null;
  }

  function addMeanHandle(svg, x, y, color, target, text, xScale, yScale) {
    const cx = xScale(x);
    const cy = yScale(y);
    const group = svgEl("g", { style: "cursor: move;" });
    group.appendChild(svgEl("title", { text }));
    group.addEventListener("pointerdown", (event) => startMeanDrag(target, event));
    group.appendChild(svgEl("circle", {
      cx,
      cy,
      r: 15,
      fill: "transparent",
      "pointer-events": "all"
    }));
    group.appendChild(svgEl("circle", {
      cx,
      cy,
      r: 7,
      fill: color,
      stroke: "#fff",
      "stroke-width": 2
    }));
    svg.appendChild(group);
  }

  function addSpreadHandle(svg, x, y, color, target, text, xScale, yScale) {
    const cx = xScale(x);
    const cy = yScale(y);
    const group = svgEl("g", { style: "cursor: ew-resize;" });
    group.appendChild(svgEl("title", { text }));
    group.addEventListener("pointerdown", (event) => startSpreadDrag(target, event));
    group.appendChild(svgEl("circle", {
      cx,
      cy,
      r: 15,
      fill: "transparent",
      "pointer-events": "all"
    }));
    group.appendChild(svgEl("circle", {
      cx,
      cy,
      r: 6.5,
      fill: "#fff",
      stroke: color,
      "stroke-width": 2.5
    }));
    svg.appendChild(group);
  }

  function curveStyle(group) {
    if (state.concept === "affinity") {
      if (group === "blue") return { stroke: colors.trapBlue, fill: colors.trapBlueFill };
      return { stroke: colors.trapRed, fill: colors.trapRedFill };
    }
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

  function drawAucHandles(xScale, yScale) {
    const p = state.params;
    [
      { group: "blue", mean: p.blueMean, sd: p.blueSd },
      { group: "red", mean: p.redMean, sd: p.redSd }
    ].forEach(({ group, mean, sd }) => {
      const style = curveStyle(group);
      addMeanHandle(densitySvg, mean, normalPdf(mean, mean, sd), style.stroke, group, `Move ${group} mean`, xScale, yScale);
      addSpreadHandle(densitySvg, mean - sd, normalPdf(mean - sd, mean, sd), style.stroke, group, `Change ${group} variance`, xScale, yScale);
      addSpreadHandle(densitySvg, mean + sd, normalPdf(mean + sd, mean, sd), style.stroke, group, `Change ${group} variance`, xScale, yScale);
    });
  }

  function drawAffinityHandles(xScale, yScale) {
    const p = state.params;
    const blueStyle = curveStyle("blue");
    const redStyle = curveStyle("red");

    addMeanHandle(densitySvg, p.blueLeft, blueDensity(p.blueLeft), blueStyle.stroke, "blueLeft", "Move left tail", xScale, yScale);
    addMeanHandle(densitySvg, p.blueRight, blueDensity(p.blueRight), blueStyle.stroke, "blueRight", "Move right tail", xScale, yScale);
    addMeanHandle(densitySvg, p.redMean, redDensity(p.redMean), redStyle.stroke, "red", "Move central distribution", xScale, yScale);

    addSpreadHandle(densitySvg, p.blueLeft + p.blueSd, blueDensity(p.blueLeft + p.blueSd), blueStyle.stroke, "blueLeft", "Change tail variance", xScale, yScale);
    addSpreadHandle(densitySvg, p.blueRight - p.blueSd, blueDensity(p.blueRight - p.blueSd), blueStyle.stroke, "blueRight", "Change tail variance", xScale, yScale);
    addSpreadHandle(densitySvg, p.redMean - p.redSd, redDensity(p.redMean - p.redSd), redStyle.stroke, "red", "Change central variance", xScale, yScale);
    addSpreadHandle(densitySvg, p.redMean + p.redSd, redDensity(p.redMean + p.redSd), redStyle.stroke, "red", "Change central variance", xScale, yScale);
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
    const yMax = Math.max(...points.map((p) => Math.max(p.blue, p.red))) * 1.18;

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

    drawCurve(densitySvg, "blue", bluePoints, xScale, yScale, state.concept === "affinity" ? "bluePair" : "blue");
    drawCurve(densitySvg, "red", redPoints, xScale, yScale, "red");

    if (state.concept === "affinity") drawAffinityHandles(xScale, yScale);
    else drawAucHandles(xScale, yScale);
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

  function updateMetric() {
    const auc = aucValue();
    const affinity = affinityValue();

    if (state.concept === "auc") {
      metricLabel.textContent = "AUC";
      metricValue.textContent = formatNumber(auc);
      secondaryMetric.textContent = "";
      metricCaption.textContent = "Area Under the Curve";
      conceptNote.textContent = "";
    } else {
      metricLabel.textContent = "affinity";
      metricValue.textContent = formatNumber(affinity);
      secondaryMetric.textContent = `AUC ${formatNumber(auc)}`;
      metricCaption.textContent = "Distributional affinity";
      conceptNote.textContent = "Separation trap: AUC can be 0.5 with almost no overlap.";
    }
  }

  function render() {
    drawDensityPlot();
    drawRocPlot();
    updateMetric();
  }

  function updateConcept() {
    const nextConcept = conceptChoice.value;
    if (nextConcept !== state.concept) {
      state.concept = nextConcept;
      state.params = clone(defaults[nextConcept]);
    }
    setControlValues();
    render();
  }

  conceptChoice.addEventListener("change", updateConcept);

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", render);

  setControlValues();
  render();
}());
