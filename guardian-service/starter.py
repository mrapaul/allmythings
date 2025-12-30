import asyncio
from temporalio.client import Client
from workflows import NetworkScanWorkflow

async def main():
    # Connect to Temporal
    client = await Client.connect("localhost:7233")

    # Execute the workflow
    print("Starting workflow...")
    result = await client.execute_workflow(
        NetworkScanWorkflow.run,
        id="guardian-scan-001",
        task_queue="guardian-task-queue",
    )

    print(f"Workflow Result: {result}")

if __name__ == "__main__":
    asyncio.run(main())
