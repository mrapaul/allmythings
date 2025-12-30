from temporalio import activity
from discovery import get_active_subnets
import nmap
import logging

# Configure logging for activities
logger = logging.getLogger("guardian.activities")

@activity.defn
async def discover_subnets() -> list[str]:
    """Activity to discover active subnets."""
    logger.info("Activity: Discovering subnets...")
    subnets = get_active_subnets()
    logger.info(f"Activity: Found {subnets}")
    return subnets

@activity.defn
async def discover_live_hosts(subnet: str) -> list[str]:
    """
    Activity to perform a ping sweep on a subnet to find live hosts.
    Returns a list of IP addresses.
    """
    logger.info(f"Activity: Pinging hosts in {subnet}...")
    nm = nmap.PortScanner()
    try:
        # -sn: Ping Scan - disable port scan
        # -PE: ICMP Echo
        nm.scan(hosts=subnet, arguments='-sn -PE')
        live_hosts = nm.all_hosts()
        logger.info(f"Activity: Found {len(live_hosts)} live hosts in {subnet}")
        return live_hosts
    except Exception as e:
        logger.error(f"Discovery failed for {subnet}: {e}")
        return []

@activity.defn
async def scan_host_details(ip: str) -> dict:
    """
    Activity to perform a detailed port scan on a single host.
    """
    logger.info(f"Activity: Scanning {ip}...")
    nm = nmap.PortScanner()
    try:
        # -sV: Service version
        # -T4: Aggressive timing
        # Note: -O requires root, skipping for now to ensure reliability
        nm.scan(hosts=ip, arguments='-sV -T4')
        
        if ip not in nm.all_hosts():
             return {"ip": ip, "status": "down"}
             
        host_data = nm[ip]
        result = {
            "ip": ip,
            "hostnames": host_data.hostname(),
            "state": host_data.state(),
            "protocols": {}
        }
        
        for proto in host_data.all_protocols():
            ports = []
            for port in host_data[proto]:
                service = host_data[proto][port]
                ports.append({
                    "port": port,
                    "state": service['state'],
                    "service": service['name'],
                    "product": service.get('product', ''),
                    "version": service.get('version', '')
                })
            result["protocols"][proto] = ports
            
        return result
    except Exception as e:
        logger.error(f"Scan failed for {ip}: {e}")
        return {"ip": ip, "error": str(e)}
