from modules.jobs import QueueWorker, init_jobs_db
from modules.job_handlers import job_handle_package, job_handle_qa_batch

if __name__ == "__main__":
    init_jobs_db()
    worker = QueueWorker(
        handlers={
            "package": job_handle_package,
            "qa_batch": job_handle_qa_batch,
        },
        poll_interval=0.5,
    )
    print("Worker started. Press Ctrl+C to stop.")
    try:
        worker.run()
    except KeyboardInterrupt:
        pass
