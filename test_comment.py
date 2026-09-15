"""Post a test comment via IG API to trigger webhook event"""
import json, urllib.request, urllib.parse

# Fetch fix-all to get IGAA token
resp = urllib.request.urlopen("https://openreply-zeta-ruby.vercel.app/api/fix-all")
data = json.loads(resp.read())

# Extract IGAA token from sampleComments paging next URL
next_url = data.get("sampleComments", {}).get("paging", {}).get("next", "")
if not next_url:
    print("ERROR: no next URL found")
    exit(1)

parsed = urllib.parse.urlparse(next_url)
qs = urllib.parse.parse_qs(parsed.query)
token = qs.get("access_token", [""])[0]

print("TOKEN_PREFIX:", token[:20], "LEN:", len(token))

# Post comment on first media post
media_id = "18085664627243598"
post_data = urllib.parse.urlencode({"access_token": token, "message": "Webhook test ✅ #auto"}).encode()
req = urllib.request.Request(
    f"https://graph.instagram.com/v21.0/{media_id}/comments",
    data=post_data,
    headers={"Content-Type": "application/x-www-form-urlencoded"}
)
result = json.loads(urllib.request.urlopen(req).read())
print("RESULT:", json.dumps(result, indent=2))