import json, re, sys
with open("logs/q025.raw.txt") as f:
    s = f.read()
print("len:", len(s))
print("first 60:", repr(s[:60]))
print("last 60:", repr(s[-60:]))
s2 = s.strip()
s2 = re.sub(r"^```(?:json)?\s*", "", s2)
s2 = re.sub(r"\s*```$", "", s2)
s2 = re.sub(r",(\s*[\]}])", r"\1", s2)
# Try the same balanced extractor logic
depth = 0
start = -1
for i, ch in enumerate(s2):
    if ch == "{":
        if depth == 0:
            start = i
        depth += 1
    elif ch == "}":
        depth -= 1
        if depth == 0 and start >= 0:
            chunk = s2[start:i+1]
            try:
                json.loads(chunk)
                print("OK at i=", i, "len=", len(chunk))
                sys.exit(0)
            except Exception as e:
                print("attempt failed at i=", i, "err:", str(e)[:120])
                start = -1
print("no balanced JSON found")
