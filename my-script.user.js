// ==UserScript==
// @name         Hitomi Enhanced
// @author       asdf
// @match        https://hitomi.la/*
// @exclude      https://hitomi.la/doujinshi/*
// @exclude      https://hitomi.la/manga/*
// @exclude      https://hitomi.la/artistcg/*
// @exclude      https://hitomi.la/gamecg/*
// @exclude      https://hitomi.la/imageset/*
// @exclude      https://hitomi.la/cg/*
// @exclude      https://hitomi.la/reader/*
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @require      https://code.jquery.com/jquery-3.7.1.js
// @require      https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js
// ==/UserScript==

(async function() {
    'use strict';

    // Global state management
    const state = {
        db: null,
        defaultQuery: localStorage.getItem('hitomiDefaultQuery') || '',
        jsonData: [],
        currentBatchIndex: 0,
        currentPage: parseInt(window.location.hash.replace('#', '') || '1', 10),
        hasFetched: false,
        isInitialized: false,
        count_start: '0',
        count_end: '0',
        resultJsonMap: {},
        hitomiJsonMap: {},
        validClasses: ['dj', 'cg', 'acg', 'manga', 'anime', 'imageset'],
        batchSize: 25
    };

    // Configuration
    const CONFIG = {
        GITHUB_BASE_URL: 'https://raw.githubusercontent.com/tttt369/hitomi_enhanced/master/urls/',
        HITOMI_BASE_URL: 'https://hitomi.la/',
        BATCH_SIZE: 25,
        SCROLL_THRESHOLD: 0.9,
        DEBOUNCE_DELAY: 100
    };

    // Utility functions
    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func(...args), delay);
        };
    };

    const asyncTimeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const safeJsonParse = (str) => {
        try {
            return JSON.parse(str);
        } catch (e) {
            console.error('JSON parse error:', e);
            return null;
        }
    };

    // Menu command registration
    GM_registerMenuCommand('Delete Default Query', deleteDefaultQuery, {
        title: 'Delete Default Query'
    });

    function deleteDefaultQuery() {
        console.log('Deleting default query');
        state.defaultQuery = '';
        localStorage.removeItem('hitomiDefaultQuery');
        localStorage.removeItem('hitomiDefaultPageCount');
    }

    // IndexedDB operations (async)
    async function initIndexedDB() {
        if (state.db) return state.db;

        console.log('Initializing IndexedDB');
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('HitomiEnhancedDB', 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('jsonCache')) {
                    db.createObjectStore('jsonCache');
                }
            };

            request.onsuccess = (event) => {
                state.db = event.target.result;
                resolve(state.db);
            };

            request.onerror = (event) => {
                reject(new Error('IndexedDB initialization failed: ' + event.target.error));
            };
        });
    }

    async function storeJsonInIndexedDB(jsonData, key) {
        console.log(`Storing JSON with key: ${key}`);
        const db = await initIndexedDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['jsonCache'], 'readwrite');
            const store = transaction.objectStore('jsonCache');
            const request = store.put(jsonData, key);

            request.onsuccess = () => {
                console.log(`Successfully cached JSON with key: ${key}`);
                resolve();
            };
            request.onerror = () => reject(new Error(`Failed to store JSON: ${request.error}`));
        });
    }

    async function getJsonFromIndexedDB(key) {
        console.log(`Retrieving JSON with key: ${key}`);
        const db = await initIndexedDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['jsonCache'], 'readonly');
            const store = transaction.objectStore('jsonCache');
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(new Error(`Failed to retrieve JSON: ${request.error}`));
        });
    }

    // Enhanced JSON fetching with retry logic
    async function fetchJsonWithRetry(url, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                return await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: url,
                        timeout: 10000,
                        onload: (response) => {
                            if (response.status === 200) {
                                const data = safeJsonParse(response.responseText);
                                if (data) {
                                    resolve(data);
                                } else {
                                    reject(new Error('Invalid JSON response'));
                                }
                            } else {
                                reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
                            }
                        },
                        onerror: () => reject(new Error(`Network error for ${url}`)),
                        ontimeout: () => reject(new Error(`Timeout for ${url}`))
                    });
                });
            } catch (error) {
                console.warn(`Attempt ${i + 1} failed for ${url}:`, error.message);
                if (i === retries - 1) throw error;
                await asyncTimeout(1000 * (i + 1)); // Progressive delay
            }
        }
    }

    async function getCachedJson(isHitomiData = false) {
        console.log(`Getting cached JSON (hitomi_data: ${isHitomiData})`);

        try {
            const url = isHitomiData
                ? `${CONFIG.GITHUB_BASE_URL}hitomi_data.json`
                : `${CONFIG.GITHUB_BASE_URL}result.json`;
            const cacheKey = isHitomiData ? 'hitomi_data_json' : 'result_json';

            let jsonData = await getJsonFromIndexedDB(cacheKey);

            if (!jsonData) {
                console.log(`Cache miss for ${cacheKey}, fetching from network`);
                jsonData = await fetchJsonWithRetry(url);
                await storeJsonInIndexedDB(jsonData, cacheKey);
            } else {
                console.log(`Cache hit for ${cacheKey}`);
            }

            if (typeof jsonData === 'string') {
                jsonData = safeJsonParse(jsonData);
                if (!jsonData) return {};
            }

            if (isHitomiData) {
                return jsonData || {};
            }

            if (!Array.isArray(jsonData)) {
                console.error('Result JSON is not an array:', jsonData);
                return {};
            }

            // Convert array to map for O(1) lookups
            const resultMap = {};
            jsonData.forEach((item, index) => {
                if (item && item.id) {
                    resultMap[item.id] = item;
                } else {
                    resultMap[index] = item;
                }
            });

            return resultMap;
        } catch (error) {
            console.error('Error fetching cached JSON:', error);
            return {};
        }
    }

    // HTML and CSS content
    const HTML_CONTENT = `
        <!DOCTYPE html>
        <html data-bs-theme="dark" lang="ja">
            <head></head>
            <body>
              <nav class="navbar navbar-expand-lg bg-body-tertiary">
                <div class="container-fluid">
                    <a href="/">
                      <img class="navbar-brand" src="//ltn.gold-usergeneratedcontent.net/logo.png" alt="Logo">
                    </a>
                  <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                  </button>
                  <div class="collapse navbar-collapse w-100" id="navbarNav">
                    <ul class="navbar-nav me-auto">
                      <li class="nav-item"><a class="nav-link" href="/alltags-a.html">tags</a></li>
                      <li class="nav-item"><a class="nav-link" href="/allartists-a.html">artists</a></li>
                      <li class="nav-item"><a class="nav-link" href="/allseries-a.html">series</a></li>
                      <li class="nav-item"><a class="nav-link" href="/allcharacters-a.html">characters</a></li>
                    </ul>
                    <div class="SearchContainer">
                        <form class="d-flex position-relative" role="search">
                            <input id="query-input" class="form-control me-2" type="search" placeholder="Search" aria-label="Search" autocomplete="off">
                            <button class="btn btn-outline-success" type="submit">Search</button>
                        </form>
                        <div class="default-query-container">
                            <div class="default-query-badges"></div>
                            <input id="default-query-input" class="form-control default-query-input" type="text" placeholder="Add to default query">
                            <button id="save-default-btn" class="btn btn-outline-success">Save</button>
                        </div>
                        <div class="page-count-container">
                            <input id="sort-pagecount-start" class="form-control" type="number" value="0" min="0" placeholder="0">
                            <h5 class="hyphen"> - </h5>
                            <input id="sort-pagecount-end" class="form-control" type="number" value="0" min="0" placeholder="0 to unlimited">
                        </div>
                    </div>
                  </div>
                </div>
              </nav>
              <div class="sticky-navbar">
                <button id="tag-picker-btn" class="btn tag-picker-btn">
                </button>
                <div class="btn-group" role="group">
                  <button id="add-tag-btn" class="btn btn-success" disabled>
                    <i class="bi bi-plus-circle-fill"></i>
                  </button>
                  <button id="exclude-tag-btn" class="btn btn-danger" disabled>
                    <i class="bi bi-dash-circle-fill"></i>
                  </button>
                </div>
              </div>
              <div class="container">
                <div class="card-container bg-secondary-subtle">
                  <div class="row g-4 p-3 mt-5 five-columns"> </div>
                </div>
              </div>
              <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
              <script src="//ltn.hitomi.la/searchlib.js"></script>
              <script src="//ltn.hitomi.la/search.js"></script>
            </body>
        </html>
    `;

    const CSS_CONTENT = `
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
        <title>Hitomi Enhanced</title>
        <style>
            .card { display: flex; flex-direction: column; width: 230px; margin: auto; }
            .card-title { font-weight: bold; text-decoration: none; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; word-break: break-all; }
            .card-img-top { object-fit: cover; }
            .card-body { display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 5px; }
            .ImageContainer { overflow: hidden; }
            .ImageContainer img { object-fit: cover; width: 100%; height: 250px; }
            .tags-container { scrollbar-width: none; -ms-overflow-style: none; display: flex; overflow-x: auto; white-space: nowrap; background-color: #00000038; margin: 3%; width: 100%; }
            .tags-container a { margin-right: 5%; text-decoration: none; }
            .page-container { text-align: center; padding-bottom: 3%; }
            .page-container li { display: inline-block; padding: 0 2px; }
            .page-container a { text-decoration: none; padding: 4px; color: #444455; }
            .page-container a:hover { text-decoration: none; color: #fff; background-color: #282e3b; }
            .popup { position: relative; }
            .popuptext { visibility: hidden; width: 250px; background-color: #555; color: #fff; border-radius: 6px; position: absolute; z-index: 10; top: -40px; left: 50%; transform: translateX(-50%); }
            .popuptext.show { visibility: visible; }
            h6.badge { margin-top: auto; margin-bottom: 0px; align-self: flex-start; }
            .dropdown-menu { margin-top: 10%; padding: 0px; width: 100%; }
            .header-sort-select { display: flex; justify-content: end; }
            strong { color: cyan; }
            .TableContainer { display: flex; flex-direction: column; align-items: center; overflow-x: auto; }
            .TableContainer table { table-layout: fixed; width: 100%; }
            .TableContainer td a { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-decoration: none; }
            .colon { width: 7%; text-align: center; }
            .type { width: 37%; }
            .col { display: flex; width: 40%; padding-left: 3px; padding-right: 3px; }
            .default-query-container { margin-top: 10px; display: flex; }
            .default-query-badges { display: flex; overflow: auto; margin-bottom: 5px; gap: 5px; scrollbar-width: none; -ms-overflow-style: none; }
            .default-query-input { width: 150px; }
            .save-default-btn { margin-top: 5px; }
            .sticky-navbar { display: flex; position: sticky; top: 0; z-index: 1000; background-color: #343a40; }
            .tag-picker-btn { margin-right: auto; }
            .highlighted-tag { border: 2px solid yellow !important; }
            .sticky-navbar button { font-size: 14px; }
            .numstar-container { display: flex; width: 100%; justify-content: space-between; gap: 10px; align-items: center; margin-top: auto; }
            .star { display: flex; margin: 0; gap: 3px; color: #ffc107; font-size: x-small; align-items: flex-end; }
            .star i { font-size: 14px; }
            .navbar-collapse { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; }
            .navbar-nav.me-auto { flex-grow: 1; margin-right: 10px; }
            .SearchContainer { flex-shrink: 1; min-width: 0; }
            .sticky-navbar--static { display: flex; position: static; top: 0; background-color: #343a40; }
            .sticky-navbar--static button { font-size: 14px; }
            .hyphen { margin: 1%; }
            .page-count-container { display: flex; margin-top: 10px; }
            #sort-pagecount-start { flex: 1; }
            #sort-pagecount-end { flex: 2; }
            .loading { opacity: 0.7; pointer-events: none; }
            @media (max-width: 991px) {
                .navbar-nav.me-auto { margin-right: 0; flex-basis: 100%; margin-bottom: 10px; }
                .SearchContainer { flex-basis: 100%; max-width: 100%; }
                .default-query-container { flex-direction: column; align-items: stretch; }
                .default-query-input { width: 100%; }
            }
            @media (max-width: 480px) {
                .ImageContainer img { height: 170px; }
                .card { font-size: 70%; }
            }
            @media (min-width: 481px) and (max-width: 992px) {
                .ImageContainer img { height: 220px; }
            }
            @media (min-width: 768px) { .col { width: 30%; } }
            @media (min-width: 992px) and (max-width: 1199px) { .col { width: 25%; } }
            @media (min-width: 992px) { .SearchContainer { max-width: 490px; } }
        </style>
    `;

    // Storage management
    async function loadPageCountFromStorage() {
        console.log('Loading page count from storage');
        const savedPageCount = localStorage.getItem('hitomiDefaultPageCount');
        if (savedPageCount) {
            try {
                const pageCountArray = JSON.parse(savedPageCount);
                const start = pageCountArray[0] || '0';
                const end = pageCountArray[1] || '0';

                state.count_start = start;
                state.count_end = end;

                const startInput = document.getElementById('sort-pagecount-start');
                const endInput = document.getElementById('sort-pagecount-end');

                if (startInput) startInput.value = start;
                if (endInput) endInput.value = end;
            } catch (e) {
                console.error('Error parsing page count from storage:', e);
            }
        }
    }

    async function savePageCountToStorage() {
        console.log('Saving page count to storage');
        const startInput = document.getElementById('sort-pagecount-start');
        const endInput = document.getElementById('sort-pagecount-end');

        const start = startInput?.value.trim() || '';
        const end = endInput?.value.trim() || '';
        const pageCountArray = [start, end];

        localStorage.setItem('hitomiDefaultPageCount', JSON.stringify(pageCountArray));
        console.log('Page count saved:', pageCountArray);
    }

    // Content observation with async/await
    async function observeGalleryContents(targetDoc, isInitialPage = false, timeout = 10000) {
        console.log('Observing gallery contents');

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                observer.disconnect();
                reject(new Error('Gallery content observation timeout'));
            }, timeout);

            const observer = new MutationObserver(() => {
                try {
                    const divGalleryContents = targetDoc.querySelectorAll('div.gallery-content div');
                    const divPageContainers = $(targetDoc).find('div.page-container');
                    const divHeaderSortSelect = $(targetDoc).find('div.header-sort-select');

                    if (divPageContainers.length > 0) {
                        // Store reference for later use
                        state.divNextPage = divPageContainers;
                    }
                    if (divHeaderSortSelect.length > 0) {
                        state.divHeaderSortSelect = divHeaderSortSelect;
                    }

                    if (divGalleryContents.length > 2) {
                        clearTimeout(timeoutId);
                        observer.disconnect();

                        const filteredContents = Array.from(divGalleryContents).filter(element =>
                            Array.from(element.classList).some(cls => state.validClasses.includes(cls))
                        ).map(element => isInitialPage ? $(element).get()[0] : element.cloneNode(true));

                        resolve(filteredContents);
                    }
                } catch (error) {
                    clearTimeout(timeoutId);
                    observer.disconnect();
                    reject(error);
                }
            });

            observer.observe(targetDoc.body, { childList: true, subtree: true });
        });
    }

    // Async page count retrieval with caching
    async function getPageCount(id) {
        console.log(`Getting page count for ID: ${id}`);

        // Check cache first
        if (state.hitomiJsonMap[id]?.pages) {
            console.log('Found in cache:', state.hitomiJsonMap[id].pages);
            return state.hitomiJsonMap[id].pages;
        }

        // Fallback to script loading
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = `https://ltn.gold-usergeneratedcontent.net/galleries/${id}.js`;
            script.onload = () => {
                try {
                    if (typeof galleryinfo !== 'undefined' && galleryinfo.files) {
                        const pageCount = galleryinfo.files.length;
                        // Cache the result
                        if (!state.hitomiJsonMap[id]) {
                            state.hitomiJsonMap[id] = {};
                        }
                        state.hitomiJsonMap[id].pages = pageCount;
                        resolve(pageCount);
                    } else {
                        console.error('Gallery info not found for ID:', id);
                        resolve('N/A');
                    }
                } catch (error) {
                    console.error('Error processing gallery info:', error);
                    resolve('N/A');
                } finally {
                    document.head.removeChild(script);
                }
            };
            script.onerror = () => {
                console.error('Failed to load gallery script:', id);
                document.head.removeChild(script);
                resolve('N/A');
            };
            document.head.appendChild(script);
        });
    }

    // Enhanced card generation with better async handling
    async function generateCard(contentUrl, title, imgPicture, tags, seriesList, language, type, artistList, stars = 0) {
        console.log('Generating card for:', title);

        try {
            const divCol = $('<div class="col"></div>');
            $('.row').append(divCol);
            const divCard = $('<div class="card h-100"></div>');
            divCol.append(divCard);

            // Image container
            const imageContainer = $('<div class="ImageContainer"></div>');
            divCard.append(imageContainer);
            const aImgUrl = $('<a></a>').attr('href', contentUrl);
            imageContainer.append(aImgUrl);
            const imgTop = $(imgPicture).addClass('card-img-top');
            aImgUrl.append(imgTop);

            // Card body
            const divCardBody = $('<div class="card-body"></div>');
            divCard.append(divCardBody);
            const tableContainer = $('<div class="TableContainer"></div>');
            divCardBody.append(tableContainer);

            const aCardTitle = $('<a class="card-title"></a>').attr('href', contentUrl).text(title);
            tableContainer.append(aCardTitle);

            const table = $('<table><tbody></tbody></table>');
            tableContainer.append(table);
            const tbody = table.find('tbody');

            // Helper function for rows
            const appendListRow = (type, listOrItem, container, defaultText = 'N/A') => {
                const isList = Array.isArray(listOrItem) || listOrItem instanceof NodeList;
                const list = isList ? Array.from(listOrItem) : [listOrItem];
                const text = list.length && list[0].textContent ? list[0].textContent : defaultText;
                const rawUrl = list.length && list[0].href ? list[0].href : "#";
                const typeContent = rawUrl.match(/^https:\/\/hitomi\.la\/.*\/(.*)-all\.html$/) || rawUrl.match(/^https:\/\/hitomi\.la\/index-(.*)\.html$/);
                const aTag = $(`<a>${text}</a>`);

                tbody.append(`<tr><td class="type">${type}</td><td class="colon">:</td><td></td></tr>`);
                tbody.find('tr:last td:last').append(aTag);

                if (list.length && list[0].textContent) {
                    const defaultUrl = getDefaultUrl();
                    aTag.attr('href', state.defaultQuery === '' ? rawUrl : `${defaultUrl} ${type}:${typeContent[1]}`);
                }

                if (isList && list.length > 1) {
                    const popup = $(`<div class="popup"><i class="bi bi-info-square"></i><span class="popuptext">${list.slice(1).map(s => `${type}: ${s.textContent}`).join('<br>')}</span></div>`);
                    container.append(popup);
                }
            };

            appendListRow('language', language, divCardBody);
            appendListRow('type', type, divCardBody, 'Unknown');
            appendListRow('artist', artistList, divCardBody);
            appendListRow('series', seriesList, divCardBody);

            // Extract gallery ID
            const reNum = contentUrl.match(/.*-(\d+)\.html/);
            const galleryId = reNum?.[1];

            if (!galleryId) {
                console.log('Failed to extract gallery ID from URL:', contentUrl);
                return;
            }

            // Number and star container
            const divNumstarContainer = $('<div class="numstar-container"></div>');
            divCardBody.append(divNumstarContainer);
            const h6Pagenum = $('<h6 class="badge bg-secondary">Loading...</h6>');
            divNumstarContainer.append(h6Pagenum);

            // Get page count asynchronously
            getPageCount(galleryId).then(pageCount => {
                h6Pagenum.text(`${pageCount}p`);
            });

            // Star rating
            const h6Star = $('<h6 class="star"></h6>');
            const jsonItem = state.resultJsonMap[galleryId];

            if (jsonItem) {
                const aStarHref = $("<a></a>").attr("href", jsonItem.dmm_url);
                const finalStars = jsonItem.stars || 0;
                const filledStars = Math.floor(finalStars / 10);
                const numStars = jsonItem.num_stars;
                const hasHalfStar = finalStars % 10 >= 5 ? 1 : 0;

                if (finalStars > 0) {
                    for (let i = 0; i < filledStars; i++) {
                        h6Star.append('<i class="bi bi-star-fill"></i>');
                    }
                    if (hasHalfStar) {
                        h6Star.append('<i class="bi bi-star-half"></i>');
                    }
                    h6Star.append(numStars);
                    aStarHref.append(h6Star);
                }
                divNumstarContainer.append(aStarHref);
            }

            // Tags container
            const divTagsContainer = $('<div class="tags-container"></div>');
            divCardBody.append(divTagsContainer);

            if (tags.length === 0) {
                divTagsContainer.append('<span class="badge bg-primary"></span>');
            } else {
                Array.from(tags).forEach(tag => {
                    const clone = tag.cloneNode(true);
                    if (clone.textContent === '...') return;

                    if (clone.href) {
                        const tagUrl = clone.href.match(/\/tag\/(.*)-all.html/);
                        if (tagUrl?.[1]) {
                            clone.className = 'badge bg-primary';
                            const defaultUrl = getDefaultUrl();
                            clone.href = state.defaultQuery === '' ? clone.href :
                                `${defaultUrl} ${encode_search_query_for_url(decodeURIComponent(tagUrl[1]))}`;
                            divTagsContainer.append(clone);
                        }
                    }
                });
            }
        } catch (error) {
            console.error('Error generating card:', error);
        }
    }

    // Utility function to get default URL
    function getDefaultUrl() {
        return state.defaultQuery ? `https://hitomi.la/search.html?${encodeURI(state.defaultQuery)}` : 'https://hitomi.la/';
    }

    // Enhanced event setup functions
    function setupTagScrollEvents() {
        console.log('Setting up tag scroll events');
        const addWheelListener = (selector) => {
            const elements = document.getElementsByClassName(selector);
            Array.from(elements).forEach(element => {
                element.addEventListener('wheel', (event) => {
                    event.preventDefault();
                    element.scrollLeft += event.deltaY;
                }, { passive: false });
            });
        };

        addWheelListener('default-query-badges');
        addWheelListener('tags-container');
    }

    function setupPopupEvents() {
        console.log('Setting up popup events');
        document.body.addEventListener('click', (e) => {
            const popup = e.target.closest('.popup');
            if (popup) {
                e.preventDefault();
                const popuptext = popup.querySelector('.popuptext');
                if (popuptext) {
                    popuptext.classList.toggle('show');
                }
            }
        });
    }

    async function setupCountInputEventListeners() {
        console.log('Setting up count input event listeners');
        await loadPageCountFromStorage();

        const inputStart = document.getElementById('sort-pagecount-start');
        const inputEnd = document.getElementById('sort-pagecount-end');

        if (inputStart) {
            inputStart.addEventListener('input', debounce(() => {
                const value = inputStart.value.trim();
                state.count_start = value || '0';
                savePageCountToStorage();
            }, CONFIG.DEBOUNCE_DELAY));
        }

        if (inputEnd) {
            inputEnd.addEventListener('input', debounce(() => {
                const value = inputEnd.value.trim();
                state.count_end = value || '0';
                savePageCountToStorage();
            }, CONFIG.DEBOUNCE_DELAY));
        }
    }

    // Enhanced filtering with async page count
    async function filterContents(item) {
        console.log("Filtering contents");
        await loadPageCountFromStorage();

        const h1Element = item.querySelector('h1.lillie a');
        const url = h1Element?.href;

        if (!url) {
            console.log('No valid URL found in h1 element');
            return false;
        }

        const reNum = url.match(/.*-(\d+)\.html/);
        const galleryId = reNum?.[1];

        if (!galleryId) {
            console.log('Failed to extract gallery ID from URL:', url);
            return false;
        }

        try {
            const pageCount = await getPageCount(galleryId);
            if (pageCount === null || pageCount === undefined || pageCount === 'N/A') {
                console.log('Failed to retrieve page count for gallery:', galleryId);
                return false;
            }

            const numPageCount = parseInt(pageCount, 10);
            const startCount = parseInt(state.count_start, 10) || 0;
            const endCount = parseInt(state.count_end, 10) || 0;

            if (startCount === 0 && endCount === 0) {
                return true;
            }

            if (startCount > 0 && endCount > 0) {
                return numPageCount >= startCount && numPageCount <= endCount;
            } else if (startCount > 0) {
                return numPageCount >= startCount;
            } else if (endCount > 0) {
                return numPageCount <= endCount;
            }

            return true;
        } catch (error) {
            console.error('Error filtering content:', error);
            return false;
        }
    }

    // Enhanced initialization with better error handling
    async function initializePage() {
        console.log('Initializing page');

        try {
            const initialContents = await observeGalleryContents(document, true);

            document.documentElement.innerHTML = HTML_CONTENT;
            document.head.insertAdjacentHTML('beforeend', CSS_CONTENT);
            document.querySelector('html').setAttribute('data-bs-theme', 'dark');

            const htmlContainer = document.querySelector('.container');
            const htmlRow = document.querySelector('.row');

            if (state.divNextPage) {
                htmlContainer.appendChild(state.divNextPage[1]);
            }

            // Create custom sort dropdown
            const newSelect = document.createElement('select');
            newSelect.id = 'custom_sort';
            newSelect.innerHTML = `
                <option value="value1">-</option>
                <option value="value2">star sort</option>
            `;

            if (state.divHeaderSortSelect) {
                state.divHeaderSortSelect[0].appendChild(newSelect);
                htmlRow.appendChild(state.divHeaderSortSelect[0]);
            }

            // Process initial contents with concurrent filtering and card generation
            const filteredContents = [];
            for (const item of initialContents) {
                if (await filterContents(item)) {
                    filteredContents.push(item);
                }
            }

            // Generate cards concurrently in batches
            const cardPromises = filteredContents.map(async (item) => {
                const h1Element = item.querySelector('h1.lillie a');
                return generateCard(
                    h1Element?.href || '#',
                    h1Element?.textContent || 'Unknown',
                    item.querySelector('div[class$="-img1"] picture'),
                    item.querySelectorAll('td.relatedtags ul li a'),
                    item.querySelectorAll('td.series-list ul li a'),
                    item.querySelector('table.dj-desc tbody tr:nth-child(3) td a') || { textContent: 'Unknown', href: '#' },
                    item.querySelector('table.dj-desc tbody tr:nth-child(2) td a') || { textContent: 'Unknown', href: '#' },
                    item.querySelectorAll('div.artist-list ul li a') || { textContent: 'Unknown', href: '#' },
                    0
                );
            });

            await Promise.all(cardPromises);

            setupPopupEvents();
            await setupCountInputEventListeners();
            setupTagScrollEvents();
            setupTagPicker();

            state.isInitialized = true;
            console.log('Page initialization completed');

        } catch (error) {
            console.error('Error during page initialization:', error);
        }
    }

    // Enhanced iframe loading with better error handling
    async function loadNextPageInIframe(url) {
        console.log('Loading next page in iframe:', url);

        return new Promise((resolve, reject) => {
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'position: fixed; top: 0; left: 0; width: 1px; height: 1px; border: 0; visibility: hidden;';
            iframe.sandbox = 'allow-same-origin allow-scripts';
            iframe.src = url;

            const timeout = setTimeout(() => {
                document.body.removeChild(iframe);
                reject(new Error('Iframe loading timeout'));
            }, 15000);

            iframe.onload = async () => {
                try {
                    clearTimeout(timeout);
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    const nextContents = await observeGalleryContents(iframeDoc);

                    const filteredContents = [];
                    for (const item of nextContents) {
                        if (await filterContents(item)) {
                            filteredContents.push(item);
                        }
                    }

                    const cardPromises = filteredContents.map(async (item) => {
                        const h1Element = item.querySelector('h1.lillie a');
                        return generateCard(
                            h1Element?.href || '#',
                            h1Element?.textContent || 'Unknown',
                            item.querySelector('div[class$="-img1"] picture'),
                            item.querySelectorAll('td.relatedtags ul li a'),
                            item.querySelectorAll('td.series-list ul li a'),
                            item.querySelector('table.dj-desc tbody tr:nth-child(3) td a') || { textContent: 'Unknown', href: '#' },
                            item.querySelector('table.dj-desc tbody tr:nth-child(2) td a') || { textContent: 'Unknown', href: '#' },
                            item.querySelectorAll('div.artist-list ul li a') || { textContent: 'Unknown', href: '#' },
                            0
                        );
                    });

                    await Promise.all(cardPromises);

                    console.log(`Page ${state.currentPage} loaded successfully`);
                    state.hasFetched = false;
                    setupPopupEvents();
                    await setupCountInputEventListeners();
                    setupTagScrollEvents();

                    resolve();
                } catch (error) {
                    console.error('Failed to load next page:', error);
                    reject(error);
                } finally {
                    document.body.removeChild(iframe);
                }
            };

            iframe.onerror = () => {
                clearTimeout(timeout);
                document.body.removeChild(iframe);
                reject(new Error('Iframe loading failed'));
            };

            document.body.appendChild(iframe);
        });
    }

    // Enhanced URL generation
    function getNextPageUrl() {
        console.log('Getting next page URL');
        const baseUrl = window.location.href.split('#')[0];
        const reUrl = /\.html$/;
        state.currentPage += 1;

        if (window.location.href.match(reUrl) || baseUrl === 'https://hitomi.la/') {
            const urlParts = baseUrl.split('page=');
            return `${urlParts[0]}?page=${state.currentPage}`;
        } else {
            return `${baseUrl}#${state.currentPage}`;
        }
    }

    // Enhanced custom sort with better performance
    async function setupCustomSort() {
        console.log('Setting up custom sort');
        const newSelect = document.getElementById('custom_sort');

        if (newSelect) {
            newSelect.addEventListener('change', async (e) => {
                if (e.target.value === 'value2') {
                    state.currentBatchIndex = 0;
                    state.jsonData = [];
                    $('.row').empty();

                    // Sort by stars and process
                    state.jsonData = Object.values(state.resultJsonMap)
                        .filter(item => item && typeof item.stars === 'number')
                        .sort((a, b) => (b.stars || 0) - (a.stars || 0));

                    await processBatch();
                }
            });
        }
    }

    // Enhanced batch processing
    async function processBatch() {
        console.log('Processing batch');

        if (state.currentBatchIndex >= state.jsonData.length) {
            console.log('No more data to process');
            return;
        }

        const divGalleryContent = document.createElement('div');
        divGalleryContent.className = 'gallery-content';
        divGalleryContent.style.cssText = 'position: fixed; top: 0; left: 0; width: 1px; height: 1px; border: 0; visibility: hidden;';
        document.body.appendChild(divGalleryContent);

        try {
            const dataBatch = state.jsonData.slice(state.currentBatchIndex, state.currentBatchIndex + CONFIG.BATCH_SIZE);
            state.currentBatchIndex += CONFIG.BATCH_SIZE;

            const fetchPromises = dataBatch.map(async (item) => {
                const id = item.id;
                const stars = item.stars || 0;
                const url = `https://ltn.gold-usergeneratedcontent.net/galleryblock/${id}.html`;

                try {
                    const response = await $.get(url);
                    let html = typeof rewrite_tn_paths === 'function' ? rewrite_tn_paths(response) : response;

                    const domElements = $.parseHTML(html);
                    const container = document.createElement('div');
                    container.append(...domElements);
                    divGalleryContent.appendChild(container);

                    // Apply post-processing functions if available
                    if ('loading' in HTMLImageElement.prototype && typeof flip_lazy_images === 'function') {
                        flip_lazy_images();
                    }
                    if (typeof moveimages === 'function') moveimages();
                    if (typeof localDates === 'function') localDates();
                    if (typeof limitLists === 'function') limitLists();

                    return { container, stars };
                } catch (error) {
                    console.error(`Failed to fetch HTML from ${url}:`, error);
                    return null;
                }
            });

            const results = await Promise.all(fetchPromises);

            const cardPromises = results
                .filter(result => result !== null)
                .flatMap(({ container, stars }) => {
                    const galleryItems = Array.from(container.children).filter(element =>
                        Array.from(element.classList).some(cls => state.validClasses.includes(cls))
                    );

                    return galleryItems.map(item => {
                        const h1Element = item.querySelector('h1.lillie a');
                        return generateCard(
                            h1Element?.href || '#',
                            h1Element?.textContent || 'Unknown',
                            item.querySelector('div[class$="-img1"] picture'),
                            item.querySelectorAll('td.relatedtags ul li a'),
                            item.querySelectorAll('td.series-list ul li a'),
                            item.querySelector('table.dj-desc tbody tr:nth-child(3) td a') || { textContent: 'Unknown', href: '#' },
                            item.querySelector('table.dj-desc tbody tr:nth-child(2) td a') || { textContent: 'Unknown', href: '#' },
                            item.querySelectorAll('div.artist-list ul li a') || { textContent: 'Unknown', href: '#' },
                            stars
                        );
                    });
                });

            await Promise.all(cardPromises);

            setupPopupEvents();
            await setupCountInputEventListeners();
            setupTagScrollEvents();
            state.hasFetched = false;

        } catch (error) {
            console.error('Error processing batch:', error);
            state.hasFetched = false;
        } finally {
            document.body.removeChild(divGalleryContent);
        }
    }

    // Enhanced scroll handler with debouncing
    const debouncedScrollHandler = debounce(async () => {
        if (state.hasFetched || !state.isInitialized) return;

        const scrollPercentage = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;

        if (scrollPercentage >= CONFIG.SCROLL_THRESHOLD) {
            state.hasFetched = true;

            try {
                if (state.jsonData.length > 0) {
                    await processBatch();
                } else {
                    await loadNextPageInIframe(getNextPageUrl());
                }
            } catch (error) {
                console.error('Error in scroll handler:', error);
                state.hasFetched = false;
            }
        }
    }, CONFIG.DEBOUNCE_DELAY);

    window.addEventListener('scroll', debouncedScrollHandler, { passive: true });

    // Enhanced hash change handler
    const lastUrl = [];
    window.addEventListener('hashchange', () => {
        lastUrl.push(location.hash);
        if (lastUrl.length >= 2 && lastUrl.at(-2) !== lastUrl.at(-1)) {
            location.reload();
        }
    });

    // Enhanced default query editor
    function setupDefaultQueryEditor() {
        console.log('Setting up default query editor');
        const badgesContainer = document.querySelector('.default-query-badges');
        const defaultQueryInput = document.getElementById('default-query-input');
        const saveButton = document.getElementById('save-default-btn');

        if (!badgesContainer || !defaultQueryInput || !saveButton) {
            console.error('Default query editor elements not found');
            return;
        }

        function updateBadges() {
            badgesContainer.innerHTML = '';
            const queryParts = state.defaultQuery.split(' ').filter(part => part.trim());

            queryParts.forEach(part => {
                const badge = document.createElement('span');
                badge.className = part.match(/^-/) ?
                    'badge bg-danger d-flex align-items-center' :
                    'badge bg-success d-flex align-items-center';
                badge.innerHTML = `${part} <button type="button" class="btn-close btn-close-white ms-1" aria-label="Remove"></button>`;
                badgesContainer.appendChild(badge);

                badge.querySelector('.btn-close').addEventListener('click', () => {
                    state.defaultQuery = state.defaultQuery.split(' ').filter(p => p !== part).join(' ');
                    updateBadges();
                    updateUrl();
                    saveQuery();
                });
            });
        }

        function updateUrl() {
            const newDefaultUrl = state.defaultQuery ?
                `https://hitomi.la/search.html?${encodeURI(state.defaultQuery)}` :
                'https://hitomi.la/';
            const navbarBrand = document.querySelector('.navbar-brand');
            if (navbarBrand) {
                navbarBrand.href = newDefaultUrl;
            }
        }

        function saveQuery() {
            localStorage.setItem('hitomiDefaultQuery', state.defaultQuery);
            savePageCountToStorage();
            console.log('Default query saved:', state.defaultQuery);
            saveButton.textContent = 'Saved!';
            setTimeout(() => saveButton.textContent = 'Save', 1000);
        }

        function addQuery() {
            const inputValue = defaultQueryInput.value.trim();
            if (inputValue) {
                state.defaultQuery += state.defaultQuery ? ` ${inputValue}` : inputValue;
                defaultQueryInput.value = '';
                updateBadges();
                updateUrl();
                saveQuery();
            }
        }

        defaultQueryInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addQuery();
            }
        });

        saveButton.addEventListener('click', () => {
            addQuery();
        });

        updateBadges();
    }

    // Enhanced search setup
    function setupSearch() {
        console.log('Setting up search');
        const input = document.getElementById('query-input');
        const form = document.querySelector('form[role="search"]');
        const stickyNavbar = document.querySelector('.sticky-navbar');

        if (!input || !form || !stickyNavbar) {
            console.error('Search elements not found');
            return;
        }

        input.addEventListener("focus", () => {
            stickyNavbar.classList.add('sticky-navbar--static');
            stickyNavbar.classList.remove('sticky-navbar');
        });

        input.addEventListener("blur", () => {
            stickyNavbar.classList.remove('sticky-navbar--static');
            stickyNavbar.classList.add('sticky-navbar');
        });

        // Create hidden suggestions container
        const hiddenSuggestions = document.createElement('ul');
        hiddenSuggestions.id = 'search-suggestions';
        hiddenSuggestions.style.display = 'none';
        document.body.appendChild(hiddenSuggestions);

        const suggestionsContainer = document.createElement('div');
        suggestionsContainer.className = 'dropdown-menu';
        form.appendChild(suggestionsContainer);

        const updateSuggestionsVisibility = () => {
            suggestionsContainer.classList.toggle('show',
                suggestionsContainer.children.length > 0 && input === document.activeElement);
        };

        let committedValue = '';
        let lastInput = '';

        const updateDropdown = () => {
            suggestionsContainer.innerHTML = '';
            const suggestions = hiddenSuggestions.children;

            Array.from(suggestions).forEach(suggestion => {
                const item = document.createElement('a');
                item.className = 'dropdown-item d-flex justify-content-between align-items-center text-wrap';
                item.href = '#';

                const textContainer = document.createElement('span');
                const searchResult = suggestion.querySelector('.search-result')?.innerHTML || '';
                const searchNs = suggestion.querySelector('.search-ns')?.textContent || '';
                textContainer.innerHTML = `${searchResult}${searchNs}`;

                const total = document.createElement('span');
                total.className = 'text-muted ms-2';
                total.textContent = suggestion.querySelector('.search-suggestion_total')?.textContent || '';

                item.appendChild(textContainer);
                item.appendChild(total);

                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const searchString = suggestion.querySelector('.search-result')?.textContent || '';
                    const reNs = /\((.*)\)$/;
                    const tagMatch = searchNs.match(reNs);
                    const tag = tagMatch?.[1] || '';
                    const inputValue = encode_search_query_for_url(`${tag}:${searchString}`);

                    if (searchString && tag) {
                        const currentValue = input.value.trim();
                        if (lastInput && currentValue.endsWith(lastInput)) {
                            input.value = currentValue.slice(0, -lastInput.length).trim() +
                                (committedValue ? ' ' : '') + inputValue;
                        } else {
                            input.value = committedValue + (committedValue ? ' ' : '') + inputValue;
                        }
                        committedValue = input.value;
                        lastInput = '';
                    }
                    updateSuggestionsVisibility();
                });

                suggestionsContainer.appendChild(item);
            });
            updateSuggestionsVisibility();
        };

        const debouncedInputHandler = debounce(() => {
            const currentValue = input.value.trim();
            if (!currentValue) {
                lastInput = '';
                committedValue = '';
            } else {
                lastInput = currentValue.slice(committedValue.length).trim();
            }

            if (typeof handle_keyup_in_search_box === 'function') {
                handle_keyup_in_search_box();
            }

            setTimeout(updateDropdown, 50);
        }, CONFIG.DEBOUNCE_DELAY);

        input.addEventListener('input', debouncedInputHandler);
        input.addEventListener('focus', updateSuggestionsVisibility);
        input.addEventListener('blur', () => setTimeout(updateSuggestionsVisibility, 100));

        const handleSearchQuery = () => {
            const userQuery = input.value.trim();
            const combinedQuery = userQuery ?
                `${state.defaultQuery} ${userQuery}` :
                state.defaultQuery;
            window.location.href = `https://hitomi.la/search.html?${encodeURI(combinedQuery)}`;
        };

        input.addEventListener('keydown', e => {
            if (e.keyCode === 13) {
                e.preventDefault();
                handleSearchQuery();
            }
        });

        form.addEventListener('submit', e => {
            e.preventDefault();
            handleSearchQuery();
        });

        new MutationObserver(updateDropdown).observe(hiddenSuggestions, {
            childList: true,
            subtree: true
        });
    }

    // Enhanced tag picker
    function setupTagPicker() {
        console.log('Setting up tag picker');
        const pickerBtn = document.getElementById('tag-picker-btn');
        const addBtn = document.getElementById('add-tag-btn');
        const excludeBtn = document.getElementById('exclude-tag-btn');

        if (!pickerBtn || !addBtn || !excludeBtn) {
            console.error('Tag picker elements not found');
            return;
        }

        let isPickerActive = false;
        let selectedTag = null;
        let selectedType = null;

        function updatePickerButton(btn, active) {
            btn.innerHTML = active ? 'Select Tag or Type' : '';
            const icon = document.createElement('i');
            icon.className = 'bi bi-eyedropper';
            icon.style.marginLeft = '5px';
            btn.appendChild(icon);
        }

        function extractTagFromHref(href) {
            const match = href.match(/\/tag\/(.*)-all.html/) || href.match(/.*%20(.*)/);
            return match ? encode_search_query_for_url(decodeURIComponent(match[1])) : null;
        }

        function extractTypeFromTable(a) {
            const hrefValue = a.getAttribute('href');
            let match;

            match = hrefValue.match(/^https:\/\/hitomi\.la\/(.*)\/(.*)-all\.html$/);
            if (match) {
                return `${match[1]}:${encode_search_query_for_url(decodeURIComponent(match[2]))}`;
            }

            match = hrefValue.match(/^https:\/\/hitomi\.la\/index-(.*)\.html$/);
            if (match) {
                return `language:${match[1]}`;
            }

            match = hrefValue.match(/.* (.*)/);
            if (match) {
                return match[1];
            }

            return null;
        }

        function updateDefaultQueryUI() {
            const badgesContainer = document.querySelector('.default-query-badges');
            if (!badgesContainer) return;

            badgesContainer.innerHTML = '';
            const queryParts = state.defaultQuery.split(' ').filter(part => part.trim());

            queryParts.forEach(part => {
                const badge = document.createElement('span');
                badge.className = part.match(/^-/) ?
                    'badge bg-danger d-flex align-items-center' :
                    'badge bg-success d-flex align-items-center';
                badge.innerHTML = `${part} <button type="button" class="btn-close btn-close-white ms-1" aria-label="Remove"></button>`;
                badgesContainer.appendChild(badge);

                badge.querySelector('.btn-close').addEventListener('click', () => {
                    state.defaultQuery = state.defaultQuery.split(' ').filter(p => p !== part).join(' ');
                    updateDefaultQueryUI();

                    const defaultUrl = getDefaultUrl();
                    const navbarBrand = document.querySelector('.navbar-brand');
                    if (navbarBrand) navbarBrand.href = defaultUrl;

                    localStorage.setItem('hitomiDefaultQuery', state.defaultQuery);
                });
            });

            const defaultUrl = getDefaultUrl();
            const navbarBrand = document.querySelector('.navbar-brand');
            if (navbarBrand) navbarBrand.href = defaultUrl;
        }

        pickerBtn.addEventListener('click', () => {
            isPickerActive = !isPickerActive;
            pickerBtn.classList.toggle('btn-warning', isPickerActive);
            updatePickerButton(pickerBtn, isPickerActive);
            addBtn.disabled = !isPickerActive;
            excludeBtn.disabled = !isPickerActive;

            if (!isPickerActive) {
                if (selectedTag) {
                    selectedTag.classList.remove('highlighted-tag');
                    selectedTag = null;
                }
                if (selectedType) {
                    selectedType.classList.remove('highlighted-tag');
                    selectedType = null;
                }
            }
        });

        document.addEventListener('click', (e) => {
            if (!isPickerActive) return;

            const tag = e.target.closest('.tags-container .badge');
            if (tag) {
                e.preventDefault();
                if (selectedTag) selectedTag.classList.remove('highlighted-tag');
                tag.classList.add('highlighted-tag');
                selectedTag = tag;
                return;
            }

            const type = e.target.closest('table tr td a');
            if (type) {
                e.preventDefault();
                if (selectedType) selectedType.classList.remove('highlighted-tag');
                type.classList.add('highlighted-tag');
                selectedType = type;
            }
        });

        addBtn.addEventListener('click', () => {
            let textToAdd = null;

            if (selectedTag) {
                textToAdd = extractTagFromHref(selectedTag.href);
                selectedTag.classList.remove('highlighted-tag');
                selectedTag = null;
            } else if (selectedType) {
                textToAdd = extractTypeFromTable(selectedType);
                selectedType.classList.remove('highlighted-tag');
                selectedType = null;
            }

            if (textToAdd && !state.defaultQuery.includes(textToAdd)) {
                state.defaultQuery += state.defaultQuery ? ` ${textToAdd}` : textToAdd;
                localStorage.setItem('hitomiDefaultQuery', state.defaultQuery);
                updateDefaultQueryUI();
            }
        });

        excludeBtn.addEventListener('click', () => {
            let textToExclude = null;

            if (selectedTag) {
                textToExclude = extractTagFromHref(selectedTag.href);
                selectedTag.classList.remove('highlighted-tag');
                selectedTag = null;
            } else if (selectedType) {
                textToExclude = extractTypeFromTable(selectedType);
                selectedType.classList.remove('highlighted-tag');
                selectedType = null;
            }

            if (textToExclude) {
                const excludeText = `-${textToExclude}`;
                if (!state.defaultQuery.includes(excludeText)) {
                    state.defaultQuery += state.defaultQuery ? ` ${excludeText}` : excludeText;
                    localStorage.setItem('hitomiDefaultQuery', state.defaultQuery);
                    updateDefaultQueryUI();
                }
            }
        });

        updatePickerButton(pickerBtn, isPickerActive);
    }

    // Enhanced main initialization
    async function main() {
        console.log('Starting Hitomi Enhanced (Optimized)');

        try {
            // Check if we need to redirect to default query
            const defaultUrl = getDefaultUrl();
            if (state.defaultQuery && window.location.href === 'https://hitomi.la/') {
                window.location.href = defaultUrl;
                return;
            }

            // Initialize data concurrently
            console.log('Loading JSON data...');
            const [resultJsonMap, hitomiJsonMap] = await Promise.all([
                getCachedJson(false),
                getCachedJson(true)
            ]);

            state.resultJsonMap = resultJsonMap;
            state.hitomiJsonMap = hitomiJsonMap;

            console.log('JSON data loaded successfully');

            // Initialize page
            await initializePage();

            // Setup all features
            setupSearch();
            setupDefaultQueryEditor();
            await setupCustomSort();

            // Load first additional page
            try {
                await loadNextPageInIframe(getNextPageUrl());
            } catch (error) {
                console.warn('Failed to load first additional page:', error);
            }

            console.log('Hitomi Enhanced initialization completed successfully');

        } catch (error) {
            console.error('Fatal error during initialization:', error);
        }
    }

    // Start the application
    await main();

})();
