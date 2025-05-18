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
    if item["stars"] == 0 and item["num_stars"] == 1:
        item["num_stars"] = 0  # This is redundant but included per your snippet

# Create a list to store restructured entries
new_data = []
for id, item in data.items():
    new_entry = {
        "id": id,
        **item
    }
    new_data.append(new_entry)

# Sort the list by the product of stars and num_stars in descending order
new_data = sorted(new_data, key=lambda x: x["stars"] * x["num_stars"], reverse=True)

# Remove duplicates based on dmm_title, keeping the first occurrence
seen_titles = set()
deduplicated_data = []
for item in new_data:
    dmm_title = item["dmm_title"]
    if dmm_title not in seen_titles:
        seen_titles.add(dmm_title)
        deduplicated_data.append(item)

# Save the modified, sorted, and deduplicated JSON to a new file
output_path = "./test_final_result.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(deduplicated_data, f, ensure_ascii=False, indent=4)
