const COLS = 13;
const ROWS = 9;
const COLORS = [
  '#eab308', '#4f8cff', '#9d5cff', '#00a88c', '#ec4e96',
  '#e0a318', '#17a9c7', '#ec7b38', '#7c6ddb', '#cf5275',
];

const state = {
  dancers: [],
  cues: [newCue(0)],
  current: 0,
  selectedDancer: null,
  editingDancer: null,
  initialEditing: false,
  showPaths: true,
  playing: false,
  startedAt: 0,
  pausedBeat: 0,
  audioUrl: null,
  expandedGroup: 0,
  pendingBeat: null,
  groupCount: 20,
  draft: null,
  lightDraft: null,
};

const $ = (s) => document.querySelector(s);
const stage = $('#stage');
const layer = $('#dancer-layer');
const pathLayer = $('#path-layer');
const audio = $('#audio');

function newCue(beat, source) {
  return {
    beat,
    positions: structuredClone(source?.positions || {}),
    light: structuredClone(
      source?.light || { color: '#5e8dff', brightness: 0, zone: 'mc', fade: 1 }
    ),
  };
}

function ordinal(n) {
  const e = ['th', 'st', 'nd', 'rd'];
  const r = n % 100;
  return e[(r - 20) % 10] || e[r] || e[0];
}

function cueText(beat) {
  const group = Math.floor(beat / 8) + 1;
  return `${group}${ordinal(group)} 八拍・第 ${(beat % 8) + 1} 拍`;
}

function coordinate(col, row) {
  return `${String.fromCharCode(65 + col)}-${row + 1}`;
}

function positionStyle(p) {
  return {
    left: `${((p.col + 0.5) / COLS) * 100}%`,
    top: `${((p.row + 0.5) / ROWS) * 100}%`,
  };
}

function currentCue() {
  return state.cues[state.current];
}

function cueAt(beat) {
  return state.cues.findIndex((c) => c.beat === beat);
}

function sortCues() {
  state.cues.sort((a, b) => a.beat - b.beat);
}

function buildStage() {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.col = col;
      cell.dataset.row = row;
      cell.dataset.coordinate = coordinate(col, row);
      cell.title = coordinate(col, row);
      cell.addEventListener('click', () => setPosition(col, row));
      stage.append(cell);
    }
  }
}

function setPosition(col, row) {
  if (state.selectedDancer === null) return;

  if (state.draft) {
    if (state.selectedDancer !== state.draft.dancerId) {
      return alert('請先完成目前舞者的 Cue。');
    }
    state.draft.endPosition = { col, row };
    state.draft.ready = true;
    $('#add-block').textContent = '請選擇結束拍';
    render();
    return;
  }

  if (state.initialEditing) {
    const id = state.selectedDancer;
    const oldPos = state.cues[0].positions[id];
    const newPos = { col, row };

    state.cues[0].positions[id] = newPos;

    // 同步更新後續「尚未移動過（原本沒座標或座標跟舊初始位置相同）」的 Cue
    for (let i = 1; i < state.cues.length; i++) {
      const cuePos = state.cues[i].positions[id];
      if (!cuePos || (oldPos && cuePos.col === oldPos.col && cuePos.row === oldPos.row)) {
        state.cues[i].positions[id] = structuredClone(newPos);
      } else {
        break; // 遇到第一個有獨立走位的 Cue 就停止覆蓋
      }
    }

    render();
    return;
  }
}

function addDancer(name) {
  if (state.dancers.length >= 10) {
    return alert('第一版最多可加入 10 位舞者。');
  }
  const dancer = {
    id: crypto.randomUUID(),
    name,
    color: COLORS[state.dancers.length],
  };
  state.dancers.push(dancer);
  state.selectedDancer = dancer.id;
  render();
}

function removeDancer(id) {
  state.dancers = state.dancers.filter((d) => d.id !== id);
  state.cues.forEach((c) => delete c.positions[id]);
  if (state.selectedDancer === id) {
    state.selectedDancer = state.dancers[0]?.id ?? null;
  }
  render();
}

function escapeHtml(text) {
  const n = document.createElement('span');
  n.textContent = text;
  return n.innerHTML;
}

function renderDancerList() {
  $('#dancer-count').textContent = `${state.dancers.length} / 10`;
  $('#dancer-list').replaceChildren(
    ...state.dancers.map((d) => {
      const pos = currentCue().positions[d.id];
      const item = document.createElement('div');
      const name =
        state.editingDancer === d.id
          ? `<input class="rename-input" value="${escapeHtml(d.name)}" maxlength="12" aria-label="舞者名稱">`
          : `<span>${escapeHtml(d.name)}</span>`;

      item.className = `dancer-row ${d.id === state.selectedDancer ? 'selected' : ''}`;
      item.innerHTML = `
        <span class="swatch" style="background:${d.color}"></span>
        ${name}
        <small>${pos ? coordinate(pos.col, pos.row) : '未定位'}</small>
        <button class="remove" type="button" aria-label="移除 ${escapeHtml(d.name)}">×</button>
      `;

      item.addEventListener('click', (e) => {
        if (!e.target.closest('.remove') && !e.target.closest('.rename-input')) {
          state.selectedDancer = d.id;
          render();
        }
      });

      item.addEventListener('dblclick', (e) => {
        if (!e.target.closest('.remove')) {
          state.editingDancer = d.id;
          render();
        }
      });

      item.querySelector('.remove').addEventListener('click', (e) => {
        e.stopPropagation();
        removeDancer(d.id);
      });

      const input = item.querySelector('.rename-input');
      if (input) {
        const commit = () => {
          d.name = input.value.trim() || d.name;
          state.editingDancer = null;
          render();
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') {
            state.editingDancer = null;
            render();
          }
        });
        setTimeout(() => {
          input.focus();
          input.select();
        }, 0);
      }

      return item;
    })
  );
}

function selectCue(index) {
  if (state.draft) {
    return alert('請先選擇結束拍，完成目前的 Cue。');
  }
  // 切換其他 Cue 時自動關閉初始位置編輯
  state.initialEditing = false;
  $('#set-initial').textContent = '設定初始位置';

  pause();
  state.current = index;
  state.pausedBeat = currentCue().beat;
  state.pendingBeat = currentCue().beat;
  $('#add-block').textContent = '＋ 新增 Cue';
  state.expandedGroup = Math.floor(currentCue().beat / 8);
  render();
}

function finishDraft(beat) {
    const draft = state.draft;
    if (!draft || !draft.ready || beat <= draft.startBeat) {
      return alert('請先設定目標位置，且結束拍必須在起始拍之後。');
    }
  
    // 輔助函式：取得某拍點當下所有舞者的完整快照位置
    const snapshotPositions = (targetBeat) => {
      const pos = {};
      state.dancers.forEach((d) => {
        const p = positionAt(d.id, targetBeat);
        if (p) pos[d.id] = structuredClone(p);
      });
      return pos;
    };
  
    let startIndex = cueAt(draft.startBeat);
    if (startIndex < 0) {
      const startPositions = snapshotPositions(draft.startBeat);
      startPositions[draft.dancerId] = draft.startPosition;
      state.cues.push(
        newCue(draft.startBeat, {
          positions: startPositions,
          light: lightAt(draft.startBeat),
        })
      );
      sortCues();
      startIndex = cueAt(draft.startBeat);
    }
  
    let endIndex = cueAt(beat);
    if (endIndex < 0) {
      const endPositions = snapshotPositions(beat);
      endPositions[draft.dancerId] = draft.endPosition;
      state.cues.push(
        newCue(beat, {
          positions: endPositions,
          light: lightAt(beat),
        })
      );
      sortCues();
      endIndex = cueAt(beat);
    } else {
      state.cues[endIndex].positions[draft.dancerId] = draft.endPosition;
    }
  
    // 讓結束拍之後的 Cue 延續這個新位置
    state.cues.slice(endIndex + 1).forEach((cue) => {
      cue.positions[draft.dancerId] = structuredClone(draft.endPosition);
    });
  
    state.current = endIndex;
    state.pausedBeat = beat;
    state.pendingBeat = beat;
    state.draft = null;
    $('#add-block').textContent = '＋ 新增 Cue';
    state.expandedGroup = Math.floor(beat / 8);
    render();
}

function renderTimeline() {
  const timeline = $('#timeline');
  timeline.replaceChildren();

  for (let group = 0; group < state.groupCount; group++) {
    const box = document.createElement('div');
    box.className = `eight-group ${group === state.expandedGroup ? 'expanded' : ''}`;

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'eight-header';
    head.textContent = `${group + 1}${ordinal(group + 1)} 八拍`;
    head.addEventListener('click', () => {
      state.expandedGroup = group;
      renderTimeline();
    });
    box.append(head);

    if (group === state.expandedGroup) {
      const grid = document.createElement('div');
      grid.className = 'beat-grid';

      for (let local = 0; local < 8; local++) {
        const absolute = group * 8 + local;
        const index = cueAt(absolute);
        const cue = state.cues[index];
        const button = document.createElement('button');

        button.type = 'button';
        button.className = [
          'beat',
          index >= 0 ? 'has-cue' : '',
          index === state.current ? 'selected' : '',
          index < 0 && absolute === state.pendingBeat ? 'pending' : '',
        ]
          .filter(Boolean)
          .join(' ');

        button.textContent = local + 1;
        button.title =
          index >= 0
            ? cueText(absolute)
            : state.draft?.ready
            ? `${cueText(absolute)}：選作結束拍`
            : `${cueText(absolute)}：請先設定目標位置`;

        if (cue) {
          button.innerHTML += `<span class="light-dot" style="background:${cue.light.color};opacity:${cue.light.brightness / 100}"></span>`;
        }

        button.addEventListener('click', () => {
            if (state.lightDraft) {
                return finishLightDraft(absolute);
              }
            
            if (state.draft) {
                if (!state.draft.ready) {
                return alert('請先在舞台上選擇要移動到的位置。');
                }
                return finishDraft(absolute);
            }
            if (index >= 0) return selectCue(index);

            state.pendingBeat = absolute;
            renderTimeline();
            });

            grid.append(button);
        }
        box.append(grid);
        }

    timeline.append(box);
  }
}

function renderCueControls() {
  const cue = currentCue();
  const light = cue.light;

  $('#cue-label').textContent = cueText(cue.beat);
  $('#cue-block').value = Math.floor(cue.beat / 8) + 1;
  $('#cue-beat').value = (cue.beat % 8) + 1;
  $('#light-color').value = light.color;
  $('#light-brightness').value = light.brightness;
  $('#brightness-value').textContent = `${light.brightness}%`;
  $('#light-zone').value = light.zone;
  /*$('#light-fade').value = light.fade;*/
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return {
    r: n >> 16,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

// 計算任意拍點（包含小數拍）的燈光漸變狀態
function lightAt(beat) {
    const before = [...state.cues].reverse().find((c) => c.beat <= beat && c.light);
    const after = state.cues.find((c) => c.beat >= beat && c.light);
  
    if (!before) return after ? after.light : { color: '#5e8dff', brightness: 0, zone: 'mc' };
    if (!after || before === after) return before.light;
  
    // 如果兩者照射區域不同，或已經過了結束拍，直接回傳對應狀態；同區域則平滑漸變
    const r = (beat - before.beat) / (after.beat - before.beat);
    const c1 = hexToRgb(before.light.color);
    const c2 = hexToRgb(after.light.color);
  
    const mix = (a, b) => Math.round(a + (b - a) * r);
    const toHex = (n) => n.toString(16).padStart(2, '0');
    const mixedColor = `#${toHex(mix(c1.r, c2.r))}${toHex(mix(c1.g, c2.g))}${toHex(mix(c1.b, c2.b))}`;
  
    return {
      color: mixedColor,
      brightness: before.light.brightness + (after.light.brightness - before.light.brightness) * r,
      zone: r < 0.5 ? before.light.zone : after.light.zone,
    };
}

function lightGradient(light) {
  const c = hexToRgb(light.color);
  const solid = `rgba(${c.r}, ${c.g}, ${c.b}, ${(light.brightness / 100) * 0.62})`;
  const clear = 'rgba(0,0,0,0)';
  const zones = {
    all: '0 0/100% 100%',
    ul: '100% 0/33.34% 33.34%',
    uc: '50% 0/33.34% 33.34%',
    ur: '0 0/33.34% 33.34%',
    ml: '100% 50%/33.34% 33.34%',
    mc: '50% 50%/33.34% 33.34%',
    mr: '0 50%/33.34% 33.34%',
    dl: '100% 100%/33.34% 33.34%',
    dc: '50% 100%/33.34% 33.34%',
    dr: '0 100%/33.34% 33.34%',
  };
  return `linear-gradient(${solid},${solid}) ${zones[light.zone] || zones.mc} no-repeat, ${clear}`;
}

function positionAt(id, beat) {
  const before = [...state.cues].reverse().find((c) => c.beat <= beat && c.positions[id]);
  const after = state.cues.find((c) => c.beat >= beat && c.positions[id]);

  if (!before) return after?.positions[id];
  if (!after || before === after) return before.positions[id];

  const r = (beat - before.beat) / (after.beat - before.beat);
  return {
    col: before.positions[id].col + (after.positions[id].col - before.positions[id].col) * r,
    row: before.positions[id].row + (after.positions[id].row - before.positions[id].row) * r,
  };
}

function svg(name, attrs) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
}

function drawPaths() {
  pathLayer.replaceChildren();
  if (!state.showPaths) return;

  if (state.draft?.endPosition) {
    const d = state.dancers.find((x) => x.id === state.draft.dancerId);
    const a = state.draft.startPosition;
    const b = state.draft.endPosition;
    if (!d || !a || !b) return;

    const x1 = ((a.col + 0.5) / COLS) * 100;
    const y1 = ((a.row + 0.5) / ROWS) * 100;
    const x2 = ((b.col + 0.5) / COLS) * 100;
    const y2 = ((b.row + 0.5) / ROWS) * 100;

    pathLayer.append(
      svg('line', { x1: `${x1}%`, y1: `${y1}%`, x2: `${x2}%`, y2: `${y2}%`, stroke: d.color }),
      svg('circle', { cx: `${x2}%`, cy: `${y2}%`, r: 4, fill: d.color })
    );
    return;
  }

  const cue = currentCue();
  const next = state.cues[state.current + 1];
  if (!next) return;

  state.dancers.forEach((d) => {
    const a = cue.positions[d.id];
    const b = next.positions[d.id];
    if (!a || !b || (a.col === b.col && a.row === b.row)) return;

    const x1 = ((a.col + 0.5) / COLS) * 100;
    const y1 = ((a.row + 0.5) / ROWS) * 100;
    const x2 = ((b.col + 0.5) / COLS) * 100;
    const y2 = ((b.row + 0.5) / ROWS) * 100;

    pathLayer.append(
      svg('line', { x1: `${x1}%`, y1: `${y1}%`, x2: `${x2}%`, y2: `${y2}%`, stroke: d.color }),
      svg('circle', { cx: `${x2}%`, cy: `${y2}%`, r: 4, fill: d.color })
    );
  });
}

function renderStage(beat = state.pausedBeat) {
  const cue = currentCue();
  const selected = state.draft?.endPosition || positionAt(state.selectedDancer, beat);

  $('#light-overlay').style.background = lightGradient(lightAt(beat));
  $('#selected-cell').textContent = selected ? coordinate(selected.col, selected.row) : '—';

  document.querySelectorAll('.cell').forEach((c) => {
    c.classList.toggle(
      'focused',
      selected && +c.dataset.col === selected.col && +c.dataset.row === selected.row
    );
  });

  layer.replaceChildren();
  state.dancers.forEach((d) => {
    const p =
      state.draft?.dancerId === d.id && state.draft.endPosition
        ? state.draft.endPosition
        : positionAt(d.id, beat);
    if (!p) return;

    const token = document.createElement('div');
    token.className = `dancer-token ${d.id === state.selectedDancer ? 'active' : ''}`;
    token.textContent = d.name.slice(0, 2);
    token.title = `雙擊選取 ${d.name}`;
    token.style.background = d.color;

    token.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.selectedDancer = d.id;
      render();
    });

    Object.assign(token.style, positionStyle(p));
    layer.append(token);
  });

  drawPaths();
}

function render(beat = state.pausedBeat) {
  renderDancerList();
  renderTimeline();
  renderCueControls();
  renderStage(beat);
  renderStatus();
}

function updateLight(key, value) {
    if (state.lightDraft) {
        state.lightDraft.endLight[key] = value;
        $('#light-overlay').style.background = lightGradient(state.lightDraft.endLight);
        if (key === 'brightness') $('#brightness-value').textContent = `${value}%`;
        return;
      }
    currentCue().light[key] = value;
    render();
}

function finishLightDraft(beat) {
    const draft = state.lightDraft;
    if (!draft || beat <= draft.startBeat) {
      return alert('燈光結束拍必須在起始拍之後。');
    }
  
    // 1. 確保起始拍存在，並鎖定起始燈光狀態
    let startIndex = cueAt(draft.startBeat);
    if (startIndex < 0) {
      state.cues.push(newCue(draft.startBeat, { light: draft.startLight }));
      sortCues();
    } else {
      state.cues[startIndex].light = structuredClone(draft.startLight);
    }
  
    // 2. 確保結束拍存在，並寫入目標燈光狀態
    let endIndex = cueAt(beat);
    if (endIndex < 0) {
      state.cues.push(newCue(beat, { light: draft.endLight }));
      sortCues();
      endIndex = cueAt(beat);
    } else {
      state.cues[endIndex].light = structuredClone(draft.endLight);
    }
  
    // 3. 讓結束拍之後的 Cue 延續這個新的燈光狀態（直到下一個燈光變化為止）
    state.cues.slice(endIndex + 1).forEach((cue) => {
      cue.light = structuredClone(draft.endLight);
    });
  
    state.current = endIndex;
    state.pausedBeat = beat;
    state.pendingBeat = beat;
    state.lightDraft = null;
    $('#add-light-cue').textContent = '＋ 新增燈光漸變';
    state.expandedGroup = Math.floor(beat / 8);
    render();
}

function changeCueTiming() {
  const target = (+$('#cue-block').value - 1) * 8 + (+$('#cue-beat').value - 1);
  const duplicate = cueAt(target);
  if (target < 0) return;

  if (duplicate >= 0 && duplicate !== state.current) {
    alert('這一拍已有 Cue，請選擇其他拍點。');
    renderCueControls();
    return;
  }

  currentCue().beat = target;
  sortCues();
  state.current = cueAt(target);
  state.pausedBeat = target;
  render();
}

function bpm() {
  return Math.max(40, Math.min(240, +$('#bpm').value || 120));
}

function currentBeat() {
  return state.pausedBeat + ((performance.now() - state.startedAt) / 1000) * (bpm() / 60);
}

function renderStatus() {
  const beat = state.playing ? currentBeat() : state.pausedBeat;
  $('#status').textContent = cueText(Math.max(0, Math.floor(beat)));
}

function timeText(seconds) {
  const m = Math.floor(seconds / 60);
  return `${m}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
}

async function estimateBpm() {
    if (!audio.src) return alert('請先選擇音檔。');
    const button = $('#auto-bpm');
    button.disabled = true;
    button.textContent = '分析中…';
  
    try {
      const bytes = await fetch(audio.src).then((r) => r.arrayBuffer());
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const rawBuffer = await context.decodeAudioData(bytes);
  
      // 1. 使用 OfflineAudioContext + 低通濾波器 (150Hz)，只保留大鼓 (Kick) 等低頻重拍
      const offline = new OfflineAudioContext(1, rawBuffer.length, rawBuffer.sampleRate);
      const source = offline.createBufferSource();
      source.buffer = rawBuffer;
  
      const filter = offline.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 150; // 濾掉人聲與高頻細碎節奏，專注抓重拍
  
      source.connect(filter);
      filter.connect(offline.destination);
      source.start(0);
  
      const filteredBuffer = await offline.startRendering();
      const allSamples = filteredBuffer.getChannelData(0);
  
      // 2. 只取歌曲 20% ~ 80% 的區段（避開無鼓點的前奏與尾奏）
      const startSample = Math.floor(allSamples.length * 0.2);
      const endSample = Math.floor(allSamples.length * 0.8);
      const samples = allSamples.subarray(startSample, endSample);
  
      // 3. 計算低頻能量變化包絡線 (Onset Envelope)
      const hop = 512;
      const energy = [];
      for (let i = 0; i + hop < samples.length; i += hop) {
        let sum = 0;
        for (let j = 0; j < hop; j++) {
          sum += samples[i + j] * samples[i + j];
        }
        energy.push(Math.sqrt(sum / hop));
      }
  
      // 只保留能量上升的瞬間（鼓點打下去的那一刻）
      const onsets = energy.map((v, i) => (i ? Math.max(0, v - energy[i - 1]) : 0));
      const frameRate = filteredBuffer.sampleRate / hop;
  
      // 4. 用自相關 (Autocorrelation) 測試 60 ~ 170 BPM 哪個週期最吻合重拍
      let bestBpm = 120;
      let bestScore = -Infinity;
  
      for (let candidateBpm = 60; candidateBpm <= 170; candidateBpm++) {
        const lag = Math.round((60 / candidateBpm) * frameRate);
        let correlation = 0;
        let count = 0;
  
        // 同時檢查 1 拍 (lag) 與 2 拍 (lag * 2) 的規律性，強化八拍穩定度
        for (let i = 0; i + lag * 2 < onsets.length; i++) {
          correlation += onsets[i] * onsets[i + lag] + 0.5 * onsets[i] * onsets[i + lag * 2];
          count++;
        }
  
        let score = count ? correlation / count : 0;
  
        // 稍微給予舞者最常數拍的區間 (75 ~ 145 BPM) 權重加成，避免倍頻誤判
        if (candidateBpm >= 75 && candidateBpm <= 145) {
          score *= 1.15;
        }
  
        if (score > bestScore) {
          bestScore = score;
          bestBpm = candidateBpm;
        }
      }
  
      $('#bpm').value = bestBpm;
      $('#status').textContent = `自動估算：${bestBpm} BPM（可用 ½ / ×2 微調）`;
      context.close();
    } catch (error) {
      alert('無法可靠估算這個音檔的 BPM，請改用手動輸入或 ½ / ×2 調整。');
    } finally {
      button.disabled = false;
      button.textContent = '自動估算 BPM';
    }
}

function play() {
  if (state.cues.length < 2) {
    return alert('請先建立至少兩個 Cue，才能預覽走位。');
  }
  state.playing = true;
  state.startedAt = performance.now();
  $('#play').textContent = '❚❚ 暫停';
  requestAnimationFrame(tick);
}

function pause() {
  if (!state.playing) return;
  state.pausedBeat = currentBeat();
  state.playing = false;
  $('#play').textContent = '▶ 播放';
  audio.pause();
  render();
}

function tick() {
  if (!state.playing) return;

  const beat = currentBeat();
  const audioEnd =
    audio.duration && Number.isFinite(audio.duration) ? audio.duration : 0;
  /*const audioEnd =
    audio.duration && Number.isFinite(audio.duration)
      ? audio.duration - (+$('#song-offset').value || 0)
      : 0;*/
  const end = audioEnd ? (audioEnd * bpm()) / 60 : state.cues.at(-1).beat;

  if (beat >= end) {
    state.pausedBeat = 0;
    state.current = 0;
    state.playing = false;
    $('#play').textContent = '▶ 播放';
    audio.pause();
    render();
    return;
  }

  const cueIndex = state.cues
    .map((c) => c.beat)
    .reduce((found, cueBeat, index) => (cueBeat <= beat ? index : found), 0);

  if (cueIndex !== state.current) {
    state.current = cueIndex;
  }

  renderStage(beat);
  renderStatus();
  $('#playback-time').textContent = timeText((beat * 60) / bpm());
  requestAnimationFrame(tick);
}

// --- Event Listeners ---

$('#add-dancer-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#dancer-name');
  if (input.value.trim()) {
    addDancer(input.value.trim());
    input.value = '';
  }
});

// initial position setting
$('#set-initial').addEventListener('click', () => {
    if (state.draft) return alert('請先完成目前的 Cue。');
    if (state.selectedDancer === null) return alert('請先選取舞者。');
  
    // 切換初始編輯模式
    state.initialEditing = !state.initialEditing;
  
    if (state.initialEditing) {
      // 確保第 0 拍的 Cue 存在，並自動切換到第 0 拍方便檢視
      let firstIndex = cueAt(0);
      if (firstIndex < 0) {
        state.cues.unshift(newCue(0));
        firstIndex = 0;
      }
      pause();
      state.current = firstIndex;
      state.pausedBeat = 0;
      state.pendingBeat = 0;
      state.expandedGroup = 0;
      $('#set-initial').textContent = '完成初始位置設定';
    } else {
      $('#set-initial').textContent = '設定初始位置';
    }
  
    render();
});

/* $('#add-block').addEventListener('click', () => {
  state.awaitingEnd = true;
  state.pendingBeat = null;
  $('#add-block').textContent = '請選擇結束拍';
  renderTimeline();
}); */

$('#add-light-cue').addEventListener('click', () => {
  if (state.draft) return alert('請先完成目前的舞者走位 Cue。');
  if (state.lightDraft) {
    state.lightDraft = null;
    $('#add-light-cue').textContent = '＋ 新增燈光漸變';
    render();
    return;
  }

  const startBeat = state.pendingBeat ?? currentCue().beat;
  const startLight = structuredClone(lightAt(startBeat));

  state.lightDraft = {
    startBeat,
    startLight,
    endLight: structuredClone(startLight),
  };
  state.pendingBeat = null;
  $('#add-light-cue').textContent = '設定目標燈光後，點選結束拍';
  renderTimeline();
});

$('#add-eight').addEventListener('click', () => {
  state.groupCount++;
  state.expandedGroup = state.groupCount - 1;
  renderTimeline();
});

$('#previous-block').addEventListener('click', () => {
  selectCue(Math.max(0, state.current - 1));
});

$('#next-block').addEventListener('click', () => {
  selectCue(Math.min(state.cues.length - 1, state.current + 1));
});

$('#play').addEventListener('click', () => (state.playing ? pause() : play()));

$('#toggle-paths').addEventListener('click', (e) => {
  state.showPaths = !state.showPaths;
  e.currentTarget.setAttribute('aria-pressed', state.showPaths);
  e.currentTarget.textContent = state.showPaths ? '顯示軌跡' : '隱藏軌跡';
  renderStage();
});

$('#cue-block').addEventListener('change', changeCueTiming);
$('#cue-beat').addEventListener('change', changeCueTiming);
$('#light-color').addEventListener('input', (e) => updateLight('color', e.target.value));
$('#light-brightness').addEventListener('input', (e) => updateLight('brightness', +e.target.value));
$('#light-zone').addEventListener('change', (e) => updateLight('zone', e.target.value));
// $('#light-fade').addEventListener('change', (e) => updateLight('fade', +e.target.value));

$('#audio-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  state.audioUrl = URL.createObjectURL(file);
  audio.src = state.audioUrl;
  $('#audio-name').textContent = file.name;
});

// 從頭開始播放（有音樂就同步音樂，沒音樂就純走位歸零播放）
$('#play-from-start').addEventListener('click', () => {
    if (state.cues.length < 2) {
      return alert('請先建立至少兩個 Cue，才能預覽走位。');
    }
  
    pause(); // 先確保停止目前的播放計時
    state.current = 0;
    state.pausedBeat = 0;
    state.pendingBeat = 0;
    state.expandedGroup = 0;
    render();
  
    if (audio.src) {
      audio.currentTime = 0;
      audio.play();
    }
    play();
  });
  
// 從目前選取的拍點開始播放
$('#sync-audio').addEventListener('click', () => {
    if (state.cues.length < 2) {
      return alert('請先建立至少兩個 Cue，才能預覽走位。');
    }
  
    pause(); // 先重置計時基準，確保從當前 Cue 的精準拍點開始算
    state.pausedBeat = currentCue().beat;
  
    if (audio.src) {
      audio.currentTime = (currentCue().beat * 60) / bpm();
      audio.play();
    }
    play();
});

/*$('#sync-audio').addEventListener('click', () => {
  if (!audio.src) return alert('請先選擇音檔。');
  audio.currentTime = (+$('#song-offset').value || 0) + (currentCue().beat * 60) / bpm();
  audio.play();
  if (!state.playing) play();
});*/

$('#auto-bpm').addEventListener('click', estimateBpm);
$('#half-bpm').addEventListener('click', () => {
  $('#bpm').value = Math.max(40, Math.round(bpm() / 2));
});
$('#double-bpm').addEventListener('click', () => {
  $('#bpm').value = Math.min(240, bpm() * 2);
});
$('#bpm').addEventListener('change', () => {
  if (state.playing) {
    state.pausedBeat = currentBeat();
    state.startedAt = performance.now();
  }
  renderStatus();
});

// 註：原程式碼中這裡有重複綁定與透過 cloneNode 清除監聽器的寫法，已完整保留原邏輯
/*$('#add-block').addEventListener('click', () => {
  if (state.draft) return;
  if (state.selectedDancer === null) return alert('請先選取舞者。');

  const startBeat = state.pendingBeat ?? currentCue().beat;
  const startPosition = positionAt(state.selectedDancer, startBeat);
  if (!startPosition) return alert('這位舞者在起始拍點尚未設定位置。');

  state.draft = {
    startBeat,
    dancerId: state.selectedDancer,
    startPosition,
    ready: false,
  };
  state.pendingBeat = null;
  $('#add-block').textContent = '請設定目標位置';
  renderTimeline();
});

const cleanCueButton = $('#add-block');
cleanCueButton.replaceWith(cleanCueButton.cloneNode(true));
*/

$('#add-block').addEventListener('click', () => {
  if (state.draft) return;
  if (state.selectedDancer === null) return alert('請先選取舞者。');

  // 開始新增 Cue 時自動關閉初始位置編輯
  state.initialEditing = false;
  $('#set-initial').textContent = '設定初始位置';

  const startBeat = state.pendingBeat ?? currentCue().beat;
  const startPosition = positionAt(state.selectedDancer, startBeat);
  if (!startPosition) return alert('這位舞者在起始拍點尚未設定位置。');

  state.draft = {
    startBeat,
    dancerId: state.selectedDancer,
    startPosition,
    ready: false,
  };
  state.pendingBeat = null;
  $('#add-block').textContent = '請設定目標位置';
  renderTimeline();
});

// 按下 ESC 鍵取消目前正在編輯的走位 Cue、燈光漸變或初始位置設定
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;

  // 若正在輸入框內（如改舞者名字、輸入 BPM），先退出輸入框焦點，不誤觸取消
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
    document.activeElement.blur();
    return;
  }

  let canceled = false;

  // 1. 取消正在新增的舞者走位 Cue（還原按鈕文字與待選拍點）
  if (state.draft) {
    state.pendingBeat = state.draft.startBeat;
    state.draft = null;
    $('#add-block').textContent = '＋ 新增 Cue';
    canceled = true;
  }

  // 2. 取消正在新增的燈光漸變 Cue（還原按鈕文字與燈光預覽）
  if (state.lightDraft) {
    state.pendingBeat = state.lightDraft.startBeat;
    state.lightDraft = null;
    $('#add-light-cue').textContent = '＋ 新增燈光漸變';
    canceled = true;
  }

  // 3. 退出「設定初始位置」模式
  if (state.initialEditing) {
    state.initialEditing = false;
    $('#set-initial').textContent = '設定初始位置';
    canceled = true;
  }

  if (canceled) {
    render();
  }
});

// --- Initialization ---

buildStage();
addDancer('A');
addDancer('B');
addDancer('C');

currentCue().positions = {
  [state.dancers[0].id]: { col: 4, row: 5 },
  [state.dancers[1].id]: { col: 6, row: 5 },
  [state.dancers[2].id]: { col: 8, row: 5 },
};
state.selectedDancer = state.dancers[0].id;
render();