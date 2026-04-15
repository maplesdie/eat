const STORAGE_KEY = `cookbook-progress-v1::${window.location.pathname}`;
const THUMB_WINDOW = 9;

const state = {
  items: [],
  currentIndex: 0,
  cookedMap: loadCookedMap(),
  toastTimer: null,
  ignoreHashChange: false,
  swipeStart: null,
};

const elements = {
  doneMetric: document.getElementById("doneMetric"),
  progressText: document.getElementById("progressText"),
  recipeTitle: document.getElementById("recipeTitle"),
  recipeCounter: document.getElementById("recipeCounter"),
  recipeStatus: document.getElementById("recipeStatus"),
  imageStage: document.getElementById("imageStage"),
  imagePlaceholder: document.getElementById("imagePlaceholder"),
  imageError: document.getElementById("imageError"),
  recipeImage: document.getElementById("recipeImage"),
  recipeSlider: document.getElementById("recipeSlider"),
  sliderLabel: document.getElementById("sliderLabel"),
  recipeFileName: document.getElementById("recipeFileName"),
  recipeHint: document.getElementById("recipeHint"),
  progressPercent: document.getElementById("progressPercent"),
  progressFill: document.getElementById("progressFill"),
  progressCaption: document.getElementById("progressCaption"),
  prevButton: document.getElementById("prevButton"),
  nextButton: document.getElementById("nextButton"),
  toggleCookedButton: document.getElementById("toggleCookedButton"),
  nextUncookedButton: document.getElementById("nextUncookedButton"),
  copyLinkButton: document.getElementById("copyLinkButton"),
  thumbStrip: document.getElementById("thumbStrip"),
  thumbRangeLabel: document.getElementById("thumbRangeLabel"),
  toast: document.getElementById("toast"),
};

initialize();

function initialize() {
  state.items = normalizeManifest(window.RECIPES_MANIFEST ?? []);
  bindEvents();

  if (state.items.length === 0) {
    renderEmpty();
    return;
  }

  state.currentIndex = clamp(getIndexFromHash(), 0, state.items.length - 1);
  renderCurrent(true);
}

function bindEvents() {
  elements.prevButton.addEventListener("click", () => goToIndex(state.currentIndex - 1));
  elements.nextButton.addEventListener("click", () => goToIndex(state.currentIndex + 1));
  elements.toggleCookedButton.addEventListener("click", toggleCookedState);
  elements.nextUncookedButton.addEventListener("click", jumpToNextUncooked);
  elements.copyLinkButton.addEventListener("click", copyCurrentLink);

  elements.recipeSlider.addEventListener("input", (event) => {
    const index = Number.parseInt(event.target.value, 10) - 1;
    goToIndex(index);
  });

  elements.recipeImage.addEventListener("load", handleImageLoad);
  elements.recipeImage.addEventListener("error", handleImageError);

  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("hashchange", handleHashChange);

  elements.imageStage.addEventListener("pointerdown", handleStagePointerDown);
  elements.imageStage.addEventListener("pointerup", handleStagePointerUp);
  elements.imageStage.addEventListener("pointercancel", resetSwipeStart);
}

function normalizeManifest(manifest) {
  const collator = new Intl.Collator("zh-Hans-CN", {
    numeric: true,
    sensitivity: "base",
  });

  return manifest
    .filter((item) => item && typeof item.src === "string" && item.src.length > 0)
    .map((item, index) => ({
      id: item.id ?? index + 1,
      src: item.src,
      title: item.title || deriveTitle(item.fileName || item.src),
      fileName: item.fileName || getFileName(item.src),
    }))
    .sort((left, right) => collator.compare(left.src, right.src));
}

function renderEmpty() {
  elements.recipeTitle.textContent = "还没有可浏览的食谱图";
  elements.recipeCounter.textContent = "0 / 0";
  elements.recipeStatus.dataset.state = "idle";
  elements.recipeStatus.textContent = "未找到图片";
  elements.recipeFileName.textContent = "请先准备图片清单";
  elements.recipeHint.textContent =
    "把图片放进 recipes、images 或 gallery 目录，然后运行一次清单生成脚本。";
  elements.doneMetric.textContent = "0 / 0";
  elements.progressText.textContent = "当前 recipes-manifest.js 里没有图片。";
  elements.progressPercent.textContent = "0%";
  elements.progressFill.style.width = "0%";
  elements.progressCaption.textContent = "等待加入食谱图片。";
  elements.recipeSlider.disabled = true;
  elements.prevButton.disabled = true;
  elements.nextButton.disabled = true;
  elements.toggleCookedButton.disabled = true;
  elements.nextUncookedButton.disabled = true;
  elements.copyLinkButton.disabled = true;
  elements.thumbStrip.replaceChildren();
  elements.thumbRangeLabel.textContent = "无";
  showPlaceholder("还没有载入图片", "请先生成 recipes-manifest.js 后再打开这个页面。");
}

function renderCurrent(forceImageUpdate = false) {
  if (state.items.length === 0) {
    renderEmpty();
    return;
  }

  const item = getCurrentItem();
  const cooked = isCooked(item);
  const doneCount = getDoneCount();
  const percent = Math.round((doneCount / state.items.length) * 100);

  elements.recipeTitle.textContent = item.title;
  elements.recipeCounter.textContent = `${state.currentIndex + 1} / ${state.items.length}`;
  elements.recipeStatus.dataset.state = cooked ? "cooked" : "uncooked";
  elements.recipeStatus.textContent = cooked ? "已做" : "未做";
  elements.recipeFileName.textContent = item.fileName;
  elements.recipeHint.textContent = cooked
    ? "这道已经被标记为已烹饪，可以继续浏览下一道。"
    : "这道还没做，做完后点中间按钮就能记录状态。";

  elements.doneMetric.textContent = `${doneCount} / ${state.items.length}`;
  elements.progressText.textContent = `还剩 ${state.items.length - doneCount} 张未做。`;
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressFill.style.width = `${percent}%`;
  elements.progressCaption.textContent = `已标记 ${doneCount} 张，未标记 ${state.items.length - doneCount} 张。`;

  elements.recipeSlider.disabled = false;
  elements.recipeSlider.max = String(state.items.length);
  elements.recipeSlider.value = String(state.currentIndex + 1);
  elements.sliderLabel.textContent = `${state.currentIndex + 1} / ${state.items.length}`;

  elements.prevButton.disabled = state.currentIndex <= 0;
  elements.nextButton.disabled = state.currentIndex >= state.items.length - 1;
  elements.nextUncookedButton.disabled = doneCount === state.items.length;
  elements.copyLinkButton.disabled = false;
  elements.toggleCookedButton.disabled = false;
  elements.toggleCookedButton.classList.toggle("is-cooked", cooked);
  elements.toggleCookedButton.textContent = cooked ? "取消已做" : "标记已做";

  renderThumbStrip();
  updateHash();

  if (forceImageUpdate || elements.recipeImage.dataset.src !== item.src) {
    loadCurrentImage(item);
  }

  preloadNearbyImages();
}

function loadCurrentImage(item) {
  elements.recipeImage.dataset.src = item.src;
  elements.recipeImage.alt = `${item.title}，第 ${state.currentIndex + 1} 张`;
  elements.imageStage.classList.add("is-loading");
  elements.recipeImage.hidden = true;
  elements.imageError.hidden = true;
  showPlaceholder(`正在载入 ${item.title}`, "如果图片较大，请稍等片刻。");
  elements.recipeImage.src = item.src;
}

function handleImageLoad() {
  elements.imageStage.classList.remove("is-loading");
  elements.imagePlaceholder.hidden = true;
  elements.imageError.hidden = true;
  elements.recipeImage.hidden = false;
}

function handleImageError() {
  elements.imageStage.classList.remove("is-loading");
  elements.recipeImage.hidden = true;
  elements.imagePlaceholder.hidden = true;
  elements.imageError.hidden = false;
}

function goToIndex(index) {
  if (state.items.length === 0) {
    return;
  }

  const nextIndex = clamp(index, 0, state.items.length - 1);
  if (nextIndex === state.currentIndex) {
    return;
  }

  state.currentIndex = nextIndex;
  renderCurrent(true);
}

function toggleCookedState() {
  const item = getCurrentItem();
  if (!item) {
    return;
  }

  const nextValue = !isCooked(item);
  if (nextValue) {
    state.cookedMap[item.src] = true;
  } else {
    delete state.cookedMap[item.src];
  }

  persistCookedMap();
  renderCurrent();
  showToast(nextValue ? "已标记为已做。" : "已取消已做标记。");
}

function jumpToNextUncooked() {
  if (state.items.length === 0) {
    return;
  }

  const total = state.items.length;

  for (let step = 1; step <= total; step += 1) {
    const candidateIndex = (state.currentIndex + step) % total;
    if (!isCooked(state.items[candidateIndex])) {
      goToIndex(candidateIndex);
      return;
    }
  }

  showToast("当前所有食谱都已经标记完成。");
}

function renderThumbStrip() {
  const total = state.items.length;
  const before = Math.floor((THUMB_WINDOW - 1) / 2);
  const start = clamp(state.currentIndex - before, 0, Math.max(total - THUMB_WINDOW, 0));
  const end = Math.min(start + THUMB_WINDOW, total);
  const fragment = document.createDocumentFragment();

  for (let index = start; index < end; index += 1) {
    const item = state.items[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "thumb-button";
    button.classList.add(isCooked(item) ? "is-cooked" : "is-uncooked");

    if (index === state.currentIndex) {
      button.classList.add("is-current");
    }

    const image = document.createElement("img");
    image.src = item.src;
    image.alt = "";
    image.loading = "lazy";

    const label = document.createElement("span");
    label.textContent = `${index + 1}. ${item.title}`;

    button.append(image, label);
    button.addEventListener("click", () => goToIndex(index));
    fragment.append(button);
  }

  elements.thumbStrip.replaceChildren(fragment);
  elements.thumbRangeLabel.textContent = `${start + 1}-${end}`;
}

function handleKeydown(event) {
  const tagName = event.target?.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA") {
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    goToIndex(state.currentIndex - 1);
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    goToIndex(state.currentIndex + 1);
  }

  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    toggleCookedState();
  }
}

function handleHashChange() {
  if (state.ignoreHashChange || state.items.length === 0) {
    return;
  }

  const index = clamp(getIndexFromHash(), 0, state.items.length - 1);
  if (index !== state.currentIndex) {
    state.currentIndex = index;
    renderCurrent(true);
  }
}

function updateHash() {
  const hashValue = `#${state.currentIndex + 1}`;
  if (window.location.hash === hashValue) {
    return;
  }

  try {
    state.ignoreHashChange = true;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hashValue}`);
    window.setTimeout(() => {
      state.ignoreHashChange = false;
    }, 0);
  } catch (error) {
    state.ignoreHashChange = false;
  }
}

function getIndexFromHash() {
  const value = Number.parseInt(window.location.hash.replace("#", ""), 10);
  if (Number.isNaN(value) || value < 1) {
    return 0;
  }

  return value - 1;
}

function handleStagePointerDown(event) {
  state.swipeStart = {
    x: event.clientX,
    y: event.clientY,
  };
}

function handleStagePointerUp(event) {
  if (!state.swipeStart) {
    return;
  }

  const deltaX = event.clientX - state.swipeStart.x;
  const deltaY = event.clientY - state.swipeStart.y;
  resetSwipeStart();

  if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) {
    return;
  }

  if (deltaX < 0) {
    goToIndex(state.currentIndex + 1);
    return;
  }

  goToIndex(state.currentIndex - 1);
}

function resetSwipeStart() {
  state.swipeStart = null;
}

function preloadNearbyImages() {
  const candidateIndexes = [state.currentIndex - 1, state.currentIndex + 1];

  candidateIndexes.forEach((index) => {
    if (index < 0 || index >= state.items.length) {
      return;
    }

    const image = new Image();
    image.src = state.items[index].src;
  });
}

async function copyCurrentLink() {
  const url = window.location.href;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
    } else {
      fallbackCopy(url);
    }

    showToast("当前图片链接已复制。");
  } catch (error) {
    showToast("复制失败，请手动复制地址栏链接。");
  }
}

function fallbackCopy(text) {
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function showPlaceholder(title, hint) {
  elements.imagePlaceholder.hidden = false;
  elements.imagePlaceholder.replaceChildren();

  const strong = document.createElement("strong");
  strong.textContent = title;

  const span = document.createElement("span");
  span.textContent = hint;

  elements.imagePlaceholder.append(strong, span);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 1800);
}

function getCurrentItem() {
  return state.items[state.currentIndex] ?? null;
}

function isCooked(item) {
  return Boolean(item && state.cookedMap[item.src]);
}

function getDoneCount() {
  return state.items.reduce((count, item) => count + (isCooked(item) ? 1 : 0), 0);
}

function loadCookedMap() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function persistCookedMap() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cookedMap));
  } catch (error) {
    showToast("当前浏览器阻止了本地存储，标记可能不会被保存。");
  }
}

function deriveTitle(filePath) {
  return getFileName(filePath)
    .replace(/\.[^.]+$/i, "")
    .replace(/@\d+w$/i, "")
    .replace(/\.(png|jpe?g|webp|avif|gif)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function getFileName(filePath) {
  return filePath.split("/").pop() ?? filePath;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}
