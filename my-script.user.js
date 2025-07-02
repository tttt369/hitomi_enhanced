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

    GM_registerMenuCommand('Delete Default Query', deleteDefaultQuery, {
        title: 'Delete Default Query'
    });

    function deleteDefaultQuery() {
        console.log('using deleteDefaultQuery');
        defaultQuery = '';
        localStorage.setItem('hitomiDefaultQuery', '');
    }

    function initIndexedDB() {
        console.log('using initIndexedDB');
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('HitomiEnhancedDB', 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                db.createObjectStore('jsonCache');
            };

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                reject(new Error('IndexedDB initialization failed: ' + event.target.error));
            };
        });
    }

    function storeJsonInIndexedDB(db, jsonData, key) {
        console.log('using storeJsonInIndexedDB');
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['jsonCache'], 'readwrite');
            const store = transaction.objectStore('jsonCache');
            const request = store.put(jsonData, key);

            request.onsuccess = () => resolve(console.log(`Cached JSON with key: ${key}`));
            request.onerror = () => reject(new Error(`Failed to store JSON in IndexedDB: ${request.error}`));
        });
    }

    function getJsonFromIndexedDB(db, key) {
        console.log('using getJsonFromIndexedDB');
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['jsonCache'], 'readonly');
            const store = transaction.objectStore('jsonCache');
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(new Error(`Failed to retrieve JSON from IndexedDB: ${request.error}`));
        });
    }

    async function getCachedJson(hitomi_data = null) {
        console.log('using getCachedJson');
        try {
            const db = await initIndexedDB();
            const isHitomiData = hitomi_data !== null && hitomi_data !== undefined;
            const url = isHitomiData
                ? 'https://raw.githubusercontent.com/tttt369/hitomi_enhanced/master/urls/hitomi_data.json'
                : 'https://raw.githubusercontent.com/tttt369/hitomi_enhanced/master/urls/result.json';
            const cacheKey = isHitomiData ? 'hitomi_data_json' : 'result_json';

            let jsonData = await getJsonFromIndexedDB(db, cacheKey);

            if (!jsonData) {
                jsonData = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: url,
                        onload: (response) => {
                            try {
                                const data = JSON.parse(response.responseText);
                                resolve(data);
                            } catch (e) {
                                reject(new Error('Failed to parse JSON: ' + e.message));
                            }
                        },
                        onerror: () => {
                            reject(new Error(`Failed to fetch JSON from ${url}`));
                        }
                    });
                });
                await storeJsonInIndexedDB(db, jsonData, cacheKey);
            }

            if (typeof jsonData === 'string') {
                try {
                    jsonData = JSON.parse(jsonData);
                } catch (e) {
                    console.error('Failed to parse stored JSON:', e);
                    return {};
                }
            }

            if (isHitomiData) {
                if (typeof jsonData !== 'object' || jsonData === null) {
                    console.error('jsonData is not a valid object:', jsonData);
                    return {};
                }
                return jsonData;
            }

            if (!Array.isArray(jsonData)) {
                console.error('jsonData is not an array:', jsonData);
                return {};
            }

            const resultJsonMap = {};
            jsonData.forEach((item, index) => {
                resultJsonMap[index] = item;
            });

            return resultJsonMap;
        } catch (error) {
            console.error(error);
            return {};
        }
    }

    const resultJsonMap = await getCachedJson();
    const hitomiJsonMap = await getCachedJson(true);

    const html = `
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

    const head = `
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

    const obj_data = {
        div_NextPage: null,
        div_header_sort_select: null
    };

    let jsonData = [];
    let currentBatchIndex = 0;
    const batchSize = 25;

    async function observeGalleryContents(targetDoc, isInitialPage = false) {
        console.log('using observeGalleryContents');
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                const div_gallerycontents = targetDoc.querySelectorAll('div.gallery-content div');
                const div_page_containers = $('div.page-container');
                const div_header_sort_select = $('div.header-sort-select');

                if (div_page_containers.length > 0) obj_data.div_NextPage = div_page_containers;
                if (div_header_sort_select.length > 0) obj_data.div_header_sort_select = div_header_sort_select;
                if (div_gallerycontents.length > 2) {
                    observer.disconnect();
                    const filteredContents = Array.from(div_gallerycontents).filter(element =>
                        Array.from(element.classList).some(cls => validClasses.includes(cls))
                    ).map(element => isInitialPage ? $(element).get()[0] : element.cloneNode(true));
                    resolve(filteredContents);
                }
            });
            observer.observe(targetDoc.body, { childList: true, subtree: true });
        });
    }

    async function getPageCount(id, json) {
        console.log('using getPageCount');
        const item = Object.keys(json).find(key => key == id);
        if (item) {
            console.log('Found in cache', json[item].pages);
            return json[item].pages; // Return directly if found in json
        }

        return new Promise((resolve) => {
            $.getScript(`https://ltn.gold-usergeneratedcontent.net/galleries/${id}.js`)
                .done(() => {
                    if (typeof galleryinfo !== 'undefined' && galleryinfo.files) {
                        const page_count = galleryinfo.files.length;
                        resolve(page_count);
                    } else {
                        console.error('Gallery info not found for ID:', id);
                        resolve('N/A');
                    }
                })
                .fail(() => {
                    console.error('Failed to load gallery script:', id);
                    resolve('N/A');
                });
        });
    }

    async function generateCard(contentUrl, title, imgPicture, Tags, seriesList, language, type, ArtistList, stars = 0, resultJsonMap) {
        console.log('using generateCard');
        const div_col = $('<div class="col"></div>');
        $('.row').append(div_col);
        const div_card = $('<div class="card h-100"></div>');
        div_col.append(div_card);

        const ImageContainer = $('<div class="ImageContainer"></div>');
        div_card.append(ImageContainer);
        const a_ImgUrl = $('<a></a>').attr('href', contentUrl);
        ImageContainer.append(a_ImgUrl);
        const img_top = $(imgPicture).addClass('card-img-top');
        a_ImgUrl.append(img_top);

        const div_card_body = $('<div class="card-body"></div>');
        div_card.append(div_card_body);
        const TableContainer = $('<div class="TableContainer"></div>');
        div_card_body.append(TableContainer);

        const a_card_title = $('<a class="card-title"></a>').attr('href', contentUrl).text(title);
        TableContainer.append(a_card_title);

        const table = $('<table><tbody></tbody></table>');
        TableContainer.append(table);
        const tbody = table.find('tbody');

        const appendListRow = (type, listOrItem, urlPrefix, container, defaultText = 'N/A') => {
            const isList = Array.isArray(listOrItem) || listOrItem instanceof NodeList;
            const list = isList ? Array.from(listOrItem) : [listOrItem];
            const text = list.length && list[0].textContent ? list[0].textContent : defaultText;
            const raw_url = list.length && list[0].href ? list[0].href : "#";
            const type_content = raw_url.match(/^https:\/\/hitomi\.la\/.*\/(.*)-all\.html$/) || raw_url.match(/^https:\/\/hitomi\.la\/index-(.*)\.html$/);
            if (type_content == null) {
                console.log('listOrItem:', text)
            }
            const aTag = $(`<a>${text}</a>`);

            tbody.append(`<tr><td class="type">${type}</td><td class="colon">:</td><td></td></tr>`);
            tbody.find('tr:last td:last').append(aTag);

            if (list.length && list[0].textContent) {
                console.log(defaultQuery)
                console.log(type)
                console.log(type_content[1])
                aTag.attr('href', defaultQuery === '' ? raw_url : `${default_url} ${type}:${type_content[1]}`);
            }

            if (isList && list.length > 1) {
                const popup = $(`<div class="popup"><i class="bi bi-info-square"></i><span class="popuptext">${list.slice(1).map(s => `${type}: ${s.textContent}`).join('<br>')}</span></div>`);
                container.append(popup);
            }
        };

        appendListRow('language', language, ' language:', div_card_body);
        appendListRow('type', type, ' type:', div_card_body, 'Unknown');
        appendListRow('artist', ArtistList, ' artist:', div_card_body);
        appendListRow('series', seriesList, ' series:', div_card_body);


        let galleryId;
        const re_num = contentUrl.match(/.*-(\d+)\.html/);
        if (re_num && re_num[1]) {
            galleryId = re_num[1];
        } else {
            console.log('Failed to extract gallery ID from URL:', contentUrl);
        }

        const div_numstar_container = $('<div class="numstar-container"></div>');
        div_card_body.append(div_numstar_container);
        const h6_pagenum = $('<h6 class="badge bg-secondary">Loading...</h6>');
        const page_count = await getPageCount(galleryId, hitomiJsonMap);
        h6_pagenum.text(`${page_count}p`);
        div_numstar_container.append(h6_pagenum);

        const h6_star = $('<h6 class="star"></h6>');
        const json_items = Object.values(resultJsonMap).find(item => item.id === galleryId);
        if (json_items) {
            const a_StarHref = $("<a></a>")
            a_StarHref.attr("href", json_items.dmm_url);
            const finalStars = json_items.stars
            const filledStars = Math.floor(finalStars / 10);
            const NumStars = json_items.num_stars
            const hasHalfStar = finalStars % 10 >= 5 ? 1 : 0;

            if (finalStars > 0) {

                for (let i = 0; i < filledStars; i++) {
                    const i_fillstar = $('<i class="bi bi-star-fill"></i>');
                    h6_star.append(i_fillstar);
                }

                if (hasHalfStar) {
                    const i_halfstar = $('<i class="bi bi-star-half"></i>');
                    h6_star.append(i_halfstar);
                }
                h6_star.append(NumStars);
                a_StarHref.append(h6_star)
            }
            div_numstar_container.append(a_StarHref)
        }

        const div_tags_container = $('<div class="tags-container"></div>');
        div_card_body.append(div_tags_container);
        if (Tags.length === 0) {
            div_tags_container.append('<span class="badge bg-primary"></span>');
        } else {
            Tags.forEach(tag => {
                const clone = tag.cloneNode(true);
                if (clone.textContent === '...') return;
                if (clone.href) {
                    const TagUrl = clone.href.match(/\/tag\/(.*)-all.html/);
                    if (TagUrl && TagUrl[1]) {
                        clone.className = 'badge bg-primary';
                        clone.href = defaultQuery === '' ? clone.href : default_url + " " + encode_search_query_for_url(decodeURIComponent(TagUrl[1]));
                        div_tags_container.append(clone);
                    }
                }
            });
        }
    }

    function setupTagScrollEvents() {
        console.log('using setupTagScrollEvents');
        const divDefaultQueryBadges = document.getElementsByClassName('default-query-badges');
        for (const Badge of divDefaultQueryBadges) {
            Badge.addEventListener('wheel', (event) => {
                event.preventDefault();
                Badge.scrollLeft += event.deltaY;
            });
        }
        const divTagsContainers = document.getElementsByClassName('tags-container');
        for (const container of divTagsContainers) {
            container.addEventListener('wheel', (event) => {
                event.preventDefault();
                container.scrollLeft += event.deltaY;
            });
        }
    }

    function setupPopupEvents() {
        console.log('using setupPopupEvents');
        document.body.addEventListener('click', (e) => {
            const popup = e.target.closest('.popup');
            if (popup) {
                e.preventDefault();
                const popuptext = popup.querySelector('.popuptext');
                if (popuptext) popuptext.classList.toggle('show');
            }
        });
    }

    async function initializePage(resultJsonMap) {
        console.log('using initializePage');
        let initialContents = await observeGalleryContents(document, true);

        document.documentElement.innerHTML = html;
        document.head.insertAdjacentHTML('beforeend', head);
        document.querySelector('html').setAttribute('data-bs-theme', 'dark');

        const html_container = document.querySelector('.container');
        const html_row = document.querySelector('.row');
        if (obj_data.div_NextPage) html_container.appendChild(obj_data.div_NextPage[1]);
        const newSelect = document.createElement('select');
        newSelect.id = 'custom_sort';

        const option1 = document.createElement('option');
        option1.text = '-';
        option1.value = 'value1';
        newSelect.appendChild(option1);

        const option2 = document.createElement('option');
        option2.text = 'star sort';
        option2.value = 'value2';
        newSelect.appendChild(option2);

        obj_data.div_header_sort_select[0].appendChild(newSelect);
        if (obj_data.div_header_sort_select) html_row.appendChild(obj_data.div_header_sort_select[0]);

        initialContents.forEach(item => {
            const h1Element = item.querySelector('h1.lillie a');
            generateCard(
                h1Element ? h1Element.href : '#',
                h1Element ? h1Element.textContent : 'Unknown',
                item.querySelector('div[class$="-img1"] picture'),
                item.querySelectorAll('td.relatedtags ul li a'),
                item.querySelectorAll('td.series-list ul li a'),
                item.querySelector('table.dj-desc tbody tr:nth-child(3) td a') || { textContent: 'Unknown', href: '#' },
                item.querySelector('table.dj-desc tbody tr:nth-child(2) td a') || { textContent: 'Unknown', href: '#' },
                item.querySelectorAll('div.artist-list ul li a') || { textContent: 'Unknown', href: '#' },
                0,
                resultJsonMap
            );
        });

        setupPopupEvents();
        setupTagScrollEvents();
        setupTagPicker();
    }

    function loadNextPageInIframe(url, resultJsonMap) {
        console.log('using loadNextPageInIframe');
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position: fixed; top: 0; left: 0; width: 1px; height: 1px; border: 0; visibility: hidden;';
        iframe.sandbox = 'allow-same-origin allow-scripts';
        iframe.src = url;

        iframe.onload = async () => {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                const nextContents = await observeGalleryContents(iframeDoc);
                nextContents.forEach(item => {
                    const h1Element = item.querySelector('h1.lillie a');
                    generateCard(
                        h1Element ? h1Element.href : '#',
                        h1Element ? h1Element.textContent : 'Unknown',
                        item.querySelector('div[class$="-img1"] picture'),
                        item.querySelectorAll('td.relatedtags ul li a'),
                        item.querySelectorAll('td.series-list ul li a'),
                        item.querySelector('table.dj-desc tbody tr:nth-child(3) td a') || { textContent: 'Unknown', href: '#' },
                        item.querySelector('table.dj-desc tbody tr:nth-child(2) td a') || { textContent: 'Unknown', href: '#' },
                        item.querySelectorAll('div.artist-list ul li a') || { textContent: 'Unknown', href: '#' },
                        0,
                        resultJsonMap
                    );
                });
                console.log(`Page ${currentPage} loaded`);
                hasFetched = false;
                setupPopupEvents();
                setupTagScrollEvents();
            } catch (e) {
                console.error('Failed to load next page:', e);
            } finally {
                document.body.removeChild(iframe);
            }
        };

        document.body.appendChild(iframe);
    }

    let currentPage = parseInt(window.location.hash.replace('#', '') || '1', 10);
    let hasFetched = false;

    function getNextPageUrl() {
        console.log('using getNextPageUrl');
        const baseUrl = window.location.href.split('#')[0];
        const re_url = /\.html$/;
        currentPage += 1;
        if (window.location.href.match(re_url) || baseUrl === 'https://hitomi.la/') {
            const urlParts = baseUrl.split('page=');
            return `${urlParts[0]}?page=${currentPage}`;
        } else {
            return `${baseUrl}#${currentPage}`;
        }
    }

    async function setupCustomSort(resultJsonMap) {
        console.log('using setupCustomSort');
        const newSelect = document.getElementById('custom_sort');
        newSelect.addEventListener('change', (e) => {
            if (e.target.value === 'value2') {
                currentBatchIndex = 0;
                jsonData = [];
                $('.row').empty();

                jsonData = Object.values(resultJsonMap).sort((a, b) => (b.stars || 0) - (a.stars || 0));
                processBatch(resultJsonMap);
            }
        });
    }

    let defaultQuery = localStorage.getItem('hitomiDefaultQuery') || '';
    const validClasses = ['dj', 'cg', 'acg', 'manga', 'anime', 'imageset'];

    let default_url = defaultQuery ? `https://hitomi.la/search.html?${encodeURI(defaultQuery)}` : 'https://hitomi.la/';
    if (defaultQuery && window.location.href === 'https://hitomi.la/') {
        window.location.href = default_url;
        return;
    }
    async function processBatch(resultJsonMap) {
        console.log('using processBatch');
        if (currentBatchIndex >= jsonData.length) {
            console.log('No more data to process');
            return;
        }

        const div_gallery_content = document.createElement('div');
        div_gallery_content.className = 'gallery-content';
        div_gallery_content.style.cssText = 'position: fixed; top: 0; left: 0; width: 1px; height: 1px; border: 0; visibility: hidden;';
        document.body.appendChild(div_gallery_content);

        const dataBatch = jsonData.slice(currentBatchIndex, currentBatchIndex + batchSize);
        currentBatchIndex += batchSize;

        const fetchPromises = dataBatch.map(item => {
            const id = item.id;
            const stars = item.stars || 0;
            const url = `https://ltn.gold-usergeneratedcontent.net/galleryblock/${id}.html`;

            return $.get(url).then(function(html) {
                html = typeof rewrite_tn_paths === 'function' ? rewrite_tn_paths(html) : html;
                const domElements = $.parseHTML(html);
                const container = document.createElement('div');
                container.append(...domElements);
                div_gallery_content.appendChild(container);

                if ('loading' in HTMLImageElement.prototype && typeof flip_lazy_images === 'function') {
                    flip_lazy_images();
                }
                if (typeof moveimages === 'function') {
                    moveimages();
                }
                if (typeof localDates === 'function') {
                    localDates();
                }
                if (typeof limitLists === 'function') {
                    limitLists();
                }

                return { container, stars };
            }).fail(function() {
                console.error(`Failed to fetch HTML from ${url}`);
                return null;
            });
        });

        await Promise.all(fetchPromises).then(results => {
            const validClasses = ['dj', 'cg', 'acg', 'manga', 'anime', 'imageset'];
            results.forEach(result => {
                if (!result) return;
                const { container, stars } = result;
                const galleryItems = Array.from(container.children).filter(element =>
                    Array.from(element.classList).some(cls => validClasses.includes(cls))
                );

                galleryItems.forEach(item => {
                    const h1Element = item.querySelector('h1.lillie a');
                    generateCard(
                        h1Element ? h1Element.href : '#',
                        h1Element ? h1Element.textContent : 'Unknown',
                        item.querySelector('div[class$="-img1"] picture'),
                        item.querySelectorAll('td.relatedtags ul li a'),
                        item.querySelectorAll('td.series-list ul li a'),
                        item.querySelector('table.dj-desc tbody tr:nth-child(3) td a') || { textContent: 'Unknown', href: '#' },
                        item.querySelector('table.dj-desc tbody tr:nth-child(2) td a') || { textContent: 'Unknown', href: '#' },
                        item.querySelectorAll('div.artist-list ul li a') || { textContent: 'Unknown', href: '#' },
                        stars,
                        resultJsonMap
                    );
                });
            });

            document.body.removeChild(div_gallery_content);
            setupPopupEvents();
            setupTagScrollEvents();
            hasFetched = false;
        }).catch(error => {
            console.error('Error processing batch:', error);
            hasFetched = false;
        });
    }

    window.onscroll = function() {
        if (hasFetched) return;
        if ((window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight * 0.9) {
            hasFetched = true;
            if (jsonData.length > 0) {
                processBatch(resultJsonMap);
            } else {
                loadNextPageInIframe(getNextPageUrl(), resultJsonMap);
            }
        }
    };

    const lastUrl = [];
    window.addEventListener('hashchange', () => {
        lastUrl.push(location.hash);
        if (lastUrl.length >= 2 && lastUrl.at(-2) !== lastUrl.at(-1)) {
            location.reload();
        }
    });

    function setupDefaultQueryEditor() {
        console.log('using setupDefaultQueryEditor');
        const badgesContainer = document.querySelector('.default-query-badges');
        const defaultQueryInput = document.getElementById('default-query-input');
        const saveButton = document.getElementById('save-default-btn');

        function updateBadges() {
            console.log('using updateBadges');
            badgesContainer.innerHTML = '';
            const queryParts = defaultQuery.split(' ').filter(part => part.trim());
            queryParts.forEach(part => {
                const badge = document.createElement('span');
                if (part.match(/^-/)) {
                    badge.className = 'badge bg-danger d-flex align-items-center';
                } else {
                    badge.className = 'badge bg-success d-flex align-items-center';
                }
                badge.innerHTML = `${part} <button type="button" class="btn-close btn-close-white ms-1" aria-label="Remove"></button>`;
                badgesContainer.appendChild(badge);

                badge.querySelector('.btn-close').addEventListener('click', () => {
                    defaultQuery = defaultQuery.split(' ').filter(p => p !== part).join(' ');
                    updateBadges();
                    updateUrl();
                    savequery();
                });
            });
        }

        function updateUrl() {
            console.log('using updateUrl');
            const newDefaultUrl = `https://hitomi.la/search.html?${encodeURI(defaultQuery)}`;
            document.querySelector('.navbar-brand').href = newDefaultUrl;
            default_url = newDefaultUrl;
        }

        function savequery() {
            console.log('using savequery');
            localStorage.setItem('hitomiDefaultQuery', defaultQuery);
            console.log('Default query saved:', defaultQuery);
            saveButton.textContent = 'Saved!';
            setTimeout(() => saveButton.textContent = 'Save', 1000);
        }

        function addquery() {
            console.log('using addquery');
            defaultQuery += ` ${defaultQueryInput.value.trim()}`;
            defaultQueryInput.value = '';
            updateBadges();
            updateUrl();
            savequery();
        }

        defaultQueryInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && defaultQueryInput.value.trim()) {
                addquery();
            }
        });

        saveButton.addEventListener('click', () => {
            if (defaultQueryInput.value.trim()) {
                defaultQuery += ` ${defaultQueryInput.value.trim()}`;
                defaultQueryInput.value = '';
                updateBadges();
                updateUrl();
                savequery();
            }
        });

        updateBadges();
    }

    function setupSearch() {
        console.log('using setupSearch');
        const input = document.getElementById('query-input');
        const form = document.querySelector('form[role="search"]');
        const stickyNavbar = document.querySelector('.sticky-navbar');

        input.addEventListener("focus", function() {
            stickyNavbar.classList.add('sticky-navbar--static');
            stickyNavbar.classList.remove('sticky-navbar');
        });

        input.addEventListener("blur", function() {
            stickyNavbar.classList.remove('sticky-navbar--static');
            stickyNavbar.classList.add('sticky-navbar');
        });

        const hiddenSuggestions = document.createElement('ul');
        hiddenSuggestions.id = 'search-suggestions';
        hiddenSuggestions.style.display = 'none';
        document.body.appendChild(hiddenSuggestions);

        const suggestionsContainer = document.createElement('div');
        suggestionsContainer.className = 'dropdown-menu';
        form.appendChild(suggestionsContainer);

        const updateSuggestionsVisibility = () => {
            suggestionsContainer.classList.toggle('show', suggestionsContainer.children.length > 0 && input === document.activeElement);
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
                    const re_ns = /\((.*)\)$/;
                    const tagMatch = searchNs.match(re_ns);
                    const tag = tagMatch ? tagMatch[1] : '';
                    const input_value = encode_search_query_for_url(tag + ":" + searchString);

                    if (searchString && tag) {
                        const currentValue = input.value.trim();
                        if (lastInput && currentValue.endsWith(lastInput)) {
                            input.value = currentValue.slice(0, -lastInput.length).trim() + (committedValue ? ' ' : '') + input_value;
                        } else {
                            input.value = committedValue + (committedValue ? ' ' : '') + input_value;
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

        input.addEventListener('input', () => {
            const currentValue = input.value.trim();
            if (!currentValue) {
                lastInput = '';
                committedValue = '';
            } else {
                lastInput = currentValue.slice(committedValue.length).trim();
            }
            handle_keyup_in_search_box();
            setTimeout(updateDropdown, 50);
        });

        input.addEventListener('focus', updateSuggestionsVisibility);
        input.addEventListener('blur', () => setTimeout(updateSuggestionsVisibility, 100));

        const handleSearchQuery = () => {
            const userQuery = input.value.trim();
            const combinedQuery = userQuery ? `${defaultQuery} ${userQuery}` : defaultQuery;
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

        new MutationObserver(updateDropdown).observe(hiddenSuggestions, { childList: true, subtree: true });
    }

    function setupTagPicker() {
        console.log('using setupTagPicker');
        const pickerBtn = document.getElementById('tag-picker-btn');
        const addBtn = document.getElementById('add-tag-btn');
        const excludeBtn = document.getElementById('exclude-tag-btn');
        let isPickerActive = false;
        let selectedTag = null;
        let selectedType = null;

        function updatePickerButton(btn, active) {
            console.log('using updatePickerButton');
            btn.innerHTML = 'Select Tag or Type';
            const icon = document.createElement('i');
            icon.className = 'bi bi-eyedropper';
            icon.style.marginLeft = '5px';
            if (!active) {
                btn.innerHTML = '';
            }
            btn.appendChild(icon);
        }

        function extractTagFromHref(href) {
            console.log('using extractTagFromHref');
            console.log(defaultQuery);
            console.log(href);
            const match = href.match(/\/tag\/(.*)-all.html/) || href.match(/.*%20(.*)/);
            console.log(match);
            return match ? encode_search_query_for_url(decodeURIComponent(match[1])) : null;
        }

        function extractTypeFromTable(a) {
            console.log('using extractTypeFromTable');
            console.log(a);
            const hrefValue = a.getAttribute('href');
            console.log(hrefValue);
            const match = hrefValue.match(/^https:\/\/hitomi\.la\/(.*)\/(.*)-all\.html$/);
            console.log(match);
            return match ? match[1] + ':' + encode_search_query_for_url(decodeURIComponent(match[2])) : hrefValue.match(/.* (.*)/);
        }

        function updateDefaultQueryUI() {
            console.log('using updateDefaultQueryUI');
            const badgesContainer = document.querySelector('.default-query-badges');
            badgesContainer.innerHTML = '';
            const queryParts = defaultQuery.split(' ').filter(part => part.trim());
            queryParts.forEach(part => {
                const badge = document.createElement('span');
                if (part.match(/^-/)) {
                    badge.className = 'badge bg-danger d-flex align-items-center';
                } else {
                    badge.className = 'badge bg-success d-flex align-items-center';
                }
                badge.innerHTML = `${part} <button type="button" class="btn-close btn-close-white ms-1" aria-label="Remove"></button>`;
                badgesContainer.appendChild(badge);
                badge.querySelector('.btn-close').addEventListener('click', () => {
                    defaultQuery = defaultQuery.split(' ').filter(p => p !== part).join(' ');
                    updateDefaultQueryUI();
                    default_url = `https://hitomi.la/search.html?${encodeURI(defaultQuery)}`;
                    document.querySelector('.navbar-brand').href = default_url;
                    localStorage.setItem('hitomiDefaultQuery', defaultQuery);
                });
            });
            default_url = `https://hitomi.la/search.html?${encodeURI(defaultQuery)}`;
            document.querySelector('.navbar-brand').href = default_url;
        }

        pickerBtn.addEventListener('click', () => {
            isPickerActive = !isPickerActive;
            pickerBtn.classList.toggle('btn-warning', isPickerActive);
            updatePickerButton(pickerBtn, isPickerActive);
            addBtn.disabled = !isPickerActive;
            excludeBtn.disabled = !isPickerActive;

            if (!isPickerActive && (selectedTag || selectedType)) {
                if (selectedTag) selectedTag.classList.remove('highlighted-tag');
                if (selectedType) selectedType.classList.remove('highlighted-tag');
                selectedTag = null;
                selectedType = null;
            }
        })

        document.addEventListener('click', (e) => {
            if (!isPickerActive) return;
            const tag = e.target.closest('.tags-container .badge');
            if (tag) {
                e.preventDefault();
                if (selectedTag) selectedTag.classList.remove('highlighted-tag');
                tag.classList.add('highlighted-tag');
                selectedTag = tag;
            }
        });
        document.addEventListener('click', (e) => {
            if (!isPickerActive) return;
            const type = e.target.closest('table tr td a');
            if (type) {
                e.preventDefault();
                if (selectedType) selectedType.classList.remove('highlighted-tag');
                type.classList.add('highlighted-tag');
                selectedType = type;
            }
        });
        addBtn.addEventListener('click', () => {
            if (selectedTag) {
                const tagText = extractTagFromHref(selectedTag.href);
                if (tagText && !defaultQuery.includes(tagText)) {
                    defaultQuery += defaultQuery ? ` ${tagText}` : tagText;
                    localStorage.setItem('hitomiDefaultQuery', defaultQuery);
                    updateDefaultQueryUI();
                }
                selectedTag.classList.remove('highlighted-tag');
                selectedTag = null;
            } else if (selectedType) {
                const typeText = extractTypeFromTable(selectedType);
                if (typeText && !defaultQuery.includes(typeText)) {
                    defaultQuery += defaultQuery ? ` ${typeText}` : typeText;
                    localStorage.setItem('hitomiDefaultQuery', defaultQuery);
                    updateDefaultQueryUI();
                }
                selectedType.classList.remove('highlighted-tag');
                selectedType = null;
            }
        });

        excludeBtn.addEventListener('click', () => {
            if (selectedTag) {
                const tagText = extractTagFromHref(selectedTag.href);
                if (tagText) {
                    const excludeText = `-${tagText}`;
                    if (!defaultQuery.includes(excludeText)) {
                        defaultQuery += defaultQuery ? ` ${excludeText}` : excludeText;
                        localStorage.setItem('hitomiDefaultQuery', defaultQuery);
                        updateDefaultQueryUI();
                    }
                }
                selectedTag.classList.remove('highlighted-tag');
                selectedTag = null;
            } else if (selectedType) {
                const typeText = extractTypeFromTable(selectedType);
                if (typeText) {
                    const excludeText = `-${typeText}`;
                    if (!defaultQuery.includes(excludeText)) {
                        defaultQuery += defaultQuery ? ` ${excludeText}` : excludeText;
                        localStorage.setItem('hitomiDefaultQuery', defaultQuery);
                        updateDefaultQueryUI();
                    }
                }
                selectedType.classList.remove('highlighted-tag');
                selectedType = null;
            }
        });

        // excludeBtn.addEventListener('click', () => {
        //     if (!(selectedType || selectedTag)) return;
        //     const tagText = extractTagFromHref(selectedTag.href);
        //     if (tagText) {
        //         const excludeText = `-${tagText}`;
        //         if (!defaultQuery.includes(excludeText)) {
        //             defaultQuery += defaultQuery ? ` ${excludeText}` : excludeText;
        //             localStorage.setItem('hitomiDefaultQuery', defaultQuery);
        //             updateDefaultQueryUI();
        //         }
        //     }
        //     selectedTag.classList.remove('highlighted-tag');
        //     selectedTag = null;
        // });

        updatePickerButton(pickerBtn, isPickerActive);
    }

    await initializePage(resultJsonMap);
    setupSearch();
    setupDefaultQueryEditor();
    loadNextPageInIframe(getNextPageUrl(), resultJsonMap);
    setupPopupEvents();
    setupCustomSort(resultJsonMap);
})();
