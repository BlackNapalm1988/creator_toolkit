# scripts/init_dbs.py
from modules.jobs import init_jobs_db
from modules.chat import init_chat_db
from modules.auth import init_auth_db

if __name__ == "__main__":
    init_jobs_db()
    init_chat_db()
    init_auth_db()
    print("Databases initialized.")
