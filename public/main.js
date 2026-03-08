const API_BASE = '';

function $(id) {
  return document.getElementById(id);
}

const authSection = $('auth-section');
const mainSection = $('main-section');
const authError = $('auth-error');

const tabLogin = $('tab-login');
const tabRegister = $('tab-register');
const loginForm = $('login-form');
const registerForm = $('register-form');

const logoutBtn = $('logout-btn');
const userEmailSpan = $('user-email');

const healthForm = $('health-form');
const analyzeBtn = $('analyze-btn');
const healthSavedHint = $('health-saved-hint');

const aiOutput = $('ai-output');
const aiStatus = $('ai-status');
const aiClearBtn = $('ai-clear');

const foodImageInput = $('food-image-input');
const foodPreview = $('food-preview');
const imageViewer = $('image-viewer');
const imageViewerHint = $('image-viewer-hint');
const foodAnalyzeBtn = $('food-analyze-btn');
const foodResetViewBtn = $('food-reset-view');

const historyLoadBtn = $('history-load-btn');
const historyListEl = $('history-list');

let token = localStorage.getItem('chilema_token') || '';

function setAuthToken(newToken, user) {
  token = newToken;
  if (token) {
    localStorage.setItem('chilema_token', token);
  } else {
    localStorage.removeItem('chilema_token');
  }
  updateAuthUi(!!token, user);
}

function updateAuthUi(isLoggedIn, user) {
  if (isLoggedIn) {
    authSection.classList.add('hidden');
    mainSection.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    userEmailSpan.textContent = user?.email || '';
  } else {
    authSection.classList.remove('hidden');
    mainSection.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    userEmailSpan.textContent = '';
  }
}

function showAuthError(msg) {
  authError.textContent = msg || '';
}

async function apiFetch(path, options = {}) {
  const headers = Object.assign(
    {
      'Content-Type': 'application/json'
    },
    options.headers || {}
  );

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(API_BASE + path, {
    ...options,
    headers
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || res.statusText || '请求失败';
    throw new Error(msg);
  }

  return data;
}

tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  showAuthError('');
});

tabRegister.addEventListener('click', () => {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
  showAuthError('');
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showAuthError('');

  const email = $('login-email').value.trim();
  const password = $('login-password').value;

  if (!email || !password) {
    showAuthError('请输入邮箱和密码');
    return;
  }

  try {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    setAuthToken(data.token, data.user);
    await fetchProfileAndFillForm();
  } catch (err) {
    showAuthError(err.message || '登录失败，请稍后重试');
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showAuthError('');

  const name = $('register-name').value.trim();
  const email = $('register-email').value.trim();
  const password = $('register-password').value;

  if (!email || !password) {
    showAuthError('请输入邮箱和密码');
    return;
  }

  try {
    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
    setAuthToken(data.token, data.user);
    await fetchProfileAndFillForm();
  } catch (err) {
    showAuthError(err.message || '注册失败，请稍后重试');
  }
});

logoutBtn.addEventListener('click', () => {
  setAuthToken('', null);
  aiOutput.textContent = '';
  aiStatus.textContent = '';
});

healthForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  healthSavedHint.textContent = '';

  const height_cm = $('height').value ? Number($('height').value) : null;
  const weight_kg = $('weight').value ? Number($('weight').value) : null;
  const diseases = $('diseases').value.trim();
  const allergies = $('allergies').value.trim();
  const lifestyle = $('lifestyle').value.trim();

  try {
    await apiFetch('/api/health', {
      method: 'POST',
      body: JSON.stringify({
        height_cm,
        weight_kg,
        diseases,
        allergies,
        lifestyle
      })
    });
    healthSavedHint.textContent = '健康档案已保存 ✔';
  } catch (err) {
    healthSavedHint.textContent = '保存失败：' + (err.message || '请稍后重试');
  }
});

async function fetchProfileAndFillForm() {
  if (!token) return;
  try {
    const data = await apiFetch('/api/me', {
      method: 'GET'
    });

    const profile = data.profile;
    if (profile) {
      $('height').value = profile.height_cm ?? '';
      $('weight').value = profile.weight_kg ?? '';
      $('diseases').value = profile.diseases || '';
      $('allergies').value = profile.allergies || '';
      $('lifestyle').value = profile.lifestyle || '';
      healthSavedHint.textContent = profile.updated_at
        ? '已加载最近一次保存的健康档案'
        : '';
    }
  } catch (err) {
    console.warn('获取健康档案失败', err);
  }
}

async function analyzeWithStreaming() {
  if (!token) {
    aiStatus.textContent = '请先登录';
    return;
  }

  aiOutput.textContent = '';
  aiStatus.textContent = '正在调用 AI 分析中，请稍候...';

  const height_cm = $('height').value ? Number($('height').value) : null;
  const weight_kg = $('weight').value ? Number($('weight').value) : null;
  const diseases = $('diseases').value.trim();
  const allergies = $('allergies').value.trim();
  const lifestyle = $('lifestyle').value.trim();

  try {
    const res = await fetch(API_BASE + '/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        height_cm,
        weight_kg,
        diseases,
        allergies,
        lifestyle
      })
    });

    if (!res.ok || !res.body) {
      const msg = await res.text();
      throw new Error(msg || 'AI 分析请求失败');
    }

    aiStatus.textContent = 'AI 正在生成建议...';

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let done = false;

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      if (value) {
        const chunk = decoder.decode(value, { stream: !done });
        aiOutput.textContent += chunk;
        aiOutput.scrollTop = aiOutput.scrollHeight;
      }
    }

    aiStatus.textContent = '生成完成 ✅';
    loadHistory();
  } catch (err) {
    console.error(err);
    aiStatus.textContent = '分析失败：' + (err.message || '请稍后重试');
  }
}

analyzeBtn.addEventListener('click', () => {
  analyzeWithStreaming();
});

aiClearBtn.addEventListener('click', () => {
  aiOutput.textContent = '';
  aiStatus.textContent = '';
});

// ===== 图片预览：缩放/拖拽（支持鼠标滚轮 & 触摸双指缩放）=====
const viewState = {
  scale: 1,
  minScale: 1,
  maxScale: 6,
  tx: 0,
  ty: 0,
  dragging: false,
  lastX: 0,
  lastY: 0,
  pointers: new Map(),
  lastPinchDist: 0,
  lastPinchCenter: null
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function applyTransform() {
  if (!foodPreview) return;
  // 基于中心点（50%,50%）平移 + 缩放
  foodPreview.style.transform = `translate(calc(-50% + ${viewState.tx}px), calc(-50% + ${viewState.ty}px)) scale(${viewState.scale})`;
}

function resetView() {
  viewState.scale = 1;
  viewState.tx = 0;
  viewState.ty = 0;
  applyTransform();
}

function setHasImage(has) {
  if (!imageViewer) return;
  if (has) imageViewer.classList.add('has-image');
  else imageViewer.classList.remove('has-image');
  if (imageViewerHint) imageViewerHint.style.display = has ? 'block' : 'block';
}

function getPinchDistance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.hypot(dx, dy);
}

function getPinchCenter(p1, p2) {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

function onWheelZoom(e) {
  if (!foodPreview || foodPreview.style.display === 'none') return;
  e.preventDefault();
  const delta = -e.deltaY;
  const factor = delta > 0 ? 1.08 : 0.92;
  viewState.scale = clamp(viewState.scale * factor, viewState.minScale, viewState.maxScale);
  applyTransform();
}

if (imageViewer) {
  imageViewer.addEventListener('wheel', onWheelZoom, { passive: false });

  imageViewer.addEventListener('pointerdown', (e) => {
    if (!foodPreview || foodPreview.style.display === 'none') return;
    imageViewer.setPointerCapture(e.pointerId);
    viewState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (viewState.pointers.size === 1) {
      viewState.dragging = true;
      viewState.lastX = e.clientX;
      viewState.lastY = e.clientY;
    }

    if (viewState.pointers.size === 2) {
      const pts = Array.from(viewState.pointers.values());
      viewState.lastPinchDist = getPinchDistance(pts[0], pts[1]);
      viewState.lastPinchCenter = getPinchCenter(pts[0], pts[1]);
    }
  });

  imageViewer.addEventListener('pointermove', (e) => {
    if (!foodPreview || foodPreview.style.display === 'none') return;
    if (!viewState.pointers.has(e.pointerId)) return;
    viewState.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (viewState.pointers.size === 1 && viewState.dragging) {
      const dx = e.clientX - viewState.lastX;
      const dy = e.clientY - viewState.lastY;
      viewState.lastX = e.clientX;
      viewState.lastY = e.clientY;
      viewState.tx += dx;
      viewState.ty += dy;
      applyTransform();
    }

    if (viewState.pointers.size === 2) {
      const pts = Array.from(viewState.pointers.values());
      const dist = getPinchDistance(pts[0], pts[1]);
      const center = getPinchCenter(pts[0], pts[1]);
      if (viewState.lastPinchDist > 0) {
        const ratio = dist / viewState.lastPinchDist;
        viewState.scale = clamp(viewState.scale * ratio, viewState.minScale, viewState.maxScale);
      }

      if (viewState.lastPinchCenter) {
        viewState.tx += center.x - viewState.lastPinchCenter.x;
        viewState.ty += center.y - viewState.lastPinchCenter.y;
      }

      viewState.lastPinchDist = dist;
      viewState.lastPinchCenter = center;
      applyTransform();
    }
  });

  function endPointer(e) {
    if (viewState.pointers.has(e.pointerId)) viewState.pointers.delete(e.pointerId);
    if (viewState.pointers.size === 0) {
      viewState.dragging = false;
      viewState.lastPinchDist = 0;
      viewState.lastPinchCenter = null;
    }
    if (viewState.pointers.size === 1) {
      // 从双指回到单指：重置拖拽基点
      const p = Array.from(viewState.pointers.values())[0];
      viewState.dragging = true;
      viewState.lastX = p.x;
      viewState.lastY = p.y;
      viewState.lastPinchDist = 0;
      viewState.lastPinchCenter = null;
    }
  }

  imageViewer.addEventListener('pointerup', endPointer);
  imageViewer.addEventListener('pointercancel', endPointer);
  imageViewer.addEventListener('pointerleave', endPointer);
}

if (foodResetViewBtn) {
  foodResetViewBtn.addEventListener('click', () => resetView());
}

if (foodImageInput) {
  foodImageInput.addEventListener('change', () => {
    const file = foodImageInput.files && foodImageInput.files[0];
    if (!file) {
      if (foodPreview) foodPreview.style.display = 'none';
      setHasImage(false);
      return;
    }
    const url = URL.createObjectURL(file);
    if (foodPreview) {
      foodPreview.src = url;
      foodPreview.style.display = 'block';
      foodPreview.onload = () => {
        resetView();
        setHasImage(true);
      };
    }
  });
}

/** 将图片压缩为最长边不超过 maxSize 的 JPEG，减小上传体积、加快识别，避免超时 */
function compressImageForUpload(file, maxSize = 1024, quality = 0.82) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) {
      resolve(file);
      return;
    }
    const img = new Image();
    img.onerror = () => {
      if (img.src) URL.revokeObjectURL(img.src);
      resolve(file);
    };
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w <= maxSize && h <= maxSize) {
        if (img.src) URL.revokeObjectURL(img.src);
        resolve(file);
        return;
      }
      if (w > h) {
        h = Math.round((h * maxSize) / w);
        w = maxSize;
      } else {
        w = Math.round((w * maxSize) / h);
        h = maxSize;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        if (img.src) URL.revokeObjectURL(img.src);
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (img.src) URL.revokeObjectURL(img.src);
          resolve(blob ? new File([blob], file.name || 'food.jpg', { type: 'image/jpeg' }) : file);
        },
        'image/jpeg',
        quality
      );
    };
    img.src = URL.createObjectURL(file);
  });
}

async function foodAnalyzeWithStreaming() {
  if (!token) {
    aiStatus.textContent = '请先登录';
    return;
  }
  const file = foodImageInput?.files?.[0];
  if (!file) {
    aiStatus.textContent = '请先选择/拍照一张食物图片';
    return;
  }

  aiOutput.textContent = '';
  aiStatus.textContent = '正在识别食物并生成建议（流式输出中）...';

  const height_cm = $('height').value ? Number($('height').value) : null;
  const weight_kg = $('weight').value ? Number($('weight').value) : null;
  const diseases = $('diseases').value.trim();
  const allergies = $('allergies').value.trim();
  const lifestyle = $('lifestyle').value.trim();

  const imageToSend = await compressImageForUpload(file);

  const form = new FormData();
  form.append('image', imageToSend, imageToSend.name || 'food.jpg');
  if (height_cm !== null) form.append('height_cm', String(height_cm));
  if (weight_kg !== null) form.append('weight_kg', String(weight_kg));
  form.append('diseases', diseases);
  form.append('allergies', allergies);
  form.append('lifestyle', lifestyle);

  try {
    const res = await fetch(API_BASE + '/api/food-analyze', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: form
    });

    if (!res.ok || !res.body) {
      const msg = await res.text();
      throw new Error(msg || '食物识别请求失败');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let done = false;

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      if (value) {
        const chunk = decoder.decode(value, { stream: !done });
        aiOutput.textContent += chunk;
        aiOutput.scrollTop = aiOutput.scrollHeight;
      }
    }

    aiStatus.textContent = '识别与建议生成完成 ✅';
    loadHistory();
  } catch (err) {
    console.error(err);
    aiStatus.textContent = '识别失败：' + (err.message || '请稍后重试');
  }
}

if (foodAnalyzeBtn) {
  foodAnalyzeBtn.addEventListener('click', () => foodAnalyzeWithStreaming());
}

async function loadHistory() {
  if (!token || !historyListEl) return;
  try {
    const data = await apiFetch('/api/advice-history?limit=20');
    historyListEl.innerHTML = '';
    if (!data.list || data.list.length === 0) {
      historyListEl.innerHTML = '<div class="history-item" style="cursor:default;opacity:0.8">暂无历史记录，生成一次建议后会自动出现在这里。</div>';
      return;
    }
    data.list.forEach((item) => {
      const div = document.createElement('button');
      div.type = 'button';
      div.className = 'history-item';
      const dateStr = item.created_at ? new Date(item.created_at).toLocaleString('zh-CN') : '';
      div.innerHTML =
        '<span class="history-item-meta">' +
        (item.type === 'food' ? '📷 拍照识别' : '📝 文字建议') +
        ' · ' +
        dateStr +
        '</span>' +
        '<span class="history-item-preview">' +
        (item.content_preview || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
        '</span>';
      div.addEventListener('click', () => {
        if (aiOutput) {
          aiOutput.textContent = item.content || '';
          aiOutput.scrollTop = 0;
        }
        if (aiStatus) aiStatus.textContent = '已从历史加载';
      });
      historyListEl.appendChild(div);
    });
  } catch (err) {
    console.warn('加载建议历史失败', err);
    if (historyListEl) historyListEl.innerHTML = '<div class="history-item" style="cursor:default;opacity:0.8">加载失败，请稍后重试。</div>';
  }
}

if (historyLoadBtn) {
  historyLoadBtn.addEventListener('click', () => loadHistory());
}

window.addEventListener('load', async () => {
  if (token) {
    try {
      const data = await apiFetch('/api/me', { method: 'GET' });
      setAuthToken(token, data.user);
      await fetchProfileAndFillForm();
    } catch {
      setAuthToken('', null);
    }
  } else {
    updateAuthUi(false, null);
  }
});

