
Step 1: The Team Clones the Project
Each teammate needs to get your code onto their own computer. They should open VS Code and do this:

Press Ctrl + Shift + P and type "Git: Clone".

Paste the URL of your GitHub repo (the one ending in .git).

Select a folder on their computer to save it.

Crucial: Once it opens, they need to create their own virtual environment (since the venv folder is ignored by Git).

Paste these into terminal one by one:
py -m venv venv
.\venv\Scripts\activate
py -m pip install -r requirements.txt

Step 2: The "First Mission" Workflow
To keep the main branch clean, follow this "No-Main-Directly" rule:

Pull: git pull origin main (Get the latest code).

Branch: Create a new branch for their task (e.g., feature-ui-design).

Code: Write their React or FastAPI logic.

Stage & Commit: Click the + in the Source Control tab and write a message.

Push: Click Publish Branch.

Pull Request (PR): Go to GitHub.com and click "Compare & Pull Request." You (the Lead) should review it and click Merge once it looks good.

