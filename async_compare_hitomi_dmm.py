import os
import re
import json
import asyncio
import aiohttp
import aiofiles
from tqdm import tqdm
from lxml import html
from lxml import etree
from aiohttp import ClientConnectorError

# Settings and constants
hitomi_debug = True
DEBUG_SITEMAP_DIR = "/home/asdf/Documents/hitomi/tools2/sitemap"
LOCAL_JS_DIR = "/home/asdf/Documents/hitomi/urls/id_js/"
OUTPUT_JSON_PATH = "data.json"
FANZA_JSON_PATH = "fanza_data.json"

SITEMAP_INDEX_URL = "https://ltn.gold-usergeneratedcontent.net/sitemap.xml"
age_check_url = 'https://www.dmm.co.jp/age_check/=/declared=yes/?rurl=https%3A%2F%2Fgames.dmm.co.jp%2Flist%2Fpc'
SEARCH_STRING = "%65E5%672C%8A9E"
ID_REGEX = re.compile(r'%2D(\d+)\.html$')
JSON_REGEX = re.compile(r'^var galleryinfo = ({.*})$', re.MULTILINE)

hitomi_ns = {
    "sitemap": "http://www.sitemaps.org/schemas/sitemap/0.9",
    "urlset": "http://www.sitemaps.org/schemas/sitemap/0.9"
}
os.makedirs(LOCAL_JS_DIR, exist_ok=True)

# We'll pass the semaphore to every function doing an HTTP request.
async def get_content(session, url, semaphore, local_path=None):
    # Use semaphore to limit concurrent access.
    async with semaphore:
        if hitomi_debug and local_path and os.path.isfile(local_path):
            async with aiofiles.open(local_path, "rb") as f:
                print("read from local", local_path)
                return await f.read()
        try:
            async with session.get(url) as response:
                if response.status != 200:
                    print(f"Skipping {url} due to status code {response.status}")
                    return None
                content = await response.read()
                if hitomi_debug and local_path:
                    os.makedirs(os.path.dirname(local_path), exist_ok=True)
                    async with aiofiles.open(local_path, "wb") as f:
                        print("download to local", local_path)
                        await f.write(content)
                return content
        except ClientConnectorError as e:
            print(f"Connection error while fetching {url} {e}")
            return None

async def load_hitomi_data(session, semaphore):
    hitomi_dict = None
    if hitomi_debug and os.path.isfile(OUTPUT_JSON_PATH):
        async with aiofiles.open(OUTPUT_JSON_PATH, "r", encoding="utf-8") as f:
            content = await f.read()
            hitomi_dict = json.loads(content)
        print(f"Loaded hitomi data from {OUTPUT_JSON_PATH}")
    else:
        sitemap_index_content = await get_content(session, SITEMAP_INDEX_URL, semaphore)
        if sitemap_index_content is None:
            return {}
        root = etree.fromstring(sitemap_index_content)
        sitemap_urls = [loc.text for loc in root.findall(".//sitemap:loc", hitomi_ns) if loc.text]
        print("Found", len(sitemap_urls), "hitomi sitemaps.")

        js_dir_set = set(os.listdir(LOCAL_JS_DIR))
        print("Loaded", len(js_dir_set), "cached JS files.")

        valid_gallery_urls = []
        for sitemap_url in sitemap_urls:
            sitemap_filename = os.path.basename(sitemap_url)
            sitemap_local_path = os.path.join(DEBUG_SITEMAP_DIR, sitemap_filename) if hitomi_debug else None
            sitemap_content = await get_content(session, sitemap_url, semaphore, sitemap_local_path)
            if sitemap_content is None:
                continue
            root = etree.fromstring(sitemap_content)
            urls = [loc.text for loc in root.findall(".//urlset:loc", hitomi_ns) if loc.text]
            for url in urls:
                if SEARCH_STRING in url and ("doujinshi" in url or "manga" in url) and ID_REGEX.search(url):
                    valid_gallery_urls.append(url)

        print("Found", len(valid_gallery_urls), "unique gallery URLs.")

        hitomi_dict = {}
        tasks = []
        for url in valid_gallery_urls:
            match = ID_REGEX.search(url)
            if not match:
                continue
            json_id = match.group(1)
            tasks.append(process_gallery(session, semaphore, json_id, hitomi_dict, js_dir_set))
        await asyncio.gather(*tasks)

        print()
        print("Extracted data for", len(hitomi_dict), "galleries.")

        async with aiofiles.open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
            await f.write(json.dumps(hitomi_dict, ensure_ascii=False, indent=4))
        print("Saved data to", OUTPUT_JSON_PATH)
    return hitomi_dict

async def process_gallery(session, semaphore, json_id, hitomi_dict, js_dir_set):
    js_filename = f"{json_id}.js"
    local_js_path = os.path.join(LOCAL_JS_DIR, js_filename)
    js_url = f"https://ltn.gold-usergeneratedcontent.net/galleries/{json_id}.js"
    if js_filename in js_dir_set:
        print(f"Fetching: {js_url}", end='\r')
        try:
            async with aiofiles.open(local_js_path, "r", encoding="utf-8") as f:
                js_content = await f.read()
        except Exception:
            print(f"Failed to read local JS file: {local_js_path}")
            return
    else:
        print("Fetching:", js_url)
        # Use semaphore inside network call
        async with semaphore:
            try:
                async with session.get(js_url) as response:
                    if response.status != 200:
                        print(f"Skipping {js_url} due to status code {response.status}")
                        return
                    js_content = await response.text()
            except ClientConnectorError as e:
                print(f"Connection error while fetching {js_url}: {e}")
                return
        async with aiofiles.open(local_js_path, "w", encoding="utf-8") as f:
            await f.write(js_content)
        js_dir_set.add(js_filename)
        print("Saved to:", local_js_path)
    json_match = JSON_REGEX.search(js_content)
    if not json_match:
        print(f"No JSON match found in {js_url}")
        return
    data = json.loads(json_match.group(1))
    artists = data.get("artists")
    artist_name = artists[0].get("artist") if isinstance(artists, list) else artists
    file_count = len(data.get("files", []))
    hitomi_dict[json_id] = {
        "artists": artist_name,
        "japanese_title": data.get("japanese_title", ""),
        "title": data.get("title", ""),
        "pages": file_count
    }

async def load_dmm_data(session, semaphore):
    dmm_dict = {}
    if dmm_debug and os.path.isfile(FANZA_JSON_PATH):
        async with aiofiles.open(FANZA_JSON_PATH, "r", encoding="utf-8") as f:
            content = await f.read()
            dmm_dict = json.loads(content)
        print(f"Loaded DMM data from {FANZA_JSON_PATH}")
    else:
        sitemap_index_content = await get_content(session, DMM_SITEMAP_INDEX_URL, semaphore)
        if sitemap_index_content is None:
            return {}
        root = etree.fromstring(sitemap_index_content)
        sitemap_urls = [loc.text for loc in root.findall(".//default:loc", dmm_ns) if loc.text]

        sitemap_xml = []
        for sitemap_url in sitemap_urls:
            filename = os.path.join(debug_path, os.path.basename(sitemap_url))
            content = None
            if dmm_debug and os.path.exists(filename):
                async with aiofiles.open(filename, "rb") as f:
                    print("Read from local file:", filename)
                    content = await f.read()
            if content is None:
                content = await get_content(session, sitemap_url, semaphore, filename)
                if content is None:
                    continue
                if dmm_debug:
                    async with aiofiles.open(filename, "wb") as f:
                        print("Downloaded and cached to local file:", filename)
                        await f.write(content)
            if b'\x03' in content:
                print("Found x03 character in dmmsitemap:", os.path.basename(sitemap_url))
            cleaned_content = content.replace(b'\x03', b'')
            try:
                xml_root = etree.fromstring(cleaned_content)
                sitemap_xml.append(xml_root)
            except etree.XMLSyntaxError:
                print(f"XML parsing error in {sitemap_url}")
                continue

        list_url_elements = []
        for xml in sitemap_xml:
            url_elements = xml.findall('.//default:url', dmm_ns)
            list_url_elements.extend(url_elements)
        print("Number of 'url' elements found:", len(list_url_elements))

        tasks = []
        for url_elem in list_url_elements:
            tasks.append(process_dmm_url(url_elem, dmm_dict))
        await asyncio.gather(*tasks)

        async with aiofiles.open(FANZA_JSON_PATH, "w", encoding="utf-8") as f:
            await f.write(json.dumps(dmm_dict, ensure_ascii=False, indent=4))
        print("Saved data to", FANZA_JSON_PATH)
    return dmm_dict

async def process_dmm_url(url_elem, dmm_dict):
    image_title_elem = url_elem.find('.//image:title', dmm_ns)
    loc_elem = url_elem.find('.//default:loc', dmm_ns)
    if image_title_elem is None or loc_elem is None:
        return
    first_image_title = image_title_elem.text
    loc_url = loc_elem.text
    dmm_dict[loc_url] = {
        "title": first_image_title
    }

async def process_matched_url(session, semaphore, url, hitomi_key, dmm_dict, hitomi_dict, result_dict):
    # Wrap the GET request with semaphore
    async with semaphore:
        try:
            async with session.get(url) as response:
                if response.status != 200:
                    print(f"Skipping {url} due to status code {response.status}")
                    return
                text = await response.text()
        except ClientConnectorError as e:
            print(f"Connection error while fetching {url} {e}")
            return

    tree = html.fromstring(text)
    title_elements = tree.xpath('//title/text()')
    if not title_elements:
        print(f"No title found for {url}")
        return
    title = title_elements[0]

    match = re.search(r'(.*)\(([^)]+)\)', title)
    if not match:
        print(f"Title format unexpected for {url} {title}")
        return
    dmm_title = match.group(1)
    artist_name = match.group(2)

    star_element = tree.xpath("//*[contains(@class, 'u-common__ico--review')]")
    stars = None
    if star_element:
        star_class = star_element[0].get("class", "")
        raw_stars = re.search(r"u-common__ico--review([0-5][0-5])", star_class)
        if raw_stars:
            stars = raw_stars.group(1)

    num_stars = None
    num_stars_element = tree.xpath('//span[@class="userReview__txt"]')
    if num_stars_element:
        raw_text = num_stars_element[0].text_content()
        num_stars = re.sub(r'\s+|[()件]', '', raw_text)

    if num_stars == "-":
        num_stars = 1

    hitomi_dict[hitomi_key].update({
        "dmm_url": url,
        "dmm_artist_name": artist_name,
        "dmm_title": dmm_title,
        "stars": stars,
        "num_stars": num_stars
    })
    result_dict.update({hitomi_key: hitomi_dict[hitomi_key]})

async def main():
    timeout = aiohttp.ClientTimeout(total=1200)
    # Create a semaphore to limit the number of concurrent HTTP requests
    semaphore = asyncio.Semaphore(11)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        hitomi_dict = await load_hitomi_data(session, semaphore)
        dmm_dict = await load_dmm_data(session, semaphore)

        # Create title map
        hitomi_title_map = {}
        for hitomi_key, hitomi_value in hitomi_dict.items():
            title = hitomi_value.get("japanese_title") or hitomi_value.get("title")
            if title:
                hitomi_title_map.setdefault(title, []).append(hitomi_key)

        # Match DMM titles with Hitomi titles
        matched_dmm_urls = []
        for dmm_key, dmm_value in dmm_dict.items():
            dmm_title = dmm_value.get("title")
            if dmm_title in hitomi_title_map:
                for hitomi_key in hitomi_title_map[dmm_title]:
                    matched_dmm_urls.append((dmm_key, hitomi_key))

        result_dict = {}

        # Perform age check
        try:
            async with semaphore:
                async with session.get(age_check_url) as response:
                    if response.status != 200:
                        print(f"Age check failed with status {response.status}")
                    else:
                        pass  # Successfully performed age check
        except ClientConnectorError:
            print("Connection error during age check")

        session.cookie_jar.update_cookies({'age_check_done': '1'})

        tasks = []
        for dmm_url, hitomi_key in matched_dmm_urls:
            tasks.append(process_matched_url(session, semaphore, dmm_url, hitomi_key, dmm_dict, hitomi_dict, result_dict))
        with tqdm(total=len(tasks), desc="Processing URLs") as pbar:
            for task in asyncio.as_completed(tasks):
                await task  # Wait for the task to complete
                pbar.update(1)  # Update the progress bar

if __name__ == "__main__":
    dmm_ns = {
        "default": "http://www.sitemaps.org/schemas/sitemap/0.9",
        "image": "http://www.google.com/schemas/sitemap-image/1.1"
    }
    hitomi_debug = True
    dmm_debug = True
    debug_path = "/home/asdf/Documents/hitomi/tools2/sitemap/"
    # DMM_SITEMAP_INDEX_URL must be defined for DMM, for example:
    DMM_SITEMAP_INDEX_URL = "https://example.com/dmm_sitemap.xml"
    asyncio.run(main())

