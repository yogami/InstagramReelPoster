import subprocess
import json

def run_cmd(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result

BEAM_PATH = "/Users/user1000/Library/Python/3.9/bin/beam"

# Get deployments
res = run_cmd(f"{BEAM_PATH} deployment list --format json")
if res.returncode != 0:
    print("Error listing deployments:", res.stderr)
    exit(1)

deployments = json.loads(res.stdout)

# IDs to KEEP (latest versions)
KEEP_IDS = [
    "070bf8f0-155e-449e-b9b9-d5952f01f893", # flux1-image v8
    "4f6603cd-37d0-4c74-ab4f-97f7fee51cc7", # ffmpeg-render v9
]

for d in deployments:
    id = d['id']
    name = d['name']
    version = d.get('version', '?')
    
    if id in KEEP_IDS:
        print(f"KEEPING: {name} (v{version}) [{id}]")
        continue
        
    print(f"DELETING: {name} (v{version}) [{id}]...")
    del_res = run_cmd(f"{BEAM_PATH} deployment delete {id}")
    if del_res.returncode == 0:
        print(f"SUCCESS: Deleted {id}")
    else:
        print(f"FAILED: {del_res.stderr.strip()}")
