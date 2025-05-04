import os
import re
import json
import asyncio
import aiohttp
import aiofiles
from lxml import etree
from tqdm.asyncio import tqdm
from typing import Optional, List, Tuple, Dict, Any

# Configuration
HITOMI_DOWNLOAD_SITEMAP = False
DMM_DOWNLOAD_SITEMAP = False
READ_LOCAL_SITEMAP = False
HITOMI_DOWNLOAD_JS = True
HITOMI_READ_LOCAL_JS = True
READ_FROM_OUTPUT = False

DEBUG_SITEMAP_DIR = "/home/asdf/Documents/hitomi/tools2/sitemap"
LOCAL_JS_DIR = "/home/asdf/Documents/hitomi/urls/id_js"
OUTPUT_JSON_PATH = "data.json"
FANZA_JSON_PATH = "fanza_data.json"
SITEMAP_INDEX_URL = "https://ltn.gold-usergeneratedcontent.net/sitemap.xml"
DMM_SITEMAP_INDEX_URL = "https://www.dmm.co.jp/dc/doujin/sitemap_image.xml"
AGE_CHECK_URL = 'https://www.dmm.co.jp/age_check/=/declared=yes/?rurl=https%3A%2F%2Fgames.dmm.co.jp%2Flist%2Fpc'
SEARCH_STRING = "%65E5%672C%8A9E"
SITEMAP_BATCH_SIZE = 25
DMM_SITEMAP_BATCH_SIZE = 10
JS_BATCH_SIZE = 500
ID_REGEX = re.compile(r'%2D(\d+)\.html$')
JSON_REGEX = re.compile(r'^var galleryinfo = ({.*})$', re.MULTILINE)
HITOMI_NS = {
    "sitemap": "http://www.sitemaps.org/schemas/sitemap/0.9",
    "urlset": "http://www.sitemaps.org/schemas/sitemap/0.9"
}
DMM_NS = {
    "default": "http://www.sitemaps.org/schemas/sitemap/0.9",
    "image": "http://www.google.com/schemas/sitemap-image/1.1"
}

os.makedirs(LOCAL_JS_DIR, exist_ok=True)

async def async_task():
    await asyncio.sleep(0.1)

async def get_content(bool_download: bool, session: aiohttp.ClientSession, url: str, local_path: Optional[str] = None) -> bytes:
    if READ_LOCAL_SITEMAP and local_path and os.path.isfile(local_path):
        async with aiofiles.open(local_path, "rb") as f:
            print("read from local", local_path)
            return await f.read()
    async with session.get(url) as response:
        content = await response.read()
        if bool_download and local_path:
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            if not os.path.exists(local_path + os.path.basename(url)): 
                async with aiofiles.open(local_path, "wb") as f:
                    print("download to local", local_path)
                    await f.write(content)
        return content

async def load_hitomi_dict() -> Dict[str, Any]:
    global hitomi_dict
    if READ_FROM_OUTPUT and os.path.isfile(OUTPUT_JSON_PATH):
        async with aiofiles.open(OUTPUT_JSON_PATH, "r", encoding="utf-8") as f:
            hitomi_dict = json.loads(await f.read())
        print(f"Loaded hitomi data from {OUTPUT_JSON_PATH}")
    else:
        hitomi_dict = {}

# Hitomi データの処理
hitomi_dict: Dict[str, Any] = {}
js_dir_set = set()

async def process_hitomi_sitemap(session: aiohttp.ClientSession, sitemap_url: str) -> List[str]:
    sitemap_filename = os.path.basename(sitemap_url)
    sitemap_local_path = os.path.join(DEBUG_SITEMAP_DIR, sitemap_filename) if HITOMI_DOWNLOAD_SITEMAP or READ_LOCAL_SITEMAP else None
    sitemap_content = await get_content(HITOMI_DOWNLOAD_SITEMAP, session, sitemap_url, sitemap_local_path)
    root = etree.fromstring(sitemap_content)
    urls = [loc.text for loc in root.findall(".//urlset:loc", HITOMI_NS) if loc.text]
    valid_urls = [
        url for url in urls
        if SEARCH_STRING in url and ("doujinshi" in url or "manga" in url) and ID_REGEX.search(url)
    ]
    return valid_urls

async def process_js_url(session: aiohttp.ClientSession, url: str, json_id: str) -> Tuple[str, Optional[Dict[str, Any]]]:
    js_filename = f"{json_id}.js"
    local_js_path = os.path.join(LOCAL_JS_DIR, js_filename)
    js_url = f"https://ltn.gold-usergeneratedcontent.net/galleries/{json_id}.js"
    
    if HITOMI_READ_LOCAL_JS and js_filename in js_dir_set:
        print(f"Fetching from local: {js_url}", end='\r')
        async with aiofiles.open(local_js_path, "r", encoding="utf-8") as f:
            js_content = await f.read()
    else:
        print(f"Fetching from online: {js_url}", end='\r')
        async with session.get(js_url) as response:
            js_content = await response.text()
            if HITOMI_DOWNLOAD_JS and not os.path.exists(local_js_path):
                async with aiofiles.open(local_js_path, "w", encoding="utf-8") as f:
                    await f.write(js_content)
                js_dir_set.add(js_filename)
                print(f"Saved to: {local_js_path}")
    
    json_match = JSON_REGEX.search(js_content)
    if not json_match:
        print(f"No JSON match found for {js_url}")
        return json_id, None
    try:
        data = json.loads(json_match.group(1))
        artists = data.get("artists")
        artist_name = artists[0].get("artist") if isinstance(artists, list) and artists else artists
        file_count = len(data.get("files", []))
        return json_id, {
            "artists": artist_name,
            "japanese_title": data.get("japanese_title"),
            "title": data.get("title"),
            "pages": file_count
        }
    except json.JSONDecodeError as e:
        print(f"JSON decode error for {js_url}: {e}")
        return json_id, None

async def process_hitomi():
    global hitomi_dict, js_dir_set
    async with aiohttp.ClientSession() as session:
        # Process sitemap index
        sitemap_index_content = await get_content(HITOMI_DOWNLOAD_SITEMAP, session, SITEMAP_INDEX_URL)
        root = etree.fromstring(sitemap_index_content)
        sitemap_urls = [loc.text for loc in root.findall(".//sitemap:loc", HITOMI_NS) if loc.text]
        print("Found", len(sitemap_urls), "hitomi sitemaps.")

        if HITOMI_READ_LOCAL_JS:
            js_dir_set = set(os.listdir(LOCAL_JS_DIR))
            print("Loaded", len(js_dir_set), "cached JS files.")

        # Process sitemaps in batches
        valid_gallery_urls = []
        # with tqdm(total=len(sitemap_urls)) as pbar:
        #     for i in range(len(sitemap_urls)):
        #         tasks = [process_hitomi_sitemap(session, url) for url in sitemap_urls]
        #         results = await asyncio.gather(*tasks)
        #         pbar.update(1)  # 進捗を更新
        #         for urls in results:
        #             valid_gallery_urls.extend(urls)
        #     print("Found", len(valid_gallery_urls), "unique gallery URLs.")
        with tqdm(total=len(sitemap_urls)) as pbar:
            for url in sitemap_urls:
                tasks = [process_hitomi_sitemap(session, url)]
                pbar.update(1)  # 進捗を更新
                results = await asyncio.gather(*tasks)
                for urls in results:
                    valid_gallery_urls.extend(urls)
            print("Found", len(valid_gallery_urls), "unique gallery URLs.")


        # Process JS files in batches
        hitomi_dict = {}
        tasks = []
        for url in valid_gallery_urls:
            match = ID_REGEX.search(url)
            if match:
                json_id = match.group(1)
                tasks.append(process_js_url(session, url, json_id))

        for i in range(0, len(tasks), JS_BATCH_SIZE):
            batch_tasks = tasks[i:i + JS_BATCH_SIZE]
            results = await asyncio.gather(*batch_tasks, return_exceptions=True)
            for result in results:
                if isinstance(result, Exception):
                    print(f"Error in processing: {result}")
                    continue
                json_id, data = result
                if data:
                    hitomi_dict[json_id] = data
            print(f"Processed JS batch {i // JS_BATCH_SIZE + 1}/{len(tasks) // JS_BATCH_SIZE + 1}")

        print("Extracted data for", len(hitomi_dict), "galleries.")

        async with aiofiles.open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
            await f.write(json.dumps(hitomi_dict, ensure_ascii=False, indent=4))
        print("Saved data to", OUTPUT_JSON_PATH)

async def load_dmm_dict() -> Dict[str, Any]:
    global dmm_dict
    if READ_FROM_OUTPUT and os.path.isfile(FANZA_JSON_PATH):
        async with aiofiles.open(FANZA_JSON_PATH, "r", encoding="utf-8") as f:
            dmm_dict = json.loads(await f.read())
        print(f"Loaded DMM data from {FANZA_JSON_PATH}")
    else:
        dmm_dict = {}

# DMM データの処理
dmm_dict: Dict[str, Any] = {}

async def process_dmm_sitemap(session: aiohttp.ClientSession, sitemap_url: str) -> etree.Element:
    filename = os.path.join(DEBUG_SITEMAP_DIR, os.path.basename(sitemap_url))
    content = None
    if READ_LOCAL_SITEMAP and os.path.exists(filename):
        async with aiofiles.open(filename, "rb") as f:
            print("Read from local file:", filename)
            content = await f.read()

    if content is None:
        async with session.get(sitemap_url) as response:
            content = await response.read()
            print("read from online: ", sitemap_url)
            if DMM_DOWNLOAD_SITEMAP:
                async with aiofiles.open(filename, "wb") as f:
                    print("Downloaded and cached to local file:", filename)
                    await f.write(content)
    if b'\x03' in content:
        print("Found x03 character in dmmsitemap:", os.path.basename(sitemap_url))
    cleaned_content = content.replace(b'\x03', b'')
    return etree.fromstring(cleaned_content)

async def process_dmm():
    global dmm_dict
    async with aiohttp.ClientSession() as session:
        # Process DMM sitemap index
        async with session.get(DMM_SITEMAP_INDEX_URL) as response:
            root = etree.fromstring(await response.read())
        sitemap_urls = [loc.text for loc in root.findall(".//default:loc", DMM_NS) if loc.text]

        # Process DMM sitemaps in batches
        for i in range(0, len(sitemap_urls), DMM_SITEMAP_BATCH_SIZE):
            batch = sitemap_urls[i:i + DMM_SITEMAP_BATCH_SIZE]
            tasks = [process_dmm_sitemap(session, url) for url in batch]
            sitemap_xml = await asyncio.gather(*tasks)
            print(f"Processed DMM sitemap batch {i // DMM_SITEMAP_BATCH_SIZE + 1}/{len(sitemap_urls) // DMM_SITEMAP_BATCH_SIZE + 1}")

            list_url_elements = []
            for xml in sitemap_xml:
                url_elements = xml.findall('.//default:url', DMM_NS)
                list_url_elements.extend(url_elements)
            print("Number of 'url' elements found:", len(list_url_elements))

            for url_elem in list_url_elements:
                image_title_elem = url_elem.find('.//image:title', DMM_NS)
                loc_elem = url_elem.find('.//default:loc', DMM_NS)
                if image_title_elem is not None and loc_elem is not None:
                    first_image_title = image_title_elem.text
                    loc_url = loc_elem.text
                    if first_image_title and loc_url:
                        dmm_dict[loc_url] = {
                            "title": first_image_title,
                            "url": loc_url
                        }

        async with aiofiles.open(FANZA_JSON_PATH, "w", encoding="utf-8") as f:
            await f.write(json.dumps(dmm_dict, ensure_ascii=False, indent=4))
        print("Saved data to", FANZA_JSON_PATH)

async def main():
    await load_hitomi_dict()
    if not hitomi_dict:
        await process_hitomi()
    print("Processing DMM sitemap...")
    await load_dmm_dict()
    if not dmm_dict:
        await process_dmm()

    # Create hitomi_title_map
    hitomi_title_map: Dict[str, List[str]] = {}
    for hitomi_key, hitomi_value in hitomi_dict.items():
        title = hitomi_value.get("japanese_title") or hitomi_value.get("title")
        if title:
            hitomi_title_map.setdefault(title, []).append(hitomi_key)

    # Match DMM and Hitomi URLs
    matched_dmm_urls: List[Tuple[str, str]] = []
    for dmm_key, dmm_value in dmm_dict.items():
        dmm_title = dmm_value.get("title")
        if dmm_title in hitomi_title_map:
            for hitomi_key in hitomi_title_map[dmm_title]:
                matched_dmm_urls.append((dmm_key, hitomi_key))
    # print(matched_dmm_urls)

if __name__ == "__main__":
    asyncio.run(main())
