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
// @require      https://code.jquery.com/jquery-3.7.1.js
// @require      https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js
// ==/UserScript==

(async function() {
    'use strict';

    let defaultQuery = localStorage.getItem('hitomiDefaultQuery') || '';
    const validClasses = ['dj', 'cg', 'acg', 'manga', 'anime', 'imageset'];

    let default_url = defaultQuery ? `https://hitomi.la/search.html?${encodeURI(defaultQuery)}` : 'https://hitomi.la/';
    if (defaultQuery && window.location.href === 'https://hitomi.la/') {
        window.location.href = default_url;
        return;
    }

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
            .numstar-container { display: flex; gap: 10px; align-items: center; margin-top: 5px; }
            .star { margin: 0; display: flex; gap: 3px; color: #ffc107; }
            .star i { font-size: 14px; }

            /* ナビゲーションと検索エリアの調整 */
            .navbar-collapse { 
                display: flex; 
                flex-wrap: wrap; 
                justify-content: space-between; 
                align-items: center; 
            }
            .navbar-nav.me-auto { 
                flex-grow: 1; 
                margin-right: 10px; /* デフォルトのマージンを制限 */
            }
            .SearchContainer { 
                flex-shrink: 1; 
                min-width: 0; /* 必要に応じて縮小を許可 */
            }
            .sticky-navbar--static {
                position: static;
            }
            @media (max-width: 991px) { /* Bootstrapのlgブレークポイント */
                .navbar-nav.me-auto { 
                    margin-right: 0; /* 小さい画面でマージンを削除 */
                    flex-basis: 100%; /* ナビゲーションを全幅に */
                    margin-bottom: 10px; 
                }
                .SearchContainer { 
                    flex-basis: 100%; /* 検索エリアも全幅に */
                    max-width: 100%; 
                }
                .default-query-container { 
                    flex-direction: column; /* 縦に配置 */
                    align-items: stretch; 
                }
                .default-query-input { 
                    width: 100%; /* 入力欄を全幅に */
                }
            }
            @media (max-width: 480px) {
                .ImageContainer img { height: 170px; }
                .card { font-size: 70%; }
            }
            @media (min-width: 481px) and (max-width: 992px) {
                .ImageContainer img { height: 220px; }
            }
            @media (min-width: 768px) { 
                .col { width: 30%; } 
            }
            @media (min-width: 992px) and (max-width: 1199px) { 
                .col { width: 25%; }  
            }
            @media (min-width: 992px) {
                .SearchContainer { 
                    max-width: 490px; 
                }
            }
        </style>
    `;

    const obj_data = {
        div_NextPage: null,
        div_header_sort_select: null
    };

    let jsonData = [];
    let currentBatchIndex = 0;
    const batchSize = 25;

    async function observeGalleryContents(targetDoc, isInitialPage = false, content) {
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                if (content) {
                    console.log(content);
                    var div_gallerycontents = content;
                } else {
                    var div_gallerycontents = targetDoc.querySelectorAll('div.gallery-content div');
                }

                const div_page_containers = $('div.page-container');
                const div_header_sort_select = $('div.header-sort-select');

                if (div_page_containers.length > 0) obj_data.div_NextPage = div_page_containers;
                if (div_header_sort_select.length > 0) obj_data.div_header_sort_select = div_header_sort_select;
                if (div_gallerycontents.length > 2) {
                    observer.disconnect();
                    const filteredContents = [];
                    div_gallerycontents.forEach(element => {
                        if (Array.from(element.classList).some(cls => validClasses.includes(cls))) {
                            filteredContents.push(isInitialPage ? $(element).get()[0] : element.cloneNode(true));
                        }
                    });
                    resolve(filteredContents);
                }
            });
            observer.observe(targetDoc.body, { childList: true, subtree: true });
        });
    }

    function generateCard(contentUrl, title, imgPicture, Tags, seriesList, language, type, ArtistList, stars = 0) {
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
            const aTag = $(`<a>${text}</a>`);

            tbody.append(`<tr><td class="type">${type}</td><td class="colon">:</td><td></td></tr>`);
            tbody.find('tr:last td:last').append(aTag);

            if (list.length && list[0].textContent) {
                aTag.attr('href', defaultQuery === '' ? raw_url : `${default_url + urlPrefix}${encode_search_query_for_url(text)}`);
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

        // Create container for page number and stars
        const div_numstar_container = $('<div class="numstar-container"></div>');
        div_card_body.append(div_numstar_container);

        // Page number
        const h6_pagenum = $('<h6 class="badge bg-secondary">Loading...</h6>');
        div_numstar_container.append(h6_pagenum);
        const re_num = contentUrl.match(/.*-(\d+)\.html/);
        if (re_num && re_num[1]) {
            const galleryId = re_num[1];
            $.getScript(`https://ltn.gold-usergeneratedcontent.net/galleries/${galleryId}.js`, function() {
                if (typeof galleryinfo !== 'undefined' && galleryinfo.files) {
                    h6_pagenum.text(`${galleryinfo.files.length}p`);
                }
            }).fail(() => console.error('Failed to load gallery script:', galleryId));
        }

        // Star rating
        const h6_star = $('<h6 class="star"></h6>');
        if (stars > 0 && stars <= 50) {
            const filledStars = Math.floor(stars / 10); // Number of filled stars
            const hasHalfStar = stars % 10 >= 5 ? 1 : 0; // Half star if remainder >= 5

            // Add filled stars
            for (let i = 0; i < filledStars; i++) {
                const i_fillstar = $('<i class="bi bi-star-fill"></i>');
                h6_star.append(i_fillstar);
            }

            // Add half star if applicable
            if (hasHalfStar) {
                const i_halfstar = $('<i class="bi bi-star-half"></i>');
                h6_star.append(i_halfstar);
            }
        }
        div_numstar_container.append(h6_star);

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
        document.body.addEventListener('click', (e) => {
            const popup = e.target.closest('.popup');
            if (popup) {
                e.preventDefault();
                const popuptext = popup.querySelector('.popuptext');
                if (popuptext) popuptext.classList.toggle('show');
            }
        });
    }

    async function initializePage(content) {
        let initialContents;
        if (content) {
            initialContents = Array.from(content).filter(element =>
                Array.from(element.classList).some(cls => validClasses.includes(cls))
            );
        } else {
            initialContents = await observeGalleryContents(document, true);
        }

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
                item.querySelectorAll('div.artist-list ul li a') || { textContent: 'Unknown', href: '#' }
            );
        });

        setupPopupEvents();
        setupTagScrollEvents();
        setupTagPicker();
    }

    function loadNextPageInIframe(url) {
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
                        item.querySelectorAll('div.artist-list ul li a') || { textContent: 'Unknown', href: '#' }
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


    function setupCustomSort() {
        const newSelect = document.getElementById('custom_sort');
        newSelect.addEventListener('change', (e) => {
            if (e.target.value === 'value2') {
                currentBatchIndex = 0;
                jsonData = [];
                $('.row').empty();

                $.get('http://192.168.3.12:8080/test_final_result.json', function(data) {
                    jsonData = data;
                    processBatch();
                }).fail(function() {
                    console.error('Failed to fetch JSON from http://192.168.3.12:8080/test_final_result.json');
                });
            }
        });
    }

    function processBatch() {
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

        Promise.all(fetchPromises).then(results => {
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
                        stars
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
                processBatch();
            } else {
                loadNextPageInIframe(getNextPageUrl());
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
        const badgesContainer = document.querySelector('.default-query-badges');
        const defaultQueryInput = document.getElementById('default-query-input');
        const saveButton = document.getElementById('save-default-btn');

        function updateBadges() {
            badgesContainer.innerHTML = '';
            const queryParts = defaultQuery.split(' ').filter(part => part.trim());
            queryParts.forEach(part => {
                const badge = document.createElement('span');
                badge.className = 'badge bg-success d-flex align-items-center';
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
            const newDefaultUrl = `https://hitomi.la/search.html?${encodeURI(defaultQuery)}`;
            document.querySelector('.navbar-brand').href = newDefaultUrl;
            default_url = newDefaultUrl;
        }
        function savequery() {
            localStorage.setItem('hitomiDefaultQuery', defaultQuery);
            console.log('Default query saved:', defaultQuery);
            saveButton.textContent = 'Saved!';
            setTimeout(() => saveButton.textContent = 'Save', 1000);
        }
        function addquery() {
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
        const pickerBtn = document.getElementById('tag-picker-btn');
        const addBtn = document.getElementById('add-tag-btn');
        const excludeBtn = document.getElementById('exclude-tag-btn');
        let isPickerActive = false;
        let selectedTag = null;
        updatePickerButton(pickerBtn, isPickerActive);

        pickerBtn.addEventListener('click', () => {
            isPickerActive = !isPickerActive;
            pickerBtn.classList.toggle('btn-warning', isPickerActive);
            updatePickerButton(pickerBtn, isPickerActive);
            addBtn.disabled = !isPickerActive;
            excludeBtn.disabled = !isPickerActive;

            if (!isPickerActive && selectedTag) {
                selectedTag.classList.remove('highlighted-tag');
                selectedTag = null;
            }
        });

        function updatePickerButton(btn, active) {
            btn.innerHTML = 'Select Tag';
            const icon = document.createElement('i');
            icon.className = 'bi bi-eyedropper';
            icon.style.marginLeft = '5px';
            if (!active) {
                btn.innerHTML = '';
            }
            btn.appendChild(icon);
        }

        document.addEventListener('click', (e) => {
            const tag = e.target.closest('.tags-container .badge');
            if (isPickerActive && tag) {
                e.preventDefault();
                if (selectedTag) selectedTag.classList.remove('highlighted-tag');
                tag.classList.add('highlighted-tag');
                selectedTag = tag;
            }
        });

        addBtn.addEventListener('click', () => {
            if (selectedTag) {
                console.log(selectedTag.href);
                const tagText = extractTagFromHref(selectedTag.href);
                console.log(tagText);
                if (tagText && !defaultQuery.includes(tagText)) {
                    defaultQuery += defaultQuery ? ` ${tagText}` : tagText;
                    localStorage.setItem('hitomiDefaultQuery', defaultQuery);
                    console.log(defaultQuery);
                    updateDefaultQueryUI();
                }
                selectedTag.classList.remove('highlighted-tag');
                selectedTag = null;
            }
        });

        excludeBtn.addEventListener('click', () => {
            if (selectedTag) {
                console.log(selectedTag);
                const tagText = extractTagFromHref(selectedTag.href);
                if (tagText) {
                    const excludeText = `-${tagText}`;
                    if (!defaultQuery.includes(excludeText)) {
                        defaultQuery += defaultQuery ? ` ${excludeText}` : excludeText;
                        localStorage.setItem('hitomiDefaultQuery', defaultQuery);
                        console.log(defaultQuery);
                        updateDefaultQueryUI();
                    }
                }
                selectedTag.classList.remove('highlighted-tag');
                selectedTag = null;
            }
        });

        function escapeRegExp(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        function extractTagFromHref(href) {
            const escapedCurrentUrl = escapeRegExp(window.location.href + "%20");
            const dynamicPattern = new RegExp(`${escapedCurrentUrl}(.*)`);
            console.log(dynamicPattern);
            let match = href.match(dynamicPattern);
            console.log(match);

            if (!match) {
                match = href.match(/\/tag\/(.*)-all.html/) || href.match(/search\.html\?[^ ]* (.*)$/);
            }

            if (match && match[1]) {
                return encode_search_query_for_url(decodeURIComponent(match[1]));
            }
            return null;
        }

        function updateDefaultQueryUI() {
            const badgesContainer = document.querySelector('.default-query-badges');
            badgesContainer.innerHTML = '';
            const queryParts = defaultQuery.split(' ').filter(part => part.trim());
            queryParts.forEach(part => {
                const badge = document.createElement('span');
                badge.className = 'badge bg-success d-flex align-items-center';
                badge.innerHTML = `${part} <button type="button" class="btn-close btn-close-white ms-1" aria-label="Remove"></button>`;
                badgesContainer.appendChild(badge);

                badge.querySelector('.btn-close').addEventListener('click', () => {
                    defaultQuery = defaultQuery.split(' ').filter(p => p !== part).join(' ');
                    updateDefaultQueryUI();
                    default_url = `https://hitomi.la/search.html?${encodeURI(defaultQuery)}`;
                    document.querySelector('.navbar-brand').href = default_url;
                });
            });
            default_url = `https://hitomi.la/search.html?${encodeURI(defaultQuery)}`;
            document.querySelector('.navbar-brand').href = default_url;
        }
    }

    await initializePage();
    setupSearch();
    setupDefaultQueryEditor();
    loadNextPageInIframe(getNextPageUrl());
    setupPopupEvents();
    setupCustomSort();
})();
