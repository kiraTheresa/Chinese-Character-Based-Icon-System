(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const input = $('character');
  const stage = $('preview-stage');
  const mount = $('preview-mount');
  const placeholder = $('preview-placeholder');
  const message = $('preview-message');
  const hint = $('input-hint');
  const retry = $('retry-font');
  const status = $('status');
  const pngButton = $('download-png');
  const svgButton = $('download-svg');
  const minis = ['mini-32', 'mini-48', 'mini-64'].map($);
  const fontPromises = new Map();
  const fontFiles = {
    simplified: './assets/fonts/SourceHanSansSC-Medium.otf',
    traditional: './assets/fonts/SourceHanSansTC-Medium.otf',
  };
  const hanCharacter = /^[\p{Unified_Ideograph}\u3007]$/u;
  let renderVersion = 0;
  let composing = false;
  let exporting = false;
  let currentIcon = null;
  let toSimplified;
  let toTraditional;

  function updateExportButtons() {
    const disabled = !currentIcon || composing || exporting;
    pngButton.disabled = disabled;
    svgButton.disabled = disabled;
  }

  function announce(text, isError = false) {
    status.textContent = text;
    status.classList.toggle('error', isError);
  }

  function clearPreview(text, { loading = false, retryable = false } = {}) {
    currentIcon = null;
    updateExportButtons();
    stage.setAttribute('aria-busy', String(loading));
    mount.replaceChildren();
    minis.forEach((mini) => mini.replaceChildren());
    placeholder.hidden = false;
    message.textContent = text;
    retry.hidden = !retryable;
    $('output-character').textContent = '—';
  }

  async function loadFont(script) {
    if (!fontPromises.has(script)) {
      const promise = (async () => {
        const response = await fetch(fontFiles[script]);
        if (!response.ok) throw new Error(`Font HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        return window.opentype.parse(buffer);
      })().catch((error) => {
        fontPromises.delete(script);
        throw error;
      });
      fontPromises.set(script, promise);
    }
    return fontPromises.get(script);
  }

  function escapeXml(value) {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
  }

  function makeSvg(font, character, shape) {
    const glyphIndex = font.charToGlyphIndex(character);
    if (glyphIndex === 0) return null;
    const glyph = font.glyphs.get(glyphIndex);
    // Use the same em size for every character. A short glyph such as 一 must
    // retain its proportions instead of being stretched to fill a square.
    let glyphPath = glyph.getPath(0, 0, 288);
    let bounds = glyphPath.getBoundingBox();
    const longestSide = Math.max(bounds.x2 - bounds.x1, bounds.y2 - bounds.y1);
    if (!Number.isFinite(longestSide) || longestSide <= 0 || !glyphPath.commands.length) return null;
    if (longestSide > 288) {
      glyphPath = glyph.getPath(0, 0, 288 * 288 / longestSide);
      bounds = glyphPath.getBoundingBox();
    }
    const x = (256 - (bounds.x1 + bounds.x2) / 2).toFixed(3);
    const y = (256 - (bounds.y1 + bounds.y2) / 2).toFixed(3);
    const frame = shape === 'circle'
      ? '<circle cx="256" cy="256" r="220" fill="none" stroke="#292925" stroke-width="9" />'
      : '<rect x="36" y="36" width="440" height="440" rx="10" fill="none" stroke="#292925" stroke-width="9" />';
    const title = escapeXml(`汉字「${character}」${shape === 'circle' ? '圆形' : '方形'}图标`);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="${title}"><title>${title}</title>${frame}<path d="${glyphPath.toPathData(3)}" transform="translate(${x} ${y})" fill="#292925" /></svg>`;
  }

  async function render() {
    const version = ++renderVersion;
    const raw = input.value.trim();
    const script = document.querySelector('input[name="script"]:checked').value;
    const shape = document.querySelector('input[name="shape"]:checked').value;
    const scriptName = script === 'simplified' ? '简体' : '繁体';
    $('character-count').textContent = `${Array.from(raw).length} 个字`;
    $('output-description').textContent = `${scriptName} · ${shape === 'circle' ? '圆形' : '方形'}`;
    $('variant-note').setAttribute('aria-hidden', String(script !== 'traditional'));
    document.querySelectorAll('[data-character]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.character === raw);
    });
    announce('');

    if (!hanCharacter.test(raw)) {
      const explanation = !raw ? '输入一个你喜欢的汉字' : '请输入一个汉字，不含数字、符号或多个字';
      input.setAttribute('aria-invalid', String(Boolean(raw)));
      hint.textContent = explanation;
      hint.classList.toggle('error', Boolean(raw));
      $('conversion-note').textContent = '选择图标使用的字形';
      clearPreview(!raw ? '写下一个字，图标就从这里开始' : '等待一个有效的汉字');
      if (raw) announce(explanation, true);
      return;
    }

    input.setAttribute('aria-invalid', 'false');
    hint.textContent = '输入一个你喜欢的汉字';
    hint.classList.remove('error');

    try {
      const character = script === 'simplified' ? toSimplified(raw) : toTraditional(raw);
      if (!hanCharacter.test(character)) throw new Error('Conversion did not return one Han character');
      $('conversion-note').textContent = raw === character ? `保留${scriptName}字形「${character}」` : `${raw} → ${character}，已转换为${scriptName}`;
      clearPreview(`正在准备${scriptName}字体…`, { loading: true });
      const font = await loadFont(script);
      if (version !== renderVersion || composing) return;
      const svg = makeSvg(font, character, shape);
      if (!svg) {
        clearPreview('当前字体暂不支持这个字，请试试其他汉字');
        announce('当前字体缺少这个汉字，暂时无法导出。', true);
        return;
      }
      currentIcon = { svg, character, shape };
      mount.innerHTML = svg;
      minis.forEach((mini) => { mini.innerHTML = svg; });
      placeholder.hidden = true;
      retry.hidden = true;
      stage.setAttribute('aria-busy', 'false');
      $('output-character').textContent = character;
      updateExportButtons();
    } catch (error) {
      if (version !== renderVersion) return;
      console.error('Icon generation failed:', error);
      clearPreview('字体加载失败，请重新加载', { retryable: true });
      announce('字体暂时无法加载，请确认本地服务正在运行。', true);
    }
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function pngFromSvg(svg) {
    const sourceUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('SVG image could not load'));
        image.src = sourceUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable');
      context.clearRect(0, 0, 512, 512);
      context.drawImage(image, 0, 0, 512, 512);
      return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png');
      });
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }

  async function download(format) {
    if (!currentIcon || exporting || composing) return;
    const snapshot = currentIcon;
    exporting = true;
    updateExportButtons();
    announce(`正在导出 ${format.toUpperCase()}…`);
    try {
      const blob = format === 'svg'
        ? new Blob([snapshot.svg], { type: 'image/svg+xml;charset=utf-8' })
        : await pngFromSvg(snapshot.svg);
      const shapeName = snapshot.shape === 'circle' ? '圆形' : '方形';
      saveBlob(blob, `${snapshot.character}-${shapeName}${format === 'png' ? '-512' : ''}.${format}`);
      announce(`「${snapshot.character}」${format.toUpperCase()} 下载已开始`);
    } catch (error) {
      console.error('Icon export failed:', error);
      announce(`${format.toUpperCase()} 导出失败，请重试${format === 'png' ? '，或先下载 SVG' : ''}。`, true);
    } finally {
      exporting = false;
      updateExportButtons();
    }
  }

  if (!window.opentype || !window.OpenCC) {
    clearPreview('页面资源加载失败，请刷新页面');
    announce('未能加载图标工具，请确认 assets 文件夹完整。', true);
    return;
  }

  toSimplified = window.OpenCC.Converter({ from: 'tw', to: 'cn' });
  toTraditional = window.OpenCC.Converter({ from: 'cn', to: 'tw' });

  input.addEventListener('compositionstart', () => {
    composing = true;
    renderVersion += 1;
    clearPreview('正在输入汉字…');
  });
  input.addEventListener('compositionend', () => { composing = false; render(); });
  input.addEventListener('input', () => { if (!composing) render(); });
  document.querySelectorAll('input[type="radio"]').forEach((radio) => radio.addEventListener('change', () => { if (!composing) render(); }));
  document.querySelectorAll('[data-character]').forEach((button) => {
    button.addEventListener('click', () => {
      composing = false;
      input.value = button.dataset.character;
      render();
    });
  });
  retry.addEventListener('click', render);
  pngButton.addEventListener('click', () => download('png'));
  svgButton.addEventListener('click', () => download('svg'));
  render();
})();
