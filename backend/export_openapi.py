"""
Run this from the backend/ folder to export the OpenAPI spec:

    python export_openapi.py

This generates openapi_spec.json which you upload to WatsonX Orchestrate
as an OpenAPI tool on your Dallas agents.
"""

import json
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

# Stub out env vars so main.py loads without a real .env
os.environ.setdefault("WATSONX_API_KEY",          "stub")
os.environ.setdefault("AGENT_ID",                  "stub")
os.environ.setdefault("ORCHESTRATE_INSTANCE_URL",  "https://stub.example.com")
os.environ.setdefault("FINNHUB_API_KEY",           "stub")

from main import app

spec = app.openapi()

spec["servers"] = [
    {
        "url": "https://crust-marmalade-recreate.ngrok-free.dev",
        "description": "Smiley Investment Advisory Backend"
    }
]

output_path = os.path.join(os.path.dirname(__file__), "openapi_spec.json")
with open(output_path, "w") as f:
    json.dump(spec, f, indent=2)

print(f"✓ OpenAPI spec written to {output_path}")
print(f"  Title:    {spec['info']['title']}")
print(f"  Version:  {spec['info']['version']}")
print(f"  Routes:   {len(spec['paths'])} endpoints")
print()
print("Upload openapi_spec.json to WatsonX Orchestrate:")
print("  Agent → Tools → Add tool → OpenAPI → Upload file")
