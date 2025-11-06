from app.workers.queue import run_worker
from modules.jobs import init_jobs_db

if __name__ == "__main__":
    init_jobs_db()
    print("Worker started. Press Ctrl+C to stop.")
    try:
        run_worker(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
