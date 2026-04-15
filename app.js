const DEFAULT_LINE_COUNT = 1;
const MAX_LINE_COUNT = 20;

const state = {
  imageMeta: null,
  horizontalLinesPx: [],
  verticalLinesPx: [],
  previewScale: 1,
  dragState: null,
  validationErrors: {
    horizontal: "",
    vertical: "",
    upload: "",
  },
  exportState: {
    busy: false,
    message: "待命",
  },
  notice: {
    tone: "info",
    text: "等待上传图片。",
  },
};

const elements = {
  uploadInput: document.getElementById("imageInput"),
  uploadDropzone: document.getElementById("uploadDropzone"),
  currentFileName: document.getElementById("currentFileName"),
  horizontalCount: document.getElementById("horizontalCount"),
  verticalCount: document.getElementById("verticalCount"),
  horizontalLineList: document.getElementById("horizontalLineList"),
  verticalLineList: document.getElementById("verticalLineList"),
  horizontalHint: document.getElementById("horizontalHint"),
  verticalHint: document.getElementById("verticalHint"),
  horizontalError: document.getElementById("horizontalError"),
  verticalError: document.getElementById("verticalError"),
  resetLinesButton: document.getElementById("resetLinesButton"),
  downloadButton: document.getElementById("downloadButton"),
  statusMessage: document.getElementById("statusMessage"),
  dimensionMetric: document.getElementById("dimensionMetric"),
  sliceMetric: document.getElementById("sliceMetric"),
  scaleMetric: document.getElementById("scaleMetric"),
  exportStateLabel: document.getElementById("exportStateLabel"),
  previewViewport: document.getElementById("previewViewport"),
  previewSurface: document.getElementById("previewSurface"),
  previewImage: document.getElementById("previewImage"),
  splitLayer: document.getElementById("splitLayer"),
  emptyState: document.getElementById("emptyState"),
};

const AXIS_META = {
  horizontal: {
    axisSizeKey: "naturalHeight",
    label: "横向分割线",
    shortLabel: "横线",
  },
  vertical: {
    axisSizeKey: "naturalWidth",
    label: "纵向分割线",
    shortLabel: "纵线",
  },
};

initialize();

function initialize() {
  bindEvents();
  observeViewport();
  render();
}

function bindEvents() {
  elements.uploadInput.addEventListener("change", handleUploadChange);

  elements.uploadDropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    elements.uploadDropzone.classList.add("is-dragover");
  });

  elements.uploadDropzone.addEventListener("dragleave", () => {
    elements.uploadDropzone.classList.remove("is-dragover");
  });

  elements.uploadDropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    elements.uploadDropzone.classList.remove("is-dragover");

    const [file] = event.dataTransfer?.files ?? [];
    if (file) {
      void applyImageFile(file);
    }
  });

  elements.horizontalCount.addEventListener("change", () => {
    handleCountChange("horizontal", elements.horizontalCount.value);
  });

  elements.verticalCount.addEventListener("change", () => {
    handleCountChange("vertical", elements.verticalCount.value);
  });

  elements.resetLinesButton.addEventListener("click", handleResetAllLines);
  elements.downloadButton.addEventListener("click", () => {
    void exportSlicesZip();
  });

  window.addEventListener("pointermove", handleGlobalPointerMove);
  window.addEventListener("pointerup", finishDragging);
  window.addEventListener("pointercancel", finishDragging);
}

function observeViewport() {
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(() => {
      if (!state.imageMeta) {
        return;
      }

      syncPreviewScale();
      renderPreviewSurface();
      renderMetrics();
    });

    observer.observe(elements.previewViewport);
    return;
  }

  window.addEventListener("resize", () => {
    if (!state.imageMeta) {
      return;
    }

    syncPreviewScale();
    renderPreviewSurface();
    renderMetrics();
  });
}

function handleUploadChange(event) {
  const [file] = event.target.files ?? [];

  if (file) {
    void applyImageFile(file);
  }

  event.target.value = "";
}

async function applyImageFile(file) {
  if (!isSupportedImage(file)) {
    setNotice("请选择浏览器可解码的图片文件。", "error");
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  const previousImageMeta = state.imageMeta;
  const previousObjectUrl = state.imageMeta?.objectUrl;

  try {
    setNotice("正在载入图片，请稍候…", "info");
    await loadImageIntoElement(elements.previewImage, objectUrl);

    state.imageMeta = {
      fileName: file.name,
      baseName: sanitizeBaseName(file.name),
      objectUrl,
      naturalWidth: elements.previewImage.naturalWidth,
      naturalHeight: elements.previewImage.naturalHeight,
    };

    initializeLinesFromCounts();
    clearAllValidation();
    state.exportState.message = "待命";
    syncPreviewScale();
    render();
    setNotice(`已载入 ${file.name}，可以开始调整分割线。`, "success");

    if (previousObjectUrl) {
      URL.revokeObjectURL(previousObjectUrl);
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    state.imageMeta = previousImageMeta ?? null;

    if (previousImageMeta) {
      elements.previewImage.src = previousImageMeta.objectUrl;
      syncPreviewScale();
    }

    render();
    setNotice(
      "图片解码失败。请确认当前浏览器支持该格式，或换一张图片重试。",
      "error",
    );
  }
}

function handleCountChange(axis, rawValue) {
  const requested = sanitizeCount(rawValue);
  setCountInput(axis, requested);

  if (!state.imageMeta) {
    renderCounts();
    renderLineLists();
    setNotice(`已记录${AXIS_META[axis].label} ${requested} 条，上传图片后会按等距生成。`, "info");
    return;
  }

  resetLinesForAxis(axis, requested, true);
}

function handleResetAllLines() {
  if (!state.imageMeta) {
    setNotice("请先上传图片，再重置分割线。", "warning");
    return;
  }

  resetLinesForAxis("horizontal", state.horizontalLinesPx.length, false);
  resetLinesForAxis("vertical", state.verticalLinesPx.length, false);
  setNotice("已按当前条数重新生成全部分割线。", "info");
  render();
}

function initializeLinesFromCounts() {
  if (!state.imageMeta) {
    return;
  }

  const requestedHorizontal = sanitizeCount(elements.horizontalCount.value);
  const requestedVertical = sanitizeCount(elements.verticalCount.value);

  state.horizontalLinesPx = buildEvenlySpacedLines(
    normalizeLineCount(requestedHorizontal, state.imageMeta.naturalHeight),
    state.imageMeta.naturalHeight,
  );
  state.verticalLinesPx = buildEvenlySpacedLines(
    normalizeLineCount(requestedVertical, state.imageMeta.naturalWidth),
    state.imageMeta.naturalWidth,
  );

  setCountInput("horizontal", state.horizontalLinesPx.length);
  setCountInput("vertical", state.verticalLinesPx.length);
}

function resetLinesForAxis(axis, requestedCount, announce) {
  if (!state.imageMeta) {
    return;
  }

  const size = getAxisSize(axis);
  const normalizedCount = normalizeLineCount(requestedCount, size);

  state[axis === "horizontal" ? "horizontalLinesPx" : "verticalLinesPx"] =
    buildEvenlySpacedLines(normalizedCount, size);

  setCountInput(axis, normalizedCount);
  clearValidation(axis);

  if (announce) {
    const { label } = AXIS_META[axis];
    setNotice(`${label}已重置为 ${normalizedCount} 条等距分割线。`, "info");
  }

  render();
}

function buildEvenlySpacedLines(count, size) {
  if (count <= 0 || size <= 1) {
    return [];
  }

  const safeCount = Math.min(count, size - 1);
  const lines = [];

  for (let index = 0; index < safeCount; index += 1) {
    const rank = index + 1;
    const ideal = Math.round((size * rank) / (safeCount + 1));
    const minimum = index === 0 ? 1 : lines[index - 1] + 1;
    const remaining = safeCount - rank;
    const maximum = size - 1 - remaining;
    lines.push(clamp(ideal, minimum, maximum));
  }

  return lines;
}

function render() {
  renderCounts();
  renderLineLists();
  renderMetrics();
  renderPreviewSurface();
  renderStatus();
  renderButtons();
}

function renderCounts() {
  elements.horizontalHint.textContent = formatCountHint(
    "horizontal",
    state.imageMeta ? state.horizontalLinesPx.length : sanitizeCount(elements.horizontalCount.value),
  );
  elements.verticalHint.textContent = formatCountHint(
    "vertical",
    state.imageMeta ? state.verticalLinesPx.length : sanitizeCount(elements.verticalCount.value),
  );
}

function renderLineLists() {
  renderAxisLineList("horizontal", elements.horizontalLineList, elements.horizontalError);
  renderAxisLineList("vertical", elements.verticalLineList, elements.verticalError);
}

function renderAxisLineList(axis, container, errorElement) {
  const lines = axis === "horizontal" ? state.horizontalLinesPx : state.verticalLinesPx;
  const axisMeta = AXIS_META[axis];

  container.replaceChildren();

  if (!state.imageMeta) {
    const empty = document.createElement("p");
    empty.className = "line-list__empty";
    empty.textContent = `上传图片后可以设置${axisMeta.label}的像素位置。`;
    container.append(empty);
    hideAxisError(errorElement);
    return;
  }

  if (lines.length === 0) {
    const empty = document.createElement("p");
    empty.className = "line-list__empty";
    empty.textContent = `当前没有${axisMeta.label}，图片会保持该方向整块输出。`;
    container.append(empty);
    hideAxisError(errorElement);
    return;
  }

  const axisSize = getAxisSize(axis);

  lines.forEach((value, index) => {
    const row = document.createElement("label");
    row.className = "line-item";

    const textWrap = document.createElement("div");
    textWrap.className = "line-item__label";

    const title = document.createElement("span");
    title.className = "line-item__title";
    title.textContent = `${axisMeta.shortLabel} ${index + 1}`;

    const meta = document.createElement("span");
    meta.className = "line-item__meta";
    meta.textContent = `位于 ${value}px · ${(value / axisSize * 100).toFixed(1)}%`;

    textWrap.append(title, meta);

    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = String(Math.max(axisSize - 1, 1));
    input.step = "1";
    input.value = String(value);
    input.setAttribute("aria-label", `${axisMeta.shortLabel}${index + 1}像素位置`);
    input.addEventListener("change", () => {
      commitLineValue(axis, index, input.value);
    });

    row.append(textWrap, input);
    container.append(row);
  });

  const errorMessage = state.validationErrors[axis];
  if (errorMessage) {
    showAxisError(errorElement, errorMessage);
  } else {
    hideAxisError(errorElement);
  }
}

function renderMetrics() {
  if (!state.imageMeta) {
    elements.currentFileName.textContent = "未选择";
    elements.dimensionMetric.textContent = "未载入";
    elements.sliceMetric.textContent = "0 张";
    elements.scaleMetric.textContent = "--";
    return;
  }

  const { naturalWidth, naturalHeight, fileName } = state.imageMeta;
  const rows = state.horizontalLinesPx.length + 1;
  const cols = state.verticalLinesPx.length + 1;
  const total = rows * cols;

  elements.currentFileName.textContent = fileName;
  elements.dimensionMetric.textContent = `${naturalWidth} × ${naturalHeight}px`;
  elements.sliceMetric.textContent = `${total} 张 (${rows} × ${cols})`;
  elements.scaleMetric.textContent = `${Math.round(state.previewScale * 100)}%`;
}

function renderPreviewSurface() {
  if (!state.imageMeta) {
    elements.previewSurface.hidden = true;
    elements.emptyState.hidden = false;
    elements.splitLayer.replaceChildren();
    return;
  }

  const displayWidth = Math.max(
    1,
    Math.round(state.imageMeta.naturalWidth * state.previewScale),
  );
  const displayHeight = Math.max(
    1,
    Math.round(state.imageMeta.naturalHeight * state.previewScale),
  );

  elements.previewSurface.hidden = false;
  elements.emptyState.hidden = true;
  elements.previewSurface.style.width = `${displayWidth}px`;
  elements.previewSurface.style.height = `${displayHeight}px`;

  renderSplitLines();
}

function renderSplitLines() {
  elements.splitLayer.replaceChildren();

  if (!state.imageMeta) {
    return;
  }

  const fragment = document.createDocumentFragment();

  state.verticalLinesPx.forEach((position, index) => {
    fragment.append(
      createLineButton({
        axis: "vertical",
        index,
        position,
        offset: position * state.previewScale,
      }),
    );
  });

  state.horizontalLinesPx.forEach((position, index) => {
    fragment.append(
      createLineButton({
        axis: "horizontal",
        index,
        position,
        offset: position * state.previewScale,
      }),
    );
  });

  elements.splitLayer.append(fragment);
}

function createLineButton({ axis, index, position, offset }) {
  const axisMeta = AXIS_META[axis];
  const button = document.createElement("button");
  button.type = "button";
  button.className = `split-line split-line--${axis}`;
  button.dataset.axis = axis;
  button.dataset.index = String(index);
  button.style[axis === "vertical" ? "left" : "top"] = `${offset}px`;

  const active =
    state.dragState &&
    state.dragState.axis === axis &&
    state.dragState.index === index;

  if (active) {
    button.classList.add("is-active");
  }

  button.setAttribute("aria-label", `${axisMeta.shortLabel}${index + 1}，当前位置 ${position}px`);
  button.innerHTML = `<span class="split-line__badge">${axisMeta.shortLabel} ${index + 1}<em>${position}px</em></span>`;
  button.addEventListener("pointerdown", handleLinePointerDown);
  return button;
}

function renderStatus() {
  elements.statusMessage.textContent = state.notice.text;
  elements.statusMessage.dataset.tone = state.notice.tone;
  elements.exportStateLabel.textContent = state.exportState.message;
}

function renderButtons() {
  const disabled = !state.imageMeta || state.exportState.busy;
  elements.resetLinesButton.disabled = disabled;
  elements.downloadButton.disabled = disabled;
  elements.downloadButton.textContent = state.exportState.busy ? "正在打包…" : "下载 ZIP";
}

function handleLinePointerDown(event) {
  if (!state.imageMeta) {
    return;
  }

  event.preventDefault();
  const button = event.currentTarget;
  const axis = button.dataset.axis;
  const index = Number(button.dataset.index);

  state.dragState = {
    axis,
    index,
  };

  document.body.classList.add("is-dragging");
  button.setPointerCapture?.(event.pointerId);
  applyPointerPosition(axis, index, event);
}

function handleGlobalPointerMove(event) {
  if (!state.dragState || !state.imageMeta) {
    return;
  }

  event.preventDefault();
  applyPointerPosition(state.dragState.axis, state.dragState.index, event);
}

function finishDragging() {
  if (!state.dragState) {
    return;
  }

  const { axis, index } = state.dragState;
  const axisMeta = AXIS_META[axis];
  const value = getAxisLines(axis)[index];
  state.dragState = null;
  document.body.classList.remove("is-dragging");
  renderSplitLines();
  renderLineLists();
  setNotice(`${axisMeta.shortLabel} ${index + 1} 已更新为 ${value}px。`, "success");
}

function applyPointerPosition(axis, index, event) {
  const surfaceRect = elements.previewSurface.getBoundingClientRect();
  const lines = [...getAxisLines(axis)];
  const axisSize = getAxisSize(axis);
  const pointerPosition =
    axis === "vertical"
      ? event.clientX - surfaceRect.left
      : event.clientY - surfaceRect.top;

  const nextEdge = lines[index + 1] ?? axisSize;
  const previousEdge = lines[index - 1] ?? 0;
  const rawValue = Math.round(pointerPosition / state.previewScale);
  const clampedValue = clamp(rawValue, previousEdge + 1, nextEdge - 1);

  if (lines[index] === clampedValue) {
    return;
  }

  lines[index] = clampedValue;

  if (axis === "horizontal") {
    state.horizontalLinesPx = lines;
  } else {
    state.verticalLinesPx = lines;
  }

  clearValidation(axis);
  renderSplitLines();
  renderLineLists();
}

function commitLineValue(axis, index, rawValue) {
  if (!state.imageMeta) {
    return;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed)) {
    state.validationErrors[axis] = "请输入整数像素值。";
    renderLineLists();
    return;
  }

  const axisSize = getAxisSize(axis);
  const lines = [...getAxisLines(axis)];
  const previousEdge = lines[index - 1] ?? 0;
  const nextEdge = lines[index + 1] ?? axisSize;
  const clampedValue = clamp(parsed, 1, axisSize - 1);

  if (clampedValue <= previousEdge || clampedValue >= nextEdge) {
    state.validationErrors[axis] =
      `${AXIS_META[axis].shortLabel} ${index + 1} 必须大于 ${previousEdge}px 且小于 ${nextEdge}px。`;
    renderLineLists();
    return;
  }

  lines[index] = clampedValue;

  if (axis === "horizontal") {
    state.horizontalLinesPx = lines;
  } else {
    state.verticalLinesPx = lines;
  }

  clearValidation(axis);
  renderLineLists();
  renderSplitLines();

  if (clampedValue !== parsed) {
    setNotice(`${AXIS_META[axis].shortLabel} ${index + 1} 已自动夹紧到 ${clampedValue}px。`, "warning");
  } else {
    setNotice(`${AXIS_META[axis].shortLabel} ${index + 1} 已更新为 ${clampedValue}px。`, "success");
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let crc = n;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    table[n] = crc >>> 0;
  }

  return table;
})();

async function exportSlicesZip() {
  if (!state.imageMeta || state.exportState.busy) {
    return;
  }

  try {
    state.exportState.busy = true;
    state.exportState.message = "准备切片";
    renderButtons();
    renderStatus();

    const entries = await buildSliceEntries();
    state.exportState.message = "正在封装 ZIP";
    renderStatus();

    const zipBlob = createZipBlob(entries);
    downloadBlob(zipBlob, `${state.imageMeta.baseName}-slices.zip`);

    state.exportState.message = `已生成 ${entries.length} 张切片`;
    setNotice(`切片 ZIP 已开始下载，共 ${entries.length} 张。`, "success");
  } catch (error) {
    console.error(error);
    state.exportState.message = "导出失败";
    setNotice("导出失败，请换一张图片或稍后重试。", "error");
  } finally {
    state.exportState.busy = false;
    renderButtons();
    renderStatus();
  }
}

async function buildSliceEntries() {
  const xEdges = [0, ...state.verticalLinesPx, state.imageMeta.naturalWidth];
  const yEdges = [0, ...state.horizontalLinesPx, state.imageMeta.naturalHeight];
  const total = (xEdges.length - 1) * (yEdges.length - 1);
  const entries = [];
  const exportCanvas = createExportCanvas();
  let processed = 0;

  for (let row = 0; row < yEdges.length - 1; row += 1) {
    for (let col = 0; col < xEdges.length - 1; col += 1) {
      const width = xEdges[col + 1] - xEdges[col];
      const height = yEdges[row + 1] - yEdges[row];
      const blob = await drawSliceToBlob(exportCanvas, xEdges[col], yEdges[row], width, height);
      const data = new Uint8Array(await blob.arrayBuffer());
      const rowNumber = String(row + 1).padStart(2, "0");
      const colNumber = String(col + 1).padStart(2, "0");

      entries.push({
        name: `${state.imageMeta.baseName}-r${rowNumber}-c${colNumber}.png`,
        data,
      });

      processed += 1;
      state.exportState.message = `正在切片 ${processed} / ${total}`;
      renderStatus();
    }
  }

  return entries;
}

function createExportCanvas() {
  if ("OffscreenCanvas" in window) {
    return new OffscreenCanvas(1, 1);
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas;
}

async function drawSliceToBlob(canvas, sx, sy, sw, sh) {
  canvas.width = sw;
  canvas.height = sh;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("无法创建导出画布。");
  }

  context.clearRect(0, 0, sw, sh);
  context.drawImage(elements.previewImage, sx, sy, sw, sh, 0, 0, sw, sh);

  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: "image/png" });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("无法生成 PNG 切片。"));
    }, "image/png");
  });
}

function createZipBlob(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const fileNameBytes = encoder.encode(entry.name);
    const { time, date } = getDosDateTime(new Date());
    const crc = crc32(entry.data);

    const localHeader = new Uint8Array(30 + fileNameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, fileNameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(fileNameBytes, 30);

    const centralHeader = new Uint8Array(46 + fileNameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, fileNameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(fileNameBytes, 46);

    localParts.push(localHeader, entry.data);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + entry.data.length;
  }

  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, endRecord], {
    type: "application/zip",
  });
}

function crc32(bytes) {
  let crc = 0xffffffff;

  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time:
      ((date.getHours() & 0x1f) << 11) |
      ((date.getMinutes() & 0x3f) << 5) |
      ((Math.floor(date.getSeconds() / 2)) & 0x1f),
    date:
      (((year - 1980) & 0x7f) << 9) |
      (((date.getMonth() + 1) & 0x0f) << 5) |
      (date.getDate() & 0x1f),
  };
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function syncPreviewScale() {
  if (!state.imageMeta) {
    state.previewScale = 1;
    return;
  }

  const viewportStyle = getComputedStyle(elements.previewViewport);
  const maxWidth =
    elements.previewViewport.clientWidth -
    parseFloat(viewportStyle.paddingLeft) -
    parseFloat(viewportStyle.paddingRight);
  const maxHeight =
    elements.previewViewport.clientHeight -
    parseFloat(viewportStyle.paddingTop) -
    parseFloat(viewportStyle.paddingBottom);

  state.previewScale = Math.min(
    maxWidth / state.imageMeta.naturalWidth,
    maxHeight / state.imageMeta.naturalHeight,
    1,
  );
}

function loadImageIntoElement(imageElement, source) {
  imageElement.removeAttribute("src");

  if (typeof imageElement.decode === "function") {
    imageElement.src = source;

    if (imageElement.complete && imageElement.naturalWidth > 0) {
      return Promise.resolve();
    }

    return imageElement.decode().catch(() => {
      if (imageElement.complete && imageElement.naturalWidth > 0) {
        return undefined;
      }

      return waitForImageLoad(imageElement, source);
    });
  }

  return waitForImageLoad(imageElement, source);
}

function waitForImageLoad(imageElement, source) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      imageElement.onload = null;
      imageElement.onerror = null;
    };

    imageElement.onload = () => {
      cleanup();
      resolve();
    };

    imageElement.onerror = () => {
      cleanup();
      reject(new Error("Image decode failed"));
    };

    imageElement.src = source;

    if (imageElement.complete && imageElement.naturalWidth > 0) {
      cleanup();
      resolve();
    }
  });
}

function isSupportedImage(file) {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|avif)$/i.test(file.name);
}

function sanitizeBaseName(fileName) {
  const nameWithoutExtension = fileName.replace(/\.[^.]+$/, "");
  return nameWithoutExtension.replace(/[\\/:*?"<>|]/g, "-") || "image";
}

function sanitizeCount(rawValue) {
  const numeric = Number.parseInt(rawValue, 10);
  if (Number.isNaN(numeric)) {
    return DEFAULT_LINE_COUNT;
  }

  return clamp(numeric, 0, MAX_LINE_COUNT);
}

function normalizeLineCount(count, size) {
  return clamp(count, 0, Math.min(MAX_LINE_COUNT, Math.max(size - 1, 0)));
}

function setCountInput(axis, value) {
  if (axis === "horizontal") {
    elements.horizontalCount.value = String(value);
    return;
  }

  elements.verticalCount.value = String(value);
}

function getAxisSize(axis) {
  return state.imageMeta?.[AXIS_META[axis].axisSizeKey] ?? 0;
}

function getAxisLines(axis) {
  return axis === "horizontal" ? state.horizontalLinesPx : state.verticalLinesPx;
}

function clearValidation(axis) {
  state.validationErrors[axis] = "";
}

function clearAllValidation() {
  clearValidation("horizontal");
  clearValidation("vertical");
  state.validationErrors.upload = "";
}

function hideAxisError(element) {
  element.hidden = true;
  element.textContent = "";
}

function showAxisError(element, message) {
  element.hidden = false;
  element.textContent = message;
}

function setNotice(text, tone) {
  state.notice = { text, tone };
  renderStatus();
}

function formatCountHint(axis, count) {
  if (!state.imageMeta) {
    return `${count} 条`;
  }

  return `${count} 条 · ${getAxisSize(axis)}px`;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}
