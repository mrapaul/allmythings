from datetime import timedelta
from temporalio import workflow
import asyncio

# Import activity definitions
with workflow.unsafe.imports_passed_through():
    from activities import discover_subnets, discover_live_hosts, scan_host_details

@workflow.defn
class NetworkScanWorkflow:
    @workflow.run
    async def run(self) -> dict:
        workflow.logger.info("Workflow: Starting network scan...")
        
        # 1. Discover Subnets
        subnets = await workflow.execute_activity(
            discover_subnets,
            start_to_close_timeout=timedelta(seconds=10)
        )
        workflow.logger.info(f"Workflow: Found subnets: {subnets}")
        
        if not subnets:
            return {"status": "completed", "hosts": [], "message": "No subnets found"}

        # 2. Discover Live Hosts (Ping Sweep)
        # Run discovery for all subnets in parallel
        discovery_tasks = [
            workflow.execute_activity(
                discover_live_hosts,
                subnet,
                start_to_close_timeout=timedelta(seconds=60)
            )
            for subnet in subnets
        ]
        
        # List of lists of IPs
        live_hosts_lists = await asyncio.gather(*discovery_tasks)
        
        # Flatten
        all_live_ips = set()
        for ip_list in live_hosts_lists:
            for ip in ip_list:
                all_live_ips.add(ip)
                
        workflow.logger.info(f"Workflow: Found {len(all_live_ips)} live hosts")
        
        # 3. Detailed Scan (Fan-Out)
        # Scan all hosts in parallel
        scan_tasks = [
            workflow.execute_activity(
                scan_host_details,
                ip,
                start_to_close_timeout=timedelta(minutes=5)
            )
            for ip in all_live_ips
        ]
        
        scan_results = await asyncio.gather(*scan_tasks)
        
        workflow.logger.info("Workflow: Scan complete.")
        
        return {
            "status": "completed",
            "host_count": len(scan_results),
            "results": scan_results
        }
