(function () {
  const root = document.getElementById("fig13-dashboard");
  if (!root) return;

  const densitySvg = document.getElementById("roc-density-plot");
  const rocSvg = document.getElementById("roc-roc-plot");
  const metricChoice = document.getElementById("roc-metric-choice");
  const metricLabel = document.getElementById("roc-metric-label");
  const metricValue = document.getElementById("roc-metric-value");
  const metricCaption = document.getElementById("roc-metric-caption");
  const resetButton = document.getElementById("roc-reset");

  const controls = {
    blueMean: document.getElementById("roc-blue-mean"),
    blueSd: document.getElementById("roc-blue-sd"),
    redMean: document.getElementById("roc-red-mean"),
    redSd: document.getElementById("roc-red-sd")
  };

  const labels = {
    blueMean: controls.blueMean.closest("label").querySelector("span"),
    blueSd: controls.blueSd.closest("label").querySelector("span"),
    redMean: controls.redMean.closest("label").querySelector("span"),
    redSd: controls.redSd.closest("label").querySelector("span")
  };

  const defaults = {
    blue: { mean: 0, sd: 1 },
    red: { mean: 2, sd: 1 },
    metric: "auc"
  };

  const state = {
    blue: { ...defaults.blue },
    red: { ...defaults.red },
    metric: defaults.metric
  };

  const colors = {
    blue: "#2563eb",
    blueFill: "rgba(37, 99, 235, 0.18)",
    red: "#e14a61",
    redFill: "rgba(225, 74, 97, 0.18)",
    overlap: "rgba(67, 86, 108, 0.16)",
    ink: "#2d4053",
    muted: "#536779",
    grid: "#e5ebf1"
  };

  const densityView = {
    w: 640,
    h: 340,
    m: { top: 18, right: 18, bottom: 44, left: 48 },
    xMin: -4,
    xMax: 6
  };

  const rocView = {
    w: 560,
    h: 340,
    m: { top: 18, right: 20, bottom: 48, left: 54 }
  };

  let drag = null;

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

  function auc() {
    const delta = state.red.mean - state.blue.mean;
    const scale = Math.sqrt(state.red.sd * state.red.sd + state.blue.sd * state.blue.sd);
    return normalCdf(delta / scale);
  }

  function affinity() {
    const s0 = state.blue.sd;
    const s1 = state.red.sd;
    const delta = state.red.mean - state.blue.mean;
    const spread = s0 * s0 + s1 * s1;
    return Math.sqrt((2 * s0 * s1) / spread) * Math.exp(-(delta * delta) / (4 * spread));
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

  function setControlValues() {
    controls.blueMean.value = state.blue.mean;
    controls.blueSd.value = state.blue.sd;
    controls.redMean.value = state.red.mean;
    controls.redSd.value = state.red.sd;
    metricChoice.value = state.metric;

    labels.blueMean.textContent = `Blue mean ${state.blue.mean.toFixed(2)}`;
    labels.blueSd.textContent = `Blue spread ${state.blue.sd.toFixed(2)}`;
    labels.redMean.textContent = `Red mean ${state.red.mean.toFixed(2)}`;
    labels.redSd.textContent = `Red spread ${state.red.sd.toFixed(2)}`;
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
      axis.appendChild(svgEl("text", { x, y: h - m.bottom + 20, "text-anchor": "middle", text: tick.toFixed(tick % 1 ? 1 : 0) }));
    });

    yTicks.forEach((tick) => {
      const y = yScale(tick);
      axis.appendChild(svgEl("line", { class: "roc-grid-line", x1: m.left, y1: y, x2: w - m.right, y2: y }));
      axis.appendChild(svgEl("line", { x1: m.left - 5, y1: y, x2: m.left, y2: y }));
      axis.appendChild(svgEl("text", { x: m.left - 10, y: y + 4, "text-anchor": "end", text: tick.toFixed(tick < 1 ? 1 : 0) }));
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
    const rect = densitySvg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * densityView.w;
    const span = densityView.xMax - densityView.xMin;
    const plotW = densityView.w - densityView.m.left - densityView.m.right;
    return densityView.xMin + ((px - densityView.m.left) / plotW) * span;
  }

  function startDrag(group, event) {
    event.preventDefault();
    drag = {
      group,
      startX: dataXFromPointer(event),
      startMean: state[group].mean
    };
    densitySvg.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (!drag) return;
    const control = drag.group === "blue" ? controls.blueMean : controls.redMean;
    const min = Number(control.min);
    const max = Number(control.max);
    const next = drag.startMean + dataXFromPointer(event) - drag.startX;
    state[drag.group].mean = clamp(next, min, max);
    setControlValues();
    render();
  }

  function endDrag() {
    drag = null;
  }

  function drawDensityPlot() {
    const view = densityView;
    const { w, h, m, xMin, xMax } = view;
    clear(densitySvg, view);

    const n = 220;
    const points = Array.from({ length: n }, (_, i) => {
      const x = xMin + (i / (n - 1)) * (xMax - xMin);
      return {
        x,
        blue: normalPdf(x, state.blue.mean, state.blue.sd),
        red: normalPdf(x, state.red.mean, state.red.sd)
      };
    });
    const yMax = Math.max(...points.map((p) => Math.max(p.blue, p.red))) * 1.18;

    const xScale = (x) => m.left + ((x - xMin) / (xMax - xMin)) * (w - m.left - m.right);
    const yScale = (y) => h - m.bottom - (y / yMax) * (h - m.top - m.bottom);

    drawAxes(
      densitySvg,
      view,
      xScale,
      yScale,
      [-4, -2, 0, 2, 4, 6],
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

    [
      { group: "blue", points: bluePoints, fill: colors.blueFill, stroke: colors.blue, text: "Drag the blue distribution" },
      { group: "red", points: redPoints, fill: colors.redFill, stroke: colors.red, text: "Drag the red distribution" }
    ].forEach((curve) => {
      const fill = addTitle(svgEl("path", {
        d: areaPath(curve.points, xScale, yScale, 0),
        fill: curve.fill,
        stroke: "none",
        style: "cursor: ew-resize;"
      }), curve.text);
      fill.addEventListener("pointerdown", (event) => startDrag(curve.group, event));
      densitySvg.appendChild(fill);

      const line = addTitle(svgEl("path", {
        d: linePath(curve.points, xScale, yScale),
        fill: "none",
        stroke: curve.stroke,
        "stroke-width": 3.2,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
        style: "cursor: ew-resize; pointer-events: stroke;"
      }), curve.text);
      line.addEventListener("pointerdown", (event) => startDrag(curve.group, event));
      densitySvg.appendChild(line);

      const mean = state[curve.group].mean;
      const sd = state[curve.group].sd;
      const handle = addTitle(svgEl("circle", {
        cx: xScale(mean),
        cy: yScale(normalPdf(mean, mean, sd)),
        r: 6.5,
        fill: curve.stroke,
        stroke: "#fff",
        "stroke-width": 2,
        style: "cursor: ew-resize;"
      }), curve.text);
      handle.addEventListener("pointerdown", (event) => startDrag(curve.group, event));
      densitySvg.appendChild(handle);
    });
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

    const sdMax = Math.max(state.blue.sd, state.red.sd);
    const tMin = Math.min(state.blue.mean, state.red.mean) - 5 * sdMax;
    const tMax = Math.max(state.blue.mean, state.red.mean) + 5 * sdMax;
    const points = [{ x: 0, y: 0 }];
    for (let i = 0; i <= 180; i += 1) {
      const t = tMax - (i / 180) * (tMax - tMin);
      const fpr = 1 - normalCdf((t - state.blue.mean) / state.blue.sd);
      const tpr = 1 - normalCdf((t - state.red.mean) / state.red.sd);
      points.push({ x: clamp(fpr, 0, 1), y: clamp(tpr, 0, 1) });
    }
    points.push({ x: 1, y: 1 });

    const area = [
      `M ${xScale(0).toFixed(2)} ${yScale(0).toFixed(2)}`,
      points.map((p, i) => `${i ? "L" : "L"} ${xScale(p.x).toFixed(2)} ${yScale(p.y).toFixed(2)}`).join(" "),
      `L ${xScale(1).toFixed(2)} ${yScale(0).toFixed(2)}`,
      "Z"
    ].join(" ");

    rocSvg.appendChild(svgEl("path", {
      d: area,
      fill: state.metric === "auc" ? "rgba(0, 51, 102, 0.16)" : "rgba(83, 103, 121, 0.10)",
      stroke: "none"
    }));

    rocSvg.appendChild(svgEl("path", {
      d: linePath(points, xScale, yScale),
      fill: "none",
      stroke: "#003366",
      "stroke-width": 3.2,
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    }));
  }

  function updateMetric() {
    if (state.metric === "auc") {
      metricLabel.textContent = "AUC";
      metricValue.textContent = formatNumber(auc());
      metricCaption.textContent = "Probability of correct ranking.";
    } else {
      metricLabel.textContent = "Affinity";
      metricValue.textContent = formatNumber(affinity());
      metricCaption.textContent = "Distributional similarity.";
    }
  }

  function render() {
    drawDensityPlot();
    drawRocPlot();
    updateMetric();
  }

  function updateFromControls() {
    state.blue.mean = Number(controls.blueMean.value);
    state.blue.sd = Number(controls.blueSd.value);
    state.red.mean = Number(controls.redMean.value);
    state.red.sd = Number(controls.redSd.value);
    state.metric = metricChoice.value;
    setControlValues();
    render();
  }

  Object.values(controls).forEach((control) => {
    control.addEventListener("input", updateFromControls);
  });

  metricChoice.addEventListener("change", updateFromControls);
  resetButton.addEventListener("click", () => {
    state.blue = { ...defaults.blue };
    state.red = { ...defaults.red };
    state.metric = defaults.metric;
    setControlValues();
    render();
  });

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", render);

  setControlValues();
  render();
}());
