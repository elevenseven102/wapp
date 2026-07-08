(() => {
    const TOKEN = 'DBF3A652672640A4hS9PK7Wf02';
    const BASE = 'https://d82.intsig.net';
    const LIST_URL = `${BASE}/sync/query_doc_list?filter_esign=1&isDomestic=false&order_type=0&token=${TOKEN}`;
    const DOC_INFO_URL = `${BASE}/sync/query_doc_info?token=${TOKEN}&platform=web&doc_id=`;
    const IMG_URL_PREFIX = `${BASE}/sync/enhance_jpg?token=${TOKEN}&rotate=0&mode=0&file_name=`;

    let docs = [];
    let currentDocIndex = -1;
    let isProcessing = false;
    let isSelectMode = false;          // для тач-устройств (долгое нажатие)
    let mouseSelectMode = false;       // для мыши (переключается кнопкой)
    let selectedIndices = new Set();

    // DOM
    const listView = document.getElementById('listView');
    const albumView = document.getElementById('albumView');
    const docGrid = document.getElementById('docGrid');
    const refreshBtn = document.getElementById('refreshBtn');
    const toggleSelectModeBtn = document.getElementById('toggleSelectModeBtn');
    const multiSelectBar = document.getElementById('multiSelectBar');
    const multiSelectCount = document.getElementById('multiSelectCount');
    const pdfSelectedAlbumsBtn = document.getElementById('pdfSelectedAlbumsBtn');
    const cancelSelectBtn = document.getElementById('cancelSelectBtn');
    const listStatus = document.getElementById('listStatus');
    const listProgressContainer = document.getElementById('listProgressContainer');
    const listProgressBar = document.getElementById('listProgressBar');
    const backBtn = document.getElementById('backBtn');
    const albumTitle = document.getElementById('albumTitle');
    const pageListDiv = document.getElementById('pageList');
    const pdfAlbumBtn = document.getElementById('pdfAlbumBtn');
    const jpgSelectedBtn = document.getElementById('jpgSelectedBtn');
    const albumStatus = document.getElementById('albumStatus');
    const albumProgressContainer = document.getElementById('albumProgressContainer');
    const albumProgressBar = document.getElementById('albumProgressBar');

    // Статус-бары
    const setListStatus = (msg, isError = false) => {
        listStatus.textContent = msg;
        listStatus.className = `status-text${isError ? ' error' : ''}`;
    };
    const setAlbumStatus = (msg, isError = false) => {
        albumStatus.textContent = msg;
        albumStatus.className = `status-text${isError ? ' error' : ''}`;
    };

    function showListProgress(percent) {
        listProgressContainer.style.display = 'block';
        listProgressBar.style.width = percent + '%';
    }
    function hideListProgress() {
        listProgressContainer.style.display = 'none';
        listProgressBar.style.width = '0%';
    }
    function showAlbumProgress(percent) {
        albumProgressContainer.style.display = 'block';
        albumProgressBar.style.width = percent + '%';
    }
    function hideAlbumProgress() {
        albumProgressContainer.style.display = 'none';
        albumProgressBar.style.width = '0%';
    }

    // Безопасный вывод текста
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // API
    async function apiFetch(url) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (data.status !== 0) throw new Error(data.error_msg || 'Ошибка API');
        return data.data;
    }

    // Загрузка списка документов
    async function loadDocList() {
        refreshBtn.disabled = true;
        setListStatus('Загрузка списка документов...');
        try {
            const data = await apiFetch(LIST_URL);
            docs = (data.doc_list || []).map(d => ({ ...d, pages: null }));
            setListStatus(`Найдено документов: ${docs.length}`);
            clearSelection();
            renderDocCards();
        } catch (e) {
            setListStatus(`Ошибка: ${e.message}`, true);
        } finally {
            refreshBtn.disabled = false;
        }
    }

    // Загрузка страниц альбома
    async function loadPagesForDoc(index) {
        const doc = docs[index];
        if (!doc || doc.pages) return doc.pages;
        setAlbumStatus('Загрузка страниц...');
        try {
            const data = await apiFetch(DOC_INFO_URL + doc.file_name);
            doc.pages = (data.page_list || []).map((p, i) => ({
                ...p,
                docTitle: doc.title || doc.file_name,
                pageNumber: i + 1,
                checked: false
            }));
            return doc.pages;
        } catch (e) {
            setAlbumStatus(`Ошибка загрузки страниц: ${e.message}`, true);
            throw e;
        }
    }

    // Управление выделением
    function clearSelection() {
        selectedIndices.clear();
        updateMultiSelectUI();
        document.querySelectorAll('.doc-card').forEach(card => card.classList.remove('selected'));
        isSelectMode = false;       // сбрасываем тач-режим
        // мышиный режим оставляем как есть (пользователь сам отключит)
    }

    function toggleSelect(index) {
        if (selectedIndices.has(index)) {
            selectedIndices.delete(index);
        } else {
            selectedIndices.add(index);
        }
        updateMultiSelectUI();
        const card = document.querySelector(`.doc-card[data-index="${index}"]`);
        if (card) card.classList.toggle('selected', selectedIndices.has(index));
    }

    function updateMultiSelectUI() {
        const count = selectedIndices.size;
        multiSelectBar.classList.toggle('active', count > 0);
        multiSelectCount.textContent = `Выбрано: ${count}`;
        pdfSelectedAlbumsBtn.disabled = count === 0 || isProcessing;

        if (count === 0) {
            isSelectMode = false;
            // мышиный режим не трогаем, пусть остаётся включённым, если пользователь его не выключил
        }
    }

    // Переключение режима выделения мышью
    function toggleMouseSelectMode() {
        mouseSelectMode = !mouseSelectMode;
        toggleSelectModeBtn.classList.toggle('accent', mouseSelectMode);
        toggleSelectModeBtn.textContent = mouseSelectMode ? '🖱️ ВЫДЕЛЕНИЕ (ВКЛ)' : '🖱️ ВЫДЕЛЕНИЕ';
        // при выключении режима снимаем все выделения
        if (!mouseSelectMode) clearSelection();
    }

    // Отрисовка карточек
    function renderDocCards() {
        docGrid.innerHTML = '';
        if (docs.length === 0) {
            docGrid.innerHTML = '<div style="color:var(--text-dim);">Нет документов.</div>';
            return;
        }

        docs.forEach((doc, idx) => {
            const card = document.createElement('div');
            card.className = 'doc-card';
            card.dataset.index = idx;
            if (selectedIndices.has(idx)) card.classList.add('selected');
            card.innerHTML = `
                <div class="doc-card-title">${escapeHtml(doc.title || 'Без названия')}</div>
                <div class="doc-card-meta">
                    <span>📄 ${doc.page_num || '?'} стр.</span>
                    <span>${new Date(parseInt(doc.modify_time) * 1000).toLocaleDateString()}</span>
                </div>
            `;
            docGrid.appendChild(card);
        });
    }

    // Настройка событий для карточек
    function setupCardEvents() {
        const cards = document.querySelectorAll('.doc-card');
        cards.forEach(card => {
            // Обработчик клика (для мыши и тач)
            card.addEventListener('click', (e) => {
                const idx = parseInt(card.dataset.index, 10);

                // Ctrl+клик (или Cmd на Mac) – всегда переключение выделения
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    toggleSelect(idx);
                    return;
                }

                // Если активен мышиный режим выделения – переключаем выделение
                if (mouseSelectMode) {
                    e.preventDefault();
                    toggleSelect(idx);
                    return;
                }

                // Если активен тач-режим (isSelectMode) – переключаем
                if (isSelectMode) {
                    e.preventDefault();
                    toggleSelect(idx);
                    return;
                }

                // Обычный клик – открыть альбом
                openAlbum(idx);
            });

            // Долгое нажатие для тач-устройств (включает isSelectMode)
            let longPressTimer;
            card.addEventListener('touchstart', (e) => {
                longPressTimer = setTimeout(() => {
                    isSelectMode = true;
                    const idx = parseInt(card.dataset.index, 10);
                    if (!selectedIndices.has(idx)) {
                        selectedIndices.add(idx);
                        card.classList.add('selected');
                        updateMultiSelectUI();
                    }
                    card._ignoreClick = true;
                }, 500);
            });
            card.addEventListener('touchend', (e) => {
                clearTimeout(longPressTimer);
                if (card._ignoreClick) {
                    e.preventDefault();
                    e.stopPropagation();
                    card._ignoreClick = false;
                }
            });
            card.addEventListener('touchmove', (e) => {
                clearTimeout(longPressTimer);
            });
        });

        // Drag select для тач-устройств
        docGrid.addEventListener('touchmove', (e) => {
            if (!isSelectMode) return;
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            if (target && target.classList.contains('doc-card')) {
                const idx = parseInt(target.dataset.index, 10);
                if (!selectedIndices.has(idx)) {
                    selectedIndices.add(idx);
                    target.classList.add('selected');
                    updateMultiSelectUI();
                }
            }
        });
    }

    // Переход в альбом
    async function openAlbum(index) {
        currentDocIndex = index;
        const doc = docs[index];
        albumTitle.textContent = doc.title || doc.file_name;
        listView.classList.remove('active');
        albumView.classList.add('active');
        setAlbumStatus('');
        hideAlbumProgress();
        if (!doc.pages) await loadPagesForDoc(index);
        renderPageList(doc);
    }

    function backToList() {
        albumView.classList.remove('active');
        listView.classList.add('active');
        currentDocIndex = -1;
        hideAlbumProgress();
    }

    // Скачивание JPG (одна страница)
    async function downloadSingleJpg(page) {
        const url = IMG_URL_PREFIX + page.file_name + '.jpg';
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Ошибка ${resp.status}`);
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        const safe = (page.docTitle || 'page').replace(/[^a-zа-яё0-9\s]/gi, '').substring(0, 40);
        a.download = `${safe} - стр ${page.pageNumber}.jpg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
    }

    // Генерация PDF для одного альбома
    async function generatePdfForDoc(docIndex) {
        const doc = docs[docIndex];
        if (!doc) throw new Error('Документ не найден');
        if (!doc.pages) await loadPagesForDoc(docIndex);
        if (!doc.pages || doc.pages.length === 0) throw new Error('Нет страниц');

        const images = [];
        for (let i = 0; i < doc.pages.length; i++) {
            const page = doc.pages[i];
            const url = IMG_URL_PREFIX + page.file_name + '.jpg';
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`Ошибка ${resp.status}`);
            const blob = await resp.blob();
            images.push(await blobToImage(blob));
        }

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const w = pdf.internal.pageSize.getWidth();
        const h = pdf.internal.pageSize.getHeight();

        images.forEach((img, idx) => {
            if (idx > 0) pdf.addPage();
            const ratio = Math.min(w / img.width, h / img.height);
            pdf.addImage(img, 'JPEG', (w - img.width * ratio) / 2, (h - img.height * ratio) / 2, img.width * ratio, img.height * ratio);
        });

        const safeTitle = (doc.title || doc.file_name).replace(/[^a-zа-яё0-9\s]/gi, '').substring(0, 40);
        pdf.save(`${safeTitle}.pdf`);
        return true;
    }

    function blobToImage(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
    }

    // Массовое скачивание PDF выбранных альбомов
    async function downloadSelectedAlbumsPdf() {
        if (selectedIndices.size === 0) return;
        isProcessing = true;
        pdfSelectedAlbumsBtn.disabled = true;
        const indicesArray = Array.from(selectedIndices);
        let successCount = 0;
        setListStatus(`Скачивание ${indicesArray.length} альбомов...`);
        showListProgress(0);

        for (let i = 0; i < indicesArray.length; i++) {
            const idx = indicesArray[i];
            try {
                await generatePdfForDoc(idx);
                successCount++;
            } catch (err) {
                console.error(`Ошибка альбома ${idx}:`, err);
            }
            showListProgress(Math.round(((i + 1) / indicesArray.length) * 100));
        }

        hideListProgress();
        setListStatus(`Готово: скачано ${successCount} из ${indicesArray.length}.`);
        clearSelection();
        isProcessing = false;
    }

    // Отрисовка списка страниц альбома
    function renderPageList(doc) {
        pageListDiv.innerHTML = '';
        if (!doc.pages || doc.pages.length === 0) {
            pageListDiv.innerHTML = '<div style="color:var(--text-dim);">Нет страниц.</div>';
            return;
        }
        doc.pages.forEach((page, pIdx) => {
            const item = document.createElement('div');
            item.className = 'page-item';
            item.innerHTML = `
                <input type="checkbox" class="page-checkbox" data-page="${pIdx}" ${page.checked ? 'checked' : ''}>
                <span class="page-name">Страница ${page.pageNumber}</span>
                <button class="page-download-single" data-page="${pIdx}">JPG</button>
            `;
            item.querySelector('.page-checkbox').addEventListener('change', (e) => {
                page.checked = e.target.checked;
                updateJpgSelectedButton();
            });
            item.querySelector('.page-download-single').addEventListener('click', (e) => {
                e.stopPropagation();
                downloadSingleJpg(page);
            });
            pageListDiv.appendChild(item);
        });
        updateJpgSelectedButton();
    }

    function updateJpgSelectedButton() {
        const doc = docs[currentDocIndex];
        if (!doc?.pages) return;
        const anyChecked = doc.pages.some(p => p.checked);
        jpgSelectedBtn.disabled = !anyChecked || isProcessing;
    }

    // Обработчики кнопок
    refreshBtn.addEventListener('click', loadDocList);
    toggleSelectModeBtn.addEventListener('click', toggleMouseSelectMode);
    backBtn.addEventListener('click', backToList);
    pdfAlbumBtn.addEventListener('click', async () => {
        if (currentDocIndex === -1) return;
        isProcessing = true;
        pdfAlbumBtn.disabled = true;
        try {
            await generatePdfForDoc(currentDocIndex);
            setAlbumStatus('PDF сохранён.');
        } catch (e) {
            setAlbumStatus(`Ошибка: ${e.message}`, true);
        } finally {
            isProcessing = false;
            pdfAlbumBtn.disabled = false;
        }
    });

    jpgSelectedBtn.addEventListener('click', async () => {
        const doc = docs[currentDocIndex];
        if (!doc?.pages) return;
        const selected = doc.pages.filter(p => p.checked);
        if (selected.length === 0) return;
        isProcessing = true;
        setAlbumStatus(`Скачивание ${selected.length} JPG...`);
        for (let i = 0; i < selected.length; i++) {
            await downloadSingleJpg(selected[i]);
            showAlbumProgress(Math.round(((i + 1) / selected.length) * 100));
        }
        hideAlbumProgress();
        isProcessing = false;
        setAlbumStatus('Готово.');
    });

    cancelSelectBtn.addEventListener('click', clearSelection);
    pdfSelectedAlbumsBtn.addEventListener('click', downloadSelectedAlbumsPdf);

    // Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(err => console.log('SW registration failed:', err));
        });
    }

    // Перерисовываем карточки и навешиваем события
    const originalRenderDocCards = renderDocCards;
    renderDocCards = function() {
        originalRenderDocCards();
        setupCardEvents();
    };

    loadDocList();
})();