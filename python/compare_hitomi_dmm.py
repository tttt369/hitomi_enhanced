import os
import re
import json
import asyncio
import aiohttp
import aiofiles
from lxml import etree
from lxml import html
import urllib.parse
from aiohttp import ClientResponseError
from typing import Optional, Dict, Any

# Configuration
DOWNLOAD_SITEMAP = True
READ_LOCAL_SITEMAP = True
DOWNLOAD_JS = True
READ_LOCAL_JS = True
HITOMI_READ_FROM_OUTPUT = True
JAVY_READ_FROM_OUTPUT = True

JAVY_SITEMAP_DIR = "../urls/sitemap/javy"
HITOMI_SITEMAP_DIR = "../urls/sitemap/hitomi"
LOCAL_JS_DIR = "../urls/id_js"
HITOMI_JSON_PATH = "../urls/hitomi_data.json"
JAVY_JSON_PATH = "../urls/javy_data.json"
RESULT_JSON_PATH = "../urls/result.json"
HITOMI_SITEMAP_INDEX_URL = "https://ltn.gold-usergeneratedcontent.net/sitemap.xml"
JAVY_SITEMAP_INDEX_URL = "https://javy.jp/sitemap.xml"
AGE_CHECK_URL = 'https://www.dmm.co.jp/age_check/=/declared=yes/?rurl=https%3A%2F%2Fgames.dmm.co.jp%2Flist%2Fpc'
SEARCH_STRING = "%65E5%672C%8A9E"  # 日本語
JAVY_SITEMAP_BATCH_SIZE = 10
HITOMI_SITEMAP_BATCH_SIZE = 10
JS_BATCH_SIZE = 500
ID_REGEX = re.compile(r'%2D(\d+)\.html$')
JSON_REGEX = re.compile(r'^var galleryinfo = ({.*})$', re.MULTILINE)
NS = {
    "sitemap": "http://www.sitemaps.org/schemas/sitemap/0.9",
    "urlset": "http://www.sitemaps.org/schemas/sitemap/0.9"
}
if DOWNLOAD_JS:
    os.makedirs(LOCAL_JS_DIR, exist_ok=True)

async def load_local_json(json_path: str) -> Dict[str, Any]:
    if os.path.isfile(json_path):
        async with aiofiles.open(json_path, "r", encoding="utf-8") as f:
            data = json.loads(await f.read())
        print(f"Loaded data from {json_path}")
        return data
    return {}

async def process_sitemap_index(session, javy: bool = False) -> list[str]:
    if javy:
        sitemap_index_content = await get_sitemap_content(session, JAVY_SITEMAP_INDEX_URL, JAVY_SITEMAP_DIR)
        root = etree.fromstring(sitemap_index_content)
        pattern = re.compile(r"^https:\/\/javy\.jp\/sitemap\/doujin\/doujin\/doujin_\d*\.xml$")
        sitemap_urls = [loc.text for loc in root.findall(".//sitemap:loc", NS) if pattern.match(loc.text)]
        print("Found", len(sitemap_urls), "javy sitemaps.")
    else:
        sitemap_index_content = await get_sitemap_content(session, HITOMI_SITEMAP_INDEX_URL, HITOMI_SITEMAP_DIR)
        root = etree.fromstring(sitemap_index_content)
        sitemap_urls = [loc.text for loc in root.findall(".//sitemap:loc", NS)]
        print("Found", len(sitemap_urls), "hitomi sitemaps.")
    return sitemap_urls

async def process_sitemap(session, sitemap_urls: list[str], javy: bool = False):
    count = 0
    dir = ""
    sitemap_batch = 0

    if javy:
        dir = JAVY_SITEMAP_DIR
        sitemap_batch = JAVY_SITEMAP_BATCH_SIZE
    else:
        dir = HITOMI_SITEMAP_DIR
        sitemap_batch = HITOMI_SITEMAP_BATCH_SIZE

    for i in range(0, len(sitemap_urls), sitemap_batch):
        batch = sitemap_urls[i:(i + sitemap_batch)]
        print(f"{i} // {len(sitemap_urls)}")
        tasks = [get_sitemap_content(session, url, dir) for url in batch]
        results = await asyncio.gather(*tasks)

        for content, sitemap_url in zip(results, batch):
            # if b'\x03' in content:
            #     print("Found x03 character in sitemap:", os.path.basename(sitemap_url))
            #     content = content.replace(b'\x03', b'')
            root = etree.fromstring(content)
            for loc in root.findall(".//urlset:loc", NS):
                url = loc.text
                count += 1
                if javy:
                    yield url
                if SEARCH_STRING in url and ("doujinshi" in url or "manga" in url) and ID_REGEX.search(url):
                    yield url
            print(sitemap_url)
    print("found", count)

async def make_hitomi_json(session, sitemap_generator) -> Dict[str, Any]:
    hitomi_dict = {}
    skiped = 0
    found_urls = [url async for url in sitemap_generator]

    for i in range(0, len(found_urls), JS_BATCH_SIZE):
        tasks = []
        batch = found_urls[i:(i + JS_BATCH_SIZE)]
        print(f"{i} // {len(found_urls)}")
        for url in batch:
            json_id = ID_REGEX.search(url).group(1)
            js_url = f"https://ltn.gold-usergeneratedcontent.net/galleries/{json_id}.js"
            tasks.append(get_js_content(session, js_url, LOCAL_JS_DIR))
        results = await asyncio.gather(*tasks)
        for js_content in results:
            json_match = JSON_REGEX.search(js_content)
            if json_match:
                data = json.loads(json_match.group(1))
                artists = data.get("artists")
                artist_name = artists[0].get("artist") if isinstance(artists, list) else artists
                json_id = data.get("id")
                json_jtitle = data.get("japanese_title")
                json_title = data.get("title")
                title_key = json_jtitle if json_jtitle else json_title
                file_count = len(data.get("files", []))
                hitomi_dict[title_key] = {
                    "id": json_id,
                    "artists": artist_name,
                    "title": json_title,
                    "pages": int(file_count)
                }
            else:
                skiped += 1
    print("Extracted data for", len(hitomi_dict), "galleries.")
    print("skip", skiped, "galleries.")
    await write_json(HITOMI_JSON_PATH, hitomi_dict)
    return hitomi_dict

async def write_json(path: str, content: Any) -> None:
    async with aiofiles.open(path, "w", encoding="utf-8") as f:
        await f.write(json.dumps(content, ensure_ascii=False, indent=4))
    print("Saved data to", path)

async def make_javy_json(found_urls) -> Dict[str, Any]:
    javy_dict = {}
    pattern = re.compile(r"^https:\/\/javy\.jp\/doujin\/(d_\d*)\/(.*)\/$")

    async for url in found_urls:
        match = pattern.match(url)
        if match:
            id = match.group(1)
            loc_title = match.group(2)
            decode_title = urllib.parse.unquote(loc_title)
            javy_dict[decode_title] = {
                "id": id,
                "url": "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=" + id
            }

    await write_json(JAVY_JSON_PATH, javy_dict)
    return javy_dict

async def scrape_javy(session, hitomi_dict: Dict[str, Any], url: str, content_title: str) -> Dict[str, Any]:
    result_dict = {}

    async with session.get(url) as response:
        try:
            response.raise_for_status()
            text = await response.text()
        except ClientResponseError as e:
            print(e)
            if e.status == 404:
                return {}
            else:
                raise

    tree = html.fromstring(text)
    title = tree.xpath('//title/text()')[0]

    match = re.match(r'([^()]+)\(([^()]+)\)(.*)', title)
    artist_name = match.group(2) if match else ""

    star_element = tree.xpath("//*[contains(@class, 'u-common__ico--review')]")
    stars = 0  # Default to 0
    if star_element:
        star_class = star_element[0].get("class", "")
        raw_stars = re.search(r"u-common__ico--review([0-5][0-5])", star_class)
        if raw_stars:
            stars = int(raw_stars.group(1))  # Convert to int

    num_stars_element = tree.xpath('//span[@class="userReview__txt"]')
    num_stars = 0  # Default to 0
    if num_stars_element:
        raw_text = num_stars_element[0].text_content()
        num_stars = re.sub(r'\s+|[()件]', '', raw_text)
        num_stars = int(num_stars) if num_stars != "-" else 0

    # Apply the rule: if stars == 0 and num_stars == 1, set num_stars to 0
    if stars == 0 and num_stars == 1:
        num_stars = 0

    hitomi_dict[content_title].update({
        "javy_url": url,
        "javy_artist_name": artist_name,
        "javy_title": content_title,
        "stars": stars,
        "num_stars": num_stars
    })

    result_dict[content_title] = hitomi_dict[content_title]

    print(result_dict)
    return result_dict

async def get_sitemap_content(session, url: str, dir: Optional[str] = None) -> bytes:
    filename = os.path.basename(url)
    if READ_LOCAL_SITEMAP and dir:
        if not os.path.exists(dir):
            os.makedirs(dir)
        local_path = os.path.join(dir, filename)
        if os.path.exists(local_path):
            async with aiofiles.open(local_path, "rb") as f:
                return await f.read()

    async with session.get(url) as response:
        content = await response.read()

        if DOWNLOAD_SITEMAP and dir:
            if not os.path.exists(dir):
                os.makedirs(dir)
            local_path = os.path.join(dir, filename)
            if not os.path.exists(local_path):
                async with aiofiles.open(local_path, "wb") as f:
                    print("download to local", local_path)
                    await f.write(content)
    return content

async def get_js_content(session, url: str, dir: Optional[str] = None) -> str:
    filename = os.path.basename(url)
    if READ_LOCAL_JS and dir:
        path = os.path.join(dir, filename)
        if os.path.exists(path):
            local_path = os.path.join(dir, filename)
            async with aiofiles.open(local_path, "r") as f:
                return await f.read()

    async with session.get(url) as response:
        bytes_content = await response.read()
        content = bytes_content.decode("utf-8")
        if DOWNLOAD_JS and dir:
            local_path = os.path.join(dir, filename)
            if not os.path.exists(local_path):
                async with aiofiles.open(local_path, "w") as f:
                    print("download to local", local_path)
                    await f.write(content)
    return content

async def main():
    hitomi_dict = {}
    if HITOMI_READ_FROM_OUTPUT:
        hitomi_dict = await load_local_json(HITOMI_JSON_PATH)
    if not hitomi_dict:
        sitemap_urls = []
        async with aiohttp.ClientSession() as session:
            sitemap_urls = await process_sitemap_index(session)
            hitomi_dict = await make_hitomi_json(session, process_sitemap(session, sitemap_urls))

    javy_dict = {}
    if JAVY_READ_FROM_OUTPUT:
        javy_dict = await load_local_json(JAVY_JSON_PATH)
    if not javy_dict:
        sitemap_urls = []
        async with aiohttp.ClientSession() as session:
            sitemap_urls = await process_sitemap_index(session, javy=True)
            javy_dict = await make_javy_json(process_sitemap(session, sitemap_urls, javy=True))

    hitomi_title_map = {title.replace(" ", ""): title for title in hitomi_dict.keys()}
    matched_javy_urls = []
    seen_titles = set()

    for javy_title, javy_data in javy_dict.items():
        javy_title_clean = javy_title.replace(" ", "")
        if javy_title_clean in hitomi_title_map and javy_title not in seen_titles:
            seen_titles.add(javy_title)
            url = javy_data["url"]
            title = hitomi_title_map.get(javy_title_clean)
            matched_javy_urls.append((url, title))

    # continue from existing
    result_dict = {}
    if os.path.exists(RESULT_JSON_PATH):
        existing_data = await load_local_json(RESULT_JSON_PATH)
        if existing_data:
            seen_titles = set()
            seen_titles.update(item["javy_url"] for item in existing_data.values())
            matched_javy_urls = [
                (url, id) for url, id in matched_javy_urls
                if url not in seen_titles
            ]
            print("continue from", len(existing_data))

    async with aiohttp.ClientSession() as session:
        session.cookie_jar.update_cookies({'age_check_done': '1'})
        async with session.get(AGE_CHECK_URL) as resp:
            await resp.text()
        for i in range(0, len(matched_javy_urls), 15):
            batch = matched_javy_urls[i:(i+15)]
            tasks = [
                scrape_javy(session, hitomi_dict, url, title)
                for url, title in batch
            ]
            batch_results = await asyncio.gather(*tasks)
            for res in batch_results:
                if res:
                    result_dict.update(res)
            await write_json(RESULT_JSON_PATH, result_dict)

        sorted_items = sorted(result_dict.items(), key=lambda x: x[1]["stars"] * x[1]["num_stars"], reverse=True)
        sorted_data = {key: value for key, value in sorted_items}
        await write_json(RESULT_JSON_PATH, sorted_data)

if __name__ == "__main__":
    asyncio.run(main())
