import json

# Load the JSON file
path = "./final_result.json"
with open(path, "r") as f:
    data = json.load(f)

# Convert stars, num_stars, and pages to integers
for id, item in data.items():
    # Convert stars to int if it's a string, or set to 0 if None
    if isinstance(item["stars"], str):
        item["stars"] = int(item["stars"])
    elif item["stars"] is None:
        item["stars"] = 0

    # Convert num_stars to int if it's a string, or set to 0 if None
    if isinstance(item["num_stars"], str):
        item["num_stars"] = int(item["num_stars"])
    elif item["num_stars"] is None:
        item["num_stars"] = 0

    # Convert pages to int if it's a string, or set to 0 if None
    if isinstance(item["pages"], str):
        item["pages"] = int(item["pages"])
    elif item["pages"] is None:
        item["pages"] = 0

# Create a list to store restructured entries
new_data = []
for id, item in data.items():
    new_entry = {
        "id": id,
        **item
    }
    new_data.append(new_entry)

# Sort the list: primary key is 'stars' (descending), secondary key is 'stars * num_stars' (descending)
new_data.sort(key=lambda x: (x["stars"], x["stars"] * x["num_stars"]), reverse=True)

# Save the modified JSON to a new file
output_path = "./test_final_result.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(new_data, f, ensure_ascii=False, indent=4)
# new_json = {}
# new_json.update(json)
# for id in new_json.keys():
#     new_json["hitomi_id"] = id
#
# path = "./new_final_result.json"
# with open(path, "w", encoding="utf-8") as f:
#     json.dump(new_json, f, ensure_ascii=False, indent=4)
# index = (list_json[0])
# print(json[index])


# for i in match_index:
#     list_hitomi = list(hitomi_dict.values())
#     list_dmm = list(dmm_dict.values())
#     if list_hitomi[i]["japanese_title"]:
#         print(list_hitomi[i]["japanese_title"])
#         print(list_dmm[i]["title"])
#     else:
#         print(list_hitomi[i]["title"])
#         print(list_dmm[i]["title"])
