import asyncio
from temporalio.client import Client
from temporalio.worker import Worker
from activities import discover_subnets, discover_live_hosts, scan_host_details
from workflows import NetworkScanWorkflow

async def main():
    print("Connecting to Temporal server...")
    # For local development with docker-compose
    # Note: Ensure Temporal server is running via docker-compose
    try:
        client = await Client.connect("localhost:7233", namespace="default")
    except Exception as e:
        print(f"Failed to connect to Temporal: {e}")
        print("Is the Temporal server running? (docker-compose -f docker-compose.guardian.yml up -d)")
        return

    # Run the worker
    worker = Worker(
        client,
        task_queue="guardian-task-queue",
        workflows=[NetworkScanWorkflow],
        activities=[discover_subnets, discover_live_hosts, scan_host_details],
    )
    
    print("Worker started. Listening on 'guardian-task-queue'...")
    await worker.run()

if __name__ == "__main__":
    asyncio.run(main())
