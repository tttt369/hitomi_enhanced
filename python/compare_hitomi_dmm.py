import os
import re
import json
import asyncio
import aiohttp
import aiofiles
from lxml import etree
from lxml import html
from tqdm.asyncio import tqdm
from aiohttp import ClientResponseError
from typing import Optional, List, Tuple, Dict, Any

# Configuration
DOWNLOAD_SITEMAP = False
READ_LOCAL_SITEMAP = False
DOWNLOAD_JS = True
READ_LOCAL_JS = True
READ_FROM_OUTPUT = True

SITEMAP_DIR = "/home/asdf/Documents/hitomi/tools2/sitemap"
LOCAL_JS_DIR = "/home/asdf/Documents/hitomi/urls/id_js"
HITOMI_JSON_PATH = "hitomi_data.json"
DMM_JSON_PATH = "dmm_data.json"
HITOMI_SITEMAP_INDEX_URL = "https://ltn.gold-usergeneratedcontent.net/sitemap.xml"
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

async def load_local_json(json_path) -> Dict[str, Any]:
    if READ_FROM_OUTPUT and os.path.isfile(json_path):
        async with aiofiles.open(json_path, "r", encoding="utf-8") as f:
            dict = json.loads(await f.read())
        print(f"Loaded data from {json_path}")
        return dict
    return {}

async def process_sitemap_index(session, sitemap_index, dir, dmm=False) -> list[str]:
    sitemap_index_content = await get_sitemap_content(session, sitemap_index, dir)
    root = etree.fromstring(sitemap_index_content)
    if dmm:
        sitemap_urls = [loc.text for loc in root.findall(".//default:loc", DMM_NS)]
        print("Found", len(sitemap_urls), "dmm sitemaps.")
    else:
        sitemap_urls = [loc.text for loc in root.findall(".//sitemap:loc", HITOMI_NS)]
        print("Found", len(sitemap_urls), "hitomi sitemaps.")
    return sitemap_urls


async def process_sitemap(session, sitemap_urls, dmm=False) -> list[str]:
    found_urls = []
    count=[]
    tasks = []
    print(dmm)
    for sitemap_url in sitemap_urls:
        tasks.append(get_sitemap_content(session, sitemap_url, SITEMAP_DIR))
    results = await asyncio.gather(*tasks)

    for content, sitemap_url in zip(results, sitemap_urls):
        if dmm:
            if b'\x03' in content:
                print("Found x03 character in dmmsitemap:", os.path.basename(sitemap_url))
                content = content.replace(b'\x03', b'')
            root = etree.fromstring(content)
            urls = [loc for loc in root.findall('.//default:url', DMM_NS)]
        else:
            root = etree.fromstring(content)
            urls = []
            for loc in root.findall(".//urlset:loc", HITOMI_NS):
                url = loc.text
                count.append("a")
                if SEARCH_STRING in url and ("doujinshi" in url or "manga" in url) and ID_REGEX.search(url):
                    urls.append(url)
        found_urls.extend(urls)
        print(sitemap_url)
    print("found", len(count))
    print("Number of 'url' elements found:", len(found_urls))
    return found_urls

async def process_js(session, valid_gallery_urls):
    hitomi_dict = {}
    skiped = 0
    for i in range(0, len(valid_gallery_urls), JS_BATCH_SIZE):
        tasks = []
        batch = valid_gallery_urls[i:(i + JS_BATCH_SIZE)]
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
                json_id = data.get("id")
                artist_name = artists[0].get("artist") if isinstance(artists, list) else artists
                file_count = len(data.get("files", []))
                hitomi_dict[json_id] = {
                    "artists": artist_name,
                    "japanese_title": data["japanese_title"],
                    "title": data["title"],
                    "pages": file_count
                }
            else:
                skiped +=1
    print("Extracted data for", len(hitomi_dict), "galleries.")
    print("skip", skiped, "galleries.")
    await write_json(HITOMI_JSON_PATH, hitomi_dict)
    return hitomi_dict


async def write_json(path, content):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(content, f, ensure_ascii=False, indent=4)
    print("Saved data to", path)

async def make_dmm_json(found_urls) -> Dict[str, Any]:
    dmm_dict = {}
    for url_elem in found_urls:
        image_title_elem = url_elem.find('.//image:title', DMM_NS)
        loc_elem = url_elem.find('.//default:loc', DMM_NS)
        first_image_title = image_title_elem.text
        loc_url = loc_elem.text
        dmm_dict[loc_url] = {
            "title" : first_image_title
        }
    await write_json(DMM_JSON_PATH, dmm_dict)
    return dmm_dict

async def scrape_dmm(client, hitomi_dict, dmm_dict, url, hitomi_key):
    result_dict = {}

    async with client.get(url) as response:
        try:
            response.raise_for_status()
            text = await response.text()
        except ClientResponseError as e:
            if e.status == 404:
                print(url)
                return {}
            else:
                raise

    tree = html.fromstring(text)
    title = tree.xpath('//title/text()')[0]

    match = re.match(r'([^()]+)\(([^()]+)\)(.*)', title)
    artist_name = match.group(2) if match else ""

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
        "dmm_title": dmm_dict[url]["title"],
        "stars": stars,
        "num_stars": num_stars
    })

    result_dict[hitomi_key] = hitomi_dict[hitomi_key]

    print(hitomi_dict[hitomi_key])
    return result_dict

async def get_sitemap_content(session, url, dir=None) -> bytes:
    filename = os.path.basename(url)
    if READ_LOCAL_SITEMAP and dir:
        local_path = os.path.join(dir, filename)
        async with aiofiles.open(local_path, "rb") as f:
            print("read from local", local_path)
            return await f.read()

    async with session.get(url) as response:
        content = await response.read()

        if DOWNLOAD_SITEMAP and dir:
            local_path = os.path.join(dir, filename)
            if not os.path.exists(local_path): 
                async with aiofiles.open(local_path, "wb") as f:
                    print("download to local", local_path)
                    await f.write(content)
    return content

async def get_js_content(session, url, dir=None) -> str:
    filename = os.path.basename(url)
    if READ_LOCAL_JS and dir:
        path = os.path.join(dir, filename)
        if os.path.exists(path):
            local_path = os.path.join(dir, filename)
            async with aiofiles.open(local_path, "r") as f:
                # print("read from local", local_path)
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
    if READ_FROM_OUTPUT:
        hitomi_dict = await load_local_json(HITOMI_JSON_PATH)
    if hitomi_dict == {}:
        sitemap_urls = []
        found_urls = []
        async with aiohttp.ClientSession() as session:
            sitemap_urls = await process_sitemap_index(session, HITOMI_SITEMAP_INDEX_URL, SITEMAP_DIR)
            found_urls = await process_sitemap(session, sitemap_urls)
            hitomi_dict = await process_js(session, found_urls)

    dmm_dict = {}
    if READ_FROM_OUTPUT:
        dmm_dict = await load_local_json(DMM_JSON_PATH)
    if dmm_dict == {}:
        sitemap_urls = []
        found_urls = []
        async with aiohttp.ClientSession() as session:
            sitemap_urls = await process_sitemap_index(session, DMM_SITEMAP_INDEX_URL, SITEMAP_DIR, dmm=True)
            found_urls = await process_sitemap(session, sitemap_urls, dmm=True)
            dmm_dict = await make_dmm_json(found_urls)

    hitomi_title_map = {}
    for hitomi_key, hitomi_value in hitomi_dict.items():
        title = hitomi_value.get("japanese_title") or hitomi_value.get("title")
        if title:
            title = title.replace(" ", "")
            hitomi_title_map.setdefault(title, []).append(hitomi_key)

    matched_dmm_urls = []
    for dmm_key, dmm_value in dmm_dict.items():
        dmm_title = dmm_value.get("title")
        dmm_title = dmm_title.replace(" ", "")
        if dmm_title in hitomi_title_map:
            for hitomi_key in hitomi_title_map[dmm_title]:
                matched_dmm_urls.append((dmm_key, hitomi_key))
                # dict_result[str(dmm_key)] = str(hitomi_key)
    # await write_json("result.json", dict_result)
    # print((matched_dmm_urls))


    # matched_dmm_urls = matched_dmm_urls[:40]
    # async with aiohttp.ClientSession() as session:
    #     session.cookie_jar.update_cookies({'age_check_done': '1'})
    #     async with session.get(AGE_CHECK_URL) as response:
    #         result_dict = {}
    #         for i in range(len(matched_dmm_urls), 20):
    #             tasks = []
    #             batch = matched_dmm_urls[i:(i + 20)]
    #             print(batch)
    #             for url, id in batch:
    #                 tasks.append(scrape_dmm(response, hitomi_dict, dmm_dict, url, id))
    #             result_dict = await asyncio.gather(*tasks)
    # print(result_dict)

    if os.path.exists("final_result.json"):
        result_dict = await load_local_json("final_result.json")
        matched_dmm_urls = matched_dmm_urls[len(result_dict):]
        print("continue from ", len(result_dict))
    else:
        result_dict = {}

    # matched_dmm_urls = matched_dmm_urls[:40]
    async with aiohttp.ClientSession() as session:
        session.cookie_jar.update_cookies({'age_check_done': '1'})
        async with session.get(AGE_CHECK_URL) as resp:
            await resp.text()
        for i in range(0, len(matched_dmm_urls), 15):
            batch = matched_dmm_urls[i:i+15]
            tasks = [
                #skip 'https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_226799/' 233103
                scrape_dmm(session, hitomi_dict, dmm_dict, url, id)
                for url, id in batch
            ]
            batch_results = await asyncio.gather(*tasks)
            for res in batch_results:
                result_dict.update(res)
            await write_json("final_result.json", result_dict)
    await write_json("final_result.json", result_dict)
    print(result_dict)

if __name__ == "__main__":
    asyncio.run(main())
