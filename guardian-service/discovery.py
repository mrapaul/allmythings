import netifaces
import ipaddress
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def get_default_gateway_linux():
    """Read the default gateway directly from /proc/net/route."""
    try:
        with open("/proc/net/route") as fh:
            for line in fh:
                fields = line.strip().split()
                if fields[1] != '00000000' or not int(fields[3], 16) & 2:
                    continue
                return fields[0] # Interface name
    except Exception as e:
        logger.warning(f"Could not read /proc/net/route: {e}")
        return None

def get_active_subnets():
    """
    Auto-detect active LAN subnets.
    Returns a list of CIDR strings (e.g., ['192.168.1.0/24']).
    """
    subnets = []
    
    try:
        gateways = netifaces.gateways()
        default_gateway = gateways.get('default', {}).get(netifaces.AF_INET)
        
        if default_gateway:
            gw_ip, iface = default_gateway
            logger.info(f"Default gateway: {gw_ip} on {iface}")
            
            # Get interface addresses
            addrs = netifaces.ifaddresses(iface)
            if netifaces.AF_INET in addrs:
                for link in addrs[netifaces.AF_INET]:
                    ip = link.get('addr')
                    mask = link.get('netmask')
                    
                    if ip and mask:
                        # Calculate CIDR
                        network = ipaddress.IPv4Network(f"{ip}/{mask}", strict=False)
                        if not network.is_loopback and not network.is_link_local:
                            subnets.append(str(network))
                            logger.info(f"Discovered subnet: {network} (IP: {ip})")
        
        # Fallback: Check all interfaces if no default gateway or strictly needed
        if not subnets:
            logger.info("No default gateway found or parsed. Checking all interfaces...")
            for iface in netifaces.interfaces():
                addrs = netifaces.ifaddresses(iface)
                if netifaces.AF_INET in addrs:
                    for link in addrs[netifaces.AF_INET]:
                        ip = link.get('addr')
                        mask = link.get('netmask')
                        if ip and mask and not ip.startswith('127.'):
                             try:
                                network = ipaddress.IPv4Network(f"{ip}/{mask}", strict=False)
                                if not network.is_loopback and not network.is_link_local:
                                    subnets.append(str(network))
                                    logger.info(f"Discovered subnet on {iface}: {network}")
                             except ValueError:
                                 pass

    except Exception as e:
        logger.error(f"Error discovering subnets: {e}")
        
    return list(set(subnets)) # Deduplicate

if __name__ == "__main__":
    print("--- Guardian Subnet Discovery ---")
    subnets = get_active_subnets()
    print(f"Active Subnets: {subnets}")
