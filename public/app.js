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
  const svgDropdown = $('svg-download');
  const svgMenu = $('svg-size-menu');
  const svgMenuItems = Array.from(svgMenu.querySelectorAll('[data-svg-size]'));
  const svgSizes = [32, 64, 128, 256, 512];
  const minis = ['mini-32', 'mini-48', 'mini-64'].map($);
  const fontPromises = new Map();
  const fontFiles = {
    simplified: './assets/fonts/SourceHanSansSC-Medium.otf',
    traditional: './assets/fonts/SourceHanSansTC-Medium.otf',
  };
  const hanCharacter = /^[\p{Unified_Ideograph}\u3007]$/u;
  const defaultInputHint = '支持汉字、数字、字母和常见符号';
  const letterCharacters = {
    a: '啊', b: '波', c: '春', d: '东', e: '鹅', f: '风', g: '光',
    h: '花', i: '爱', j: '江', k: '空', l: '林', m: '木', n: '南',
    o: '哦', p: '平', q: '清', r: '日', s: '山', t: '天', u: '优',
    v: '维', w: '文', x: '星', y: '月', z: '竹',
  };
  const digitCharacters = '零一二三四五六七八九';
  const symbolCharacters = new Map();
  const symbolGroups = [
    [',，', '逗'], ['.。', '句'], ['、', '顿'], [';；', '分'], [':：', '冒'],
    ['?？', '问'], ['!！', '叹'], ['…⋯', '省'], ['·•', '点'],
    ["'\"‘’“”`", '引'], ['()[]{}（）【】〔〕「」『』', '括'],
    ['<>〈〉', '尖'], ['《》', '书'], ['-—–', '横'], ['_', '划'],
    ['+', '加'], ['=', '等'], ['*', '星'], ['×', '乘'], ['÷', '除'],
    ['/', '斜'], ['\\', '反'], ['|', '竖'], ['~～', '波'],
    ['@', '圈'], ['#', '井'], ['&', '和'], ['%', '百'], ['^', '幂'],
    ['$¥￥€£₩₽', '币'], ['±', '差'], ['≤', '小'], ['≥', '大'],
    ['≠', '异'], ['≈', '约'], ['°', '度'], ['℃', '温'], ['§', '节'],
  ];
  for (const [symbols, character] of symbolGroups) {
    for (const symbol of symbols) symbolCharacters.set(symbol, character);
  }
  const graphemeSegmenter = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('zh', { granularity: 'grapheme' })
    : null;
  let renderVersion = 0;
  let composing = false;
  let exporting = false;
  let currentIcon = null;
  let toSimplified;
  let toTraditional;
  let lastCommittedInput = input.value;
  let inputNote = defaultInputHint;

  function normalizeInput(value) {
    const text = value.trim();
    if (!text) return { value: '', note: defaultInputHint };
    // Read a whole grapheme: a keycap emoji or an accented letter must not be
    // mistaken for its leading ASCII digit/letter. Only explicit mappings pass.
    const first = graphemeSegmenter
      ? graphemeSegmenter.segment(text)[Symbol.iterator]().next().value.segment
      : text.match(/^.\p{Mark}*/u)[0];
    const normalized = /^[\uFF01-\uFF5E]$/u.test(first)
      ? String.fromCharCode(first.charCodeAt(0) - 0xFEE0)
      : first;
    let character = null;
    if (hanCharacter.test(normalized)) character = normalized;
    else if (/^[0-9]$/.test(normalized)) character = digitCharacters[Number(normalized)];
    else if (/^[a-z]$/i.test(normalized)) character = letterCharacters[normalized.toLowerCase()];
    else character = symbolCharacters.get(normalized);

    if (!character) return { value: first, note: '' };
    const truncated = first.length < text.length;
    const note = first !== character
      ? `${truncated ? '取首字：' : ''}${first} → ${character}`
      : truncated ? `已保留首字「${character}」` : defaultInputHint;
    return { value: character, note };
  }

  function commitInput() {
    // Some IMEs emit input again after compositionend. Preserve the feedback
    // from that committed conversion instead of treating it as another edit.
    if (input.value !== lastCommittedInput) {
      const normalized = normalizeInput(input.value);
      input.value = normalized.value;
      lastCommittedInput = normalized.value;
      inputNote = normalized.note;
    }
    render();
  }

  function closeSvgMenu(restoreFocus = false) {
    if (svgMenu.hidden) return;
    svgMenu.hidden = true;
    svgButton.setAttribute('aria-expanded', 'false');
    if (restoreFocus && !svgButton.disabled) svgButton.focus();
  }

  function positionSvgMenu() {
    const bounds = svgButton.getBoundingClientRect();
    const below = window.innerHeight - bounds.bottom - 16;
    const above = bounds.top - 16;
    const openAbove = below < svgMenu.scrollHeight && above > below;
    svgMenu.dataset.placement = openAbove ? 'top' : 'bottom';
    svgMenu.style.maxHeight = `${Math.max(80, Math.min(330, openAbove ? above : below))}px`;
  }

  function openSvgMenu(focusLast = false) {
    if (svgButton.disabled) return;
    svgMenu.hidden = false;
    svgButton.setAttribute('aria-expanded', 'true');
    positionSvgMenu();
    svgMenuItems[focusLast ? svgMenuItems.length - 1 : 0].focus();
  }

  function updateExportButtons() {
    const disabled = !currentIcon || composing || exporting;
    pngButton.disabled = disabled;
    svgButton.disabled = disabled;
    if (disabled) closeSvgMenu();
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
    $('character-count').textContent = hanCharacter.test(raw) ? '1 个字' : raw ? '不支持' : '0 个字';
    $('output-description').textContent = `${scriptName} · ${shape === 'circle' ? '圆形' : '方形'}`;
    $('variant-note').setAttribute('aria-hidden', String(script !== 'traditional'));
    document.querySelectorAll('[data-character]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.character === raw);
    });
    announce('');

    if (!hanCharacter.test(raw)) {
      const explanation = !raw ? defaultInputHint : '输入不合法：不支持这个字符';
      input.setAttribute('aria-invalid', String(Boolean(raw)));
      hint.textContent = explanation;
      hint.classList.toggle('error', Boolean(raw));
      $('conversion-note').textContent = '选择图标使用的字形';
      clearPreview(!raw ? '写下一个字，图标就从这里开始' : '等待一个有效的汉字');
      if (raw) announce(explanation, true);
      return;
    }

    input.setAttribute('aria-invalid', 'false');
    hint.textContent = inputNote;
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

  function svgAtSize(svg, size) {
    if (!svgSizes.includes(size)) throw new Error('Unsupported SVG size');
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    if (document.querySelector('parsererror')) throw new Error('Invalid SVG');
    const root = document.documentElement;
    root.setAttribute('width', String(size));
    root.setAttribute('height', String(size));
    // Keep the viewBox unchanged so the frame, padding and glyph scale together.
    return new XMLSerializer().serializeToString(root);
  }

  function svgDownload(snapshot, size) {
    const shapeName = snapshot.shape === 'circle' ? '圆形' : '方形';
    const basename = `${snapshot.character}-${shapeName}`;
    if (size === 'all') {
      if (!window.fflate) throw new Error('ZIP library is unavailable');
      const files = {};
      for (const dimension of svgSizes) {
        files[`${basename}-${dimension}.svg`] = window.fflate.strToU8(svgAtSize(snapshot.svg, dimension));
      }
      return {
        blob: new Blob([window.fflate.zipSync(files, { level: 6 })], { type: 'application/zip' }),
        filename: `${basename}-全部尺寸.zip`,
      };
    }
    return {
      blob: new Blob([svgAtSize(snapshot.svg, size)], { type: 'image/svg+xml;charset=utf-8' }),
      filename: `${basename}-${size}.svg`,
    };
  }

  async function download(format, size = 512) {
    if (!currentIcon || exporting || composing) return;
    if (format === 'svg' && size !== 'all' && !svgSizes.includes(size)) return;
    const snapshot = currentIcon;
    closeSvgMenu(true);
    exporting = true;
    updateExportButtons();
    const label = format === 'svg' && size === 'all' ? 'SVG 全部尺寸' : format.toUpperCase();
    announce(`正在导出 ${label}…`);
    try {
      if (format === 'svg') {
        const result = svgDownload(snapshot, size);
        saveBlob(result.blob, result.filename);
      } else {
        const blob = await pngFromSvg(snapshot.svg);
        const shapeName = snapshot.shape === 'circle' ? '圆形' : '方形';
        saveBlob(blob, `${snapshot.character}-${shapeName}-512.png`);
      }
      announce(`「${snapshot.character}」${label} 下载已开始`);
    } catch (error) {
      console.error('Icon export failed:', error);
      announce(`${label} 导出失败，请重试${format === 'png' ? '，或先下载 SVG' : ''}。`, true);
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
  input.addEventListener('compositionend', () => { composing = false; commitInput(); });
  input.addEventListener('input', (event) => { if (!composing && !event.isComposing) commitInput(); });
  input.addEventListener('focus', () => input.select());
  document.querySelectorAll('input[type="radio"]').forEach((radio) => radio.addEventListener('change', () => { if (!composing) render(); }));
  document.querySelectorAll('[data-character]').forEach((button) => {
    button.addEventListener('click', () => {
      composing = false;
      input.value = button.dataset.character;
      lastCommittedInput = input.value;
      inputNote = defaultInputHint;
      render();
    });
  });
  retry.addEventListener('click', render);
  pngButton.addEventListener('click', () => download('png'));
  svgButton.addEventListener('click', () => svgMenu.hidden ? openSvgMenu() : closeSvgMenu(true));
  svgButton.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openSvgMenu(event.key === 'ArrowUp');
    }
  });
  svgMenuItems.forEach((button) => {
    button.addEventListener('click', () => download('svg', button.dataset.svgSize === 'all' ? 'all' : Number(button.dataset.svgSize)));
  });
  svgMenu.addEventListener('keydown', (event) => {
    const current = svgMenuItems.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = (current + 1) % svgMenuItems.length;
    else if (event.key === 'ArrowUp') next = (current - 1 + svgMenuItems.length) % svgMenuItems.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = svgMenuItems.length - 1;
    else if (event.key === 'Escape') {
      event.preventDefault();
      closeSvgMenu(true);
    } else if (event.key === 'Tab') closeSvgMenu(true);
    if (next !== undefined) {
      event.preventDefault();
      svgMenuItems[next].focus();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!svgDropdown.contains(event.target)) closeSvgMenu();
  });
  svgDropdown.addEventListener('focusout', (event) => {
    if (!svgDropdown.contains(event.relatedTarget)) closeSvgMenu();
  });
  window.addEventListener('resize', () => { if (!svgMenu.hidden) positionSvgMenu(); });
  render();
})();
