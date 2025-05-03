import os
import re
import json
import requests
from lxml import html
from lxml import etree

DOWNLOAD_FILE = False
READ_FROM_OUTPUT = False
DEBUG_SITEMAP_DIR = "/home/asdf/Documents/hitomi/tools2/sitemap"
# LOCAL_JS_DIR = "/home/asdf/Documents/hitomi/urls/id_js/"
LOCAL_JS_DIR = "id_js/"
OUTPUT_JSON_PATH = "data.json"
FANZA_JSON_PATH = "fanza_data.json"
SITEMAP_INDEX_URL = "https://ltn.gold-usergeneratedcontent.net/sitemap.xml"
DMM_SITEMAP_INDEX_URL = "https://www.dmm.co.jp/dc/doujin/sitemap_image.xml"
AGE_CHECK_URL = 'https://www.dmm.co.jp/age_check/=/declared=yes/?rurl=https%3A%2F%2Fgames.dmm.co.jp%2Flist%2Fpc'
SEARCH_STRING = "%65E5%672C%8A9E"
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

def get_content(url, local_path=None):
    if READ_FROM_OUTPUT and local_path and os.path.isfile(local_path):
        with open(local_path, "rb") as f:
            print("read from local", local_path)
            return f.read()
    response = requests.get(url)
    content = response.content
    if DOWNLOAD_FILE and local_path:
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as f:
            print("download to local", local_path)
            f.write(content)
    return content

# Hitomi データの読み込みまたは処理
hitomi_dict = None
js_dir_set = set()
if READ_FROM_OUTPUT and os.path.isfile(OUTPUT_JSON_PATH):
    with open(OUTPUT_JSON_PATH, "r", encoding="utf-8") as f:
        hitomi_dict = json.load(f)
    print(f"Loaded hitomi data from {OUTPUT_JSON_PATH}")
else:
    # Process sitemap index from gold-usergeneratedcontent.net
    sitemap_index_content = get_content(SITEMAP_INDEX_URL)
    root = etree.fromstring(sitemap_index_content)
    sitemap_urls = [loc.text for loc in root.findall(".//sitemap:loc", HITOMI_NS)]
    print("Found", len(sitemap_urls), "hitomi sitemaps.")

    if READ_FROM_OUTPUT:
        js_dir_set = set(os.listdir(LOCAL_JS_DIR))
        print("Loaded", len(js_dir_set), type(js_dir_set), "cached JS files.")

    valid_gallery_urls = []
    for sitemap_url in sitemap_urls:
        sitemap_filename = os.path.basename(sitemap_url)
        sitemap_local_path = os.path.join(DEBUG_SITEMAP_DIR, sitemap_filename) if DOWNLOAD_FILE or READ_FROM_OUTPUT else None
        sitemap_content = get_content(sitemap_url, sitemap_local_path)
        root = etree.fromstring(sitemap_content)
        urls = [loc.text for loc in root.findall(".//urlset:loc", HITOMI_NS)]
        for url in urls:
            if SEARCH_STRING in url and ("doujinshi" in url or "manga" in url) and ID_REGEX.search(url):
                valid_gallery_urls.append(url)
        print(sitemap_url)

    print("Found", len(valid_gallery_urls), "unique gallery URLs.")

    hitomi_dict = {}
    for url in valid_gallery_urls:
        match = ID_REGEX.search(url)
        json_id = match.group(1)
        js_filename = f"{json_id}.js"
        local_js_path = os.path.join(LOCAL_JS_DIR, js_filename)
        js_url = f"https://ltn.gold-usergeneratedcontent.net/galleries/{json_id}.js"
        if js_filename in js_dir_set:
            print(f"Fetching from local: {js_url}", end='\r')
            with open(local_js_path, "r", encoding="utf-8") as f:
                js_content = f.read()
        else: # bug: hitomi debugが有効でもダウンロード？
            print("Fetching from online:", js_url)
            response = requests.get(js_url)
            js_content = response.text
            if DOWNLOAD_FILE:
                with open(local_js_path, "w", encoding="utf-8") as f:
                    f.write(js_content)
                js_dir_set.add(js_filename)
                print("Saved to:", local_js_path)
        json_match = JSON_REGEX.search(js_content)
        data = json.loads(json_match.group(1))
        artists = data.get("artists")
        artist_name = artists[0].get("artist") if isinstance(artists, list) else artists
        file_count = len(data.get("files", []))
        hitomi_dict[json_id] = {
            "artists": artist_name,
            "japanese_title": data["japanese_title"],
            "title": data["title"],
            "pages": file_count
        }

    print()
    print("Extracted data for", len(hitomi_dict), "galleries.")

    with open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(hitomi_dict, f, ensure_ascii=False, indent=4)
    print("Saved data to", OUTPUT_JSON_PATH)

print("Processing DMM sitemap...")

# DMM データの読み込みまたは処理
if READ_FROM_OUTPUT and os.path.isfile(FANZA_JSON_PATH):
    with open(FANZA_JSON_PATH, "r", encoding="utf-8") as f:
        dmm_dict = json.load(f)
    print(f"Loaded DMM data from {FANZA_JSON_PATH}")
else:
    response = requests.get(DMM_SITEMAP_INDEX_URL)
    root = etree.fromstring(response.content)
    sitemap_urls = [loc.text for loc in root.findall(".//default:loc", DMM_NS) if loc.text]

    sitemap_xml = []
    for sitemap_url in sitemap_urls:
        filename = os.path.join(DEBUG_SITEMAP_DIR, os.path.basename(sitemap_url))
        content = None
        if READ_FROM_OUTPUT and os.path.exists(filename):
            with open(filename, "rb") as f:
                print("Read from local file:", filename)
                content = f.read()
        if content is None:
            response = requests.get(sitemap_url)
            content = response.content
            if DOWNLOAD_FILE:
                with open(filename, "wb") as f:
                    print("Downloaded and cached to local file:", filename)
                    f.write(content)
        if b'\x03' in content:
            print("Found x03 character in dmmsitemap:", os.path.basename(sitemap_url))
        cleaned_content = content.replace(b'\x03', b'')
        xml_root = etree.fromstring(cleaned_content)
        sitemap_xml.append(xml_root)

    list_url_elements = []
    for xml in sitemap_xml:
        url_elements = xml.findall('.//default:url', DMM_NS)
        list_url_elements.extend(url_elements)
    print("Number of 'url' elements found:", len(list_url_elements))

    dmm_dict = {}
    for url_elem in list_url_elements:
        image_title_elem = url_elem.find('.//image:title', DMM_NS)
        loc_elem = url_elem.find('.//default:loc', DMM_NS)
        #bug: dmmのurlもあったほうがいい
        first_image_title = image_title_elem.text
        loc_url = loc_elem.text
        dmm_dict[loc_url] = {
            "title" : first_image_title
        }

    with open(FANZA_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(dmm_dict, f, ensure_ascii=False, indent=4)
    print("Saved data to", FANZA_JSON_PATH)

# hitomi_dict の各エントリの "japanese_title" または "title" をキーとして、
# そのキーに対応する hitomi_dict のキー（または複数のキー）をリストで保持する辞書を作成
hitomi_title_map = {}
for hitomi_key, hitomi_value in hitomi_dict.items():
    title = hitomi_value.get("japanese_title") or hitomi_value.get("title")
    if title:
        hitomi_title_map.setdefault(title, []).append(hitomi_key)

# dmm_dict を走査し、dmm_value["title"] が hitomi_title_map に含まれる場合に
# そのリスト内の各 hitomi_key との組を matched_dmm_urls に追加
matched_dmm_urls = []
for dmm_key, dmm_value in dmm_dict.items():
    dmm_title = dmm_value.get("title")
    if dmm_title in hitomi_title_map:
        for hitomi_key in hitomi_title_map[dmm_title]:
            matched_dmm_urls.append((dmm_key, hitomi_key))

# client = requests.Session()
# client.get(AGE_CHECK_URL)
# client.cookies.set('age_check_done', '1')
#
# matched_dmm_urls = matched_dmm_urls[:1]
# result_dict = {}
# for url, hitomi_key in matched_dmm_urls:
#     response = client.get(url)
#     response.raise_for_status()  
#
#     tree = html.fromstring(response.text)
#     title = tree.xpath('//title/text()')[0]  # 最初のtitle要素のテキストを取得
#
#     match = re.match(r'([^()]+)\(([^()]+)\)(.*)', title)
#     artist_name = match.group(2)
#
#     # "u-common__ico--review" を含む要素をXPathで取得
#     star_element = tree.xpath("//*[contains(@class, 'u-common__ico--review')]")
#     stars = None
#     if star_element:
#         # クラス属性からレビューの星数を正規表現で抽出
#         star_class = star_element[0].get("class", "")
#         raw_stars = re.search(r"u-common__ico--review([0-5][0-5])", star_class)
#         if raw_stars:
#             stars = raw_stars.group(1)
#
#     # "userReview__txt" クラスを持つ<span>要素をXPathで取得
#     num_stars = None
#     num_stars_element = tree.xpath('//span[@class="userReview__txt"]')
#     if num_stars_element:
#         # テキスト内容から不要な文字（空白や()件）を削除して数値部分を抽出
#         raw_text = num_stars_element[0].text_content()
#         num_stars = re.sub(r'\s+|[()件]', '', raw_text)
#
#     if num_stars == "-":
#         num_stars = 1
#
#     hitomi_dict[hitomi_key].update({"dmm_url": url, "dmm_artist_name": artist_name, "dmm_title": dmm_dict[url]["title"], "stars": stars, "num_stars": num_stars})
#     result_dict.update({hitomi_key: hitomi_dict[hitomi_key]})
#     result = f'("{dmm_dict[url]["title"]}", "{artist_name}", "{stars}", "{num_stars}")'
#     # print(result)
#     print(hitomi_dict[hitomi_key])
#
# path = "result.json"
# with open(path, "w") as f:
#     json.dump(result_dict, f, ensure_ascii=False, indent=4)
# print("result saved to", path)
