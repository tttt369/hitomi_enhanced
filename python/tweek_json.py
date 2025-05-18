import json

path = "./final_result.json"
with open(path, "r") as f:
    data = json.load(f)

for id, item in data.items():
    if isinstance(item["stars"], str):
        item["stars"] = int(item["stars"])
    elif item["stars"] is None:
        item["stars"] = 0

    if isinstance(item["num_stars"], str):
        item["num_stars"] = int(item["num_stars"])
    elif item["num_stars"] is None:
        item["num_stars"] = 0

    if isinstance(item["pages"], str):
        item["pages"] = int(item["pages"])
    elif item["pages"] is None:
        item["pages"] = 0
    if item["stars"] == 0 and item["num_stars"] == 1:
        item["num_stars"] = 0

new_data = []
for id, item in data.items():
    new_entry = {
        "id": id,
        **item
    }
    new_data.append(new_entry)

new_data = sorted(new_data, key=lambda x: x["stars"] * x["num_stars"], reverse=True)

seen_titles = set()
deduplicated_data = []
for item in new_data:
    dmm_title = item["dmm_title"]
    if dmm_title not in seen_titles:
        seen_titles.add(dmm_title)
        deduplicated_data.append(item)

output_path = "./test_final_result.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(deduplicated_data, f, ensure_ascii=False, indent=4)
