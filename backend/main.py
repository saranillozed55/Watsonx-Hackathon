
import requests
import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("WATSONX_API_KEY")
AGENT_ID = os.getenv("AGENT_ID")
ORCHESTRATE_INSTANCE_URL = os.getenv("ORCHESTRATE_INSTANCE_URL").rstrip("/")

# Get IAM token
iam_response = requests.post(
    "https://iam.cloud.ibm.com/identity/token",
    headers={"Content-Type": "application/x-www-form-urlencoded"},
    data={"grant_type": "urn:ibm:params:oauth:grant-type:apikey", "apikey": API_KEY}
)
iam_token = iam_response.json()["access_token"]
print("Token acquired!")

headers = {
    "Authorization": f"Bearer {iam_token}",
    "Content-Type": "application/json"
}

CHAT_URL = f"{ORCHESTRATE_INSTANCE_URL}/v1/orchestrate/{AGENT_ID}/chat/completions"
thread_id = None  # tracks conversation history

def chat(user_message):
    global thread_id

    body = {
        "stream": False,
        "messages": [{"role": "user", "content": user_message}]
    }
    if thread_id:
        body["thread_id"] = thread_id  # continue same conversation

    response = requests.post(CHAT_URL, headers=headers, json=body)

    if response.status_code != 200:
        print(f"Error {response.status_code}: {response.text}")
        return None

    data = response.json()
    thread_id = data.get("thread_id")  # save for next turn
    reply = data["choices"][0]["message"]["content"]
    return reply

# TEST AGENT HERE -> Pair it with frontend
print("\nYou: Hello, what can you help me with?")
reply = chat("Hello, what can you help me with?")
print(f"Agent: {reply}")

print("\nYou: How much is NVIDIA stocks right now?")
reply = chat("How much is NVIDIA stocks right now?")
print(f"Agent: {reply}")