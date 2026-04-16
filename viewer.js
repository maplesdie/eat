const STORAGE_KEY = `cookbook-progress-v1::${window.location.pathname}`;

const state = {
  items: [],
  currentIndex: 0,
  cookedMap: loadCookedMap(),
  toastTimer: null,
  ignoreHashChange: false,
  overviewOpen: false,
  swipeStart: null,
};

const elements = {
  doneMetric: document.getElementById("doneMetric"),
  progressText: document.getElementById("progressText"),
  recipeTitle: document.getElementById("recipeTitle"),
  recipeCounter: document.getElementById("recipeCounter"),
  imageStage: document.getElementById("imageStage"),
  imagePlaceholder: document.getElementById("imagePlaceholder"),
  recipeImage: document.getElementById("recipeImage"),
  recipeFileName: document.getElementById("recipeFileName"),
  recipeHint: document.getElementById("recipeHint"),
  prevButton: document.getElementById("prevButton"),
  nextButton: document.getElementById("nextButton"),
  toggleCookedButton: document.getElementById("toggleCookedButton"),
  overviewButton: document.getElementById("overviewButton"),
  overviewModal: document.getElementById("overviewModal"),
  overviewBackdrop: document.getElementById("overviewBackdrop"),
  overviewGrid: document.getElementById("overviewGrid"),
  overviewCloseButton: document.getElementById("overviewCloseButton"),
  overviewStats: document.getElementById("overviewStats"),
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
  elements.overviewButton.addEventListener("click", toggleOverview);
  elements.overviewCloseButton.addEventListener("click", closeOverview);
  elements.overviewBackdrop.addEventListener("click", closeOverview);

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
  elements.recipeFileName.textContent = "请先准备图片清单";
  elements.recipeHint.textContent = "把图片放进 recipes、images 或 gallery 目录，然后运行一次清单生成脚本。";
  elements.doneMetric.textContent = "0 / 0";
  elements.progressText.textContent = "当前 recipes-manifest.js 里没有图片。";
  elements.prevButton.disabled = true;
  elements.nextButton.disabled = true;
  elements.toggleCookedButton.disabled = true;
  elements.overviewButton.disabled = true;
  elements.overviewButton.setAttribute("aria-expanded", "false");
  elements.toggleCookedButton.classList.remove("is-cooked");
  elements.toggleCookedButton.setAttribute("aria-pressed", "false");
  elements.overviewStats.textContent = "当前没有可跳转的食谱。";
  elements.overviewGrid.replaceChildren();
  closeOverview();
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

  elements.recipeTitle.textContent = item.title;
  elements.recipeCounter.textContent = `${state.currentIndex + 1} / ${state.items.length}`;
  elements.recipeFileName.textContent = item.fileName;
  elements.recipeHint.textContent = cooked
    ? "这道已经被标记为已烹饪，可以继续浏览下一道。"
    : "这道还没做，做完后点“标记已做”就能记录状态，也可以打开总览快速跳转。";

  elements.doneMetric.textContent = `${doneCount} / ${state.items.length}`;
  elements.progressText.textContent = `还剩 ${state.items.length - doneCount} 张未做。`;

  elements.prevButton.disabled = state.currentIndex <= 0;
  elements.nextButton.disabled = state.currentIndex >= state.items.length - 1;
  elements.toggleCookedButton.disabled = false;
  elements.overviewButton.disabled = false;
  elements.toggleCookedButton.classList.toggle("is-cooked", cooked);
  elements.toggleCookedButton.setAttribute("aria-pressed", cooked ? "true" : "false");
  elements.toggleCookedButton.setAttribute("title", cooked ? "取消已做" : "标记已做");
  elements.overviewButton.setAttribute("title", `打开总览，快速跳到第 ${state.currentIndex + 1} 张附近`);
  updateHash();
  renderOverview();

  if (forceImageUpdate || elements.recipeImage.dataset.src !== item.src) {
    loadCurrentImage(item);
  }

  preloadNearbyImages();
}

function loadCurrentImage(item) {
  elements.recipeImage.dataset.src = item.src;
  elements.recipeImage.alt = `${item.title}，第 ${state.currentIndex + 1} 张`;
  elements.imageStage.classList.add("is-loading");
  elements.imageStage.classList.remove("is-portrait", "is-landscape", "is-square");
  elements.recipeImage.hidden = true;
  showPlaceholder(`正在载入 ${item.title}`, "如果图片较大，请稍等片刻。");
  elements.recipeImage.src = item.src;
}

function handleImageLoad() {
  const { naturalWidth, naturalHeight } = elements.recipeImage;
  const ratio = naturalHeight / Math.max(naturalWidth, 1);

  elements.imageStage.classList.remove("is-loading");
  elements.imageStage.classList.toggle("is-portrait", ratio > 1.2);
  elements.imageStage.classList.toggle("is-landscape", ratio < 0.85);
  elements.imageStage.classList.toggle("is-square", ratio >= 0.85 && ratio <= 1.2);
  elements.imagePlaceholder.hidden = true;
  elements.recipeImage.hidden = false;
}

function handleImageError() {
  elements.imageStage.classList.remove("is-loading");
  elements.imageStage.classList.remove("is-portrait", "is-landscape", "is-square");
  elements.recipeImage.hidden = true;
  elements.imagePlaceholder.hidden = true;
  showToast("当前图片暂时无法显示，请切换下一张。");
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

function toggleOverview() {
  if (state.items.length === 0) {
    return;
  }

  if (state.overviewOpen) {
    closeOverview();
    return;
  }

  openOverview();
}

function openOverview() {
  if (state.items.length === 0) {
    return;
  }

  state.overviewOpen = true;
  renderOverview();
  elements.overviewModal.hidden = false;
  elements.overviewButton.setAttribute("aria-expanded", "true");
  document.body.classList.add("is-modal-open");
}

function closeOverview() {
  state.overviewOpen = false;
  elements.overviewModal.hidden = true;
  elements.overviewButton.setAttribute("aria-expanded", "false");
  document.body.classList.remove("is-modal-open");
}

function renderOverview() {
  const total = state.items.length;
  const doneCount = getDoneCount();
  const fragment = document.createDocumentFragment();

  elements.overviewStats.textContent =
    total > 0 ? `已完成 ${doneCount} / ${total}，点击数字可以直接跳转。` : "当前没有可跳转的食谱。";

  for (let index = 0; index < total; index += 1) {
    const item = state.items[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "overview-grid__item";
    button.textContent = String(index + 1);
    button.setAttribute("aria-label", `跳转到第 ${index + 1} 张食谱`);

    if (isCooked(item)) {
      button.classList.add("is-cooked");
    }

    if (index === state.currentIndex) {
      button.classList.add("is-current");
    }

    button.addEventListener("click", () => {
      closeOverview();
      goToIndex(index);
    });

    fragment.append(button);
  }

  elements.overviewGrid.replaceChildren(fragment);
}

function handleKeydown(event) {
  const tagName = event.target?.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA") {
    return;
  }

  if (event.key === "Escape" && state.overviewOpen) {
    event.preventDefault();
    closeOverview();
    return;
  }

  if (state.overviewOpen) {
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
